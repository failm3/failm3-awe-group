# R0 independent lifecycle / cancellation / recovery audit

**Date:** 2026-11-13  
**Overall offline verdict:** **FAIL — DO NOT CLOSE R0**  
**Production / live-provider verdict:** **NOT ESTABLISHED**  
**Scope:** independent review of the integrated closure work described by `reports/r0-final-closure-reqa.md` and `NOX-R0-FINAL-ENGINEERING-REPORT.md`, with emphasis on `mission-manager.ts`, `lifecycle.ts`, `process-registry.ts`, `tools/index.ts`, signals, SIGKILL ownership, and terminal/resumable publication.

## 1. Executive result

The new registered-process-group mechanism is real and materially improves the prior implementation. It registers detached shell groups before releasing their command gate, validates PID/PGID/start identities, escalates resistant groups, preserves malformed evidence, and is called before the ordinary orphan `paused` transition. A fresh replacement-owner interleaving also passed.

It does **not** close the lifecycle requirement. Two independent P0 paths still publish terminal state without establishing process quiescence:

1. public unowned/direct cancellation never calls the process registry reaper and reports `quiesced:true`; a real resistant descendant subsequently wrote its late-effect file;
2. fatal-error and checkpoint-integrity finalization discard the result of `quiesce()`; a real controlled descendant wrote **after** `run()` returned and persisted `failed` with its lease released.

A third executed case shows that failed SIGTERM quiescence permanently caches the failed attempt, resolves `run()` with the mission still `running`, and lets callers uninstall signal handlers while ownership remains. A second SIGTERM then killed the fixture by default disposition, leaving `running` state and its lease behind.

These are not hypothetical provider limitations. They were reproduced using the real manager, storage, lease, signal, shell, and process-registry implementations with real local child processes. Injected executors/planners were used only to make adverse schedules deterministic and offline.

## 2. Evidence policy and isolation

### Executed evidence

All offline state roots and child work directories were newly created below:

```text
.r0-work/independent-lifecycle-audit-20261113-01/
```

The successful adversarial runner was:

```bash
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 node --import tsx \
  .r0-work/independent-lifecycle-audit-20261113-01/probe.ts
```

Final output: `AUDIT_PROBES_REPRODUCED_ALL_THREE_DEFECTS` (exit 0). Raw evidence:

- `.r0-work/independent-lifecycle-audit-20261113-01/evidence.json`
- `.r0-work/independent-lifecycle-audit-20261113-01/probe-console.log`

The ownership interleaving was run separately:

```bash
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 node --import tsx \
  .r0-work/independent-lifecycle-audit-20261113-01/ownership-fence.ts
```

Final output: `REPLACEMENT_OWNER_FENCE_PASS` (exit 0). Raw evidence:

- `.r0-work/independent-lifecycle-audit-20261113-01/ownership-evidence.json`
- `.r0-work/independent-lifecycle-audit-20261113-01/ownership-console.log`

No provider credentials, paid provider, network service, real/default `.awe-data`, deployment, `/goal`, or Git mutation was used. Production source and production tests were not modified. Probe cleanup removed all records from the main isolated `state/process-groups` directory; evidence deliberately retains the late-effect files that the descendants created before cleanup.

### Source-derived versus executed claims

- Findings 1–3 below have **executed offline reproductions**.
- The checkpoint-integrity variant in Finding 2 and the API fallback noted there are **source-derived extensions** of the same missing-result check; they were not separately executed.
- D1/D2/D3/D7/D9 and the non-process parts of D4–D6 are source-scoped assessments, not live-provider or real-browser certification.

## 3. Findings

### 3.1 P0 — direct/unowned cancellation bypasses process reaping and lies about quiescence

**Locations**

- `src/agents/mission-manager.ts:785-824` — `cancelMission()` acquires a lease, writes `status:"cancelled"`, stores `cancellation.quiesced:true` and `pending_operations:0`, seals the mission, and releases the lease.
- `src/agents/mission-manager.ts:791-795` — already-terminal records return `quiesced:true` without examining process evidence.
- `src/agents/mission-manager.ts:1142-1146` — a manager without a local `runPromise` falls back to this public function.
- `src/api/server.ts:389-414` — the production cancel endpoint uses it whenever no active manager exists in that API process.
- Contrast `src/agents/lifecycle.ts:840-875`: orphan recovery does invoke `reapOrphanedMissionProcessGroups()` before publishing `paused`; direct cancellation has no equivalent step.

**Why this is reachable**

After an owner's SIGKILL, no manager exists in a later CLI/API process. `cancelMission()` can acquire the dead owner's mission lease, but acquisition proves neither JS-operation nor OS-descendant settlement. The durable registry specifically exists because those descendants may survive the owner. The direct path neither calls the current-owner nor orphan reaper, and it does not even reject malformed or non-current-owner process records.

