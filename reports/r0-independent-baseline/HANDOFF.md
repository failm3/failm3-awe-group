# Independent QA R0 handoff — baseline 446adae

**Verdict: R0 NOT PASS.** Baseline run: **31 tests, 14 PASS, 12 reproduced behavioural FAIL, 5 explicit BLOCKED/FAIL**, zero skipped/todo/cancelled; runner exits **1**. Full TAP evidence: `QA-R0-BASELINE-TAP.md` (95.25 seconds). TypeScript check exits **0**.

These assertions were authored independently against the requested contracts and observable APIs. Production implementation and existing tests/package.json were not modified. No live provider, browser, MCP, network, install, or Git mutation was used.

## Files to integrate

| File | Purpose |
|---|---|
| `src/tests/r0-independent-contracts.test.ts` | Node test runner: 26 executable behavioural tests plus five explicit blocking seam tests |
| `src/tests/helpers/r0-harness.ts` | Isolated subprocess harness, scrubbed environment, bounded execution and cleanup |
| `src/tests/helpers/r0-worker.ts` | Real storage/lifecycle/shell/Agent introspection/recursion/QA assertions |
| `src/tests/helpers/r0-integration-expectations.ts` | Fixed provider/children/resume assertion fixtures; **not yet wired/executed** on baseline |
| `QA-R0-BASELINE-TAP.md` | Full final baseline run, including assertion diffs |
| `QA-R0-TYPECHECK.md` | TypeScript verification result |
| `QA-R0-INDEPENDENT-HANDOFF.md` | This handoff and pending acceptance matrix |

All test data are under disposable `src/tests/helpers/r0-temp-*` directories. Each worker runs with its own cwd before loading storage. No real API credentials are inherited; a deliberately invalid key only permits model configuration construction. `fetch` and socket connect throw if called. Actual shell commands only print, sleep, exit, and write local temp markers. The outside-cwd test uses two directories inside one disposable root, so proving an escape never writes outside the QA temp area. SIGKILL targets the exact spawned Node child, not a `tsx` shell wrapper.

## Reproduction commands

Run in `/home/nox/awe-group-cleanroom-20261112/.r0-work/qa` (after integration, the analogous project root):

