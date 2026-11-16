"""Bounded collection; each processed page and next cursor commit atomically."""
from __future__ import annotations

import hashlib
import time

from .public import FetchError, PublicFetcher, normalize_handle, parse_page
from .storage import HistoryStore


def collect_public(handle, root='.', *, max_pages=2000, resume=False, max_seconds=1200,
                   delay=1.0, timeout=30, retries=5, fetcher=None, progress=print):
    handle = normalize_handle(handle)
    if max_pages < 1 or max_seconds <= 0 or delay < 0:
        raise ValueError('Positive page/time budgets and nonnegative delay required')
    store = HistoryStore(root, handle, 'public_web')
    deadline = time.monotonic() + max_seconds
    try:
        store.acquire()
    except Exception:
        store.close()
        raise
    try:
        store.prepare(resume)
        if resume and store.get('history_boundary_reached', False):
            progress(f'{handle}: already reached accessible public boundary; use a non-resume run to rescan edits/new posts')
            return store.coverage()
        with store.db:
            store.set('blocked', False)
        wait = store.get('not_before', 0) or 0
        if wait > time.time():
            wait -= time.time()
            if wait >= max_seconds:
                store.stop('deferred_backoff', retry_after=wait)
                return store.coverage()
            progress(f'{handle}: respecting persisted backoff for {wait:.1f}s')
            time.sleep(wait)
        fetcher = fetcher or PublicFetcher(timeout=timeout, retries=retries, delay=delay,
                                            evidence=store.save_response, deadline=deadline)
        completed = 0
        while completed < max_pages:
            if time.monotonic() >= deadline:
                store.stop('time_budget')
                break
            cursor = store.get('cursor')
            url = f'https://t.me/s/{handle}' + (f'?before={cursor}' if cursor is not None else '')
            try:
                result = fetcher.fetch(url)
            except FetchError as exc:
                store.error('fetch_failed', url=url, error=str(exc), status=exc.status, retry_after=exc.retry_after)
                store.stop('fetch_failed', blocked=True, retry_after=exc.retry_after)
                break
            # Production fetcher saves every attempt; injected/test fetchers still preserve processed pages.
            raw_path = store.save_response(result) if not isinstance(fetcher, PublicFetcher) else (
                f'evidence/raw_html/{handle}/{hashlib.sha256(result.body).hexdigest()}.html')
            parsed = parse_page(result.body.decode('utf-8', errors='replace'), handle, page_url=result.url)
            for error in parsed.errors:
                store.error('parse_warning', url=result.url, details=error)
            if not parsed.valid_preview:
                store.error('not_channel_preview', url=result.url, raw_path=raw_path)
                store.stop('unavailable_public_preview', blocked=True)
                break
            if parsed.errors and not parsed.posts:
                store.stop('unparseable_messages', blocked=True)
                break
            boundary = False
            if not parsed.posts:
                # Validate a second response from the SAME older cursor. One transient empty 200 is insufficient.
                if cursor is None or parsed.before is not None:
                    store.error('empty_initial_or_paginated_preview', url=result.url, raw_path=raw_path)
                    store.stop('empty_unconfirmed_preview', blocked=True)
                    break
                try:
                    second = fetcher.fetch(url)
                    if not isinstance(fetcher, PublicFetcher):
                        store.save_response(second)
                    confirm = parse_page(second.body.decode('utf-8', errors='replace'), handle, page_url=second.url)
                except FetchError as exc:
                    store.error('boundary_confirmation_failed', url=url, error=str(exc))
                    store.stop('boundary_unconfirmed', retry_after=exc.retry_after)
                    break
                if not confirm.valid_preview or confirm.posts or confirm.before is not None or confirm.errors:
                    store.error('empty_boundary_not_confirmed', url=url)
                    store.stop('boundary_unconfirmed')
                    break
                boundary = True
                next_cursor = None
            else:
                minimum = min(int(p['message_id']) for p in parsed.posts)
                if parsed.before is not None and parsed.before < minimum:
                    store.error('cursor_below_visible_minimum', visible_minimum=minimum, supplied_cursor=parsed.before,
                                explanation='Using visible minimum to avoid skipping unknown IDs')
                next_cursor = minimum
                if minimum == 1:
                    boundary = True
                    next_cursor = None
                elif cursor is not None and minimum >= int(cursor):
                    # Keep all evidence, but do not claim stalled/repeated pagination is a boundary.
                    store.commit_page(parsed.posts, cursor, cursor, response_hash=hashlib.sha256(result.body).hexdigest(), raw_path=raw_path)
                    store.error('pagination_stalled', cursor=cursor, visible_minimum=minimum, url=url)
                    store.stop('pagination_stalled')
                    break
            added, changed = store.commit_page(parsed.posts, cursor, next_cursor,
                response_hash=hashlib.sha256(result.body).hexdigest(), raw_path=raw_path, boundary=boundary)
            completed += 1
            n, first, last, pages, versions = store.counts()
            progress(f'{handle}: page={pages} run_page={completed}/{max_pages} cursor={cursor} next={next_cursor} '
                     f'visible={len(parsed.posts)} new={added} changed={changed} total={n} range={first}..{last} boundary={boundary}')
            if completed % 10 == 0 or boundary:
                store.export()
            if boundary:
                break
        else:
            store.stop('max_pages')
        store.export()
        return store.coverage()
    except KeyboardInterrupt:
        store.error('interrupted', explanation='Last committed cursor is safe to resume')
        store.stop('interrupted')
        return store.coverage()
    except Exception as exc:
        # No credentials or entire exception payloads in logs.
        store.error('collector_error', error_type=type(exc).__name__)
        store.stop('collector_error', blocked=True)
        raise
    finally:
        try:
            if isinstance(fetcher, PublicFetcher):
                fetcher.close()
        finally:
            store.close()
