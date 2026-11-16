# Observation digest

Capability: `observation-digest-v1`

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Input fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794813077873/state/artifacts/r2-acquisition-bc16b703-584c-489a-a257-525ca7475794/input/pilot.observations.json`
- Input fixture SHA-256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`

## Totals

| Metric | Value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Sites

| site | rows | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method (reproducible)

1. Read the fixture `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794813077873/state/artifacts/r2-acquisition-bc16b703-584c-489a-a257-525ca7475794/input/pilot.observations.json` as UTF-8 JSON and pin its bytes by SHA-256 (`412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`).
2. Use the array at `observations`; `row_count` is its length, one row per element.
3. `scheduled`, `completed` and `incidents` are plain integer sums over all rows. The site table applies the identical sums partitioned by the exact `site` string, sorted by site name.
4. `completion_percent = round_half_up(completed / scheduled * 100, 2)`, computed in scaled integer space as `round(completed * 10000 / scheduled) / 100`; when `scheduled` is 0 the percentage is `0.00`.
5. Percentages are rendered to exactly 2 decimal places here and in `digest.json`; in the JSON they remain numbers, not strings.
6. Validation is fail-closed: a non-object root, non-array `observations`, empty row set, missing/non-integer/non-negative counter, or `completed > scheduled` aborts with exit code 2 and writes no digest.
