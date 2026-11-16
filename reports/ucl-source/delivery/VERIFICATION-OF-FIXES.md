# R2 bridge — fixes for the independent QA findings (self-verified by the builder)

> This file is written by the builder, not by QA. It is evidence, not an independent
> verdict. Independent re-verification of these fixes is pending.

A separate session verified the R2 bridge package and found one major packaging
defect and three issues. This note records the re-verification of the fixes.
The full first-round report is in `INDEPENDENT-QA-R2.md`; this file does not
replace it and does not re-argue its verdict.

**Status:** independent re-check round 2 confirmed F1, F2 and F7 fixed and found
that F4 was not (recorded below as F10), plus F11 and F12. F10 and F12 were fixed
and independently re-checked in round 3: **PASS_WITH_FINDINGS**, all five claims
confirmed on a rebuilt snapshot, and the whole suite with the wiring patch applied
verified at 33/11 for the first time. See `INDEPENDENT-QA-R2.md`, last section.

---

## Fixes, and how each was re-proved

### F1 (MAJOR) — the registry loaded `node:sqlite` at import time

**Was:** `tools/index.ts` → `ucl-search.ts` → `ucl/db.ts` → `node:sqlite`,
statically. Any process importing `allTools` printed an ExperimentalWarning even
with `UCL_ENABLED` unset, so "flag off = host unaffected" was false at import.

**Now:** `ucl-search.ts` imports only `import type { Store }` (erased at compile
time) and does `await import("../ucl/db.js")` / `await import("../ucl/librarian.js")`
**inside `execute()`, after the flag check**.

**Evidence:** compiled tree, `env -u UCL_ENABLED`, importing the full registry:

```
registered: true | node:sqlite loaded: false
```

`process.moduleLoadList` contains no sqlite entry, and no ExperimentalWarning is
printed.

### F2 (MINOR) — DDL ran on every open; a foreign file was given 28 tables

**Was:** `openStore` executed the schema DDL unconditionally; the declared
`readOnly` option was never read.

**Now:** `openStore({ path, readOnly: true })` opens with
`new DatabaseSync(path, { readOnly: true })`, skips the DDL entirely, and validates
the file is a UCL index by reading `ucl_meta.schema_version`; on a mismatch it
throws `UCL_NOT_A_UCL_INDEX` / `UCL_SCHEMA_VERSION_MISMATCH`. The tool always opens
read-only.

**Evidence:** a SQLite file created outside the library, used as `UCL_DB`:

```
{"status":"ERROR","approved":false,"auth":false}
before=392ef3d6a7947cbf after=392ef3d6a7947cbf
tables: notes
```

Byte-identical before and after; no tables added; the pre-existing table untouched.

### F3 (MAJOR) — the tool was unreachable from the acquisition loop

**Was:** `mission-manager.ts:2216` hard-coded the probe's tool list, so
`capability_library` could never be called from the loop it is meant to inform.

**Now:** two paths, deliberately separated.

1. **Planning (default patch).** The Head sees the tool in
   `REGISTERED CAPABILITIES` automatically, because that list is
   `Object.keys(allTools)`.
2. **Inside the probe (opt-in).** `optional-acquisition-wiring.patch` — one line
   adding `capability_library` to the probe array. It stays outside the main patch
   because it changes Nox behaviour, which is the owner's decision.

**Evidence:** with the opt-in patch applied to a fresh snapshot:
`tsc` clean, `capability-loop` **23/23 pass**, whole suite still **33/11**
(failure set identical). Without it, `capability-loop` passes as it always did.

### F4 (MAJOR) — the bridge suite failed under Nox's own runner

**Was:** the suite defaulted to `/tmp/ucl-smoke.sqlite`, which nothing created, so
`npm test` gained a new red suite (5/10 under the runner).

**Now:** the suite resolves an index in strict order — `UCL_TEST_DB`, then
`data/db/ucl.sqlite` inside *this* tree, then a catalogue at
`data/source/all-records-classified.json` inside *this* tree, which it imports into
a scratch index. No `/tmp` path is consulted.

**Correction after independent re-check (F10).** My first version also probed
`/tmp/ucl-smoke.sqlite`. My run showed 10/10 only because a **previous run had left
that file behind**; on a clean machine the same suite executed nothing and the
runner still printed `PASS`. QA was right. Two changes follow: the `/tmp` fallbacks
are gone, and a missing index is now a **failure**, not a skip.

**Evidence — three scenarios, fresh snapshot + patch,
`env -u UCL_TEST_DB -u UCL_ENABLED -u UCL_DB`, `/tmp` debris deleted first:**

| Tree state | Result |
| --- | --- |
| no `data/` at all | `# tests 11 / pass 0 / fail 1 / skipped 10` — suite **FAILS** with "bridge suite needs an index: copy delivery data/ into this tree" |
| catalogue only (`data/source/`) | `# tests 10 / pass 10 / fail 0 / skipped 0` |
| prebuilt index (`data/db/ucl.sqlite`) | `# tests 10 / pass 10 / fail 0 / skipped 0` |

Under `node scripts/run-offline-tests.mjs` with no data the runner now prints
`=== ucl-bridge: FAIL ===` and `Offline suites: 0 passed, 1 failed`.

