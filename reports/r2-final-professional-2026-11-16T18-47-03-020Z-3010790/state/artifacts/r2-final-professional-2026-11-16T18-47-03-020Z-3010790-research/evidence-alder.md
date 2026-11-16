# Evidence note: Alder (Child A)

Scope: Alder-relevant facts from the three immutable sources. Weekday pilot data only. No causes, weekend or Depot behaviour, or rollout outcomes are inferred.

Sources (read only, not modified):
- [S1] sources/pilot-charter.txt
- [S2] sources/weekly-observations.txt
- [S3] sources/reviewer-note.txt

## 1. Alder facts

| # | Fact | Value | Citation | Source line |
|---|------|-------|----------|-------------|
| 1 | Alder weekday request total | 480 requests | [S2] | "ALDER: 4 site-weeks, 480 requests, ..." |
| 2 | Alder site-weeks observed | 4 | [S2] | "ALDER: 4 site-weeks, ..." |
| 3 | Alder delayed acknowledgements | 31 | [S2] | "... 31 delayed acknowledgements, ..." |
| 4 | Alder supervisor escalations | 2 | [S2] | "... 2 supervisor escalations." |
| 5 | Definition of delayed acknowledgement (what "31" counts) | Elapsed acknowledgement time greater than 15 minutes, measured after routing | [S2] | "DELAY: elapsed acknowledgement time greater than 15 minutes, measured after routing." |
| 6 | Reviewer: Alder has the smallest delayed-acknowledgement count and fewest escalations | Smallest count; fewest escalations | [S3] | "Alder has the smallest delayed-acknowledgement count and the fewest escalations." |
| 7 | Reviewer recommendation | Extend Alder routing practices to Brook and Cove for two weeks | [S3] | "Recommendation: extend Alder routing practices to Brook and Cove for two weeks." |
| 8 | Baseline acknowledgement median (manual) | 18 minutes | [S1] | "BASELINE: ... manual acknowledgement median 18 minutes." |
| 9 | Pilot acknowledgement median (routed) | 11 minutes | [S1] | "PILOT: routed acknowledgement median 11 minutes; ..." |
| 10 | Acknowledgement time basis | Receipt timestamps | [S1] | "... acknowledgement uses receipt timestamps." |
| 11 | Baseline request rate (charter baseline) | 120 requests per site-week | [S1] | "BASELINE: 120 requests per site-week; ..." |
| 12 | Derived: baseline rate x Alder site-weeks | 120 x 4 = 480, consistent with fact 1 (derived arithmetic, not a stated source line) | [S1], [S2] | S1: "120 requests per site-week"; S2: "ALDER: 4 site-weeks, 480 requests" |
| 13 | Program window | 2026-01-05 through 2026-01-30 (four operating weeks) | [S1] | "WINDOW: 2026-01-05 through 2026-01-30 (four operating weeks)" |
| 14 | Program owner | Service Operations | [S1] | "OWNER: Service Operations" |
| 15 | Sites in scope | Alder, Brook, Cove; Depot trial explicitly excluded | [S1] | "SITES: Alder, Brook, Cove; the Depot trial is explicitly excluded." |
| 16 | Routing runbook change | Version 2 replaced version 1 on 2026-01-12 | [S1] | "CHANGE: routing runbook version 2 replaced version 1 on 2026-01-12." |
| 17 | Program name | Northstar service reliability pilot | [S1] | "PROGRAM: Northstar service reliability pilot" |

## 2. Cross-site and control facts bearing on Alder

