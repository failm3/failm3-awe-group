import json
import os
from pathlib import Path
from .registry import resource_detail, export_eligibility
from .models import utcnow


def integration_manifest(conn):
    approved, excluded = [], []
    for row in conn.execute('SELECT id FROM resources ORDER BY id').fetchall():
        rid = row['id']
        eligible, reason = export_eligibility(conn, rid)
        if not eligible:
            excluded.append({'id': rid, 'reason': reason})
            continue
        resource = resource_detail(conn, rid)
        approved.append({key: resource[key] for key in ('id','name','official_url','repository_url','resource_type','integrations','stage','live_tests','approvals')})
    return {'schema_version': 1, 'generated_at': utcnow().isoformat(), 'mode': 'approved_live_evidence_only',
        'contains_executable_code': False, 'resources': approved, 'excluded': excluded,
        'limitations': ['Manifest records permission and evidence only. It does not install or run discovered code.', 'Human-attested live tests are not an independent sandbox runner.']}


def write_private(path, text):
    path = Path(path)
    temporary = path.with_name(path.name + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(text)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary, 0o600)
    temporary.replace(path)


def export_registry(conn, directory):
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    resources = [resource_detail(conn, r['id']) for r in conn.execute('SELECT id FROM resources ORDER BY id').fetchall()]
    research_path = directory / 'research_registry.jsonl'
    integration_path = directory / 'approved_integration_registry.json'
    write_private(research_path, ''.join(json.dumps(r, ensure_ascii=False, sort_keys=True, default=str) + '\n' for r in resources))
    manifest = integration_manifest(conn)
    write_private(integration_path, json.dumps(manifest, ensure_ascii=False, indent=2, default=str) + '\n')
    return {'research_records': len(resources), 'approved_records': len(manifest['resources']), 'files': [str(research_path), str(integration_path)]}
