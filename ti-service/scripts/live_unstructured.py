"""Run with .sandboxes/unstructured/.venv/bin/python. No backend dependency changes."""
import os
os.environ['DO_NOT_TRACK']='true'
os.environ['SCARF_NO_ANALYTICS']='true'
os.environ['UNSTRUCTURED_TELEMETRY_ENABLED']='false'
os.environ['UNSTRUCTURED_DISABLE_NOTICE']='1'
import json,hashlib,socket,time,importlib.metadata,traceback,shutil
from datetime import datetime,timezone
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
mission=ROOT/'.sandboxes/unstructured'
mission.mkdir(parents=True,exist_ok=True)
for name in ['mission-input.txt','mission-source.json']:
 if not (mission/name).is_file():
  shutil.copy2(ROOT/'evidence'/('unstructured-'+name),mission/name)
source=json.loads((mission/'mission-source.json').read_text())
text=(mission/'mission-input.txt').read_text()
requests=[]
def forbidden(*a,**k):
    requests.append([Path(f.filename).name+':'+f.name for f in traceback.extract_stack(limit=15)])
    raise RuntimeError('External networking disabled during local mission')
socket.socket.connect=forbidden
socket.socket.connect_ex=forbidden
socket.create_connection=forbidden
start=time.perf_counter()
record={'package':'unstructured','version':importlib.metadata.version('unstructured'),'source_url':source['url'],
 'mission':'Read real Russian Telegram text file, partition and chunk, preserve Cyrillic and structured JSON',
 'tested_at':datetime.now(timezone.utc).isoformat(),'input_sha256':hashlib.sha256(text.encode()).hexdigest(),
 'telemetry_disabled_before_import':True,'cloud_api_used':False,'model_api_used':False,
 'tests_ocr_pdf_table_or_image_extraction':False,'tests_awe_integration':False}
try:
 from unstructured.partition.text import partition_text
 from unstructured.chunking.title import chunk_by_title
 from unstructured.staging.base import elements_to_dicts
 elements=partition_text(filename=str(mission/'mission-input.txt'),encoding='utf-8',languages=['rus'])
 chunks=chunk_by_title(elements,max_characters=120,new_after_n_chars=100,overlap=0)
 reconstructed=' '.join(str(x) for x in chunks)
 expected=['PDF','HTML','локально','таблицы','Docker']
 preserved=all(x in reconstructed for x in expected)
 output={'source_url':source['url'],'elements':elements_to_dicts(elements),'chunks':elements_to_dicts(chunks)}
 path=mission/'mission-output.json';path.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
 record.update({'elements':len(elements),'chunks':len(chunks),'element_categories':[e.category for e in elements],
   'expected_terms':expected,'expected_terms_preserved':preserved,'max_chunk_characters':max(len(str(x)) for x in chunks),
   'output_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'no_external_network_during_mission':not requests,
   'passed':bool(elements) and bool(chunks) and preserved and not requests})
except Exception as exc:
 record.update({'passed':False,'error_type':type(exc).__name__,'error_details':str(exc)[:400],'network_attempts':len(requests),'network_call_stack':requests})
record['elapsed_seconds']=round(time.perf_counter()-start,4)
(ROOT/'evidence/live-unstructured.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False,indent=2))
if not record['passed']:raise SystemExit(1)
