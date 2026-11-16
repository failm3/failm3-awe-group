# R0 — Independent Final Closure Re-QA

**Review date:** 2026-11-13  
**Overall verdict:** **FAIL — DO NOT CLOSE R0 OFFLINE**  
**Independent QA sign-off:** **REJECTED / NO-GO**  
**Production/live-service verdict:** **NOT ESTABLISHED**

The current tree contains substantial, real remediation of the earlier R0 findings. In particular, effect-bearing failed repairs remain recoverable, stored plans survive paraphrased resume requests, damaged checkpoints fail closed, empty acceptance criteria are rejected, ordinary nonterminal cancellation/fatal finalization checks quiescence, and repeated SIGTERM is retryable. The selected fresh regressions and typecheck were green.

Those results do not close R0. Fresh production-path probes confirm stale-owner shell/HTTP effects and a descendant that escapes the registered process group, remains live after the manager returns, and then performs a file effect. Terminal cancellation also reports `quiesced:true` and zero pending operations without inspecting an existing live registered group. Source review additionally confirms a replacement-owner/reaper race and a directly executable targeted-repair path outside manager lease, termination, and QA controls.

At least two independently executed defects are P0-equivalent because they violate the core no-post-settlement-effect and single-owner guarantees. Additional source-confirmed recovery schedules can repeat confirmed work without a new operator retry. Overall PASS is therefore forbidden. This is not a production-readiness or live-service certification.

---

## 1. Scope, snapshot, and evidence rules

### 1.1 Reviewed material

This review read:

- `reports/r0-final-closure-reqa.md`;
- `reports/r0-independent-lifecycle-audit.md`;
- `NOX-R0-FINAL-ENGINEERING-REPORT.md`;
- all 18 current `src/tests/r0*.test.ts` files (5,387 lines), their relevant helpers, and the integrated production paths they exercise.

Reviewed Git HEAD remains `446adaea833b0ebade1a21fbda3f71118d19b0d6`. R0 remains working-tree content, not an audited release commit. A current 62-file TypeScript/configuration manifest is saved at:

```text
.r0-work/final-closure-reqa-20261113-01/source-tests.sha256
```

Notable current hashes:

```text
cc755d0be38477cedae81286e4cd7a4ca66075bbffa3d92cef8838b1529342c0  src/agents/mission-manager.ts
2f77228a72ec63179ca75a99b1928119aa4663771212ac34fe0ba8a4d21dc6ef  src/agents/lifecycle.ts
ecb6eba1c6ccd746196cdfd00561cbaa1ffb1de4b267b45deb6d86b66d7175da  src/tools/index.ts
```

### 1.2 Restrictions and isolation

No production source or production test was modified. No Git mutation, deployment, R1 work, real/default `.awe-data` access, PostgreSQL, external network/DNS, live LLM, real Chromium, real MCP service, or Windows computer-use was performed.

Fresh selected suites used fresh `AWE_DATA_DIR` roots and unset provider/search credentials. Adapters used mocked transports/DNS or local process fixtures. Interface tests used loopback-only HTTP fixtures. Independent probes wrote only beneath `.r0-work/final-closure-reqa-20261113-01`. The final successful process probe cleaned its resistant registered group; cleanup verification found zero QA process-registry JSON records and no QA-matching child processes.

### 1.3 Evidence classification

- **Executed:** directly observed in a fresh suite/probe in this review.
- **Source-confirmed:** current code lacks the required guard and has a concrete reachable schedule, but the exact schedule was not separately executed.
- **Historical regression evidence:** the requested 22/0 log; it is not a fresh full-gate run and cannot override a confirmed defect.
- **Not established:** live-provider, real-browser/MCP, external-network, PostgreSQL, Windows, deployment, and production-spending behavior.

---

## 2. Historical log verification and fresh observed counts

### 2.1 Requested historical 22/0 record

`reports/r0-test-results/full-offline-lifecycle-remediation.log` was verified:

