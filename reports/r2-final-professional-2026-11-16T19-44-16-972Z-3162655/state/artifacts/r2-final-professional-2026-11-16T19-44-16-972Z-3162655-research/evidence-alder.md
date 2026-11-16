# Evidence Note — Alder (weekday pilot site)

Bounded evidence note on the Alder site only, drawn from the Northstar service
reliability pilot charter [S1] and the Service Operations pilot observation log,
revision 2026-02-02 [S2]. Every substantive fact and number below carries an
inline source tag. Nothing outside these two sources is asserted.

## 1. Programme scope and pilot window

- The pilot programme is the Northstar service reliability pilot, owned by
  Service Operations [S1].
- The pilot window ran from 2026-01-05 through 2026-01-30, described as four
  operating weeks [S1].
- Alder is one of three pilot sites; the full site list is Alder, Brook and
  Cove, and the Depot trial is explicitly excluded [S1].
- Alder's participation is therefore four site-weeks within that window, which
  matches the log's own Alder row of "4 site-weeks" [S1][S2].

## 2. Acknowledgement medians — baseline versus pilot

- Baseline performance was 120 requests per site-week with a manual
  acknowledgement median of 18 minutes [S1].
- Under the pilot, the routed acknowledgement median was 11 minutes [S1].
- Acknowledgement timing in the pilot is measured from receipt timestamps [S1].
- Net movement: the acknowledgement median fell from 18 minutes to 11 minutes,
  a reduction of 7 minutes [S1].

## 3. Runbook change

- Routing runbook version 2 replaced version 1 on 2026-01-12 [S1].
- That change date falls inside the 2026-01-05 through 2026-01-30 window [S1].
  The charter states the change date and the median figures separately and does
  not attribute the median movement to the runbook change; no causal claim is
  made here [S1].

## 4. Alder volume, delays and escalations

| Metric | Alder value | Source |
|---|---|---|
| Site-weeks observed | 4 | [S2] |
| Requests | 480 | [S2] |
| Delayed acknowledgements | 31 | [S2] |
| Supervisor escalations | 2 | [S2] |

- The 480-request Alder total is consistent with the charter's baseline rate of
  120 requests per site-week across four site-weeks (120 x 4 = 480) [S1][S2].
- Derived ratio (arithmetic on the cited figures, not a value stated in either
  source): 31 delayed acknowledgements out of 480 requests is approximately
  6.5 percent [S1][S2].

## 5. Definition of "delayed"

- Delayed means elapsed acknowledgement time greater than 15 minutes, measured
  after routing [S2].
- This is a post-routing elapsed-time threshold, distinct from the median
  figures quoted in the charter [S1][S2].

## 6. Review sampling scope as it bears on Alder

- One independent reviewer sampled 60 acknowledgement records per site [S2].
- Applied to Alder, that is 60 sampled records against the 480 Alder requests
  recorded, i.e. roughly 12.5 percent of Alder's records (derived arithmetic on
  the cited figures) [S2].
- The log describes the reviewer as independent and describes one reviewer, not
  a panel [S2].

## 7. Data quality

- The log reports no missing weekday records [S2].
- The log does not identify individual customers [S2].
- Because the log is aggregate, it carries no customer-level or per-ticket
  attribution that this note could use [S2].

## 8. Limitations

- All conclusions here are bounded to the weekday Alder pilot site [S1].
- The charter states observations cover weekdays only and that no weekend
  conclusion is supported; no weekend conclusion is drawn [S1].
- The Depot trial is explicitly excluded from the pilot site list, and no Depot
  result is asserted or generalised to [S1].
- Nothing in these sources establishes a completed wider rollout; the evidence
  covers a defined four-week pilot window at three named sites, and the
  Alder-specific figures cover only Alder [S1][S2].
- No Brook or Cove figures are analysed in this note; those sites are outside
  its scope [S1][S2].
- The observation log is aggregate, so the 31 delayed acknowledgements and 2
  escalations cannot be broken down by week, by runbook version, or by
  individual record [S2].
- Ratios in sections 4 and 6 are arithmetic derived from cited values and are
  labelled as such; neither source states them directly [S1][S2].

## Sources

- **[S1]** `sources/pilot-charter.txt` — programme scope, pilot window, site
  list, baseline and pilot acknowledgement medians, runbook change date, and
  the weekday-only limitation.
- **[S2]** `sources/weekly-observations.txt` — Service Operations pilot
  observation log, revision 2026-02-02: the ALDER row (4 site-weeks, 480
  requests, 31 delayed acknowledgements, 2 supervisor escalations), the delay
  definition, reviewer sampling scope, and the data-quality statement.
