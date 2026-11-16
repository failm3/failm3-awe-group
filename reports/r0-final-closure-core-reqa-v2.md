# R0 Final Closure Core Re-audit v2

**Date:** 2026-11-13  
**Verdict:** **FAIL**  
**Reproduced in-scope P0 root causes:** 0  
**Reproduced in-scope P1 root causes:** 1  
**Production/test source changes made by this audit:** none

The fixed R0 core does **not** meet the closure rule. A new adversarial production-path probe reproduced **V2-F01 (P1)**: after two committed same-name repairs and two post-checkpoint crashes, recovery rejects a valid A→B→C lineage even though both checkpoint proofs are present and final artifact C is intact. The mission ends `failed` instead of completing with C.

This verdict is not based on the historical FAIL report. The earlier F-01–F-04 reruns did not reproduce their original defects, and the focused suites are green; the independent multi-link counterexample is decisive on its own.

## 1. Decision and audited source

PASS required both zero reproduced in-scope P0/P1 root causes and verified integrated production behavior. V2-F01 violates that rule.

- Frozen manifest: `.r0-work/final-closure-v2-20261113/source.sha256`
- Manifest entries: **73**
- Manifest SHA-256: `1352aef4e6012c5b5f6bbb657e2a1750f0a224e8f80cdf79f2db9fddc03de25c`
- Audited `src/agents/mission-manager.ts` SHA-256: `4f26c5cc95f1c95fd4d0ff5a1a29ac4bd8818acea819e140651b6b9f222b4d0c`
- Start verification: **PASS**, exit 0 — `core/logs/source-start.txt`
- End verification at `2026-11-13T12:46:13Z`: **PASS**, exit 0 — `core/logs/source-end.txt`
- Residual audit Node processes: **0** — `core/logs/residual-processes.txt`
- Machine-readable adjudication: `.r0-work/final-closure-v2-20261113/core/logs/verdict-evidence.json`

The previous FAIL/final engineering reports and all production/test sources were left unchanged. Only this report and audit-local evidence were added.

## 2. Blocking finding — V2-F01 (P1)

### Title

`verifiedSupersessions` invalidates an authentic lineage prefix by requiring an overwritten intermediate artifact's current backing bytes to match its old registry hash.

### Reproduction

Primary command, complete output, exit record, and structured result:

- `core/logs/independent-lineage-multi-v3.command.txt`
- `core/logs/independent-lineage-multi-v3.log`
- `core/logs/independent-lineage-multi-v3.exit.txt`
- `core/results/lineage-multi.json`
- Isolated state: `core/state/independent-lineage-multi-v3/`

The probe uses the real `MissionManager`, checkpoint lifecycle, artifact storage, lease reconciliation, and real child processes. Only planning, specialist behavior, and QA are deterministic injected boundaries; no provider is called.

1. An original successful delegation produces `index.html` artifact A.
2. Same-name repair 1 produces B with different bytes. A real child is killed by `SIGKILL` immediately after the production checkpoint commits the completed A→B proof and closes the repair intent, before the mission metadata index is written.
3. Dead-owner reconciliation pauses the mission. Resume restores A→B and performs same-name repair 2, producing C with bytes distinct from both A and B.
4. A second real child is killed at the equivalent committed-checkpoint boundary. The durable checkpoint now has **two completed repair proofs**, `repair_iterations = 2`, and **no repair intent in flight**.
5. Final recovery restores both metadata links, runs no new plan/original/repair, and receives a passing injected QA review. Production execution-evidence validation nevertheless returns `failed`.

Decisive v3 identifiers and integrity facts:

| Item | Value |
|---|---|
| A | `2938a737-9c0f-4c98-9f86-89fbba75829f` |
| B | `0b78b96e-d8d2-414c-a67b-7a130a0abd68` |
| C | `36a85773-bb9d-41f4-8eae-1095b8ef8353` |
| B SHA-256 | `3781dc359ce470a0224ab0a3add6d7be4ff63055d4b000208d617429cf00ecf5` |
| C SHA-256 | `d6603f8574c6a460f1e77b5413ec249236f313158de9c203c6ab389272af464e` |
| B/C backing paths | identical, as intended for same-name replacement |
| C current bytes | 17 bytes; hash matches C's registry metadata |
| Final visible artifact | C only |
| Resumed plans / originals / repairs | 0 / 0 / 0 |
| Final status | **`failed`** |

