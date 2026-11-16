# NOX R0 — Final Independent Adversarial Re-QA

**Review date:** 2026-11-13  
**Mode:** read-only production-source review, recorded offline evidence, and `npm run typecheck`  
**Overall verdict:** **FAIL — DO NOT CLOSE R0 OFFLINE**  
**Production verdict:** **NOT ASSESSED / NOT READY TO INFER**

The updated tree closes the originally reported file-write fencing, cold-discovery browser-action fencing, missing integrity metadata, targeted-helper path, search cancellation, delegate signal, explicit-empty-grant, and ordinary top-level/resume budget defects. It also adds substantial real crash-window coverage. R0 nevertheless remains open for five concrete reasons:

1. **D8:** an effect-bearing delegation that returns or throws a failure loses its durable intent and can be blindly re-executed after a later crash/timeout.
2. **Global agent budget:** repair specialists bypass the durable reservation ledger, permitting agents 13 and 14 after the 12-agent budget is exhausted.
3. **D3 repair behavior:** the normal same-name repair of an original deliverable is deterministically rejected by name-deduplication versus original-ID validation.
4. **D6:** cancellation still does not cover cold browser availability/discovery; further probes and MCP startup can begin after abort.
5. **D4 universal isolation:** shell children discard `AWE_DATA_DIR`, so an AWE-aware child can silently return to the real default `.awe-data` root.

The D8 and budget findings are direct safety/cost-cap violations. D3 is fail-closed rather than a false completion, but it leaves the required bounded-repair loop broken for a normal repair case. D6 no longer permits the delayed raw browser action in the tested path, but it still starts local discovery work after cancellation. D4 is a scope blocker for the advertised **universal** isolation claim.

## 1. Evidence and review limits

### Evidence used

- `reports/r0-test-results/summary.json`: **16/16 suites passed**, 0 failed, recorded from `2026-11-13T05:03:03.406Z` through `2026-11-13T05:07:14.468Z`.
- Recorded focused results:
  - `r0-final-manager`: **79/79**;
  - `r0-final-production-intent`: **4/4**;
  - `r0-final-recursion`: **8/8**;
  - `r0-final-tools`: **12/12**.
- Recorded `typecheck.log` and `build.log` are clean. A fresh non-mutating `npm run typecheck` in this review also returned **PASS**.
- A timestamp comparison found no file under `src` or `scripts` newer than the recorded 16/16 summary.
- Direct inspection covered the mission manager, lifecycle/lease recovery, recursion ledger, specialist/provider outcome handling, shared tool context, file/search/browser adapters, MCP startup, artifact storage/reconciliation, targeted repair helper, CLI/API construction, and the new tests/logs.
- Production CLI/API construction supplies no `unresolvedIntentPolicy`; therefore the actual default is the strict policy at `src/agents/mission-manager.ts:1313-1332`. The opt-in `evidence` policy appears only in controlled test fixtures.

The full test suite was **not rerun**, no paid/live operation was performed, and no new runtime probe was needed. The negative reproductions below are concrete source-derived scenarios, not claims that a live provider or browser was exercised. This review wrote only this report.

### What the evidence does not prove

The green run uses injected executors and adapter doubles for decisive negative cases. It does **not** certify a live LLM, real Chromium/MCP behavior, real web requests, PostgreSQL, deployment, Windows computer-use, provider spending behavior, or production readiness. In particular, `r0-final-production-intent.test.ts:38-41,118-155` stubs `Agent.generate`, and `r0-final-tools.test.ts:24-49` replaces MCP discovery. Those are useful contract tests, not live-service acceptance.

Verdict meanings: **PASS** = the stated offline requirement is demonstrated for the reviewed path; **PARTIAL** = major controls work but a required case remains open; **FAIL** = a concrete source path violates the requirement.

## 2. Verdict matrix

