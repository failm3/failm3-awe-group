"""Read public channel previews only; never execute or fetch links found in posts."""
from __future__ import annotations

import hashlib
import ipaddress
import json
import random
import re
import socket
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup


def utcnow():
    return datetime.now(timezone.utc).isoformat()


def normalize_handle(handle):
    handle = handle.lstrip('@')
    if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{3,63}', handle):
        raise ValueError('Expected a public channel handle, not a URL or invitation')
    return handle


def iso_utc(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError):
        return None


def unique(items):
    return list(dict.fromkeys(items))


def metadata_url(value, base='https://t.me/'):
    if not value:
        return None
    value = re.sub(r'\s+', '', value)
    url = urljoin(base, value)
    if urlsplit(url).scheme.lower() not in ('https', 'http', 'tg', 'mailto'):
        return None
    return url


def extract_links(text):
    links = [m.rstrip('.,;:!?)]}') for m in re.findall(r'https?://[^\s<>"\']+', text)]
    mentions = unique(re.findall(r'(?<![\w@])@([A-Za-z][A-Za-z0-9_]{3,63})\b', text))
    links.extend('https://t.me/' + m for m in mentions)
    return unique(links), mentions


def text_content(node):
    if node is None:
        return ''
    clone = BeautifulSoup(str(node), 'html.parser')
    for unwanted in clone.select('script, style'):
        unwanted.decompose()
    for br in clone.find_all('br'):
        br.replace_with('\n')
    return clone.get_text('', strip=False).strip()


@dataclass
class ParsedPage:
    posts: list
    before: int | None
    valid_preview: bool
    title: str | None = None
    errors: list = field(default_factory=list)


