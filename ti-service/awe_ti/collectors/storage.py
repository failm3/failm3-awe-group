"""Durable SQLite checkpoint; portable JSONL/JSON exports are atomic snapshots."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time

from .public import normalize_handle, utcnow


def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + f'.{os.getpid()}.tmp')
    with temp.open('w', encoding='utf-8') as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, path)
    # Make rename durable too on POSIX.
    fd = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


class HistoryStore:
    def __init__(self, root, handle, method='public_web'):
        self.root, self.handle, self.method = Path(root), normalize_handle(handle), method
        self.state_dir = self.root / 'evidence' / 'state'
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.state_dir / f'{self.handle}.{method}.sqlite3'
        self.db = sqlite3.connect(self.path, timeout=30)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS posts(message_id TEXT PRIMARY KEY, raw_hash TEXT NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS snapshots(message_id TEXT NOT NULL, raw_hash TEXT NOT NULL,
                observed_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(message_id,raw_hash));
            CREATE TABLE IF NOT EXISTS pages(id INTEGER PRIMARY KEY, cursor TEXT, next_cursor TEXT,
                response_hash TEXT, raw_path TEXT, post_count INTEGER, observed_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS errors(id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
        ''')
        self.lock = None

    def acquire(self):
        import fcntl
        lock_path = self.state_dir / f'{self.handle}.collector.lock'
        self.lock = lock_path.open('a')
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            self.lock = None
            raise RuntimeError(f'Another collector owns {self.handle}/{self.method}')

    def close(self):
        self.db.close()
        if self.lock:
            self.lock.close()

    def get(self, key, default=None):
        row = self.db.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set(self, key, value):
        self.db.execute('INSERT OR REPLACE INTO meta VALUES (?,?)', (key, json.dumps(value)))

    def prepare(self, resume=False):
        if self.get('history_boundary_reached', False):
            with self.db:
                self.set('ever_history_boundary_reached', True)
        if not resume:
            # Restart pagination, but retain existing snapshots and posts to observe edits.
            with self.db:
                self.set('cursor', None)
                self.set('history_boundary_reached', False)
                self.set('stop_reason', None)
                self.set('scan_started_at', utcnow())
                self.set('scan_pages', 0)
        elif self.get('scan_started_at') is None:
            with self.db:
                self.set('scan_started_at', utcnow())
        self.export()

    def save_response(self, result, attempt=0, error=None):
        raw_path = None
        if result:
            sha = hashlib.sha256(result.body).hexdigest()
            folder = self.root / 'evidence' / 'raw_html' / self.handle
            folder.mkdir(parents=True, exist_ok=True)
            path = folder / f'{sha}.html'
            if not path.exists():
                temp = path.with_suffix(f'.{os.getpid()}.tmp')
                with temp.open('wb') as f:
                    f.write(result.body)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(temp, path)
            raw_path = str(path.relative_to(self.root))
            record = {'observed_at': utcnow(), 'url': result.url, 'status': result.status,
                      'body_hash': sha, 'raw_path': raw_path, 'bytes': len(result.body), 'attempt': attempt}
        else:
            record = {'observed_at': utcnow(), 'attempt': attempt, 'error': error}
        log_path = self.root / 'evidence' / 'logs' / f'{self.handle}.{self.method}.requests.jsonl'
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open('a', encoding='utf-8') as f:
            f.write(json.dumps(record, ensure_ascii=False) + '\n')
            f.flush()
            os.fsync(f.fileno())
        if result and result.status >= 400 or error:
            self.error('request_attempt', **record)
        return raw_path

    def error(self, kind, **details):
        record = {'kind': kind, 'observed_at': utcnow(), **details}
        with self.db:
            self.db.execute('INSERT INTO errors(payload) VALUES (?)', (json.dumps(record, ensure_ascii=False),))

    def commit_page(self, posts, cursor, next_cursor, *, response_hash=None, raw_path=None, boundary=False):
        added = changed = 0
        with self.db:
            for post in posts:
                existing = self.db.execute('SELECT raw_hash FROM posts WHERE message_id=?', (post['message_id'],)).fetchone()
                payload = json.dumps(post, ensure_ascii=False, sort_keys=True)
                if not existing:
                    added += 1
                elif existing[0] != post['raw_hash']:
                    changed += 1
                self.db.execute('INSERT OR IGNORE INTO snapshots VALUES (?,?,?,?)',
                                (post['message_id'], post['raw_hash'], post['collected_at'], payload))
                self.db.execute('INSERT OR REPLACE INTO posts VALUES (?,?,?)',
                                (post['message_id'], post['raw_hash'], payload))
            self.db.execute('INSERT INTO pages(cursor,next_cursor,response_hash,raw_path,post_count,observed_at) VALUES (?,?,?,?,?,?)',
                            (str(cursor) if cursor is not None else None,
                             str(next_cursor) if next_cursor is not None else None,
                             response_hash, raw_path, len(posts), utcnow()))
            self.set('cursor', next_cursor)
            self.set('history_boundary_reached', boundary)
            if boundary:
                self.set('ever_history_boundary_reached', True)
            self.set('scan_pages', self.get('scan_pages', 0) + 1)
            self.set('stop_reason', 'accessible_history_boundary' if boundary else None)
        return added, changed

    def stop(self, reason, blocked=False, retry_after=None):
        with self.db:
            self.set('stop_reason', reason)
            self.set('blocked', blocked)
            if retry_after is not None:
                self.set('not_before', time.time() + retry_after)
        self.export()

    def counts(self):
        n, first, last = self.db.execute('SELECT COUNT(*), MIN(CAST(message_id AS INTEGER)), MAX(CAST(message_id AS INTEGER)) FROM posts').fetchone()
        pages = self.db.execute('SELECT COUNT(*) FROM pages').fetchone()[0]
        versions = self.db.execute('SELECT COUNT(*) FROM snapshots').fetchone()[0]
        return n, first, last, pages, versions

    def coverage(self):
        n, first, last, pages, versions = self.counts()
        return {'handle': self.handle, 'method': self.method, 'pages': pages, 'posts': n,
                'earliest_id': str(first) if first is not None else None,
                'latest_id': str(last) if last is not None else None,
                'history_boundary_reached': self.get('history_boundary_reached', False),
                'corpus_history_boundary_reached': self.get('ever_history_boundary_reached', self.get('history_boundary_reached', False)),
                'completeness': 'blocked' if self.get('blocked', False) else (
                    'public_web_only' if self.method == 'public_web' else 'authorized_api'),
                'errors': [json.loads(r[0]) for r in self.db.execute('SELECT payload FROM errors ORDER BY id')],
                'media_limitations': ['Metadata and public preview links only; no media bytes downloaded.',
                    'Public previews may omit unsupported, deleted, restricted, private, and service messages; original media and hidden forwards may be unavailable.'] if self.method == 'public_web' else [
                    'Media metadata only; original bytes not downloaded.',
                    'Only history accessible to the authorized user; deleted messages and inaccessible history are not recoverable.'],
                'observed_at': utcnow(), 'next_before': self.get('cursor'),
                'stop_reason': self.get('stop_reason'), 'scan_pages': self.get('scan_pages', 0),
                'snapshots': versions, 'scan_started_at': self.get('scan_started_at'),
                'not_before': self.get('not_before'), 'state_file': str(self.path.relative_to(self.root)),
                'raw_hash_definition': 'SHA-256 of serialized HTML message fragment (public) or canonical JSON message (API); raw page byte hashes stored separately.',
                'snapshot_limitations': 'Distinct observed raw versions retained; views and CDN URL changes can create snapshots and are not proof of a semantic edit.',
                'pagination_gaps': 'Message IDs are not contiguous; deleted/hidden messages cannot be inferred or reconstructed.'}

    def export(self):
        posts = ''.join(r[0] + '\n' for r in self.db.execute('SELECT payload FROM posts ORDER BY CAST(message_id AS INTEGER)'))
        snapshots = ''.join(r[0] + '\n' for r in self.db.execute('SELECT payload FROM snapshots ORDER BY CAST(message_id AS INTEGER), observed_at'))
        atomic_write(self.root / 'research' / 'posts' / f'{self.handle}.jsonl', posts)
        atomic_write(self.root / 'evidence' / 'snapshots' / f'{self.handle}.{self.method}.jsonl', snapshots)
        atomic_write(self.root / 'evidence' / 'coverage' / f'{self.handle}.json', json.dumps(self.coverage(), indent=2, ensure_ascii=False) + '\n')
