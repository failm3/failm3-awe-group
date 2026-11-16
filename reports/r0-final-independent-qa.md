# NOX R0 — Final Independent Adversarial QA

**Review date:** 2026-11-13  
**Mode:** read-only source/test review, recorded offline evidence, and `npm run typecheck`  
**Overall verdict:** **FAIL — DO NOT CLOSE R0 OFFLINE**  
**Production verdict:** **NOT ASSESSED / NOT READY TO INFER**

R0 has substantial, well-tested improvements in local CAS, leases, model cancellation, real shell cancellation, artifact persistence, and deny-by-default tool construction. It does not yet satisfy the final closure contract. In particular, stale owners can still cause raw file/browser side effects, artifact integrity is optional rather than mandatory, browser/search cancellation is incomplete, and an exact-once crash gap remains.

## 1. Evidence and review limits

### Evidence used

- `reports/r0-test-results/summary.json`: **12/12 suites passed**, 0 failed, recorded from 04:08:12Z through 04:11:11Z.
- Recorded focused results: independent contracts **34/34**, manager **76/76**, storage+lease **53/53**, recursion **37/37**, security tools **5/5**.
- Recorded `typecheck.log` and `build.log`: clean.
- Fresh non-mutating `npm run typecheck` in this review: **PASS**.
- Every entry in `reports/r0-test-results/final-source.sha256` matches the current workspace. Every entry in `reports/r0-test-results/evidence.sha256` also matches. Thus the recorded final evidence is tied to the reviewed source snapshot.
- Direct inspection of manager, lifecycle, storage, recursion, specialist/provider outcome handling, tool context, real file/shell/web/search/browser adapters, API/CLI entry points, test harnesses, and offline runner.

The full suite was **not rerun**, as requested. Negative reproductions below are minimal, code-derived adversarial scenarios for future isolated tests; they were not executed against real `.awe-data`, networks, browsers, models, or other live services.

### What the evidence does not prove

No live LLM, real browser/MCP action, external web request, PostgreSQL, deployment, Windows computer-use, spending limit, or production readiness is established. Green doubles prove the tested offline contracts only. In particular, they do not negate the production-adapter defects identified below.

Verdict meanings: **PASS** = requirement demonstrated within the stated offline scope; **PARTIAL** = important controls work but a required case remains open; **FAIL** = a concrete path violates the requirement; **BLOCKED** = evidence is insufficient to decide.

## 2. Verdict matrix

| Item | Verdict | Decisive reason |
|---|---|---|
| Final P0: expired-live-owner exclusion | **PASS** | Live local processes block takeover and orphan pausing even after lease expiry; recorded L3/L4 tests cover this. |
| Final P0: stale-owner tool/artifact fencing under mission lock | **FAIL** | Registry writes are fenced under the mission lock, but `file_write` changes the workspace first and browser MCP does not revalidate ownership after asynchronous discovery. |
| Final P0: complete artifact integrity and genuine repair evidence | **FAIL** | Size/hash checks are optional; path-backed records without either and same-size replacements without a hash pass. Repair identity is improved, but uses the same incomplete integrity predicate. |
| Final P0: universal `AWE_DATA_DIR` isolation | **PARTIAL** | Core storage, checkpoints, leases, logs, artifacts, and memory follow it; the shipped targeted-repair entrypoint still hardcodes `.awe-data/artifacts/...`. |
| Original blocker: cancellation | **PARTIAL** | Manager/model/shell quiescence works in recorded tests, but `web_search` and browser MCP do not cancel underlying work and search can start fallback work after abort. |
| Original blocker: single-owner CAS/recovery | **PARTIAL** | CAS, terminal fencing, leases, and confirmed-death recovery pass; a crash after an effect but before its success checkpoint still causes blind re-execution. |
| Original blocker: deny-by-default recursive tool grants | **PARTIAL** | No-context/ungranted/unknown tools and parent-ceiling escalation fail closed, but an explicit child `tools: []` inherits parent tools. |
| Original blocker: artifact-backed success | **FAIL** | New artifact IDs and final existence checks are required, but missing integrity metadata can still allow changed evidence to reach `completed`. |
| Original blocker: reproducible offline runner | **PASS (coverage-limited)** | One documented `npm test` command, fresh process/data directory per suite, synthetic model config, recorded 12/12 result, and matching final source/evidence manifests. The adversarial cases below are not yet in that gate. |

## 3. Final P0 verification

### 3.1 Expired-live-owner exclusion — PASS

`isLeaseOwnerPotentiallyActive()` treats a same-host live PID as potentially active regardless of expiry and conservatively treats another host as active (`src/agents/lifecycle.ts:340-350`). Acquisition denies both a live lease and a potentially active owner (`src/agents/lifecycle.ts:494-505`). Orphan reconciliation rechecks that condition inside the mission lock (`src/agents/lifecycle.ts:657-668`).

