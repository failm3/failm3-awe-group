# Six-Week Operations Brief — Atlas, Birch and Cedar

**Source:** `input/operations.csv` — 18 weekly records (six weeks × three teams). Every figure in this brief is taken from the persisted `metrics.json`, whose values were independently recomputed from that CSV. Nothing here is estimated, extrapolated beyond the six weeks and three teams, or unit-converted.

## Executive recommendation

Cedar is the only team that is worst on all three measures at once: the lowest completion (**90.48%**, 57 of 63), the most defects (**8**) on the fewest work orders (63), and the largest positive schedule variance (**+340 minutes**). With overall completion at 93.13% and overall variance at +455 minutes, Cedar's +340 variance is the dominant part of the overrun, while Atlas (+80) and Birch (+35) are both far closer to plan. **Recommendation: direct the next review at Cedar's weekly records, and treat Atlas (93.68%, +80) and Birch (94.67%, +35) as the reference pattern for how the six weeks were run.** The aggregate 93.13% should not be read as typical of any single team — Birch is above it, Atlas is marginally above it, and Cedar is below it. The dataset records volumes, defects and minutes only; it contains no information on why Cedar's weeks ran longer, so no cause is asserted here.

## Overall findings

| Metric | Value |
| --- | --- |
| Weekly records (rows) | 18 |
| Work orders | 233 |
| Completed orders | 217 |
| Defects | 18 |
| Planned minutes | 14985 |
| Actual minutes | 15440 |
| Completion percent | 93.13 |
| Minutes per completed order | 71.15 |
| Schedule variance minutes | 455 |

Across the six weeks the three teams completed 217 of 233 work orders (93.13%) and logged 18 defects. They used 15440 actual minutes against 14985 planned minutes, a positive schedule variance of 455 minutes — that is, all three teams together finished the period over plan, not under it.

## Per-team findings

| Team | Work orders | Completed | Completion % | Defects | Planned min | Actual min | Min per completed | Schedule variance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Atlas | 95 | 89 | 93.68 | 7 | 5700 | 5780 | 64.94 | 80 |
| Birch | 75 | 71 | 94.67 | 3 | 4875 | 4910 | 69.15 | 35 |
| Cedar | 63 | 57 | 90.48 | 8 | 4410 | 4750 | 83.33 | 340 |

### Completion

Birch has the highest completion at 94.67% (71 of 75), Atlas follows at 93.68% (89 of 95), and Cedar is lowest at 90.48% (57 of 63). Cedar is also the only team below the overall 93.13%. Atlas carries the largest caseload at 95 work orders and still completes at 93.68%; Cedar carries the smallest at 63 and completes at the lowest rate.

### Defects

Defects total 18 across the dataset: Cedar 8, Atlas 7, Birch 3. Cedar records the most defects while handling the fewest work orders, and Birch records the fewest defects while handling 12 more work orders than Cedar. Atlas's 7 defects are spread over the largest volume of work orders.

### Schedule variance

All three variances are positive, meaning actual minutes exceeded planned minutes in every case: Cedar +340, Atlas +80, Birch +35. Cedar's variance alone (340) is more than four times Atlas's (80) and roughly ten times Birch's (35). The same ordering holds on pace: Cedar's 83.33 minutes per completed order is the highest of the three, ahead of Birch (69.15) and Atlas (64.94), so Cedar's extra minutes are not matched by extra completions.

## Method

- **Input:** `input/operations.csv`, read in place and never rewritten — the file remains byte-identical. Record count is the number of CSV data rows (18), excluding the header row.
- **Base metrics:** `work_orders`, `completed_orders`, `defects`, `planned_minutes` and `actual_minutes` are direct sums of the corresponding CSV columns, computed per team and then summed for the three-team totals. Integer metrics are unrounded integer sums and are serialized as JSON numbers.
- **Derived metrics** use exactly these three formulas:
  - `completion_percent = completed_orders / work_orders × 100`
  - `minutes_per_completed_order = actual_minutes / completed_orders`
  - `schedule_variance_minutes = actual_minutes − planned_minutes`
- Ratios are computed from the raw integer sums, never from an already-rounded intermediate, and are rounded to exactly two decimal places only at the point of serialization.
- No records were invented, no units were converted, no targets, ranges or benchmarks from outside the dataset were introduced, and all conclusions are limited to the supplied six-week, three-team dataset.

## Verification

The metrics were derived twice independently and the two passes agreed on every figure. The additivity checks confirm the totals: 95 + 75 + 63 = 233 work orders; 89 + 71 + 57 = 217 completed orders; 7 + 3 + 8 = 18 defects; 5700 + 4875 + 4410 = 14985 planned minutes; 5780 + 4910 + 4750 = 15440 actual minutes; 80 + 35 + 340 = 455 schedule variance minutes. This brief was written only after every number above was matched against both `metrics.json` and `input/operations.csv`; no divergence was found.
