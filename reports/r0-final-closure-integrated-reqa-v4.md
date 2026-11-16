# NOX R0 v4 — Fresh Independent Integrated QA

**Verdict: FAIL**

One integrated R0 blocker remains: a symbolic link at the `data/artifacts` ancestor lets files physically outside the configured data/artifact namespace be registered as mission evidence, supplied to QA, and included in a mission that reaches `completed`.

This is an offline integrated-R0 verdict only. It is **not** a live, deployment, production-readiness, or external-service readiness claim.

## Scope and method

- Evidence root: `.r0-work/final-closure-v4-20261113/integrated`.
- All files created by this review, all mutable mission state, temporary directories, outside targets, and probe outputs are beneath that evidence root.
- Testing imported the physical frozen-source copy under `copy/`; it did not execute against a source-tree alias.
- No production source/test/report, Git state, or real `.awe-data` content was modified. No network, paid/live provider, deployment, extra subagent, or competing full npm gate was used.
- The existing post-fix 22-suite gate was independently cross-checked against its summary, console, per-suite logs, suite evidence, and frozen source hashes. Focused physical-copy suites and adversarial probes supplied fresh execution evidence.

## Frozen-input integrity

| Check | Result | Evidence |
|---|---|---|
| Manifest SHA-256 | `559ad73e870bc641b08fc68645e7e3474b3b54475e568ce7baf01776a4f88391` | `results/manifest-sha256-after.txt` |
| Pre-test production verification | 73/73 `OK`, exit 0 | `logs/integrity-before.log` |
| Post-test production verification | 73/73 `OK`, exit 0 | `logs/integrity-after.log`, `results/integrity-after.exit` |
| Before/after comparison | Byte-identical verification logs; `cmp` exit 0 | `results/integrity-after-summary.txt` |
| Gate-to-review source identity | Gate `source-check.log` exactly matches this review's 73-line pre-check | `results/main-gate-verification.json` |

The frozen source did not change, so a verdict is permitted.

## Blocking finding

### IF03-ANCESTOR-01 — `artifacts` ancestor symlink escapes evidence confinement and permits completion

**Severity: R0 blocker.** The artifact namespace and the independent-QA evidence boundary can both be bypassed. This is not merely an unregistered stray file: two pre-existing files whose real paths are outside `AWE_DATA_DIR` were registered with hashes, reconciled into mission evidence, observed by QA, and left attached to a `completed` mission.

#### Isolated reproduction

Probe: `probes/if03-artifacts-root-ancestor.mjs`  
Command: `commands/if03-artifacts-root-ancestor.txt`  
Raw log: `logs/if03-artifacts-root-ancestor.log`  
Structured observation: `results/if03-artifacts-root-ancestor-summary.json`

The probe uses a fresh isolated `AWE_DATA_DIR` at:

`state/if03-artifacts-root-ancestor/data`

Before importing the storage module, it creates:

`data/artifacts -> state/if03-artifacts-root-ancestor/outside-artifacts-root`

The link target is called “outside” because it is outside the configured data namespace; it still remains beneath the permitted review evidence root. Two files are pre-seeded through that target:

- `target.txt`, bytes `outside-target`
- `nested/unregistered.txt`, bytes `outside-unregistered`

The probe then runs the real copied storage and mission-manager implementation. Planning, specialist execution, and QA are deterministic offline injections; no provider or network is involved. The injected QA records exactly which artifacts the real manager supplies.

#### Observed result

| Observation | Exact result |
|---|---|
| Manager threw | No (`runError: "none"`) |
| Returned mission status | `completed` |
| Persisted mission status | `completed` |
| QA invocations | `1` |
| Artifact names supplied to QA | `primary.txt`, `nested/unregistered.txt`, `target.txt` |
| Outside files adopted by reconciliation | `nested/unregistered.txt`, `target.txt` |
| Outside real path | `state/if03-artifacts-root-ancestor/outside-artifacts-root/eeeeeeee-1111-4111-8111-000000000001/...` |
| Persisted execution QA state | `qa_passed: true`, `qa_score: 10`, `repair_iterations: 0` |
| Outside bytes changed | No |
| Security-probe exit | `1` (both required refusal assertions failed) |