| Item | Verdict | Decisive reason |
|---|---|---|
| Expired-live-owner exclusion | **PASS** | Live local owners still block takeover and orphan pausing after lease expiry (`src/agents/lifecycle.ts:340-350,494-505,653-668`). |
| **D1 — file-write stale-owner fencing** | **PASS** | The second fence/abort/seal check is inside the mission lock and before raw mkdir/write, with or without artifact registration (`src/tools/index.ts:227-245`; `src/utils/storage.ts:308-321`). |
| **D2 — browser fence after asynchronous discovery** | **PASS** | `assertToolAllowed` is repeated immediately before raw MCP execution (`src/tools/browser.ts:84-97`); the recorded cold-discovery test proves zero raw invocation after ownership loss. |
| **D3 — complete integrity and genuine repair** | **PARTIAL — R0 blocker** | Missing path/hash/size and changed bytes now fail closed, but a valid same-name repair cannot satisfy the original-artifact-ID gate. |
| **D4 — universal `AWE_DATA_DIR` isolation** | **PARTIAL — R0 blocker for the universal claim** | The targeted helper now follows the relocated root, but shell subprocesses deliberately omit `AWE_DATA_DIR`. |
| **D5 — web-search cancellation** | **PASS** | Both providers use an abort-aware request that settles and destroys the socket; fallback is blocked after abort (`src/security/search-request.ts:8-43`; `src/tools/index.ts:348-360,366-455`). |
| **D6 — browser cancellation** | **PARTIAL — R0 blocker** | The started MCP operation receives the exact signal, but cold availability/discovery has no abort boundary and can start subsequent work after cancellation. |
| **D7 — delegate call-specific signal** | **PASS** | Production delegate composition now forwards the current tool-context signal, fence, and effect marker (`src/agents/specialists.ts:108-135`); recursion combines call and session signals (`src/agents/recursion.ts:457-470`). |
| **D8 — single-owner recovery / effect-checkpoint ambiguity** | **FAIL — R0 blocker** | SIGKILL gaps are gated, but effect-bearing failed/exceptional outcomes are converted into retryable checkpoints with no surviving intent. |
| **D9 — explicit empty recursive grants** | **PASS** | `undefined` inherits while explicit `[]` remains empty; parent ceilings still fail closed (`src/agents/recursion.ts:482-496`). |
| **Top-level/resume/global agent budget** | **FAIL — R0 blocker** | Ordinary top-level/nested reservations are durable across reset and processes, but repair execution is unreserved and can exceed 12 actual agents. |
| Artifact-backed success in the ordinary manager | **PASS for the original false-completion vectors** | Successful delegations need newly reported, registered, integrity-valid artifacts; every final artifact is rechecked (`src/agents/mission-manager.ts:1173-1196,443-479,1639-1650`). D3's separate repair-availability defect remains open. |
| Reproducible offline runner | **PASS — coverage-limited** | One documented `npm test`, fresh process/data root per suite, synthetic credentials, timeouts, logs, and recorded 16/16 result (`scripts/run-offline-tests.mjs:9-86`; `README.md:31-40`). The new adversarial cases below are not in that gate. |

## 3. Confirmed remediations

### D1 and D2 — actual side-effect boundaries are fenced

`fileWriteTool` now enters `withMissionWrite(context.missionId, ...)` before `mkdirSync` or `writeFileSync`; `withMissionWrite` checks seal, abort, and fence under the cross-process mission lock (`src/tools/index.ts:227-245`; `src/utils/storage.ts:308-321`). This closes the prior raw-write-before-fence path, including calls without `mission_id`. Recorded `r0-final-tools` tests 1–3 also verify no file or requested directory remains after refusal.

The browser wrapper repeats `assertToolAllowed(permission)` after availability and discovery and before `tool.execute` (`src/tools/browser.ts:84-97`). Recorded `r0-final-tools` test 4 flips the owner during deferred cold discovery and observes zero raw MCP calls. This is an offline adapter-contract PASS, not proof against every possible external MCP implementation.

### D3's original integrity fail-open is closed