Recorded `r0-runtime-storage-lease` L3/L4 evidence verifies that an expired lease with a live owner denies takeover, is not falsely paused, cannot be falsely confirmed cancelled, becomes recoverable only after confirmed death, and cannot be released by a stale token. This is good offline evidence for the local-filesystem protocol. It is not a distributed-lock or PID-reuse certification.

### 3.2 Stale-owner tool/artifact fencing — FAIL

The storage layer does the right thing for registry operations: `saveArtifact`, `saveArtifactFile`, and `reconcileArtifactFiles` revalidate supplied fences under the mission lock (`src/utils/storage.ts:303-350,393-399`). The recorded security/storage tests demonstrate denied late metadata/content registration.

That protection does not cover all effects performed by the real adapters.

#### D1 — High / P0: `file_write` writes before the locked fence check

**Location:** `src/tools/index.ts:227-240`; locked recheck occurs only in `src/utils/storage.ts:326-350`.

`guard("file_write")` checks ownership at entry. The tool then creates directories and writes the caller-selected workspace file at lines 231-232. Only afterward does `saveArtifactFile()` revalidate the fence under the mission lock. A stale call therefore returns an error while leaving its raw write behind. Omitting `mission_id` also leaves no locked second check at all.

**Minimal negative reproduction:** in a disposable workspace, invoke `fileWriteTool` with a matching `mission_id`, grant `file_write`, and `fence = () => ++checks === 1`. Entry succeeds; registration fails with `ownership lost`; the requested raw file has nevertheless been created. The existing test at `src/tests/r0-security-tools.test.ts:43-55` covers only `save_artifact`, not this adapter.

#### D2 — High / P0: browser MCP executes after asynchronous discovery without a fence recheck

**Location:** `src/tools/browser.ts:77-99`.

The tool checks its grant/fence at line 82, then awaits availability and tool discovery at lines 83 and 89. Line 93 rechecks only abortion; line 94 executes the raw MCP operation without rechecking ownership. A fence that becomes false during cold discovery does not prevent navigation/click/type.

**Minimal negative reproduction:** use a deferred offline availability/discovery double, begin `browser_navigate`, flip the context fence from true to false, then release discovery. The current control flow reaches `tool.execute(input)` despite stale ownership. Add a test asserting zero MCP invocation, not merely an error returned afterward.

### 3.3 Complete artifact integrity and genuine repair — FAIL

The final gate is substantially improved: every listed artifact is rechecked before the terminal write (`src/agents/mission-manager.ts:303-309,1351-1361`), repair must report a newly registered artifact (`src/agents/mission-manager.ts:1286-1312`), and recorded M13/M14 tests reject deleted initial, repaired, and reconciled files and empty repair output.

The implementation is nevertheless fail-open when metadata is absent.

#### D3 — High / P0: integrity metadata is optional

**Location:** `src/agents/mission-manager.ts:260-279`; schema permits it at `src/types/index.ts:140-149`; generic registration accepts it at `src/utils/storage.ts:308-315`.

- An inline record is accepted solely because `content` is a string (line 262).
- A path-backed record with neither `metadata.size_bytes` nor `metadata.sha256` is accepted if the path currently names a readable regular file.
- Supplying only size still permits same-size content replacement; supplying only hash omits an independent size expectation but hash mismatch is at least detected.

Consequently, legacy/generic artifacts can be changed after review without any deterministic blocker. The same predicate admits repair artifacts at lines 1305-1310, so a new ID alone is not complete integrity evidence.

**Minimal negative reproduction:** using a fresh temporary `AWE_DATA_DIR`, register an artifact through `saveArtifact` with an existing backing path and `metadata: {}`; have the injected specialist report its ID and injected QA pass; disable further repair with a checkpoint at the repair bound. Replace the backing bytes before the final gate. `artifactIntegrityDefect()` returns `null`, allowing the otherwise passing run to reach `completed`. Repeat with only `size_bytes` and a same-length replacement, and with an inline-only artifact. Expected closure behavior is a critical integrity blocker in all three cases.

Required tests must cover original, repaired, resumed, and reconciled evidence, missing one/both integrity fields, same-size hash changes, and inline content. Existing deletion tests do not cover these paths.

### 3.4 Universal `AWE_DATA_DIR` isolation — PARTIAL

Core paths correctly derive from `AWE_DATA_DIR`: storage at `src/utils/storage.ts:12-16`, checkpoint path at `src/agents/lifecycle.ts:47`, and memory at `src/memory/index.ts:6-10`. The runner sets the variable before launching each suite (`scripts/run-offline-tests.mjs:38-55`), and recorded QA evidence confirms that `memory.db` follows it.

