"""Heuristics only: every candidate stays pending until explicit resolution.
Fetched and imported strings are data, never instructions or Python/shell input.
"""
import re
from .models import canonical_url, stable_hash

URL_RE = re.compile(r"https?://[^\s<>\"']+", re.I)
NAME_RE = re.compile(r"(?<!\w)(?:[A-Z][A-Za-z0-9+._-]{2,}|[А-ЯЁ][а-яёA-Za-z0-9+._-]{2,})(?:\s+[A-Z][A-Za-z0-9+._-]{2,}){0,2}")
STOP_NAMES = {"The", "This", "Telegram", "You", "Today", "Привет", "Сегодня", "Теперь", "Ссылка", "Подробнее", "GitHub"}


def extract_candidates(post):
    candidates = []
    urls = set(post.links) | set(URL_RE.findall(post.text))
    for url in sorted(urls):
        try:
            clean = canonical_url(url.rstrip(".,;!?)］]"))
        except ValueError:
            continue
        candidates.append({"kind": "url", "name": None, "url": clean, "excerpt": post.text[:1000]})
    for match in NAME_RE.finditer(post.text):
        name = match.group().strip()
        if name not in STOP_NAMES and not any(match.start() >= m.start() and match.end() <= m.end() for m in URL_RE.finditer(post.text)):
            candidates.append({"kind": "named_mention", "name": name, "url": None, "excerpt": post.text[max(0, match.start()-80):match.end()+160]})
    # No names or links is NOT a claim of completed semantic extraction.
    if post.text.strip() and not candidates:
        candidates.append({"kind": "unresolved_text", "name": None, "url": None, "excerpt": post.text[:1000]})
    seen = set()
    result = []
    for candidate in candidates[:100]:
        digest = stable_hash(candidate)
        if digest not in seen:
            result.append({**candidate, "candidate_hash": digest})
            seen.add(digest)
    return result
