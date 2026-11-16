# Compatibility report — UCL against Nox R2 live source

**Snapshot under test:** `nox-r2-integration-snapshot`, captured **2026-11-15T04:01:39Z**,
Git HEAD `68cc0ee20a25991ea275512e20ac521cc8f8234b`, branch `r1/dev`, working tree dirty
(27 unstaged tracked paths, 41 untracked status entries), 189 source files.

**Status: `COMPATIBLE_WITH_SNAPSHOT_REVISION`.** This is not a claim about any later
revision. R2 development may have continued after 04:01 UTC; re-run the checks in
§7 against whatever revision is final.

Integrity: all 193 entries in `SHA256SUMS` verified byte-for-byte before any work.

---

## 1. The headline finding: the old integration point is gone

The previous library version targeted `createDiscovery()` / `createNoxAdapter()`
from `awe/tool_registry/discovery.mjs` (`failm3/awe-group-runtime@d5e9d857`).

**That module does not exist in the R2 snapshot.** `grep -rn createDiscovery` over
189 files returns nothing. The runtime was also rewritten: it is TypeScript + Mastra,
not `.mjs` with hand-rolled ports.

So the previous package's `INTEGRATION_PENDING_LIVE_SOURCE` was the correct status,
and the adapter contract it described is now historical. Nothing in the old adapter
is reused. The library underneath (registry, importer, Librarian, blueprints,
qualification model) is unaffected and carries over intact.

---

## 2. What the real architecture turned out to be

Read directly from the snapshot, with file references.

| Concern | Real implementation | Where |
| --- | --- | --- |
| Tool registry | `allTools` — Mastra `createTool` objects, keyed by tool name | `src/tools/index.ts:973` |
| Tool authorization | `assertToolAllowed(name)` reading `allowedTools` from `AsyncLocalStorage` | `src/security/tool-context.ts:39` |
| Grant origin | Only `mission.metadata.specification.suggested_tools` | `src/agents/mission-manager.ts:521` |
| Schema binding | `assertApprovedSpecBinding` — immutable approved snapshot | `src/utils/spec-binding.ts` |
| Capability acquisition | `CapabilityDecision acquire\|replan\|blocked`, one bounded probe, then replan | `src/agents/mission-manager.ts:2204-2320` |
| Capability vocabulary | `availableCapabilities(knownTools)` = keys of the registry | `src/agents/capability-plane.ts:74` |
| Planner | `headAgent` + `PlanMissionWithCapabilities` | `src/agents/head-agent.ts:1-244` |
| Qualification / admission | `QualificationHostPolicy` (issuers, `authenticateIssuer`, `authorize`); `MissionAdmissionPolicy` | `src/utils/qualification.ts:1-263`, `src/utils/mission-admission.ts` |
| Persistence | `@mastra/libsql` pinned; state under `AWE_DATA_DIR` (default `<cwd>/.awe-data`) | `package.json`, `src/utils/storage.ts:15` |
| MCP | `@mastra/mcp` `MCPClient` with stdio transport for Playwright | `src/config/mcp.ts` |
| Node / TS | no `engines` pin; `@types/node` 22.15.32; TypeScript 5.8.3, `tsc` → `dist`, NodeNext | `package.json`, `tsconfig.json` |

Two corrections to what the previous package asserted about Nox, both now false:

1. **"Nox forbids dependencies structurally."** False for R2. `package.json` has 15
   runtime dependencies. That constraint belonged to the old published baseline.
2. **"Nox registry is Postgres / LibSQL per the brief."** `@mastra/libsql` is pinned
   and `AWE_DATA_DIR` holds file-based state; there is no Postgres in this snapshot.
   The brief's LibSQL statement is closer to right than my earlier report.

---

## 3. The integration design, and why it is the smallest one

Nox already has a capability-acquisition loop: the Head returns
`status="acquire"`, the Manager runs exactly one bounded probe delegation with
already-approved tools, requires a single hash-bound observation artifact, then
replans. **That loop is the product feature the library serves.**

So the library must be an **advisory index the existing loop can consult**, not a
permission system, not a planner, not a registry replacement. Concretely:

- One Mastra tool, `capability_library`, added to `allTools`.
- It calls `assertToolAllowed("capability_library")` exactly like every other tool,
  so a mission that was not granted it cannot call it. Grants still come only from
  the approved specification. **No second authorization surface exists.**
- It returns metadata and evidence only. `approved: false` and
  `execution_authority: false` are literal types, so a consumer cannot mistake a
  candidate for a grant.
- It never installs, downloads, executes, qualifies or admits anything.

**Integration footprint:** 2 edited lines in `src/tools/index.ts` (one import, one
registry entry), 2 added tsconfig flags, 1 new tool file, plus the library copy.
That is the whole delta against Nox. Nothing else in Nox is touched.