| # | Fact | Value | Citation | Source line |
|---|------|-------|----------|-------------|
| 18 | Reviewer sampling | One independent reviewer sampled 60 acknowledgement records per site | [S2] | "CONTROL: one independent reviewer sampled 60 acknowledgement records per site." |
| 19 | Total sampled records | 180 | [S3] | "The 180 sampled records reconcile to the weekly observation totals." |
| 20 | Derived: 60 per site x 3 sites | 180, consistent with fact 19 (derived arithmetic) | [S2], [S3] | S2: "60 acknowledgement records per site"; S3: "The 180 sampled records" |
| 21 | Reconciliation of samples to weekly totals | The sampled records reconcile to the weekly observation totals | [S3] | "The 180 sampled records reconcile to the weekly observation totals." |
| 22 | Data quality: completeness | No missing weekday records | [S2] | "DATA_QUALITY: no missing weekday records; ..." |
| 23 | Data quality: privacy | The log does not identify individual customers | [S2] | "... the log does not identify individual customers." |
| 24 | Brook comparator (context for fact 6) | 4 site-weeks, 480 requests, 43 delayed acknowledgements, 4 supervisor escalations | [S2] | "BROOK: 4 site-weeks, 480 requests, 43 delayed acknowledgements, 4 supervisor escalations." |
| 25 | Cove comparator (context for fact 6) | 4 site-weeks, 480 requests, 37 delayed acknowledgements, 3 supervisor escalations | [S2] | "COVE: 4 site-weeks, 480 requests, 37 delayed acknowledgements, 3 supervisor escalations." |
| 26 | Derived: ordering behind fact 6 | Delayed acknowledgements 31 (Alder) < 37 (Cove) < 43 (Brook); escalations 2 < 3 < 4. Matches [S3]'s statement (derived comparison) | [S2], [S3] | See facts 3, 4, 24, 25 and 6 |
| 27 | Observation log revision | 2026-02-02 | [S2] | "SOURCE: Service Operations pilot observation log, revision 2026-02-02" |
| 28 | Review note author and date | Operations Quality, 2026-02-03 | [S3] | "INDEPENDENT REVIEW NOTE: Operations Quality, 2026-02-03" |
| 29 | Decision gate | Repeat measurement before any wider rollout | [S3] | "Decision gate: repeat measurement before any wider rollout." |

Note on facts 8 and 9: [S1] gives the 18-minute and 11-minute medians for the pilot as a whole. The sources give no Alder-specific median.

## 3. Limitations and exclusions found in the sources

- Weekday-only coverage. No weekend or Depot conclusion is supported. [S1] "LIMIT: observations cover weekdays only; no weekend or Depot conclusion is supported."
- The Depot trial is explicitly excluded. [S1] "the Depot trial is explicitly excluded."
- No individual customer identification. [S2] "the log does not identify individual customers."
- 15-minute measurement convention. A delayed acknowledgement is elapsed acknowledgement time greater than 15 minutes, measured after routing. The count of 31 applies only under that definition. [S2]
- Reviewer caution. The pilot cannot establish weekend performance or Depot outcomes. [S3] "Caution: this pilot cannot establish weekend performance or Depot outcomes."
- Decision gate. Measurement is to be repeated before any wider rollout. [S3]
- The reviewer recommends a two-week extension to Brook and Cove. The sources do not report that this has happened or what it produced. [S3]
- Mid-window runbook change. Runbook version 2 replaced version 1 on 2026-01-12, inside the 2026-01-05 to 2026-01-30 window. The sources do not split Alder's results by runbook version, so the 31 delayed acknowledgements and 2 escalations cannot be attributed to either version. [S1], [S2]
- Supervisor escalations are counted in [S2] (Alder: 2), but none of the three sources defines them or gives a threshold.
- The 120 requests per site-week is a charter baseline. [S1] does not say how it was measured. The 480 in [S2] is the observed Alder total.
- The sources give no Alder-specific acknowledgement median, so the 18-to-11-minute change cannot be attributed to Alder alone.
- The sources give no cause for Alder's lower delayed-acknowledgement and escalation counts. No cause is inferred here.

## 4. Expected-value check

| Expected value | Source reading | Citation | Result |
|----------------|----------------|----------|--------|
| Alder weekday requests = 480 | "ALDER: 4 site-weeks, 480 requests" | [S2] | MATCH |
| Alder site-weeks = 4 | "ALDER: 4 site-weeks" | [S2] | MATCH |
| Alder delayed acknowledgements = 31 | "31 delayed acknowledgements" | [S2] | MATCH |
| Alder supervisor escalations = 2 | "2 supervisor escalations" | [S2] | MATCH |
| Manual baseline median 18 minutes | "manual acknowledgement median 18 minutes" | [S1] | MATCH |
| Routed pilot median 11 minutes | "routed acknowledgement median 11 minutes" | [S1] | MATCH |
| Baseline 120 requests per site-week | "120 requests per site-week" | [S1] | MATCH |

No mismatches found. No source reading was altered to fit an expectation.