```text
SHA-256: 411f8392522df0d6d91b5c3969b571f6c7abdc5288313877012edf2944e72440
suite PASS markers: 22
suite FAIL markers: 0
final line: Offline suites: 22 passed, 0 failed
```

This is retained as regression evidence only. It is not represented as a fresh run by this audit, and the focused counts below are not added to 22.

### 2.2 Fresh selected offline suites

All listed processes exited 0:

| Fresh suite | Observed result |
|---|---:|
| `r0-closure-core.test.ts` | **13 tests / 13 passed** |
| `r0-closure-adapters.test.ts` | **17 tests / 17 passed** |
| `r0-closure-process-lifecycle.test.ts` | **7 tests / 7 passed** |
| `r0-final-recursion.test.ts` | **8 checks / 8 passed** |
| `r0-final-manager.test.ts` | **79 checks / 79 passed** |
| `r0-closure-interfaces.test.ts` | **90 checks / 90 passed** |
| `r0-runtime-manager.test.ts` | **76 checks / 76 passed** |
| `r0-final-tools.test.ts` | **12 tests / 12 passed** |
| `r0-security-tools.test.ts` | **5 tests / 5 passed** |
| `tsc --noEmit` | **PASS, exit 0** |

These are nine selected suites, not a fresh execution of the complete 22-suite gate. Node test counts and custom check counts are kept distinct. No fresh production build was run. Logs and exit-status files are in `.r0-work/final-closure-reqa-20261113-01/logs/`.

### 2.3 Fresh independent adverse probes

| Probe | Exit | Observed decisive result |
|---|---:|---|
| `probes/stale-effects.test.ts` | 0; **3/3 reproductions** | After the fence became false, shell reached spawn and durable launch preparation; `web_fetch` and `web_extract` each constructed and ended a new mocked transport. `web_fetch` wrote its POST body. |
| `probes/process-gaps.ts` | 0 | A real `setsid` child was live in a new session/PGID, no process record remained, manager run settled, and the child then created its late-effect file. A terminal `cancelMission` returned `quiesced:true` with an existing resistant registered group. |

Evidence: `probes/stale-effects-evidence.json`, `probes/process-gaps-evidence.json`, and corresponding logs. The mocked HTTP probes prove request creation/body submission at the adapter boundary only; no external request was sent. An earlier unsuccessful custom module-hook experiment was discarded and is not used as evidence for the reaper race.

---

## 3. Closure-blocking findings

### F1 — P0: descendants can escape the registered PGID and perform effects after manager settlement

**Locations:** `src/tools/index.ts:207-300`; `src/utils/process-registry.ts:267-361`; shell policy at `src/tools/index.ts:214`.

The registry follows only the originally recorded PGID. The shell policy does not prevent `setsid` or equivalent process-group/session escape. A child in a new session is invisible to `liveGroupMembers(record.pgid)`; natural shell close can therefore remove the record and report quiescence while the escaped child remains live.

**Executed reproduction:**

1. The real shell tool launched a local Node fixture using `setsid`.
2. The fixture wrote its PID and became ready. `/proc/<pid>/stat` showed it sleeping/live with its own PGID/session.
3. The shell returned success and the mission had no process-group record.
4. The injected planner produced a controlled failure; the real manager settled and returned.
5. Only after that settlement did the fixture observe its trigger and write `late-effect` inside the disposable workspace.

The final fresh run recorded `aliveAfterShell:true`, no records after shell/run, and `lateEffectAfterRun:true`. The published state in that run was `paused`; earlier runs also demonstrated the defect across a `failed` return. The decisive invariant is independent of which recovery state was selected: OS work continued after the manager had stopped accounting for it.

**Impact:** post-terminal/resumable external effects and overlap with later resume/retry. The current resistant-child tests remain in the original PGID and miss this schedule.

