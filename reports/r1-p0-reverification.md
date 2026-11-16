# R1 P0 independent reverification

Date: 2026-11-14  
Verdict: **PASS for the finite P0 engineering boundary in the final current-code snapshot reviewed.** Both prior FAIL findings are corrected in production. No new concrete blocker within `reports/R1-P0-ACCEPTANCE.md:7-26` was reproduced or established from source.

This is an offline engineering verdict, not a live-provider, production-deployment or frozen-release certification. `reports/r1-p0-final-review.md` is retained unchanged as historical evidence; this report supersedes only its two current-code findings.

## 1. Historical P0-1: corrected — recursive target authorization and reservation are fenced

The former generic-only recursive admission path is no longer present:

- The specialist's actual `delegate` adapter forwards the mission fence and host-only `withEffect` into `runDelegateCall` (`src/agents/specialists.ts:118-138`).
- `runDelegateCall` resolves child role/tool targets, then nests `withEffect({stage: "delegation", role, tools, label: "recursive delegation reservation"})` around the reservation and tree persistence (`src/agents/recursion.ts:504-530`). All target and budget/tree mutations occur before any await or child specialist execution.
- `reserveAgents` still performs both ownership checks and its durable write under `withMissionLock` (`src/agents/recursion.ts:104-126`). The enclosing admission lock remains held through this synchronous callback.
- Same-mission synchronous nesting is explicit and bounded (`src/utils/mission-admission.ts:121-146`). The qualification authority still verifies live generation and binding under the same lock used for revocation, before and after the synchronous effect (`src/utils/qualification.ts:232-255`). These are local fencing semantics, not locks held across remote provider awaits.
- The child specialist retains its role/tool authorization at model dispatch (`src/agents/specialists.ts:285-315`), and actual tools now include `ToolContext.role` in their target (`src/tools/index.ts:38-44`).

**Reproduction evidence.** With no provider, `r1-mission-admission.test.ts` invokes the real recursive adapter with children `writer` and `unprofiled-child`. Host policy denies only the latter. The observed assertions require `host execution scope policy`, zero child executions, and no durable budget file. Repeating with that denial removed requires both executions and role-specific reservation/model targets (`src/tests/r1-mission-admission.test.ts:333-376`). The selected suite passed **14/14**, including this test.

Thus an unknown recursive role is denied before reservation or child dispatch, and a concurrent revocation cannot be interposed inside the locked synchronous reservation. This corrects both parts of the prior P0-1 finding.

## 2. Historical P0-2: corrected — pre-spawn failures clean up durable launch evidence

`shellTool` still prepares durable launch evidence before constructing the launch, but construction, spawn and attach are now inside a `try` whose failure handler calls `abortPreparedProcessGroup` and returns failure (`src/tools/index.ts:267-300`). The abort path terminates only a safely identified unattached child if one exists and removes unstarted release/record files; cleanup failure retains fail-closed evidence (`src/utils/process-registry.ts:177-200`).

The earlier fractional-timeout example itself is also normalized to an integer with `Math.ceil` before resource validation (`src/tools/index.ts:275`). No executable work is released before registration and the later admission-fenced gate release (`src/tools/index.ts:269-274,350-358`).

**Reproduction evidence.** The actual production `shellTool` was invoked with `timeout_ms: 1500.5`, while host manager lookup was deliberately made unavailable after durable preparation. The test requires a `Resource isolation` failure, no `never-started` file, and orphan recovery `{quiesced: true, reclaimed: [], blocked: []}` (`src/tests/r1-shell-isolation.test.ts:105-127`). Its recovery scan covers all persisted mission-prefixed records, so zero blocked entries establishes cleanup rather than relying only on the auxiliary pathname assertion. It passed in the selected **4/4** run. There is no longer a reachable stranded `launching` record on that construction-error path.

## 3. Requested host-admission propagation review

**Supported.** The production execution surface reconstructs host admission instead of trusting request/model metadata:

- Modern CLI execution resolves policy before constructing the manager (`src/index.ts:153-166`). Run, approve, resume and career all use or reproduce that path; resume uses the fresh persisted mission (`src/index.ts:397-425`). Programmatic host resolvers are a separate trusted dependency, not task input (`src/index.ts:29-44`).
- The interactive CLI resolves policy for the approved claim before manager execution (`src/cli/index.ts:105-130`).
- API approve/resume both enter `startManagedMission`, which resolves host policy and forwards it with the exact lease to the manager (`src/api/server.ts:184-203,319-359,366-399`). A resolver failure does not start the runner and releases the pre-start lease; it does not synthesize a settled result.
- `resolveConfiguredMissionAdmission` requires an explicit absolute host module or trusted resolver. It validates product versus explicitly mission-bound practice and rejects an async injected resolver; request bodies/specification fields are never deserialized into policy functions (`src/config/mission-policy.ts:14-50`).
- Manager setup reconstructs admission from the current stored mission/policy before Head (`src/agents/mission-manager.ts:1627-1644,2186-2201`). Saved admission records never self-authorize a restart; generation, bindings and matching saved requirements are checked (`src/utils/mission-admission.ts:68-120`). Persisted approvals and admission provenance remain immutable through storage.

