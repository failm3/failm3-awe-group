# Observation digest

Source: edge

Period: test

## Totals

| metric | value |
| --- | --- |
| row_count | 2 |
| scheduled | 64 |
| completed | 2 |
| incidents | 0 |
| completion_percent | 3.13 |

## Sites

| site | rows | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| Alpha | 1 | 32 | 1 | 0 | 3.13 |
| Zeta | 1 | 32 | 1 | 0 | 3.13 |

## Method

1. Read the JSON fixture and take `observations` as the row list; `row_count` is its length.
2. `scheduled`, `completed` and `incidents` are integer sums over all rows.
3. `completion_percent = completed / scheduled * 100`, rounded half-up
   (round-half-away-from-zero) to exactly 2 decimals, computed in exact integer
   arithmetic (`round(completed * 10000 / scheduled)` hundredths of a percent)
   so no binary floating point drift can occur.
4. The `sites` object groups rows by `site`, sorted by site name ascending, and
   applies the same sums and the same percentage rule within each site.
5. Totals are computed from the row list directly and are independent of the
   per-site breakdown; `sum(sites.scheduled) == scheduled` and
   `sum(sites.completed) == completed` hold by construction.

Reproduce: `node -- observation-digest-v1.js <input.json> <output-dir>`
