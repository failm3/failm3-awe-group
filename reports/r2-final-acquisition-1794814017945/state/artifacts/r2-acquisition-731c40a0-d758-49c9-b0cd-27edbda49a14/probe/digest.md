# Observation Digest

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Input rows: 3

## Totals

| Metric | Value |
| --- | ---: |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Per-site totals

| Site | rows | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method

1. Parse the input fixture as JSON and require a non-empty `observations` array.
2. Sum the integer fields `scheduled`, `completed` and `incidents` over all rows; `row_count` is the array length.
3. Group rows by `site`, summing the same three fields per site and sorted by site name (code point order); each site also records its `rows` count.
4. Compute `completion_percent` as `completed * 10000 / scheduled`, rounded half-up to an integer numerator, then divided by 100, i.e. `completed / scheduled * 100` to 2 decimals. Sites with `scheduled = 0` report `0`.
5. Emit `digest.json` (this data, keys in fixed order) and `digest.md` (this document) into the requested output directory.

Reproduce with: `node observation_digest_v1.mjs <observations.json> <output-dir>`; output bytes are a pure function of the input fixture.
