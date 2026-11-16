# Evidence — Alder site (Northstar service reliability pilot)

**Attribution.** Child analyst: `researcher` (delegated source-analysis child, Alder scope).
Mission: `r2-final-professional-2026-11-16T20-21-29-437Z-3269230-research`.
This note was produced by me alone and is my own bounded evidence record; it is not the coordinator's synthesis.

**Sources read (all three, read-only, unmodified):**
- `[S1]` `sources/pilot-charter.txt` — program charter (window, sites, baseline, pilot definition, change, limit).
- `[S2]` `sources/weekly-observations.txt` — Service Operations pilot observation log, revision 2026-02-02 (site counts, delay definition, control sample, data quality).
- `[S3]` `sources/reviewer-note.txt` — Operations Quality independent review note, 2026-02-03 (reconciliation, Alder ranking, recommendation, caveat).

No other file was read as an input, and no web or network source was used.

---

## 1. Alder fact table

| Fact | Value | Citation |
|---|---|---|
| Alder site-weeks observed | 4 | [S2] |
| Alder request total | 480 | [S2] |
| Alder delayed acknowledgements | 31 | [S2] |
| Alder supervisor escalations | 2 | [S2] |
| Delayed acknowledgement defined as | elapsed acknowledgement time greater than 15 minutes, measured after routing | [S2] |
| Acknowledgement measured using | receipt timestamps | [S1] |
| Baseline requests per site-week | 120 | [S1] |
| Baseline manual acknowledgement median | 18 minutes | [S1] |
| Pilot routed acknowledgement median | 11 minutes | [S1] |
| Pilot window | 2026-01-05 through 2026-01-30 (four operating weeks) | [S1] |
| Pilot sites | Alder, Brook, Cove | [S1] |
| Runbook change | routing runbook version 2 replaced version 1 on 2026-01-12 | [S1] |
| Observation coverage limit | weekdays only | [S1] |
| Alder delayed-acknowledgement rank | smallest delayed-acknowledgement count among the three sites | [S3] |
| Alder escalation rank | fewest escalations among the three sites | [S3] |

### Alder facts in narrative form

- Alder contributed 4 site-weeks, 480 requests, 31 delayed acknowledgements and 2 supervisor escalations [S2].
- A delayed acknowledgement is an acknowledgement whose elapsed time exceeds 15 minutes, measured after routing [S2]; acknowledgement timing is derived from receipt timestamps [S1].
- Alder has the smallest delayed-acknowledgement count and the fewest escalations of the three pilot sites [S3].
- Alder is one of the three pilot sites in a window running 2026-01-05 through 2026-01-30, described as four operating weeks [S1].
- Alder observations cover weekdays only [S1].
- The Depot trial is explicitly excluded from the pilot [S1].

## 2. Programme-level timing and measurement facts that supply the Alder comparison

These figures are stated by the charter at programme level, not per site; see §3 for that distinction.

- Manual acknowledgement median at baseline: 18 minutes [S1].
- Routed acknowledgement median under the pilot: 11 minutes [S1].
- The acknowledgement median therefore changed from 18 minutes to 11 minutes across the pilot [S1].
- Baseline volume is 120 requests per site-week [S1].
- Acknowledgement timing is measured using receipt timestamps [S1].
- The delay threshold used for counting is greater than 15 minutes of elapsed acknowledgement time, measured after routing [S2].

## 3. Reviewer sampling, reconciliation and recommendation as they bear on Alder

- One independent reviewer sampled 60 acknowledgement records per site [S2].
- No missing weekday records were found, and the observation log does not identify individual customers [S2].
- The 180 sampled records reconcile to the weekly observation totals [S3].
- The independent review was performed by Operations Quality and is dated 2026-02-03 [S3].
- The reviewer's recommendation is to extend Alder routing practices to Brook and Cove for two weeks [S3].
- The reviewer sets a decision gate: repeat measurement before any wider rollout [S3].
- The reviewer cautions that the pilot cannot establish weekend performance or Depot outcomes [S3].

## 4. Discrepancies and open questions

Recorded, not resolved. Each item is left as the sources leave it.

1. **Alder is not given its own timing medians.** The 18-minute baseline median and 11-minute pilot median are stated by the charter at programme level [S1]; no source states an Alder-specific acknowledgement median, and none attributes either median to Alder alone [S1] [S2] [S3]. The 18-to-11-minute change is therefore charter-level, not an Alder measurement.
2. **Measurement wording differs between sources.** The charter says acknowledgement uses receipt timestamps [S1]; the observation log defines the delay measure as elapsed acknowledgement time measured after routing [S2]. Whether "receipt timestamp" and "measured after routing" describe the same start point is not stated by any source, and I do not assume they coincide [S1] [S2].
3. **The Alder request total is stated but its per-week composition is not.** The charter gives a baseline of 120 requests per site-week [S1] and the log gives Alder 4 site-weeks and 480 requests [S2]. The sources state both figures but never assert that Alder's 480 is exactly the baseline volume; I record both without reconciling them [S1] [S2].
4. **No source states an Alder delayed-acknowledgement rate or percentage.** Only absolute counts are given — 31 delayed acknowledgements against 480 requests [S2]. No rate is stated anywhere [S1] [S2] [S3], so none is offered here.
5. **The reviewer's Alder sample size is implied, not stated per site.** The log says 60 records per site were sampled [S2] and the reviewer says 180 sampled records reconciled [S3]. The Alder-only sample count is therefore implied by those two statements together rather than stated directly for Alder [S2] [S3].
6. **Alder's ranking is comparative in S3 but numeric only in S2.** The reviewer asserts Alder has the smallest delayed-acknowledgement count and fewest escalations [S3] without restating the numbers; the underlying counts are 31 and 2 [S2]. The two sources are compatible on their face, but S3 supplies no figures of its own [S2] [S3].
7. **The runbook change splits the pilot window and is not tied to Alder's results.** Runbook version 2 replaced version 1 on 2026-01-12 [S1], inside a window that began 2026-01-05 [S1]. No source reports Alder outcomes separately by runbook version, and S3's recommendation to extend "Alder routing practices" [S3] does not specify a version. Which runbook version underpins the Alder figures is therefore unestablished [S1] [S3].
8. **Alder's low counts are not attributed to a cause.** No source states that the routed-acknowledgement change, the runbook change, or any other factor caused Alder's delayed-acknowledgement count or escalation count [S1] [S2] [S3].
9. **Document dating order.** The observation log is a revision dated 2026-02-02 [S2] and the review note is dated 2026-02-03 [S3]; the review therefore post-dates the log revision, but no source states that the reviewer worked from that exact revision [S2] [S3].

## 5. Scope note

This evidence is limited to the weekday Alder pilot within the 2026-01-05 to 2026-01-30 window [S1] [S2]. It supports no weekend conclusion and no Depot conclusion; the charter states that observations cover weekdays only and that no weekend or Depot conclusion is supported [S1], the Depot trial is explicitly excluded [S1], and the reviewer independently cautions that the pilot cannot establish weekend performance or Depot outcomes [S3]. Nothing here should be read as evidence of a completed wider rollout: the reviewer's recommendation is an extension to Brook and Cove for two weeks, gated on repeat measurement before any wider rollout [S3]. All figures above are as stated or as directly given by the three named sources; no number has been inferred or supplied from outside them.
