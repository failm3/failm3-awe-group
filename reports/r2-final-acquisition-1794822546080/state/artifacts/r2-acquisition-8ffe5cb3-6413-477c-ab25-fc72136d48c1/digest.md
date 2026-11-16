# Observation digest (observation-digest-v1)

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/input/pilot.observations.json`
- Fixture SHA-256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`

## Totals

| Metric | Value |
| --- | --- |
| Rows | 3 |
| Scheduled | 30 |
| Completed | 26 |
| Incidents | 6 |
| Completion percent | 86.67% |

## Per site

| Site | Rows | Scheduled | Completed | Incidents | Completion percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82% |
| South | 1 | 8 | 8 | 1 | 100.00% |

## Method (reproducible)

1. Read the fixture bytes and record their SHA-256 (above).
2. Parse the JSON; `observations` is the only data array consulted.
3. `row_count` = number of elements in `observations`.
4. Global totals are plain sums over every row: `scheduled` = sum of `scheduled`,
   `completed` = sum of `completed`, `incidents` = sum of `incidents`.
5. `sites` is keyed by the exact `site` string, sorted ascending; each entry holds
   that site's `rows`, summed `scheduled`/`completed`/`incidents`, and its own
   `completion_percent`.
6. `completion_percent` = completed / scheduled * 100, rounded half-up to exactly two
   decimals (`round(completed * 10000 / scheduled) / 100`); 0 scheduled yields 0.00.
7. Invariants enforced before writing: per-site sums equal the global totals and
   per-site row counts equal `row_count`; mismatch aborts without writing output.

Reproduce with:

```
node -- /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/bin/observation-digest.js /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/input/pilot.observations.json /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1
```