The production blockers are:

```text
Delegation 'executor' artifact '2938a737-9c0f-4c98-9f86-89fbba75829f' is not registered
Delegation 'executor' artifact '2938a737-9c0f-4c98-9f86-89fbba75829f' is not registered
```

The structured probe has 14 passing checks and one failed completion check. The passing checks establish the real crashes, durable proofs, distinct hashes, shared B/C path, intact C, restored links, and absence of repeated effects. This is a reproduced production behavior failure, not a setup error.

### Root cause

In `src/agents/mission-manager.ts`:

- `verifiedSupersessions` at **lines 647–686** validates every link.
- **Line 664** calls `artifactIntegrityDefect(replacement)` for every replacement, including nonterminal intermediate B.
- For A→B→C, B and C intentionally point to the same `index.html` path. After repair 2, that path contains C. B's registry still correctly claims B's old hash, so line 664 discards the otherwise authentic A→B link.
- `currentSupersessions` at **lines 1875–1877** consequently exposes only the valid B→C suffix.
- `resolveSuperseded` at **lines 699–721** cannot start traversal from A without A→B. `applyExecutionEvidenceGate` at **lines 742–753** reports the original A reference as unregistered, and finalization marks the mission failed.

The single-link control passes because B is still the current artifact and its live bytes match B. The two-link case fails specifically because B is no longer current. This is not the intended rejection of damaged final evidence: C remains byte-valid and all visible artifacts pass integrity checking.

### Impact and severity

**P1.** A supported crash window can leave intact, committed, fully provenanced work undeliverable through ordinary recovery at the two-repair bound. The failure is fail-closed—there is no false `completed` delivery—but the production system cannot verify and complete the valid result without repair or manual state intervention.

### Required closure condition

Authenticate intermediate links using their registry and checkpoint-provenance claims, follow the complete chain, and enforce live-byte integrity on the resolved current artifact and all visible delivery artifacts rather than requiring an overwritten intermediate's old bytes to remain at the shared path.

Add a regression with **distinct A, B, and C bytes** and real post-commit crashes after both repairs. It must complete with intact C and perform zero additional plans, original executions, or repairs. The forged-link, modified-proof, and modified-final-byte controls must continue to fail closed.

## 3. Independent coverage and results

All paths below are relative to `.r0-work/final-closure-v2-20261113/core/`.

| Probe / coverage | Result | Assertions | Structured result |
|---|---:|---:|---|
| Returned/thrown post-effect failures; accept/retry; duplicate resolution; no-effect control | PASS | 22/22 | `results/ordinary-failures.json` |
| Noncooperative timeout/cancel; deferred settlement; late artifact fence | PASS | 4/4 | `results/deferred-settlement.json` |
| Expired live, confirmed-dead, and remote recovery ownership | PASS | 7/7 | `results/recovery-ownership.json` |
| `operator_retry`, staged-decision crash | PASS | 9/9 | `results/resolution-retry-staged.json` |
| `operator_retry`, closed-intent crash | PASS | 7/7 | `results/resolution-retry-closed.json` |
| Operator accept, staged-decision crash | PASS | 9/9 | `results/resolution-accept-staged.json` |
| Operator accept, closed-intent crash | PASS | 7/7 | `results/resolution-accept-closed.json` |
| Single-link post-commit crash control | PASS | 8/8 | `results/lineage-commit.json` |
| Two-link, distinct-byte, two-post-commit-crash case | **FAIL — V2-F01** | 14/15 | `results/lineage-multi.json` |
| Forged lineage without checkpoint proof | PASS — rejected | 8/8 | `results/lineage-forged.json` |
| Tampered claimed replacement hash | PASS — rejected | 8/8 | `results/lineage-tampered-proof.json` |
| Same-size tampering of final replacement bytes | PASS — rejected | 8/8 | `results/lineage-tampered-bytes.json` |
| **Total independent probes** | **11 PASS / 1 defect FAIL** | **111/112** | 12 JSON records |

