# R0 Final Closure — Integrated Adversarial Re-QA v2

**Date:** 2026-11-13  
**Evidence root:** `.r0-work/final-closure-v2-20261113/integrated/`  
**Mode:** offline, isolated, production-source probes plus independent inspection of the main gate  
**Decision rule:** PASS requires zero reproduced in-scope P0/P1 findings **and** a fresh complete 22/22 gate.

# Verdict: **FAIL**

**Reproduced findings: P0 = 0; P1 = 4 distinct root causes.**  
**Main gate: 21/22 suites passed; `r0-final-manager.test.ts` failed.**  
**Frozen-source integrity: 73/73 hashes OK before, after the gate, and after all new probes.**

R0 must remain open. Three production defects were dynamically reproduced: unreadable/wrong-mission lease evidence is overwritten during acquisition, artifact writes follow symlinks outside the mission namespace, and effect-bearing failed repairs publish `paused` while a real registered child process is still alive. Independently, the mandatory full gate is deterministically red: the manager suite reproduces 71 passes and 8 failures in isolation.

This is an offline integrated verdict only. Protocol doubles are not live-provider, browser, MCP, PostgreSQL, deployment, or external-API evidence.

## 1. Decision summary

| ID | Severity | Root cause | Decisive observed result |
|---|---|---|---|
| IF-01 | **P1** | Required manager gate and current recovery contract disagree | Main gate 21/22; fresh isolated manager rerun repeats **71 passed / 8 failed**. Eight D3.1 assertions expect `failed`, while current effect-bearing recovery returns `paused`; the inline-only recovery-path blocker assertion also fails. |
| IF-02 | **P1** | Lease acquisition treats malformed or wrong-mission evidence as absent | Both acquisitions returned a lease and atomically replaced the pre-existing evidence with generation-1 records. |
| IF-03 | **P1** | Artifact pathname checks are lexical but writes follow symlinks | A final-component symlink overwrote its outside target; an ancestor symlink created a new outside file. Both targets were contained in the isolated evidence root. |
| IF-04 | **P1** | Failed-repair recovery publishes pause before OS-process quiescence | Returned and thrown repair failures both persisted `paused`, retained an ambiguous failed-repair intent, and left `child_alive=true` with durable process evidence. |

Passing controls do not offset these findings or turn a 21/22 gate into the required 22/22 result.

## 2. Main-gate audit and IF-01

### 2.1 Freshness and consistency

The main gate was not rerun by this review. Its existing artifacts were independently audited:

- `reports/r0-test-results/summary.json` records **22 unique suites**, **21 passed**, **1 failed**.
- Fresh interval: **2026-11-13T12:16:13.259Z–12:24:56.533Z**.
- All 22 current suite logs are nonempty, fall inside that interval, and agree with their summary exit/pass status.
- No current log reports skipped or cancelled tests.
- The only failed suite is `src/tests/r0-final-manager.test.ts`, exit code 1.

Machine-readable audit: `results/main-gate-audit.json`; console output: `logs/main-gate-audit.log`.

### 2.2 Independent reproduction and classification

`commands/manager-fresh-isolated.txt` records the fresh `env -i` launcher. `logs/manager-fresh-isolated.log` repeats the main-gate result exactly: **71 passed, 8 failed**. This is not one-off gate interference.

The failures are confined to D3.1 inline-only/missing-integrity/mismatch cases. Current code retains effect-bearing failed intents and routes them to paused recovery (`src/agents/mission-manager.ts:2211-2218`), whereas assertions at `src/tests/r0-final-manager.test.ts:91-127` still require terminal `failed`. The same file's symlink case at line 139 explicitly expects `paused` plus a failed repair intent, demonstrating the contract inconsistency within the frozen test suite.

Accordingly, IF-01 is classified as a **reproducible release-gating test/implementation contract mismatch**, not proof by itself that every observed `paused` result is wrong production behavior. Regardless of whether the eight assertions or the implementation should change, the frozen required gate is not complete or green.

## 3. New adversarial production-path findings

### IF-02 — malformed/wrong-mission lease evidence fails open

**Locations:** `src/agents/lifecycle.ts:495-503` converts parse/read failures and wrong mission IDs to `null`; `tryAcquireMissionLease` at lines 668-704 interprets that as no live owner and writes a replacement lease.

Probe: `probes/adversarial-lease-artifacts.mjs`  
Launcher: `commands/adversarial-lease-artifacts.txt`  
Evidence: `logs/adversarial-lease-artifacts.log`

| Variant | Expected fail-closed result | Actual |
|---|---|---|
| Malformed JSON lease | acquisition denied; bytes preserved | `acquired=true`; malformed bytes replaced with a valid generation-1 lease |
| Lease naming another mission | acquisition denied; record preserved | `acquired=true`; foreign record replaced with a valid generation-1 lease |

This destroys ownership/recovery evidence and can admit a new owner instead of stopping for inspection. The two variants share one root cause and count as one finding.

### IF-03 — final and ancestor artifact symlinks escape the namespace

