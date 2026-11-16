# AWE GROUP — Research Snapshot

> **Start with [PROJECT-INDEX.md](PROJECT-INDEX.md).** This repository is an AS-IS research kit, not an accepted production release. Independent R2 verdict: **REJECT / NOT CONFIRMED**; R3 is not started. Historical product documentation follows unchanged below.


A general-purpose autonomous multi-agent system capable of carrying out diverse digital missions: software engineering, research, content generation, data analysis, automation, and more.

## Architecture

```
USER
  → PROMPT MASTER      (structures the request into a verifiable specification)
  → USER APPROVAL      (explicit confirmation before any execution)
  → HEAD AGENT         (plans execution strategy, selects tools and agents)
  → MISSION MANAGER    (coordinates dynamic delegation — parallel & sequential)
  → SPECIALIZED AGENTS (researcher, coder, writer, analyst, devops, designer)
  → INDEPENDENT QA     (verifies outputs against acceptance criteria, scores 0-10)
  → VERIFIED ARTIFACT  (saved result with score and defect report)
```

## Setup

```bash
# Install dependencies
npm install

# Configure the separate Nox Runtime key outside the project, with mode 0600.
# The file must define ROUTER_CHEAP_API_KEY=<awe-nox-runtime secret>.
export AWE_RUNTIME_ENV_FILE=/home/nox/.config/awe-group/secrets/routercheap-nox.env

# Install Chromium for browser automation (optional)
npx playwright install chromium
```

## Offline verification

```bash
npm run typecheck
npm test
```

The test runner executes each regression suite in a fresh process with synthetic
credentials and a local-only model endpoint. Suites must use temporary workspaces;
they must not write to the real `.awe-data` or call paid external services.

## Usage

Production Nox Runtime requires the absolute `AWE_RUNTIME_ENV_FILE` above. It
loads that file with override semantics and clears `OPENAI_API_KEY`, so a
workspace `.env` or inherited OpenCode provider key cannot select Nox's model
credential. The offline test runner retains synthetic credentials and never
loads a production secret. Do not put provider secrets in mission artifacts.

The CLI/API execution and recovery entry points require a trusted host admission
policy, as described below. Mission approval records the specification's scope;
hosts must separately establish execution admission. Missing or stale policy,
qualification, or generation bindings stop before provider or local effects.
The guarded launcher also removes any inherited `AWE_OFFLINE_TEST`; production
cannot be switched to synthetic credentials or a workspace `.env` by ambient
shell state.

### One-shot mission
Use `scripts/run-nox-runtime.sh <command>` instead of a bare developer-shell
launch. It unsets inherited provider keys before starting Nox.
```bash
# Save a specification as pending_approval; do not start execution.
scripts/run-nox-runtime.sh run "Research the top 5 Node.js frameworks and write a comparison report" --no-approve

# Explicitly approve and start noninteractively (or omit --approve at a TTY for a y/N prompt).
scripts/run-nox-runtime.sh run "Research the top 5 Node.js frameworks and write a comparison report" --approve

# Recovery is deliberately separate from explicit retry/accept decisions.
scripts/run-nox-runtime.sh resume <mission-id>
scripts/run-nox-runtime.sh accept <mission-id> <intent-id> <artifact-id...> --operator <name> --note <evidence>
scripts/run-nox-runtime.sh retry <mission-id> <intent-id> --operator <name> --note <why-a-repeat-is-authorized>
```

### Interactive CLI
```bash
scripts/run-nox-runtime.sh cli
```

Execution additionally requires a trusted host qualification policy. Provide
the absolute path in `AWE_MISSION_ADMISSION_MODULE`; that module must export
`resolveMissionAdmission(mission)`. It returns a specification-bound product
admission authority or an explicitly bounded engineering-practice policy.
Without it, execution stops before Head. Request bodies, model text and mission
metadata cannot supply the resolver, issue qualifications or select practice
mode. The host module performs authentication; stored hashes bind evidence but
are not authentication credentials.

### REST API server
```bash
export AWE_API_SECRET='replace-with-a-local-secret'
scripts/run-nox-runtime.sh serve
# → http://127.0.0.1:3420
```

`AWE_API_SECRET` is required. Sensitive reads and mutations require the same key
in `X-API-Key` or `Authorization: Bearer ...`. The listener defaults to loopback;
non-loopback binding and CORS require explicit configuration, and wildcard CORS
is refused.

#### API endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/specify` | Create specification from natural language |
| POST | `/missions/:id/approve` | Approve and start execution |
| POST | `/missions/:id/resume` | Resume a paused or pre-run interrupted approved mission |
| POST | `/missions/:id/recovery/accept` | Accept an ambiguous outcome with verified artifact evidence |
| POST | `/missions/:id/recovery/retry` | Explicitly authorize a possible repeated effect |
| GET | `/missions` | List all missions |
| GET | `/missions/:id` | Mission details |
| GET | `/missions/:id/artifacts` | Mission artifacts |
| GET | `/missions/:id/logs` | Execution logs |
| POST | `/missions/:id/cancel` | Cancel mission |

