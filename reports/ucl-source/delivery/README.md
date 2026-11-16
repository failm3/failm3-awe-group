# Unified Capability Library — Nox R2 integration package

A compatibility package for the **live Nox R2 source**, not the old published
runtime. Read `COMPATIBILITY-REPORT.md` first: the integration point the previous
version targeted no longer exists, and this package explains what replaced it.

**Status: `COMPATIBLE_WITH_SNAPSHOT_REVISION`**
Snapshot `2026-11-15T04:01:39Z`, HEAD `68cc0ee20a25991ea275512e20ac521cc8f8234b`,
branch `r1/dev`, 189 source files, all 193 checksums verified.

---

## What is in here

| Path | What it is |
| --- | --- |
| `nox-r2-ucl-bridge.patch` | The complete change against Nox. 16 files, applies cleanly to a fresh extraction, reverts byte-identically. |
| `COMPATIBILITY-REPORT.md` | What the real architecture is, what was verified, what fails and why, what is not claimed. |
| `INTEGRATION-R2.md` | Install, feature flag, rollback, staged rollout, limitations. |
| `data/source/` | The catalogue the importer reads (`all-records-classified.json`, 5.4 MB) plus its own audit files. |
| `data/db/ucl.sqlite` | A pre-built index: 4,504 source rows, 4,466 unique entities, ready to use. |
| `optional-acquisition-wiring.patch` | One-line opt-in: lets the acquisition probe consult the library. Not applied by default. |
| `INDEPENDENT-QA-R2.md` | Independent verification, written by a separate session that did not build this. Verdict: PASS_WITH_FINDINGS. |
| `VERIFICATION-OF-FIXES.md` | The builder's own evidence for the fixes, finding by finding. Not an independent verdict. |

---

## The change, in one table

| File | Change |
| --- | --- |
| `src/tools/ucl-search.ts` | **new** — the `capability_library` Mastra tool |
| `src/ucl/*` | **new** — the library, 12 modules, unmodified apart from location |
| `src/tests/ucl-bridge.test.ts` | **new** — 10 contract and negative tests |
| `src/tools/index.ts` | **+2 lines** — one import, one registry entry (lazy; no `node:sqlite` load at import) |
| `tsconfig.json` | **+2 lines** — `allowImportingTsExtensions`, `rewriteRelativeImportExtensions` |

No change to Mission Manager, Head, Prompt Master, tool context, qualification,
storage, `.env`, missions, checkpoints or grants.

---

## Why the tool, and why nothing more

Nox already has the capability-acquisition loop this library serves: the Head
reports a gap, the Manager runs one bounded probe with already-approved tools, then
replans. The library does not replace any of that. It is an **advisory index** the
planner can consult, exposed as one tool gated by the same `assertToolAllowed()`
as `web_search`.

It cannot grant, admit, install or execute. Its output carries `approved: false`
and `execution_authority: false` as literal types, and every candidate is
`UNVETTED`. The path from "exists in the catalogue" to "Nox may run it" is still
entirely Nox's.

---

## Quick check (data required)

```bash
# 1. Clean extraction — never the live tree
tar -xzf nox-r2-integration-snapshot.tar.gz && cd nox-r2-integration-snapshot
sha256sum -c ../SHA256SUMS

# 2. Apply
patch -p1 < /path/to/nox-r2-ucl-bridge.patch
npm ci

# 3. Types: no NEW errors (the ./missions/career-01.js one is a snapshot artifact)
npx tsc --noEmit

# 4. Index + bridge suite — the data copy is REQUIRED, the patch does not ship data/
mkdir -p data/db && cp /path/to/delivery/data/db/ucl.sqlite data/db/
node scripts/run-offline-tests.mjs src/tests/ucl-bridge.test.ts   # 10/10

# Without data/ the suite FAILS loudly ("bridge suite needs an index").
# It never reports a suite that executed nothing as passing.
```

Full steps, flag, rollout and rollback: `INTEGRATION-R2.md`.

---

## Measured results

| Check | Result |
| --- | --- |
| Snapshot integrity | 193/193 checksums match |
| Library compiles under Nox's config, unmodified | **fails** (TS5097) — expected, see report §3 |
| Same, with the two flags, zero source edits | **passes** |
| Emitted JS free of `.ts` specifiers, executes correctly | **passes** |
| Patch on fresh extraction, `tsc --noEmit` | **passes**, no new errors |
| Bridge contract + negative suite | **10/10** under Nox's runner, after copying `data/` (required step) |
| Independent QA round 2 | PASS_WITH_FINDINGS — F1, F2, F7 confirmed fixed; F4 held open (F10). Fixed in round 3, builder-verified |
| Independent QA round 3 (F10, F12 fixes) | **PASS_WITH_FINDINGS** — all five claims confirmed on a fresh snapshot; wiring-patch suite also verified 33/11 |
| `import allTools` with flag off | `node:sqlite` not loaded |
| Foreign file as `UCL_DB` | refused, no tables written |
| Whole Nox offline suite, before → after | 32 → 33 passing; **failure set identical** |
| Hostile input, absurd limits, bad tags, SQL fragments | all rejected or abstained |
| Index immutability during lookups | unchanged SHA |
| Verified Agent Blueprints | save → find → `REUSE` in scope, `ADAPT` out of scope |
| Patch apply → revert | tree byte-identical to snapshot |

The 11 failing Nox suites are environment-only (no `bwrap`, no
`/usr/bin/systemd-run`, snapshot excludes `research/` and `src/missions/`), and the
set is identical with and without this patch. Report §6 lists each one.

---

## Honest limits

- Proven against **one revision**, 04:01Z on 2026-11-15. R2 may have moved since.
  Report §7 gives the commands to re-check.
- **Not applied to the live tree**, by instruction. Nothing in
  `/home/nox/awe-group-cleanroom-20261112` was read from here or written to.
- **Node parity unproven:** tested on Node 22.23.1; Nox pins no `engines` field and
  `node:sqlite` is RC. Re-verify on the host.
- **Acquisition-probe wiring is a separate opt-in patch.** It is one line
  (`optional-acquisition-wiring.patch`); `capability-loop` passes 23/23 with it.
  Left out of the default because it changes Nox behaviour.
