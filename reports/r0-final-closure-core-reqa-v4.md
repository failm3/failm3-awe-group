# NOX R0 Core — Final Closure Independent QA v4

**Date:** 2026-11-13  
**Evidence root:** `.r0-work/final-closure-v4-20261113/core/`  
**Mode:** fresh offline production-path probes from physical source copies  
**Decision rule:** PASS only if no in-scope R0 core blocker is reproduced.

# Verdict: **PASS**

**Reproduced R0 core blockers: P0 = 0; P1 = 0.**  
**Adjudicated independent checks: 226 passed / 0 failed.**

The two-crash, same-name A→B→C recovery case now completes with only intact C. The requested forged-lineage, modified-proof, modified-byte, broken-chain, cycle, untrusted-branch, and `supersededAgain` controls all behaved safely. Original F-01–F-04 and the returned/thrown D8 repair-recovery paths remain covered and did not reproduce their former defects.

This is an **offline R0 core verdict**, not certification of live providers, external effects, browser/MCP/PostgreSQL integrations, deployment, or production operations.

---

## 1. Exact results

| Independent workstream | Final result | Evidence |
|---|---:|---|
| Physical-copy `r0-reqa-manager`, contained child launchers | **95 passed / 0 failed** | `logs/r0-reqa-manager.contained.log` |
| Physical-copy `r0-runtime-storage-lease`, contained child launchers | **71 passed / 0 failed** | `logs/r0-runtime-storage-lease.contained.log` |
| Independent two-SIGKILL lineage setup | **10 passed / 0 failed** | `results/lineage/base.json` |
| Independent real-finalization adversarial cases | **50 passed / 0 failed**, 9 cases | `results/lineage-summary.json` |
| **Total adjudicated checks** | **226 passed / 0 failed** | `results/audit-summary.json` |

Expected fail-closed outcomes in negative controls are passing QA assertions, not product test failures.

The competing full gate was **not rerun**. The existing latest main result was read only: `reports/r0-test-results/summary.json` reports **22 suites passed / 0 failed**, from `2026-11-13T14:17:25.648Z` through `2026-11-13T14:26:21.193Z`. Those 22 suites are not included in the independent 226-check total.

---

## 2. Independent two-real-crash A→B→C reproduction

The probe used the real mission manager, checkpoint lifecycle, orphan reconciliation, artifact registry, immutable integrity checks, and finalization. Only planner, specialist behavior, and QA were deterministic offline dependency doubles. A child-only Node load hook scheduled each crash after the real provenance checkpoint returned and before its mission-metadata write; production files were not modified.

### Real crash and recovery observations

1. Original execution registered same-name artifact A.
2. Repair 1 wrote B and committed authenticated A→B provenance. The child died by **SIGKILL** immediately after that checkpoint commit, with no repair intent still in flight and no metadata index yet written.
3. Real `reconcileOrphanedMissions()` found the dead owner, quiesced/reclaimed its process evidence, and changed the mission to `paused`/`resumable`.
4. Resume restored A→B, performed repair 2, and committed authenticated B→C provenance. A second real child died by **SIGKILL** at the equivalent post-checkpoint boundary. Exactly two completed proofs and no repair intent remained in the checkpoint.
5. A second real orphan reconciliation paused the recovered owner. Final manager recovery restored both authenticated links and ran final QA/finalization with **0 resumed plans and 0 resumed executions**.

### Exact positive-control identity and integrity

| Item | Value |
|---|---|
| Mission | `f4040404-0000-4000-8000-000000000001` |
| A | `d4c6dd0a-0adb-48ed-988f-ed2758261623` |
| B | `b7e86e56-0f92-4f2b-86e1-d4f8caf86d85` |
| C | `01d35531-0601-4435-82d9-118c5e7e35a5` |
| A SHA-256 | `d00116a129fbfb64bc491ee5c4e29443fdee54ab6e70a77f3d8e7cfa8dfc7ac4` |
| B SHA-256 | `779dfe3a125df8898f73e69752ac70ddbc6c1826004253f6949b825bde06a18d` |
| C SHA-256 | `3147108c979a5d4f0912f2fe0bc56949a89c96dba69af5db82fe12dbee248db6` |

All three IDs and hashes are distinct, all three records point to the same `index.html` backing path, and each recorded size is 19 bytes. B's historical bytes are legitimately overwritten by C at that shared path; the complete authenticated chain no longer incorrectly requires B's old hash to match the current path.

**Final result:** `completed`; mission artifact list exactly `[C]`; C's current size and SHA-256 match its registry claims; exactly two authenticated links A→B and B→C were restored; plans/executions on final recovery were `0/0`; final reviews were `1`.

Evidence: `results/lineage/base.json`, `results/lineage/positive.json`, and `logs/adversarial-lineage.log`.

---

## 3. Adversarial lineage and integrity controls

