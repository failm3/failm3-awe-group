# NOX R0 — Final Integrated Core Independent Re-QA

**Audit date:** 2026-11-13  
**Audit workspace:** `/home/nox/awe-group-cleanroom-20261112`  
**Evidence root:** `.r0-work/final-integrated-reqa-20261113/core/`  
**Decision rule:** PASS requires zero reproduced in-scope P0/P1 defects.

# Verdict: **FAIL**

**Reproduced severity count: P0 = 0; P1 = 4 distinct root causes.**

The frozen core/recovery/deliverable snapshot must not be accepted as R0-closed. Four production-path recovery and artifact-lineage defects were reproduced offline. Two can discard or permanently block required recovery; two can turn a genuine same-name repair into unnecessary further work and terminal failure despite valid current bytes.

This is an **offline core audit verdict only**. It is not a claim about live providers, external integrations, production deployment, or real model quality. No production source, committed test, package script, or Git state was modified. Detailed machine-readable reproduction evidence is in `logs/verdict-evidence.json`.

---

## 1. Decision summary

| ID | Severity | Reproduced defect | Decisive observed result |
|---|---|---|---|
| F-01 | **P1** | Ordinary effect-bearing failed delegations are terminalized and their unresolved intents deleted | Both returned-failure and thrown-failure variants ended `failed`; checkpoint absent; explicit resolution rejected because only paused missions are resolvable |
| F-02 | **P1** | A dead crashed recovery owner cannot be replaced | After child `SIGKILL` and TTL expiry, `lease_live=false`, but reconciliation twice reported `skipped_live`; recovery/run/resume/cancel acquisition all denied |
| F-03 | **P1** | One explicit retry of an ambiguous same-name repair triggers two more repairs and still fails | Initial repair effect = 1; post-`retry` repair effects = 2; final `failed`; original A remained unregistered. `accept` control completed with zero post-resolution effects |
| F-04 | **P1** | Crash between committed same-name repair provenance and mission metadata loses the usable A→B link | Recovery paused correctly, but resume ran another repair, recorded only B→C, and ended `failed` because original A was still unregistered |

The ordinary passing suites below are useful regression controls, but they do not cover these schedules and do not override the reproduced failures.

---

## 2. Reproduced P1 findings

### F-01 — P1: effect-bearing ordinary failures irreversibly lose explicit recovery

**Production locations**

- `src/agents/mission-manager.ts:1864-1875`: failed outcomes with a durable effect footprint retain their intent.
- `src/agents/mission-manager.ts:1928-1985`: unresolved intents can correctly produce paused recovery, but ordinary terminal finalization does not invoke this guard.
- `src/agents/mission-manager.ts:2502-2536`: terminal `failed` is written and `clearCheckpoint()` is called.
- `src/agents/mission-manager.ts:2554-2575`: explicit resolution requires a paused mission and an extant ambiguous checkpoint intent.

**Exact launcher** (also recorded in `logs/ordinary-failure-recovery.command.txt`):

```sh
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/ordinary-failure-launcher/data \
  TMPDIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/ordinary-failure-launcher/tmp \
  HOME=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/ordinary-failure-launcher/home \
  AUDIT_ROOT=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core \
  PROJECT_ROOT=/home/nox/awe-group-cleanroom-20261112 NO_COLOR=1 \
  node --import /home/nox/awe-group-cleanroom-20261112/node_modules/tsx/dist/loader.mjs \
  /home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/probes/ordinary-failure-recovery.ts
```

The injected offline specialist called `beginEffect`, appended one receipt, registered a real artifact, and then either returned `success:false` or threw. QA supplied an otherwise passing review. The probe executes real production `MissionManager`, storage, lifecycle, artifact registration, intent and resolution code.

**Exact decisive output summary** from `logs/ordinary-failure-recovery.json`:

| Variant | executions | receipt effects | reviews | returned/persisted status | checkpoint present | retained intent | resolution error |
|---|---:|---:|---:|---|---|---|---|
| returned | 1 | 1 | 1 | `failed` / `failed` | false | false | `MissionStateError: Mission ordinary-failed-returned is 'failed'; ambiguous outcomes can only be resolved while paused` |
| thrown | 1 | 1 | 1 | `failed` / `failed` | false | false | `MissionStateError: Mission ordinary-failed-thrown is 'failed'; ambiguous outcomes can only be resolved while paused` |

