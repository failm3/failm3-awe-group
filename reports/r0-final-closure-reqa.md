# NOX R0 — Final Independent Closure Re-QA

**Review date:** 2026-11-13  
**Mode:** adversarial production-source review, recorded offline evidence, and fresh isolated offline probes  
**Overall verdict:** **FAIL — DO NOT CLOSE R0 OFFLINE**  
**Production/live-service verdict:** **NOT ESTABLISHED — NOT READY TO INFER**  
**Independent QA sign-off:** **REJECTED / NO-GO**

The integrated tree contains real remediations: D1/D2 effect-boundary fencing, normal effect-marked delegation recovery, durable repair-budget reservations, ordinary same-name repair, D5 search cancellation, D7 signal propagation, D9 empty-grant denial, and the specific D4 shell-child and D6 cold-start contracts now have positive evidence. The recorded gate is **18/18 suites, 0 failed**.

Those results do **not** establish closure. Three fresh offline probes reproduce concrete P0 failures in the real manager/storage/checkpoint paths:

1. an effect-bearing failed repair becomes terminal and cannot be explicitly resolved;
2. a semantically equivalent regenerated resume plan repeats an already confirmed effect without operator approval;
3. a malformed checkpoint is overwritten as empty and its confirmed effect is repeated;
4. separately, zero acceptance criteria produce zero criterion checks and a real `completed` mission.

There are also source-derived P0 cancellation/quiescence and approval-governance defects. R0 therefore fails independently of any unproven live-provider, Chromium/MCP, PostgreSQL, or deployment behavior.

---

## 1. Audited snapshot and evidence

### 1.1 Source snapshot

- Working tree reviewed at Git HEAD `446adaea833b0ebade1a21fbda3f71118d19b0d6`; the R0 changes remain working-tree changes, not a new audited commit.
- `src/agents/mission-manager.ts` SHA-256:  
  `ad3fd4f18eb53c7e45f58df604772c68b859249f3f3d931d4e72c89ac1cd94d0`
- `reports/r0-test-results/summary.json` SHA-256:  
  `2b174223282539ff86aca8c891f0ecb916fb371fce10f3a3dd10fe1254c01491`
- No file beneath `src` or `scripts` was newer than the latest recorded summary at the time of review. This is a consistency check, not a cryptographic hash manifest for every source file.
- `reports/r0-test-results/closure-integrated-git-diff-check.txt` is empty (0 bytes).

No production or test source was edited during this audit. No Git mutation, deployment, `npm test`, real `.awe-data` access, `/goal` access, live application-provider call, browser/MCP operation, or external network operation was performed.

### 1.2 Recorded integrated evidence — reviewed, not rerun

| Evidence | Recorded result |
|---|---:|
| `reports/r0-test-results/summary.json` | **18 passed suites / 0 failed** |
| Integrated interval | `2026-11-13T06:11:39.761Z`–`06:16:16.739Z` |
| Aggregate per-suite duration | **276.978 s** |
| `r0-reqa-manager.log` | **70/70 checks** |
| `r0-reqa-adapters.log` | **3/3 tests** |
| `r0-final-manager.log` | **79/79 checks** |
| `r0-final-production-intent.log` | **4/4 checks** |
| `r0-final-recursion.log` | **8/8 checks** |
| `r0-final-tools.log` | **12/12 checks** |
| `r0-independent-contracts.log` | **34/34 checks** |
| `closure-integrated-typecheck.log` | Recorded `tsc --noEmit` **PASS** |
| `closure-integrated-build.log` | Recorded `tsc` **PASS** |

The focused checks overlap with the full gate; their counts are not additional unique suites and must not be added to 18. Counts were used only to locate coverage, never as proof that a requirement was closed.

### 1.3 Fresh isolated probes performed by this review

Each probe used a fresh unique `AWE_DATA_DIR` beneath `reports/r0-test-results/final-independent-qa/`, synthetic provider configuration, injected offline planner/executor/reviewer functions, and the real manager/storage/checkpoint/QA-gate implementations. Temporary state was removed; JSON results remain. No provider, network, browser, or MCP service was invoked.