**Required closure:** containment must cover the whole descendant tree (for example a properly configured supervisor/cgroup/job sandbox), deny session/group escape where feasible, and treat inability to account for descendants as non-quiesced. Add this exact real-process negative to the gate.

### F2 — P0: stale owners can still create shell and HTTP effects

**Locations:** entry-only fence in `src/security/tool-context.ts:30-42`; shell at `src/tools/index.ts:207-300`; DNS/request path at `410-560`; fetch/extract at `610-617,771-781`; search fallback at `640-653`.

`assertToolAllowed` checks ownership at entry. The shell does not re-fence immediately before durable launch preparation/spawn. Fetch/extract re-check abort and address safety after asynchronous DNS but not `context.fence()`. Search fallback likewise re-checks abort, not ownership. Abort and stale ownership are separate states.

**Executed reproduction:** a fence returned true at entry and false at the final effect boundary. Observed results:

| Path | Owner at effect | Observed stale effect |
|---|---:|---|
| shell | false | spawn reached; durable launch/release record existed |
| `web_fetch` POST | false | one transport constructed/ended; body `stale-owner-effect` written |
| `web_extract` | false | one transport constructed/ended |

A source-confirmed equivalent permits the DDG fallback after a stale-but-not-aborted owner finishes a failed Tavily attempt.

**Impact:** an owner that has lost the mission can still launch process or network effects, violating single-owner effect exclusion. File write and browser MCP have final re-fencing; these paths do not.

**Required closure:** recheck abort and ownership atomically with, or immediately before, every irreversible process/network transition under the applicable ownership discipline; fence the search primary/fallback transition as well. Add fence-flip negatives at DNS, path-validation, and fallback boundaries.

### F3 — High/P1: terminal cancellation fabricates quiescence

**Locations:** `src/agents/mission-manager.ts:801-810,867,879-888`; related API fast paths at `src/api/server.ts:393-399`.

Already-terminal status is treated as proof that no OS work remains. No registry scan, malformed-record handling, or group settlement occurs.

**Executed reproduction:** a real SIGTERM-resistant registered child was active for a mission marked `failed`. `cancelMission` returned:

```json
{"cancelled":false,"quiesced":true,"status":"failed","pending_operations":0}
```

The durable record remained. Cleanup used the production group quiescence routine and succeeded.

**Impact:** operators/automation receive false evidence that cleanup is complete. This does not itself newly terminalize the mission, so it is High/P1 rather than the primary P0; it compounds F1 and alternate-runner gaps.

**Required closure:** terminal status must return unknown/non-quiesced until process evidence has actually been settled. Preserve pending evidence through the API rather than returning a clean fast-path result.

### F4 — P0/P0-equivalent, source-confirmed: replacement lease can be acquired while orphan reaping is unresolved

**Locations:** `src/agents/lifecycle.ts:668-710,816-875`.

`reconcileOrphanedMissions` records a revision under the mission lock, releases that lock, and awaits `reapOrphanedMissionProcessGroups` at line 845. `tryAcquireMissionLease` checks lease ownership, not an active recovery or unresolved process records. A replacement can therefore acquire and start during the SIGTERM/SIGKILL grace interval. The final revision CAS detects the new owner only after overlap has become possible.

**Concrete schedule:** dead old owner + resistant descendant → reaper starts and releases mission lock → replacement acquires lease → replacement begins work while old descendant remains → reconciler's final CAS fails.

This is a current-source schedule, not an executed claim from the discarded probe hook. It violates the same no-overlap requirement as the executed stale-effect cases and is closure-blocking.

**Required closure:** hold a recovery ownership/fencing record across the entire reap-and-publish operation, or make lease acquisition fail while unresolved process evidence/recovery exists. Add a real cross-process acquisition-during-reaper negative.

### F5 — High/P1, source-confirmed: standalone targeted-repair runner bypasses lifecycle and QA controls

**Locations:** `src/run-targeted-repair.ts:44-57,63-103,115-117`; shared handler at `src/agents/mission-manager.ts:2692-2705`.