Both variants also had `recovery_blocked=null`. Reproduction count: **2/2 variants**, one root cause.

**Why this is P1:** a recorded failure does not establish that the marked external effect did not occur. Terminalizing and deleting the only resolvable intent irreversibly removes the operator's accept/retry path. Expected safe behavior is paused recovery with the intent retained until explicit resolution.

### F-02 — P1: crashed recovery ownership permanently blocks all recovery routes

**Production locations**

- `src/agents/lifecycle.ts:668-684`: after live/dead-owner checks, any existing lease whose purpose is `recovery` unconditionally denies the next acquisition, including another recovery acquisition.
- `src/agents/lifecycle.ts:827-910`: orphan reconciliation requires this recovery lease; failed acquisition becomes `skipped_live`.
- `src/agents/mission-manager.ts:905-965`: direct cancellation also depends on ownership or forwarding to the recorded owner.

**Exact launcher** (also in `logs/crashed-recovery-owner.command.txt`):

```sh
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/crashed-recovery-launcher/data \
  TMPDIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/crashed-recovery-launcher/tmp \
  HOME=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/crashed-recovery-launcher/home \
  AUDIT_ROOT=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core \
  PROJECT_ROOT=/home/nox/awe-group-cleanroom-20261112 NO_COLOR=1 \
  node --import /home/nox/awe-group-cleanroom-20261112/node_modules/tsx/dist/loader.mjs \
  /home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/probes/crashed-recovery-owner.ts
```

A real child called production `tryAcquireMissionLease(id, "recovery", {ttlMs:100})`; the parent waited for the on-disk owner and killed the child with `SIGKILL`. This creates, through the production lease API, exactly the durable ownership left by a reconciler killed between acquisition and its `finally` release. It is a lease-crash reproduction, not a claim that the probe executed the remainder of a real reconciliation.

**Exact decisive output** in `logs/crashed-recovery-owner.json`:

```text
child_exit.signal = SIGKILL
before_reconciliation.lease_live = false
before_reconciliation.status = running
first_report.paused = []
first_report.skipped_live = [crashed-recovery-owner]
after_first.status = running
acquisitions_after_confirmed_death_and_expiry = {
  recovery: DENIED, run: DENIED, resume: DENIED, cancel: DENIED
}
cancellation = { cancelled:false, quiesced:false, forwarded:true, status:running }
second_report.skipped_live = [crashed-recovery-owner]
after_second.status = running
defect_reproduced = true
```

The dead PID was `480262`; its recovery lease had `ttl_ms=100`. The lease was still durable after both reconciliation attempts.

**Why this is P1:** TTL expiry and confirmed owner death cannot restore service. Running or paused state can remain permanently non-resumable and non-cancellable without manual deletion/repair of internal state. A replacement recovery owner should reverify death and process-group quiescence rather than being refused solely by the stale recovery marker.

### F-03 — P1: explicit same-name repair retry repeats twice and cannot reconnect A

**Production locations**

- `src/agents/mission-manager.ts:577-621`: `deriveSupersessions()` only links predecessors in `visibleBefore`.
- `src/agents/mission-manager.ts:2194-2223`: explicit retry is converted into one required failed gate/repair pass.
- `src/agents/mission-manager.ts:2399-2448`: further repair provenance and evidence gating.
- `src/agents/mission-manager.ts:2703-2731`: drops the ambiguous intent and stages retry.

**Exact successful launcher** (also appended to `logs/same-name-repair-retry.command.txt`):

```sh
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/same-name-repair-launcher-rerun/data \
  TMPDIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/same-name-repair-launcher-rerun/tmp \
  HOME=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/same-name-repair-launcher-rerun/home \
  AUDIT_ROOT=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core \
  PROJECT_ROOT=/home/nox/awe-group-cleanroom-20261112 NO_COLOR=1 \
  node --import /home/nox/awe-group-cleanroom-20261112/node_modules/tsx/dist/loader.mjs \
  /home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/probes/same-name-repair-retry.ts
```

The probe uses the genuine production failed-repair recovery path to create an ambiguous same-name repair state, then compares the two explicit decisions under identical offline logic. The accept arm is a positive control, not a reported defect.