Notable verified behavior:

- Returned and thrown effect-bearing failures pause before QA and retain exact failed-outcome/effect evidence. An unresolved resume performs no new plan, execution, or QA. Explicit accept avoids repetition; explicit retry is the only path that repeats an effect.
- Duplicate operator resolutions are rejected with `MissionStateError` and byte-identical checkpoints. Staged-only resolution crashes remain blocked; repeating the interrupted decision closes once without duplicating its durable decision or proof.
- Same-name `operator_retry` performs exactly one additional authorized repair in both staged and closed crash windows.
- Timeout/cancellation remains nonterminal while noncooperative work is pending. Timeout publishes `paused` only after actual settlement; cancellation publishes `cancelled` only after settlement, and a late artifact registration is refused with `MissionSealedError`.
- An expired live owner and the alternate-host ownership fixture remain takeover barriers. Once same-host death is confirmed, recovery pauses/releases the orphan and recovery/run/resume/cancel acquisition works again.
- Forged provenance, modified hash claims, and modified final bytes cannot produce a completed delivery.

## 4. Focused suites and compile checks

| Validation | Result | Command | Output |
|---|---:|---|---|
| `r0-reqa-manager` | **83 passed / 0 failed** | `logs/suite-reqa-manager.command.txt` | `logs/suite-reqa-manager.log` |
| `r0-runtime-storage-lease` | **60 passed / 0 failed** | `logs/suite-storage-lease.command.txt` | `logs/suite-storage-lease.log` |
| `r0-closure-process-lifecycle` | **9 passed / 0 failed** | `logs/suite-process-lifecycle.command.txt` | `logs/suite-process-lifecycle.log` |
| TypeScript `--noEmit` | **PASS**, exit 0 | `logs/typecheck.command.txt` | `logs/typecheck.log` |
| Audit-local build | **PASS**, exit 0 | `logs/build.command.txt` | `logs/build.log` |

Focused total: **152 tests passed, 0 failed**. The build output is confined to `core/build-dist/`. These green checks do not cover the decisive two-post-commit-crash, distinct-byte chain and therefore do not override V2-F01.

The four historical F-01–F-04 wrappers also exited 0 with zero reproduced legacy defects; see `logs/original-four-rerun.summary.txt`. Their hard-coded probe root regenerated supplemental payloads under `.r0-work/final-integrated-reqa-20261113/core/`, so they are not the basis of this verdict. The v2 commands and wrapper logs remain under this audit's `core/logs/`.

## 5. Execution controls and limitations

- Every production-probe launcher removed `ROUTER_CHEAP_API_KEY`, `OPENAI_API_KEY`, and `TAVILY_API_KEY`, set `AWE_OFFLINE_TEST=1`, and supplied fresh audit-local `AWE_DATA_DIR`, `HOME`, and `TMPDIR` before imports.
- Independent probes installed throwing `fetch` and `net.Socket.connect` guards. Deterministic dependency injection prevented default LLM agents from loading.
- No network/provider/paid calls, real LLM/browser/MCP/PostgreSQL evidence, deployment, Git mutation, R1 work, or access to real `.awe-data`, `/goal`, or another project was used.
- Remote ownership is an audit-local alternate-host lease fixture, not a real multi-host filesystem or PID-reuse test.
- Crash hooks exist only in audit child modules. They trigger `SIGKILL` immediately after the production checkpoint save returns its durable target; they do not modify production files and are not arbitrary power-loss/storage-failure simulation.
- An early multi-link fixture accidentally reused B's content for C and was non-decisive. The corrected v2 and sealed v3 runs use distinct content. V3 is the adjudicated counterexample.
- This audit does not claim the separate full repository gate or R1 scope passed.

## Final verdict

**FAIL — one reproduced in-scope P1 root cause (V2-F01).** R0 core closure should remain blocked until the two-link same-name post-checkpoint recovery case completes with intact C and the negative provenance/integrity controls remain closed.
