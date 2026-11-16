# NOX R0 Core — Final Closure Independent QA v5

**Date:** 2026-11-13  
**Evidence root:** `.r0-work/final-closure-v5-20261113/core/`  
**Mode:** fresh offline probes against a physical copy of the frozen source  
**Decision rule:** PASS only if no in-scope R0 core blocker is reproduced.

# Verdict: **PASS**

**Reproduced R0 core blockers: P0 = 0; P1 = 0.**  
**Adjudicated independent checks: 241 passed / 0 failed.**

The new storage-root validation rejected both pre-import artifact-root symlink and regular-file fixtures without outside adoption, QA, or completion. Ordinary real-directory roots still support real manager completion, artifact writes, same-name replacement, listing, reconciliation, mission listing, and logs. The fresh two-real-SIGKILL A→B→C probe completed with intact C only and no final replay. Forged/tampered lineage, same-size final-byte, both `supersededAgain` controls, chain-gap, cycle, and untrusted-branch cases all reached their required safe outcomes.

This is an **offline R0 core verdict only**. It is not a live-provider, external-effect, deployment, production-operations, or live-readiness claim.

---

## 1. Exact independent results

| Workstream | Result | Evidence |
|---|---:|---|
| Physical-copy `r0-reqa-manager`, contained children | **95 passed / 0 failed** | `logs/r0-reqa-manager.contained.log` |
| Physical-copy `r0-runtime-storage-lease`, contained children | **75 passed / 0 failed** | `logs/r0-runtime-storage-lease.contained.log` |
| Independent two-SIGKILL lineage setup | **10 passed / 0 failed** | `results/lineage/base.json` |
| Independent finalization/adversarial cases | **50 passed / 0 failed**, 9 cases | `results/lineage-summary.json` |
| New artifact-root ordinary-operation controls | **11 passed / 0 failed** | `results/artifact-root-controls.json` |
| **Total adjudicated independent checks** | **241 passed / 0 failed** | `summary.json` |

All four adjudicated commands exited 0. Expected failures in negative controls are passing safety assertions, not product-test failures.

The competing full npm gate was **not rerun**. The supplied current main result was read only: `reports/r0-test-results/summary.json` reports **22/22 suites**, from `2026-11-13T14:55:34.466Z` through `2026-11-13T15:04:37.777Z`. Those suites are excluded from the independent 241-check total.

---

## 2. Frozen source and v4 delta

The copied manifest is `source.sha256`; its SHA-256 remained:

```text
d2562ef0a50a7d25e4da83dc01fe632720708192a756a4adf7ded77bce3680a7
```

- Production source before all runs: **73/73 OK, 0 failed**, exit 0 — `logs/source-before.log`.
- Fresh physical copy before all runs: **73/73 OK, 0 failed**, exit 0 — `logs/copied-source-before.log`.
- Physical copy after restoring the two audit-only launcher edits: **73/73 OK, 0 failed**, exit 0 — `logs/copied-source-after.log`.
- Production source after all adjudicated runs: **73/73 OK, 0 failed**, exit 0 — `logs/source-after.log`.
- Final production-source verification after evidence generation: **73/73 OK, 0 failed**, exit 0 — `logs/source-final.log`.

Comparison against the 68 source files physically present in the v4 audit copy found exactly the stated two changes:

1. `src/utils/storage.ts`
2. `src/tests/r0-runtime-storage-lease.test.ts`

Evidence: `evidence/v4-source-changes.txt` and `evidence/v4-to-v5.patch`. The five additional manifest entries absent from v4's physical copy were treated as absent audit artifacts, not source changes; every one is present and verified in this v5 copy.

The new `ensureDirs()` loop performs `lstatSync` on `DATA_DIR`, `MISSIONS_DIR`, and `ARTIFACTS_DIR` and rejects either a symbolic link or a non-directory. It runs at module import and on every pre-existing `ensureDirs()` call. No source defect was reproduced in this change.

---

## 3. New artifact-root rejection and ordinary controls

### Pre-import hostile roots — included in the 75/75 storage/lease run

The fresh physical-copy suite passed all four new S5d checks:

- A pre-existing **artifact-root symlink** was rejected during storage import; the link and outside bytes remained unchanged.
- That fixture produced no outside adoption, no QA call, and no completed mission.
- A pre-existing artifact-root **regular file** was likewise rejected without changing the file or outside bytes.
- That fixture also produced no outside adoption, no QA call, and no completed mission.