Raw-log assertions:

```text
FAIL	artifacts-root ancestor symlink is rejected without adopting outside files
FAIL	manager cannot send escaped evidence to QA or complete with it
SUMMARY	passed=0	failed=2
```

The persisted mission record independently confirms `status: "completed"`, three attached artifact IDs, and a passing QA gate:

`state/if03-artifacts-root-ancestor/data/missions/eeeeeeee-1111-4111-8111-000000000001.json`

#### Root cause

In frozen `src/utils/storage.ts`:

1. `ensureDirs()` at lines 22–25 uses `existsSync`/`mkdirSync` and accepts an existing symlinked `ARTIFACTS_DIR` without an `lstat` non-symlink check.
2. `reconcileArtifactFilesLocked()` at lines 459–469 checks only the final mission directory with `lstat`. A normal mission directory beneath a symlinked ancestor is itself a normal directory, so this check passes.
3. Line 470 resolves `realMissionDir` to the escaped target. Lines 481–484 then confine descendants to that already-escaped `realMissionDir`; they never establish that the real mission directory is beneath a trusted, non-symlink artifact root.
4. The normal save path has the same ancestor assumption: lines 368–379 validate the mission directory and parent relative to the resolved, escaped mission root, not a validated artifact namespace root.
5. The real manager invokes reconciliation at `src/agents/mission-manager.ts:2232` and `:2498`, so escaped regular files become QA/completion evidence rather than remaining an ignored filesystem anomaly.

The v4 direct mission-root-link defense is therefore effective but incomplete: an ancestor link bypasses it.

#### Required closure

Reject a symlink/non-directory artifact root before artifact writes, registry operations, reconciliation, QA, or completion; retain all descendant checks after establishing that trusted root. Add this pre-import ancestor-link case as a regression and demonstrate that neither outside file is registered, QA is not called, and the mission cannot complete. Then rerun the artifact/manager focused suites and this probe against a newly frozen source set.

#### Finding evidence hashes

Recorded in `results/if03-artifacts-root-ancestor.sha256`:

- Probe SHA-256: `3c7b09c0a9ae0a1e0487afc8a1439e996e052b2b3869a974a6c4b4b2c7264576`
- Raw log SHA-256: `7c707c81bca5b758d4f033474959c3e86e9a0a9d138eadaddbb7f149418aa37a`
- Structured summary SHA-256: `adb85f1515cc6891d2c43330ccc3801d2788ce6771494f961a3e567dc2b80615`

## Passing controls and regression evidence

These results narrow the blocker; none waives it.

### Existing post-fix main gate, independently verified

`results/main-gate-verification.json`: **8/8 consistency checks passed**, exit 0 (`logs/verify-main-gate.log`, `results/verify-main-gate.exit`).

- 22/22 suites passed, 0 failed, every exit code 0 and signal null.
- Interval: `2026-11-13T14:17:25.648Z` through `2026-11-13T14:26:21.193Z`.
- Summary suite set exactly matches all 22 frozen physical-copy test suites.
- Every persisted per-suite log body and PASS marker occurs in the full console log.
- Independent suite-evidence names, durations, and PASS states match the summary.
- Gate source-check evidence matches the frozen 73-file pre-check exactly.

Evidence hashes for the summary, console, suite evidence, manifest, and all 22 logs are recorded in `results/main-gate-verification.json` and `results/main-gate-evidence.sha256`.

### Fresh focused physical-copy suites

Command/log/results: `commands/focused-v4.txt`, `logs/focused-v4.log`, `results/focused-v4-summary.json`, `results/focused-v4.exit`.

All six suites exited 0, for **298/298 checks/tests**:

| Suite | Result |
|---|---:|
| `artifact-reconciliation` | 10/10 |
| `r0-runtime-storage-lease` | 71/71 |
| `r0-reqa-manager` | 95/95 |
| `r0-final-manager` | 79/79 |
| `r0-closure-process-lifecycle` | 9/9 |
| `r0-independent-contracts` | 34/34 |

