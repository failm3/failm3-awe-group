import hashlib,json,subprocess,tarfile,zipfile,os,re
from pathlib import Path
from awe_ti.config import ROOT

paths=[x for x in subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0') if x]
required={'requirements.lock','pyproject.toml','semantic-model-lock.json','awe_ti/sql/005_intelligence_pipeline.sql','deploy/install_wsl.sh'}
if not required.issubset(paths):raise ValueError('Required reproducibility files not tracked: '+str(sorted(required-set(paths))))
backup=Path(json.loads((ROOT/'evidence/live-backup.json').read_text())['backup_directory'])
parent=ROOT.parent
version=os.environ.get('TI_DELIVERY_VERSION','')
if version and not re.fullmatch(r'[a-zA-Z0-9_-]+',version):raise ValueError('Invalid delivery version')
suffix='-'+version if version else ''
source=parent/('awe-tool-intelligence-source'+suffix+'.zip')
bundle=parent/('awe-tool-intelligence'+suffix+'.bundle')
subprocess.run(['git','archive','--format=zip','--output',str(source),'HEAD'],cwd=ROOT,check=True)
delivery=parent/('awe-tool-intelligence-delivery'+suffix+'.tar.gz')
proofs=list((ROOT/'evidence').glob('live-*.json'))+list((ROOT/'evidence').glob('live-*.log'))
proofs += [ROOT/'evidence'/name for name in ['pytest-final.log','git-secret-scan.json','registered-evidence.json','semantic-model.json','intelligence-tick.json','verification-queue.json','source-evaluation.json']]
proofs += list((ROOT/'evidence/coverage').glob('*.json'))
proofs += [ROOT/'exports'/name for name in ['research_registry.jsonl','research_registry.json','approved_integration_registry.json','openapi.json']]
with tarfile.open(delivery,'w:gz',compresslevel=6) as archive:
 for name in paths:
  path=ROOT/name
  if path.is_file() and not path.is_symlink():archive.add(path,arcname='awe-tool-intelligence/'+name,recursive=False)
 for path in proofs:
  if path.is_file():archive.add(path,arcname='awe-tool-intelligence/'+str(path.relative_to(ROOT)),recursive=False)
 for name in ['registry.dump','evidence.tar.gz','manifest.json']:
  archive.add(backup/name,arcname='awe-tool-intelligence/transfer/backup/'+name,recursive=False)
 archive.add(bundle,arcname='awe-tool-intelligence/awe-tool-intelligence.bundle',recursive=False)
with tarfile.open(delivery,'r:gz') as archive:
 names=archive.getnames()
 if any(Path(n).name=='.env' or '.session' in Path(n).name for n in names):raise ValueError('Secret-named file in delivery')
record={'source_archive':str(source),'delivery_archive':str(delivery),'git_commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),
 'files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [source,delivery,bundle]},
 'telegram_sessions_included':False,'runtime_credentials_included':False,'embedding_weights_included':False,'tested_backup':str(backup)}
(ROOT/('DELIVERY_MANIFEST'+suffix+'.json')).write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(record,ensure_ascii=False,indent=2))
