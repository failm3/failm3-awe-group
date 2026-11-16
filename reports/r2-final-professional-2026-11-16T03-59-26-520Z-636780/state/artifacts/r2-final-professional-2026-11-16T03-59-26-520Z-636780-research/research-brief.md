# Research Brief — Northstar Service Reliability Pilot

**Mission:** r2-final-professional-2026-11-16T03-59-26-520Z-636780-research
**Subject:** Decision-ready reading of the Northstar service reliability pilot, weekdays only, sites Alder, Brook and Cove
**Evidence base:** three immutable local pilot sources, S1–S3 (mapping in *Sources*)

---

## Executive recommendation

**Recommend: approve the reviewer's proposed two-week extension of Alder routing practices to Brook and Cove, run as a measured trial, and do not authorize any wider rollout until the repeat measurement at the stated decision gate is complete [S3].**

The reasoning is narrow and cited:

- The pilot window is 2026-01-05 through 2026-01-30, four operating weeks, owned by Service Operations, covering sites Alder, Brook and Cove; the Depot trial is explicitly excluded [S1].
- Against a baseline of 120 requests per site-week and a manual acknowledgement median of 18 minutes, the routed acknowledgement median was 11 minutes — an improvement of 7 minutes on the cited figures [S1]. That 7-minute delta is derived arithmetic on [S1], not a separately sourced figure.
- Alder recorded the smallest delayed-acknowledgement count and the fewest escalations of the three sites [S3], which is the specific basis for using Alder routing practices as the thing to extend.
- The recommendation on the table is explicitly bounded in time and scope — extend Alder routing practices to Brook and Cove for two weeks — and the reviewer attaches a decision gate requiring repeat measurement before any wider rollout [S3]. Nothing in the sources establishes that a wider rollout has occurred [S3].

Two conditions attach to the recommendation and are not optional:

1. **Repeat measurement is the gate, not a formality** — the reviewer requires it before any wider rollout [S3].
2. **Scope stays at weekday Alder, Brook and Cove** — no weekend or Depot conclusion is supported [S1][S3].

---

## Factual findings

### Site volumes and delayed acknowledgements

Request volumes were identical across the three sites, and delayed acknowledgements differed:

| Site | Site-weeks | Requests | Delayed acknowledgements | Supervisor escalations |
|---|---|---|---|---|
| Alder | 4 | 480 | 31 | 2 [S2] |
| Brook | 4 | 480 | 43 | 4 [S2] |
| Cove | 4 | 480 | 37 | 3 [S2] |

- All three sites recorded **480 requests** each across four site-weeks [S2].
- Delayed acknowledgements were **31 at Alder, 43 at Brook and 37 at Cove** [S2].
- Supervisor escalations were 2 at Alder, 4 at Brook and 3 at Cove [S2].
- The recorded 480 requests per site are consistent with the charter baseline of 120 requests per site-week over four operating weeks [S1]; the 480 totals themselves are the recorded site figures [S2]. The 120-per-site-week equivalence is a derived check (480 ÷ 4 = 120) on [S1] and [S2], not a separately sourced measurement.

### Acknowledgement timing

- The manual acknowledgement median was **18 minutes**; the routed acknowledgement median was **11 minutes** [S1].
- Acknowledgement timing uses receipt timestamps [S1].
- A "delay" is defined as elapsed acknowledgement time greater than 15 minutes, measured after routing [S2].

### What changed during the window

- Routing runbook version 2 replaced version 1 on 2026-01-12, i.e. inside the four-week pilot window [S1]. The observation period therefore spans both runbook versions [S1].

### Review and control signal

- One independent reviewer sampled 60 acknowledgement records per site [S2].
- The **180 sampled records reconcile to the weekly observation totals** [S3]; 60 × 3 sites = 180 is derived arithmetic on [S2] and [S3].
- The reviewer found Alder has the smallest delayed-acknowledgement count and the fewest escalations [S3] — consistent with the recorded counts of 31 delays and 2 escalations at Alder against 43/4 at Brook and 37/3 at Cove [S2].
- The reviewer recommends extending Alder routing practices to Brook and Cove for two weeks, with repeat measurement gating any wider rollout [S3].
- Data quality: there were no missing weekday records, and the log does not identify individual customers [S2].