| Decision | Initial repair effects | Post-resolution repair effects | Total receipt effects | Resumed originals | Final status | Supersession outcome |
|---|---:|---:|---:|---:|---|---|
| `accept` | 1 | **0** | 1 | 0 | `completed` | operator-accepted A→B |
| `retry` | 1 | **2** | 3 | 0 | **`failed`** | B→C then C→D; no A link |

For `retry`, the two exact blockers were:

```text
Delegation 'executor' artifact 'e568c965-378a-4e46-bccd-e53d726248a0' is not registered
Delegation 'executor' artifact 'e568c965-378a-4e46-bccd-e53d726248a0' is not registered
```

The ID above is original A. B was the visible same-name artifact at retry time, so the next repair recorded B→C only. Original A remained an unresolved reference in the completed delegation. Stored plans were reused (`resume_plans=0`) and original work was not repeated.

**Why this is P1:** the operator authorized one retry, but production performed two subsequent repairs and deterministically exhausted recovery with a terminal failure. This breaks both explicit resolution semantics and same-name deliverable recoverability. Evidence: `logs/same-name-repair-retry.json` and `logs/same-name-repair-retry-rerun.log`.

### F-04 — P1: committed repair provenance is not sufficient after the checkpoint/metadata crash window

**Production locations**

- `src/agents/mission-manager.ts:2399-2427`: A→B provenance and repair-intent closure are checkpointed first; metadata is written only afterward.
- `src/agents/mission-manager.ts:562-568`: current mappings are read only from mission metadata.
- `src/agents/mission-manager.ts:639-671`: verification consumes mappings and checkpoint proof but does not reconstruct missing metadata from proof.
- `src/agents/mission-manager.ts:577-621`: subsequent derivation sees B, not hidden A, so it can only add B→C.

**Exact successful launcher** (the complete set of preceding harness attempts is also retained in `logs/repair-commit-crash.command.txt`):

```sh
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
  AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/repair-commit-launcher-anchored/data \
  TMPDIR=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/repair-commit-launcher-anchored/tmp \
  HOME=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/state/repair-commit-launcher-anchored/home \
  AUDIT_ROOT=/home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core \
  PROJECT_ROOT=/home/nox/awe-group-cleanroom-20261112 NO_COLOR=1 \
  node --import /home/nox/awe-group-cleanroom-20261112/node_modules/tsx/dist/loader.mjs \
  /home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/probes/repair-commit-crash-probe.ts
```

A child-only Node load hook inserted exactly one crash call immediately after the real `saveCheckpoint()` critical section returned and before `recordSupersessions()`. Production source files were never edited. The hook fired only for one completed A→B repair proof with `repair_iterations=1` and no repair in flight. Child `481541` then died by `SIGKILL`. All other production logic, reconciliation and resume execution ran normally.

**Exact decisive output** from `logs/repair-commit-crash.json`:

```text
setup_reproduced = true
child_exit.signal = SIGKILL
crash_marker.repair_iterations = 1
crash_marker.in_flight = []
crash_marker.repair_provenance[0].outcome = completed
crash_marker A→B:
  c3d0df5e-dfe3-4c77-baa0-67fab1a6ef61
  -> 70439bea-9fd3-4c6c-b594-ba9936ab13dd
mission_after_crash.status = running
mission_after_crash.artifact_supersessions = []
recovery_report.paused = [repair-commit-window]
recovery_report.resumable = [repair-commit-window]
recovered_status = paused
resume = { plans:0, originals:0, repairs:1, reviews:2, status:failed }
only_b_to_c_recorded = true
original_still_unregistered = true
defect_reproduced = true
```

Final blockers twice named original A `c3d0df5e-dfe3-4c77-baa0-67fab1a6ef61` as `not registered`. The sole final mapping was B `70439bea-9fd3-4c6c-b594-ba9936ab13dd` to C `22d93897-a654-421d-bf75-37cd70de9a15`; the already-durable A→B proof was not restored to mission metadata.

**Why this is P1:** a valid completed repair is present and checkpoint-proven, but a tiny crash window converts it into an unnecessary second repair and terminal deliverable failure. The checkpoint must either reconstruct the authenticated metadata lookup before gating or the checkpoint/metadata transition must be made recoverable as one logical commit.

---

## 3. Passing adversarial controls

### 3.1 Original production-module probe

Final launcher and full output:

- `logs/original-core-probe.command.txt`
- `logs/original-core-probe-final.log`
- `logs/original-core-probe.json`