The process-lifecycle timing change therefore has fresh passing coverage. Cross-process observations also pass: 13.944 seconds in the uncontended main gate and 23.834 seconds in the loaded focused independent-contracts run. The latter remains below the former 25-second watchdog; v4's 90-second cross-process watchdog did not conceal a failed assertion.

### Adapted v3 IF-02 / lease and artifact-write probe

`logs/if02-if03-expanded.log`: **24/24 passed**, exit 0.

Coverage includes malformed, truncated, null, empty, invalid-purpose, invalid-generation, non-UTF8, wrong-mission, and genuinely unreadable lease evidence; live/dead owner controls for every acquisition purpose; final, dangling, parent, nested-parent, nested-final, and mission-root symlink write refusal; ordinary nested writes and immutable metadata; and direct mission-root reconciliation refusal.

### Expanded reconciliation probe

`logs/if03-extended-reconciliation.log`: **6/6 passed**, exit 0.

It confirms:

- non-directory mission-root refusal without byte/metadata changes;
- direct mission-root-link refusal with exact link and outside-byte preservation;
- adoption of exactly three ordinary nested regular files;
- direct/nested file, directory, and dangling links remain links and contribute no records;
- all ordinary reconciled real paths remain below the real mission root;
- idempotence and ordinary nested save after reconciliation.

These controls show that the failure is specifically the unchecked **artifact-root ancestor**, not a general failure of regular nested reconciliation or final-component link handling.

### Adapted v3 IF-04 resistant-repair probe

`logs/if04-resistant-repair-v2.log`: **8/8 passed**, exit 0 (`results/if04-resistant-repair-v2.exit`).

Both returned-failure and thrown-failure repairs with real SIGTERM-resistant children now:

- retain running state, process evidence, and the execution lease while a resistant child remains live;
- publish paused recovery only after child death, process-record cleanup, and lease release;
- retain the failed durable intent and exact QA blockers;
- refuse ordinary success/failure terminalization without explicit recovery;
- produce no late effect after confirmed quiescence.

### Original 27 probes

Corrected sequential reruns completed **27/27 passed**, with every command exit 0:

| Probe file | Passed | Evidence |
|---|---:|---|
| `original-tool-security.test.ts` | 7/7 | `logs/original-tool-security.log` |
| `original-shell-lifecycle.test.ts` | 7/7 | `logs/original-shell-lifecycle.log` |
| `original-adapters.test.ts` | 8/8 | `logs/original-adapters.log` |
| `original-interfaces.test.ts` | 5/5 | `logs/original-interfaces.log` |

Exit records are under `results/original-*.exit`; the two corrected rerun statuses are also in `results/original-probes-rerun-summary.tsv`.

## Harness-only failures retained for audit

No harness setup failure is counted as a product PASS, and none hides the blocking reproduction:

1. The first focused run failed before test execution because its long evidence-local `TMPDIR` produced over-long `tsx` Unix IPC paths (`EADDRINUSE`). Logs/results are retained as `focused-v4-long-tmp.*`; rerunning with the shorter evidence-local `TMPDIR=$ROOT/t` produced the 6/6 green result above.
2. Initial tool-security and shell-lifecycle probe launches used a working directory that did not preserve the probes' intended workspace/outside-target fixture layout. The three resulting assertion failures and exits are retained with the `inside-workspace-outside-target` suffix. Corrected working-directory reruns passed 14/14 across those two files. Adapters and interfaces had already passed 13/13.
3. The first main-gate verification-script launch had a `.test`-suffix filename mapping error. It is retained as `verify-main-gate-harness-error.*`; the corrected read-only verifier passed 8/8.

## Conclusion

**FAIL.** Timing/process-lifecycle, lease corruption, direct/nested symlink, ordinary reconciliation, durable failed-repair recovery, the focused suites, the original 27 probes, and the existing 22-suite gate all have passing evidence. However, IF03-ANCESTOR-01 is a reproducible integrated evidence-confinement and verified-completion failure on the unchanged frozen v4 source. Integrated R0 cannot pass until that blocker is fixed and regression-tested.
