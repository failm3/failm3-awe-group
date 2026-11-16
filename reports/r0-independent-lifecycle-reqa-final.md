# R0 independent lifecycle re-QA — final verdict

**Review date:** 2026-11-13  
**Overall offline R0 lifecycle verdict:** **FAIL — DO NOT CLOSE R0**  
**Production / live-provider readiness:** **NOT ESTABLISHED — NO PRODUCTION-READINESS CLAIM**  
**Independent QA sign-off:** **REJECTED / NO-GO**

The integrated work fixes the former false terminal success response: a repeated cancellation now inspects process evidence and returns `cancelled:false, quiesced:false` when that evidence is malformed or foreign-live. Real SIGTERM/SIGKILL controls, active-manager cancellation retry, API rejected-run handling, and replacement-owner fencing also have meaningful positive coverage.

R0 nevertheless remains open. The current snapshot has **four reproduced behavioral P1 defects** and fails its own validation gate:

1. Direct/unowned cancellation releases its lease while process settlement remains blocked.
2. Fatal and checkpoint-integrity deferred settlement perform no automatic retry after a transient blocker disappears.
3. Explicit cancellation replaces damaged checkpoint evidence with a valid `cancelled` checkpoint.
4. An already-terminal mission with live process evidence remains terminal while that process performs a later effect; the response is now truthful, but no owner settles the surviving work.

In addition, the stable-snapshot focused process suite finishes **6/8**, not green. One failure is a 50 ms lease-observation schedule race and the other uses a now-invalid fixture that pre-creates process evidence before a run; neither is counted as an additional product defect without an independent reproduction. The final `tsc --noEmit` run passes, but these fixtures still leave the repository gate red. No current-snapshot P0 false-quiescence claim remains reproduced; the independently reproduced P1 findings are sufficient for FAIL.

## 1. Audited snapshot and constraints

Git HEAD was `446adaea833b0ebade1a21fbda3f71118d19b0d6`; the implementation remained in a dirty, concurrently changing working tree. The final decisive manager/deferred/API probes used these hashes:

| File | SHA-256 |
|---|---|
| `src/agents/mission-manager.ts` | `fc0478f3bca6ee80b0e23b390ae9359f3ce37eb2bb1f332898ebe9998cf6ef13` |
| `src/agents/lifecycle.ts` | `561f5a9adbddddd24fd8ebd3d8db8331b8a591437db692f2a0faa239eea980be` |
| `src/utils/process-registry.ts` | `6d04390bac42cb45119f53d3bc3d0322666c63fa893c91e645def9fb4fdb0afe` |
| `src/api/server.ts` | `b7da993ae93c1bfce3f86c93dd4b0ad0bc42791559f579d23b77bf064dbfe29d` |
| `src/index.ts` | `3585f3ed7c49f94d67fd1dec3638ac44c6f783c41f6261f7b9ddcaf8cef8d6d5` |
| `src/tools/index.ts` | `c83a62f6e9632b1cb6cbac62b57684699f2457993a8938f58a2b4b3add0af0f1` |

An earlier saved version of this report adjudicated hashes `cc755d…`/`9031ec…`; it was invalidated when lifecycle fixes arrived during review. This version replaces those stale source claims. The corrected checkpoint/fatal probe creates process damage only after ownership is acquired. The final focused process-suite start/end hashes are identical and match the table (`final-suite-start-hashes.log`, `final-suite-end-hashes.log`). Earlier moving-tree runs are retained only as development history, not as final product evidence.

Probe files, isolated state and fixture work directories are under:

```text
.r0-work/final-lifecycle-reqa-20261113-01/
```

No production source/test was edited by this audit. No Git mutation, network/live-provider call, real `.awe-data` access, deployment, browser/MCP operation or externally visible action was used. Offline dependency injection established deterministic schedules; the real manager, storage, lease/checkpoint, process registry, API and termination-handler code executed. Spawned fixture process groups were killed and reaped in `finally` cleanup. Exploratory logs with corrected harness mistakes or concurrent mid-edit build errors are retained but are not cited as behavioral verdict evidence.

## 2. Remaining defects

### 2.1 P1 — blocked direct cancellation releases the lease

**Source**

