# Observation digest — edge probe (probe)

## Totals

| Metric | Value |
| --- | --- |
| Rows | 3 |
| Scheduled | 35 |
| Completed | 3 |
| Incidents | 1 |
| Completion % | 8.57 |

## By site

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| Alpha | 2 | 35 | 3 | 1 | 8.57 |
| Beta | 1 | 0 | 0 | 0 | 0.00 |

## Method

Reproducible and arithmetic-checkable:

1. Read every element of `observations` in the source fixture, in file order.
2. `row_count` is the length of that array.
3. `scheduled`, `completed` and `incidents` are plain sums of the like-named integer field over all rows.
4. `completion_percent = round(completed * 10000 / scheduled) / 100`, i.e. completed/scheduled as a percentage rounded to exactly two decimals using integer arithmetic (no floating-point drift, ties rounded away from zero). A site with zero scheduled rows reports 0.00.
5. The `sites` object groups rows by the `site` field, sorted by site name; each site carries its own `rows`, `scheduled`, `completed`, `incidents` and two-decimal `completion_percent` computed by the same rule. Site totals are independent sums, not apportioned from the grand total.
6. Percentages are rendered with `toFixed(2)` in this document and emitted as JSON number tokens with exactly two decimal places (`100.00`, not `100`) in `digest.json`; trailing-zero fraction digits are valid JSON number syntax and parse to the same value, so both files carry the 2 decimals literally.

Cross-check: the sum of per-site `scheduled`/`completed`/`incidents` equals the grand totals, because both are sums over the same rows.
