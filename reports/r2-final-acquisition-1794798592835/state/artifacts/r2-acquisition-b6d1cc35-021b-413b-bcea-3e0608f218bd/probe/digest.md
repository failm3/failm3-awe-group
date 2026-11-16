# Operational Digest — observation-digest-v1

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Input file: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794798592835/state/artifacts/r2-acquisition-b6d1cc35-021b-413b-bcea-3e0608f218bd/input/pilot.observations.json`

## Totals

| Metric | Value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Per-site totals

| Site | Rows | Scheduled | Completed | Incidents |
| --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 |
| South | 1 | 8 | 8 | 1 |

## Reproducible method

1. Read the JSON input; require `observations` to be a non-empty array of objects, each with a non-empty string `site`.
2. Require `scheduled`, `completed`, `incidents` to be non-negative safe integers on every row, and `completed <= scheduled`.
3. `row_count` = length of `observations`.
4. `scheduled`, `completed`, `incidents` = exact integer sums over all rows (computed with BigInt; identical to the sum of the per-site totals).
5. Group rows by `site` (trimmed); each site gets its own `row_count` and exact integer sums; sites are emitted sorted by name.
6. `completion_percent` = `completed / scheduled * 100`, rounded half-up to 2 decimals using exact integer arithmetic: round_half_up(completed*100*100 / scheduled) / 100, i.e. `26*100*100 / 30` = `8667` hundredths → `86.67`.
7. Emit `digest.json` (same numeric values, plus `validations`) and this `digest.md`.
8. Recompute independently, e.g.: `node -e "const d=require('./digest.json');console.log(d.row_count,d.scheduled,d.completed,d.incidents,d.completion_percent)"` and compare to the tables above.

## Self-checks

- [x] row_count equals observations length
- [x] site scheduled sums equal global scheduled
- [x] site completed sums equal global completed
- [x] site incidents sums equal global incidents
- [x] completed <= scheduled globally
- [x] completion_percent rounded to 2 decimals via exact integer arithmetic
- [x] site names unique after normalisation

All self-checks passed: **true**