Each case started from a separate physical copy of the same recovered post-second-crash state. Absolute artifact paths were relocated to that case's own data directory before any mutation, preventing cross-case or base-state contamination. Every case then ran the real manager through finalization.

| Case | Actual finalization outcome | Decisive safety result |
|---|---|---|
| `positive` | `completed` | Both links restored; only intact C delivered; no replay. |
| `unprovenanced` | `failed` (expected) | Real-ID B→C metadata with invented proof identities could not reconnect A; original A was reported unregistered. |
| `proof-hash` | `failed` (expected) | A structurally valid checkpoint whose B→C replacement hash claim was changed no longer matched registry evidence and could not resolve A→B→C. |
| `same-size-final-byte` | `failed` (expected) | Final byte changed while preserving 19-byte length; `Artifact 'index.html' content hash changed` blocked completion. |
| `supersededAgain-samename` | `failed` (expected) | An unauthenticated B→C link plus same-size C tampering could not bypass the visible final C integrity check. |
| `supersededAgain-visible-terminal` | `failed` (expected) | Genuine A→B resolved even with stale B bytes, proving raw `supersededAgain` influenced the per-link check; visible `listArtifacts()` then independently blocked B with `content hash changed`. No A-unregistered blocker occurred. |
| `chain-gap` | `failed` (expected) | A B→C suffix without authenticated A→B could not resolve original A. |
| `cycle` | `failed` (expected) | A fabricated structurally valid A↔B proof cycle terminated through cycle-safe traversal and did not complete or loop indefinitely. |
| `untrusted-branch` | `completed` | An extra forged A→C raw metadata branch remained inert; the two genuine proofs resolved and only intact C was delivered. Raw metadata retention is not authentication. |

Every adversarial finalization case recorded **0 planner calls and 0 specialist executions**. No attack or broken-lineage fixture triggered repair replay. The cycle fixture is deliberately synthetic adversarial evidence; this result does not claim that ordinary production repair can generate such a cycle.

Machine-readable per-case statuses, blockers, counts, links, and assertions are under `results/lineage/*.json`.

### Explicit `supersededAgain` adjudication

The source builds `supersededAgain` from raw links before authenticating each link. Therefore an unauthenticated B→C entry **can suppress the per-link live-byte check for B**, as suspected. The dedicated visible-terminal control reproduced that condition rather than merely reasoning about it: A→B remained usable and there was no A-lineage blocker even though B's bytes were invalid.

It did **not** become a false delivery. Actual finalization separately iterated the visible `listArtifacts()` result and rejected B's content hash. The same-name variant likewise rejected the visible current C after same-size tampering. Thus the suspected waiver exists locally, but the final visible-artifact gate prevents it from producing `completed` delivery in both tested layouts. No R0 blocker is assigned for this behavior.

---

## 4. D8 and original F-01–F-04 regression coverage

### D8 failed-outcome retention, quiescence, and explicit recovery

The final contained 95-check manager suite established:

- **Returned and thrown ordinary failures after an effect:** one original effect, failed outcome retained on an `intent-v1` record, pause before QA/terminalization, and no repeat on a fresh unresolved resume.
- **Post-checkpoint SIGKILL variants:** returned failure with artifact, returned failure without artifact, and thrown provider-like offline error each retained the required durable intent and effect/failure evidence.
- **Explicit accept:** valid newly registered evidence completed without re-execution; invented, missing, baseline, or integrity-invalid evidence was refused.
- **Explicit retry:** only the authorized resume repeated the effect, exactly once, and then completed. Unresolved and accepted resumes had zero new effects.
- **No-effect failure control:** no unnecessary durable ambiguity was retained; ordinary re-execution remained available.
- **D8.H failed repair, returned and thrown:** each repair ran once and retained `effect_marked_at` plus its failed outcome. Each fresh manager ran zero executions, stayed paused, and named a repair recovery entry.
- **D8.I real process quiescence, returned and thrown:** both real detached descendant fixtures were dead before durable pause; process records were gone, leases were `null`, and failed repair outcomes plus QA blockers remained durable.
- **Bounds:** the 13th agent/repair was refused before effect at the 12-agent budget. Adversarial resumes already at repair iteration 2 performed no additional repair.
- **Same-name operator retry provenance:** A→B was retained as `operator_retry`/`operator_retried`, exactly one further repair created B→C, and the mission completed with only C.

The thrown errors and effect receipts are deterministic offline doubles, not live provider failures or real external side effects. The descendants and process-group lifecycle operations are real OS processes.

### Original defect disposition