| Evidence | SHA-256 | Decisive measurement |
|---|---|---|
| `final-independent-qa/failed-repair-terminalization-isolated.json` | `934b9aa6a0148c93e6c28d15cc0da851b2d9a3ef68227a1528d2429976366fdd` | Returned and thrown repair variants each perform exactly one marked effect; both end `failed`; explicit resolution and resume are rejected. The returned variant has no checkpoint afterward. |
| `final-independent-qa/resume-repeat-and-corrupt-checkpoint.json` | `d646169c1c6acefcede6e715bfee1002146cab8ad5ee1af40022dcfbd2e21e21` | Semantic replan: two specialist calls/two effects without explicit retry. Malformed checkpoint: one pre-existing effect becomes two; Head observes an empty replacement checkpoint. |
| `final-independent-qa/empty-acceptance-criteria.json` | `0990b611e90f939ef63c63d79b516db8ddd29d36e939eb6d900dbda068644d48` | Both schemas accept `[]`; the real gate returns `passed:true`, `blockers:[]`, `criterion_checks:[]`; the real manager persists `completed`. |

These probes establish offline code behavior only. They are not live-service acceptance tests.

---

## 2. D1–D9 final matrix

| Item | Verdict | Decisive adjudication |
|---|---|---|
| Expired-live-owner exclusion | **PASS (local offline protocol)** | Live local owners remain excluded from takeover/orphan pausing even after lease expiry (`src/agents/lifecycle.ts:494-505,653-668`). This is not a distributed-lock or PID-reuse certification. |
| **D1 — stale-owner file-write fencing** | **PASS** | The requested mkdir/write and optional artifact registration occur inside `withMissionWrite`; seal, abort and ownership are rechecked under the mission lock before those effects (`src/tools/index.ts:231-247`; `src/utils/storage.ts:296-321`). |
| **D2 — browser ownership after discovery** | **PASS — adapter boundary** | Permission/fence/abort are checked again immediately before raw MCP execution, which receives the mission signal (`src/tools/browser.ts:100-120`). This does not prove live MCP/Chromium teardown. |
| **D3 — artifact integrity and same-name repair** | **PARTIAL** | Mandatory hash/size/regular-file verification and normal same-name repair pass. However, supersession metadata with real IDs is not provenance-bound, and a cross-name transitive chain can defeat lineage validation (§4.3). |
| **D4 — universal `AWE_DATA_DIR` isolation** | **PARTIAL** | The former shell-child loss is fixed, but supported `.env`-only CLI configuration is loaded after static storage/lifecycle evaluation, allowing default-root initialization and split parent/child state (§4.4). |
| **D5 — web-search cancellation** | **PASS — scoped to Tavily/DDG adapters** | Abort settles/destroys the request and post-await/fallback transitions check cancellation (`src/security/search-request.ts:8-43`; `src/tools/index.ts:353-367,386-410,421-459`). This verdict does not extend automatically to `web_fetch`/`web_extract`. |
| **D6 — browser cancellation** | **PARTIAL / closure-blocking** | The former post-abort probe/client/raw-action boundaries are present, but shared cold discovery is not caller-isolated and abort rejects before discovery/disconnect have settled (§4.5). |
| **D7 — delegate call-specific signal** | **PASS — stock production wiring** | The delegate forwards the current signal/fence/effect marker; recursion combines call and session signals and passes them to child specialists (`src/agents/specialists.ts:108-135`; `src/agents/recursion.ts:457-470,555-576`). |
| **D8 — single-owner recovery / effect ambiguity** | **FAIL — P0** | Ordinary returned/thrown failed delegations now retain evidence, but failed repairs terminalize and become unrecoverable; regenerated plans and damaged checkpoints also repeat confirmed effects (§3). |
| **D9 — explicit empty recursive grants** | **PASS** | `undefined` inherits only within the parent ceiling while explicit `[]` remains empty (`src/agents/recursion.ts:385-390,482-496`). Specialist construction never falls back to all tools (`src/agents/specialists.ts:146-168`). |
| **Global agent/repair budget** | **PASS for the former bypass** | Repairs reserve/register before intent/effect; reservations are durable and mission-locked. Agent 13 is refused after 12 originals, and failed repairs do not refund their slots (`src/agents/recursion.ts:82-123`; `src/agents/mission-manager.ts:1766-1813`). |
| **Artifact-backed ordinary completion** | **FAIL** | Bytes and reported IDs are checked, but the acceptance-criterion gate is vacuous for an empty criterion set and the fresh probe reaches `completed` (§3.4). |
| **Reproducible offline gate** | **PARTIAL — runner PASS, coverage FAIL** | The single runner is reproducible and isolated per suite, but the P0 probes and several adapter/entry-point negatives below are absent from its recorded green run. |

