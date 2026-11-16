# Research Brief — Northstar Service Reliability Pilot

**Mission:** r2-final-professional-2026-11-16T17-05-22-729Z-2757432-research
**Prepared by:** research-coordinator (single top-level delegation; two parallel source-analysis children)
**Scope:** Engineering practice only. Weekday pilot sites Alder, Brook and Cove.
**Inputs:** three immutable local sources, unchanged (see Sources).

---

## Executive Recommendation

Proceed to a bounded, time-boxed extension: apply Alder's routing practices at Brook and Cove for two weeks, then repeat the measurement before considering anything wider [S3]. This recommendation is the independent reviewer's, and the coordinator adopts it because the recorded evidence supports exactly that and no more:

- All three sites completed 4 site-weeks with 480 requests each, with no missing weekday records [S2].
- Alder recorded 31 delayed acknowledgements and 2 supervisor escalations — the smallest delayed-acknowledgement count and the fewest escalations in the pilot [S2][S3].
- Brook recorded 43 delayed acknowledgements and 4 escalations; Cove recorded 37 delayed acknowledgements and 3 escalations [S2].
- The program-level acknowledgement median moved from 18 minutes on the manual baseline to 11 minutes under routed acknowledgement [S1].

The deciding factor is that the only site with both the lowest delayed count and the lowest escalation count is Alder [S3], and the reviewer explicitly gates any wider rollout on repeat measurement [S3]. A no-change option is not supported by the sources; a wider-rollout option is explicitly gated [S3].

---

## Factual Findings

### 1. Program frame
- The pilot is the Northstar service reliability pilot, owned by Service Operations, and ran 2026-01-05 through 2026-01-30 — four operating weeks [S1].
- The pilot sites are Alder, Brook and Cove; the Depot trial is explicitly excluded [S1].
- Baseline load is 120 requests per site-week, with a manual acknowledgement median of 18 minutes [S1].
- Under the pilot, the routed acknowledgement median is 11 minutes, and acknowledgement uses receipt timestamps [S1].
- Routing runbook version 2 replaced version 1 on 2026-01-12 [S1].

### 2. Acknowledgement median change
- The acknowledgement median moved from 18 minutes (manual baseline) to 11 minutes (routed pilot) [S1].
- Both figures are program-level statements in the charter; the charter states each figure but does not attribute the change causally to the runbook v2 replacement on 2026-01-12 [S1]. The timing of the change and the runbook replacement are reported as separate facts [S1].

### 3. Per-site request totals
- Alder: 4 site-weeks, 480 requests [S2].
- Brook: 4 site-weeks, 480 requests [S2].
- Cove: 4 site-weeks, 480 requests [S2].
- All three sites therefore carry the same recorded request total of 480 [S2].

### 4. Delayed acknowledgements and escalations
- A delayed acknowledgement is defined as an elapsed acknowledgement time greater than 15 minutes, measured after routing [S2].
- Alder: 31 delayed acknowledgements, 2 supervisor escalations [S2].
- Brook: 43 delayed acknowledgements, 4 supervisor escalations [S2].
- Cove: 37 delayed acknowledgements, 3 supervisor escalations [S2].
- Ranked by delayed acknowledgements: Alder (31), then Cove (37), then Brook (43) [S2]. Ranked by escalations: Alder (2), then Cove (3), then Brook (4) [S2].
- The reviewer states that Alder has the smallest delayed-acknowledgement count and the fewest escalations [S3], which is consistent with the per-site counts in the observation log [S2].

### 5. Independent control and data quality
- One independent reviewer sampled 60 acknowledgement records per site [S2].
- The 180 sampled records reconcile to the weekly observation totals [S3].
- There are no missing weekday records [S2].
- The log does not identify individual customers [S2].

### 6. Review outcome
- The independent review note is from Operations Quality, dated 2026-02-03 [S3].
- The reviewer recommends extending Alder routing practices to Brook and Cove for two weeks [S3].
- The reviewer sets a decision gate: repeat measurement before any wider rollout [S3].

---

## Limitations

1. **Weekday-only evidence.** Observations cover weekdays only, and no weekend conclusion is supported [S1]. The review note repeats that this pilot cannot establish weekend performance [S3]. Nothing in this brief describes weekend behaviour.
2. **Depot excluded.** The Depot trial is explicitly excluded from the pilot [S1], and the review note states the pilot cannot establish Depot outcomes [S3]. No Depot inference is made here.
3. **No wider-rollout claim.** The sources do not report a completed wider rollout. The reviewer's recommendation is prospective — a two-week extension of Alder practices to Brook and Cove — and is subject to a repeat measurement before any wider rollout [S3]. No source records that the extension has itself been executed or measured [S3].
4. **No causal attribution.** The charter reports the 18-minute manual median, the 11-minute routed median, and the 2026-01-12 runbook v1-to-v2 change as separate statements [S1]. No source asserts that the runbook change caused the median change; the brief does not claim it [S1].
5. **Counts and medians only.** The sources report request totals, delayed-acknowledgement counts, escalation counts and acknowledgement medians [S1][S2]. No conversion rates, per-week breakdowns, revenue or other derived measures appear in the sources, and none are computed here [S2].
6. **No customer-level detail.** The log does not identify individual customers [S2], so no customer-segment conclusion is possible.
7. **Sample covers acknowledgements only.** The independent control is a sample of 60 acknowledgement records per site, 180 records total, reconciled to the weekly totals [S2][S3]. It does not extend beyond acknowledgement records.
8. **Bounded population.** Every finding above is bounded to weekday pilot sites Alder, Brook and Cove [S1]. Generalization to weekends, to Depot, or to any other site or population is not supported by these sources [S1][S3].

---

## Sources

| ID | Path | Description |
|----|------|-------------|
| S1 | `sources/pilot-charter.txt` | Northstar service reliability pilot charter: window, sites, owner, baseline and pilot acknowledgement medians, runbook change date, weekday-only limit. |
| S2 | `sources/weekly-observations.txt` | Service Operations pilot observation log, revision 2026-02-02: per-site site-weeks, request totals, delayed acknowledgements, escalations, delay definition, sampling control, data-quality note. |
| S3 | `sources/reviewer-note.txt` | Independent review note, Operations Quality, 2026-02-03: sample reconciliation, Alder comparison, extension recommendation, decision gate, weekend/Depot caution. |

All three inputs were read from the mission workspace and left byte-identical; no sources were added, edited or invented.

---

## Supporting evidence notes (child artifacts)

- `evidence-alder.md` — bounded Alder evidence note, produced by child `evidence-analyst-alder`.
- `evidence-brook-cove.md` — bounded Brook and Cove evidence note, produced by child `evidence-analyst-brook-cove`.
