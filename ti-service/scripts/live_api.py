import json,os,subprocess,sys,time
from datetime import datetime,timezone
from awe_ti.config import ROOT,Settings
import httpx
settings=Settings.from_env()
port=8765
log=(ROOT/'evidence/api-server-test.log').open('w')
process=subprocess.Popen([sys.executable,'-m','awe_ti.cli','serve','--port',str(port)],stdout=log,stderr=log,cwd=ROOT)
base=f'http://127.0.0.1:{port}'
headers={'Authorization':'Bearer '+settings.api_token}
try:
 with httpx.Client(timeout=90) as client:
  for _ in range(40):
   try:
    health=client.get(base+'/health',headers=headers)
    if health.status_code==200:break
   except httpx.HTTPError:pass
   time.sleep(.25)
  else:raise RuntimeError('API did not become healthy')
  denied=client.get(base+'/health')
  reader_write=client.post(base+'/v1/jobs',headers=headers,json={'kind':'collect','payload':{'handle':'sachkov_blog'}})
  lexical=client.get(base+'/v1/search',headers=headers,params={'q':'mcp','limit':3}).json()
  semantic=client.get(base+'/v1/search',headers=headers,params={'q':'извлечь текст из PDF документов','semantic':'true','limit':3}).json()
  approved=client.get(base+'/v1/search',headers=headers,params={'q':'mcp','approved_only':'true'}).json()
  metrics=client.get(base+'/v1/metrics',headers=headers);metrics.raise_for_status()
  schema=client.get(base+'/openapi.json',headers=headers);schema.raise_for_status()
  (ROOT/'exports/openapi.json').write_text(json.dumps(schema.json(),ensure_ascii=False,indent=2)+'\n')
  integration=client.get(base+'/v1/exports/integration',headers={'Authorization':'Bearer '+settings.admin_api_token});integration.raise_for_status()
  record={'tested_at':datetime.now(timezone.utc).isoformat(),'http_server_real':True,'loopback_only':True,'health':health.json(),
   'unauthorized_status':denied.status_code,'reader_mutation_status':reader_write.status_code,
   'lexical_mode':lexical['search_mode'],'lexical_results':[{'id':r['id'],'name':r['name'],'stage':r['stage']} for r in lexical['items']],
   'semantic_mode':semantic['search_mode'],'semantic_results':[{'id':r['id'],'name':r['name'],'stage':r['stage'],'similarity':r.get('semantic_similarity')} for r in semantic['items']],
   'integration_export_summary':{'approved_count':len(integration.json()['resources']),'excluded_count':len(integration.json()['excluded'])},
   'approved_search_results':len(approved['items']),'metrics_available':metrics.status_code==200,'openapi_paths':len(schema.json()['paths']),
   'passed':denied.status_code==401 and reader_write.status_code==403 and semantic['search_mode']=='semantic_local' and bool(lexical['items']) and not approved['items']}
  (ROOT/'evidence/live-api.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
  print(json.dumps(record,ensure_ascii=False,indent=2))
  if not record['passed']:raise SystemExit(1)
finally:
 process.terminate()
 try:process.wait(timeout=10)
 except subprocess.TimeoutExpired:process.kill();process.wait()
 log.close()