The command was `env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY AWE_OFFLINE_TEST=1 ... node --import /home/nox/awe-group-cleanroom-20261112/node_modules/tsx/dist/loader.mjs /home/nox/awe-group-cleanroom-20261112/.r0-work/final-integrated-reqa-20261113/core/probes/original-core-probe.ts`; the unabridged environment and actual absolute paths are in the command log.

**Final count: 8 passed, 0 failed.** Earlier probe-development assertion failures are retained in the older logs and are not represented as production defects.

| Original probe | Actual decisive result |
|---|---|
| CAS, fence and terminal seal | stale update=`conflict`; explicit fence=`fenced`; late artifact threw `MissionSealedError` and created no file |
| Stable plan resume | plans=1, executions=1, reviews=2, receipt effects=1, final `completed`; paraphrased replacement plan was not used |
| Durable intent + explicit accept | blocked resume made 0 planner/executor/reviewer calls; accept with missing evidence rejected; valid accept finished `completed` with one execution |
| Damaged checkpoint | 0 gated calls; status `paused`; `recovery_code=malformed`; damaged SHA-256 stayed `10c547c9de36f6c22e5f664934013cfcf8fbb05e6ccd32b28672525590efbcd4` |
| Non-cooperative cancellation race | immediate `cancelled=false`, `quiesced=false`, pending=1; owner retained until settlement; abort observed; late write refused by `MissionSealedError`; 0 late artifacts; durable final status `cancelled` |
| Same-name repair tamper | same-size replacement-byte tamper detected; terminal `failed`; late bytes refused |
| Repair/agent budget | 12 original agents, 0 additional repair effects for a requested thirteenth agent, total_agents=12 |
| Standalone targeted repair | rejected by design; missions before=7, after=7; no effects |

The cancellation probe's returned in-memory run-result snapshot was still `running`; the authoritative persisted final state was `cancelled`. It was not counted as a P1 because pending work was fenced, no late effect was admitted, and durable cancellation settled correctly.

### 3.2 Focused committed regression suites

`logs/focused/commands.txt` contains the exact direct commands. The normal environment prefix for these executions was:

```sh
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY AWE_OFFLINE_TEST=1 \
  AWE_DATA_DIR=<fresh audit-local suite state>/data \
  TMPDIR=<fresh audit-local suite state>/tmp \
  HOME=<fresh audit-local suite state>/home \
  node --import tsx src/tests/<suite>.test.ts
```

| Suite | Final direct result |
|---|---:|
| `r0-runtime-manager` | 76 passed / 0 failed |
| `r0-runtime-storage-lease` | 53 passed / 0 failed |
| `r0-final-manager` | 79 passed / 0 failed |
| `artifact-reconciliation` | 10 passed / 0 failed |
| `qa-gate` | 30 passed / 0 failed |
| `r0-qa-evidence` | PASS (suite prints one overall result, not an assertion count) |

Focused run suite summary: **6 passed, 1 failed** because the unmodified `lifecycle-recovery` child harness failed during `tsx` IPC initialization. That failure was adjudicated below rather than counted as lifecycle behavior.

### 3.3 Contained copied suites with production modules symlinked

Exact per-suite commands: `logs/adapted-focused/commands.txt`, `logs/adapted-retry/commands.txt`, and `logs/r0-closure-core-timing-margin.command.txt`. Final outputs are in same-named `.log` files and consolidated in `logs/final-suite-counts.txt`.

| Copied suite | Final contained result |
|---|---:|
| `r0-closure-process-lifecycle` | 9 passed / 0 failed |
| `r0-reqa-manager` | 70 passed / 0 failed |
| `r0-independent-contracts` | 34 passed / 0 failed |
| `r0-final-production-intent` | 4 passed / 0 failed |
| `r0-closure-adapters` | 23 passed / 0 failed |
| `r0-reqa-adapters` | 3 passed / 0 failed |
| `lifecycle-recovery` (only child launcher adapted) | 12 passed / 0 failed |
| `r0-closure-interfaces` | 93 checks passed |
| `r0-final-tools` | 12 passed / 0 failed |
| `r0-closure-core` (160 ms fixture changed to 800 ms) | 13 passed / 0 failed |

Audit-local adaptations are generated reproducibly by `probes/prepare-adapted.mjs`:

