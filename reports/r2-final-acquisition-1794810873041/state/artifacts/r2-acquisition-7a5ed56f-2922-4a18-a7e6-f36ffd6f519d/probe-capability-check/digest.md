# Operational digest

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Input: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794810873041/state/artifacts/r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d/input/pilot.observations.json`

## Totals

| Metric | Value |
| --- | --- |
| Rows | 3 |
| Scheduled | 30 |
| Completed | 26 |
| Incidents | 6 |
| Completion percent | 86.67 |

## By site

| Site | Rows | Scheduled | Completed | Incidents | Completion percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |
| **All sites** | **3** | **30** | **26** | **6** | **86.67** |

## Method (reproducible)

1. Read the single JSON fixture at the path given as argument 1 (UTF-8, `JSON.parse`).
2. Take the `observations` array as the row set; each row contributes its `site` string and its `scheduled`, `completed`, `incidents` integers. Non-negative integers are enforced; any other value aborts with exit code 2.
3. `row_count` = number of elements of `observations`.
4. `scheduled`, `completed`, `incidents` = exact integer sums over all rows (also reported per site).
5. `completion_percent` = `completed / scheduled * 100`, computed in exact integer arithmetic as hundredths: `q = (completed * 10000) / scheduled` with remainder `r`; if `r * 2 >= scheduled` then `q = q + 1` (round half up); result = `q / 100`. Division by zero yields `0.00`. No floating-point rounding is involved, so the value is host-independent.
6. `sites` = object keyed by every distinct `site`, keys sorted by Unicode code point (ascending); each entry carries `rows`, `scheduled`, `completed`, `incidents` and its own `completion_percent` computed by step 5.
7. Write `digest.json` (2-space indented JSON, trailing newline) and `digest.md` (this file) into the output root given as argument 2.

Verification example: `26 / 30 * 100` = 86.67 → rounded half up to 2 decimals = 86.67.