| Original ID | Current independent evidence | Disposition |
|---|---|---|
| **F-01** ordinary effect-bearing failures lost recovery | D8.A–D and D8.F–G cover returned/thrown, live/crash, artifact/no-artifact variants. Failed intents survive; QA is withheld; unresolved fresh resume repeats nothing; accept/retry works explicitly. | **Not reproduced** |
| **F-02** dead recovery owner blocked replacement | Storage/lease L3.R used a real killed recovery holder. Expired-but-live ownership still blocked takeover; confirmed death allowed reconciliation to paused with no lease; new `run`, `resume`, `cancel`, and `recovery` acquisitions all succeeded with newer generations. | **Not reproduced** |
| **F-03** one same-name retry double-ran and failed | D3.F observed original effect `1`, ambiguous failed repair `1`, explicit post-resolution repair `1`, no resumed original, final `completed`, and durable A→B→C with only C attached. | **Not reproduced** |
| **F-04** post-provenance crash lost usable lineage | D3.G passed the single-link crash window. D3.H and the independent 60-check probe passed two real post-provenance crashes, restored both links, performed no final replay, and delivered intact C. | **Not reproduced** |

The earlier v2 defect requiring overwritten intermediate B's current bytes to match B's historical hash was specifically cleared by distinct A/B/C hashes on one path and successful C-only finalization.

---

## 5. Commands, logs, and audit-local harness changes

Exact final launch commands and exit codes are preserved at:

- `logs/r0-reqa-manager.contained.command.txt` and `.exit.txt`
- `logs/r0-runtime-storage-lease.contained.command.txt` and `.exit.txt`
- `logs/adversarial-lineage.command.txt` and `.exit.txt`

All three final commands exited **0**. Full unabridged console output is in the corresponding `.log` files. Probe source is `probes/adversarial-lineage.mts`; structured results are `results/lineage-summary.json` and `results/audit-summary.json`.

### Child-TMPDIR containment correction

The first physical-copy suite runs passed **95/95** and **71/71**, but inspection of the copied spawn helpers showed that their real children did not inherit the audit-local `TMPDIR`. Those initial logs remain as supplemental evidence and are not double-counted.

For the adjudicated reruns, only the two disposable copied spawn helpers were changed to set each child's `TMPDIR` to its already-existing fresh per-suite root and `AWE_OFFLINE_TEST=1`. No production module, assertion, expected result, planner, specialist, lifecycle, or storage behavior was changed. The exact two-file diff is `evidence/child-containment.patch`; rationale is `evidence/child-containment.txt`. Both contained reruns passed with the same **95/95** and **71/71** results. The copied helpers were then restored byte-for-byte, and final copied-source verification passed 68/68.

### Probe-development assertion correction

The initial adversarial-probe run evaluated 60 checks: 59 passed and one harness-only assertion failed. Production had correctly completed with intact C and ignored the forged branch; the assertion incorrectly required raw mission metadata to contain only two links even though unprovenanced raw entries are retained but inert. The expectation was corrected to distinguish two genuine links from the inert raw branch. The initial log, JSON, and explanation are retained as `logs/adversarial-lineage.harness-assertion.log`, `results/lineage/untrusted-branch.harness-assertion.json`, and `logs/adversarial-lineage.harness-assertion.note.txt`. This was not a product finding and is not included in the final 226-check count.

---

## 6. Source stability, isolation, and limitations

### Frozen-source verification

Expected and actual manifest SHA-256, before and after:

```text
559ad73e870bc641b08fc68645e7e3474b3b54475e568ce7baf01776a4f88391
```

- Before: **73/73 OK, 0 failed** — `logs/source-before.log`.
- After all final test runs: **73/73 OK, 0 failed**, exit 0 — `logs/source-after.log`.
- Physical copied source after restoring the temporary launcher-only containment patch: **68/68 OK, 0 failed** — `logs/copied-source-after.log`.
- Final verification time: `2026-11-13T14:43:41Z`.
- Final residual process scan: **0 matching audit-root Node processes** — `logs/residual-node-processes.log`.

No production source, committed test, committed report, package file, Git state, or real `.awe-data` was modified. All custom probes, runtime data, HOME/TMPDIR roots, logs, results, and this report are confined to the assigned evidence root. Production code and tests were physically copied to `work/frozen`; only the existing third-party `node_modules` directory was symlinked for dependency resolution.

### Scope limits

- No network, paid/live provider, browser, MCP, PostgreSQL, deployment, publication, additional agent, or Git mutation was used.
- Real OS SIGKILLs, leases, detached process groups, checkpoints, registries, and finalization were exercised. Model planning, specialist responses, QA responses, external-effect receipts, and thrown provider-like errors were offline doubles.
- Alternate-host PID reuse, actual power loss, filesystem corruption beyond the stated byte/proof mutations, live external services, and production recovery drills were not tested.
- P0 = 0 and P1 = 0 mean no blocker was reproduced within this assigned core scope; they are not proof that no defect exists outside the tested schedules.

# Final decision

**PASS — no R0 core blocker reproduced.** The frozen source remained unchanged, all 226 adjudicated independent checks passed, two real post-provenance crashes recovered the complete authenticated A→B→C lineage without replay, only intact C was delivered, and the requested adversarial controls failed closed or remained inert as appropriate.