---

## 3. Decisive P0 blockers

### 3.1 P0 — effect-bearing failed repairs are terminalized instead of remaining recoverable

**Locations:** `src/agents/mission-manager.ts:1836-1873,1911-1993,2011-2032`; checkpoint deletion at `src/agents/lifecycle.ts:165-173`; production repair model marking at `src/agents/specialists.ts:276-305`.

#### Returned-failure path

1. A production repair durably marks the model/tool effect before execution.
2. It returns `success:false` or no verified artifact. The manager calls `retainFailedIntent` and checkpoints the failed repair (`mission-manager.ts:1842-1863`).
3. Execution nevertheless breaks to ordinary finalization, writes `failed`, and unconditionally calls `clearCheckpoint` (`1911-1923,1991-1993`). That deletes the unresolved intent and its evidence.
4. `resolveAmbiguousDelegation` permits resolution only while `paused` (`2024-2032`), so the operator cannot accept or explicitly retry the effect.

#### Thrown-error path

A non-abort repair error is rethrown at `1836-1840`. `settleFailure` terminalizes the ordinary error as `failed` (`1216-1237`). The checkpoint may remain, but the entry is not marked ambiguous and the terminal mission still cannot use the recovery API.

#### Executed reproduction and measurements

Evidence: `final-independent-qa/failed-repair-terminalization-isolated.json`.

| Variant | Repair calls | Marked effects | Status after run | Checkpoint after run | Explicit retry | Resume |
|---|---:|---:|---|---|---|---|
| Returned failure | 1 | 1 | `failed` | `null` | `MissionStateError`: only while paused | `MissionStateError`: terminal `failed` |
| Thrown error | 1 | 1 | `failed` | retained, but `ambiguous:false` | `MissionStateError`: only while paused | `MissionStateError`: terminal `failed` |

Both resolution/resume attempts left the effect count at one; the defect is loss of a supported reconciliation path, not a claim that this probe itself repeated the effect.

**Expected:** pause with a durable ambiguous repair and preserve its checkpoint until explicit accept/retry.  
**Actual:** terminal `failed`; returned-failure evidence is erased, and neither variant can be resolved through the recovery contract.

The green D8.G test does not cover this ordinary path. Its executor forces `status:"failed"` before normal finalization and then the test uses unconstrained `saveMission` to rewrite the mission to `paused` (`src/tests/r0-reqa-manager.test.ts:186-220`). B.3's failed repair does not mark an effect (`270-283`). Thus 70/70 does not close this blocker.

### 3.2 P0 — resume replanning repeats confirmed or operator-accepted effects

**Locations:** plan regeneration at `src/agents/mission-manager.ts:1563-1600`; unmatched work execution at `1606-1687`; fingerprint definition/matching at `329-377` and `src/agents/lifecycle.ts:106-113`; operator-accepted success creation at `src/agents/mission-manager.ts:2034-2087`.

The checkpoint stores completed results but not the executed plan. Every resume asks Head for a new plan. A result is reused only if role, task **and expected output** produce the same normalized fingerprint. Harmless provider paraphrasing of `expected_output` therefore makes confirmed work unmatched and executes it again. The same applies to an operator-accepted success, contradicting the resolver's documented “never re-run” guarantee.

#### Executed reproduction and side-effect measurement

Evidence: `final-independent-qa/resume-repeat-and-corrupt-checkpoint.json`, case `successful_work_then_qa_timeout_then_semantic_replan`.