A second direct cancellation after a manager reported `quiesced:false` can reach the same bypass once the first runner releases or loses its lease. The early return for an already-`cancelled` mission also perpetuates the false clean result.

**Executed reproduction**

`probe.ts` started the real shell tool in a separate owner process, waited for a SIGTERM-resistant child, SIGKILLed the owner, and then invoked the real public `cancelMission()` from a new process. The resistant child had a scheduled late file write.

Observed in `evidence.json:2-58`:

```json
{
  "result": {
    "cancelled": true,
    "quiesced": true,
    "status": "cancelled",
    "pending_operations": 0,
    "forwarded": false
  },
  "atCancel": { "records": ["<mission>--<launch>.json"], "lateExists": false },
  "afterWait": { "status": "cancelled", "lateExists": true }
}
```

The process record survived cancellation, and the late effect appeared while the mission remained terminal `cancelled`. Cleanup subsequently invoked the real orphan reaper, which could reclaim the group because its original owner was confirmed dead.

**Expected**

No `cancelled`, `quiesced:true`, or lease release until all registered mission groups and tracked operations are accounted for. If records are malformed, ownership is uncertain, or a group survives, cancellation must remain explicitly pending/blocked and preserve evidence.

**Required correction**

Use one fenced settlement routine for active-manager, direct/unowned, API, and repeated cancellation paths. For an unowned mission, acquire/retain the lease, reap orphan process groups with owner/start verification, wait for applicable local operations, and only then terminalize. Return a non-quiesced blocked result instead of `quiesced:true` on any error. Apply the same scrutiny before claiming that an already-terminal mission is quiesced, or persist the original non-quiesced terminal metadata and expose it.

### 3.2 P0 — fatal and checkpoint-integrity finalization ignore failed quiescence

**Locations**

- `src/agents/mission-manager.ts:1399-1444` — `settleFailure()`.
- `src/agents/mission-manager.ts:1412-1433` — checkpoint-integrity errors call `await this.quiesce(...)` but ignore its `{quiesced,pending}` result and write `status:"paused"`.
- `src/agents/mission-manager.ts:1435-1444` — generic fatal errors likewise ignore the result, seal the mission, and write terminal `status:"failed"`.
- `src/agents/mission-manager.ts:1273-1283,1315-1320` — when no JS operation remains in `inflight`, `runOwned()` calls `finish()` even if process quiescence was blocked; `finish()` releases the lease.
- `src/api/server.ts:166-190` — source-derived related risk: the fallback `recordExecutionFailure()` can write `failed` on a rejected managed run without process reaping. It should share the corrected settlement result rather than introduce another terminal-write fallback for unknown settlement.

This differs from timeout and explicit manager cancellation, which inspect `q.quiesced` and retain `running` when settlement is not established (`mission-manager.ts:1171-1187,1360-1380`). The generic failure and integrity branches omit that guard entirely.

**Executed reproduction**

The fatal-path probe:

1. launched a real controlled, SIGTERM-resistant descendant through the production `shellTool` and obtained its durable active process-group record;
2. changed only that fixture record's `group_start_ticks` to a wrong value, forcing the production identity check to refuse signaling rather than risk killing a reused PGID;
3. used an injected offline `planMission` that throws, driving the real `settleFailure()` generic fatal path;
4. waited for `manager.run()` to return;
5. only then created a trigger file instructing the still-running fixture to perform its late write.

Observed in `evidence.json:76-152`:

```json
{
  "atReturn": {
    "result": { "mission": { "status": "failed" }, "review": null },
    "persisted": { "status": "failed" },
    "lease": null,
    "records": ["<mission>--<launch>.json"],
    "lateExists": false
  },
  "afterWait": {
    "status": "failed",
    "lateExists": true,
    "records": ["<mission>--<launch>.json"]
  }
}
```

The clock cannot explain this result: the late-effect trigger did not exist at `run()` return. A real OS descendant performed an effect after terminal failure, after the manager returned, and after ownership had been released.

For cleanup, the probe restored the fixture's original authenticated start identity and used `quiesceCurrentMissionProcessGroups()` to stop only that registered group.

**Expected**

`quiesced:false` must forbid terminal `failed`, resumable `paused`, and lease release. Preserve `running`/blocked recovery metadata, the checkpoint, process records, and ownership until a bounded continuation or external recovery establishes settlement. The same rule applies to checkpoint-integrity pause and any API failure fallback.

### 3.3 P1 — a transient signal-quiescence failure is permanently cached; `run()` settles and handlers are removed while the mission remains owned/running

**Locations**