1. all 22 committed test suites were copied beneath the audit root;
2. production modules and `node_modules` were symlinked, not copied or modified;
3. `/tmp/opencode/...` and other fixture paths were moved under the audit root;
4. only the lifecycle child launcher changed from the `tsx` CLI to `node --import tsx/dist/loader.mjs`;
5. only for the margin run, the genuine-repair QA fixture timeout changed from 160 ms to 800 ms.

Two initial `r0-closure-core` runs independently failed test 11 with `[originalEffects,repairEffects,reviews]=[1,1,1]` rather than `[1,1,2]`. Increasing only that timing margin produced 13/13. This is classified as a brittle test schedule, **not an independently reproduced production P1**. Accordingly, the report does not claim an unadapted 13/13 core pass.

Unmodified direct lifecycle attempts failed 0/12 due to child `tsx` errors such as:

```text
Error: listen EADDRINUSE: address already in use .../tsx-1000/<pid>.pipe
```

No mission execution occurred in those children. With exactly the child-loader change, 12/12 passed. The direct harness failures and loader smoke tests remain in `logs/focused/` for auditability.

---

## 4. Offline runner behavior

The production repository runner was **not** invoked at repository root because it always writes `reports/r0-test-results/*`, which this audit was forbidden to change. Instead, `probes/runner-behavior-probe.mts` generated audit-local fixture repositories and an audit-local runner copy.

The original and adapted runner hashes were:

```text
original  587c879fb81aa50c4f68e6ba00741e3e2d9d77927ac3653e1680dce98348950e
adapted   ca9e11feab1f9867a0f826fafee5de6a8f560a126789377260d6572ad06389fb
```

Adaptations were limited to removing the runner's synthetic provider assignments, unsetting the three provider variables, and making the timeout configurable for the short timeout fixture. Discovery, sorting, per-suite storage setup/cleanup, spawn, result recording and exit propagation remained production code. Fixture-local report roots contain all output.

The launcher opened a directory FD and exposed the short alias `/proc/481098/fd/10`; its real path was audit-local `state/runner-probe-launcher-rerun/tmp`. This avoided long-path `tsx` IPC failures. The unabridged launcher is in `logs/runner-behavior-probe.command.txt`.

**Four expected scenarios all behaved correctly** (`logs/runner-behavior.json` plus `logs/runner/*.log`):

| Scenario | Expected and actual process result | Other exact observations |
|---|---|---|
| Discovery/isolation | exit 0; 2 passed / 0 failed | Sorted order exactly `a-pass.test.ts`, `b-pass.test.ts`; 2 unique fresh data dirs; both sandboxes removed; nested and non-test files ignored |
| Nonzero suite | overall exit 1; 0 passed / 1 failed | Child exit 7 preserved in suite result; intentional failure logged |
| Timeout | overall exit 1; 0 passed / 1 failed | Effective timeout 150 ms; signal `SIGTERM`; error `spawnSync ... ETIMEDOUT` |
| Missing requested suite | process exit 1; summary 0 passed / 0 failed | Exact stderr begins `Missing test suite:`; zero suite records |

Because of the disclosed provider/timeout adaptations, this verifies the runner logic in a contained derivative, not a byte-identical end-to-end execution of the repository's default `npm test`. A separate source-derived reviewer concern about the default suite assuming `/tmp/opencode` already exists was **not reproduced on a fresh host or namespace and is not counted as a P1**. Fresh-host readiness remains unproven.

---

## 5. Requirement-to-evidence map

| Required behavior | Controls exercised | Audit outcome |
|---|---|---|
| Ownership, CAS, stale fencing | 53 storage/lease checks; original CAS/terminal-seal probe | Passing controls; F-02 identifies the crashed-recovery-owner exception |
| Cross-process recovery | Direct/adapted lifecycle recovery, orphan process suites, F-02/F-04 | **Failed overall** due to two reproduced recovery P1s |
| Process barriers and descendant quiescence | 9 process-lifecycle tests; cancellation and orphan probes | Passing covered schedules; crashed recovery ownership remains defective |
| Cancellation races and late effects | 76 manager checks; original non-cooperative cancellation | Covered cancellation settled durably, refused late artifact bytes, and released owner after quiescence |
| Durable intents and stable plans | original stable-plan and durable-intent probes; stored-plan suites | Passing accept/crash controls; F-01 shows ordinary terminal finalization bypass |
| Explicit accept and retry | accept controls and F-03 | Accept controls completed; **same-name retry P1 reproduced** |
| Artifact presence and integrity | 10 reconciliation checks, 30 QA gate checks, core and tamper probes | Tamper/delete controls failed closed as intended |
| Same-name supersession | successful committed-suite positive controls, F-03/F-04 | Normal/accept paths passed; **retry and commit-window P1s reproduced** |
| Repair bounds | two-repair suites; original agent-budget probe | Global 12-agent bound held; explicit retry invoked an additional unauthorized post-resolution repair as described in F-03 |
| Disabled standalone targeted repair | original disabled-runner probe | Rejected without mission or artifact effects |
| Runner behavior | four contained dummy-fixture scenarios | Derivative runner behavior matched expected discovery, isolation, failure, timeout and output results |
| Source-hash stability | 126 pre/post manifest paths | **Identical path/hash bodies** |