### Why the tsconfig flags are needed, and why they are safe

The library imports its own modules as `./db.ts` (TypeScript's own recommended style
under `allowImportingTsExtensions`). Nox compiles with `tsc` under `NodeNext` and
emits `.js`, so `.ts` specifiers are rejected there:

```
src/ucl/librarian.ts(2,24): error TS5097: An import path can only end with a '.ts'
extension when 'allowImportingTsExtensions' is enabled.
```

Two flags resolve it with **zero source edits** to the library:

```jsonc
"allowImportingTsExtensions": true,          // permit the specifiers
"rewriteRelativeImportExtensions": true      // emit "./db.js" in compiled output
```

`rewriteRelativeImportExtensions` requires TypeScript ≥ 5.7; Nox pins 5.8.3, so it
is available. Verified end to end: compiled `dist/ucl/librarian.js` contains
`from "./classify.js"` and **zero** remaining `.ts` specifiers, and the compiled
build executes (`search` → 3 hits, `NOT_FOUND` on a stopword query).

The alternative — rewriting ~40 import statements across 12 files — was rejected:
it would fork the library from its own test suite for no benefit.

---

## 4. What was verified, and how

Everything below was run in an isolated copy (`/workspace/nox-exp`, then re-proved
from a **fresh** extraction of the snapshot with only the patch applied). No Nox
working tree, database, checkpoint, mission or grant was touched. `npm ci` installed
347 packages into the isolated copy only.

| # | Check | Result |
| --- | --- | --- |
| 1 | Snapshot integrity, 193 files | **PASS** — all `SHA256SUMS` match |
| 2 | Nox baseline before any change | 32 suites pass, 11 fail — all 11 are **environment**, see §6 |
| 3 | Library compiles under Nox's real config, unmodified | **FAIL → expected** (TS5097), documented in §3 |
| 4 | Same, with the two flags | **PASS** — no errors beyond the pre-existing `career-01` one |
| 5 | Emitted JS has no `.ts` specifiers, executes correctly | **PASS** |
| 6 | Patch applies to a fresh snapshot extraction | **PASS** — 16 files, no stray paths |
| 7 | `tsc --noEmit` after patch | **PASS** — only the pre-existing error |
| 8 | Bridge contract + negative suite, under Nox's own runner | **PASS** — 10/10 **after copying `data/source/` or `data/db/` into the tree (required)**. With no data present the suite now fails loudly instead of skipping all 10 and looking green |
| 9 | Whole Nox offline suite with the bridge added | **33 pass / 11 fail**; failure set byte-identical to the pristine baseline, +1 new passing suite |
| 9b | `import allTools` with `UCL_ENABLED` unset | **PASS** — `node:sqlite` is not loaded (lazy import); registry loads with no ExperimentalWarning |
| 9c | `UCL_DB` pointed at a foreign SQLite file | **PASS** — refused (`UCL_NOT_A_UCL_INDEX`), no tables created, file unchanged |
| 10 | Hostile input (injection, SQL fragments, bad tags/kinds, absurd limit) | **PASS** — all rejected or abstained; `approved:false` in every path |
| 11 | Index immutability during lookups | **PASS** — SHA of the db file unchanged after repeated queries |
| 12 | Verified Agent Blueprints survive | **PASS** — save → find → `REUSE` in scope, `ADAPT` out of scope, `inherited_grants: []` |
| 13 | Tool visible to Head's `REGISTERED CAPABILITIES` | **PASS** — listed automatically from `Object.keys(allTools)` |

The pre-existing typecheck error is `src/index.ts(432,50): Cannot find module
'./missions/career-01.js'`. `src/missions/` is excluded from the snapshot; the file
is absent, not broken by this work.

---

## 5. Where the library does **not** plug in

> Note: the acquisition-probe line below is now an **opt-in one-line patch**
> (`optional-acquisition-wiring.patch`). Everything in this table still holds for
> the default patch.


Stated plainly, because each was a candidate and each was rejected as a second
system of record.

| Not integrated | Why |
| --- | --- |
| Acquisition probe tool list (`mission-manager.ts:2216`) | **Now wired, as a separate opt-in patch** (`optional-acquisition-wiring.patch`, one line). It is a behaviour change in Nox, so it is not in the main patch; evidence is in §9. |
| Qualification / admission | Nox owns `QualificationHostPolicy`. The library's receipts are for *catalogue* metadata and never substitute for Nox admission. |
| Mission Manager / Head / scheduler | Nox owns planning. The Library never plans, queues or delegates. |
| Persistence | Separate SQLite file. `AWE_DATA_DIR` and LibSQL are untouched. |
| Prompt Master's `suggested_tools` example list | It is an example, not a whitelist. The real gate is `approvedToolGrants`. |

---

## 6. The 11 failing Nox suites are environmental

