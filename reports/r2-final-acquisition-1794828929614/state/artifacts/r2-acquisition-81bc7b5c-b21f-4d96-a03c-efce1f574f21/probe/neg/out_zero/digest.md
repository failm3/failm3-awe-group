# Observation digest (observation-digest-v1)

- Source: (unspecified)
- Period: (unspecified)

## Totals

| Metric | Value |
| --- | ---: |
| row_count | 1 |
| scheduled | 0 |
| completed | 0 |
| incidents | 0 |
| completion_percent | 0.00 |

## Sites

| Site | row_count | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 1 | 0 | 0 | 0 | 0.00 |

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

Cross-check: sum(site.scheduled) = 0, sum(site.completed) = 0, sum(site.incidents) = 0, sum(site.row_count) = 1 — all equal the totals above.