---

## 6. Source stability, processes and scope limitations

### Source and repository integrity

The original manifest contains 128 lines: two metadata headers and **126 SHA-256 path entries**. It includes production source, tests, package files, runner and pre-existing fixture files.

```text
before full-manifest SHA-256:
8986b861bb95ded4e76a992e82705d4566c54a07100a3740d19f8d1d869ee57d
after full-manifest SHA-256:
bc955f7242863b7d2592273f0f3d7c727c9a83a352d42547bb5ef2f257d2d4a9
common path/hash-body SHA-256:
b2b2f25d9d00516dfd4c3031a61539cd0a4868659d6a1af9bc4a5c76353cbf54
```

The whole-manifest hashes differ only because UTC/PID headers were regenerated. `diff -u` of both 126-line bodies was empty; `sha256sum` and diff both exited 0. Evidence: `source-hashes-before.txt`, `source-hashes-after.txt`, `logs/source-hashes.diff`, and `logs/source-hash-stability.txt`.

The final process scan at `2026-11-13T11:51:22Z` found **0 matching live processes** under the audit root. Earlier parallel scans captured concurrent audit commands, so only this final sequential scan is authoritative. Evidence: `logs/residual-process-final-summary.txt` and empty `logs/residual-processes-final.txt`.

### Audit-environment deviation — disclosed explicitly

One loader-anchor diagnostic at approximately 11:46Z was launched without an explicit `AWE_DATA_DIR`; the base shell variable was subsequently confirmed `<unset>`. Its source import evaluated `src/utils/storage.ts:12-28`, whose module initializer calls `ensureDirs()` on default `<cwd>/.awe-data`. The exact command and analysis are saved in `logs/audit-environment-deviation.txt`.

The diagnostic then failed with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. It invoked no mission, artifact, lease, reconciliation or checkpoint read/write API, and no subsequent inspection of real `.awe-data` was performed. Consequently, this report does **not** assert whether existing real directories were only checked or any missing directory skeleton was created. This was a deviation from the requested unconditional fresh audit-local storage contract; it is not used as evidence for any product finding and was not silently remediated.

### Offline and external limits

- Product executions used fresh audit-local `AWE_DATA_DIR`, `AWE_OFFLINE_TEST=1`, and removed provider variables at launcher level, apart from the disclosed diagnostic above. Some copied tests assign synthetic invalid credentials internally; no real provider secret was supplied.
- No external network, paid model, deployment, browser automation, MCP, PostgreSQL or Git mutation was used. Deterministic injected planner/executor/reviewer functions verify orchestration behavior only.
- `r0-closure-interfaces` deliberately opened loopback listeners on `127.0.0.1:40553`, `127.0.0.1:36079`, and `127.0.0.1:39175`. This local listener activity is disclosed; no external/provider connection was observed.
- This was targeted adversarial re-QA, not a green run of every one of the 22 copied suites. Failed harness attempts, copied-suite failures and probe development logs were retained rather than deleted.
- No live cloud/provider execution, real external effect, Windows computer-use path, actual browser/tool integration, multi-host PID-reuse behavior, fresh installation, or production recovery drill was tested.
- P0=0 is an observation within these probes, not proof that no unexamined P0 exists. Conversely, the four P1 reproductions are sufficient by themselves for the FAIL verdict.

## Final decision

**FAIL — do not mark the frozen R0 core accepted.** Remediate and independently re-run F-01 through F-04, including returned and thrown post-effect failures, killed recovery owners, explicit same-name retry, and a real crash immediately after committed repair provenance. External/live/production readiness remains unproven even after those core repairs.