- `src/agents/mission-manager.ts:827-858`: cancellation still requests purpose `run` even though `lifecycle.ts:668-685` now reserves the process-evidence acquisition bypass for purpose `cancel`; on the direct path that acquires a lease, blocked settlement correctly returns `cancelled:false`, `quiesced:false`.
- `src/agents/mission-manager.ts:879-881`: the direct path's `finally` unconditionally calls `lease.release()`.
- `pendingCancellationLeases` is declared at line 787 but has no use in this snapshot.
- `src/api/server.ts:420-438` exposes blocked cancellation, but direct cancellation has already dropped the durable ownership marker.

**Executed evidence**

Commands and complete results are in `logs/direct-process-verdict.log` / `direct-process-results.json` and `logs/direct-blocked-verdict.log` / `direct-blocked-results.json`. The malformed direct-process case now also demonstrates the purpose mismatch: cancellation falls into `forwarded:true, pending_operations:0` without an observable owner because its `run` acquisition is rejected by existing evidence. The foreign-live direct-blocked schedule still acquires before evidence and reproduces unconditional release.

For malformed process evidence, the result was:

```json
{
  "cancelled": false,
  "quiesced": false,
  "status": "running",
  "pending_operations": 1,
  "lease": false,
  "evidencePreserved": true
}
```

For a real detached process whose separately recorded owner remained alive, the registry correctly refused a foreign-owner kill. Both initial and repeated direct cancellation returned non-quiesced, preserved the process record, and left no mission lease. The real resistant child subsequently wrote its scheduled late-effect file while the mission remained `running` and unowned.

**Impact / correction**

The result itself is truthful, but the mission no longer has durable active ownership while cancellation remains unresolved. Retain a lease or an explicit durable recovery handoff until quiescence/terminalization; do not weaken foreign-live or process-identity checks. The related repository tests also leave ownership/recovery behavior unproven: malformed recovery passes its exclusion check, while the real orphan replacement-overlap test fails at `r0-closure-process-lifecycle.test.ts:235` when a 50 ms observation does not see purpose `recovery`. That timing-sensitive assertion is reported as a red test fixture, not counted as an extra defect.

### 2.2 P1 — deferred fatal/checkpoint settlement is one-shot

**Source**

- `src/agents/mission-manager.ts:1378-1418`: `deferTerminalizationUntilQuiesced()` invokes `deferredSettlement` once. A false result logs retained ownership, then `.finally` clears `completionContinuation`; there is no retry, timer or later invocation.
- `src/agents/mission-manager.ts:1367-1375`: the ordinary path does not await that continuation before returning `claimedResult`.
- Fatal/checkpoint-integrity branches install settlement closures only after immediate settlement fails.

**Executed evidence**

`deferred-settlement.ts`, `deferred-results.json`, and `logs/deferred-verdict2.log` cover both variants after lease acquisition. The executor creates malformed process evidence; for the checkpoint case it additionally replaces the just-created valid checkpoint with malformed bytes and throws a real `CheckpointIntegrityError`. Before deleting the transient malformed process fixture, each mission was `running`, retained its lease and preserved the malformed process bytes. After deleting only that fixture and waiting 1200 ms:

```json
{
  "status": "running",
  "lease": true,
  "deferred": true,
  "continuation": false
}
```

`run()` then returned `running`. No automatic settlement occurred. Only explicit `manager.cancel()` settled each mission, to `cancelled`, with lease release.

A real two-process control (`fatal-resume-parent.ts`, `fatal-resume-child.ts`, `fatal-resume-results.json`, `logs/fatal-resume-current.log`) narrows the defect: after the first owner exited with `running` and its lease present, deleting the blocker and explicitly starting a replacement resumed to `failed` with no lease. Replacement recovery after owner exit works; the original live owner has no functioning deferred retry and its normal `run()` completion is misleading.

**Correction**

Keep the original run pending until settlement completes, or provide bounded observable retry/handoff that re-enters settlement when blockers clear. Returning `running` with no active continuation must not constitute a finished attempt. Cover transient failures of both fatal and checkpoint-integrity settlement.

### 2.3 P1 — cancellation destroys damaged checkpoint evidence

**Source**

- `src/agents/mission-manager.ts:1247-1265`: `finalizeCancelled()` writes a new checkpoint with reason `cancelled` without first loading/validating existing checkpoint bytes.
- The checkpoint path at `mission-manager.ts:1084-1125` and `lifecycle.ts:205-217` atomically replaces the file.
- This conflicts with the checkpoint-integrity branch's explicit requirement to preserve damaged evidence.

**Executed evidence**

The checkpoint case began with exact bytes `{independent checkpoint damage`. They remained intact during blocked integrity handling. After the process blocker was removed and explicit cancellation succeeded, `deferred-results.json` records:

