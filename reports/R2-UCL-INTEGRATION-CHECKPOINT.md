# R2 / Cortex UCL integration checkpoint

Date: 2026-11-16

## Verdict

**The bounded UCL advisory integration is verified. Overall R2 readiness is
NOT CONFIRMED and R3 handoff is NOT AUTHORIZED by this report.** The additional
verified-experience experiment was valid but observed no correctness transfer:
both memory-on and memory-off solved the fresh target task.

Canonical R2 remains `bd3859a550a046c16454f44ddc2648c81318f14e`.
The integration branch is `r2/ucl-integration`; implementation checkpoint is
`eb6d7966d3c3b5a414f98277bdfb83475477b2b8`. No remote publication, deployment,
Kortix activation or Windows/WSL configuration change was performed.

## Criteria and evidence matrix

| Criterion | Status | Verifiable evidence and boundary |
| --- | --- | --- |
| 1. Real Head diagnoses a missing capability | CONFIRMED in the bounded CSV/HTML/PNG mission | Two completed Head calls and `acquire(render_dashboard)` -> `replan` in the retained generalization mission; see `R2-GENERALIZATION-ACCEPTANCE.md`. |
| 2. Bounded acquisition/replan produces real output | CONFIRMED in that mission | One persisted capability attempt with authenticated lineage, followed by CSV metrics, HTML and Chromium PNG. |
| 3. Independent QA approves the exact candidate | CONFIRMED in that mission | Two completed QA calls; final score 9; candidate, receipt and artifact hashes agree. |
| 4. Exact metrics and artifact integrity | CONFIRMED in that mission | Independently recomputed metrics and all 11 artifact hashes/sizes match. |
| 5. Independent browser/pixel verification | CONFIRMED in that mission | Separate Chromium render, required metrics, no JS error, 1280x720 PNGs and measured 5.9362% pixel difference within the approved 10% ceiling. |
| 6. Durable identity/model accounting/bounded completion | CONFIRMED in that mission | Approved-spec hash, candidate epoch, QA receipt, revisions and acquisition lineage survive; nine calls have usage; provider cost is UNKNOWN. |
| Additional: UCL remains a read-only advisory catalogue | CONFIRMED | Independent bounded QA and `ucl-bridge` 13/13 in the final regression. UNVETTED rows do not acquire approval or execution authority. Discovery is not capability acquisition. |
| Additional: independently verified experience produces measured transfer on a fresh task | **NOT MET** | Valid controlled pair `r2-memory-transfer-1794781064860`; on PASS and off PASS under the same verifier, pinned model, 10-step cap and actual zero retries. `transfer_observed=false`. Qualified retrieval/adaptation is proven, measured correctness gain is not. |

## Final checks

- Full offline regression: **45/45 suites PASS**, zero failures.
  Evidence: `r2-full-regression-accepted/summary.json` and per-suite logs.
  Interval: 2026-11-15T22:22:25.494Z to 2026-11-15T22:26:28.459Z.
- TypeScript build: PASS. `git diff --check`: PASS.
- Focused memory/recursion/admission checks: **25/25 tests PASS** before the
  restart; no production source changed afterward. The complete regression above
  rechecks the final checkpoint rather than relying only on that focused run.
- Independent final live-evidence audit: PASS, no discrepancies. It verified all
  ten validity controls, exact backing bytes, visible-test immutability,
  approved-spec recomputation, qualification/admission lineage, reference hash,
  model ledger and the negative transfer predicate.
- Final live `result.json` SHA-256:
  `a87858c9ed9ac96419eeefa0d0a0754c247569e3cc32cfec4cde14ad3fed3ad2`.
- Source hashes at `eb6d796`: `r2-verified-experience-source-eb6d796.sha256`.
- Detailed controls and artifact hashes: `R2-EXPERIENCE-TRANSFER.md`.
- Environment repairs and historical UCL evidence remain in
  `R2-ENVIRONMENT-RECOVERY.md`, `UCL-R2-INTEGRATION.md` and
  `UCL-INDEPENDENT-QA.md`.

## Interrupted operations, explicitly not accepted

- `r2-memory-transfer-1794780549627`: source completed; memory-off remained
  `started/UNKNOWN`; memory-on did not run; no terminal `result.json`.
- Earlier full-regression attempts under `/tmp/opencode` were interrupted or
  superseded. Only the retained `r2-full-regression-accepted` summary above is
  the final full-run evidence.
- Earlier invalid/unequal live runs remain untouched and are not counted as
  transfer evidence.

## Next-stage boundary

Do not declare R2 complete or begin R3 scale-up on the basis of suite counts or
UCL discovery alone. Closing the additional transfer criterion requires a new
approved experiment design and real measured benefit without extra workflow
hints or weakened QA. This report intentionally records the negative result.