### Gaps between sites, as recorded

- Brook recorded 43 delayed acknowledgements against Cove's 37, and 4 escalations against Cove's 3 [S2]. The differences (6 more delayed acknowledgements and 1 more escalation at Brook than Cove) are derived arithmetic on [S2] and are not stated as findings in any source.
- The reviewer does not rank Brook against Cove; the only ranking stated is that Alder is lowest on both measures [S3].

---

## Limitations

- **Weekday only.** Observations cover weekdays only, and no weekend conclusion is supported [S1]. The reviewer independently cautions that this pilot cannot establish weekend performance [S3].
- **Depot excluded.** The Depot trial is explicitly excluded from the pilot sites [S1], and the reviewer states the pilot cannot establish Depot outcomes [S3]. Nothing here carries to Depot.
- **No completed rollout.** The sources establish only a recommendation for a two-week extension and a decision gate requiring repeat measurement before any wider rollout [S3]. No source asserts that a wider rollout occurred, and none should be inferred.
- **Mid-window process change.** Runbook version 2 replaced version 1 on 2026-01-12 [S1], so the four-week window contains both runbook versions; the sources do not separate outcomes by runbook version.
- **Observation log, not an external audit.** The figures come from the Service Operations pilot observation log, revision 2026-02-02 [S2], with review by Operations Quality dated 2026-02-03 [S3]. The review reconciled a 60-records-per-site sample to the totals [S2][S3]; it is a sample reconciliation, not a full record-level audit.
- **No customer-level detail.** The log does not identify individual customers [S2], so no customer-segment or repeat-contact analysis is possible from these sources.
- **Causal attribution is not established.** The pilot reports an acknowledgement median moving from 18 to 11 minutes and a runbook change inside the same window [S1], but no source isolates the runbook change as the cause of the timing change.
- **Derived arithmetic is not sourced.** Any difference, percentage or rate in this brief is computed from the cited figures and is labelled as such; those computations add no evidentiary weight beyond the cited inputs.

---

## Child evidence notes (retained artifacts)

This brief is the coordinator's synthesis of two bounded evidence notes produced in parallel by delegated specialist children. Both are retained in the workspace as attributed artifacts:

- **`evidence-alder.md`** — bounded child evidence note owned by the `alder-source-analysis` specialist; covers Alder site facts, the programme context needed to read Alder correctly, and the review signals bearing on Alder [S2][S3].
- **`evidence-brook-cove.md`** — bounded child evidence note owned by the `brook-cove-source-analysis` specialist; covers the Brook and Cove site facts, the shared measurement definitions, and the reviewer signals applying to those two sites [S2][S3].

Both notes are supporting artifacts, not alternative briefs. Every figure carried into this brief is traceable to the three sources below, and neither note introduces a source beyond S1–S3.

---

## Sources

| Token | Path |
|---|---|
| [S1] | sources/pilot-charter.txt |
| [S2] | sources/weekly-observations.txt |
| [S3] | sources/reviewer-note.txt |

- **[S1]** — Northstar service reliability pilot charter: programme, window 2026-01-05 to 2026-01-30 (four operating weeks), sites Alder, Brook, Cove with Depot explicitly excluded, owner Service Operations, baseline 120 requests per site-week and manual acknowledgement median 18 minutes, routed acknowledgement median 11 minutes on receipt timestamps, runbook v2 replacing v1 on 2026-01-12, weekday-only limit.
- **[S2]** — Service Operations pilot observation log, revision 2026-02-02: per-site site-weeks, requests, delayed acknowledgements and supervisor escalations; >15-minute delay definition measured after routing; 60 sampled records per site; no missing weekday records; no customer identification.
- **[S3]** — Operations Quality independent review note, 2026-02-03: 180 sampled records reconcile to the weekly totals; Alder smallest delayed-acknowledgement count and fewest escalations; recommend extending Alder routing practices to Brook and Cove for two weeks; repeat measurement before any wider rollout; caution that the pilot cannot establish weekend performance or Depot outcomes.

All three input files were read only and remained byte-identical and unmodified throughout (523, 593 and 421 bytes respectively). No source beyond S1, S2 and S3 is cited in this brief.