The directly executable helper starts a specialist without manager lease/abort/quiescence tracking. Timeout writes `paused` and exits without settling work. Its signal adapter only writes status and returns `void`; the shared handler then calls `.then()` on that result. Normal completion is based on specialist success rather than independent QA and the manager's artifact gate.

**Impact:** this shipped alternate runner can publish paused/completed state while work continues or without independent verification. It does not invalidate the ordinary manager's remediated signal path, but it prevents production-wide closure.

**Required closure:** remove/exclude the standalone production path or route it through `MissionManager`; do not use a synchronous status-only adapter with the manager termination handler.

### F14 — P0, source-confirmed: crash after a successful same-name repair can authorize another automatic repair

**Locations:** `src/agents/mission-manager.ts:639-670,731-739,2118-2126,2302-2342`.

The successful repair closes its intent and records `repair_provenance` in a checkpoint at line 2337, then separately writes mission supersession metadata at line 2338. These writes are not atomic.

**Concrete schedule:** original A succeeds → repair 1 creates same-name B → checkpoint commits completed repair provenance and closes the intent → SIGKILL before `recordSupersessions` → orphan recovery/resume with passing QA. The checkpoint says repair 1 completed, but mission metadata lacks A→B. Original A is hidden by B and its reference fails the execution-evidence gate; the ordinary bounded loop can start repair 2 without a new operator retry.

Existing crash fixtures kill before a repair returns successfully and therefore do not cover this post-success commit gap.

**Required closure:** commit repair outcome, closed intent, and consumable supersession linkage in one recoverable transaction, or reconstruct/link solely from authenticated committed provenance before another repair can be considered. Add a kill-between-checkpoint-and-metadata regression proving zero new repair effects.

### F15 — P0, source-confirmed: valid-looking completed-history edits cause blind re-execution

**Locations:** `src/agents/lifecycle.ts:280-289`; `src/agents/mission-manager.ts:1941-1988,1998-2064`.

The stored plan has a content hash, but completed outcomes are only shape/type checked. `matchCompletedDelegations` reuses only `status === "success"`, and `unmatchedCompleted` also filters to successes. Changing a confirmed completed result from `success` to `failed`, or removing that entry, therefore leaves an otherwise valid stored plan and causes its specialist to execute again without explicit retry.

**Concrete schedule:** paused checkpoint with intact plan/hash and one confirmed result → syntactically valid status downgrade/removal → resume → no incompatible-success blocker → original specialist re-executes.

This is a checkpoint-corruption threat-model defect, not a claim that a remote HTTP route exposes checkpoint editing. Existing malformed/wrong-mission tests do not authenticate valid-looking recovery history.

**Required closure:** authenticate the complete checkpoint history (or use an append-only integrity-protected event chain), and fail closed on missing/downgraded/orphaned completed entries rather than interpreting them as retry authorization.

### F16 — P0, source-confirmed: unknown intent protocol versions fail open

**Locations:** `src/agents/lifecycle.ts:291-299`; `src/agents/mission-manager.ts:1843-1865,2475-2478`.

The loader validates basic intent fields but not `protocol`. The strict gate filters to `protocol === "intent-v1"` before evaluating evidence. An intent marked `intent-v2`, missing the protocol, or otherwise unrecognized is ignored by strict recovery; the resolver likewise finds only v1.

**Concrete schedule:** durable effect intent survives before outcome commit → checkpoint protocol is changed to `intent-v2` → resume under default strict policy → gate filters out the intent → original delegation executes again without operator resolution.

**Required closure:** reject every missing/unknown protocol at checkpoint load and before planning. Never treat an unrecognized intent as legacy authorization to retry. Add unknown/missing-protocol negatives.

---

## 4. Additional current defects and coverage gaps

