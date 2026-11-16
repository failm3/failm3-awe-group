"""Deterministic discovery: normalize known registry/repository links only.
Unlinked names and arbitrary URLs stay pending for semantic/entity research.
"""
import re
from urllib.parse import urlsplit, unquote
from psycopg.types.json import Jsonb
from .ingest import ingest_resource, add_provenance, add_assertion
from .models import ResourceImport, canonical_url, stable_hash, utcnow
from .queue import enqueue

GITHUB_RESERVED={'features','topics','collections','marketplace','settings','sponsors','orgs','users','search','login','signup','about','pricing','enterprise','security','readme','events','apps'}
TOPICS={
 'browser_automation':r'playwright|puppeteer|browser.?use|browser automation|браузер',
 'web_scraping':r'crawl|scrap|парсинг|парсер',
 'agent_framework':r'agent|agno|агент|orchestrat',
 'mcp':r'\bmcp\b|model.?context.?protocol',
 'rag':r'\brag\b|retrieval|rerank|knowledge|embedding|vector|вектор',
 'documents':r'pdf|document|ppt|slide|excel|документ|таблиц|презентац',
 'media':r'image|video|audio|voice|3d|изображ|видео|аудио',
 'observability':r'trac|eval|observab|monitor|оценк|монитор',
 'coding':r'coding|code|ide|devops|ci/cd|программир',
 'communications':r'telegram|email|crm|почт',
}


def classify_link(url):
    p=urlsplit(url); parts=[unquote(x) for x in p.path.split('/') if x]
    host=(p.hostname or '').lower()
    if host in {'github.com','www.github.com'} and len(parts)>=2 and parts[0].lower() not in GITHUB_RESERVED:
        owner,repo=parts[:2];repo=repo.removesuffix('.git')
        if re.fullmatch(r'[A-Za-z0-9_.-]+',owner) and re.fullmatch(r'[A-Za-z0-9_.-]+',repo):
            return {'name':owner+'/'+repo,'repository_url':canonical_url('https://github.com/'+owner+'/'+repo),'resource_type':'repository'}
    if host=='pypi.org' and len(parts)>=2 and parts[0]=='project':
        name=parts[1]
        if re.fullmatch(r'[A-Za-z0-9_.-]+',name):
            return {'name':name,'official_url':canonical_url('https://pypi.org/project/'+name),'resource_type':'library'}
    if host in {'npmjs.com','www.npmjs.com'} and len(parts)>=2 and parts[0]=='package':
        name='/'.join(parts[1:3]) if parts[1].startswith('@') else parts[1]
        return {'name':name,'official_url':canonical_url('https://www.npmjs.com/package/'+name),'resource_type':'library'}
    if host=='huggingface.co' and len(parts)>=2 and parts[0] not in {'docs','datasets','spaces','models','collections','settings','blog','papers','api','join','organizations'}:
        return {'name':'/'.join(parts[:2]),'official_url':canonical_url('https://huggingface.co/'+'/'.join(parts[:2])),'resource_type':'model'}
    return None


def normalize_candidates(conn,limit=5000):
    rows=conn.execute('''SELECT e.*,p.url AS post_url,p.message_id,s.url AS source_url FROM extraction_candidates e
      JOIN posts p ON e.post_id=p.id JOIN sources s ON p.source_id=s.id
      WHERE e.kind='url' AND e.state='pending' AND e.url LIKE ANY(ARRAY['https://github.com/%%','https://pypi.org/project/%%','https://www.npmjs.com/package/%%','https://huggingface.co/%%']) ORDER BY e.id LIMIT %s FOR UPDATE OF e SKIP LOCKED''',(limit,)).fetchall()
    made,linked,pending=0,0,0
    for row in rows:
        identified=classify_link(row['url'])
        if not identified:
            pending+=1;continue
        urls=[identified.get('repository_url'),identified.get('official_url')]
        existing=conn.execute('SELECT resource_id FROM resource_urls WHERE url=ANY(%s)',([u for u in urls if u],)).fetchone()
        if existing:
            rid=existing['resource_id']
        else:
            tags=[tag for tag,pattern in TOPICS.items() if re.search(pattern,row['excerpt'] or '',re.I)]
            resource=ResourceImport(**identified,description=(row['excerpt'] or '')[:1000],capabilities=tags,
              verification_status='DISCOVERED',decision='candidate',
              claims=[{'field':'inferred_type','value':identified['resource_type'],'evidence_url':row['post_url'],'checked_at':utcnow()},
                      {'field':'capability_tags_inferred','value':tags,'evidence_url':row['post_url'],'checked_at':utcnow()}],
              limitations=['Entity inferred from exact repository/registry URL; official ownership, function, licensing, installation and live operation not yet verified. Capability tags are heuristics.'])
            result=ingest_resource(conn,resource);rid=result['id'];made+=int(result['created'])
        add_provenance(conn,rid,{'source_url':row['source_url'],'post_url':row['post_url'],'message_id':row['message_id']},row['post_id'])
        conn.execute("UPDATE extraction_candidates SET state='resolved',resource_id=%s WHERE id=%s",(rid,row['id']))
        linked+=1
    result={'examined':len(rows),'created_resources':made,'resolved_exact_links':linked,'unclassified_urls_pending':pending,'meaning':'entity normalization only, not verified tool'}
    conn.execute("INSERT INTO audit_events(event_type,actor,details) VALUES ('candidate_normalization','deterministic_pipeline',%s)",(Jsonb(result),))
    return result


