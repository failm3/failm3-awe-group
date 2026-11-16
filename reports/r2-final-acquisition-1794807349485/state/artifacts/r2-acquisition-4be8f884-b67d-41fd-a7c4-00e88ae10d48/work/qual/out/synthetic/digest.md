# Operational digest — 2026-W46

Competence: `observation-digest-v1`

| field | value |
| --- | --- |
| source | Qualification synthetic |
| period | 2026-W46 |
| row_count | 5 |
| scheduled | 96 |
| completed | 10 |
| incidents | 9 |
| completion_percent | 10.42 |

## Per-site totals

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact | 1 | 16 | 1 | 5 | 6.25 |
| Full | 1 | 7 | 7 | 0 | 100.00 |
| Tie | 2 | 64 | 2 | 0 | 3.13 |
| Zero | 1 | 9 | 0 | 4 | 0.00 |

## Method (reproducible)

1. Read `qual.synthetic.json` as UTF-8 JSON; sha256 `c4a37eb3ce59269f1732be58dc7524bdf4cca630bd7d5d5cc429b048ad401fe8`.
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
python3 procedures/observation_digest_v1.py input/qual.synthetic.json .
```

Outputs are deterministic: no timestamps are embedded, keys are sorted,
newlines are LF, and a trailing newline is present.
