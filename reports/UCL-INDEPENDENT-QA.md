# Independent UCL integration QA

Base: `bd3859a550a046c16454f44ddc2648c81318f14e`

## Verdict after bounded repair

**PASS for the bounded optional advisory integration. This is not R3 readiness
and not evidence of verified candidate reuse.**

Independent read-only reviewers found no authority-escalation path, active
second control plane, or regression in the corrected F11 acquisition gate.
They also confirmed that grants are checked before feature/index access,
SQLite loading is lazy, hazardous rows require host opt-in, and all result
branches retain `approved:false` and `execution_authority:false`.

## Findings and disposition

### Major: count-preserving catalogue tampering

The initial `assertIndexFresh()` checked stored provenance and row counts but
did not authenticate row contents. A temporary copy with a modified title or
`trust_state` could therefore be returned as though it were the delivered
snapshot.

**Resolved:** `src/ucl/db.ts` now hashes the complete SQLite file and compares
it with the delivered SHA-256. `src/tests/ucl-bridge.test.ts` modifies title
and `trust_state` without changing counts and verifies `ERROR`, no candidates,
no authority, unchanged bytes and no WAL/SHM sidecars. A separate read-only
re-review returned **PASS, no new blocker**.

### Low: live checker relied on narrative and an arbitrary artifact filename

The first live checker could infer UCL invocation from model prose and rejected
legitimate observation names. Empty `acquired` also caused a false negative.

**Resolved:** the checker now reads the independently maintained
`metadata.execution.tools_used`, requires exactly one linked observation by
`artifact_id`, parses its capability/status, and restricts actual tools to
`capability_library`, `file_list` and `save_artifact`. The Mission Manager
normalizes blank `acquired` to omission, with an offline regression test.
Historical failed `result.json` files are retained as evidence of earlier
checker/model outcomes; they are not relabeled as passes.

### Low: full regression comparison not yet persisted at first review

The final comparison is written to `reports/ucl-regression-comparison.json`:
39/44 integrated suites passed versus 38/43 baseline suites, with the new UCL
suite passing and no new failure. Five failures common to clean linked-worktree baseline and integration are
environmental baseline failures, not integration regressions: `.git` is a file
in a linked worktree and the untracked Chromium cache is absent. They are not
counted as passing.

## Verified focused evidence

- UCL bridge: **13/13 passed**, including schema-invalid filters, hostile text,
  missing/restored index, foreign/corrupt/stale/tampered indexes, full-file
  integrity and host-only hazardous access.
- Capability loop: **26/26 passed**, including blank acquisition normalization,
  F11 and grant-filtered UCL wiring.
- Lifecycle recovery: **13/13 passed**.
- Security tools: **5/5 passed**.
- Runtime storage and lease: **75/75 passed**.
- TypeScript typecheck/build and emitted `.js` import inspection passed.
- Registry import does not eagerly load `node:sqlite`.

## Residual limits

- The catalogue is a fixed, source-locked snapshot whose publisher claims,
  URLs, licences and security have not been independently verified. Updating
  it requires an explicit reviewed data/code change.
- A real-model run can prove actual UCL invocation and an honest bounded
  terminal observation. The intentionally limited grants cannot prove a local
  renderer, successful candidate installation, reusable execution or portable
  professional competency transfer.
- Blueprint reuse and the deferred Cortex control-plane components are not
  integrated or accepted.
- One passing live probe and one local checkpoint are not proof of every R2/R3
  readiness criterion.
