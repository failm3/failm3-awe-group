"""Optional MTProto USER collector. No Bot API arbitrary-channel history promise."""
from __future__ import annotations

import asyncio
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import time

from .public import extract_links, iso_utc, normalize_handle, unique, utcnow
from .storage import HistoryStore


class AuthorizationRequired(RuntimeError):
    pass


class _BudgetExceeded(Exception):
    pass


def _config(session_path):
    if not os.environ.get('API_ID') or not os.environ.get('API_HASH'):
        raise AuthorizationRequired('API_ID and API_HASH are required in the environment; no credentials were provided')
    try:
        api_id = int(os.environ['API_ID'])
        if api_id < 1:
            raise ValueError()
    except ValueError:
        raise AuthorizationRequired('API_ID must be a positive integer') from None
    session = Path(session_path).expanduser().resolve()
    if any(p in ('research', 'evidence', 'exports') for p in session.parts):
        raise AuthorizationRequired('Use a separate private session path outside research/evidence/exports')
    session.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    return api_id, os.environ['API_HASH'], session


def _json_safe(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, bytes):
        return {'bytes_sha256': hashlib.sha256(value).hexdigest(), 'length': len(value)}
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def message_to_post(message, handle, title=None):
    handle = normalize_handle(handle)
    text = getattr(message, 'message', '') or ''
    links, mentions = extract_links(text)
    for entity in getattr(message, 'entities', []) or []:
        url = getattr(entity, 'url', None)
        if url and url.startswith(('https://', 'http://', 'tg://', 'mailto:')):
            links.append(url)
    public_dict = _json_safe(message.to_dict())
    raw_json = json.dumps(public_dict, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    media = []
    attachment = getattr(message, 'media', None)
    if attachment:
        entry = {'type': type(attachment).__name__, 'metadata': _json_safe(attachment.to_dict()), 'bytes_downloaded': False}
        file = getattr(message, 'file', None)
        if file:
            for name in ('name', 'mime_type', 'size', 'width', 'height', 'duration'):
                value = getattr(file, name, None)
                if value is not None:
                    entry[name] = value
        media.append(entry)
    forward = getattr(message, 'fwd_from', None)
    forwarded = None
    if forward:
        peer = getattr(forward, 'from_id', None)
        channel_id = getattr(peer, 'channel_id', None)
        forwarded = f'telegram:channel:{channel_id}' if channel_id else getattr(forward, 'from_name', None)
    raw = {'method': 'authorized_api', 'message': public_dict, 'mentions': mentions,
           'edited_at': iso_utc(message.edit_date.isoformat()) if getattr(message, 'edit_date', None) else None,
           'forward': _json_safe(forward.to_dict()) if forward else None}
    return {'source_handle': handle, 'source_url': f'https://t.me/{handle}', 'source_title': title,
            'message_id': str(message.id), 'url': f'https://t.me/{handle}/{message.id}',
            'published_at': iso_utc(message.date.isoformat()) if getattr(message, 'date', None) else None,
            'text': text, 'links': unique(links), 'media': media, 'forwarded_from': forwarded,
            'raw_hash': hashlib.sha256(raw_json.encode()).hexdigest(), 'collected_at': utcnow(), 'raw': raw}


async def authorize(session_path):
    api_id, api_hash, session = _config(session_path)
    try:
        from telethon import TelegramClient
        from telethon.errors import FloodWaitError
    except ImportError:
        raise AuthorizationRequired('Install optional dependency: pip install telethon') from None
    if not __import__('sys').stdin.isatty():
        raise AuthorizationRequired('Run authorize in your private interactive terminal; credentials must not be submitted here')
    old_umask = os.umask(0o077)
    client = TelegramClient(str(session), api_id, api_hash, flood_sleep_threshold=0)
    try:
        # No credentials are printed or written to collection evidence.
        try:
            await client.start()
            me = await client.get_me()
        except FloodWaitError as exc:
            raise AuthorizationRequired(f'Telegram requires waiting {exc.seconds} seconds before authorization; do not retry early') from None
        if getattr(me, 'bot', False):
            raise AuthorizationRequired('A user account session is required, not a bot')
        print('User session authorized. Session and login secrets remain in your private local directory.')
    finally:
        try:
            await client.disconnect()
        finally:
            os.umask(old_umask)
            for path in session.parent.glob(session.name + '*'):
                if path.is_file():
                    path.chmod(0o600)


async def collect_authorized(handle, root='.', *, session_path, max_pages=2000, resume=False,
                             max_seconds=1200, page_size=100, delay=3.2, progress=print):
    handle = normalize_handle(handle)
    if not 1 <= page_size <= 100 or max_pages < 1 or max_seconds <= 0 or delay < 0:
        raise ValueError('Invalid API page/time budget or page size')
    # Missing credentials/dependency must not overwrite a successful public export.
    api_id, api_hash, session = _config(session_path)
    try:
        from telethon import TelegramClient
        from telethon.errors import FloodWaitError
    except ImportError:
        raise AuthorizationRequired('Install optional dependency: pip install telethon') from None
    store = HistoryStore(root, handle, 'authorized_api')
    try:
        store.acquire()
    except Exception:
        store.close()
        raise
    client = None
    deadline = time.monotonic() + max_seconds
    old_umask = os.umask(0o077)

    async def rpc(operation):
        # Cover connect/auth/entity/history calls, not just getHistory.
        while True:
            waiting = max(0, (store.get('not_before', 0) or 0) - time.time())
            remaining = deadline - time.monotonic()
            if remaining <= 0 or waiting >= remaining:
                raise _BudgetExceeded('deferred_flood_wait' if waiting else 'time_budget')
            if waiting:
                progress(f'{handle}: respecting Telegram FloodWait {waiting:.1f}s')
                await asyncio.sleep(waiting)
            try:
                return await asyncio.wait_for(operation(), timeout=max(0.01, deadline - time.monotonic()))
            except FloodWaitError as exc:
                store.error('flood_wait', seconds=exc.seconds, cursor=store.get('cursor'))
                with store.db:
                    store.set('not_before', time.time() + exc.seconds)
                store.export()
                if time.monotonic() + exc.seconds >= deadline:
                    raise _BudgetExceeded('flood_wait') from None
            except asyncio.TimeoutError:
                raise _BudgetExceeded('time_budget') from None

    try:
        store.prepare(resume)
        if resume and store.get('history_boundary_reached', False):
            return store.coverage()
        client = TelegramClient(str(session), api_id, api_hash, flood_sleep_threshold=0, request_retries=0)
        await rpc(client.connect)
        if not await rpc(client.is_user_authorized):
            raise AuthorizationRequired('Authorize the separate user session first with the authorize CLI command')
        if getattr(await rpc(client.get_me), 'bot', False):
            raise AuthorizationRequired('A user account session is required, not a bot')
        with store.db:
            store.set('blocked', False)
        entity = await rpc(lambda: client.get_entity(handle))
        for completed in range(1, max_pages + 1):
            cursor = store.get('cursor') or 0
            messages = await rpc(lambda: client.get_messages(entity, limit=page_size, offset_id=int(cursor)))
            posts = [message_to_post(m, handle, getattr(entity, 'title', None)) for m in messages if getattr(m, 'id', None)]
            if messages and not posts:
                store.error('unparseable_api_page', cursor=cursor)
                store.stop('unparseable_api_page', blocked=True)
                break
            boundary = not messages
            next_cursor = min(int(p['message_id']) for p in posts) if posts else None
            if posts and cursor and next_cursor >= cursor:
                store.commit_page(posts, cursor, cursor)
                store.error('pagination_stalled', cursor=cursor)
                store.stop('pagination_stalled')
                break
            added, changed = store.commit_page(posts, cursor or None, next_cursor, boundary=boundary)
            progress(f'{handle}: API page={completed}/{max_pages} next={next_cursor} new={added} changed={changed} total={store.counts()[0]} boundary={boundary}')
            if completed % 10 == 0 or boundary:
                store.export()
            if boundary:
                break
            if time.monotonic() + delay >= deadline:
                raise _BudgetExceeded('time_budget')
            await asyncio.sleep(delay)
        else:
            store.stop('max_pages')
        store.export()
        return store.coverage()
    except _BudgetExceeded as exc:
        store.stop(str(exc))
        return store.coverage()
    except AuthorizationRequired as exc:
        store.error('authorization_required', explanation=str(exc))
        store.stop('authorization_required', blocked=True)
        raise
    except KeyboardInterrupt:
        store.stop('interrupted')
        return store.coverage()
    except Exception as exc:
        store.error('api_failed', error_type=type(exc).__name__)
        store.stop('api_failed', blocked=True)
        raise
    finally:
        try:
            if client:
                await client.disconnect()
        finally:
            os.umask(old_umask)
            store.close()