```json
{
  "damagedCheckpointPreserved": false,
  "checkpointRaw": "{\n  ...\n  \"reason\": \"cancelled\"\n}"
}
```

The original malformed bytes were replaced by a newly generated valid checkpoint.

**Correction**

Checkpoint integrity failure must remain fail-closed across cancellation too. Preserve the original damaged file and record cancellation/recovery metadata separately. Add a byte-preservation assertion to cancellation-after-damaged-checkpoint coverage.

### 2.4 P1 — truthful terminal response does not settle terminal-plus-live-evidence state

**Fixed portion**

The former blind early return is removed. `mission-manager.ts:809-821` now calls `settleAvailableProcessGroups()` for terminal statuses. The API terminal route at `server.ts:398-410` also propagates non-quiescence. Current direct and API behavior must not be reported as falsely returning `quiesced:true` for a blocked terminal mission.

**Remaining executed reproduction**

`terminal-cancel-late-effect.ts`, `terminal-cancel-late-results.json`, and `logs/terminal-cancel-verdict.log` use a persisted `cancelled` mission plus a valid mission-scoped record for a real detached SIGTERM-resistant child with a separately live recorded owner. At return:

```json
{
  "cancelled": false,
  "quiesced": false,
  "status": "cancelled",
  "pending_operations": 1,
  "processAlive": true,
  "recordPreserved": true,
  "lateExists": false
}
```

After 1400 ms, status was still `cancelled`, the process and record remained, and the child wrote `late terminal effect from 458410`. A separate malformed already-`cancelled` case in `direct-process-results.json` likewise returned `cancelled:false, quiesced:false` and preserved the malformed bytes.

This fixture deliberately creates terminal-plus-surviving-evidence state; it does **not** assert that every ordinary new cancellation creates that state. It demonstrates that current terminal recovery reports the problem but leaves the persisted terminal claim and live effect unresolved, with no retained owner. Depending on the intended terminal contract, either safely reconcile such state before treating cancellation as complete or expose it as an explicit nonterminal recovery-required condition with durable ownership. A truthful error alone does not quiesce the side effect.

## 3. Validation results and positive controls

| Area | Current result | Evidence |
|---|---|---|
| Focused real-process suite | **FAIL: 6 passed, 2 failed out of 8** on a stable source hash snapshot; see failure qualification below | `logs/helper-process-report.log` |
| TypeScript | **PASS** — final `tsc --noEmit` has no diagnostics | `logs/typecheck-verdict2.log` |
| Interface suite | **PASS: 90 checks** | `logs/helper-interfaces-current.log` |
| Real resistant SIGTERM | **PASS** — paused/lease release await process settlement | process suite test 1 |
| Direct post-SIGKILL cancellation | **PASS** — orphan reaped before `cancelled`; no late effect | process suite test 3 |
| Orphan reconciliation after SIGKILL | **TEST FAIL / fixture timing** — test 4 expects a `recovery` lease exactly 50 ms into reconciliation; this is not counted as another product defect | process suite test 4 |
| Fatal while process identity blocked | **PASS only for no premature finalization** | process suite test 6; later retry is Finding 2.2 |
| Checkpoint while process identity blocked | **Independent PASS for no premature finalization; repository fixture FAIL** — test 7 pre-creates process evidence before `run()`, which the new acquisition barrier intentionally rejects; its wait therefore times out | `logs/deferred-verdict2.log`; process suite test 7 |
| Repeated SIGTERM after transient failure | **PASS** | process suite test 8; independent `logs/signal-double.log` ended `RUN_RESOLVED paused`, exit 143 |
| Active-manager cancellation retry | **PASS** — transient block, retry to `cancelled`, repeated clean terminal cancellation | `positive-and-fences-results.json`, `logs/positive-final.log` |
| Ordinary fatal/checkpoint paths without process blockers | **PASS** — `failed` / `paused`, lease released, damaged checkpoint preserved | same |
| Recovery/replacement exclusion | **PASS** — replacement cannot enter during recovery; resume succeeds once paused | same, `orphan_recovery_excludes_overlap_then_allows_resume` |
| API synchronous runner rejection | **PASS** — HTTP 200 start, mission remains `approved`, lease retained, secret redacted | `api-rejected-results.json`, `logs/api-rejected-current.log` |
| Deferred stale API failure vs replacement owner | **PASS in focused interface suite** | `logs/helper-interfaces-current.log` |

