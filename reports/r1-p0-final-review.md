# R1 P0 final independent engineering review

Date: 2026-11-14  
Verdict: **FAIL — the assigned P0 admission/recovery scope is not yet accepted.**

This review is bounded by `reports/R1-P0-ACCEPTANCE.md`. It does not rely on any prior provider result. Two concrete gaps remain despite passing targeted suites.

## Findings

### P0-1 — Recursive delegation does not preserve target-specific host authorization or hold admission across its local reservation

`MissionAdmissionPolicy.authorizeExecution` explicitly must cover every requested role/tool, including recursive effects (`src/utils/mission-admission.ts:27-29`). Top-level delegation does this through `withEffect` with `{ stage: "delegation", role, tools }` (`src/agents/mission-manager.ts:1856-1862`). The real recursive path does not:

- `runDelegateCall` checks only the generic `fence` (`src/agents/recursion.ts:472-475`).
- `reserveAgents` checks that generic fence and then releases its qualification lock before the durable budget write (`src/agents/recursion.ts:105-126`).
- Child nodes are persisted without a role/tool-targeted `withEffect` (`src/agents/recursion.ts:511-527`), and the child specialist receives only the generic fence and forwarded callbacks (`src/agents/recursion.ts:567-580`).
- The subsequent model-producing intent is labelled only `"model generate"`, without the child role (`src/agents/specialists.ts:303-309`). Real tool wrappers likewise supply tool/label but no role (`src/tools/index.ts:38-44`). None of these later checks substitutes for authorizing the recursive delegation target.

Consequently, a host policy that permits the parent but returns `false` for an unknown recursive child role is never consulted with that role; the child can reserve its slot and enter its model-producing specialist under generic stage `effect`. Separately, revocation from another process between the second reservation fence and the budget write permits that durable local mutation after revocation, although a subsequent specialist fence should prevent its dispatch.

This violates P0 Admission for recursive delegation and the atomic-local-effect property. Existing admission tests exercise a manually called child-like `withEffect`, not `runDelegateCall`; the unknown-role test covers only top-level delegations.

### P0-2 — Pre-spawn launch construction failures strand a permanent `launching` recovery blocker

`shellTool` calls `prepareDetachedProcessGroup` before constructing either the sandbox arguments or resource-limited launch (`src/tools/index.ts:268-288`). There is no cleanup handler around those constructors; `abortPreparedProcessGroup` is called only if the later spawn attach fails (`src/tools/index.ts:289-300`).

A directly reachable case is a finite fractional `timeout_ms`: the schema accepts it (`src/tools/index.ts:228-232`), the `wallMs` arithmetic preserves its fraction (`src/tools/index.ts:275`), and `validatedLimits` rejects it because `wallMs` must be a safe integer (`src/security/resource-limits.ts:64-77`). No child has been spawned, but the durable record remains `status: "launching"`. Orphan recovery always blocks this record as requiring external inspection (`src/utils/process-registry.ts:394-397`), so later cancellation/recovery cannot establish normal reusable state without manual evidence removal. Sandbox-construction or resource-environment errors have the same leak.

This fails P0 Recovery integration, although it fails closed rather than permitting an unbounded command. The resource suite tests invalid limits directly and therefore does not cover the shell's durable-prepare cleanup contract.

## Verified behavior

- Missing policy, empty requirements, and unknown qualifications deny before Head or specialist execution. Approved-spec hashes, mission identity, binding fields, immutable stored provenance, and generation-bound receipts are checked. Solver metadata cannot select practice mode.
- Revocation and admission use the same synchronous file-lock boundary. Local mission tools recheck persisted admission, lease, approved spec, cancellation, and live qualifications. Final seal plus terminal write is inside stage `acceptance` admission. Revocation paths retain unresolved intents and ownership until tracked work/process groups settle before publishing paused state.
- Separate-process restart rejects revoked admissions and stale admissions after requalification without replacing the persisted admission or checkpoint evidence. Legacy execution is inspectable but not retroactively qualified.
- Qualification locks are correctly limited to synchronous local effects and durable intent/acceptance fences; they are not held across awaited provider operations. Remote outcomes rely on durable intents, abort/tracking, quiescence, and restart reconciliation rather than pretending revocation can undo an already dispatched request.
- Process identity uses detached PGID leadership plus leader start ticks and owner PID/start ticks, with unreadable or changed identities failing closed. PID-namespace containment addresses `setsid` descendants; a bare PGID is not treated as a descendant boundary.
- Resource execution verifies its unique actual cgroup and kernel controller files before releasing work. Aggregate memory/swap/tasks/CPU bandwidth, whole-group OOM behavior, inherited hard CPU/file/fd limits, and manager wall deadlines are present. No per-UID `RLIMIT_NPROC` claim or unbounded fallback exists.
- Manager and child environments are separately scrubbed. Loader/provider/bus variables are excluded, `env -i` applies the child allowlist, and host manager/runtime endpoints are not forwarded into the sandbox. Unsupported managers/controllers fail before the release-gated command.

## Independent test evidence

Commands were run without external network access or provider calls, with `AWE_DATA_DIR` set to an isolated `/tmp/opencode` path; the admission suite additionally creates and removes its own isolated state root.

- `./node_modules/.bin/tsx src/tests/r1-mission-admission.test.ts` — **12/12 passed**.
- `./node_modules/.bin/tsx src/tests/r1-resource-limits.test.ts` — **13/13 passed**, including real Node work, original PID/PGID and actual cgroup inspection, aggregate OOM including `setsid`, tasks/CPU/file/fd negatives, manager wall deadline, environment canaries, EOF denial, and unavailable/unbounded fail-closed probes.

These passes support the primitive mechanisms above but do not exercise the two findings. No source was edited and no commit was made during this review.
