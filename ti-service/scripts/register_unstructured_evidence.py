import json,hashlib,shutil
from pathlib import Path
from psycopg.types.json import Jsonb
from awe_ti.config import ROOT
from awe_ti.db import connect
from awe_ti.models import LiveTestInput,stable_hash
from awe_ti.registry import transition_stage,record_live_test
from awe_ti.ingest import add_assertion

passed=json.loads((ROOT/'evidence/live-unstructured.json').read_text())
blocked=json.loads((ROOT/'evidence/live-unstructured-initial-blocked.json').read_text())
model=json.loads((ROOT/'evidence/unstructured-nlp-model.json').read_text())
assert passed['passed'] and passed['no_external_network_during_mission']
for source,target in [('mission-input.txt','unstructured-mission-input.txt'),('mission-output.json','unstructured-mission-output.json'),('mission-source.json','unstructured-mission-source.json')]:
 shutil.copy2(ROOT/'.sandboxes/unstructured'/source,ROOT/'evidence'/target)
spec={'schema_version':'1.0','runtime':'Python>=3.11,<3.14','unstructured_version':passed['version'],
 'installation':'pip install unstructured=='+passed['version'],
 'isolated_environment':'.sandboxes/unstructured/.venv','nlp_dependency':model,
 'verified_scope':['UTF-8 TXT partitioning','title/narrative extraction on one Russian public sample','chunk_by_title with max_characters=120','structured JSON output'],
 'not_verified':['OCR','PDF parsing','table or image extraction','broad Russian quality','AWE integration'],
 'permissions':{'read':'explicit input text file','write':'explicit output JSON file','network':'disabled during mission'},
 'required_secrets':[],'telemetry_environment':{'DO_NOT_TRACK':'true','SCARF_NO_ANALYTICS':'true'},'executable_approved':False}
with connect() as c:
 row=c.execute("SELECT id,stage FROM resources WHERE name='Unstructured'").fetchone();rid=row['id']
 if row['stage']=='DOCUMENTED':
  transition_stage(c,rid,'INSTALLABLE','Manus','Official Apache-2.0 package and required local NLP model reviewed','https://pypi.org/pypi/unstructured/json')
  transition_stage(c,rid,'INSTALLED_IN_SANDBOX','Manus','Installed pinned 0.27.37 in independent sandbox; backend dependencies unchanged',(ROOT/'evidence/unstructured-install.log').as_uri())
 c.execute('INSERT INTO resource_versions(resource_id,version,evidence_url,metadata) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',
   (rid,passed['version'],'https://pypi.org/pypi/unstructured/json',Jsonb({'actually_tested':True,'scope':spec['verified_scope']})))
 c.execute('INSERT INTO integration_specs(resource_id,spec_hash,spec,evidence_url) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',
   (rid,stable_hash(spec),Jsonb(spec),(ROOT/'evidence/live-unstructured.json').as_uri()))
 add_assertion(c,rid,'live_verified_scope',spec['verified_scope'],(ROOT/'evidence/live-unstructured.json').as_uri(),passed['tested_at'],'live_functional_test')
 add_assertion(c,rid,'local_nlp_model_prerequisite',model,model['metadata_evidence_url'],model['downloaded_at'],'reviewed_dependency')
 for name,result,data,path,notes in [
   ('Offline TXT mission before NLP dependency','inconclusive',blocked,ROOT/'evidence/live-unstructured-initial-blocked.json','Blocked model download by network policy; not an API test and not proof software is broken'),
   ('Offline Russian TXT partitioning and chunking','passed',passed,ROOT/'evidence/live-unstructured.json','Pinned local model prepared. Network blocked during mission. OCR/PDF/tables/AWE not tested')]:
  if not c.execute('SELECT 1 FROM live_tests WHERE resource_id=%s AND test_name=%s',(rid,name)).fetchone():
   record_live_test(c,rid,LiveTestInput(test_name=name,result=result,evidence_url=path.as_uri(),evidence_hash=hashlib.sha256(path.read_bytes()).hexdigest(),tested_at=data['tested_at'],recorded_by='Manus',notes=notes))
 print({'resource_id':rid,'stage':c.execute('SELECT stage FROM resources WHERE id=%s',(rid,)).fetchone()['stage'],'approved':False})