The process suite's two failing fixtures make the integrated validation gate red but are not silently misclassified as proven runtime defects. The independent probes—not test count alone—ground the P1 verdict. Typecheck is green for the final lifecycle edit.

## 4. Principal commands

Run from `/home/nox/awe-group-cleanroom-20261112`, with logs beneath `.r0-work/final-lifecycle-reqa-20261113-01/logs/`:

```bash
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR="$PWD/.r0-work/final-lifecycle-reqa-20261113-01/helper-suite-report-state" \
  node --import tsx --test src/tests/r0-closure-process-lifecycle.test.ts \
  > .r0-work/final-lifecycle-reqa-20261113-01/logs/helper-process-report.log 2>&1
# exit 1: 6 passed, 2 failed out of 8; source hashes stable at start/end

env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR="$PWD/.r0-work/final-lifecycle-reqa-20261113-01/interface-suite-current-state" \
  node --import tsx src/tests/r0-closure-interfaces.test.ts \
  > .r0-work/final-lifecycle-reqa-20261113-01/logs/helper-interfaces-current.log 2>&1
# exit 0: 90 checks passed

env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 npx tsc --noEmit \
  > .r0-work/final-lifecycle-reqa-20261113-01/logs/typecheck-verdict2.log 2>&1
# exit 0: no diagnostics
```

Each independent command below used this prefix and the listed fresh data root beneath the audit root:

```bash
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR="$PWD/.r0-work/final-lifecycle-reqa-20261113-01/<case-state>"
```

```bash
node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/terminal-cancel-late-effect.ts
# terminal-late-state; exit 0: truthful blocked result followed by a real late effect

node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/direct-blocked-late-effect.ts
# direct-blocked-state; exit 0: blocked cancellation, no lease, real late effect

node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/direct-process-evidence.ts
# direct-process-state; exit 0: malformed/foreign-live evidence blocks but lease is absent

node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/deferred-settlement.ts
# deferred-state; exit 0: corrected after-acquisition probe; fatal/checkpoint stay running after blocker removal

node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/fatal-resume-parent.ts
# fatal-resume-state; exit 0: first owner returns running, explicit replacement settles failed

node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/positive-and-fences.ts
# positive-state; exit 0: retry, ordinary finalization and recovery ownership controls pass

node --import tsx .r0-work/final-lifecycle-reqa-20261113-01/api-rejected-independent.ts
# api-rejected-state; exit 0: approved/leased with redacted rejection evidence
```

For `signal-double.ts`, the offline child received SIGTERM after `SPECIALIST_STARTED`, then a second SIGTERM after 150 ms. It logged `SPECIALIST_DONE`, `RUN_RESOLVED paused`, and exited 143.

The command form shown without shell redirections is a compact description; the captured final outputs are `terminal-cancel-verdict.log`, `direct-blocked-verdict.log`, `direct-process-verdict.log`, `deferred-verdict2.log`, `fatal-resume-current.log`, `positive-final.log`, and `api-rejected-current.log`. Some of those real-process controls predate the final lease-acquisition barrier; where the barrier invalidated a schedule (the original deferred probe), it was corrected and rerun rather than cited as a current failure.

## 5. Coverage and limitations

- Offline Linux lifecycle audit only. No live model, network provider, Windows computer-use, browser, MCP server, deployment, container supervisor or multi-host filesystem was tested.
- Real OS children were used for decisive process, late-effect and signal cases. Offline injected executors/planners/reviewers do not establish provider behavior.
- Durable Linux registered process groups were tested; unregistered grandchildren, foreign-host recovery, all PID-reuse scenarios and external supervisors are not certified.
- The full repository suite was not run. Focused suites and probes are listed above. Green interface checks do not outweigh the red process suite, typecheck or reproduced lifecycle defects.
- The terminal fixture intentionally starts from terminal-plus-surviving-evidence state. It proves current recovery leaves that state unresolved; it is not evidence that clean cancellation normally creates it.

## 6. Final adjudication

The false terminal `quiesced:true` defect is corrected in the current snapshot, and several difficult process/signal paths now pass. However, unresolved cancellation/recovery ownership, one-shot deferred settlement, damaged-checkpoint destruction and unresolved terminal live effects remain concrete P1 failures. The current tree also has a red real-process regression.

**Final independent verdict: FAIL — R0 offline lifecycle is not closed.**  
**Production/live readiness: NOT ESTABLISHED.**