The surrounding artifact confinement controls also passed: final-component and ancestor symlinks were refused, a symlinked mission root neither overwrote nor adopted outside files, and ordinary nested replacement and real mission-root reconciliation remained available.

### Independent ordinary real-directory controls — 11/11

`probes/artifact-root-controls.mts` pre-created real `DATA_DIR`, `missions`, and `artifacts` directories, then imported the copied storage and real manager. It established:

- import preserved all three real directory identities;
- the real manager made exactly **1 plan, 1 specialist execution, and 1 QA review**, then completed with exactly its primary artifact;
- QA observed the intact nested file through `listArtifacts()`, and its real path stayed beneath the artifact root;
- terminalization cleared its checkpoint and lease;
- ordinary same-name replacement exposed only intact current bytes;
- reconciliation adopted only the real in-root loose file;
- `listMissions()` and `appendLog()` still worked; and
- all three roots remained ordinary non-symlink directories.

Evidence: `logs/artifact-root-controls.log` and `results/artifact-root-controls.json`.

---

## 4. Fresh two-real-post-provenance-SIGKILL A→B→C probe

The v4 probe source was reused without changing its product assertions and run against the new physical source with new evidence-local state. Only planner, specialist behavior, and QA were deterministic offline dependency doubles. The manager, checkpoints, provenance, orphan reconciliation, process death, registry, integrity checks, and finalization were real.

1. The original execution registered A.
2. Repair 1 wrote same-name B and committed authenticated A→B provenance. Its owner then died by **SIGKILL** after the checkpoint return boundary and before mission metadata was written. No repair intent remained in flight.
3. Real orphan reconciliation paused the mission as resumable.
4. Resume restored A→B, ran repair 2, and committed B→C. A second real owner died by **SIGKILL** at the equivalent boundary. Exactly two completed proofs remained, with no repair intent.
5. A second reconciliation paused the recovered owner. Final real-manager recovery restored both links and completed with **0 resumed plans, 0 resumed executions, and 1 final review**.

| Item | Fresh v5 value |
|---|---|
| Mission | `f4040404-0000-4000-8000-000000000001` |
| A | `e657b0fd-00f1-41a6-a05e-af5d99a6e923` |
| B | `25dea642-d70a-497b-8fe6-c0bc26d3a225` |
| C | `a9d82e30-92ce-489d-abf4-0334f1fa99ad` |
| A SHA-256 | `d00116a129fbfb64bc491ee5c4e29443fdee54ab6e70a77f3d8e7cfa8dfc7ac4` |
| B SHA-256 | `779dfe3a125df8898f73e69752ac70ddbc6c1826004253f6949b825bde06a18d` |
| C SHA-256 | `3147108c979a5d4f0912f2fe0bc56949a89c96dba69af5db82fe12dbee248db6` |

A, B, and C had distinct IDs and hashes on one `index.html` backing path. Final status was `completed`; mission artifacts were exactly `[C]`; C's visible size and SHA-256 matched its registry claims. The historical same-path bytes of B did not create a false integrity blocker for valid C.

Evidence: `results/lineage/base.json`, `results/lineage/positive.json`, and `logs/adversarial-lineage.log`.

---

## 5. Decisive adversarial/final-visible-integrity cases

Each case ran from a separate copy of the same fresh post-second-crash state. Registry absolute paths were relocated into that case's own evidence data directory before mutation. Every case used the real manager and recorded **0 plans and 0 executions** during finalization.

| Case | Actual outcome | Decisive result |
|---|---|---|
| `positive` | `completed` | Restored both authenticated links and delivered intact C only. |
| `unprovenanced` | `failed` (expected) | Invented B→C proof identity could not reconnect original A. |
| `proof-hash` | `failed` (expected) | Modified B→C replacement-hash claim did not authenticate against registry evidence. |
| `same-size-final-byte` | `failed` (expected) | One-byte tamper preserved length but changed SHA-256; visible `content hash changed` blocked completion. |
| `supersededAgain-samename` | `failed` (expected) | Unauthenticated B→C plus same-size C tampering did not bypass final C integrity. |
| `supersededAgain-visible-terminal` | `failed` (expected) | Genuine A→B resolved despite stale B bytes; the visible terminal-artifact gate independently rejected B's changed hash, with no A-unregistered blocker. |
| `chain-gap` | `failed` (expected) | A B→C suffix without authenticated A→B could not resolve A. |
| `cycle` | `failed` (expected) | The synthetic A↔B proof cycle terminated safely without completion or indefinite traversal. |
| `untrusted-branch` | `completed` | The extra unprovenanced raw A→C branch stayed inert; the two genuine proofs delivered intact C only. |