1. The real manager executes one receipt effect and one valid artifact successfully, then cooperatively times out during QA and becomes `paused`.
2. Resume returns the same role/task but changes `expected_output` from `receipt` to `submission receipt`.
3. Old fingerprint: `e1fc927003a12f8a9a50366afa381992d948de4d2d51859fb535ba30320739f1`.
4. New fingerprint: `c4a513e028fd06a46eec5e53b8fdb61d33256cfa250139abb46393840a56244c`.
5. The mission resumes to `completed`; **specialist calls = 2 and measured receipt effects = 2**. No operator retry was requested.

**Expected:** reuse the confirmed success regardless of semantically irrelevant replanning prose; zero additional effect without explicit retry.  
**Actual:** two executions/two effects. Existing fixtures use byte-stable plans and therefore miss this routine provider-driven path.

### 3.3 P0 — malformed/unreadable/wrong-mission checkpoint evidence is silently discarded and overwritten

**Locations:** `src/agents/lifecycle.ts:151-162`; `src/agents/mission-manager.ts:1148-1166,1563-1623`.

`loadCheckpoint` returns `null` both when no checkpoint exists and when JSON is malformed, reading fails, or `mission_id` differs. `runClaimed` treats that `null` as a fresh mission and writes an empty checkpoint before the strict unresolved-intent gate. The damaged evidence is destroyed; completed results and ambiguous intents disappear, so work is planned and executed again.

#### Executed reproduction and side-effect measurement

Evidence: `final-independent-qa/resume-repeat-and-corrupt-checkpoint.json`, case `malformed_checkpoint_on_resume`.

1. Seed a valid real checkpoint with one confirmed successful artifact/result and one represented receipt effect.
2. Truncate the checkpoint JSON.
3. Resume the paused real manager with the otherwise identical plan.
4. Head observes `completed:0, in_flight:0` in the replacement checkpoint.
5. The specialist executes once after resume; total measured effects increase **from 1 to 2**, and the mission ends `completed`.

**Expected:** fail closed before overwriting evidence or calling Head/a specialist; preserve the damaged file for recovery.  
**Actual:** damage is interpreted as absent history and causes blind re-execution. Atomic writes reduce accidental truncation probability but do not make read errors, damaged restores, wrong mission IDs, or corruption safe.

### 3.4 P0 — zero acceptance criteria vacuously produce verified completion

**Locations:** `src/types/index.ts:19-32,61-75`; `src/agents/qa-gate.ts:318-391`; final completion at `src/agents/mission-manager.ts:1911-1993`.

Neither schema requires a nonempty, nonblank criterion set. `matchCriteria([], [])` produces no rows; no criterion or deliverable blocker is added. With a positive reviewer response and any integrity-valid artifact, the terminal gate can pass.

Evidence: `final-independent-qa/empty-acceptance-criteria.json`.

- `SpecificationSchema.safeParse(...acceptance_criteria:[])`: **accepted**.
- `MissionSchema.safeParse(...)`: **accepted**.
- Real `applyQAGate`: **`passed:true`, `blockers:[]`, `criterion_checks:[]`**.
- Real manager with one ordinary valid artifact: **`completed`**, with persisted `qa_gate.passed:true`.

**Expected:** reject the specification or fail closed because no acceptance criterion was evaluated.  
**Actual:** zero evaluated criteria are treated as complete acceptance evidence.

### 3.5 P0 — process termination publishes resumable state before OS work is quiesced

**Locations:** `src/agents/mission-manager.ts:935-960,2159-2165`; shell process-group termination at `src/tools/index.ts:166-197`; orphan recovery at `src/agents/lifecycle.ts:640-681`.

Normal `cancel()` waits for tracked operations and does not falsely confirm quiescence. The SIGINT/SIGTERM path instead aborts, synchronously checkpoints, marks `paused`, releases the lease, and immediately calls `process.exit`. It does not call `quiesce()`.

**Concrete source-derived reproduction:**

1. An authorized Linux shell starts a process-group child that ignores or delays SIGTERM.
2. Abort sends SIGTERM and schedules SIGKILL after 500 ms (`tools/index.ts:181-190`).
3. SIGTERM reaches the CLI; `pauseForProcessExit` publishes `paused` and releases ownership, then `process.exit(143)` destroys the pending escalation timer.
4. The descendant can continue external/file work after the mission is resumable and unowned. A subsequent explicit retry/resume can overlap it.

