# Telegram history collectors

The public collector reads only `https://t.me/s/{channel}` previews, follows older `before` message-ID cursors, and never executes scripts or instructions from messages. It does not visit extracted external links. `beautifulsoup4` and `httpx` are required; `telethon` is optional and only imported for API collection/authorization.

From the project directory:

```bash
.venv/bin/python scripts/collect_history.py public GitHubRadar iirepresent sachkov_blog \
  --max-pages 2000 --max-seconds 1200 --delay 1.2
# Continue each last committed older cursor after interruption/budget exhaustion:
.venv/bin/python scripts/collect_history.py public GitHubRadar iirepresent sachkov_blog \
  --max-pages 2000 --max-seconds 1200 --delay 1.2 --resume
# Without --resume, revisit from latest to observe edits/new posts. Existing evidence is retained.
.venv/bin/python -m unittest discover -s tests -p test_collectors.py -v
```

Both budgets apply **per channel per invocation**, not across all channels. Progress is flushed for every processed page. Exit codes are 0 for an accessible-history boundary, 1 for a bounded/incomplete run, and 2 for a configuration/authorization failure. Three independent invocations may run concurrently for distinct handles; no concurrent processes should collect the same handle. A local shared handle lock prevents overlapping public/API scans within the same output root.

The collector commits each page, distinct observed post versions, and its next cursor in one SQLite transaction with FULL synchronous mode. After a crash, `--resume` rebuilds exports from durable SQLite before continuing. Latest-post and coverage files are atomically replaced every ten pages and at every stop. SQLite checkpoints are necessary for exact resumption; do not discard them while keeping only JSONL.

Outputs under `--root` are:

- `research/posts/{handle}.jsonl`: latest observed version of each message, in numeric ID order, conforming to CONTRACT.md.
- `evidence/coverage/{handle}.json`: total pages/posts, ID range, boundary flag, errors, next cursor, stop reason, and limitations.
- `evidence/state/{handle}.{method}.sqlite3`: authoritative posts, version snapshots, page provenance, errors, and resume state.
- `evidence/snapshots/{handle}.{method}.jsonl`: all distinct observed raw versions, keyed by message ID and SHA-256.
- `evidence/raw_html/{handle}/{sha256}.html`: full response bytes for public previews, including unsuccessful HTTP bodies.
- `evidence/logs/{handle}.{method}.requests.jsonl`: URL/status/hash/raw-path records for every request attempt. Redirects and error bodies are retained too.

Public post `raw_hash` hashes the serialized BeautifulSoup message fragment retained in `raw.html`; the full response hash hashes exact downloaded HTML bytes. Snapshots may differ because of counters/CDN URLs as well as edits. `raw.content_hash` excludes HTML wrappers/counters, but metadata URL changes can still affect it; neither snapshot count nor hash change alone proves an edit. Posts with unavailable media or invalid timestamps are retained with extraction-error metadata. Forward attribution is retained when visible; hidden forwards cannot be recovered. Media contains preview/download URLs, filename, displayed size, and duration when exposed; no media binaries are downloaded.

A valid public preview containing ID 1 establishes the oldest possible message-ID boundary. Otherwise, older pagination continues even if Telegram omits the older-page link, using the visible minimum ID as `before`. An empty older preview must have channel-history markup, no continuation link, and be empty again at the same cursor before it is recorded as a boundary. An initial empty preview, login/landing page, invalid parser result, fetch failure, or repeated/stalled pagination is **not** a proven boundary. `history_boundary_reached=true` is only the accessible public-web boundary and **never a claim of entire Telegram API history**. IDs need not be contiguous. Missing IDs are unknown gaps, not proven deletions. Restricted/unsupported/deleted/private/service posts may not be visible. Public completeness is always `public_web_only`, or `blocked` on an unavailable source.

HTTPS requests are fixed to `t.me`, reject nonpublic DNS and redirects to other origins, and have response-size limits. Retryable HTTP 429/5xx errors use exponential backoff and respect `Retry-After`. A wait exceeding the time budget is checkpointed as `not_before`; resume cannot skip it. Transient failures remain recorded even if later requests succeed. HTTP 200 alone is not a successful channel preview.

## Optional authorized Telegram API collector

No Telegram credentials are available in this build, so the API adapter is implemented and offline-tested but **not live-authorized or live-verified**. Bot API credentials do not provide arbitrary public-channel historical enumeration. This adapter requires a user session with permission to access the channel; it does not join channels or send messages.

Telegram instructs developers to obtain their own API ID/hash through [API development tools](https://core.telegram.org/api/obtaining_api_id), and warns against abuse. Follow [Telethon's signing-in guide](https://docs.telethon.dev/en/stable/basic/signing-in.html). API hashes, login codes, 2FA passwords, and `.session` files are secrets. Do not paste them into task messages, public logs, evidence, source control, or exports.

Perform authorization in **your own private interactive terminal**, not this unattended collector task:

```bash
python -m pip install beautifulsoup4 httpx 'telethon>=1.36,<2'
mkdir -p "$HOME/.config/awe-ti-telegram"
chmod 700 "$HOME/.config/awe-ti-telegram"
# Set API_ID and API_HASH privately, for example via a mode-600 environment file.
# Do not put literal secrets into a shell command that may be recorded in history.
set -a
. "$HOME/.config/awe-ti-telegram/private.env"
set +a
python scripts/collect_history.py authorize \
  --session "$HOME/.config/awe-ti-telegram/history-user"
```

Telethon prompts interactively for the user's phone, received login code, and optional 2FA password. A private session directory/file is created with restrictive permissions; no identity or login secrets are printed. Authorization is user-only; bot sessions are rejected. Session files must be separate from other applications and outside `research`, `evidence`, and `exports`. Protect the full `.session` file and associated SQLite files; never share them. Phone/code/2FA secrets are not command-line arguments.

After authorizing, in that same private environment:

```bash
python scripts/collect_history.py api GitHubRadar iirepresent sachkov_blog \
  --session "$HOME/.config/awe-ti-telegram/history-user" \
  --root "$HOME/awe-ti-authorized-output" \
  --max-pages 2000 --page-size 100 --max-seconds 1200 --delay 3.2
# Resume with the exact same private session and output root:
python scripts/collect_history.py api GitHubRadar iirepresent sachkov_blog \
  --session "$HOME/.config/awe-ti-telegram/history-user" \
  --root "$HOME/awe-ti-authorized-output" --resume --max-pages 2000 --max-seconds 1200
```

Use a **separate output root for the API run** so its `{handle}.jsonl` and coverage exports do not replace a public run. Choose which output set to ingest later. API pagination uses exclusive `offset_id` and batches of at most 100 messages. `FloodWaitError` is caught with Telethon automatic sleeping disabled; the exact server wait is persisted and slept without early retries, or the run stops incomplete when its time budget is insufficient. Coverage is `authorized_api` only for this collection method, not a promise that deleted or account-inaccessible history is recoverable. See [Telethon history pagination and flood limits](https://docs.telethon.dev/en/stable/modules/client.html#telethon.client.messages.MessageMethods.iter_messages).