`artifactIntegrityDefect` now requires all of the following (`src/agents/mission-manager.ts:398-440`):

- a backing path rather than inline-only evidence;
- valid nonnegative `size_bytes` **and** lowercase SHA-256 metadata;
- a readable regular file, rejecting a final-component symlink and using `O_NOFOLLOW`;
- actual bytes matching both recorded size and hash;
- matching inline content when inline content is also present.

The same predicate applies to original, repaired, resumed, reconciled, and final artifacts (`src/agents/mission-manager.ts:443-479,1173-1196,1593-1600,1639-1650`). Reconciliation itself now records hash and size (`src/utils/storage.ts:447-463`). The recorded 79-check manager log covers missing one/both fields, inline-only evidence, same-size replacement, and these four evidence classes.

Thus the previous “metadata is optional” false-completion path is fixed. D3 remains PARTIAL solely because genuine same-name repair is broken as detailed below.

### D4's targeted-helper path is fixed

`SOURCE_DIR` now comes from `missionArtifactDir(SOURCE_MISSION_ID)` (`src/run-targeted-repair.ts:1-8`), which derives from the storage root at `src/utils/storage.ts:12-20`. Direct execution is guarded at `src/run-targeted-repair.ts:115-117`, so import does not start a repair. Recorded `r0-final-tools` test 12 checks relocated/default paths and no import-time mission creation. Memory also follows `AWE_DATA_DIR` (`src/memory/index.ts:6-10`). The remaining D4 issue is the separate shell-child boundary.

### D5, D7, and D9 are closed in the reviewed adapters

`searchRequest` checks an already-aborted signal, passes the signal to `https.request`, removes listeners on settlement, rejects promptly on abort, and destroys the actual request (`src/security/search-request.ts:8-43`). Both search implementations check abort after awaits and before fallback (`src/tools/index.ts:348-360,381-405,416-454`). The recorded tool tests cover delayed success/failure, in-flight Tavily/DDG, fallback, and pre-aborted entry.

The production delegate now passes `getToolContext()?.signal`, `fence`, and `beginEffect` (`src/agents/specialists.ts:129-134`). Recursion combines call and session signals and passes the result to each child (`src/agents/recursion.ts:457-470,555-576`). The explicit-empty-grant distinction is implemented with `child.tools !== undefined` at `src/agents/recursion.ts:482-490`. Recorded recursion tests cover standalone/call/session cancellation and legacy/per-child empty arrays.

### Ordinary top-level and resume budget accounting is substantially fixed

`reserveAgents` reads and writes spent budget under the mission lock and refuses reservations beyond 12 (`src/agents/recursion.ts:82-123`). `registerTopLevelNode` now uses that reservation (`src/agents/recursion.ts:193-216`), while `resetSession` preserves spent count and sequence (`src/agents/recursion.ts:140-153`). Recorded recursion tests cover repeated finalization, reset/resume, nested plus top-level concurrency, cross-process races, a 13-item Head plan, and a second manager attempt. Those controls pass; repairs are the remaining bypass.

## 4. R0 closure blockers

### 4.1 D8 — failed effects are incorrectly treated as definitely safe to retry

**Severity:** High / P0  
**Locations:** `src/agents/specialists.ts:232-252,276-305`; `src/agents/mission-manager.ts:1188-1258,1313-1332,1408-1444`.

The new durable-intent protocol correctly marks the model call and actual tools before execution. It then assumes that a returned failure or non-abort exception resolves the attempt as an ordinary retryable failure. That assumption is false: an exception or unsuccessful final response does not roll back earlier tool or provider effects.

There are **two** concrete paths.

#### Path A — a normally returned failed specialist outcome

