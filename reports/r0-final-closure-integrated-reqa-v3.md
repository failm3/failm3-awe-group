# NOX R0 Final Closure — Integrated Re-audit v3

**Date:** 2026-11-13  
**Evidence root:** `.r0-work/final-closure-v3-20261113/integrated/`  
**Tested revision:** HEAD `446adaea833b0ebade1a21fbda3f71118d19b0d6` plus the already-present working-tree changes  
**Mode:** offline and evidence-local; no live-provider, live-browser/MCP/PostgreSQL, deployment, or external-service certification  
**Decision rule:** PASS requires no remaining R0 blocker and a fresh, complete green offline gate.

# Verdict: **FAIL / NO-GO**

**Severity-ranked reproduced blocker classes: P0 = 0; P1 = 2.**

1. **IF-01 / P1 — release acceptance is still red:** the one fresh complete sequential gate finished **20/22 suites**, not 22/22. Two timing-sensitive failures occurred in that run. Both failed suites and six targeted repetitions passed later, so this review does **not** claim two new deterministic production defects; it does establish that the required fresh gate result is not green.
2. **IF-03 / P1 — artifact reconciliation still escapes through a symlinked mission root:** reconciliation followed the root link and registered **two files physically outside the mission artifact namespace**, with size/hash metadata. The narrower final/ancestor artifact-write repairs pass, but they do not close this reconciliation path.

The former malformed/wrong-mission lease defect (IF-02) and returned/thrown failed-repair premature-pause defect (IF-04) passed their expanded probes. Passing those controls cannot offset the two remaining blocker classes.

Machine-readable counts: `results/final-summary.json`.

## 1. Evidence and fresh gate

The fresh gate ran once, sequentially, with synthetic offline credentials and evidence-local `AWE_DATA_DIR`, `HOME`, and `TMPDIR`:

- Command: `commands/full-gate.txt`
- Console: `logs/full-gate.log`
- Exit result: `results/full-gate.exit` = `1`
- Interval: **2026-11-13T13:28:47.382Z–13:38:45.797Z**
- Machine result: `gate/reports/r0-test-results/summary.json`

| Fresh-gate result | Count / observation |
|---|---:|
| Suites passed | **20/22** |
| `r0-final-manager` | **79/79** — the former D3.1 assertion mismatch is resolved |
| `r0-closure-process-lifecycle` | **8/9** |
| `r0-independent-contracts` | **33/34** |
| Skipped/cancelled tests in the two failed suites | **0** |

### IF-01a — transient-settlement lease assertion

`r0-closure-process-lifecycle.log` records failure of **“fatal failure retains ownership and automatically retries transient process settlement.”** After restoration of damaged process identity, the mission reached `paused` and the process records were gone, but the immediate assertion at test line 353 still read the `run` lease instead of `null`.

This single observation does not prove a persistent lease leak. The assertion polls durable status while a deferred continuation publishes outcome and then releases ownership; the publication-to-release interval can be observable. Classification must therefore remain precise:

- Fresh gate observation: **failed**.
- Fully copied isolated suite rerun: **9/9 passed**.
- Three additional fatal-only repetitions: **3/3 passed**.
- Corrected independent returned/thrown repair probes: deferred settlement completed, descendants died, process evidence was reclaimed, and leases became `null`.

Accordingly, no persistent post-settlement ownership defect is asserted here. The release-gating failure remains real evidence against claiming a green gate.

### IF-01b — cross-process writer harness kill

`r0-independent-contracts.log` records **“R0 cross-process: concurrent processes preserve disjoint mission patches without write collisions”** ending with `code=null, signal=SIGKILL` at the harness's 25-second kill (`r0-harness.ts:33`). The other 33 contracts passed.

Follow-up classification:

- Fully copied isolated complete suite rerun: **34/34 passed**.
- Three additional cross-process-only repetitions: **3/3 passed**.
- The separate runtime storage/lease focused suite: **67/67 passed**, including concurrent writers.

This is therefore an observed timing-sensitive/flaky gate failure, not a reproduced persistent lost-update bug. It still prevents the mandatory run from being reported as 22/22.

### Isolation evidence for the focused reruns

All focused reruns used physical evidence-local copies of `src`, `scripts`, and configuration rather than a production-source symlink:

- Commands: `commands/focused-r0-closure-process-lifecycle.txt`, `commands/focused-r0-independent-contracts.txt`, `commands/fatal-race-*.txt`, and `commands/cross-process-timing-*.txt`
- Logs/results: corresponding `logs/*.log` and `results/*.exit`
- Full-suite summaries: `focused/<suite>/reports/r0-test-results/summary.json`
- Copied-source integrity: **72/72 OK**, excluding the historical compiler-cache entries intentionally omitted from the copy.

