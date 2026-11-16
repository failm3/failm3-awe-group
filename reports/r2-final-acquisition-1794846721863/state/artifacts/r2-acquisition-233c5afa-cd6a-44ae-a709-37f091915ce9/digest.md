# Observation digest

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Input SHA-256: 412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766

## Totals

| Metric | Value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Sites

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Method

1. Read the input JSON and count every entry of the observations array as one row (row_count).
2. Sum scheduled, completed and incidents across all rows, and separately per site.
3. completion_percent = completed / scheduled * 100, rounded half-up to 2 decimals using integer arithmetic.
4. Re-run: node -- observation-digest-v1.js <input.json> <output-dir>; the output is deterministic for identical input bytes.
