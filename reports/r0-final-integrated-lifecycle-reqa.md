# R0 final integrated lifecycle independent re-QA

**Review date:** 2026-11-13  
**Scoped verdict:** **PASS — frozen integrated offline lifecycle snapshot**  
**P0 findings:** **0**  
**P1 findings:** **0**  
**Independent probe result:** **7/7 decisive cases passed**  
**Focused real-process suite:** **9/9 passed**  
**Production / live-provider readiness:** **NOT ESTABLISHED — NO PRODUCTION-READINESS CLAIM**

The requested frozen lifecycle scope passes independent re-QA. All four P1 defects in the preceding FAIL report were retested against the current source and are not reproducible in this snapshot. Blocked cancellation retains a heartbeating owner, fatal/checkpoint settlement retries automatically after the blocker is removed, damaged checkpoint bytes survive both automatic recovery and explicit cancellation, and terminal-plus-live evidence is reopened until real quiescence. Real SIGTERM/SIGKILL and replacement-fencing controls also passed.

This is an offline Linux lifecycle verdict only. Injected planners/executors/reviewers are deterministic test doubles, not live-provider evidence.

## 1. Frozen source identity and audit boundaries

The decisive probes and focused suite used these source hashes:

| File | SHA-256 |
|---|---|
| `src/agents/mission-manager.ts` | `2f78df860a2b54a180e172c743402aa0687bea1e556484ff3f9a053c6c0dfeed` |
| `src/agents/lifecycle.ts` | `561f5a9adbddddd24fd8ebd3d8db8331b8a591437db692f2a0faa239eea980be` |
| `src/utils/process-registry.ts` | `6d04390bac42cb45119f53d3bc3d0322666c63fa893c91e645def9fb4fdb0afe` |
| `src/tests/r0-closure-process-lifecycle.test.ts` | `0923865997ec6c91b8849e19089bde8e4f0632b957e9b781d7e5071c8da1fadf` |
| `src/tests/helpers/r0-closure-process-lifecycle-child.mjs` | `ba850caebf270dd58d422f3013b978b29578fc8968603afb4eb2527f8fbf2aba` |
| `src/tests/helpers/r0-closure-adapters-resistant-child.mjs` | `6d00b995f9d61cdd9a8ebe540d030f077ae41ef647ffa93f833eee7d488ba733` |
| `src/api/server.ts` | `b7da993ae93c1bfce3f86c93dd4b0ad0bc42791559f579d23b77bf064dbfe29d` |
| `src/index.ts` | `3585f3ed7c49f94d67fd1dec3638ac44c6f783c41f6261f7b9ddcaf8cef8d6d5` |
| `src/tools/index.ts` | `c83a62f6e9632b1cb6cbac62b57684699f2457993a8938f58a2b4b3add0af0f1` |

`logs/focused-source-hashes-before.log` and `source-hashes-end.log` are identical; `logs/source-hash.diff` is empty. The initial snapshot hashes in `source-hashes-start.log` also match the final hashes for every file listed there.

All new probes, state, logs, fixture work directories and result JSON files are under:

```text
.r0-work/final-integrated-reqa-20261113/lifecycle/
```

No production source, existing test, script, README, prior report or Git state was modified. The previous `reports/r0-independent-lifecycle-reqa-final.md` remains unchanged. This audit used no Git mutation, network/provider call, browser, MCP, PostgreSQL, deployment, real `.awe-data`, or `/goal` access. Every executed test had `AWE_OFFLINE_TEST=1`, a fresh isolated `AWE_DATA_DIR`, and provider/network credentials and proxy variables unset.

Spawned fixture managers, foreign owners, contenders and detached process groups were killed and reaped in `finally` cleanup. The focused suite's own `after` hook also killed/reaped every fixture. A final process inspection found no remaining audit fixture process.

## 2. Independent decisive probes

Probe code is original to this audit. It executes the real mission manager, lifecycle lease/checkpoint implementation, storage and process registry with real detached Linux children. The children ignore SIGTERM, write scheduled late-effect files, and therefore require actual SIGKILL escalation and post-settlement verification.

| Case | Executed result | Evidence |
|---|---|---|
| Blocked direct cancellation, foreign-live safety and heartbeat retention | **PASS.** Initial result was `cancelled:false, quiesced:false, status:running, pending_operations:1`. The registry refused to kill a group whose recorded foreign owner was alive. A purpose-`cancel` lease with the same owner id and generation heartbeat-renewed beyond two 240 ms TTLs. A replacement `run` lease was denied. | `logs/direct.log`, `results/direct.json` |
| Direct-cancellation late effects and final settlement | **PASS.** The first real late effect occurred while the mission was explicitly `running`, not terminal. After the foreign owner died, repeated direct cancellation reaped the group and returned `cancelled:true, quiesced:true`; lease and process record were gone, and the second scheduled effect never occurred. | same |
| Terminal-plus-live recovery | **PASS.** An initially `failed` mission with foreign-live process evidence reopened to `running`, retained cancellation ownership, and preserved `recovery_terminal_status`. Its first late effect was not hidden by a terminal claim. After owner death and settlement, status returned to `failed`, with no lease/process record and no second late effect. | `logs/terminal.log`, `results/terminal.json` |
| Fatal deferred settlement retry | **PASS.** While process identity was damaged, the manager returned nonterminal `running` with lease and process evidence retained. Restoring only the process record caused automatic transition to `failed` without another cancel, resume, run, or reconciliation call. Lease/records cleared and no later effect occurred. | `logs/fatal-4.log`, `results/fatal.json` |
| Checkpoint-integrity deferred retry | **PASS.** The same no-cancel/no-resume schedule automatically produced `paused`, cleared lease/process evidence, preserved `recovery_blocked.kind=checkpoint_integrity`, and retained exact damaged bytes `{independent-damaged-checkpoint`. | `logs/checkpoint-4.log`, `results/checkpoint.json` |
| Explicit cancellation with damaged checkpoint | **PASS.** Cross-process forwarded cancellation settled to `cancelled:true, quiesced:true` after the transient process blocker was repaired. The checkpoint remained byte-for-byte `{independent-damaged-checkpoint`; no valid replacement checkpoint overwrote it. | `logs/checkpoint-cancel-5.log`, `results/checkpoint-cancel.json` |
| SIGTERM recovery | **PASS.** Real manager exit was code 143 only after its abort-aware in-flight operation and resistant registered descendant settled. Final state was `paused`, checkpoint/lease/process handling was clean, and neither scheduled late effect occurred. | `logs/sigterm-3.log`, `results/sigterm.json` |
| SIGKILL orphan recovery and replacement fencing | **PASS.** Hard owner death itself left `running` plus process evidence. Reconciliation reaped the orphan before publishing `paused`/`resumable`. The contender reported `ACQUIRED_ONLY_AFTER_PAUSED`, no overlap file existed, no post-settlement late effect occurred, and a subsequent explicit resume lease succeeded. | `logs/sigkill-2.log`, `results/sigkill.json` |

