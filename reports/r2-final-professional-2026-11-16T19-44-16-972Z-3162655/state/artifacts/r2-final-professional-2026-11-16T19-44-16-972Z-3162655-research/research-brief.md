# Research Brief — Northstar Service Reliability Pilot (Weekday Sites Alder, Brook, Cove)

**Prepared by:** research-coordinator
**Mission:** r2-final-professional-2026-11-16T19-44-16-972Z-3162655-research
**Input basis:** three immutable local sources only — the pilot charter, the Service Operations pilot observation log (revision 2026-02-02) and the Operations Quality independent review note (2026-02-03)

---

## 1. Executive recommendation

**Adopt the independent reviewer's proposal, and treat it as a gated two-week test rather than a rollout.** Extend Alder's routing practices to Brook and Cove for two weeks [S3], then repeat the same measurement before deciding on anything wider [S3]. The evidence does not support a broader rollout now: the reviewer's own decision gate requires repeat measurement first [S3], and the pilot covers weekdays only at three named sites [S1].

The case for acting at all rests on a clear movement in the headline measure: the acknowledgement median fell from a manual baseline of 18 minutes to a routed pilot median of 11 minutes [S1]. The case for not going further rests on two things visible in the same data. First, delayed acknowledgements persist at every site — 31 at Alder, 43 at Brook and 37 at Cove across 480 requests each [S2] — so routing has not eliminated delay. Second, Alder is the best-performing site on the two counted measures [S3], with 31 delayed acknowledgements and 2 supervisor escalations against Brook's 43 and 4 and Cove's 37 and 3 [S2]. The proposed extension is therefore an attempt to transfer Alder's practice to the two weaker sites, and its value is exactly what the two-week re-measurement must establish [S3].

**Recommended decision:** approve the two-week extension to Brook and Cove [S3] as a bounded test with a pre-committed repeat measurement [S3]. Do not authorise any wider rollout on this evidence [S3].

---

## 2. Factual findings

### 2.1 Programme, window and sites

- The programme is the Northstar service reliability pilot, owned by Service Operations [S1].
- The pilot window ran from 2026-01-05 through 2026-01-30, described as four operating weeks [S1].
- The pilot sites are Alder, Brook and Cove; the Depot trial is explicitly excluded [S1].
- Routing runbook version 2 replaced version 1 on 2026-01-12, inside the pilot window [S1]. The charter records the runbook change and the median figures separately and does not attribute the median movement to the change, so no causal claim is made in this brief [S1].

### 2.2 Acknowledgement performance

- Baseline was 120 requests per site-week with a **manual acknowledgement median of 18 minutes** [S1].
- Under the pilot the **routed acknowledgement median was 11 minutes** [S1], a movement from 18 minutes to 11 minutes [S1].
- Pilot acknowledgement timing is derived from receipt timestamps [S1].
- A **delayed acknowledgement** is defined as elapsed acknowledgement time greater than 15 minutes, measured after routing [S2]. Two consequences bound every count below: the threshold is strictly greater than 15 minutes, so exactly 15 minutes is not counted [S2]; and the clock starts after routing, so these are post-routing latency figures, not total customer wait [S2].

### 2.3 Site totals — 480 requests each, with delayed acknowledgements and escalations

| Site | Site-weeks | Requests | Delayed acknowledgements | Supervisor escalations |
|---|---|---|---|---|
| Alder | 4 | **480** | **31** | 2 |
| Brook | 4 | **480** | **43** | 4 |
| Cove | 4 | **480** | **37** | 3 |

- Alder recorded 4 site-weeks, **480 requests**, **31 delayed acknowledgements** and 2 supervisor escalations [S2].
- Brook recorded 4 site-weeks, **480 requests**, **43 delayed acknowledgements** and 4 supervisor escalations [S2].
- Cove recorded 4 site-weeks, **480 requests**, **37 delayed acknowledgements** and 3 supervisor escalations [S2].
- The 480-request totals are consistent with the charter's 120 requests per site-week across four site-weeks (120 × 4 = 480) [S1][S2].
- Derived arithmetic on the cited figures, not values either source states: delayed acknowledgements are approximately 6.5 percent of requests at Alder (31/480), 9.0 percent at Brook (43/480) and 7.7 percent at Cove (37/480) [S2].
- The log reports these as cumulative per-site totals for the observation period, not per week [S2]; no per-week breakdown appears in the sources [S2].

### 2.4 Independent review and control

- One independent reviewer sampled 60 acknowledgement records per site [S2], giving 180 sampled records across the three sites [S2][S3].
- The reviewer states that the 180 sampled records reconcile to the weekly observation totals [S3]. The note does not disclose the reconciliation method or tolerance, so this is recorded as the reviewer's stated conclusion rather than a re-performed check [S3].
- The reviewer states that Alder has the smallest delayed-acknowledgement count and the fewest escalations [S3], which is consistent with the counts above: Alder 31 and 2, against Brook 43 and 4 and Cove 37 and 3 [S2]. The ranking is established on those two count measures only [S2][S3].
- Data quality: there are no missing weekday records, and the log does not identify individual customers [S2]. The counts are therefore per-request incidents and cannot be converted into a count of distinct affected customers [S2].

