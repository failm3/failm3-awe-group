# Observation Digest

- Source: Lumen Harbor field pilot
- Period: 2026-W45
- Capability: observation-digest-v1

## Totals

| Metric | Value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Per-site totals

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |
| **All sites** | 3 | 30 | 26 | 6 | 86.67 |

## Method (reproducible)

1. Parse the JSON fixture and take the `observations` array.
2. Validate each row: `site` non-empty string; `scheduled`, `completed`, `incidents` integers >= 0; `completed` <= `scheduled`.
3. `row_count` = number of rows.
4. Global `scheduled`, `completed`, `incidents` = column sums over all rows.
5. Per-site totals = column sums grouped by `site`; `rows` counts contributing rows. Sites are listed alphabetically.
6. `completion_percent` = `completed / scheduled * 100`, rounded half-up to 2 decimals using integer arithmetic `floor((completed*10000*2 + scheduled) / (2*scheduled)) / 100`, rendered with exactly 2 decimal places. Same formula is applied per site.
7. Site totals are summed again and must equal the global totals; the digest records this reconciliation.

## Reconciliation

- Sum of per-site scheduled: 30 (global 30)
- Sum of per-site completed: 26 (global 26)
- Sum of per-site incidents: 6 (global 6)
- Matches global: yes

## Input fingerprint

- Fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794799679594/state/artifacts/r2-acquisition-c7b1c3ab-3586-45f9-9690-7ec7ae591c24/input/pilot.observations.json`
- SHA-256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`
- Bytes: 474