def discover_sources(conn):
    rows=conn.execute('''SELECT l.url,p.id,p.url AS post_url,s.handle AS origin FROM post_links l
       JOIN posts p ON p.id=l.post_id JOIN sources s ON s.id=p.source_id
       WHERE l.url LIKE 'https://t.me/%%' ''').fetchall()
    groups={}
    excluded={'s','c','share','addstickers','addemoji','iv','proxy','joinchat','login','boost','giftcode','confirmphone','invoice','setlanguage'}
    seeds={'githubradar','iirepresent','sachkov_blog'}
    for row in rows:
        p=urlsplit(row['url']);parts=[x for x in p.path.split('/') if x]
        if not parts or parts[0].startswith('+') or parts[0].lower() in excluded|seeds:continue
        handle=parts[0].lower()
        if not re.fullmatch(r'[a-z][a-z0-9_]{4,31}',handle):continue
        groups.setdefault(handle,[]).append({'origin':row['origin'],'post_url':row['post_url'],'post_id':row['id'],'linked_url':row['url']})
    for handle,ev in groups.items():
        unique={x['post_id']:x for x in ev};evidence=list(unique.values())
        quality={'referring_posts':len(evidence),'referring_sources':len({x['origin'] for x in evidence}),
          'sample_precision':None,'advertising_risk':None,'history_access':'not_sampled',
          'auto_enroll_policy':'require >=2 seed origins, >=5 referring posts, >=10 sampled posts, >=50% technical links, <=20% ads; no auth bypass',
          'eligible_for_sample':len(evidence)>=5 and len({x['origin'] for x in evidence})>=2}
        conn.execute('''INSERT INTO source_candidates(url,source_type,handle,trust_class,evidence,quality)
          VALUES (%s,'telegram',%s,'B',%s,%s) ON CONFLICT(url) DO UPDATE SET evidence=EXCLUDED.evidence,quality=EXCLUDED.quality''',
          ('https://t.me/'+handle,handle,Jsonb(evidence),Jsonb(quality)))
    return {'discovered_telegram_candidates':len(groups),'auto_enrolled':0,'unsampled_quality_not_invented':True}


def schedule_rechecks(conn,limit=10,stale_days=7):
    already=conn.execute("SELECT count(*) AS n FROM queue_jobs WHERE dedup_key LIKE 'official-recheck:%%' AND created_at>now()-interval '1 hour'").fetchone()['n']
    limit=max(0,min(limit,10-int(already)))
    if not limit:
        return []
    rows=conn.execute('''SELECT r.id FROM resources r LEFT JOIN verification_runs v ON v.resource_id=r.id
      WHERE r.repository_url LIKE 'https://github.com/%%' OR r.official_url LIKE 'https://pypi.org/%%'
      GROUP BY r.id HAVING max(v.checked_at) IS NULL OR max(v.checked_at)<now()-%s*interval '1 day'
      ORDER BY max(v.checked_at) NULLS FIRST,r.id LIMIT %s''',(stale_days,limit)).fetchall()
    day=utcnow().strftime('%Y-%m-%d')
    ids=[]
    for row in rows:
        if conn.execute("SELECT 1 FROM queue_jobs WHERE kind='verify_resource' AND payload->>'resource_id'=%s AND state IN ('pending','running')",(str(row['id']),)).fetchone():continue
        ids.append(enqueue(conn,'verify_resource',{'resource_id':row['id']},f'official-recheck:{day}:{row["id"]}')['id'])
    return ids