- `src/agents/mission-manager.ts:1082-1087` — every signal returns the same `exitPromise`, including an already-resolved `false` result.
- `src/agents/mission-manager.ts:1089-1128` — failed quiescence resolves `false`; there is no later retry/continuation.
- `src/agents/mission-manager.ts:1273-1283` — `runOwned()` merely awaits that attempt. On `false`, it does not call `finish()` and does not invoke `deferTerminalizationUntilQuiesced()`. It then returns normally.
- `src/agents/mission-manager.ts:2584-2597` — handlers exit only on `true`.
- `src/index.ts:136-150` — the real CLI's `executeMission()` uninstalls handlers in `finally` whenever `run()` returns. The same normal settlement/uninstall pattern was used by the isolated child fixture.

**Executed reproduction**

An offline injected executor deliberately ignored abort for 900 ms. The manager's first quiescence budget was 100 ms, and the real SIGTERM handlers were installed. After the first SIGTERM, the underlying work settled; a second SIGTERM was sent later.

Observed in `evidence.json:60-74`:

```json
{
  "beforeSecond": {
    "alive": true,
    "stdout": "AUDIT_RUN_RESULT running\n"
  },
  "afterSecond": {
    "alive": false,
    "exitCode": null,
    "signalCode": "SIGTERM",
    "stdout": "AUDIT_RUN_RESULT running\n"
  },
  "status": "running",
  "leaseExists": true
}
```

The first attempt did not publish `paused`, but `run()` resolved `running` before the non-cooperative operation's eventual settlement. The fixture's normal `finally` then uninstalled the handlers. The second SIGTERM therefore used default termination rather than a fresh guarded quiescence attempt. Persisted state stayed `running` and the lease file survived.

In a long-lived process whose handlers remain installed, the cached `false` instead makes repeated signals no-ops forever. In either embedding there is no automatic quiescence continuation after the underlying operation eventually settles.

**Expected**

Keep `run()` unsettled while termination is pending, or explicitly document and implement a durable pending state with a continuation. A subsequent termination request must be able to retry after pending work/processes settle, and signal handlers must not be uninstalled merely because a non-quiesced attempt returned. A forced hard-kill policy, if desired, must be explicit and still leave recoverable orphan/process evidence.

## 4. Positive lifecycle checks

### 4.1 Registered shell launch and ordinary reaping — source-scoped PASS

`src/tools/index.ts:230-301` prepares a durable launch record before releasing the gate, attaches a detached PID/PGID, and routes natural close, error, abort, output limit, and timeout through `quiesceRegisteredProcessGroup()`. `src/utils/process-registry.ts:321-369` escalates SIGTERM to SIGKILL, checks actual group membership rather than only shell close, and removes the record only after group disappearance and supplied close settlement.

The pre-execution gate and PGID/start validation address the original ordinary spawn/termination gap. The existing green lifecycle tests are useful happy-path regressions, but were not treated as a substitute for the adverse probes above.

### 4.2 Malformed/orphan identity handling — PASS for the inspected reaper, not for all callers

`src/utils/process-registry.ts:203-245` rejects malformed, cross-mission, symlink, and unsafe identities while preserving the record. `248-310` requires verified owner death and handles zombies/group scans conservatively. `reapOrphanedMissionProcessGroups()` blocks live/unknown owners, launching records, malformed records, and surviving groups (`378-417`).

The fatal-path probe independently confirmed that a wrong group start identity prevents signaling. Findings 1–2 are caller bypasses, not evidence that this identity validation should be weakened.

### 4.3 Replacement-owner fence — executed PASS

The probe seeded a running mission with a confirmed-dead generation-1 lease, began `reconcileOrphanedMissions()`, and synchronously acquired a live generation-2 replacement lease while reconciliation awaited its reaper.

`ownership-evidence.json` shows generation 2 retained, mission status `running`, and `paused:[]`; no stale paused write occurred. After the replacement released its lease, a second reconciliation changed the mission to `paused`. This exercises the revision and live-owner fence at `src/agents/lifecycle.ts:827-875` and confirms the intended stale-recovery protection for that schedule.

### 4.4 Existing process suite coverage is incomplete

`src/tests/r0-closure-process-lifecycle.test.ts:104-127,182-211` covers successful resistant-group SIGTERM and SIGKILL/orphan reaping. Its malformed-record case (`129-180`) correctly requires orphan recovery to block and preserve evidence. Those are valuable controls.

The suite does not cover direct `cancelMission()`, generic fatal failure, checkpoint-integrity failure with blocked process evidence, a first failed signal quiescence followed by eventual settlement/repeated signal, `run()` settlement on failed signal handling, or replacement ownership during the reaper await. A source search found no such adverse cases in that suite. The green settled-happy-path tests therefore do not contradict Findings 1–3.

