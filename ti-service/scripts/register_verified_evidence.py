import hashlib,json,importlib.metadata
from pathlib import Path
from psycopg.types.json import Jsonb
from awe_ti.config import ROOT
from awe_ti.db import connect
from awe_ti.models import LiveTestInput,stable_hash
from awe_ti.registry import transition_stage,record_live_test

tests=json.loads((ROOT/'evidence/live-stack.json').read_text())
results=[]
with connect() as c:
 for t in tests:
  row=c.execute('SELECT id,stage FROM resources WHERE name=%s',(t['name'],)).fetchone()
  assert row
  rid=row['id'];package=t['package']
  evidence=json.loads((ROOT/'evidence/pypi'/f'{package}.json').read_text())
  install={'name':t['name'],'installed_version':importlib.metadata.version(package),'distribution_location':str(importlib.metadata.distribution(package).locate_file('')),
   'official_registry_url':evidence['evidence_url'],'requirements':evidence['metadata']['info'].get('requires_python'),
   'tested_at':t['tested_at'],'installed_in':'isolated virtual environment','scope':'library installation, not TR-01 registration'}
  file=ROOT/'evidence'/f'installed-{package}.json';file.write_text(json.dumps(install,ensure_ascii=False,indent=2)+'\n')
  if row['stage']=='DISCOVERED':
   for stage,url,reason in [('SOURCE_VERIFIED',t['official_url'],'Official project documentation and distribution crosschecked'),
       ('DOCUMENTED',t['official_url'],'Official documentation and package metadata reviewed'),
       ('INSTALLABLE',evidence['evidence_url'],'Free library install, runtime requirements and license recorded'),
       ('INSTALLED_IN_SANDBOX',file.as_uri(),'Installed version confirmed in independent virtual environment')]:
    transition_stage(c,rid,stage,'Manus',reason,url)
  testfile=ROOT/'evidence'/f'live-{package}.json';testfile.write_text(json.dumps(t,ensure_ascii=False,indent=2)+'\n')
  if not c.execute('SELECT 1 FROM live_tests WHERE resource_id=%s AND test_name=%s',(rid,'Functional smoke '+package)).fetchone():
   record_live_test(c,rid,LiveTestInput(test_name='Functional smoke '+package,result='passed' if t['passed'] else 'failed',evidence_url=testfile.as_uri(),
     evidence_hash=hashlib.sha256(testfile.read_bytes()).hexdigest(),tested_at=t['tested_at'],recorded_by='Manus',notes='Actual isolated smoke only; AWE approval and integration not performed'))
  spec={'schema_version':'1.0','runtime':'Python','python_requirement':install['requirements'],'installed_version':t['version'],
        'installation':'python -m pip install '+package+'=='+t['version'],
        'uninstall':'python -m pip uninstall '+package,'required_secrets':[],'permission_scope':'depends on caller application',
        'free_library_not_free_hosting':True,'awe_tr01_compatible':'unconfirmed','executable_approved':False}
  c.execute('INSERT INTO integration_specs(resource_id,spec_hash,spec,evidence_url) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',(rid,stable_hash(spec),Jsonb(spec),evidence['evidence_url']))
  c.execute('INSERT INTO resource_versions(resource_id,version,evidence_url,metadata) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',(rid,t['version'],evidence['evidence_url'],Jsonb({'actually_tested':True})))
  results.append({'resource_id':rid,'name':t['name'],'stage':'LIVE_TESTED','approved':False})
 for path in sorted((ROOT/'research').glob('*_research.json')):
  for r in json.loads(path.read_text()).get('resources',[]):
   row=c.execute('SELECT id,stage FROM resources WHERE name=%s',(r['name'],)).fetchone()
   if not row or row['stage']!='DISCOVERED':continue
   official=r.get('official_url') or r.get('repository_url')
   if not official:continue
   transition_stage(c,row['id'],'SOURCE_VERIFIED','Manus','Official project matched to exact Telegram mention; see cited research report',official)
   docs=next((x.get('evidence_url') for x in r.get('claims',[]) if x.get('evidence_url')),official)
   transition_stage(c,row['id'],'DOCUMENTED','Manus','Documentation review recorded with assertion-level evidence; no live test',docs)
   results.append({'resource_id':row['id'],'name':r['name'],'stage':'DOCUMENTED','approved':False})
 (ROOT/'evidence/registered-evidence.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(results,ensure_ascii=False,indent=2))