Recorded because a reader will run the suite and see red.

| Missing in this container | Affected suites | Error |
| --- | --- | --- |
| `bwrap` (bubblewrap) | `r1-shell-isolation`, `r1-web-product`, `r0-closure-adapters`, `r0-reqa-adapters`, `r1-parallel-artifacts` | `Detached child has no usable PID` |
| `/usr/bin/systemd-run` | `r1-resource-limits` | `ENOENT … /usr/bin/systemd-run` |
| `research/` excluded from snapshot | `r1-csv-analytics`, `r0-independent-contracts` | `ENOENT … ANALYTICS-CONTRACT.md` |
| `src/missions/` excluded from snapshot | typecheck only | `Cannot find module './missions/career-01.js'` |
| `/tmp/opencode` not present | 6 suites before `mkdir -p /tmp/opencode` | `ENOENT mkdtemp /tmp/opencode/…` — **this is a Nox portability defect**, not my environment (independent QA confirmed it): those tests hard-code a host path |

Creating `/tmp/opencode` alone moved the baseline from 26 → 32 passing suites.

Of the remaining 11, independent QA confirmed **7 as environmental** and classified
**4 as probable but not proven** (`r0-closure-adapters`, `r0-reqa-adapters`,
`r1-parallel-artifacts`, `r1-shell-isolation` — they exercise the shell sandbox,
which needs binaries absent here, but the code path was not traced). So the correct
statement is **"consistent with environment", not "proven environmental"**. No
failure points at a Nox logic defect, and none is caused by the bridge: the failure
set is byte-identical with and without it.

One genuine Nox finding falls out of this: six of its own tests hard-code a
`/tmp/opencode` path, so the suite is not portable to a host without that directory.
That is a Nox defect, reported as such, not something this patch introduces.

---

## 7. How to re-verify against a newer revision

```bash
# 1. Fresh extraction, never the live tree
tar -xzf nox-r2-integration-snapshot.tar.gz && cd nox-r2-integration-snapshot
sha256sum -c ../SHA256SUMS

# 2. Apply the bridge
patch -p1 < /path/to/nox-r2-ucl-bridge.patch

# 3. Dependencies, offline-safe
npm ci

# 4. Types must show no NEW errors (the career-01 one is a snapshot artifact)
npx tsc --noEmit

# 5. Use the shipped index, or rebuild it from the shipped catalogue
mkdir -p data/db && cp /path/to/delivery/data/db/ucl.sqlite data/db/ucl.sqlite
# or:
# node src/ucl/cli.ts import --db data/db/ucl.sqlite \
#   --catalog /path/to/delivery/data/source/all-records-classified.json \
#   --expect-sha 5a83c501b290b83a17f6ffaeb0fe9cae772e26be7a6a4c5cbcb948908fc76b56
node scripts/run-offline-tests.mjs src/tests/ucl-bridge.test.ts   # 10/10, after step 5 (data copy is required)

# 6. Whole suite — compare the FAIL set, not the count
node scripts/run-offline-tests.mjs
```

If step 4 shows errors referencing `createDiscovery`, `awe/tool_registry` or `.mjs`
ports, the architecture moved again and §3 must be redone before this patch is used.

---

## 7b. Dead modules in the shipped library (reviewed, kept on purpose)

`src/ucl/qualification.ts`, `src/ucl/submission.ts` and `src/ucl/nox-adapter.ts` are
the old published-runtime adapter. **They are not reachable from the tool**: its
runtime import graph is exactly `canonical`, `classify`, `db`, `librarian`,
`types` (verified transitively). They remain in the tree because the library's own
CLI (`src/ucl/cli.ts`) uses them for operator commands.

Keeping them costs nothing at runtime but does mean a reviewer will find a second
Ed25519 receipt implementation sitting beside Nox's own `utils/qualification.ts`.
It grants nothing and is never called by Nox. If you prefer a trimmed copy with
only the five modules the tool needs, that is a one-line change to which files the
patch copies — say so and it will be produced.

## 8. Honest residue

- **Proven against one revision.** 2026-11-15T04:01:39Z only.
- **Not run against the live tree**, by instruction. No patch applied to OpenCode or
  the real working directory.
- **Node version parity unproven.** The suite ran on Node 22.23.1; Nox pins no
  `engines` field, only `@types/node` 22.15.32. `node:sqlite` is Stability 1.2 (RC),
  so re-verify on the host's actual Node before release.
- **`node:sqlite` types.** Present in `@types/node` 22.15.32, so the library
  typechecks under Nox's dependency set as installed here.
- **The tool is not in the acquisition probe unless the owner applies the
  optional one-line patch.** Verified consequence: `capability-loop` passes 23/23
  with it, and the suite stays identical without it. That is the owner's decision
  because it changes Nox behaviour.
