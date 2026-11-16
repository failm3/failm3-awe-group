# NOX R0 v5 — Fresh Independent Final Integrated QA

**Verdict: PASS**

No integrated R0 blocker remains on the frozen v5 source. In particular, v4 blocker **IF03-ANCESTOR-01 is closed**: a pre-import `data/artifacts` symlink is rejected during real storage initialization, with no mission or artifact metadata, no outside-file registration, no QA invocation, no returned or persisted completion, and exact link/outside-byte preservation. Non-directory roots and post-import root replacement also fail closed with the required safety observations.

This is an **offline integrated-R0 verdict only**. It is not a live, deployment, production-readiness, external-service, network, provider, browser, or MCP readiness claim.

## Scope and isolation

- Evidence root: `.r0-work/final-closure-v5-20261113/integrated`.
- All files created by this review, mutable mission state, temporary directories, HOME directories, and “outside” targets are beneath that evidence root.
- Tests and probes imported the physical frozen-source copy under `copy/`; no production source-tree alias was used. Only dependencies resolve through the existing `node_modules` installation.
- Production source/tests/reports, Git, and real `.awe-data` were read-only. No production fixes, Git mutations, deployments, publications, external network/paid/live LLM activity, live browser/MCP/PostgreSQL activity, extra agents, or competing full npm gate were used. Original interface fixtures used local loopback only, as explicitly noted below.
- The existing completed 22-suite gate was verified from persisted evidence instead of rerun. Focused suites and adversarial probes supplied fresh v5 execution evidence.

## Frozen-input integrity

| Check | Exact result | Evidence |
|---|---|---|
| Frozen manifest SHA-256 | `d2562ef0a50a7d25e4da83dc01fe632720708192a756a4adf7ded77bce3680a7` | `results/manifest-sha256.txt`, `results/manifest-sha256-after.txt` |
| Production verification before testing | 73/73 `OK`, exit 0 | `logs/integrity-before.log`, `results/integrity-before.exit` |
| Production verification after testing | 73/73 `OK`, exit 0 | `logs/integrity-after.log`, `results/integrity-after.exit` |
| Before/after comparison | Byte-identical; 73 verified lines | `results/integrity-after-summary.txt` |
| Physical-copy verification before/after | 73/73 `OK`; byte-identical logs | `logs/physical-copy-integrity.log`, `logs/physical-copy-integrity-after.log` |
| Exact delta from v4 physical copy | Only `src/utils/storage.ts` and `src/tests/r0-runtime-storage-lease.test.ts` | `logs/v4-v5-source-diff.log`, `logs/v4-v5-source-diff-after.log` |

The frozen source did not change. Final source verification is also recorded in `logs/integrity-final.log`.

## IF03-ANCESTOR-01 closure

### Pre-import artifact-root ancestor link

Probe: `probes/if03-artifacts-root-ancestor.mjs`  
Commands: `commands/if03-artifacts-root-symlink.txt`  
Evidence: `logs/if03-artifacts-root-symlink.log`, `results/if03-artifacts-root-symlink-summary.json`  
Result: **4/4 passed**, exit 0.

This independently adapts the exact v4 real-manager production-path scenario. Before import, `data/artifacts` points to an evidence-local directory outside `AWE_DATA_DIR`, pre-seeded with `target.txt` and `nested/unregistered.txt`. Unlike v4, the probe catches import/manager failure and always emits and checks all safety observations; an import exception alone is not treated as PASS.

| Observation | v5 result |
|---|---|
| Real storage initialization | Rejected with `Storage path contains a symbolic link or non-directory component` |
| Mission metadata file | Absent |
| Mission/artifact JSON metadata under data root | None |
| Outside metadata or adopted outside artifacts | None |
| QA calls / artifacts supplied to QA | `0` / none |
| Returned / persisted status | `null` / `null`; no completion |
| Artifact-root symlink | Exact original link retained |
| Outside tree and both file payloads | Byte-for-byte unchanged |