A direct SIGKILL likewise cannot execute JavaScript cleanup; orphan reconciliation changes state but does not discover/reap orphaned process groups. Closure needs an external supervisor/container or recorded-process-group reaper for hard death, and must not equate a persisted pause with descendant quiescence.

The existing SIGTERM fixture constructs a manager/installs handlers but does not drive a real running resistant OS child (`src/tests/lifecycle-recovery.test.ts:134-176`). No live process-kill probe was run in this final audit.

### 3.6 P0 governance — the documented one-shot CLI always auto-approves

**Locations:** `src/index.ts:48-104`.

The one-shot command displays the generated specification but never asks for affirmative approval. Whether or not `--no-approve` is supplied, it constructs the mission directly as `approved` and starts the manager. The conditional at `72-74` only prints a message; it does not gate execution.

**Actual:** the documented `npx tsx src/index.ts run ...` path can begin billable/model/tool effects without the required explicit user approval.  
**Expected:** persist `pending_approval` and require affirmative approval, with an explicitly named noninteractive opt-in if one is intended.

The interactive CLI does prompt; that separate path does not remediate one-shot `run`.

---

## 4. Former blocker retests and remaining adapter/integrity defects

### 4.1 Former D8 settled-delegation and repair-budget findings — scoped PASS, not D8 closure

Production specialists mark model generation and each actual tool synchronously before effects (`src/agents/specialists.ts:276-305`; `src/security/tool-context.ts:30-42`). Returned and thrown effect-bearing **ordinary delegations** retain their intent/failed outcome (`src/agents/mission-manager.ts:1339-1416`), and timeout/SIGKILL coverage demonstrates no automatic replay before resolution. This is a genuine improvement, but §3.1–3.3 prevent an overall D8 PASS.

The former cap bypass is closed for the reviewed paths: normal, nested, resumed and repair specialists use durable reservations before execution; failed repairs keep the consumed slot. The 12-original-plus-failed-QA case records zero repair calls/effects. This budget PASS does not make failed-repair recovery safe.

### 4.2 Former D3 same-name and byte-integrity findings — substantial PASS

- Verification requires path, regular non-symlink final file, exact size, SHA-256 and matching bytes/inline content (`src/agents/mission-manager.ts:411-453`).
- Final visible artifacts are rechecked before terminalization (`614-620,1911-1922`).
- Normal repair derives mappings only from new, reported, currently visible, integrity-valid replacements and previously visible same-name predecessors (`507-543,1875-1907`).
- Original result IDs resolve through recorded mappings (`591-631`).
- Recorded tests cover a successful A→B same-name repair, tampered B, unreported B, deleted records, invented predecessor IDs, and crash-time explicit accept.

Those tests support normal same-name repair and byte integrity. They do not authenticate lineage metadata, as follows.

### 4.3 High — real-ID forged/cross-name supersession chains pass the trust filter

**Locations:** `src/agents/mission-manager.ts:498-588,604-620,1422-1437`.

`verifiedSupersessions` verifies only that the old ID exists with the link's name and that the target ID exists. It does not check the target's name, the recorded old hash/size, repair provenance, or whether the replacement was created/reported by that repair. Transitive resolution compares a returned artifact only with the **current hop's** name, not the original artifact's name.

**Concrete source-derived reproduction:**

1. Use real intact records A=`index.html` (hidden), B=`notes.txt` (hidden), C=`notes.txt` (visible), all in one mission.
2. Insert metadata A→B with link name `index.html`, then B→C with link name `notes.txt`.
3. Both links pass `verifiedSupersessions`; resolving an original checkpoint reference to A follows A→B→C and returns C.
4. The deterministic “artifact not registered” blocker disappears although C is not an A replacement. Independent semantic QA still has to pass; this is not a hash bypass or a claim that every QA reviewer accepts it.

The same filter accepts a real same-name A→B mapping manufactured without any genuine repair. The test's positive control itself constructs that metadata/checkpoint shape directly (`src/tests/r0-reqa-manager.test.ts:385-404`), demonstrating trust in writable metadata rather than proven provenance.

