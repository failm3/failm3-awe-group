# Observation digest

Source: perturbed.json (Lumen Harbor field pilot), period 2026-W45

| Metric | Value |
| --- | --- |
| row_count | 4 |
| scheduled | 34 |
| completed | 27 |
| incidents | 6 |
| completion_percent | 79.41 |

## Sites

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| East | 1 | 4 | 1 | 0 | 25.00 |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method

1. Parse the input JSON and take every element of `observations` as one row.
2. `row_count` is the number of rows. `scheduled`, `completed` and `incidents` are integer sums over all rows.
3. `completion_percent` = completed / scheduled x 100, rounded half-up to 2 decimals using integer arithmetic.
4. Each site total sums the rows with that exact `site` value. Site percentages use the same formula.