## Stack

- **Runtime**: Node.js 22 + TypeScript
- **Agent framework**: [Mastra](https://mastra.ai) v1.82 (tool-calling, workflows, MCP)
- **Models**: Router.Cheap (`claude-opus-5-5` for planning/QA, `deepseek-v4-flash` for fast research, with explicit trusted host overrides)
- **Storage**: JSON files + SQLite (`.awe-data/`) — missions, artifacts, logs, memory
- **Browser**: Playwright via MCP (`@playwright/mcp`) — graceful fallback if unavailable

## Tools available to agents

| Tool | Description |
|------|-------------|
| `shell` | Run shell commands, scripts, build tools |
| `file_read` | Read files from workspace |
| `file_write` | Write files, optionally register as artifact |
| `file_list` | List directory contents |
| `web_fetch` | HTTP GET/POST to validated public network destinations |
| `web_search` | DuckDuckGo search (JSON API + HTML fallback) |
| `web_extract` | Readable text extraction from HTML pages |
| `save_artifact` | Save named output artifact |
| `capability_library` | Optional read-only search of 4,466 deduplicated, unvetted capability candidates (4,504 source rows) |
| `browser_navigate` | Navigate browser to URL (Playwright MCP) |
| `browser_screenshot` | Capture page screenshot |
| `browser_click` | Click element by CSS selector |
| `browser_type` | Type text into input field |
| `browser_get_text` | Extract visible page text |

### Optional capability library

`capability_library` is disabled by default (`UCL_ENABLED=0`). Set `UCL_ENABLED=1`
and optionally `UCL_DB` to use the delivered `data/db/ucl.sqlite`. The host must
also approve `capability_library` in a mission specification before an agent can
call it. The acquisition probe consults it first when granted, but a catalogue
alone cannot authorize acquisition: at least one other investigation tool and
`save_artifact` remain mandatory.

Results are research metadata only (`UNVETTED`, `approved:false`,
`execution_authority:false`). They cannot install, execute or grant a candidate.
A proposed local executable additionally requires trusted host qualification of
its canonical path, exact bytes and fixed arguments, backed by real probe
artifacts. Shell release revalidates qualification and bytes and records the
actual invocation; a model's `acquired` text or claimed receipt is not a grant.
Hazardous rows additionally require the host-only `UCL_ALLOW_HAZARDOUS=1` flag.
The index is opened read-only and checked against its catalogue provenance,
entity counts and complete delivered SHA-256; foreign, corrupt, stale and
count-preserving modified indexes fail closed without affecting Nox mission memory. Disable it with `UCL_ENABLED=0` or roll back the whole
integration by returning to commit `bd3859a550a046c16454f44ddc2648c81318f14e`.

#### Second consumer: the same library over MCP

`src/ucl-mcp/main.ts` exposes the same index, through the same `src/ucl`
librarian, to OpenCode or any other MCP client, as the stdio server `awe-ucl`:

```bash
npx tsx src/ucl-mcp/main.ts      # speaks MCP on stdin/stdout
```

It offers `capability_search` and `capability_inventory`, needs no provider key
and no network, opens the index read-only, and returns the same payload shape and
the same `approved:false` / `execution_authority:false` markers as the in-process
tool. The two consumers never share credentials: a mission's provider key comes
only from `AWE_RUNTIME_ENV_FILE`, and the MCP server holds none. See
`docs/ucl-two-consumers.md`. The regression `src/tests/r2-ucl-mcp.test.ts` drives
the server as a real child process and asserts that both consumers rank
identically over the delivered index.

## Security

- Path traversal protection on file tools (workspace-bounded)
- Mission-scoped descriptor-relative direct file access; supported shell work is
  confined to an allowlisted mounted tree. Existing delegated Linux cgroups and
  inherited rlimits bound memory, tasks, CPU, file size, descriptors and wall time.
- Deny-by-default tool grants and ownership/abort fencing
- Guarded shell execution; on Linux, detached process groups are durably registered and reclaimed before confirmed cancellation/recovery
- Required API authentication via `AWE_API_SECRET`; loopback-only listener and no CORS by default
- Atomic file writes (tmp + rename) prevent corruption
- API keys redacted from error messages
- Log injection sanitization
- Model usage that a provider does not report remains `UNKNOWN`; SDK invocation
  records do not reconstruct transport retries, embeddings calls or dollar cost.

The host filesystem and resource boundary has explicit prerequisites and limits.
See `reports/R1-P0-ACCEPTANCE.md` and
`reports/r1-p0-fs-boundary-resolution.md` for the tested scope, including the
unsupported unrestricted-host ancestor-relocation case and the absence of an
aggregate persistent disk quota.

## Roadmap

- [ ] MCP server registry and dynamic tool discovery
- [ ] Parallel agent execution (delegations with `parallel: true`)
- [ ] Windows computer-use
- [ ] Image generation and visual verification
- [ ] Cloud deployment
- [ ] PostgreSQL storage for production use
