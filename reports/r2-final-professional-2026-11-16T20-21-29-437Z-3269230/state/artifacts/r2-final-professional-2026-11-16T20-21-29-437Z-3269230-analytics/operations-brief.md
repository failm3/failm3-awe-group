# Operations Brief — Six-Week Performance (W01–W06)

## Executive Recommendation

Cedar is the corrective-action priority. It has the lowest completion rate (90.48%), the highest defect count (8 of the 18 recorded defects) and the largest schedule overrun (340 of the 455 total variance minutes) of the three teams, while taking the most time per completed order (83.33 minutes). Atlas should serve as the reference process for Cedar's recovery plan, since it delivers the lowest time per completed order (64.94 minutes) at the highest order volume (95 work orders). Birch needs no corrective action within this window: it leads on completion (94.67%) and carries the fewest defects (3) with the smallest overrun (35 minutes).

## Overall Findings

The six-week record of 18 weekly rows contains 233 work orders, of which 217 were completed — a completion rate of 93.13%. Operations logged 18 defects and consumed 15,440 actual minutes against 14,985 planned minutes, a schedule variance of 455 minutes over plan. Across all completed work, 71.15 minutes were spent per completed order.

## Team Findings

### Atlas

95 work orders, 89 completed. Completion 93.68%. 7 defects. Planned 5,700 minutes, actual 5,780 minutes, so schedule variance is +80 minutes over plan. 64.94 minutes per completed order — the lowest of the three teams.

### Birch

75 work orders, 71 completed. Completion 94.67% — the highest of the three teams. 3 defects — the fewest. Planned 4,875 minutes, actual 4,910 minutes, so schedule variance is +35 minutes over plan, the smallest overrun. 69.15 minutes per completed order.

### Cedar

63 work orders, 57 completed. Completion 90.48% — the lowest of the three teams and the only one below the 93.13% overall rate. 8 defects — the highest of the three teams, though fewer than Atlas and Birch combined (10). Planned 4,410 minutes, actual 4,750 minutes, so schedule variance is +340 minutes over plan, the largest overrun. 83.33 minutes per completed order — the highest of the three teams, ahead of Birch (69.15) and Atlas (64.94).

## Schedule Variance

| Team | Variance (minutes over plan) |
| --- | ---: |
| Atlas | 80 |
| Birch | 35 |
| Cedar | 340 |
| Total | 455 |

All three teams ran over their planned minutes, so the 455-minute total is entirely the sum of the three team variances. Cedar alone accounts for 340 of those 455 minutes.

## Method

The sole source is `input/operations.csv`, a local file of 18 weekly rows: six weeks (W01–W06) for each of three teams (Atlas, Birch, Cedar), with no missing or duplicated week/team combination. Integer fields were summed directly from the raw rows, and the derived measures use exactly these formulas:

- **Completion percent** = completed orders / work orders × 100
- **Minutes per completed order** = actual minutes / completed orders
- **Schedule variance (minutes)** = actual minutes − planned minutes

Derived values were computed from the raw integer sums and rounded to two decimal places only at the end, never from already-rounded intermediate figures. No records were invented or extrapolated beyond the supplied six weeks and three named teams, and no units were converted: every time figure in this brief is in minutes, with no hours, per-day rates or currency.

Every figure above was independently re-derived from `input/operations.csv` in this session and matches `metrics.json` field for field: totals 233 / 217 / 18 / 14,985 / 15,440 / 93.13 / 71.15 / 455; Atlas 95 / 89 / 7 / 5,700 / 5,780 / 93.68 / 64.94 / 80; Birch 75 / 71 / 3 / 4,875 / 4,910 / 94.67 / 69.15 / 35; Cedar 63 / 57 / 8 / 4,410 / 4,750 / 90.48 / 83.33 / 340.

`input/operations.csv` was read only and remains byte-identical (547 bytes, unmodified). The deliverable directory holds exactly two artifacts of substance: `metrics.json` and this `operations-brief.md`.