**Impact boundary:** normal cooperative repairs generate same-name links. Exploitation requires direct mission-state writing or an agent/local writer with suitable workspace write capability. It is nevertheless an open integrity trust boundary, not closed by the invented-ID negative test.

Additionally, normal `completed`/`failed` finalization does not seal artifact registration (`mission-manager.ts:1964-1992`; `src/utils/storage.ts:296-330`), so direct later storage calls can change the visible registry after terminalization. Final-at-write byte verification is present; post-terminal registry immutability is not.

### 4.4 D4 — the former shell propagation defect is fixed, but `.env` CLI isolation is not

**PASS for the former vector:** shell children inherit the parent-resolved absolute `AWE_DATA_DIR` while provider credentials remain filtered (`src/tools/index.ts:158-170`). The real-child adapter test verifies storage and memory stay under the isolated root. Targeted-repair paths and memory also derive from the configured root.

**Remaining source-derived defect:** `src/index.ts` statically imports lifecycle (`12-16`) before its module body loads `.env` (`1-10`). ESM evaluates static dependencies first; lifecycle/storage therefore capture and initialize `DATA_DIR` before `.env`-only `AWE_DATA_DIR` is applied (`src/agents/lifecycle.ts:31-47`; `src/utils/storage.ts:12-28`).

**Actual:** a CLI started without a process-level variable but with `AWE_DATA_DIR` only in `.env` can touch default `.awe-data`, while later children/modules use the relocated value.  
**Expected:** load configuration before any storage-defining module is evaluated.  
No real `.env` or `.awe-data` was inspected or used to test this; the module-ordering defect is source-deterministic.

### 4.5 D6 — original cold-start transitions are fixed; shared lifecycle/quiescence is not

The recorded 3/3 adapter evidence supports the original fixes: availability probes receive the signal, transition checks prevent a post-abort client/listTools/raw action, raw MCP receives the signal, and a rejected cold discovery is retryable (`src/config/mcp.ts:29-90,221-240`; `src/tools/browser.ts:95-120`).

Two concrete defects remain:

1. **Cross-caller cancellation and missing per-caller wait.** The first caller's signal owns `mcpToolCachePromise`; later callers merely await the shared promise (`src/tools/browser.ts:50-76`). If caller B aborts while caller A's discovery is pending, B does not promptly settle. If A aborts, B receives A's rejection despite B remaining active. Final checks prevent a raw post-abort action; the defect is prompt independent cancellation and concurrent-mission isolation.
2. **Abort rejects before teardown settles.** `awaitDiscovery` starts `void disconnectPlaywrightMCP()` and rejects without awaiting either the original `listTools()` operation or disconnect (`src/config/mcp.ts:29-49`). With pending operations, the outer manager can finish tracking and report quiescence while discovery/cleanup remains active. The adapter test checks that disconnect was called, not that it completed (`src/tests/r0-reqa-adapters.test.ts:169-183`). This is an offline lifecycle proof obligation, not a claim that live Chromium necessarily performs a delayed browser action.

Operational reliability also remains open: transient availability `false` and gracefully returned empty tool maps are cached indefinitely (`src/config/mcp.ts:53-90,227-240`; `src/tools/browser.ts:29-41,50-76`). Aborted rejected discovery recovers; ordinary transient failure does not.

### 4.6 D5 scope boundary — other HTTP tools still need cancellation fixes

D5's Tavily/DDG contract is PASS, but the exported `web_fetch` response-end callback throws from an event callback (`src/tools/index.ts:313-325`) and `web_extract` accepts delayed response-end content without an abort check (`498-545`). Under a permitted delayed transport-double schedule, the former can become an uncaught callback exception and the latter can resolve success after abort. These are additional adapter-boundary negatives for R0-1/R0-5; no real network request was made.

---

## 5. R0-1–R0-5 closure matrix

