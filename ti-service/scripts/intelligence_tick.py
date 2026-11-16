import argparse
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from awe_ti.db import connect,migrate
from awe_ti.intelligence import normalize_candidates,discover_sources,schedule_rechecks
from awe_ti.mcp_discovery import refresh_registry
from awe_ti.source_evaluation import evaluate_sources
from psycopg.types.json import Jsonb

p=argparse.ArgumentParser();p.add_argument('--mcp',action='store_true');p.add_argument('--max-pages',type=int,default=2);a=p.parse_args()
migrate()
report={'schema_version':'1.0'}
with connect() as c:
 results=[]
 for _ in range(10):
  r=normalize_candidates(c,5000);results.append(r)
  if not r['resolved_exact_links']:break
 report['normalization']=results
 report['source_discovery']=discover_sources(c)
 source_file=ROOT/'research/additional_sources.json'
 if source_file.is_file():
  for s in json.loads(source_file.read_text())['sources']:
   trust='C' if s['id']=='awesome_mcp' else 'B' if s['source_url'].startswith('https://t.me/') else 'A'
   c.execute('''INSERT INTO source_candidates(url,source_type,trust_class,status,evidence,quality) VALUES (%s,%s,%s,'recommended',%s,%s)
    ON CONFLICT(url) DO UPDATE SET evidence=EXCLUDED.evidence,quality=EXCLUDED.quality''',
    (s['source_url'],'telegram' if trust=='B' else 'registry' if s['id'] in {'mcp_registry','pypi','npm','huggingface_hub'} else 'website',trust,
     Jsonb(s.get('evidence_urls',[])),Jsonb({'technical_score':s.get('score',{}),'promotion':s.get('promotion_recommendation'),'not_historical_quality':True})))
 report['queued_rechecks']=schedule_rechecks(c)
 report['source_evaluation']=evaluate_sources(c)
if a.mcp:report['mcp']=refresh_registry(max_pages=a.max_pages)
path=ROOT/'evidence/intelligence-tick.json'
path.write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2,default=str))