#### D4 — Medium: a shipped entrypoint bypasses the relocated artifact root

**Location:** `src/run-targeted-repair.ts:8-10,60-84`.

`SOURCE_DIR` is hardcoded to `.awe-data/artifacts/25be...`. Running this mission-specific utility with `AWE_DATA_DIR` set still instructs its specialist to read and modify that relative real-data path. This defeats a literal “universal isolation” claim, although the normal R0 manager/CLI/API paths do not use this helper.

**Minimal negative reproduction:** in a disposable project copy, create a dummy source tree under both the default `.awe-data` and relocated artifact roots, set `AWE_DATA_DIR` to the latter, and run the helper with offline tool/model doubles. The generated task still names the default-root files. No live run is needed to establish the conflicting path. Route it through exported storage paths or explicitly remove/exclude the helper from the supported R0 runtime before claiming universal isolation.

## 4. Original blocker reassessment

### 4.1 Cancellation — PARTIAL, closure-blocking adapter gaps remain

The manager now propagates aborts, waits for tracked work, retains ownership for non-cooperative operations, seals late artifact registration, and uses fenced terminal writes (`src/agents/mission-manager.ts:498-539,659-721,736-831`). Recorded contracts cover model abort, real shell process-tree termination, cross-process cancellation, delayed settlement, and terminal protection. Those are meaningful passes.

#### D5 — High / P0: web search ignores abort and can initiate fallback after cancellation

**Location:** `src/tools/index.ts:350-360,364-471`.

After entry, neither Tavily nor DDG receives the tool signal, and there is no post-await `throwIfAborted`. A delayed Tavily request can resolve successfully after cancellation. If it fails, line 360 starts a new DDG request after abort. The 15-second and 8-second timeouts are eventual bounds, not cancellation.

**Minimal negative reproduction:** stub `https.request` offline; hold the Tavily response, abort the tool context, then release a successful response. Observe a successful result after abort. In a second case, fail Tavily after abort and assert that no DDG request is constructed; current code constructs one. Also assert prompt destruction/settlement of the in-flight request.

#### D6 — High / P0: browser cancellation does not reach MCP execution

**Location:** `src/tools/browser.ts:82-99`.

`throwIfAborted()` before and after `await tool.execute(input)` does not cancel that operation. Navigation or click side effects can continue after cancellation; line 95 only converts the eventual result into an error. Manager quiescence can avoid falsely confirming an early terminal stop, but it does not provide the required browser cleanup or prevent the external action after the cancellation request.

**Minimal negative reproduction:** use an offline MCP double whose click invokes a side effect only when released. Start the browser tool, abort, then release it. Current code still performs the effect. The test must require cancellation/close to reach the MCP operation and zero post-abort effect; checking only the returned `{success:false}` is insufficient.

#### D7 — Medium: the production delegate adapter drops its call-specific signal

**Location:** `src/agents/specialists.ts:108-130`; composition at `src/agents/recursion.ts:406-412`.

The delegate entrypoint passes parent grants and fence but not `getToolContext()?.signal`. `runDelegateCall` therefore has only its explicit option and mission-session signal. Normal manager runs mitigate this by binding the session signal at `src/agents/mission-manager.ts:782-784`; standalone production `executeSpecialist({signal})` does not.

**Minimal negative reproduction:** invoke the standalone specialist/delegate seam with a call signal but no `setSessionSignal`, hold a child, and abort the specialist. The child does not receive that signal. Pass the current tool-context signal explicitly and retain the mission-level combination.

### 4.2 Single-owner CAS/recovery — PARTIAL

Atomic read-modify-write under a cross-process mission lock, revision CAS, terminal-state refusal, lease ownership tokens, heartbeats, stale-release protection, and orphan recovery are present and well exercised (`src/utils/storage.ts:175-243`; `src/agents/lifecycle.ts:374-685`). Recorded concurrent writer, double-run, live/dead owner, and durable-success resume scenarios support those controls.

#### D8 — High / P0: the effect-to-checkpoint crash gap still duplicates effects

**Location:** delegation effects occur at `src/agents/mission-manager.ts:988-1005`; success is checkpointed only after return at `src/agents/mission-manager.ts:1162-1167`; in-flight entries are informational and rerun by policy at `src/agents/mission-manager.ts:182-190` and `src/tests/helpers/r0-worker.ts:371-380`.

There is no durable intent/idempotency record before an effect. If the process dies after the effect/artifact but before the manager records a successful checkpoint, resume has no matching completed entry and executes the delegation again. The recorded `manager-crash-resume` test waits until the second delegation starts, which guarantees that the first success checkpoint already exists; it does not exercise this gap.