As in v4, raw `supersededAgain` metadata can locally suppress a per-link live-byte check before link authentication. The dedicated visible-terminal case therefore remains important: finalization separately checked the actual `listArtifacts()` result and prevented false completed delivery in both tested layouts. No blocker is assigned for that behavior in this scope.

Evidence: `results/lineage/*.json` and `results/lineage-summary.json`.

---

## 6. Retry, failed-repair quiescence, and real process handling

The fresh 95-check manager run confirmed that root validation did not weaken the prior R0 behavior:

- Returned and thrown effect-bearing ordinary failures retained durable failed outcomes, paused before QA, and repeated nothing on unresolved fresh resume.
- Explicit accept completed with verified evidence and no replay; invented or integrity-invalid evidence remained refused.
- **Explicit retry** was the only path that repeated an effect, exactly once. Same-name operator retry retained A→B, one further repair created B→C, and completion delivered C only.
- Returned and thrown **failed repairs** each ran once, retained `effect_marked_at` plus their failed outcome, and fresh managers executed nothing while paused for recovery.
- Both returned/thrown D8.I variants used real detached descendants. Each descendant was dead before durable pause; process records were removed, leases were null, and failed-repair/QA evidence survived.
- Repair budget refusal occurred before a 13th effect; final tree/ledger and same-name lineage checks remained green.

The fresh 75-check storage/lease run additionally confirmed real killed lock/lease holders, live-owner barriers despite expiry, confirmed-dead recovery-owner takeover, generation fencing, stale-release protection, and cancellation behavior. No residual audit-root Node process remained (`logs/residual-node-processes.log`).

Thrown provider-like errors and effect receipts are deterministic offline doubles; the SIGKILLs, leases, locks, detached process groups, checkpoints, files, and finalization are real OS/runtime behavior.

---

## 7. Commands, containment, and audit-only harness notes

Exact commands and exit codes:

- `logs/r0-reqa-manager.contained.command.txt` / `.exit.txt`
- `logs/r0-runtime-storage-lease.contained.command.txt` / `.exit.txt`
- `logs/adversarial-lineage.command.txt` / `.exit.txt`
- `logs/artifact-root-controls.command.txt` / `.exit.txt`

All exited 0; full console output is in the corresponding `.log` files. Each product/probe invocation used a fresh evidence-local `AWE_DATA_DIR`, `HOME`, and `TMPDIR`. Production files and real `.awe-data` were read-only inputs only. Source and tests ran from `work/frozen`; only the existing third-party `node_modules` was symlinked for dependency resolution.

For child containment only, the two disposable copied spawn helpers were temporarily given their already-existing per-suite root as child `TMPDIR` and `AWE_OFFLINE_TEST=1`. No production module, product assertion, expected result, lifecycle behavior, or storage behavior changed. The exact diff is `evidence/child-containment.patch`. Both helpers were restored byte-for-byte before copied-source verification.

The summary builder initially had two parse-only failures because a TypeScript-style helper was first invoked as plain `.mjs`; it was renamed `.mts` and run through the offline TSX loader. Neither invocation executed a product check or wrote a verdict. Both logs and the correction note are retained as `logs/build-summary.harness-*`; these helper-only failures are not included in the 241 checks. No lineage or product-test assertion required correction.

---

## 8. Limitations

- No network, paid/live provider, browser, MCP, PostgreSQL, deployment, publication, Git mutation, production fix, full npm gate, or additional agent was used.
- Alternate-host PID reuse, actual power loss, filesystem corruption beyond the specified fixtures, external services, and production recovery drills were not tested.
- P0 = 0 and P1 = 0 mean no blocker was reproduced within this assigned core scope, not that defects outside the tested schedules are impossible.
- There is **no live readiness claim**.

# Final decision

**PASS — no in-scope R0 core blocker reproduced.** All **241/241** independent adjudicated checks passed on the exact frozen source; the manifest remained unchanged before and after, both new hostile artifact roots failed closed, ordinary roots remained functional, two real post-provenance crashes recovered A→B→C without replay, and final visible integrity held under the decisive adversarial controls.
