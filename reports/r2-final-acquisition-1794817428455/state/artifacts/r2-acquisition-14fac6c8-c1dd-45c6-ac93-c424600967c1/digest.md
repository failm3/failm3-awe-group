# Observation Digest (observation-digest-v1)

- **Source:** Lumen Harbor field pilot
- **Period:** 2026-W45
- **Input fixture sha256:** `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`

## Totals

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Sites

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |
| **total** | 3 | 30 | 26 | 6 | 86.67 |

## Reproducible method

1. Read the fixture path given as argument 1 and parse it as UTF-8 JSON.
2. Validate every row of `observations`: `site` non-empty string;
   `scheduled`, `completed`, `incidents` are JSON integers `>= 0`;
   `completed <= scheduled`. Any violation aborts with a nonzero exit.
3. Global totals are integer sums over all rows:
   `row_count` = number of rows,
   `scheduled` = sum(scheduled),
   `completed` = sum(completed),
   `incidents` = sum(incidents).
4. Per-site totals are the same sums grouped by `site`, keyed by site name
   in ascending order; per-site values are re-checked to reconcile to the
   global totals before any output is written.
5. `completion_percent` = completed * 100 / scheduled, computed in exact
   decimal arithmetic and rounded half-up to 2 decimal places; 0.00 when
   `scheduled` is 0. The same rule applies per site.
6. `digest.json` and `digest.md` are written into the directory given as
   argument 2, atomically, and carry the values shown above.