The host-policy test passed (**1/1**), including denial of relative/offline module composition. The actual CLI/API entry-point suite passed **97 checks**, including reconstruction on CLI resume and denial-before-manager-construction on API resume. These entry-point suites deliberately use bounded engineering-practice fixtures: they verify propagation mechanics, not professional qualification.

## 4. Requested UNKNOWN aggregation and routing review

**Exact handling that was reviewed; no remaining defect is claimed from an intermediate reading.**

- Model-ledger counts must be nonnegative safe integers, with absent/invalid fields mapped to `UNKNOWN` (`src/utils/model-ledger.ts:76-93`). Only aggregate SDK usage, or its invocation-level fallback, is selected; overlapping step counts are not summed (`src/utils/model-ledger.ts:96-107,138-166`).
- Missing provider identity, unfinished/thrown/aborted outcomes and cost remain unknown rather than invented (`src/utils/model-ledger.ts:108-125,130-166`). Contradictory arithmetic is preserved but marked partial with `usage_mismatch`, not silently reconciled.
- In the final current manager read, every delegation result promotes both `undefined` and `"UNKNOWN"` to the aggregate `"UNKNOWN"`; there is no first-result zero exception (`src/agents/mission-manager.ts:2645-2654`). Zero delegations can therefore have zero counts, but no missing first-delegation observation may disappear into a presumed zero. The new first-delegation-missing test passed as part of **14/14**.
- Trusted node/role routing is snapshotted, exact-match/allowlisted and inherited by nested specialists (`src/config/models.ts:111-154`; `src/agents/mission-manager.ts:1856-1882`; `src/agents/specialists.ts:285-316`). Unknown compound/default roles have deterministic segment-based fallback, while unapproved host overrides reject. The production recursive adapter test passed in **9/9** recursion checks, including the nested route and its ledger/admission attribution.

The ledger suite passed **8/8**. These checks are accounting and attribution evidence; they do not establish availability or price accuracy for any provider ID.

## 5. Remaining finite P0 boundary checks

- **Filesystem:** direct file tools use mission-granted roots and Linux descriptor-relative `O_NOFOLLOW` traversal; regular-file/single-link checks, bounded read/write, bounded incremental listing and active cancellation/ownership callbacks are present (`src/tools/index.ts:363-434`; `src/security/workspace-fs.ts:8-114`). Artifact writes repeat qualification and mission fencing. Shell verification confirms sibling/state/credential/socket denial and the confined-open-directory rename case. The declared host-grant immobility precondition is a scope boundary, not silently discarded.
- **Resources:** actual unique systemd user scopes contain the preflight verifier through all command descendants. Kernel files are verified before release; cgroups provide aggregate memory, swap, pids/tasks and CPU bandwidth, while inherited rlimits supply hard CPU/file/fd controls. No shared-UID `RLIMIT_NPROC` claim or unbounded fallback is made (`src/security/resource-limits.ts:64-151`). Environment construction separately scrubs manager and child credentials, loader hooks, bus and runtime endpoints.
- **Recovery:** PGID leadership, start ticks and owner identity are checked rather than treating bare PIDs as stable identity. PID namespaces contain `setsid` descendants. Attached process groups settle before normal shell completion, cancellation or reusable recovery state; unknown remote outcomes remain durable. Startup refuses ordinary takeover while process evidence remains and reconciles it under a recovery lease (`src/agents/lifecycle.ts:699-755`; `src/utils/process-registry.ts:321-452`).
- **Admission across the mission:** top-level delegation, recursive children, effect markers, repair and final acceptance preserve host targets/fences. Final seal and terminal mission write are inside the acceptance fence (`src/agents/mission-manager.ts:1856-1884,2429-2496,2681-2707`).

The real resource suite passed **13/13** in this reverification, including actual PID/PGID/cgroup inspection, aggregate OOM with `setsid`, pids, file/fd, CPU and independent wall-limit negatives, gate EOF denial, scrubbed-environment canaries and unsupported-manager/unbounded-policy denial. Real integration tests, rather than fixture-only claims, support the containment/resource portions of this PASS.

## 6. Commands executed