No second complete gate was run.

## 2. IF-02 — lease evidence validation: **PASS**

Current `src/agents/lifecycle.ts` now distinguishes absent evidence from invalid evidence and denies acquisition on malformed, unreadable, or wrong-mission records.

Probe and launcher:

- `probes/if02-if03-expanded.mjs`
- `commands/if02-if03-expanded.txt`
- `logs/if02-if03-expanded.log`

All **15 aggregate lease checks passed**, covering:

- Malformed, truncated, null, empty-object, invalid-purpose, invalid-generation, non-UTF-8, and wrong-mission evidence.
- Every acquisition purpose: `run`, `approve`, `resume`, `recovery`, and `cancel`.
- Exact preservation of invalid bytes; public `readMissionLease()` failed closed rather than laundering the evidence into a replacement lease.
- Actually unreadable mode-`000` evidence, retained without replacement.
- A valid live lease remaining readable and denying all five acquisition purposes without modification.
- A genuinely killed owner permitting generation-fenced takeover for every purpose, with generation incremented from 21 to 22.

No IF-02 blocker was reproduced. The focused `r0-runtime-storage-lease` result was also **67/67**.

## 3. IF-03 — artifact namespace confinement: **FAIL**

### Passing write and traversal controls

The same expanded probe establishes that current `saveArtifactFile()` (`src/utils/storage.ts:334-405`) now refuses:

1. A final-component symlink.
2. A dangling final-component symlink.
3. A parent-directory symlink.
4. A nested parent-directory symlink.
5. A nested final-component symlink.
6. The mission root itself being a symlink.

In all six cases the write threw, each evidence-local outside target remained unchanged or absent, and no artifact metadata was created. Ordinary nested regular-file creation and same-name replacement still worked with new IDs and immutable size/hash metadata. Ordinary reconciliation also ignored direct final/parent symlink children.

### Reproduced remaining root cause: symlinked-root reconciliation

The negative root-link write control was then reused for reconciliation. Its mission directory was:

```text
<evidence>/data/artifacts/cccccccc-0000-4000-8000-000000000021 -> <evidence>/outside-mission-root-link
```

After adding a regular file in the outside directory, `reconcileArtifactFiles()` returned successfully and adopted **both** `target.txt` and `unregistered.txt`. `listArtifacts()` then exposed both records. Their metadata contained the outside files' actual sizes and SHA-256 hashes, with `reconciled:true`; no exception or refusal occurred.

Decisive log record:

```text
FAIL  reconciliation refuses/ignores a symlinked mission root without adopting outside files
      error="none"
      added=[target.txt, unregistered.txt]
      registered=2
```

The full untruncated JSON observations are in `logs/if02-if03-expanded.log`; summary is **23/24 aggregate checks passed**, with this one failure.

### Mechanism and impact

`reconcileArtifactFilesLocked()` at `src/utils/storage.ts:456-503` checks only `existsSync(missionDir)` before `readdirSync(..., {withFileTypes:true})`. Unlike `saveArtifactFile()`, it never applies `ensureArtifactDirectory()` or an `lstat` root check. A symlinked mission root therefore makes `readdirSync`, recursive traversal, `statSync`, and `readFileSync` operate on the outside target. The generated records retain the lexical in-namespace path even though their bytes come from outside.

This is not merely a cosmetic registry issue. Production managers call reconciliation before QA/final evidence handling (`mission-manager.ts:2232` and `2498`). Outside bytes can consequently become mission artifacts with apparently valid integrity metadata. The later integrity checker hashes the same escaped path, so correct hashes do not prove namespace provenance.

**Closure requirement:** reject a symlinked/non-directory mission root (and cover every traversed component) before any reconciliation read or registration, add this negative case to the offline regression gate, then repeat the independent probe. No production fix was made during this audit.

## 4. IF-04 — failed-repair process quiescence: **PASS**

The former defect published `paused` while a real repair descendant remained alive. Current code routes effect-bearing failed outcomes through `settleFailure()`, retains `deferredSettlement`, and retries under the original lease (`mission-manager.ts:1468-1525`, `1612-1693`).

Evidence:

- Probe: `probes/if04-resistant-repair.mjs`
- Corrected launcher: `commands/if04-resistant-repair-v2.txt`
- Corrected result: `logs/if04-resistant-repair-v2.log`, **8/8 checks passed**
- Focused production suite: `r0-reqa-manager`, **95/95**

For both returned and thrown repair failure, a real detached, SIGTERM-resistant Node child was launched through the production process registry:

| Observation point | Persisted status | Child/process evidence | Lease | Durable recovery evidence |
|---|---|---|---|---|
| Transient settlement blocker present | `running` | child alive; record retained | `run` retained | failed repair intent retained, not yet gated ambiguous |
| Identity restored and retry complete | `paused` | child dead; record and release file gone | `null` | failed outcome retained; ambiguity and `recovery_blocked` recorded |

Both final states retained the appropriate exact blocker (`Repair 1 reported failure` or `Repair 1 threw before a verified successful outcome`) and did not terminalize as ordinary `completed`/`failed`. There were no late-effect files, residual process records, or unreclaimed fixture groups in the corrected probe state.

`run()` may return its observed nonterminal `running` snapshot before the retained background continuation completes. The probe therefore waits for the durable paused/quiesced/lease-released state instead of treating the immediate returned snapshot as final.

The earlier draft log `logs/if04-resistant-repair.log` has six failed checks because it incorrectly required `run()` not to settle and then sampled final state without waiting for deferred publication. Those observer errors are retained for traceability but are **not product findings**. `r0-reqa-manager` independently reaches the same passing safety contract without that draft assumption.

## 5. Other passing controls

### Original four probe groups

All four original offline groups were rerun sequentially from evidence-local probe copies with fresh isolated environments:

| Group | Result |
|---|---:|
| Tool security | **7/7** |
| Shell lifecycle | **7/7** |
| Adapter doubles | **8/8** |
| Interface governance | **5/5** |
| **Total** | **27/27** |

Commands/logs are `commands/original-*.txt` and `logs/original-*.log`. Browser, MCP, DNS, and HTTP behavior in these probes is established with injected protocol doubles only.

### Relevant focused suites

A sequential eight-suite focused run passed **8/8 suites and 383/383 reported checks**:

| Suite | Result |
|---|---:|
| `artifact-reconciliation` | 10/10 |
| `r0-runtime-storage-lease` | 67/67 |
| `r0-reqa-manager` | 95/95 |
| `r0-final-manager` | 79/79 |
| `r0-final-tools` | 12/12 |
| `r0-final-production-intent` | 4/4 |
| `r0-closure-adapters` | 23/23 |
| `r0-closure-interfaces` | 93/93 |

Console: `logs/focused-relevant.log`; machine summary: `focused/relevant/reports/r0-test-results/summary.json`.

### Static and whitespace gates

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | PASS, exit 0 | `logs/typecheck.log` |
| `npm run build -- --outDir <evidence>/build/tsc` | PASS, exit 0 | `logs/build.log` |
| `git diff --check` | PASS, exit 0 | `logs/git-diff-check.log` |

Build output was redirected beneath the evidence root; no production `dist` output was used.

## 6. Integrity, isolation, and limitations

- Final source/script verification: **123/123 OK**, no failures.
- Final package/tsconfig verification: **3/3 OK**, no failures.
- Focused-copy non-cache source/config verification: **72/72 OK**, no failures.
- Manifests: `results/source-manifest.sha256`, `results/config-manifest.sha256`, and `results/focused-copy-source.sha256`.
- Final verification logs/exits: `logs/integrity-*-final.log` and `results/integrity-*-final.exit`.
- Final Git inspection: `results/git-state-final.txt`; HEAD is unchanged and the extensive pre-existing dirty/untracked state remains part of the tested target. No Git mutation was performed.
- No live model/provider, paid service, external browser/MCP/PostgreSQL test, deployment, publication, production repair, or `/goal` mutation was performed. Real `.awe-data` and prior reports were not used as mutable state.
- Corrected IF-04 cleanup: zero process-group records and zero late-effect files under its evidence state. Focused copied runs left zero `r0-temp-*` fixture directories.

**Audit-layout exception, disclosed explicitly:** the initial full-gate package used a production-`src` symlink. Node resolved some standard-harness temporary/compiler-cache paths through it, so transient fixture output escaped the intended evidence-only layout. The pre-gate hashed files remained unchanged; one newly gate-generated, non-manifest `src/tests/helpers/r0-temp-78XW4B` residual was removed after inspection. Every focused follow-up used a physical evidence-local source copy and left no such residue. This deviation is a limitation of the full-gate setup and a possible contributor to its non-reproducing timing failures; it is not grounds to discard either the red-gate acceptance result or the independently reproduced root-link defect.

**No live-service readiness claim is made.** Even an eventual offline PASS would not certify live providers, production browser/MCP/PostgreSQL services, deployment, or externally visible operations.

## Final decision

**R0 remains open.** A clean required 22/22 offline gate has not been obtained, and the reconciliation mission-root symlink escape is a reproduced P1 artifact-confinement defect. IF-02 and IF-04 are cleared by the current evidence, and the original IF-01 manager contract mismatch is resolved, but closure cannot be granted while the red gate and IF-03 reconciliation defect remain.