| Requirement | Verdict | Basis |
|---|---|---|
| **R0-1 — actual stop and no unauthorized continued work** | **FAIL — P0** | Cooperative manager cancel and search abort are improved, but process-exit OS quiescence, shared MCP discovery/teardown, and duplicate resume effects remain open (§3.2, §3.3, §3.5, §4.5). |
| **R0-2 — reliable state, single owner, crash recovery** | **FAIL — P0** | Leases/CAS/orphan controls are meaningful, but repair intents terminalize, regenerated plans repeat success, invalid checkpoints are overwritten, and API recovery gaps remain (§3 and §5.1). |
| **R0-3 — tool/permission safety** | **PARTIAL / not closed** | Deny-by-default, unknown-tool denial, explicit empty grants and parent ceilings pass. One-shot approval governance fails, and the production API/URL boundaries below remain unsafe. |
| **R0-4 — genuine verified execution** | **FAIL — P0** | New registered intact artifacts are required, but empty criteria complete vacuously; supersession provenance is not authenticated (§3.4, §4.3). |
| **R0-5 — unified reproducible technical verification** | **PARTIAL / coverage failure** | One documented runner and recorded 18/18 gate exist. The reproduced P0 cases and several negative entry-point/concurrency cases are not in that gate. |

### 5.1 R0-2 production recovery and API races

**High — the mandatory strict recovery resolver is not exposed by the shipped interface.**  
Strict is the production default (`src/agents/mission-manager.ts:1511-1555`). Resume writes `metadata.recovery_blocked.resolve_with` naming `resolveAmbiguousDelegation`, but one-shot/resume CLI only invokes `run()` and REST has no resolution/resume route (`src/index.ts:138-175`; `src/api/server.ts:98-232`). The function is only a library export (`mission-manager.ts:1997-2139`). After a normal crash, a stock operator can repeatedly resume into `recovery_blocked` but cannot accept/retry without custom JavaScript or manual state mutation.

**High — API approval has an unrecoverable crash window.**  
The API commits `pending_approval → approved` before constructing/starting the manager (`src/api/server.ts:151-173`). Orphan reconciliation ignores `approved` records (`src/agents/lifecycle.ts:640-655`); approve accepts only `pending_approval`, and CLI resume accepts only `paused`. A process death between approval and the manager's `running` claim therefore strands the mission through shipped interfaces.

**High — stale API error handling can overwrite a replacement owner.**  
After a non-state error, the old request checks `hasLiveLease` and then updates `approved|running → failed` without a lease fence or owner-generation condition (`src/api/server.ts:173-182`). A cross-process schedule can release the old lease, reconcile/resume under a new owner, and then let the old request's conditional atomic write mark the replacement's `running` mission `failed`. Atomicity of the single write does not connect it to the preceding liveness decision.

### 5.2 R0-3 production security defects — not live-tested

These are source-derived production security findings, not evidence from network operations:

- **Default API exposure/authentication:** unrestricted CORS, `app.listen(port)` without a loopback bind, missing-secret open mutation routes, and unauthenticated mission/artifact/log reads (`src/api/server.ts:34-60,69-98,133-239`). Even with a secret, sensitive reads are public. A separately secured reverse proxy can change deployment exposure; none is proven here.
- **DNS-resolution SSRF gap:** `assertSafeUrl` rejects literal local/private hosts but never validates DNS-resolved socket destinations (`src/tools/index.ts:65-80,287-335,473-545`). An authorized URL using a public hostname that resolves to loopback/private/link-local space passes the lexical filter and is supplied to Node's HTTP client. Controlled offline DNS/socket coverage is required before claiming the network boundary is closed.

These issues independently forbid production-readiness claims; the offline FAIL verdict does not depend on demonstrating them against a live service.

### 5.3 R0-5 runner scope and missing negatives

`scripts/run-offline-tests.mjs:9-86` discovers top-level `*.test.ts`, starts each in a fresh process with fresh `AWE_DATA_DIR`, supplies synthetic primary provider values, imposes a 300-second per-suite limit, cleans its sandbox, logs results and fails nonzero. This is a useful reproducible gate, documented by `README.md:31-40`.

It is not a network-denied sandbox: it spreads the parent environment and does not clear every possible credential (`run-offline-tests.mjs:39-46`). No live connection is alleged from that fact. The summary's offline label must not be interpreted as a technical egress proof.