| ID | Severity | Current finding | Evidence status |
|---|---|---|---|
| F6 | Medium | Shell adds `AWE_DATA_DIR` only when the parent variable is set (`tools/index.ts:222-228`). If unset, an AWE-aware child with another cwd defaults to child-local `.awe-data`, splitting state. | Source-confirmed; present-variable case is tested, unset shell case is not. |
| F7 | Medium | Authenticated `GET /missions/:id/logs` inserts decoded `:id` into `path.join(DATA_DIR, `${id}.log`)` without mission-ID/containment validation; nonexistent files return success with empty logs (`api/server.ts:266-271`). | Source-confirmed; authenticated, suffix-constrained read risk. No external read performed. |
| F8 | Medium | No terminal four-argument Express redaction middleware follows routes; malformed JSON and uncaught synchronous failures fall back to Express defaults instead of `safeErrorMessage`. | Source-confirmed; exact default response bytes not claimed. |
| F9 | Medium | Interactive `cli` invokes `runCli` without `installTerminationHandlers`; only one-shot execution has that wiring (`src/index.ts:136-150,267-273`; `src/cli/index.ts:103-115`). | Source-confirmed; interactive SIGTERM not executed. |
| F10 | Medium | Durable recursion budget reservation does not accept/recheck an ownership fence (`recursion.ts:104-122,193-216,498-505`). | Source-confirmed durable integrity/availability gap; not arbitrary execution. |
| F11 | Medium | Recursive `file_list` uses unregistered `execFile("find",...)`; owner SIGKILL leaves no record for orphan reconciliation (`tools/index.ts:24-36,359-376`). | Source-confirmed cleanup gap; fixed arguments and read-only behavior limit impact. |
| F12 | Low/safety race | PGID identity validation and `process.kill(-pgid,...)` are separate operations; a narrow reuse window remains after validation (`process-registry.ts:267-285`). | Source-derived, low likelihood; not relied on for the FAIL verdict. |
| F13 | Evidence integrity | `evidence.sha256` does not match current `summary.json`, and `final-source.sha256` is stale relative to current source. | Executed hash comparison: expected summary `4e3ba6…`, actual `e502d3…`; manifest's manager hash `ad3fd4…`, current `cc755d…`. |
| F17 | High/P1 | Coordinated writable checkpoint `repair_provenance` plus mission metadata can manufacture a mutually consistent supersession claim without proving the named repair existed/completed (`mission-manager.ts:639-670`; `lifecycle.ts:315-323`). | Source-confirmed under checkpoint/metadata-corruption threat model; not a remote HTTP bypass. |
| F18 | High/P1 | Terminal sealing blocks ordinary status changes but not metadata/artifact-list changes; `saveMission` can wholesale replace/reopen terminal records (`storage.ts:122-126,179-227`). | Source-confirmed public storage-API bypass, not an exposed arbitrary HTTP write. The existing test name overstates its metadata coverage. |
| F19 | Medium/P2 | Same-millisecond same-name artifact registrations are ordered by random UUID rather than actual registration order (`storage.ts:357-365,389-396`; `mission-manager.ts:585-591`). | Source-confirmed; current repair tests insert delays and avoid the collision. |
| F20 | Medium/P2 | Manager finalization can trust `review.passed:true` while `gate.passed:false` when no additional evidence blocker exists (`mission-manager.ts:743-748,2367`). | Source-confirmed alternate-adapter/manager-boundary defect; stock QA currently synchronizes the booleans. |

### Recovery-state threat model and immutable-artifact scope

F15–F18 assume writable/corruptible recovery or mission JSON. They are not assertions that an unauthenticated network caller can directly edit those files. Under that requested corruption/recovery threat model, mutual consistency between two writable JSON files is not authenticity.

Same-name replacement also overwrites the prior pathname (`storage.ts:347-365`), so predecessor bytes are not immutable historical artifacts. If R0 requires historical-byte retention, that is an additional unmet requirement; if only current replacement integrity is intended, it is a scope/documentation limitation rather than a separate verdict driver.

### Evidence-manifest limitation