1. `Agent.generate` starts after the durable model marker (`src/agents/specialists.ts:276-305`). During that run, an approved shell or artifact tool performs its effect; tool boundaries are also durably marked by `src/security/tool-context.ts:30-42`.
2. The provider then returns empty text or `finishReason: "error"`. `evaluateProviderOutcome` returns `success: false` even though the earlier effect occurred (`src/agents/specialists.ts:238-252`).
3. `runDelegation` converts that outcome to `status: "failed"` but returns normally with `intentKey` (`src/agents/mission-manager.ts:1188-1223`).
4. `onDone` unconditionally deletes the intent for both successful and failed results and writes the failed result to `completed` (`src/agents/mission-manager.ts:1434-1444`). `checkpoint` consequently serializes no corresponding `in_flight` entry (`src/agents/mission-manager.ts:753-772`).
5. If the process crashes or times out before the terminal write, the checkpoint remains resumable. On the next run, the strict gate has no intent to inspect; only successful checkpoint entries are reused (`src/agents/mission-manager.ts:333-364,1313-1332`), so the failed delegation is placed back in `toRun` and re-executed (`src/agents/mission-manager.ts:1420-1425`).

A timeout while QA is outstanding after step 4 is sufficient; no exotic provider behavior is required. A non-idempotent shell notification/payment-like action can therefore run twice without an operator selecting `decision: "retry"`.

#### Path B — a non-abort exception after an effect

`executeSpecialist` does not catch a provider/stream/parser rejection from `agent.generate`. In `runDelegation`, every error other than an aborted signal or `MissionFencedError` enters the general catch, which deletes the in-memory intent at line 1237 and returns a failed result without `intentKey` (`src/agents/mission-manager.ts:1224-1258`). The following `onDone` checkpoint makes that omission durable. The same crash/timeout-after-failed-checkpoint sequence then permits blind re-execution.

The recorded D8 tests kill the child **before the specialist returns**, so they exercise surviving intents rather than either settled-failure path (`src/tests/helpers/r0-final-manager-child.ts:49-86`). The production-intent suite tests successful completion and marker failure **before** an effect, not a post-effect provider failure. The 79/79 and 4/4 logs therefore do not close this scenario.

**Required correction:** an effect-marked failed or exceptional attempt must remain recovery-gated in any resumable checkpoint until explicit reconciliation/retry. Add regressions for both a returned failed outcome and a thrown non-abort error after a real local effect, followed by timeout/crash before terminalization.

### 4.2 Global agent budget — repair agents bypass the ledger

**Severity:** High / P0 cost-bound violation  
**Locations:** `src/agents/recursion.ts:31-42,104-123,193-201`; `src/agents/mission-manager.ts:1530-1615`; `src/agents/specialists.ts:263-272`.

`maxTotalAgents` is explicitly documented as covering “top-level and descendants,” with a hard cap of 12. Normal delegations reserve at `src/agents/mission-manager.ts:1143`; repairs instead call `this.deps.executeSpecialist` directly at lines 1575-1587. `openIntent` is crash evidence, not a budget reservation, and `executeSpecialist` itself performs no cap check.

**Concrete scenario:**

1. A plan contains 12 distinct top-level delegations. All execute successfully and return verified new artifacts, consuming all 12 reservations.
2. Initial QA fails. The repair-loop conditions at `src/agents/mission-manager.ts:1533-1539` all pass.
3. Repair iteration 1 creates and executes specialist **13**. It returns success with a distinct valid artifact, but re-review fails.
4. Repair iteration 2 creates and executes specialist **14**. `MAX_REPAIR_ITERATIONS = 2` bounds this particular bypass to two extra specialists, but does not preserve the advertised cap.

The durable ledger still reports 12, and final `delegation_tree.total_agents` can therefore under-report actual specialist executions (`src/agents/mission-manager.ts:1684-1701`). Existing cap tests never combine a full budget with failed QA; existing repair tests start with only one original delegation.

**Required correction:** reserve and register every repair specialist before its intent/effect, include it in actual accounting, and add a test with 12 successful originals plus failed initial QA. Assert actual executor invocation count, not merely `session.spawned`.

### 4.3 D3 — same-name genuine repair is rejected after doing valid work

