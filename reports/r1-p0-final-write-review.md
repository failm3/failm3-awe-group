# R1 P0 final `file_write` follow-up review

Date: 2026-11-14  
Verdict: **PASS for the focused write-boundary correction.** The current production call chain repairs the D1 check-to-write regression without weakening durable intent, admission, cancellation, sealing, role/tool authorization, or artifact registration. No new in-scope blocker was established.

This narrow verdict does not claim that the separately running complete offline suite has passed. Existing history, including `reports/r1-p0-final-review.md`, `reports/r1-p0-reverification.md`, and `reports/r1-p0/full-offline-final`, was not modified.

## Current production call chain

The relevant diff and current source were inspected directly, rather than relying only on test output:

1. `fileWriteTool` still calls `guard("file_write")` before path validation or writing (`src/tools/index.ts:384-397`). `guard` delegates to `assertToolAllowed`, which checks the actual tool grant, initial cancellation and ownership, synchronously records `tool:file_write` intent through `beginEffect`, and scopes that intent admission to the current role and `file_write` (`src/tools/index.ts:92`; `src/security/tool-context.ts:40-54`).
2. The focused correction no longer routes this write through the generic `withToolEffect`, whose `assertEffectOwner` would perform another owner/cancel check before acquiring the mission lock (`src/tools/index.ts:30-45`). Removing that redundant pre-lock check avoids consuming the D1 fence transition at the wrong boundary.
3. Instead, `fileWriteTool` calls trusted `context.withEffect` around `withMissionWrite`, preserving target-specific admission with `{stage: "effect", role: context.role, tools: ["file_write"]}` (`src/tools/index.ts:398-415`). Without a trusted wrapper, the explicit fallback executes the same synchronously fenced write function.
4. `withMissionWrite` acquires the mission lock before `assertArtifactWriteAllowed`; that check refuses terminal/sealed state, throws on cancellation, and evaluates the mission-owner fence before invoking the raw writer (`src/utils/storage.ts:324-356`). Thus fence check #2 is now under the mission lock and before `writeWorkspaceFile`, its directory creation, or optional artifact registration.
5. The write callback remains synchronous and uses the descriptor-relative atomic file writer. The optional nested `saveArtifactFile` is still called while the outer mission lock is held (`src/tools/index.ts:402-412`). `withFileLock` explicitly supports same-process reentrancy and rejects asynchronous critical sections (`src/utils/r0-runtime-fs.ts:217-239`), so nested registration does not attempt to reacquire a non-reentrant lock.

Production still supplies the mission's `beginEffect` and `withEffect` through the specialist tool context (`src/agents/specialists.ts:289-303`). `effectMarker` records the effect marker through a checkpoint before returning and requires a live delegation intent (`src/agents/mission-manager.ts:2076-2087`). The correction does not bypass or duplicate this durable-intent path.

## Admission, authorization, cancellation, and seal assessment

- **Admission:** the new wrapper calls `authorize` for the role/tool-qualified effect and enters each required live qualification through `withAdmission` (`src/utils/mission-admission.ts:121-146`; `src/utils/qualification.ts:240-255`). Same-mission synchronous nesting still invokes authorization; it only avoids reacquiring qualification locks.
- **Role/tool authorization:** the original `allowedTools.has("file_write")` grant check remains. Both the durable-intent wrapper and the new write wrapper carry `context.role` and `tools: ["file_write"]`; request content cannot replace those targets.
- **Cancellation and ownership:** initial checks remain in `guard`, and the decisive cancellation/fence check is performed inside `withMissionWrite`. There is no `await` between that locked check and invocation of the synchronous write callback. Omitting the generic pre-lock repetition therefore closes the stale-write gap rather than dropping the final boundary check.
- **Seal:** `assertArtifactWriteAllowed` checks the durable seal and terminal mission status under the mission lock before raw file creation. Nested artifact registration repeats its storage write admission under the already held reentrant mission lock.
- **Existing artifact semantics:** a write remains plain unless `mission_id` is supplied; a supplied ID must match the runtime mission. Successful opt-in writes still register the artifact and add its ID to `context.artifactIds`.

