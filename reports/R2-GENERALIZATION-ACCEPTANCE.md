# R2 — fresh generalization acceptance evidence

Date: 2026-11-15

## Verdict

The fresh authorized generalization run is green. This is evidence for the
bounded CSV/HTML/PNG mission and its host checks, not a claim that every product
capability or production deployment is complete.

- Mission: `r1-generalization-98ebfb8a-0d70-4b58-a916-4384f2f7932f`
- Evidence root: `r1-generalization-1794714138208/`
- Terminal status: `completed`
- Host summary: **22/22 checks passed**, `passed: true`
- Separate post-run verification: **23/23 checks passed** in
  `independent-verification.json`
- Offline regression run: **43/43 suites passed**, recorded in
  `r2-test-results-final-2/summary.json`
- Provider cost: **UNKNOWN**; no amount was inferred from token counts.

## Six independently confirmed autonomy criteria

| Criterion | Fresh measured evidence |
| --- | --- |
| 1. Real Head diagnoses a missing capability | Two completed Head model calls are in the ledger; `planning` records `acquire(render_dashboard)` followed by `replan`. |
| 2. Bounded acquisition and replan produce real output | Exactly one persisted capability attempt; its immutable original id+SHA resolves through authenticated repair lineage to intact current observation bytes. The run then produced CSV-derived metrics, self-contained HTML and a Chromium PNG. |
| 3. Independent QA approves the exact candidate | Two completed `qa-agent` calls; final review passed at score 9. Candidate and receipt hashes authenticate, and `assertCandidateCurrent` matches the final artifact set. |
| 4. Exact metrics and artifact integrity | Recomputed values are 6 rows, 59 scheduled hours, 53 completed hours, 9 incidents and 89.83%; North 22/18, South 14/13, West 23/22. All 11 visible artifact hashes and sizes match their backing bytes. |
| 5. Independent browser and pixel verification | A separate Chromium render contains the required metrics with no JavaScript error. Both PNGs are 1280×720; 54,708/921,600 pixels differ (5.9362%), below the approved maximum 0.10. `exact_equal=false`; no byte-identical-render claim is made. |
| 6. Durable identity, model accounting and bounded completion | Approved spec SHA-256 is `4d5eeada6843877f46350cc0c6d14c984a74ac5beda2e7494cf006605d4dfd11`. Candidate epoch, QA receipt, registry revisions and acquisition history remain linked after checkpoint cleanup. Nine provider calls are recorded with usage; cost remains `UNKNOWN`. |

## Implementation and regression evidence

The capability observation remains immutable audit history. Same-name repair
revisions are accepted only through authenticated endpoint names, ids, hashes,
sizes, durable provenance and (where relevant) explicit operator resolutions.
Current bytes are checked independently; forged, broken, cyclic and damaged
chains fail closed. Resume applies the same rule and does not repeat completed
acquisition or delivery work.

The latest focused capability suite has 24 passing tests, including multi-hop
lineage, resume after repair, and ordinary/operator lineage authentication after
checkpoint cleanup. The fresh complete offline suite is retained separately;
older timed-out, paused or red runs are audit history only and are not
completion evidence.

## Retained QA findings

Independent QA recorded two **minor**, non-blocking housekeeping defects:

1. `render-verification.txt` describes the pre-repair dashboard PNG rather than
   the final repaired PNG.
2. `.tmp-old.html`, `.tmp-old.png` and `.probe-rerender.png` remain as scratch
   evidence despite the request for a concise artifact set.

These findings are preserved in `qa-review.json`; they were not edited away or
reclassified by the host verifier.

## Reproduction

```bash
AWE_TEST_RESULTS_DIR="$PWD/reports/r2-test-results-final-2" npm test
npm run typecheck
npm run build
git diff --check -- src scripts
node --import tsx scripts/r1-live-generalization.ts --run-authorized-generalization
```

The final command is an explicitly authorized live provider/browser run. It
creates a new evidence root; no earlier run is used as a substitute.