All commands ran locally without live providers or external network access. State used isolated `/tmp/opencode/awe-p0-reverify-*` roots; the admission/interface suites also create and remove internal synthetic roots. No qualifications, receipts or mission outputs are claimed as professional practitioner evidence.

```sh
AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-admission-20261114 ROUTER_CHEAP_API_KEY=offline-test-only ./node_modules/.bin/tsx src/tests/r1-mission-admission.test.ts
# 14 passed, 0 failed

AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-shell-20261114 ROUTER_CHEAP_API_KEY=offline-test-only ./node_modules/.bin/tsx src/tests/r1-shell-isolation.test.ts
# 4 passed, 0 failed

AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-host-20261114 ROUTER_CHEAP_API_KEY=offline-test-only ./node_modules/.bin/tsx src/tests/r1-host-policy.test.ts
# 1 passed, 0 failed

AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-ledger-20261114 ROUTER_CHEAP_API_KEY=offline-test-only ./node_modules/.bin/tsx src/tests/r1-model-ledger.test.ts
# 8 passed, 0 failed

AWE_OFFLINE_TEST=1 AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-routing-20261114 ROUTER_CHEAP_API_KEY=offline-test-only OPENAI_API_KEY=offline-test-only TAVILY_API_KEY= ./node_modules/.bin/tsx src/tests/r0-final-recursion.test.ts
# 9 passed, 0 failed

AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-resources-20261114 ROUTER_CHEAP_API_KEY=offline-test-only ./node_modules/.bin/tsx src/tests/r1-resource-limits.test.ts
# 13 passed, 0 failed

AWE_OFFLINE_TEST=1 AWE_DATA_DIR=/tmp/opencode/awe-p0-reverify-host-adapters-20261114 ROUTER_CHEAP_API_KEY=offline-test-only OPENAI_API_KEY=offline-test-only TAVILY_API_KEY= ./node_modules/.bin/tsx src/tests/r0-closure-interfaces.test.ts
# 97 checks passed; offline interface regressions only
```

The separately running full suite was not awaited or used for this verdict.

## 7. Snapshot evidence and explicit out-of-scope limitations

Final production-code hashes used for the verdict:

```text
54dd11b9e328a7e1fd40cb4fe88291664bd978b1182db5d44c4b2bec647fef64  src/index.ts
75d065b878741e4414b6a4bb1c3940d9f3f15f5959735dd0ffc825cf84934286  src/cli/index.ts
7cc19b7e14571bf1cd92044d0cd0ce035a34bfa005aa00363865076ab8143a1c  src/api/server.ts
b86ee168206855163e6924222300be0f2c139c1f080e962bba51a784c6001cd0  src/config/mission-policy.ts
0ea2b8153332b7b785b827f7c862200a5fab8c74d829ffda2db030fdc68287d6  src/utils/mission-admission.ts
6154aead6a7a7ff84afb0fe74f0f1b83445efae46c3c9c5437b69eb3971938fd  src/agents/recursion.ts
1f0c2e115d1305ceba929a173abd37c7490172cc59e42a1567450c1e4bf4e9aa  src/agents/specialists.ts
4184c62b09b9b64f7f0ace4102d515737a9cadef4908252bb7be78e693139321  src/tools/index.ts
6d04390bac42cb45119f53d3bc3d0322666c63fa893c91e645def9fb4fdb0afe  src/utils/process-registry.ts
1600d273e060a6af8543d458f8836d130d12e26e78992a01676df3f4c8b6ac88  src/security/resource-limits.ts
13deb2ef0718689e5c8e94044b285346f3eb9885719efbb3401e80990337102a  src/utils/model-ledger.ts
dfd1ff36df4a306c293625afc53d1f2281a741db0596f0cfc6d0b6e058ed7928  src/config/models.ts
6f8780261de9e73977dba6890b2a19eed8acf96827918dcba8f960393d9ca44c  src/agents/mission-manager.ts
```

Explicit limits:

- This is not a claim that real independent qualifications have been granted. Bound engineering-practice fixtures are not professional product qualification.
- Live model execution, provider availability, external systems/deployment and per-transport billing/invoicing are not established. Model records remain UNKNOWN where usage/cost is unobserved.
- Mission execution totals cover delegation results; the acceptance record explicitly leaves incomplete per-transport billing and aggregate filesystem quota as limitations (`reports/R1-P0-ACCEPTANCE.md:44-46`). They are not represented as solved here.
- Filesystem containment assumes trusted host provisioning does not move grants across parents; unrestricted same-host actors are outside the executable confinement boundary. Unsupported cgroups/managers deny execution; they do not authorize host reconfiguration.
- No source was changed and no commit was created. Commit-dependent immutable release evidence and R0 progression therefore remain integration actions outside this read-only review; this PASS applies to the identified engineering snapshot, not an immutable release.