**Severity:** Medium / R0 bounded-repair blocker  
**Locations:** `src/utils/storage.ts:333-395`; `src/agents/mission-manager.ts:443-479,1562-1650`.

**Concrete scenario:**

1. The original delegation saves `index.html` and receives artifact ID **A**. Its successful result records `[A]`.
2. QA requests a correction. The repair naturally saves the corrected deliverable under the same name, `index.html`, receiving new ID **B** through `saveArtifactFile`.
3. B is new, reported, and integrity-valid, so `newRepairArtifacts` accepts it (`src/agents/mission-manager.ts:1593-1600`). Both writes use the same backing filename (`src/utils/storage.ts:345-366`).
4. `listArtifacts` deduplicates by name and returns only B (`src/utils/storage.ts:388-395`).
5. `applyExecutionEvidenceGate` still requires the original result's A to be present in that name-deduplicated map and adds `Delegation ... artifact 'A' is not registered` (`src/agents/mission-manager.ts:454-461`). The mission finishes failed even if post-repair QA passes.

A second same-name repair does not remove the stale A reference before the two-iteration bound. This is **not** a false completion or an integrity bypass; it is a deterministic false rejection of normal repair work. The positive repair control uses different names, `initial.txt` and `repair.txt` (`src/tests/r0-final-manager.test.ts:144-162`), so the green log misses it.

**Required correction:** use ID-aware immutable revisions or explicitly supersede original result references when a valid same-name replacement is accepted. Add a passing same-name primary-artifact repair test and verify both old and new integrity semantics.

### 4.4 D6 — cold browser startup can continue and begin after abort

**Severity:** Medium-High / P0 end-to-end cancellation blocker  
**Locations:** `src/tools/browser.ts:79-102`; `src/config/mcp.ts:36-57,129-175,187-199`.

The raw MCP operation now receives `context.signal`, which fixes the previously demonstrated delayed browser action. However, cancellation is not checked or propagated between the initial guard, availability, and discovery.

**Concrete scenario:**

1. `callMCPTool` passes its initial guard at `src/tools/browser.ts:84`.
2. Abort while the cold `which npx` probe is pending at `src/config/mcp.ts:43`.
3. When that await resolves, `npx @playwright/mcp --version` is started at lines 44-47 **after abort**. Neither availability command receives the tool signal.
4. If availability returns true, `src/tools/browser.ts:90` enters cold `resolveTool` without an intervening abort check. `getPlaywrightTools` calls `getPlaywrightMCP` and `client.listTools` at `src/config/mcp.ts:192-193`; first discovery can launch the configured `npx @playwright/mcp --headless` subprocess from lines 153-169 after cancellation.
5. Only after discovery does line 96 recheck the context and prevent navigation/click/type. Returning `{success:false}` cannot undo the probes or process startup.

Timeouts at 5, 30, and 60 seconds are eventual bounds, not cancellation. `disconnectPlaywrightMCP` is best-effort cleanup but is not invoked by this abort path (`src/config/mcp.ts:202-218`).

The recorded browser test proves stale-owner refusal and abort of an **already started** raw operation. Its availability double immediately returns true, and it never asserts that abort during cold availability/discovery prevents the next probe or `listTools` (`src/tests/r0-final-tools.test.ts:24-49,132-186`).

**Required correction:** thread abort through availability and discovery, check it before every new probe/client/listTools transition, and prove zero post-abort process/discovery startup with offline doubles. Keep the existing raw-action signal test.

### 4.5 D4 — shell children lose the isolated state root

**Severity:** Medium / R0 universal-isolation blocker  
**Locations:** `src/tools/index.ts:158-166`; `src/utils/storage.ts:12-28`.

The shell adapter constructs a filtered child environment containing only a small whitelist; `AWE_DATA_DIR` is absent. An AWE-aware subprocess launched by an otherwise authorized shell tool therefore computes its storage root from its own environment and falls back to `<cwd>/.awe-data`.