## 5. D1–D9 current assessment

This matrix distinguishes this lifecycle-focused audit's executed evidence from source-only adapter/core checks. It does not silently inherit the prior report's FAIL verdicts where the integrated code now contains remediations.

| Item | Current result | Basis and limits |
|---|---|---|
| **D1 — stale-owner file-write fencing** | **PASS — source scope** | `file_write` performs directory/file/optional artifact effects under `withMissionWrite` with signal/fence checks (`src/tools/index.ts:337-352`). No hostile-local-writer certification is claimed. |
| **D2 — browser ownership after discovery** | **PASS — adapter source boundary** | The browser adapter rechecks permission/fence/abort immediately before raw MCP execution and forwards the signal (`src/tools/browser.ts:215-240`). No live MCP/Chromium run was made. |
| **D3 — artifact integrity and same-name repair** | **PASS — source scope** | Integrity gates require backing bytes/hash/size (`mission-manager.ts:487-526,707-755`); supersessions are bound to checkpoint provenance and operator decisions (`637-669`), and cross-name resolution keeps an expected name (`681-705`). This audit did not rerun the core artifact suite. |
| **D4 — universal `AWE_DATA_DIR` isolation** | **PASS for reviewed wiring; executed for probes** | Shell propagates only the resolved isolated state root for AWE-aware children (`src/tools/index.ts:220-228`); CLI loads `.env` before dynamic storage/lifecycle imports (`src/index.ts:10-16`). Every child in this audit used a fresh audit-root state directory. |
| **D5 — web-search cancellation** | **PASS — prior scoped contract; shared transport reviewed** | No new search-specific adverse test was run here. The shared HTTP callbacks now have idempotent finish/abort handling and late-event guards (`src/tools/index.ts:436-545`). This is not live-network evidence. |
| **D6 — browser cancellation / shared discovery** | **PARTIAL — adapter only** | Last-waiter cancellation accounts for shared operation/disconnect settlement (`src/tools/browser.ts:70-196`; `src/config/mcp.ts:29-69`). Real MCP subprocess and Chromium process-tree teardown were not executed and are outside the shell process registry's demonstrated coverage. |
| **D7 — delegate call-specific signal** | **PASS — source wiring** | Production delegate forwards current signal/fence/effect marker (`src/agents/specialists.ts:108-135`), and recursion combines and passes them to child specialists (`src/agents/recursion.ts:457-470,555-576`). |
| **D8 — single-owner recovery / effect ambiguity** | **FAIL — P0** | Findings 1 and 2 demonstrate terminal state plus late OS effects; Finding 3 demonstrates unresolved signal settlement. The replacement-owner fence itself passed (§4.3), and checkpoint validation is now fail-closed, but those controls are bypassed by the reported finalization paths. |
| **D9 — explicit empty recursive grants** | **PASS — source wiring** | Explicit child grants are preserved and checked against the parent ceiling (`src/agents/recursion.ts:482-496`); specialist construction never substitutes all tools for an empty/unknown grant (`src/agents/specialists.ts:146-168`). |

Additional core closure items visible in source now include non-empty acceptance criteria schemas and manager guards (`src/types/index.ts:19-27`; `src/agents/mission-manager.ts:1219-1224`), exact stored-plan identity validation, and malformed/unreadable/wrong-mission checkpoint errors. They do not mitigate the process-lifecycle defects above.

## 6. Required closure tests after remediation

At minimum, add production-path regressions for:

1. direct/API cancellation after owner SIGKILL with a real resistant process and a post-cancel effect attempt;
2. direct cancellation when a prior manager cancellation returned `quiesced:false`;
3. malformed, non-current-owner, stale-PGID, and surviving-group process records on every terminal/paused entry point;
4. generic fatal and checkpoint-integrity finalization with process quiescence forced to fail, asserting no terminal/resumable state or lease release;
5. first SIGTERM quiescence timeout, later underlying settlement, repeated SIGTERM/SIGINT, and `run()`/handler-uninstall behavior;
6. replacement ownership during process reaping, including a replacement-launched group, while retaining the positive revision/live-owner fence test;
7. integration of these cases into the documented offline gate with fresh allowed state roots, rather than adding only settled-success tests.

## 7. Final verdict

The integrated tree has meaningful process-lifecycle improvements, and the reviewed orphan replacement fence passed. Nevertheless, direct cancellation and generic failure finalization still provide concrete terminal-state/late-effect violations, while failed signal quiescence has no sound settlement/retry lifecycle.

**Independent QA verdict: FAIL — R0 remains open.** No production readiness or live-provider/browser certification is inferred from these offline probes.