**The data copy is a required documented step**, in README quick check, §4 of this
file and the integration guide. The patch deliberately ships no 5.4 MB catalogue.

Whole suite on the patched tree: **33 passed, 11 failed**; the failure list is
byte-identical to the pristine baseline (`diff` empty).

### F7 (MINOR) — `include_hazardous` was model-settable with no host gate

**Now:** a model's `include_hazardous` is honoured only when the host sets
`UCL_ALLOW_HAZARDOUS=1`. Otherwise it is ignored and hazardous rows stay hidden.

**Evidence:** new assertion in the bridge suite. Without the variable,
20 results contain **0** hazard-flagged rows even with `include_hazardous: true`;
with it, hazard rows appear but remain `UNVETTED` and `approved: false`.

### F12 (MINOR, round 3) — read-only open still wrote `-shm`/`-wal` sidecars

**Was:** the index was built in WAL mode, so even a read-only lookup created
`ucl.sqlite-shm` and `ucl.sqlite-wal` next to it, and in a read-only directory the
lookup failed with `attempt to write a readonly database`.

**Now:** `db.ts` builds in `journal_mode = DELETE`, and the shipped
`data/db/ucl.sqlite` was converted to DELETE mode (its sha256 changed for that
reason only; see `MANIFEST.sha256`).

**Evidence:** index copied to a `0555` directory as a `0444` file; the
`capability_library` tool, run with a granted mission context, returned
`status OK, 2 candidates, approved false`. The directory afterwards held only
`ucl.sqlite`, and its sha256 was unchanged
(`ef2bee5e689d484b86c2dbff0138347cb5f6e1a5f9a4dcd45c58aef51e39e1be`).

### F11 (NOTE, round 3) — the opt-in wiring patch changes one gate

`optional-acquisition-wiring.patch` is opt-in and not part of the main patch. QA
found, and I accept, that with it applied an approved tool set of exactly
`[save_artifact, capability_library]` now **proceeds** into an acquisition
delegation at `mission-manager.ts:2216`, where before it was blocked by the
`tools.length === 1` check. That delegation has no network, file or shell tool, so
it is not an authority escalation, but it is a behaviour change the owner must
accept knowingly before applying the wiring patch. Other approved sets QA tried
are unchanged.

### Final run after round 3

Fresh snapshot + main patch (with the F10 and F12 changes), `/tmp` debris removed,
`env -u UCL_TEST_DB -u UCL_ENABLED -u UCL_DB`, prebuilt index in `data/db/`:
`tsc --noEmit` shows only the pre-existing `career-01.js` error; the whole offline
suite gives **33 passed, 11 failed**, with `ucl-bridge` at 10/10 and 0 skipped.

---

## Findings accepted, not fixed (and why)

| Finding | Decision |
| --- | --- |
| **F5** — `qualification.ts`, `submission.ts`, `nox-adapter.ts` ship as dead code in Nox's `src/` | **Partially addressed by documentation, not deletion.** They are the old published-runtime adapter and are not reachable from the tool: its runtime import graph is exactly `canonical`, `classify`, `db`, `librarian`, `types`. They remain only because `cli.ts` (operator tooling) uses them. Deleting them would break the library's own CLI and its 56-test suite for no Nox-side benefit. `README` states this. If the owner prefers a trimmed copy in Nox, that is a packaging choice, not a correctness one. |
| **F6** — planner prompt exposure unverified | Not verifiable without a model call. The planner sees the tool name in `REGISTERED CAPABILITIES`; whether it elects to use it is model behaviour. Recorded as unproven. |
| **F8** — emitted `.d.ts` keep `.ts` specifiers in 8 files | Harmless: only `.js` are loaded at runtime and they are clean. Fixing means post-processing declarations; not worth a new build step. Recorded. |
| **F9** — `tool_id` returns `cap_…`, not `tool_…` | Intentional: these are catalogue ids, not Nox grant names. Confusing the two would be worse. Recorded. |

---

## Baseline reading, corrected per QA

QA's challenge was right on one point and I am changing the report accordingly:

- Six suites hard-code `mkdtemp` under `/tmp/opencode`. Without that directory the
  pristine baseline is **26/17**, not 32/11. That is a small **Nox portability
  defect**, not my environment, and the report now says so.
- After `mkdir -p /tmp/opencode`, the baseline reproduces exactly at **32/11**.
- Of the 11 remaining: **7 confirmed environmental** (missing `bwrap` /
  `/usr/bin/systemd-run`; `research/` excluded from the snapshot);
  **4 probable but not proven** (`r0-closure-adapters`, `r0-reqa-adapters`,
  `r1-parallel-artifacts`, `r1-shell-isolation`). No failure points at a Nox logic
  defect, but I cannot claim one is excluded for those four.

The compatibility report is worded "consistent with environment", not "proven",
per QA's instruction.

---

## What remains unverified

- Anything newer than snapshot `68cc0ee2` (04:01 UTC).
- `src/missions/` (absent from the snapshot).
- Behaviour under a real model: whether the planner actually consults the tool.
- Node versions other than 22.23.1.
- `capability-plane.ts`, `utils/qualification.ts` beyond its policy shape,
  `utils/storage.ts` — QA also left these unverified.
