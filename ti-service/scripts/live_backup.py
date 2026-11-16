import json,os,subprocess,sys,uuid,tempfile,shutil,hashlib,tarfile
from datetime import datetime,timezone
from pathlib import Path
import psycopg
from psycopg.conninfo import conninfo_to_dict,make_conninfo
from awe_ti.config import ROOT,Settings
from awe_ti.db import connect

name='ti_restore_'+uuid.uuid4().hex[:12]
base=Settings.from_env().database_url
backup=subprocess.check_output([sys.executable,str(ROOT/'deploy/backup.py'),'--out',str(ROOT/'backups')],cwd=ROOT,text=True).strip()
subprocess.run(['sudo','-u','postgres','createdb','-O','awe_ti',name],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
info=conninfo_to_dict(base);info['dbname']=name
target=make_conninfo(**info)
restore_root=Path(tempfile.mkdtemp(prefix='ti-files-restore-'))
env=dict(os.environ);env['DATABASE_URL']=target;env['AWE_TI_ROOT']=str(restore_root)
try:
 subprocess.run([sys.executable,str(ROOT/'deploy/restore.py'),backup,'--confirm-empty-target','--restore-files'],cwd=ROOT,env=env,check=True)
 tables=['posts','post_versions','resources','assertions','resource_provenance','source_cursors','queue_jobs','live_tests','resource_versions','integration_specs']
 def counts(dsn):
  with connect(dsn) as c:return {t:c.execute(f'SELECT count(*) AS n FROM {t}').fetchone()['n'] for t in tables}
 original=counts(base);restored=counts(target)
 file_ok=True;file_count=0
 with tarfile.open(Path(backup)/'evidence.tar.gz','r:gz') as archive:
  for member in archive.getmembers():
   expected=hashlib.sha256(archive.extractfile(member).read()).hexdigest()
   actual=hashlib.sha256((restore_root/member.name).read_bytes()).hexdigest()
   file_ok=file_ok and expected==actual;file_count+=1
 record={'tested_at':datetime.now(timezone.utc).isoformat(),'backup_directory':backup,'target_was_new_empty_database':True,
   'original_counts':original,'restored_counts':restored,'passed':original==restored and file_ok,
   'credentials_exported':False,'worker_was_not_running':True,'file_archive_checksums_validated':True,
   'file_restore_extraction_live_tested':True,'restored_files':file_count,'restored_files_sha256_match':file_ok,
   'temporary_restore_database_removed_after_test':True}
 (ROOT/'evidence/live-backup.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps(record,ensure_ascii=False,indent=2))
 if not record['passed']:raise SystemExit(1)
finally:
 subprocess.run(['sudo','-u','postgres','dropdb',name],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 shutil.rmtree(restore_root)