**Minimal negative reproduction:** a one-delegation worker appends an external-effect receipt and saves its artifact, then is SIGKILLed before returning to `onDone`. Restart the real manager with the same plan and a fresh receipt sink. Current resume policy runs the delegation again and can finish `completed` with two effects. Closure requires durable intent plus an explicit ambiguous-outcome policy or idempotency mechanism, tested at the exact effect/checkpoint boundaries; deduplicating an artifact by name is not exactly-once execution.

### 4.3 Deny-by-default recursive grants — PARTIAL

Positive controls are real: `createSpecialist` constructs only explicitly granted registered tools (`src/agents/specialists.ts:141-163`), `assertToolAllowed` requires context, grant, active signal, and current fence (`src/security/tool-context.ts:28-35`), and recursive children cannot exceed the parent grant ceiling (`src/agents/recursion.ts:424-438`). Recorded tests cover ambient-tool denial and parent ceilings.

#### D9 — Medium: explicit empty child grants are treated as omitted

**Location:** `src/agents/recursion.ts:327-333,424-432`.

Both inheritance decisions use `child.tools?.length`. Thus `undefined` and `[]` are conflated. With parent grants `{shell}`, a child explicitly requesting `tools: []` receives inherited parent tools rather than no capabilities. This does not exceed the parent’s global ceiling, but it violates per-child deny-by-default/least-privilege semantics.

**Minimal negative reproduction:** call `runDelegateCall` with `options.allowedTools = new Set(["shell"])` and `{role:"child", task:"x", tools:[]}`. Inspect the injected executor configuration: current `tools` and `allowedTools` contain `shell`; expected is two empty arrays and no attached execution capability. Test legacy and per-child forms, including a parent request-level tool list.

### 4.4 Artifact-backed success — FAIL

The provider evaluator rejects empty text, provider error finish, missing new artifacts, and failed artifact saves (`src/agents/specialists.ts:227-247`). The manager intersects reported IDs with actual new registry entries and applies a final execution/QA gate. These changes close the original “persuasive prose alone equals success” path in recorded tests.

However, D3 leaves a direct false-completion path through accepted legacy/generic evidence with no immutable integrity expectation. Therefore this blocker cannot be marked PASS or merely accepted as a legacy limitation. Either migrate/backfill evidence with verified hashes or fail closed with an explicit recovery path.

### 4.5 Reproducible offline runner — PASS for the current gate, not a correctness certificate

`npm test` discovers every top-level `*.test.ts`, starts each in a fresh process with a fresh `AWE_DATA_DIR`, applies synthetic Router/OpenAI credentials and a local-only model endpoint, imposes a five-minute suite timeout, removes the suite sandbox, writes logs, and returns nonzero on failure (`scripts/run-offline-tests.mjs:9-86`). The command is documented in `README.md:31-40` and recorded as 12/12 PASS. Current source/evidence hashes match the final manifests.

This is a valid reproducible offline runner. Its PASS is explicitly coverage-limited: D1-D9 need regression cases, and its result says nothing about live providers, real browser/MCP behavior, PostgreSQL, or production deployment.

## 5. Closure decision and minimum revalidation

### Recommendation: **NO-GO; keep R0 open**

At minimum, R0 may be reconsidered for **offline** closure only after all of the following are implemented and independently reviewed:

1. Close D1/D2 so stale ownership cannot produce raw file or browser effects; prove the fence at the actual side-effect boundary, not just artifact registration.
2. Close D3 by requiring complete integrity evidence for every accepted artifact, including repair/resume/reconciliation and legacy/inline records; add same-size replacement tests.
3. Close D5/D6 by propagating abort to both search implementations and MCP execution, prohibiting post-abort fallback, and proving no delayed side effect.
4. Close D8 with durable intent/idempotency or explicit ambiguous recovery at the effect/checkpoint gap.
5. Close D7/D9 and enforce the advertised mission-wide agent ceiling. `registerTopLevelNode` currently increments `session.spawned` without checking `RECURSION_LIMITS.maxTotalAgents` (`src/agents/recursion.ts:139-160`), and `resetSession` plus every manager attempt resets the budget (`src/agents/recursion.ts:97-99`; `src/agents/mission-manager.ts:782`). A Head plan of 13 top-level delegations therefore evades the cap of 12, and pause/resume replenishes it. Add top-level and cross-resume budget tests.
6. Resolve D4 for the shipped targeted-repair helper or narrow the supported isolation claim explicitly.
7. Run the single full offline gate and typecheck on the fixed tree, then repeat independent adversarial QA. A future live acceptance phase must be separately authorized and reported; it cannot be inferred from that offline PASS.

**Final statement:** the recorded green suite is evidence of meaningful progress, not R0 closure. The current tree retains closure-blocking high-severity defects in ownership fencing, artifact integrity, cancellation, and crash recovery.