The ordinary-file root variant (`data/artifacts` is a regular file containing `not-a-directory`) independently passed **4/4**, exit 0, with the same no-metadata/no-QA/no-completion guarantees and exact root/outside preservation. Evidence: `logs/if03-artifacts-root-file.log`, `results/if03-artifacts-root-file-summary.json`.

Combined pre-import root checks: **8/8 passed**.

### Post-import artifact-root replacement

Probe/evidence: `probes/if03-post-import-root-replacement.mjs`, `logs/if03-post-import-root-replacement.log`, `results/if03-post-import-root-replacement-summary.json`  
Result: **4/4 passed**, exit 0.

After a normal import and creation of an approved mission, the real artifact root was moved aside and replaced by an outside-pointing symlink. All four tested entry points—`saveArtifactFile`, `reconcileArtifactFiles`, `listArtifacts`, and `saveMission`—rejected it. The real manager threw the same storage-boundary error. QA calls remained `0`; returned completion was absent; persisted status remained `approved`; the mission JSON SHA-256 stayed `749404a4f47995f213809945233e31b2f2f60d43fcf58887ced7d3d21b817b2b`; the replacement link, moved real root, outside tree, and both outside payloads remained exact; and no outside metadata appeared.

### Child-link, mission-root, and ordinary real-root controls

- `logs/if02-if03-expanded.log`: **24/24 passed**, exit 0. This covers malformed, truncated, null, empty, invalid-purpose, invalid-generation, non-UTF8, wrong-mission, and genuinely unreadable lease evidence; live/dead owners; final, dangling-final, parent, nested-parent, nested-final, and direct mission-root links; no metadata on refusal; ordinary nested creation/replacement; and reconciliation refusal/ignoring behavior.
- `logs/if03-extended-reconciliation.log`: **6/6 passed**, exit 0. Non-directory and symlink mission roots preserve bytes/links and register nothing. Ordinary real-root reconciliation adopts exactly `root.txt`, `nested/one.txt`, and `nested/deep/two.txt`; direct/nested file, directory, and dangling links remain links and add no records; all real paths stay below the real mission root; a second reconciliation adds zero records; and an ordinary nested save then lists four registered artifacts.

Thus the new ancestor-root guard closes the escape without disabling normal nested write/reconcile/list behavior.

## Existing fresh main gate — verified, not rerun

Verification: `probes/verify-main-gate.py`, `logs/verify-main-gate.log`, `results/main-gate-verification.json`  
Result: **8/8 consistency checks passed**, exit 0.

- Main summary: **22/22 suites passed**, 0 failed; every exit code 0 and signal null.
- Interval: `2026-11-13T14:55:34.466Z` through `2026-11-13T15:04:37.777Z`.
- Summary suite set exactly matches the 22 frozen physical-copy test suites.
- Every per-suite log body and PASS marker occurs in `.r0-work/clause-fix-v4-runs/npm-test.log`.
- Independent suite-evidence names, durations, PASS states, and log hashes match the summary and persisted logs.
- Gate `source-check.log` exactly matches this review's 73-line pre-check.
- Gate manifest, final-source manifest, review manifest, and suite evidence all carry the frozen v5 SHA-256.
- Gate evidence contains storage/lease **75/75**, process lifecycle **9/9**, and independent contracts **34/34**.

The complete per-suite counts and evidence hashes are in `summary.json` and `results/main-gate-evidence.sha256`.

## Fresh focused physical-copy suites

Command/evidence: `commands/focused-v5.txt`, `logs/focused-v5.log`, `copy/reports/r0-test-results/summary.json`, `results/focused-v5.exit`  
Interval: `2026-11-13T15:08:36.266Z` through `2026-11-13T15:13:40.910Z`.

All **6/6 suites** exited 0, for **302/302 checks/tests**:

| Suite | Result |
|---|---:|
| `artifact-reconciliation` | 10/10 |
| `r0-runtime-storage-lease` | 75/75 |
| `r0-reqa-manager` | 95/95 |
| `r0-final-manager` | 79/79 |
| `r0-closure-process-lifecycle` | 9/9 |
| `r0-independent-contracts` | 34/34 |

The storage/lease rerun includes permanent S5d pre-import symlink and regular-file artifact-root cases. The fresh process-lifecycle and independent-contracts runs additionally confirm the gate's timing/process coverage on the physical copy.

## Returned/thrown resistant repair revalidation

Probe/evidence: `probes/if04-resistant-repair.mjs`, `logs/if04-resistant-repair-v2.log`, `results/if04-resistant-repair-v2.exit`  
Result: **8/8 passed**, exit 0.

Both returned-failure and thrown-failure repairs with real SIGTERM-resistant children retained running state, process evidence, and the execution lease while the child was live; published paused recovery only after child death, process-record cleanup, and lease release; retained the failed durable intent and exact QA blockers; refused ordinary success/failure terminalization; and produced no late effect after confirmed quiescence.

## Original 27 regression probes — fresh v5 results

All original probes were rerun against the frozen **v5 physical copy**; no v4 result is substituted. Corrected final runs passed **27/27**, every exit 0:

| Probe | Result | Evidence |
|---|---:|---|
| `original-tool-security.test.ts` | 7/7 | `logs/original-tool-security.log` |
| `original-shell-lifecycle.test.ts` | 7/7 | `logs/original-shell-lifecycle.log` |
| `original-adapters.test.ts` | 8/8 | `logs/original-adapters.log` |
| `original-interfaces.test.ts` | 5/5 | `logs/original-interfaces.log` |

Adapters use injected protocol doubles, not live network/browser/MCP evidence. Interfaces use local loopback only. Shell lifecycle uses local process isolation fixtures.

## Exact totals and audits

| Category | Passing result |
|---|---:|
| Existing main gate, independently verified | 22/22 suites |
| Main-gate consistency verifier | 8/8 checks |
| Fresh focused physical-copy suites | 6/6 suites; 302/302 checks/tests |
| Fresh integrated adversarial probes | 50/50 checks |
| Fresh original regression probes | 27/27 tests |
| Fresh product checks excluding main-gate double counting | **379/379** |

- Residual audit processes: **0** (`results/residual-process-audit.json`). Both resistant-child PIDs from IF04 are absent.
- Real `.awe-data` entries newer than the review-start integrity log: **0** (`results/real-awe-data-audit.txt`).
- The original forbidden outside write is absent.
- Probe root/link/outside-tree and metadata invariants are recorded in the structured observation JSON files and revalidated by `summary.json`.

## Harness-only audit notes

No harness failure is counted as a product PASS or concealed:

1. The first original shell-lifecycle launch passed 6/7 because the physically copied orphan-owner helper resolved `../copy` outside the frozen source copy. Its log and exit are retained as `original-shell-lifecycle-harness-error.*`. Correcting only the helper import location and rerunning with fresh state produced 7/7.
2. One post-integrity audit command stopped because two delta logs used different headings. Their heading-independent bodies compared byte-identical and both listed exactly the two expected changed files; source integrity had already passed.
3. The first summary-builder parse emitted FAIL despite printing focused 302/302 because `artifact-reconciliation` writes `passed: 10` with a colon. The parser correction is retained with `logs/build-summary-parser-error.log`; the corrected builder independently validates all final counts and observations.

## Conclusion

**PASS — no remaining integrated R0 blocker was found on the frozen v5 source.** IF03-ANCESTOR-01 and its regular-file/post-import variants fail closed without evidence escape, QA, completion, metadata creation, or byte/link modification. All required focused suites, lease and resistant-repair probes, original regressions, frozen-source checks, and cleanup audits pass. This verdict is strictly limited to offline integrated R0 evidence and makes no live-readiness claim.