The recorded green run lacks the exact ordinary failed-repair response, semantic resume replanning, malformed/unreadable/wrong-mission checkpoint, empty-criterion manager completion, resistant process-group termination, concurrent shared-discovery, approved-after-API-crash, and production recovery-interface cases. Adding a superficially similar test is insufficient: D8.G demonstrates how forced state can mask the actual finalization path.

---

## 6. Explicit offline/live evidence separation

### Demonstrated offline (within stated scope)

- Real local manager, storage, checkpoint, lifecycle and QA-gate behavior exercised by the new probes.
- Recorded lease/CAS/orphan recovery, process/model cancellation contracts, deny-by-default grants and durable budgets.
- Recorded artifact byte-integrity, normal same-name repair and explicit library-level accept/retry behavior.
- Recorded D4 real shell-child propagation and D6 offline availability/discovery/raw-action adapter contracts.

### Not established by this audit or the recorded suite

- Router.Cheap or any real provider's cancellation, error, usage, billing or idempotency behavior.
- Real Chromium/Playwright/MCP startup, request cancellation, disconnect completion, browser effect timing or visual verification.
- Real HTTP/DNS behavior and SSRF resistance.
- PostgreSQL durability/transactions/recovery or any multi-host distributed lock behavior.
- Windows computer-use, production deployment, external-effect authorization, authenticated multi-user operation or production spending limits.

The tests deliberately use injected executors, provider stubs and MCP/transport doubles for decisive negative cases. They prove those offline contracts, not live-service readiness. No external-effect or production acceptance is claimed.

Previously acknowledged parent-symlink containment and verification-to-terminal interprocess-writer limitations also remain outside a strong hostile-local-writer certification. They are not needed for this FAIL decision.

---

## 7. Minimum correction and revalidation required before another closure request

1. **Repair recovery:** after any effect-marked returned/thrown failed repair, persist an ambiguous intent and pause before ordinary terminalization. Never clear unresolved evidence. Test without forcing mission status or manually rewriting terminal state.
2. **Stable resume identity:** persist and reuse the exact accepted plan/stable delegation IDs. A regenerated prose paraphrase must not redefine completed work. Test success→QA timeout→paraphrased resume and operator accept→paraphrased resume with exact effect counts.
3. **Checkpoint integrity:** distinguish missing from malformed/unreadable/wrong-mission evidence; fail closed before overwrite, Head or specialist execution, and preserve the damaged file. Add all three negatives.
4. **OS/MCP quiescence:** do not publish resumable/stopped state or release ownership until descendant processes and discovery/teardown are actually settled. Use an external supervisor for SIGKILL/hard death. Add a SIGTERM-resistant process-group test and deferred MCP disconnect completion tests.
5. **Acceptance evidence:** require at least one nonblank acceptance criterion in both schemas and add an independent `applyQAGate` blocker. Add criterion-specific artifact/semantic verifier coverage rather than relying solely on names/prose.
6. **Approval and operator recovery:** make one-shot approval explicit, expose authenticated retry/accept/resume operations, and close the API approved-before-running crash window and stale fallback race with owner-fenced CAS.
7. **Artifact lineage/immutability:** validate both endpoints and original name across every supersession hop, bind links to genuine repair/operator resolutions and expected hashes, and define/seal post-terminal artifact behavior. Add real-ID forged and cross-name-chain tests with an explicit threat model.
8. **D4/D6/general HTTP:** load `.env` before storage imports; isolate shared discovery per caller, make cancellation waits prompt and teardown accounted, avoid permanent transient negative caches, and make all HTTP callbacks settle safely after abort.
9. **API/network safety:** secure listener/CORS/auth defaults for sensitive reads and writes, and validate actual DNS/socket destinations for private/local/link-local addresses.
10. **Verification:** put the regressions in the unified gate, rerun the complete offline suite plus typecheck/build on the corrected tree, and repeat independent adversarial QA. Live-provider, real-MCP/Chromium, PostgreSQL and deployment acceptance require separate authorization and separate evidence.

## Signed closure decision

**Independent adversarial QA rejects R0 offline closure on 2026-11-13.** The integrated 18/18 evidence is useful regression evidence but is contradicted by reproducible P0 paths in recovery, repeated external effects, process quiescence, acceptance verification and explicit approval. **NO-GO; keep R0 open.**