**Concrete scenario:** run the manager with `AWE_DATA_DIR=/tmp/opencode/<unique-isolated-root>`. A specialist uses the documented shell capability to run a project-local Node/TS verifier that imports `src/utils/storage.ts`. The child has no `AWE_DATA_DIR`; module initialization selects and creates the workspace's default `.awe-data` directories. A software-engineering agent running project tests or an AWE command is enough to trigger this—no malicious direct edit of state is required.

This does not negate the fixed targeted-helper path or the ordinary parent-process storage paths. It does mean the isolation guarantee is not universal across a production tool boundary, and an isolated run can touch real default state through a normal subprocess.

**Required correction:** propagate the validated `AWE_DATA_DIR` value to shell children while continuing to exclude credentials, then add a child-process test proving that storage and memory stay under the relocated root.

## 5. Bounded limitations not counted as additional ordinary-manager R0 failures

These distinctions prevent the verdict from relying on an unrealistically broad threat model:

- **Mutable same-ID registry metadata:** `saveArtifact` can replace an existing ID's sidecar (`src/utils/storage.ts:324-330`), and checkpoints store IDs rather than independent expected hashes. A direct storage caller or raw local writer could substitute self-consistent replacement bytes/metadata. Stock `save_artifact` generates a fresh UUID and does not expose this operation, so this is a local-trust/append-only-hardening limitation, not the original stock-tool metadata-optional fail-open.
- **Parent symlinks and arbitrary direct-storage paths:** `saveArtifactFile` uses lexical containment (`src/utils/storage.ts:345-353`), and final integrity verification rejects only a final-component symlink (`src/agents/mission-manager.ts:421-435`). A preexisting parent symlink can escape the artifact root. Creating that state requires shell/local-write capability or unsafe preexisting storage; it is not counted as a new ordinary R0 false-completion path, but strong containment is not certified.
- **Verification-to-terminal race:** final byte verification and `fencedWrite` are separate (`src/agents/mission-manager.ts:1639-1650,1688-1710`). Another process/raw writer can replace bytes between them. There is no JavaScript `await` in that interval, so a normal same-thread QA continuation cannot exploit it; this is an interprocess/hostile-writer residual rather than a new ordinary cooperative-run blocker.
- **Manual targeted-repair helper semantics:** `run-targeted-repair.ts` is not called by the normal CLI/API manager path. It directs artifacts to the source mission but completes its new repair mission solely on `result.success && !timedOut`, without independent QA or the manager's final integrity gate (`src/run-targeted-repair.ts:63-103`). Thus a report-only result could mark that helper's new mission completed with its own artifact list empty. This must not be represented as a verified-repair path. If this legacy/manual helper is supported for closure or production rather than excluded, it becomes an additional blocker and should be routed through the ordinary manager/QA controls.

None of these qualifications weakens the five explicit R0 blockers above.

## 6. Closure decision and minimum revalidation

**Recommendation: NO-GO; keep R0 open offline.**

At minimum:

1. Preserve ambiguous recovery state for every effect-bearing failed/exceptional delegation until explicit resolution; test both settled-failure forms across a subsequent crash/timeout.
2. Charge repairs to the same durable global agent ledger and tree before any effect; test the full-budget-plus-QA-failure case.
3. Make same-name repair revisions consistent with original-result validation; add a successful same-name repair control.
4. Make cold browser availability/discovery abort-aware and prohibit post-abort probe/MCP startup; retain raw-action cancellation coverage.
5. Propagate `AWE_DATA_DIR` through shell children and prove isolation in a real child process.
6. Run the single complete offline gate and typecheck on the corrected tree, then repeat independent adversarial QA. Any live-provider/browser/MCP or deployment acceptance must be separately authorized and separately reported.

**Final statement:** the recorded 16/16 suite demonstrates meaningful remediation and is a reproducible offline gate for its current coverage. It is not sufficient for R0 closure because durable recovery, global agent accounting, normal repair behavior, cold browser cancellation, and universal state isolation still have concrete uncovered failure paths.