### 2.5 Reviewer recommendation and gate

- The reviewer recommends extending Alder routing practices to Brook and Cove for two weeks [S3].
- The reviewer sets a decision gate: repeat measurement before any wider rollout [S3].
- That recommendation is a proposal; no part of it is recorded in the sources as completed [S3].

---

## 3. Limitations

- **Weekday only.** All findings are bounded to weekday observations at the pilot sites Alder, Brook and Cove [S1]. The charter states observations cover weekdays only and that no weekend conclusion is supported [S1], and the reviewer independently cautions that the pilot cannot establish weekend performance [S3]. No weekend claim is made in this brief.
- **Depot excluded.** The Depot trial is explicitly excluded from the pilot sites [S1], and the reviewer cautions that the pilot cannot establish Depot outcomes [S3]. Nothing here generalises to Depot.
- **Three named sites, not a fleet.** Conclusions apply only to Alder, Brook and Cove over the four-week window 2026-01-05 to 2026-01-30 [S1]. No other site, region or population is covered by these sources.
- **No completed wider rollout.** The sources do not establish that any wider rollout has happened [S3]. The reviewer's two-week extension is a recommendation and the wider-rollout question is explicitly gated on repeat measurement [S3]; this brief does not claim an approved, underway or completed rollout.
- **No causal attribution.** The charter records the 18-minute baseline and 11-minute pilot medians and the 2026-01-12 runbook change as separate facts without linking them [S1]. This brief does not attribute the median movement to the runbook change, and the aggregate log cannot separate runbook versions [S2].
- **Sample, not census.** The independent review rests on 180 sampled records at 60 per site [S2][S3], against 480 requests per site [S2]. Its reconciliation is reported as a conclusion without a published method [S3].
- **Counts are aggregate.** The log gives per-site totals only [S2]; no weekly trend, per-customer rate, or explanation for the differences between sites — including why Brook exceeds Cove — can be derived from it [S2].
- **Ratios are derived.** The percentage figures in section 2.3 are arithmetic performed on cited values and are labelled as derived; neither source states them [S1][S2].
- **Scope of the recommendation.** Alder's advantage is established only on delayed-acknowledgement count and escalation count [S2][S3]; these sources support no wider quality, cost or customer-satisfaction judgement about any site.

---

## 4. Delegated evidence notes (attributed artifacts)

This brief was produced by the research-coordinator from two persisted child evidence notes, both retained unchanged alongside this brief in the workspace root:

- **evidence-alder.md** — produced by child **source-analyst-alder** (role: source-analyst-alder). Bounded evidence note on the weekday Alder site, citing [S1] and [S2]. Source of this brief's Alder-specific findings in sections 2.2 and 2.3.
- **evidence-brook-cove.md** — produced by child **source-analyst-brook-cove** (role: source-analyst-brook-cove). Bounded evidence note on the weekday Brook and Cove sites plus the independent review, citing [S1], [S2] and [S3]. Source of this brief's Brook/Cove findings in sections 2.3 and 2.4.

Both children were launched in a single parallel delegate call with two distinct children, each granted file_read, file_list and file_write and each required to persist its named artifact. All figures in this brief were independently cross-checked against the three source files before writing [S1][S2][S3].

---

## 5. Sources

- **[S1]** `sources/pilot-charter.txt` — Northstar service reliability pilot charter: programme and owner, pilot window 2026-01-05 to 2026-01-30 (four operating weeks), site list with Depot excluded, baseline of 120 requests per site-week with manual acknowledgement median of 18 minutes, routed pilot acknowledgement median of 11 minutes with receipt-timestamp measurement, runbook version 2 replacing version 1 on 2026-01-12, and the weekday-only limitation.
- **[S2]** `sources/weekly-observations.txt` — Service Operations pilot observation log, revision 2026-02-02: the ALDER, BROOK and COVE rows (4 site-weeks and 480 requests each; 31, 43 and 37 delayed acknowledgements respectively; 2, 4 and 3 supervisor escalations respectively), the definition of a delayed acknowledgement as greater than 15 minutes measured after routing, the independent reviewer's 60-records-per-site sampling control, and the data-quality statement (no missing weekday records; no individual customer identification).
- **[S3]** `sources/reviewer-note.txt` — Operations Quality independent review note, 2026-02-03: reconciliation of the 180 sampled records to the observation totals, Alder's ranking as smallest delayed-acknowledgement count and fewest escalations, the recommendation to extend Alder routing practices to Brook and Cove for two weeks, the decision gate requiring repeat measurement before any wider rollout, and the caution that the pilot cannot establish weekend performance or Depot outcomes.

No sources beyond S1–S3 are cited in this brief.
