"""Controlled re-fetch of a real public event; no synthetic Telegram publication."""
import json,uuid
from pathlib import Path
from datetime import datetime,timezone
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from awe_ti.config import ROOT,Settings
from awe_ti.db import connect,migrate
from awe_ti.models import PostImport,SourceRegistration
from awe_ti.ingest import ingest_post
from awe_ti.sources import register_source
from awe_ti.queue import enqueue
from awe_ti.worker import worker_once

base=Settings.from_env().database_url
schema='ti_live_'+uuid.uuid4().hex
admin=psycopg.connect(base,autocommit=True)
admin.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(schema)))
dsn=make_conninfo(base,options='-c search_path='+schema)
try:
 migrate(dsn)
 posts=[json.loads(x) for x in (ROOT/'research/posts/sachkov_blog.jsonl').read_text().splitlines() if x.strip()]
 latest=max(posts,key=lambda p:int(p['message_id']))
 with connect(dsn) as c:
  register_source(c,SourceRegistration(handle='sachkov_blog',enabled=True))
  for p in posts:
   if p['message_id']!=latest['message_id']:ingest_post(c,PostImport.model_validate(p))
  before=c.execute('SELECT count(*) AS n FROM posts').fetchone()['n']
  assert not c.execute('SELECT 1 FROM posts WHERE message_id=%s',(latest['message_id'],)).fetchone()
  enqueue(c,'collect',{'handle':'sachkov_blog','max_pages':1,'resume':False},'real-replay-first')
 first=worker_once(dsn,schedule=False)
 with connect(dsn) as c:
  found=c.execute('SELECT url,message_id,raw_hash FROM posts WHERE message_id=%s',(latest['message_id'],)).fetchone()
  after=c.execute('SELECT count(*) AS n FROM posts').fetchone()['n']
  cursor1=c.execute("SELECT cursor FROM source_cursors WHERE method='public_web'").fetchone()['cursor']
  enqueue(c,'collect',{'handle':'sachkov_blog','max_pages':1,'resume':False},'real-replay-restarted-worker')
 second=worker_once(dsn,schedule=False)
 with connect(dsn) as c:
  again=c.execute('SELECT count(*) AS n FROM posts').fetchone()['n']
  versions=c.execute('SELECT count(*) AS n FROM post_versions').fetchone()['n']
 record={'tested_at':datetime.now(timezone.utc).isoformat(),'test_type':'controlled re-fetch of existing real publicly available Telegram event',
  'not_a_claim_of_newly_published_message':True,'source':'sachkov_blog',
  'event_url':latest['url'],'event_message_id':latest['message_id'],
  'before_posts':before,'after_first_worker':after,'after_restarted_worker':again,
  'replayed_event_present':bool(found),'first_worker_state':first['state'],'second_worker_state':second['state'],
  'persisted_historical_boundary_after_head_scan':cursor1.get('history_boundary_reached'),
  'observed_versions':versions,'same_event_not_duplicated':after==again,
  'passed':bool(found) and after==again and first['state']=='succeeded' and second['state']=='succeeded'}
 (ROOT/'evidence/live-pipeline.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(record,ensure_ascii=False,indent=2))
 if not record['passed']:raise SystemExit(1)
finally:
 admin.execute(sql.SQL('DROP SCHEMA {} CASCADE').format(sql.Identifier(schema)))
 admin.close()