def parse_page(html, handle, *, page_url=None, collected_at=None):
    handle = normalize_handle(handle)
    collected_at = collected_at or utcnow()
    page_url = page_url or f'https://t.me/s/{handle}'
    soup = BeautifulSoup(html, 'html.parser')
    title_tag = soup.select_one('meta[property="og:title"]')
    title = title_tag.get('content') if title_tag else None
    posts, errors = [], []
    for node in soup.select('.tgme_widget_message[data-post]'):
        ref = node.get('data-post', '')
        match = re.fullmatch(r'([^/]+)/([0-9]+)', ref)
        if not match or match[1].lower() != handle.lower():
            errors.append({'kind': 'invalid_message_reference', 'reference': ref})
            continue
        mid = match[2]
        text = text_content(node.select_one('.tgme_widget_message_text'))
        links, mentions = extract_links(text)
        for a in node.select('.tgme_widget_message_text a[href], .tgme_widget_message_link_preview[href]'):
            u = metadata_url(a.get('href'), page_url)
            if u:
                links.append(u)
        forward_node = node.select_one('.tgme_widget_message_forwarded_from')
        forwarded = None
        forward_metadata = None
        if forward_node:
            a = forward_node.select_one('a[href]')
            forwarded = metadata_url(a.get('href'), page_url) if a else text_content(forward_node)
            forward_metadata = {'name': text_content(forward_node), 'url': forwarded}
            if a and forwarded:
                links.append(forwarded)
        media = []
        selectors = [('.tgme_widget_message_photo_wrap', 'photo'),
                     ('.tgme_widget_message_video_player', 'video'),
                     ('.tgme_widget_message_document_wrap', 'document'),
                     ('.tgme_widget_message_audio_player', 'audio'),
                     ('.tgme_widget_message_voice_player', 'voice'),
                     ('.tgme_widget_message_sticker_wrap', 'sticker')]
        for selector, kind in selectors:
            for item in node.select(selector):
                entry = {'type': kind, 'post_url': f'https://t.me/{handle}/{mid}'}
                href = metadata_url(item.get('href'), page_url)
                if href:
                    entry['url'] = href
                style = item.get('style', '')
                backgrounds = re.findall(r'url\([\s\'"]*([^\)\'"]+)', style)
                thumbs = [metadata_url(u, page_url) for u in backgrounds]
                for img in item.select('img[src]'):
                    thumbs.append(metadata_url(img.get('src'), page_url))
                if any(thumbs):
                    entry['thumbnail_urls'] = unique([u for u in thumbs if u])
                playable = []
                for src in item.select('video[src], audio[src], source[src]'):
                    u = metadata_url(src.get('src'), page_url)
                    if u:
                        playable.append(u)
                if playable:
                    entry['download_urls'] = unique(playable)
                for css, key in [('.tgme_widget_message_document_title', 'filename'),
                                 ('.tgme_widget_message_document_extra', 'size_label'),
                                 ('.tgme_widget_message_video_duration', 'duration'),
                                 ('.tgme_widget_message_audio_duration', 'duration')]:
                    val = text_content(item.select_one(css))
                    if val:
                        entry[key] = val
                entry['bytes_downloaded'] = False
                media.append(entry)
        # Link preview artwork is metadata, not an original message attachment.
        for item in node.select('.tgme_widget_message_link_preview'):
            entry = {'type': 'link_preview', 'url': metadata_url(item.get('href'), page_url),
                     'title': text_content(item.select_one('.link_preview_title')),
                     'description': text_content(item.select_one('.link_preview_description')),
                     'bytes_downloaded': False}
            media.append(entry)
        unsupported = node.select('.tgme_widget_message_error, .tgme_widget_message_service_photo')
        when = node.select_one('.tgme_widget_message_date time[datetime]') or node.select_one('time[datetime]')
        published = iso_utc(when.get('datetime')) if when else None
        fragment = str(node)
        # Preserve exact serialized fragment and the complete raw page separately.
        raw = {'method': 'public_web', 'html': fragment, 'page_url': page_url,
               'mentions': mentions, 'forward': forward_metadata,
               'views_label': text_content(node.select_one('.tgme_widget_message_views')) or None,
               'edited_marker': text_content(node.select_one('.tgme_widget_message_edit')) or None,
               'extraction_errors': [text_content(x) for x in unsupported]}
        if published is None:
            raw['extraction_errors'].append('missing_or_invalid_timestamp')
        post = {'source_handle': handle, 'source_url': f'https://t.me/{handle}',
                'source_title': title, 'message_id': mid, 'url': f'https://t.me/{handle}/{mid}',
                'published_at': published, 'text': text, 'links': unique(links),
                'media': media, 'forwarded_from': forwarded,
                'raw_hash': hashlib.sha256(fragment.encode('utf-8')).hexdigest(),
                'collected_at': collected_at, 'raw': raw}
        raw['content_hash'] = hashlib.sha256(json.dumps(
            {k: post[k] for k in ('text', 'links', 'media', 'forwarded_from', 'published_at')},
            sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        posts.append(post)
    cursor = None
    for a in soup.select('a.tme_messages_more, a[data-before]'):
        val = a.get('data-before') or parse_qs(urlsplit(a.get('href', '')).query).get('before', [None])[0]
        if val and str(val).isdigit():
            cursor = int(val)
            break
    valid = bool(soup.select_one('.tgme_channel_history'))
    # Missing older link alone is NOT enough to establish the history boundary.
    if cursor is None and posts:
        cursor = min(int(p['message_id']) for p in posts)
    return ParsedPage(posts, cursor, valid, title, errors)


class FetchError(RuntimeError):
    def __init__(self, message, *, retry_after=None, status=None):
        super().__init__(message)
        self.retry_after, self.status = retry_after, status


@dataclass
class FetchResult:
    url: str
    status: int
    body: bytes
    headers: dict = field(default_factory=dict)


def validate_public_url(url):
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.hostname != 't.me' or parts.port not in (None, 443) or parts.username:
        raise FetchError('Unsafe public-preview request or redirect rejected')
    for addr in socket.getaddrinfo('t.me', 443, type=socket.SOCK_STREAM):
        if not ipaddress.ip_address(addr[4][0]).is_global:
            raise FetchError('Non-public Telegram DNS address rejected')


class PublicFetcher:
    """Fixed-origin HTTPS, bounded responses, no arbitrary external link fetching."""
    def __init__(self, *, timeout=30, retries=5, delay=1.0, sleep=time.sleep, evidence=None, deadline=None):
        import httpx
        self.session = httpx.Client(follow_redirects=False, trust_env=False)
        self.session.headers['User-Agent'] = 'AWE-Tool-Intelligence/1.0 (public channel research)'
        self.timeout, self.retries, self.delay = timeout, retries, delay
        self.sleep, self.evidence, self.deadline = sleep, evidence, deadline
        self.next_request = 0.0

    def close(self):
        self.session.close()

    def _pause(self, seconds):
        seconds = max(0.0, seconds)
        if self.deadline is not None and time.monotonic() + seconds >= self.deadline:
            raise FetchError('Time budget exhausted during backoff', retry_after=seconds)
        self.sleep(seconds)

    def fetch(self, url):
        import httpx
        for attempt in range(self.retries + 1):
            self._pause(max(0, self.next_request - time.monotonic()))
            current = url
            try:
                for _ in range(5):
                    validate_public_url(current)
                    with self.session.stream('GET', current, timeout=self.timeout) as resp:
                        chunks, length = [], 0
                        for chunk in resp.iter_bytes(65536):
                            length += len(chunk)
                            if length > 16 * 1024 * 1024:
                                raise FetchError('HTML response exceeded 16 MiB limit', status=resp.status_code)
                            chunks.append(chunk)
                        result = FetchResult(current, resp.status_code, b''.join(chunks), {k.lower(): v for k, v in resp.headers.items()})
                    self.next_request = time.monotonic() + self.delay
                    if self.evidence:
                        self.evidence(result, attempt)
                    if result.status in (301, 302, 303, 307, 308):
                        current = urljoin(current, result.headers.get('location', ''))
                        self._pause(self.delay)
                        continue
                    break
                else:
                    raise FetchError('Too many redirects')
                if result.status == 200:
                    return result
                wait = None
                header = result.headers.get('retry-after')
                if header:
                    try:
                        wait = max(0, float(header))
                    except ValueError:
                        try:
                            wait = max(0, (parsedate_to_datetime(header) - datetime.now(timezone.utc)).total_seconds())
                        except (ValueError, TypeError):
                            pass
                if result.status not in (429, 500, 502, 503, 504):
                    raise FetchError(f'HTTP {result.status}', status=result.status)
                wait = wait if wait is not None else min(120, 2 ** attempt + random.random())
                if attempt == self.retries:
                    raise FetchError('HTTP retry budget exhausted', status=result.status, retry_after=wait)
                self._pause(wait)
            except (httpx.HTTPError, OSError) as exc:
                if self.evidence:
                    self.evidence(None, attempt, error=type(exc).__name__)
                if attempt == self.retries:
                    raise FetchError(f'Transport failed: {type(exc).__name__}') from exc
                self._pause(min(120, 2 ** attempt + random.random()))
        raise FetchError('Request did not complete')
