# Observation digest (observation-digest-v1)

- Source: x
- Period: p
- Fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/probe/neg/edge.json`
- Fixture SHA-256: `a1ba88d5029d85871ebeb7293967f38791e4ffbda93ba5de7b27998b88e78e15`

## Totals

| Metric | Value |
| --- | --- |
| Rows | 3 |
| Scheduled | 13 |
| Completed | 6 |
| Incidents | 1 |
| Completion percent | 46.15% |

## Per site

| Site | Rows | Scheduled | Completed | Incidents | Completion percent |
| --- | --- | --- | --- | --- | --- |
| A | 2 | 10 | 5 | 1 | 50.00% |
| Zürich "A" | 1 | 3 | 1 | 0 | 33.33% |

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
node -- /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/bin/observation-digest.js /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/probe/neg/edge.json /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/probe/edge-out
```