## Independent commands and results

The focused suites were replayed against the current files with isolated state and no live model/provider calls:

```sh
AWE_OFFLINE_TEST=1 AWE_DATA_DIR=/tmp/opencode/awe-p0-final-write-tools-20261114 ROUTER_CHEAP_API_KEY=offline-test-only OPENAI_API_KEY=offline-test-only TAVILY_API_KEY= ./node_modules/.bin/tsx src/tests/r0-final-tools.test.ts
# PASS: 12 tests, 12 passed, 0 failed

AWE_OFFLINE_TEST=1 AWE_DATA_DIR=/tmp/opencode/awe-p0-final-write-admission-20261114 ROUTER_CHEAP_API_KEY=offline-test-only OPENAI_API_KEY=offline-test-only TAVILY_API_KEY= ./node_modules/.bin/tsx src/tests/r1-mission-admission.test.ts
# PASS: 14 tests, 14 passed, 0 failed

git diff --check -- src/tools/index.ts src/utils/storage.ts src/security/tool-context.ts src/tests/r0-final-tools.test.ts src/tests/r1-mission-admission.test.ts
# PASS: exit 0, no output
```

The D1 lock-boundary test explicitly runs with and without `mission_id`, expects exactly two fence calls, asserts that check #2 observes the mission-lock path, changes check #2 to deny ownership, and requires no target bytes, requested directories, mission artifact directory, or artifact records (`src/tests/r0-final-tools.test.ts:62-85`). Companion D1 tests verify stale writes cannot overwrite existing bytes, normal/opt-in artifact behavior survives, and an abort or seal introduced after guard-side path validation cannot create the requested file (`src/tests/r0-final-tools.test.ts:87-130`).

The admission run includes production `file_write`/`save_artifact` denial after revocation, recursive role/tool authorization, repeat-effect revocation, restart rejection, and async-effect refusal (`src/tests/r1-mission-admission.test.ts:299-331`). Its **14/14** result independently agrees with the supplied focused evidence. The supplied `reports/r1-p0/final-tools-fix/summary.json` also records both suites passing, and its logs show **12/12** and **14/14**.

## Snapshot hashes

The same hashes were observed before and after the independent replay:

```text
c050fbecb0c50851ee8406a6001a28091c40f97bad97630626daba7ee1428026  src/tools/index.ts
d84ec016c7debbfdfb0f238a74a749726444684092b8ad3405632a377bba9973  src/security/tool-context.ts
618a50012a75336c21d98771b1762f2c1e354412d666f6b7d105e475a11cfc51  src/utils/storage.ts
0ea2b8153332b7b785b827f7c862200a5fab8c74d829ffda2db030fdc68287d6  src/utils/mission-admission.ts
e000d9fe8afd41054b2e5895ba8e52d44de52c61f4d98bd3bfacf1659f20d263  src/utils/r0-runtime-fs.ts
c0ef351c09dc12b0633e3112cd2001a81e50248db1807d0ea2332226bfd272e4  src/tests/r0-final-tools.test.ts
a6ab3abd6e3468df7b42a043ae7d6ea0570829534c8ee94ba5d3d4bdb8ed11b7  src/tests/r1-mission-admission.test.ts
```

## Exact limits of this verdict

- `reports/r1-p0/full-offline-final/summary.json` remains a historical **38 passed / 1 failed** result, with `r0-final-tools.test.ts` as its recorded failure. This review does not rewrite that result or claim that every other suite was rerun against the focused correction.
- No verdict is taken from `reports/r1-p0/full-offline-complete`; its run was neither awaited nor represented as passing here. Whole-suite acceptance remains for that separate evidence.
- This was an offline production-adapter review. It provides no live-provider, deployment, professional-qualification, or externally committed release certification.
- The locked boundary prevents a denied stale attempt from beginning the requested write. It is not a new transaction or rollback guarantee across the requested file and optional artifact registration if a later storage operation itself fails; existing durable-intent/reconciliation semantics remain relevant to such failures.
- No source file or existing report was edited, and no commit was created. This report is the only review artifact added.
