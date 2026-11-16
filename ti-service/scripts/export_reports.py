import csv,json,re
from datetime import datetime,timezone
from itertools import combinations
from awe_ti.config import ROOT
from awe_ti.db import connect
from awe_ti.exporting import export_registry
from awe_ti.intelligence import classify_link
from psycopg.types.json import Jsonb

out=ROOT/'exports';out.mkdir(exist_ok=True)
with connect() as c:
 export_registry(c,out)
 resources=[json.loads(x) for x in (out/'research_registry.jsonl').read_text().splitlines() if x.strip()]
 (out/'research_registry.json').write_text(json.dumps({'schema_version':'1.0','catalog_type':'research_candidates_not_executable','resources':resources},ensure_ascii=False,indent=2,default=str)+'\n')
 def safe(value):
  v='' if value is None else str(value)
  return "'"+v if v[:1] in '=+-@' else v
 with (out/'research_registry.csv').open('w',newline='',encoding='utf-8-sig') as f:
  writer=csv.writer(f);writer.writerow(['id','name','type','stage','verification_status','official_url','repository_url','capabilities','pricing_categories','licenses','approved_for_export'])
  for r in resources:
   writer.writerow([safe(x) for x in [r['id'],r['name'],r.get('resource_type'),r.get('stage'),r.get('verification_status'),r.get('official_url'),r.get('repository_url'),'; '.join(r.get('capabilities',[])),
     '; '.join(sorted({str(p.get('category')) for p in r.get('pricing_history',[]) if p.get('category')})),
     '; '.join(sorted({str(p.get('spdx')) for p in r.get('license_evidence',[]) if p.get('spdx')})),r.get('approved_for_export')]])
 counts={t:c.execute(f'SELECT count(*) AS n FROM {t}').fetchone()['n'] for t in ['sources','posts','post_versions','post_links','post_media','resources','assertions','resource_provenance','extraction_candidates','source_candidates','resource_versions','integration_specs','verification_runs','live_tests','approvals','audit_events']}
 stages=c.execute('SELECT stage,count(*) AS n FROM resources GROUP BY stage ORDER BY stage').fetchall()
 candidates=c.execute('SELECT state,kind,count(*) AS n FROM extraction_candidates GROUP BY state,kind ORDER BY state,kind').fetchall()
 verifications=c.execute('SELECT method,outcome,count(*) AS n FROM verification_runs GROUP BY method,outcome ORDER BY method,outcome').fetchall()
 source_analysis=[];sets={}
 for handle in ['githubradar','iirepresent','sachkov_blog']:
  rows=c.execute('SELECT p.*,s.title FROM posts p JOIN sources s ON s.id=p.source_id WHERE s.handle=%s ORDER BY p.published_at',(handle,)).fetchall()
  dates=[r['published_at'] for r in rows if r['published_at']]
  links={row['id']:[r['url'] for r in c.execute('SELECT url FROM post_links WHERE post_id=%s',(row['id'],)).fetchall()] for row in rows}
  technical=sum(any(classify_link(u) for u in links[r['id']]) for r in rows)
  ad=sum(bool(re.search(r'реклама|erid|промокод|спонсор|advertisement|sponsored',r['text'],re.I)) for r in rows)
  span=(max(dates)-min(dates)).total_seconds()/604800 if len(dates)>1 else None
  all_links=set(u for v in links.values() for u in v)
  sets[handle]={u for u in all_links if classify_link(u)}
  metric={'handle':handle,'title':rows[0]['title'] if rows else None,'trust':'B','public_posts':len(rows),
   'earliest_published_at':min(dates).isoformat() if dates else None,'latest_published_at':max(dates).isoformat() if dates else None,
   'posts_with_dated_timestamp':len(dates),'dated_public_posts_per_week':round(len(dates)/span,3) if span else None,
   'posts_with_any_link':sum(bool(links[r['id']]) for r in rows),'posts_with_registry_or_repository_link':technical,
   'technical_link_fraction':round(technical/len(rows),4) if rows else None,'ad_marker_posts':ad,
   'ad_marker_fraction':round(ad/len(rows),4) if rows else None,'known_forward_marker_posts':sum(bool(r['forwarded_from']) for r in rows),
   'original_content_fraction':None,'fraud_probability':None,'claim_verification_precision':None,
   'boundaries':'measures visible public corpus only; ad markers are heuristics, not proof of advertisements or fraud; link fraction is not tool quality'}
  source_analysis.append(metric)
  c.execute('UPDATE sources SET metadata=metadata || %s WHERE handle=%s',(Jsonb({'measured_public_corpus':metric}),handle))
 overlaps=[]
 for a,b in combinations(sets,2):
  union=sets[a]|sets[b];inter=sets[a]&sets[b]
  overlaps.append({'source_a':a,'source_b':b,'common_technical_urls':len(inter),'jaccard':round(len(inter)/len(union),6) if union else None,'scope':'exact canonical technical URL overlap, not semantic topic overlap'})
 metrics={'schema_version':'1.0','generated_at':datetime.now(timezone.utc).isoformat(),'counts':counts,'stages':stages,
  'candidate_states':candidates,'verification_outcomes':verifications,'source_analysis':source_analysis,'source_overlaps':overlaps,
  'approved_executable_records':0,'awe_integration_live_verified':False}
 (out/'metrics.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2,default=str)+'\n')
 sources=c.execute('SELECT id,handle,url,title,source_type,collection_enabled,recommendation_score,metadata FROM sources ORDER BY id').fetchall()
 discovered=c.execute('SELECT * FROM source_candidates ORDER BY id').fetchall()
 (out/'sources.json').write_text(json.dumps({'schema_version':'1.0','enrolled_or_observed_sources':sources,'discovered_sources':discovered},ensure_ascii=False,indent=2,default=str)+'\n')
 lines=['# AWE Tool Intelligence — каталог кандидатов','',f"Сформировано {metrics['generated_at']}. В базе {counts['resources']} ресурсов, не список разрешённых исполнителей. История происхождения и утверждений находится в JSON/JSONL. Неподтверждённые лицензии и цены неизвестны, а не бесплатны.",'','## Проверенные приоритеты','']
 for r in resources:
  if r.get('stage') not in {'DOCUMENTED','LIVE_TESTED','APPROVED','INTEGRATED'}:continue
  url=r.get('official_url') or r.get('repository_url') or ''
  lines.extend([f"### {r['name']}",'',f"Этап: **{r['stage']}**. Тип: {r.get('resource_type')}. [Официальный источник]({url}).",'',
   str(r.get('description') or ''),'',f"Возможности: {', '.join(r.get('capabilities',[]))}. Утверждения, лицензии, цены и доказательства: запись {r['id']} в JSON/JSONL.",''])
 (out/'registry_report.md').write_text('\n'.join(lines)+'\n')
 print(json.dumps({'counts':counts,'stages':stages,'candidate_states':candidates},ensure_ascii=False,indent=2))