**Location:** `src/utils/storage.ts:334-369`. `path.resolve` checks only the lexical prefix; `mkdirSync` and `writeFileSync` then follow symbolic links.

The same isolated probe created all targets beneath the audit state, outside the mission artifact directory:

```text
final-component: target="OVERWROTE-FINAL"; error=none
ancestor: outside_exists=true; contents="OVERWROTE-ANCESTOR"; error=none
```

Expected: reject both writes and leave the outside namespace unchanged. Actual: both outside effects occurred and artifact registration proceeded. This violates artifact confinement and can overwrite or create any path writable by the AWE process through a prepared namespace symlink.

The companion reconciliation control **passed**: ordinary `Dirent` reconciliation ignored both symlink forms and registered no new records. No reconciliation escape is claimed from this probe.

### IF-04 — returned/thrown failed repairs pause with live descendants

**Locations:** returned and thrown repair paths call `gateUnresolvedIntents` directly at `src/agents/mission-manager.ts:2413-2416` and `2442-2448`. That gate writes `status:"paused"` at lines 1979-2035 without calling the manager's process-quiescence routine. The process-aware `settleFailure` path is bypassed because execution returns normally.

Probe: `probes/adversarial-repair-quiescence.mjs`  
Launcher: `commands/adversarial-repair-quiescence.txt`  
Evidence: `logs/adversarial-repair-quiescence.log`

Each variant used the real manager, marked the repair effect, spawned a real detached Node process through the production process registry, and then failed the repair:

| Variant | Persisted status | Child alive | Process evidence | Ambiguous failed repair |
|---|---|---:|---:|---:|
| Returned failure | `paused` | true | true | true |
| Thrown failure | `paused` | true | true | true |

A resumable/unowned paused state while its registered descendant still runs can overlap later recovery or execution. Both fixture groups were explicitly reclaimed after measurement; final process-group file count under this probe's state is **0**. The cleanup assertions passed.

## 4. Passing and adjudicated controls

### 4.1 Original decisive probes

The four historical offline probe groups were rerun sequentially from evidence-local copies under fresh isolated environments:

| Probe group | Result |
|---|---:|
| Tool security | 7/7 |
| Shell lifecycle | 7/7 |
| Adapter doubles | 8/8 |
| Interface governance | 5/5 |
| **Total** | **27/27** |

Logs and exact commands are under `logs/original-*.log` and `commands/original-*.txt`. Adapter checks used injected MCP/browser/DNS/HTTP doubles and establish only their offline contracts.

### 4.2 Focused suites

| Suite/control | Result |
|---|---:|
| Runtime storage/lease | 60 checks passed |
| Closure adapters | 23/23 |
| Final tools | 12/12 |
| Production intent | 4/4 |
| Closure interfaces | 93 checks passed |
| Process lifecycle | 9/9 |
| Adapted closure core | 13/13 |
| Nested-workspace security rerun | 5/5 |

Only the copied closure-core fixture's hard-coded temporary path was changed to the evidence root; `logs/closure-core-adaptation.diff` records that adaptation. Production logic and assertions were unchanged.

The earlier focused security failure was a fixture-layout error: its supposed outside directory remained within the test workspace. Running from a genuinely nested workspace passed all five checks, including traversal/symlink rejection. It is not counted as a product finding.

### 4.3 Static candidates resolved dynamically

- Malformed/wrong-mission lease acquisition: **reproduced as IF-02**.
- Final/ancestor artifact symlink writes: **reproduced as IF-03**.
- Ordinary reconciliation of those symlink forms: **rejected as a finding; passed**.
- Returned/thrown repair failure with surviving process evidence: **reproduced as IF-04**.

The separately owned core F-01–F-04 probes were not duplicated.

## 5. Integrity, cleanup, and scope

- Final command: `sha256sum -c .r0-work/final-closure-v2-20261113/source.sha256`.
- Final result: **73 OK / 0 FAILED**, exit 0 (`logs/source-integrity-final.log`, `results/source-integrity-final.exit.tsv`).
- Production/test sources, previous reports, the manifest, and Git state were not changed by the QA work. All new probes, state, commands, logs, and results are under the integrated evidence root.
- Direct probes used fresh `AWE_DATA_DIR`, `HOME`, and `TMPDIR` before imports, with `env -i`; no real `.awe-data`, `/goal`, other project, or external resource was used.
- No network/live-provider/browser/MCP/Postgres/external-API/paid test, deployment, publication, production fix, or competing full `npm test` was performed.
- Loopback listeners and protocol doubles in existing offline suites are not external-service certification.

## Final decision

**FAIL / NO-GO.** Closure requires, at minimum: reconcile and pass the eight manager assertions, fail closed on unreadable/wrong-mission lease evidence without overwriting it, confine artifact writes through every symlink component, and defer failed-repair paused/lease release until registered processes are quiescent. Then rerun the complete fresh 22/22 gate and repeat independent adversarial QA. Live and production readiness remain unproven even after those offline repairs.
