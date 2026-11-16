# Observation Digest

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794844229723/state/artifacts/r2-acquisition-3d592423-2e9a-48e2-a8df-f0014b17f75d/input/pilot.observations.json`
- Fixture SHA-256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`
- Row count: 3

## Totals

| Metric | Value |
| --- | ---: |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Totals by site

| Site | rows | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method (reproducible)

1. Read the fixture once as bytes and record its SHA-256 (`sha256sum` of the same file must match the value above).
2. Parse the JSON; require a root object whose `observations` member is an array.
3. Require every observation to carry a non-empty string `site` plus integer `scheduled`, `completed` and `incidents`, each `>= 0`; otherwise exit non-zero without writing output.
4. `row_count` = number of elements in `observations`.
5. Each of `scheduled`, `completed`, `incidents` is summed across all rows (exact integer addition; no floating point).
6. The `sites` object groups rows by their exact `site` string; each entry repeats the same integer sums plus its own `rows` count. Site keys are emitted in sorted order.
7. `completion_percent` = `completed / scheduled * 100`, rounded half-up to 2 decimals. It is computed in integer space as basis points: `round(10000 * completed / scheduled)`, then rendered as `bp / 100` with two decimals. A site with `scheduled = 0` reports `null` instead of dividing by zero.
8. Verify by hand: `completed * 10000 / scheduled` rounded, then divide by 100.
