# Operational digest — observation-digest-v1

- Procedure: `observation-digest-v1` v1.0.0 (dependency-free Node.js ESM)
- Input fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794826619109/state/artifacts/r2-acquisition-59dd5658-e850-4b52-bd1a-20e062a4a38b/input/pilot.observations.json`
- Output root: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794826619109/state/artifacts/r2-acquisition-59dd5658-e850-4b52-bd1a-20e062a4a38b`
- Runtime: node 22.23.3

## Totals

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Per-site totals

| site | scheduled | completed | incidents |
| --- | --- | --- | --- |
| North | 22 | 18 | 5 |
| South | 8 | 8 | 1 |
| **all sites** | **30** | **26** | **6** |

## Method (reproducible)

1. Read the fixture at the fixed absolute path `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794826619109/state/artifacts/r2-acquisition-59dd5658-e850-4b52-bd1a-20e062a4a38b/input/pilot.observations.json` as UTF-8 and parse it as JSON.
2. Take the row array: the top-level value when it is an array, otherwise the value of its `observations` member. Each row must carry a non-empty string `site` and integer `scheduled`, `completed`, `incidents`; anything else aborts with a non-zero exit code.
3. `row_count` = number of rows in that array (3 for this fixture).
4. `scheduled`, `completed`, `incidents` = arithmetic sums of the like-named field over every row.
5. `completion_percent` = `round(completed * 10000 / scheduled) / 100`, i.e. completed/scheduled as a percentage rounded to exactly two decimals with half-up rounding on the integer numerator (0 when `scheduled` is 0). For this fixture: 26 * 10000 / 30 = 8666.66... -> 8667 -> 86.67.
6. `sites` = one key per distinct `site` value, each holding the same three sums restricted to the rows of that site. Keys are emitted in ascending code-unit order of the site name, so the file is byte-stable across runs and locales.
7. Consistency check before writing: the per-site sums must equal the aggregate sums for all three counters, otherwise the run aborts with a non-zero exit code and writes nothing.
8. Persist `digest.json` (2-space indented JSON + trailing newline) and this `digest.md` in the output root; `digest.md` restates the same numbers and records this method.

## Reproduction

Run the same procedure with the same two fixed arguments:

```
node -- /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794826619109/state/artifacts/r2-acquisition-59dd5658-e850-4b52-bd1a-20e062a4a38b/observation-digest-v1.mjs /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794826619109/state/artifacts/r2-acquisition-59dd5658-e850-4b52-bd1a-20e062a4a38b/input/pilot.observations.json /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794826619109/state/artifacts/r2-acquisition-59dd5658-e850-4b52-bd1a-20e062a4a38b
```

The run is deterministic: the same input bytes always yield the same `digest.json` and `digest.md` values.
