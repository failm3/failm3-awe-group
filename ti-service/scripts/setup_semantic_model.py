"""Download reviewed official Model2Vec safetensors with pinned HF revision."""
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = 'minishlab/potion-multilingual-128M'

def main():
    import httpx
    from huggingface_hub import snapshot_download
    response = httpx.get(f'https://huggingface.co/api/models/{REPO}', timeout=60)
    response.raise_for_status()
    info = response.json()
    lock_path = ROOT / 'semantic-model-lock.json'
    lock = json.loads(lock_path.read_text()) if lock_path.is_file() else None
    if lock and lock['repo_id'] != REPO:
        raise ValueError('Semantic model lock repo mismatch')
    revision = lock['revision'] if lock else info['sha']
    target = ROOT / 'models' / 'potion-multilingual-128M'
    print(f'Downloading official safetensors model pinned revision {revision}', flush=True)
    snapshot_download(repo_id=REPO, revision=revision, local_dir=target,
                      allow_patterns=['config.json', 'model.safetensors', 'tokenizer.json', 'README.md', 'modules.json'],
                      max_workers=3)
    files=[]
    for p in sorted(target.glob('*')):
        if p.is_file():
            digest=hashlib.sha256()
            with p.open('rb') as file:
                for block in iter(lambda:file.read(1024*1024), b''):
                    digest.update(block)
            files.append({'name':p.name,'size_bytes':p.stat().st_size,'sha256':digest.hexdigest()})
    if lock:
        expected = {x['name']: x['sha256'] for x in lock['files']}
        actual = {x['name']: x['sha256'] for x in files}
        if expected != actual:
            raise ValueError('Downloaded semantic files differ from reviewed SHA256 lock')
    record={'repo_id':REPO,'revision':revision,'license':info.get('cardData',{}).get('license'),
      'evidence_url':f'https://huggingface.co/{REPO}/tree/{revision}',
      'downloaded_at':datetime.now(timezone.utc).isoformat(),'files':files,
      'remote_code_execution':False,'path':str(target)}
    (ROOT/'evidence/semantic-model.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(record,ensure_ascii=False,indent=2),flush=True)
    env=ROOT/'.env'
    if env.exists() and 'SEMANTIC_MODEL_PATH=' not in env.read_text():
        with env.open('a') as file:
            file.write(f'SEMANTIC_MODEL_PATH={target}\n')

if __name__=='__main__':
    main()
