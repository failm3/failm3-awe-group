# Observation digest

Capability: `observation-digest-v1`

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Input fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794816592440/state/artifacts/r2-acquisition-ac8a8235-1dde-42a6-9a99-d1ccf47500ae/input/pilot.observations.json`
- Observation rows read: 3

## Totals

| measure | value |
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

## Reproducible method

1. Invoke the procedure with two arguments: the fixture path and an output directory.

   ```
   python3 observation_digest_v1.py /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794816592440/state/artifacts/r2-acquisition-ac8a8235-1dde-42a6-9a99-d1ccf47500ae/input/pilot.observations.json <outdir>
   ```

2. Parse the input as JSON and take the `observations` array. Its length is `row_count`.
3. Sum `scheduled`, `completed` and `incidents` over every row. Each value is converted
   to an exact decimal (`Decimal(str(value))`) before summation, so totals are exact and
   free of binary floating-point drift.
4. Group the same rows by the exact `site` string and repeat step 3 per site. Sites are
   emitted in sorted key order inside a `sites` object, each with `row_count`,
   `scheduled`, `completed`, `incidents` and `completion_percent`.
5. Compute `completion_percent = completed / scheduled * 100`, quantized to two decimals
   with `ROUND_HALF_UP`; the value is `0.0` when `scheduled` is 0. The same formula is
   applied to the grand totals and to every site.
6. Write `digest.json` (the five totals plus `sites`) and this `digest.md` into the output
   directory. Re-running the same fixture reproduces byte-identical output.

Checks cross this file: for the grand totals, `scheduled` equals the sum of the per-site
`scheduled` values, and likewise for `completed`, `incidents` and `row_count`.
