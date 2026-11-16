# Evidence Note — Alder (bounded child evidence note)

**Owner:** `alder-source-analysis` specialist child, produced in parallel with the Brook/Cove child.
**Input scope:** only `sources/pilot-charter.txt` [S1] and `sources/weekly-observations.txt` [S2]. The independent reviewer note was not read by this child and is not cited here; nothing below depends on it.
**Citation rule applied:** every sourced statement carries `[S1]` or `[S2]` in that exact form. Arithmetic performed on cited inputs is explicitly labelled as derived and adds no evidentiary weight.

---

## Facts

### Alder site record

- Alder is one of the pilot sites in the Northstar service reliability pilot [S1].
- Alder recorded 4 site-weeks, 480 requests, 31 delayed acknowledgements and 2 supervisor escalations [S2].
- The 480-request figure is Alder's recorded site total over the four site-weeks [S2].
- The 31 delayed-acknowledgement figure is Alder's recorded count across the same four site-weeks [S2].
- The observation log these figures come from is the Service Operations pilot observation log, revision 2026-02-02 [S2].

### What counts as a delayed acknowledgement

- A delayed acknowledgement is defined as elapsed acknowledgement time greater than 15 minutes, measured after routing [S2].
- The 31 figure is therefore a count of acknowledgements exceeding that 15-minute threshold after routing, not a median or an average [S2].

### Acknowledgement-latency and median observations

- The charter records a manual acknowledgement median of 18 minutes and a routed acknowledgement median of 11 minutes [S1].
- Acknowledgement timing in the pilot uses receipt timestamps [S1].
- Both medians are stated at programme level [S1]. Neither source states an acknowledgement median, mean or latency figure attributable to Alder specifically.

### Pilot scoping

- The pilot window is 2026-01-05 through 2026-01-30, described as four operating weeks [S1].
- The pilot sites are Alder, Brook and Cove; the Depot trial is explicitly excluded [S1].
- The programme owner is Service Operations [S1].
- The baseline is 120 requests per site-week, with a manual acknowledgement median of 18 minutes [S1].
- Observations cover weekdays only [S1].
- Routing runbook version 2 replaced version 1 on 2026-01-12, i.e. inside the pilot window [S1].

### Data-quality and control context

- There are no missing weekday records, and the log does not identify individual customers [S2].
- One independent reviewer sampled 60 acknowledgement records per site [S2].

### Derived computations (not sourced figures)

- *Derived:* 480 requests ÷ 4 site-weeks = 120 requests per site-week at Alder, which matches the charter baseline of 120 requests per site-week [S1]. This is a consistency check on [S2] and [S1] inputs, not a separately measured value.
- *Derived:* 31 delayed acknowledgements ÷ 480 requests ≈ 6.5% of Alder requests over the four site-weeks. Inputs: 31 delayed acknowledgements and 480 requests [S2]. Not stated in any source.
- *Derived:* Alder's 31 delayed acknowledgements compare with 43 recorded at Brook and 37 recorded at Cove in the same log [S2]; on those cited inputs 31 is the lowest of the three recorded counts. This is arithmetic on [S2] values, not a sourced ranking statement.

---

## Limitations / Do-not-infer

- **Do not attribute the 18-minute or 11-minute medians to Alder.** Both are programme-level charter figures [S1]; the observation log supplies no Alder-specific median [S2]. No per-site latency median exists in these two sources.
- **Do not convert the 31 count into a latency claim.** The 31 is a count above a fixed 15-minute threshold after routing [S2]; the 11-minute median [S1] is a different measure, and neither source links the two at site level.
- **Do not infer weekend performance.** Observations cover weekdays only, and the charter states no weekend conclusion is supported [S1]; the absence of missing weekday records [S2] says nothing about weekends. This note supports no weekend-site conclusion of any kind.
- **Do not infer Depot outcomes.** The Depot trial is explicitly excluded from the pilot sites [S1], and no Depot observation appears in either source. Nothing here carries to Depot.
- **Do not assert or imply a completed wider rollout.** Neither source records any rollout, extension, recommendation or decision beyond the pilot window [S1][S2]. The sources establish a four-week pilot and its observations only; no rollout has occurred on this evidence, wider or otherwise.
- **Do not attribute Alder's counts to the runbook change.** Runbook version 2 replaced version 1 on 2026-01-12 inside the window [S1], but neither source separates observations by runbook version [S1][S2], so no causal attribution and no before/after split is supported.
- **Do not treat the review as a full audit.** The control was a 60-records-per-site sample [S2], not a record-level audit of all 480 Alder requests; the sampling result at Alder is not stated in my inputs.
- **Do not infer customer-level or segment findings.** The log does not identify individual customers [S2], so no customer-segment, repeat-contact or per-customer analysis is possible from these sources.
- **Do not read the 480 as a target or a cap.** It is the recorded request total for Alder over four site-weeks [S2]; agreement with the 120-per-site-week baseline [S1] is a derived consistency check, not a statement that volume was controlled.
- **Derived arithmetic is not evidence.** The percentages and comparisons above are computed from cited values and must not be quoted as sourced findings.

---

## Sources cited in this note

- **[S1]** `sources/pilot-charter.txt` — programme, window 2026-01-05 to 2026-01-30 (four operating weeks), sites Alder/Brook/Cove with Depot explicitly excluded, owner Service Operations, baseline 120 requests per site-week, manual acknowledgement median 18 minutes, routed acknowledgement median 11 minutes on receipt timestamps, runbook v2 replacing v1 on 2026-01-12, weekday-only limit.
- **[S2]** `sources/weekly-observations.txt` — Service Operations pilot observation log, revision 2026-02-02: per-site site-weeks, requests, delayed acknowledgements and supervisor escalations; >15-minute delay definition measured after routing; 60 sampled records per site; no missing weekday records; no customer identification.
