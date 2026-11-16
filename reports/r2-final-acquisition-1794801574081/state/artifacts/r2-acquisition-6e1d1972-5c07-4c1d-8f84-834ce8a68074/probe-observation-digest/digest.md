# Observation digest — Lumen Harbor field pilot (2026-W45)

Produced by `observation-digest-v1` from `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794801574081/state/artifacts/r2-acquisition-6e1d1972-5c07-4c1d-8f84-834ce8a68074/input/pilot.observations.json`.

- input sha256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`
- observation rows: 3

## Totals

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Per-site totals

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |
| **all sites** | 3 | 30 | 26 | 6 | 86.67 |

## Method (reproducible)

1. Read `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794801574081/state/artifacts/r2-acquisition-6e1d1972-5c07-4c1d-8f84-834ce8a68074/input/pilot.observations.json` as UTF-8 and parse it as JSON; take the `observations` array in file order (3 rows).
2. Reject the input unless every row is an object whose `site` is a non-empty string and whose `scheduled`, `completed` and `incidents` are non-negative integers.
3. row_count = number of observation rows = 3.
4. scheduled = sum of row.scheduled = 30; completed = sum of row.completed = 26; incidents = sum of row.incidents = 6.
5. completion_percent = round((26 / 30) * 100, 2) = 86.67 (one IEEE-754 double division, then `Number.prototype.toFixed(2)`).
6. Group rows by `site`; sum the same three counters per site and apply the identical rounding rule. A site with scheduled = 0 reports completion_percent 0.
7. Emit sites as a JSON object sorted by site name in ascending code-point order, so key order is stable across runs and hosts.
8. Integer sums are exact (no floating point); the only floating-point step is the percentage formula above, so the numbers can be re-derived by hand from the input file and its sha256.
