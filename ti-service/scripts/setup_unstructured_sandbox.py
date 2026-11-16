"""Only the independently reviewed Unstructured sandbox, never the backend venv."""
import json,hashlib,subprocess
from datetime import datetime,timezone
from pathlib import Path
from awe_ti.network import safe_fetch
from awe_ti.config import ROOT
URL='https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl'
EXPECTED='1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85'
folder=ROOT/'.sandboxes/unstructured'
path=folder/'en_core_web_sm-3.8.0-py3-none-any.whl'
response=safe_fetch(URL,max_bytes=20_000_000,timeout=60)
if response.status!=200:raise ValueError('Official model download failed')
actual=hashlib.sha256(response.body).hexdigest()
if actual!=EXPECTED:raise ValueError('Model wheel differs from official reviewed SHA256')
path.write_bytes(response.body)
subprocess.run([str(folder/'.venv/bin/python'),'-m','pip','install','--no-deps',str(path)],check=True)
record={'name':'en_core_web_sm','version':'3.8.0','license':'MIT','source_url':URL,
 'metadata_evidence_url':'https://github.com/explosion/spacy-models/blob/master/meta/en_core_web_sm-3.8.0.json',
 'sha256':actual,'matches_unstructured_pin':True,'downloaded_at':datetime.now(timezone.utc).isoformat(),
 'purpose':'local tokenization and partition heuristics','english_model_not_a_russian_quality_benchmark':True,
 'installed_into':'independent Unstructured sandbox','backend_venv_unchanged':True}
(ROOT/'evidence/unstructured-nlp-model.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False,indent=2))