The stale evidence bindings mean the historical result set cannot be cryptographically treated as a description of the exact current tree. The fresh manifest/logs in this review address identification for the selected runs, not retrospective repair of the old artifacts.

### Offline-isolation limitation

`AWE_OFFLINE_TEST=1` and unset credentials are configuration controls, not enforced socket/DNS isolation. No external request was observed or intended, but the suites are not a hermetic network-namespace certification. The interface suite's listeners and requests were loopback-only; adapter DNS/HTTP were mocked.

---

## 5. D1–D9 adjudication

| Item | Verdict | Current adjudication |
|---|---|---|
| **D1 — stale-owner file-write fencing** | **PASS — scoped ordinary file-write path** | Raw write and optional artifact registration are inside the mission lock with seal/abort/fence rechecks. Fresh core/tool/security regressions passed. This does not generalize to shell/HTTP; F2 remains. |
| **D2 — browser ownership after discovery** | **PASS — adapter source/offline boundary** | Browser re-enters permission/fence/abort checks before raw MCP execution. Fresh adapters/tools passed. No real MCP/Chromium acceptance was run. |
| **D3 — artifact integrity and same-name repair** | **FAIL** | Current-byte integrity and metadata-only forgery negatives pass, but F14 leaves a post-success commit gap; F17 permits coordinated provenance forgery under the writable-state threat model; F18 leaves terminal evidence mutable. |
| **D4 — universal `AWE_DATA_DIR` isolation** | **FAIL** | Targeted source resolution and the present-variable shell case improved, but F6 leaves an unset-parent child-root split. |
| **D5 — web-search cancellation** | **PARTIAL** | Abort/destruction/fallback cancellation regressions pass. Stale ownership without abort remains unfenced in F2; live network behavior is unproven. |
| **D6 — browser cancellation / shared discovery** | **PARTIAL — offline adapter only** | Shared discovery/cancellation regressions pass. No real browser or MCP process-tree teardown evidence; F1 shows why PGID-only assumptions cannot be generalized. |
| **D7 — delegate call-specific signal** | **PASS — production wiring/offline scope** | Signal/fence/effect marker are forwarded and combined through recursion/specialists. Fresh recursion and adapters passed. |
| **D8 — single-owner recovery / effect ambiguity** | **FAIL** | Former failed-repair, stored-plan, malformed-checkpoint, and budget defects are remediated in the ordinary manager, but F1/F2/F4 violate ownership/settlement and F14–F16 permit unapproved repeat work after recovery-state gaps/corruption. |
| **D9 — explicit empty recursive grants** | **PASS — scoped grant semantics** | Explicit empty grants remain empty and within parent ceilings; fresh recursion passed. F10 is a separate stale durable-budget mutation gap. |

---

## 6. R0-1–R0-5 adjudication

| Requirement | Verdict | Decisive basis |
|---|---|---|
| **R0-1 — actual stop; no continued work** | **FAIL** | F1 executed a live escaped child writing after manager settlement; F3 returns false-clean terminal quiescence; F5 leaves an alternate runner outside settlement controls. |
| **R0-2 — reliable state, single ownership, crash recovery** | **FAIL** | F2 executes stale-owner effects; F4 permits replacement acquisition during reaping; F14–F16 permit unapproved repeat work; F18 leaves terminal records mutable. Ordinary checkpoint/repair/lease remediations are real but insufficient. |
| **R0-3 — deny-by-default tools and governed effects** | **FAIL** | Empty-grant and browser/file fences pass scoped tests, but stale shell/HTTP effects, shell state-root split, and API log/error boundaries remain. |
| **R0-4 — real deliverables with independent verification** | **FAIL — not universal across shipped runners** | Ordinary manager now rejects empty criteria and enforces artifact/QA gates; F5 can complete targeted repair without those controls. |
| **R0-5 — reproducible tests and evidence** | **FAIL as closure evidence / PARTIAL as engineering progress** | Selected fresh tests and the historical 22/0 log are reproducible regression evidence, but decisive negatives are absent from that gate, no fresh full gate/build was run, offline is not network-enforced, and old hash bindings are stale. |