```bash
node --import tsx --test --test-concurrency=1 src/tests/r0-independent-*.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Target individual contracts, preserving the same expectations:

```bash
node --import tsx --test --test-name-pattern='R0 cross-process:' src/tests/r0-independent-contracts.test.ts
node --import tsx --test --test-name-pattern='R0 shell-' src/tests/r0-independent-contracts.test.ts
node --import tsx --test --test-name-pattern='R0 (empty-tools|unknown-tools|allowed-tools|empty-allowlist):' src/tests/r0-independent-contracts.test.ts
node --import tsx --test --test-name-pattern='R0 cancelled-' src/tests/r0-independent-contracts.test.ts
node --import tsx --test --test-name-pattern='R0 crash-recovery:' src/tests/r0-independent-contracts.test.ts
node --import tsx --test --test-name-pattern='R0 BLOCKED' src/tests/r0-independent-contracts.test.ts
```

**Expected baseline failures remain real nonzero failures.** There is no `EXPECTED_FAIL=1`, inversion, TODO, silent skip, or source-regex substitute. After integration, the exact full suite must exit 0 with all blocking cases replaced by actual production-seam assertions. A filtered green command is not R0 PASS. Adapt API imports/signature adapters, never weaken behavioural expectations or suppress a test to get green.

## Reproduced baseline defects (behavioural, not source inference)

| Test(s) | Observed baseline behaviour | Required result |
|---|---|---|
| `cancelled-artifact` | `saveArtifactFile` accepts late output after cancellation | Explicit rejection and no extra content/metadata; preserve earlier artifact bytes |
| `cancelled-update`, `cancelled-running` | Late `updateMission` changes cancelled to completed/running | Cancelled remains terminal |
| `cross-process` | Four simultaneous writers using real `updateMission`: shared `.tmp` rename ENOENT and corrupt JSON reads | All updates complete safely; final per-field values and unrelated metadata preserved |
| `empty-tools`, `unknown-tools` | Real Agent `listTools()` exposes full tool registry, including shell/browser/network tools | No requested known tools means no tool authority |
| `allowed-tools`, `empty-allowlist` | `allowedTools` ignored; requested shell remains available | Intersection with allowlist; explicit empty allowlist denies all |
| `shell-cwd` | Shell executes in sibling directory outside captured workspace | Reject before executing command |
| `shell-abort` | After confirmed shell start, abort does not stop descendant: late marker appears | Prompt cancellation and no marker even after original sleep deadline |
| `shell-preabort` | Already-aborted signal still permits execution | No execution/side effects |
| `qa-empty-criterion` | Empty QA criterion matches real acceptance criterion and is treated as evaluated | Empty criterion cannot certify any requirement |

Cross-process contention is a stress reproducer (four OS processes, 300 updates each, explicit READY/GO barrier), not a deterministic scheduler. It reproduced actual write collisions/corruption in both baseline attempts. A fix must eliminate both shared-temp collisions **and** read-modify-write lost patches; unique temp filenames alone are insufficient. Test uses disjoint top-level fields, so it does not assume undocumented deep-merge semantics.

## Executable baseline PASS coverage (14)

- `storage-roundtrip`: actual saved bytes, registered artifact ID, metadata and unrelated fields preserved, missing mission returns null.
- `parallel-missions`: four processes independently update different missions without cross-contamination.
- `mixed-tools`: known+unknown tool request grants only `file_read`.
- `shell-success`, `shell-failure`: actual stdout/stderr and numeric exit status, nonzero is unsuccessful.
- `recursion-depth`, `recursion-budget`: limit refusal returns false, reason/issues, zero children, unchanged delegation tree; no model call.
- `recursion-isolation`: different missions retain independent node state.
- `timeout-success`, `timeout-failure`, `timeout-expiry`: exact result/error propagation; timeout error identity and one callback.
- `reconcile-exclusion`: explicitly active set protects current mission, orphan becomes paused, repeated reconciliation is idempotent.
- `crash-recovery`: subprocess saves a real artifact and success checkpoint, receives SIGKILL; recovery pauses orphan and preserves checkpoint/bytes; repeated reconciliation does not repeat the transition.
- `qa-unique-criteria`: one QA result cannot certify two criteria.

**Coverage boundaries:** crash test proves storage/reconciliation durability, not actual manager resume or exactly-once external effects. Active-set reconciliation test does not prove automatic live-lease detection. Recursion limit tests do not prove ordinary child execution. Provider configuration and Agent construction are offline; `generate()` is never called.

## Pending integration acceptance matrix — each row blocks R0

The runner contains `R0 BLOCKED provider`, `children`, `lease`, `manager`, and `resume` tests. They intentionally fail until the corresponding integration seam is supplied and exercised. The helpers file pins concrete independent expectations for provider, children, and resume; adapters must delegate policy to production code.

| Blocker / scenarios | Required seam / offline setup | Assertions and expected final evidence |
|---|---|---|
| **provider — empty/failed/false-success/missing artifact** | Export pure outcome evaluator used by `executeSpecialist`, or inject generate implementation without network. Wire `assertProviderOutcomes`. Required artifacts are real registered new outputs from this invocation. | `{}`, whitespace response, persuasive “Done” without saved artifact, old-only artifact, provider error finish reason, failed save tool => `success:false`, nonempty `issues`. No summary auto-save may convert missing mandatory deliverable into success. |
| **provider — positive/result propagation** | Same adapter; fixtures include valid provider text and a new verified artifact. | `success:true`; exact new IDs returned, text preserved. Replacement with changed ID and same registry count is recognized as new output. Additional checks: tool names/usage accurately propagated; artifact file must actually exist, not merely appear in model text. |
| **provider — cancellation during model** | Inject hanging generate that observes AbortSignal; also late-resolving noncooperative generate. | Signal reaches generate; cancelled outcome is unsuccessful; issues identify cancellation; late response cannot change terminal mission or save artifact. Verify `maxSteps` forwarded. |
| **children — legacy duplicate execution** | Export pure `resolveChildren` equivalent or inject real child executor into `runDelegateCall`; wire `assertChildrenPlanning`. | `{role,task,parallel:true}` resolves/runs **one** child, not four copies. Count an append-only temp receipt to prove one effect. Pure planning PASS alone must not be described as execution proof. |
| **children — distinct tasks** | `request.children=[{writer,A}, {analyst,B}]`, injected offline executors produce separate receipts/artifacts. | A and B each exactly once, correct role/tools/context propagated, outputs independently returned, parent links unique and stable. Repeated delegation calls must not reuse node IDs. |
| **children — failure/abort/limits** | One child throws or returns false; one succeeds; then both fail; then abort while children wait. | Explicit per-child failure/issues, no false all-success claim, bounded concurrency and mission budget, no spawn after abort. Parent cancellation/tool allowlist must propagate downwards. |
| **lease — simultaneous acquire / double run** | Export acquire/release lease API or provide manager dependencies so two processes can `run()` with deterministic local execution. Synchronize both using READY/GO. | Same mission: exactly one owner; losing process reports busy/denied **before** first side effect. Different missions can both proceed. Wrong owner token cannot release another lease. |
| **lease — live reconciliation** | Child A acquires lease and stays alive; child B performs default `reconcileOrphanedMissions()` **without** supplied running set. | A remains running; report does not list A as paused. Acquire another lease attempt fails. |
| **lease — death/recovery** | Kill owning Node process with SIGKILL after durable checkpoint; fresh process reconciles/acquires. | Dead lease recoverable; checkpoint retained; late stale-token write rejected; new owner unique; old release cannot delete new lease. |
| **manager — ordinary mission flow** | Inject plan, execute, and QA; actual manager/storage run; offline specialist saves real artifact. | Approved mission -> running -> completed only after QA, output/artifact IDs and downstream context propagated, persisted exact report content, no calls to default provider. |
| **manager — failures and repair bound** | Inject failed provider, tool nonzero, empty output, missing mandatory artifact, QA reject; use actual manager. | No completed status on false success; issues preserved; repairs bounded; prior artifacts/checkpoint/usage survive retries. |
| **manager — cancellation/tool and terminal fence** | Hold model/tool at explicit barrier, cancel from second actor, then release late work. | Cancelled remains terminal through delayed response/save/checkpoint/update, subprocess gone, no late file/artifact, no second child after cancellation. Existing terminal storage tests remain unchanged. |
| **manager — crash exactly-once successful delegation** | Task A appends a local receipt, saves artifact and success checkpoint; hold B; SIGKILL. Fresh manager resumes. Also crash in the side-effect/checkpoint gap. | A receipt count remains one; B resumes as policy allows; successful artifact preserved; reordered same-role tasks correctly matched; ambiguous uncheckpointed external effect is not blindly repeated and reported successful. Document idempotency key/durable intent protocol evidence. |
| **resume — task identity** | Extract side-effect-free exported resume selector; wire `assertResumeIdentity`. | Completed executor/effect-A at old index 0; new plan executor/effect-B index 0 and executor/effect-A index 1 => skip set exactly `{1}`. Unchanged plan skips A; failed checkpoint entry skips nothing. |

For each integrated seam run the full command above; initially `R0 BLOCKED ...` provides explicit expected FAIL evidence. Integrator can replace each blocker body with an adapter calling the fixed helpers, and add the lease/manager subprocess scenarios described above. Passing an exported helper is necessary but not sufficient evidence that production `executeSpecialist`/manager actually uses it; follow-up independent review must verify wiring with injected execution.

## Isolation issue found while preparing resume tests

An initial run reached `import mission-manager` from a temp worker. Its import graph creates LibSQL memory at **source-root** `.awe-data/memory.db` (`src/memory/index.ts`), not worker cwd. The import failed with `ConnectionFailed(.../.r0-work/qa/.awe-data/memory.db: 14)` because the snapshot has no `.awe-data`. No database/directory was created; final existence check was false. That import was removed from the executable tests, and manager/resume now explicitly block pending a pure seam or an injectable temp memory path. Do not “fix” the test by creating the real source-root database.

The first attempt also hit the shell tool's 120-second outer timeout during the manager import checks. Its own remaining `r0-temp-*` directory was removed. The final full run uses a 240-second outer budget and completed normally with the expected nonzero result. The final TAP file contains only that complete run.

## Follow-up independent review requirements

1. Integrate tests and implementation fixes; keep failures visible until genuinely fixed.
2. Supply side-effect-free imports/injection signatures, especially memory/manager/lease.
3. Preserve fixed expectations, including no-new-artifact=false, no ambient tools, one legacy task=one child, terminal cancellation and task-aware resume.
4. Ask independent QA to run the integrated tree in a fresh isolated snapshot. No R0 PASS is granted by this handoff.
