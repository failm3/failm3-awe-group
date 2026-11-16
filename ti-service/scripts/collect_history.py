#!/usr/bin/env python3
"""Collect public Telegram previews or history visible to an authorized user."""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
import sys

# Direct script execution works before parent integrates/installs the package.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from awe_ti.collectors.runner import collect_public
from awe_ti.collectors.telegram_api import AuthorizationRequired, authorize, collect_authorized


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    for mode in ('public', 'api'):
        p = sub.add_parser(mode)
        p.add_argument('handles', nargs='+', help='Public channel handles, without URL')
        default_root = Path(__file__).resolve().parents[1]
        if mode == 'api':
            default_root = default_root / 'research' / 'telegram_api_data'
        p.add_argument('--root', default=str(default_root), help='Output data root; API defaults to separate corpus')
        p.add_argument('--max-pages', type=int, default=2000, help='Page budget PER CHANNEL for THIS run')
        p.add_argument('--max-seconds', type=float, default=1200, help='Time budget per channel, including backoff')
        p.add_argument('--resume', action='store_true', help='Continue last committed cursor; do not rescan latest')
        p.add_argument('--delay', type=float, default=1.0 if mode == 'public' else 3.2, help='Seconds between requests')
        if mode == 'public':
            p.add_argument('--timeout', type=float, default=30)
            p.add_argument('--retries', type=int, default=5)
        else:
            p.add_argument('--session', required=True, help='Separate PRIVATE Telethon user session path')
            p.add_argument('--page-size', type=int, default=100)
    p = sub.add_parser('authorize', help='Interactive private user login; never sends a message')
    p.add_argument('--session', required=True, help='Separate PRIVATE Telethon user session path')
    args = parser.parse_args(argv)
    if args.command == 'authorize':
        try:
            asyncio.run(authorize(args.session))
            return 0
        except AuthorizationRequired as exc:
            print(str(exc), file=sys.stderr)
            return 2
    status = 0
    for handle in args.handles:
        common = dict(root=args.root, max_pages=args.max_pages, resume=args.resume,
                      max_seconds=args.max_seconds, delay=args.delay,
                      progress=lambda line: print(line, flush=True))
        try:
            if args.command == 'public':
                coverage = collect_public(handle, timeout=args.timeout, retries=args.retries, **common)
            else:
                coverage = asyncio.run(collect_authorized(handle, session_path=args.session,
                    page_size=args.page_size, **common))
            print(json.dumps(coverage, ensure_ascii=False), flush=True)
            if not coverage['history_boundary_reached']:
                status = max(status, 1)
        except (AuthorizationRequired, ValueError, RuntimeError) as exc:
            # Avoid secret-bearing reprs from network/library exceptions.
            print(f'{handle}: {str(exc) if isinstance(exc, (AuthorizationRequired, ValueError)) else type(exc).__name__}', file=sys.stderr, flush=True)
            status = 2
    return status


if __name__ == '__main__':
    raise SystemExit(main())
