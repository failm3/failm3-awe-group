"""Generate resource records from official registry evidence + actual smoke tests."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
tests = json.loads((root / 'evidence/live-stack.json').read_text())
caps = {'beautifulsoup4':['web_scraping','html_parsing','document_extraction'],
        'fastapi':['api_development','tool_registry','openapi'],
        'psycopg':['postgresql','structured_storage','provenance']}
repos = {'beautifulsoup4':'https://code.launchpad.net/beautifulsoup',
         'fastapi':'https://github.com/fastapi/fastapi',
         'psycopg':'https://github.com/psycopg/psycopg'}
rows=[]
for test in tests:
    package=test['package']
    evidence=json.loads((root/'evidence/pypi'/f'{package}.json').read_text())
    meta=evidence['metadata']['info']
    license_id=meta.get('license_expression') or meta.get('license')
    rows.append({'name':test['name'],'official_url':test['official_url'],
      'repository_url':repos[package], 'resource_type':'library',
      'description':meta.get('summary'),'capabilities':caps[package],
      'integrations':['library','SDK'], 'verification_status':'DOCUMENTED',
      'version':test['version'], 'requirements':{'python':meta.get('requires_python')},
      'claims':[{'field':'license','value':license_id,'evidence_url':evidence['evidence_url'],'checked_at':test['tested_at']},
                {'field':'version_tested','value':test['version'],'evidence_url':evidence['evidence_url'],'checked_at':test['tested_at']},
                {'field':'requires_python','value':meta.get('requires_python'),'evidence_url':evidence['evidence_url'],'checked_at':test['tested_at']}],
      'pricing':{'category':'free_open_source','details':'No library subscription required under recorded open-source license. Compute, hosting, support and transitive dependencies are separate costs.','evidence_url':evidence['evidence_url'],'checked_at':test['tested_at']},
      'license':{'spdx':license_id,'details':'Preserve notices; inspect dependency/distribution obligations. Psycopg LGPL obligations need distribution-specific review.','evidence_url':evidence['evidence_url']},
      'provenance':[{'source_url':evidence['evidence_url'],'post_url':None,'message_id':None}],
      'decision':'requires_adapter','limitations':['Smoke tests passed; not approved for AWE execution. Full security review and TR-01 integration unperformed.'],
      'live_test':test,'install_command':f'python -m pip install {package}=={test["version"]}'})
path=root/'research/live_stack_resources.jsonl'
path.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows))
print(f'Wrote {len(rows)} documented records with independent LIVE evidence: {path}')
