"""Reproducible functional smoke tests; never approve/register a discovered tool."""
import importlib.metadata as metadata
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    from dotenv import load_dotenv
    load_dotenv(ROOT / '.env')
    results = []

    def run(name, package, official_url, test):
        start = time.monotonic()
        try:
            detail = test()
            passed, error = True, None
        except Exception as exc:
            detail, passed, error = None, False, str(exc)
        results.append({'name': name, 'package': package,
                        'version': metadata.version(package),
                        'official_url': official_url, 'passed': passed,
                        'test_details': detail, 'error': error,
                        'duration_seconds': round(time.monotonic()-start, 4),
                        'tested_at': datetime.now(timezone.utc).isoformat(),
                        'scope': 'isolated functional smoke test, not security or production certification'})

    def soup_test():
        from bs4 import BeautifulSoup
        html = '<div data-post="channel/42"><a href="https://github.com/example/project">Project</a><time datetime="2026-11-12T00:00:00+00:00"></time><p>Тестовый текст</p></div>'
        node = BeautifulSoup(html, 'html.parser').select_one('[data-post]')
        assert node['data-post'] == 'channel/42'
        assert node.select_one('a')['href'] == 'https://github.com/example/project'
        assert 'Тестовый текст' in node.get_text()
        return {'parsed_message_id': '42', 'link_extracted': True, 'unicode_preserved': True}

    def fastapi_test():
        from fastapi import FastAPI
        from fastapi.testclient import TestClient
        app = FastAPI()
        @app.get('/probe')
        def probe(tag: str):
            return {'capability': tag}
        with TestClient(app) as client:
            r = client.get('/probe', params={'tag': 'browser_automation'})
            assert r.status_code == 200 and r.json()['capability'] == 'browser_automation'
            assert client.get('/probe').status_code == 422
            assert '/probe' in client.get('/openapi.json').json()['paths']
        return {'typed_request': True, 'validation_422': True, 'openapi_generated': True}

    def postgres_test():
        import psycopg
        with psycopg.connect(os.environ['DATABASE_URL']) as conn:
            with conn.cursor() as cur:
                cur.execute('CREATE TEMP TABLE live_probe (id text PRIMARY KEY, facts jsonb NOT NULL)')
                cur.execute('INSERT INTO live_probe VALUES (%s,%s::jsonb) ON CONFLICT DO NOTHING', ('same', '{"provenance":"test"}'))
                cur.execute('INSERT INTO live_probe VALUES (%s,%s::jsonb) ON CONFLICT DO NOTHING', ('same', '{"provenance":"test"}'))
                cur.execute('SELECT count(*), min(facts->>\'provenance\') FROM live_probe')
                count, fact = cur.fetchone()
                assert count == 1 and fact == 'test'
                cur.execute('SHOW server_version')
                version = cur.fetchone()[0]
        return {'postgres_version': version, 'dedup_unique_constraint': True, 'jsonb_provenance_roundtrip': True, 'temporary_table_only': True}

    run('Beautiful Soup', 'beautifulsoup4', 'https://www.crummy.com/software/BeautifulSoup/bs4/doc/', soup_test)
    run('FastAPI', 'fastapi', 'https://fastapi.tiangolo.com/', fastapi_test)
    run('Psycopg PostgreSQL adapter', 'psycopg', 'https://www.psycopg.org/psycopg3/docs/', postgres_test)
    path = ROOT / 'evidence/live-stack.json'
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(results, ensure_ascii=False, indent=2))
    if not all(x['passed'] for x in results):
        raise SystemExit(1)

if __name__ == '__main__':
    main()