The fatal/checkpoint schedules are decisive for the former one-shot defect: after restoring the transient blocker, the probes only polled durable state. They did not invoke cancellation, resume, another manager run, or orphan reconciliation.

For terminal-plus-live evidence, a late effect while recovery is blocked is expected and is not misreported as quiesced. The safety property is that the mission remains nonterminal and owned until settlement; no further effect is permitted after confirmed settlement.

## 3. Focused real-process suite

Executed without modifying the test or its helpers:

```bash
env -u ROUTER_CHEAP_API_KEY -u OPENAI_API_KEY -u TAVILY_API_KEY \
    -u ANTHROPIC_API_KEY -u GEMINI_API_KEY \
    -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY \
    AWE_OFFLINE_TEST=1 \
    AWE_DATA_DIR="$PWD/state/focused" \
    node --import tsx --test src/tests/r0-closure-process-lifecycle.test.ts
```

The command ran from `.r0-work/final-integrated-reqa-20261113/lifecycle/`, where `src` and `node_modules` are symlinks to the unmodified project entries. This kept the suite's temporary fixture root inside the permitted audit directory; the suite removed that temporary root in cleanup.

Result from `logs/focused-suite.log`:

```text
tests 9
pass 9
fail 0
duration_ms 54384.363903
exit 0
```

Passing coverage includes resistant SIGTERM, malformed process-evidence preservation, direct post-SIGKILL cancellation, orphan recovery with a real contender, terminal-plus-live recovery, automatic fatal and checkpoint retries, explicit damaged-checkpoint cancellation, and repeated SIGTERM after transient failed quiescence.

## 4. Disposition of the preceding four P1 findings

| Previous finding | Current adjudication |
|---|---|
| Blocked direct cancellation releases its lease | **Resolved in this snapshot.** `pendingCancellationLeases` retains the lease (`mission-manager.ts:793-796, 917-945`); independent TTL/heartbeat and replacement-fencing checks passed. |
| Fatal/checkpoint deferred settlement is one-shot | **Resolved.** The retry loop at `mission-manager.ts:1446-1489` automatically settled both cases after only the blocker changed. |
| Explicit cancellation replaces damaged checkpoint evidence | **Resolved.** `finalizeCancelled()` detects integrity failure and skips checkpoint replacement (`mission-manager.ts:1300-1340`); exact bytes survived independent explicit cancellation and focused test 8. |
| Terminal-plus-live evidence remains terminal with late effects | **Resolved.** `settleDirectCancellation()` reopens terminal state and records the restoration target (`mission-manager.ts:824-865`); the independent probe observed `running` during the late effect and original `failed` restoration only after quiescence. |

No new P0/P1 lifecycle defect was reproduced by the decisive probes or focused suite.

## 5. Exploratory harness exclusions

Early exploratory runs of the new audit harness failed for fixture-only reasons: an incorrect helper path after changing cwd, late-effect timers that were too short under parallel cold-start load, and a deliberately never-settling executor that correctly prevented SIGTERM finalization because in-flight work never ended. Those runs are retained as development history but are not product-failure evidence and are not cited for the verdict. The corrected, isolated, sequential decisive runs listed above are the only independent probe evidence used for PASS.

## 6. Limitations

- The full repository suite and TypeScript compiler were not part of this requested lifecycle run; only the focused 9-test suite and listed independent probes are claimed.
- No live model, provider, network, Windows computer-use, browser, MCP server, PostgreSQL, deployment, container supervisor, or multi-host recovery behavior was tested.
- Offline dependency injection does not establish provider behavior or production readiness.
- Real Linux registered process groups were exercised. Unregistered/escaped descendants, every PID-reuse possibility, foreign-host recovery, and external supervisor behavior are not certified.
- The direct terminal fixture intentionally begins with terminal-plus-surviving-process evidence; it verifies recovery of that state, not that ordinary clean cancellation creates it.

## 7. Final adjudication

All decisive independent probes are green, the focused real-process suite is **9/9**, source hashes are stable, and no P0/P1 issue remains reproduced in the requested frozen lifecycle scope.

**Final scoped independent verdict: PASS.**  
**Production/live readiness: NOT ESTABLISHED.**
