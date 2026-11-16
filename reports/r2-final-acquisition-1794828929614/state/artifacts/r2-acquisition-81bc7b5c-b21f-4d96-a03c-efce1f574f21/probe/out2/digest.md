# Observation digest (observation-digest-v1)

- Source: Lumen Harbor field pilot
- Period: 2026-W45

## Totals

| Metric | Value |
| --- | ---: |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Sites

| Site | row_count | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method (reproducible)

1. Read the fixture JSON and require `observations` to be a non-empty array.
2. Require every row to carry non-empty `site` and non-negative integers for
   `scheduled`, `completed` and `incidents`; abort on any violation.
3. `row_count` is the number of observation rows.
4. `scheduled`, `completed` and `incidents` are exact integer sums over all rows.
5. Per site, the same three sums are taken over rows whose `site` matches, in
   ascending key order.
6. `completion_percent = completed / scheduled * 100`, evaluated in integer
   arithmetic as `round_half_up(completed * 10000 / scheduled) / 100` and
   rendered with exactly 2 decimal places. When `scheduled` is 0 the value is
   0.00 by definition.
7. Cross-checks performed before the run is accepted: the per-site sums must
   reproduce the grand totals, and the written files are re-parsed and
   re-aggregated independently.

Cross-check: sum(site.scheduled) = 30, sum(site.completed) = 26, sum(site.incidents) = 6, sum(site.row_count) = 3 — all equal the totals above.