---

## 7. Historical defect disposition

| Historical finding | Current result |
|---|---|
| Effect-bearing failed repair terminalized/unrecoverable | **REMEDIATED in ordinary manager** — returned/thrown variants retain durable intent and paused recovery; fresh core/manager regressions passed. |
| Paraphrased resume repeats confirmed/accepted effects | **REMEDIATED in tested stored-plan path** — exact stored plan/hash reuse prevents replanning drift. |
| Malformed/wrong-mission checkpoint overwritten as empty | **REMEDIATED** — damage is distinguished from absence and preserved before planning/effects. |
| Empty/blank acceptance criteria complete vacuously | **REMEDIATED** — schemas, manager guard, and deterministic gate reject them. |
| Direct nonterminal cancellation skips process reaping | **REMEDIATED for that path** — settlement occurs before cancelled state. F3 remains for already-terminal fast paths. |
| Fatal/checkpoint-integrity finalization ignores failed quiescence | **REMEDIATED for ordinary manager path** — nonterminal state/ownership/process evidence are retained on failed settlement. |
| Repeated SIGTERM caches failure/uninstalls handlers too early | **REMEDIATED in tested ordinary path** — active-attempt sharing, continuation, and retry passed fresh process tests. |
| One-shot CLI auto-approval | **REMEDIATED in reviewed entrypoint/interface coverage** — explicit approval/recovery behavior is now guarded. Interactive termination is separately open in F9. |
| Metadata-only artifact forgery and current-byte substitution | **REMEDIATED for those exact cases** — forged lineage without checkpoint proof and byte-substitution negatives passed. Coordinated writable-state forgery and post-success repair commit remain open in F14/F17. |
| Ordinary process-group registration/resistant-group reaping | **PARTIAL** — real registered-group tests pass, but F1/F3/F4 leave containment and acquisition holes. |

No old FAIL was carried forward solely because it appeared in an earlier report.

---

## 8. Required re-QA before closure

1. Add F1–F5 and F14–F16 as deterministic adverse regressions using real local processes where applicable; prove no late effect, no replacement overlap, no false quiescence, and no unapproved repeat execution.
2. Re-fence shell, fetch/extract, and both search transitions at final effect boundaries; retain existing SSRF/abort controls.
3. Replace PGID-only containment with an actual descendant supervisor/sandbox or explicitly fail closed when containment is unavailable.
4. Serialize lease acquisition with orphan recovery/process-evidence settlement.
5. Remove or manager-route the targeted-repair runner; require independent QA and artifact verification for every shipped execution path.
6. Make successful repair outcome/provenance/linkage atomically recoverable; authenticate complete checkpoint history and fail closed on unknown intent protocols, missing/downgraded outcomes, and unproven lineage.
7. Enforce terminal-record immutability at the storage boundary, use monotonic artifact registration ordering, and require final completion to satisfy both independent gate and review decisions.
8. Resolve F6–F11 or explicitly document and independently accept narrower security contracts; terminal API errors must use redaction middleware and logs must be contained with honest 404 behavior.
9. Run the complete offline gate and build on the corrected tree, regenerate summary/evidence/source hashes atomically, and use enforced network isolation if the gate is labelled hermetic.
10. Perform separate authorized live acceptance for provider routing/spending, real Chromium/MCP, external HTTP/DNS, persistence/PostgreSQL where used, Windows computer-use, and deployment. None is established here.

---

## Final decision

**R0 independent final closure re-QA: FAIL.**  
**Offline closure: REJECTED.**  
**Production/live readiness: NOT ESTABLISHED.**

The green selected suites demonstrate meaningful regression progress, not closure. Confirmed P0/P0-equivalent stale-owner and post-settlement process effects remain, so no PASS or production inference is permissible.
