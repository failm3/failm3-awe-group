import argparse
import hashlib
import json
from pathlib import Path
import sys
from .config import Settings, ROOT
from .db import connect, migrate
from .ingest import ingest_file, ingest_coverage
from .exporting import export_registry
from .verification import verify_resource
from .queue import enqueue
from .worker import worker_once, run_worker
from .models import SourceRegistration, LiveTestInput, utcnow
from .sources import register_source
from .registry import record_live_test, approve_resource, transition_stage


def output(result):
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


def main(argv=None):
    parser = argparse.ArgumentParser(description='Private PostgreSQL registry; discovered text is never executable')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init', help='Apply transactional PostgreSQL migrations')
    for kind in ('posts','resources','coverage'):
        p = sub.add_parser('ingest-' + kind)
        p.add_argument('path')
    p = sub.add_parser('export'); p.add_argument('--out', default='exports')
    p = sub.add_parser('verify'); p.add_argument('--limit', type=int, default=10); p.add_argument('--resource-id', type=int)
    p = sub.add_parser('worker'); p.add_argument('--once', action='store_true'); p.add_argument('--poll-seconds', type=int, default=10); p.add_argument('--no-schedule', action='store_true')
    p = sub.add_parser('serve'); p.add_argument('--host'); p.add_argument('--port', type=int)
    p = sub.add_parser('register-source'); p.add_argument('handle'); p.add_argument('--enabled', action='store_true'); p.add_argument('--method', choices=['public_web','authorized_api'], default='public_web'); p.add_argument('--title')
    p = sub.add_parser('enqueue'); p.add_argument('kind', choices=['collect','verify_resource']); p.add_argument('--handle'); p.add_argument('--resource-id', type=int); p.add_argument('--method', default='public_web'); p.add_argument('--max-pages', type=int, default=5); p.add_argument('--resume', action='store_true'); p.add_argument('--dedup-key')
    p = sub.add_parser('stage'); p.add_argument('resource_id', type=int); p.add_argument('target'); p.add_argument('--actor', required=True); p.add_argument('--reason', required=True); p.add_argument('--evidence-url'); p.add_argument('--evidence-hash')
    p = sub.add_parser('record-live-test'); p.add_argument('resource_id', type=int); p.add_argument('--name', required=True); p.add_argument('--result', choices=['passed','failed','inconclusive'], required=True); p.add_argument('--evidence-file', required=True); p.add_argument('--actor', required=True); p.add_argument('--tested-at'); p.add_argument('--notes')
    p = sub.add_parser('approve'); p.add_argument('resource_id', type=int); p.add_argument('--live-test-id', type=int); p.add_argument('--actor', required=True); p.add_argument('--reason', required=True); p.add_argument('--revoke', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.command == 'init':
            output({'applied': migrate()})
        elif args.command.startswith('ingest-'):
            with connect() as conn:
                if args.command == 'ingest-coverage':
                    data = json.loads(Path(args.path).read_text(encoding='utf-8'))
                    output({'source_id': ingest_coverage(conn, data)})
                else:
                    output(ingest_file(conn, args.path, args.command.removeprefix('ingest-')))
        elif args.command == 'export':
            with connect() as conn:
                output(export_registry(conn, args.out))
        elif args.command == 'verify':
            if args.limit < 1 or args.limit > 200:
                raise ValueError('limit must be 1..200')
            with connect() as conn:
                ids = [args.resource_id] if args.resource_id else [r['id'] for r in conn.execute('SELECT r.id FROM resources r LEFT JOIN verification_runs v ON v.resource_id=r.id GROUP BY r.id ORDER BY max(v.checked_at) NULLS FIRST,r.id LIMIT %s', (args.limit,)).fetchall()]
            output({'results': [verify_resource(rid) for rid in ids]})
        elif args.command == 'worker':
            if args.once:
                output(worker_once(schedule=not args.no_schedule))
            else:
                run_worker(poll_seconds=args.poll_seconds)
        elif args.command == 'serve':
            settings = Settings.from_env()
            if not settings.api_token:
                raise ValueError('Configure API_TOKEN before serving')
            import uvicorn
            uvicorn.run('awe_ti.api:app', host=args.host or settings.host, port=args.port or settings.port, access_log=False)
        elif args.command == 'register-source':
            with connect() as conn:
                output(register_source(conn, SourceRegistration(handle=args.handle, title=args.title, enabled=args.enabled, method=args.method)))
        elif args.command == 'enqueue':
            payload = {'resource_id': args.resource_id} if args.kind == 'verify_resource' else {'handle': args.handle, 'method': args.method, 'max_pages': args.max_pages, 'resume': args.resume}
            with connect() as conn:
                row = enqueue(conn, args.kind, payload, args.dedup_key)
                row.pop('lease_token', None); output(row)
        elif args.command == 'stage':
            with connect() as conn:
                output(transition_stage(conn, args.resource_id, args.target, args.actor, args.reason, args.evidence_url, args.evidence_hash))
        elif args.command == 'record-live-test':
            path = Path(args.evidence_file).expanduser().resolve()
            if not path.is_relative_to((ROOT / 'evidence').resolve()) or not path.is_file():
                raise ValueError('Evidence must be a real file under the independent project evidence directory')
            test = LiveTestInput(test_name=args.name, result=args.result, evidence_url=path.as_uri(), evidence_hash=hashlib.sha256(path.read_bytes()).hexdigest(),
                tested_at=args.tested_at or utcnow(), recorded_by=args.actor, notes=args.notes)
            with connect() as conn:
                output(record_live_test(conn, args.resource_id, test))
        elif args.command == 'approve':
            with connect() as conn:
                output(approve_resource(conn, args.resource_id, not args.revoke, args.actor, args.reason, args.live_test_id))
        return 0
    except Exception as error:
        # DSNs and library exception text can contain passwords.
        message = str(error) if type(error) is ValueError else type(error).__name__
        print(json.dumps({'error': message}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
