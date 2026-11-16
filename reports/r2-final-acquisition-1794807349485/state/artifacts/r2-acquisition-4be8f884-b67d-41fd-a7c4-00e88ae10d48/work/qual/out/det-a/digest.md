# Operational digest — 2026-W45

Competence: `observation-digest-v1`

| field | value |
| --- | --- |
| source | Lumen Harbor field pilot |
| period | 2026-W45 |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Per-site totals

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method (reproducible)

1. Read `pilot.observations.json` as UTF-8 JSON; sha256 `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`.
2. Validate every row: `site` a non-empty string; `scheduled`, `completed`
   and `incidents` non-negative integers; `completed` <= `scheduled`.
3. `row_count` is the number of entries in `observations`; `scheduled`,
   `completed` and `incidents` are plain integer sums over all rows.
4. Per site: the same four quantities summed over the rows carrying that
   exact `site` label.
5. `completion_percent = completed / scheduled * 100`, computed in exact
   decimal arithmetic (never binary floats) and rounded to 2 decimals
   with ROUND_HALF_UP, then rendered with exactly two decimal places.
6. Each site percentage uses the same formula on that site's own counts,
   so it is not derived from the grand total.

Reproduce from the mission directory:

```
python3 procedures/observation_digest_v1.py input/pilot.observations.json .
```

Outputs are deterministic: no timestamps are embedded, keys are sorted,
newlines are LF, and a trailing newline is present.
