# Observation digest

Source: pilot.observations.json (Lumen Harbor field pilot), period 2026-W45

| Metric | Value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Sites

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method

1. Parse the input JSON and take every element of `observations` as one row.
2. `row_count` is the number of rows. `scheduled`, `completed` and `incidents` are integer sums over all rows.
3. `completion_percent` = completed / scheduled x 100, rounded half-up to 2 decimals using integer arithmetic.
4. Each site total sums the rows with that exact `site` value. Site percentages use the same formula.
