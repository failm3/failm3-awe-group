# Six-Week Operations Brief — Atlas, Birch and Cedar

**Dataset:** `input/operations.csv`, 18 weekly records (W01–W06) covering three teams. All figures below are quoted from the persisted `metrics.json` and describe only this six-week, three-team dataset. The CSV was read only; it was not modified.

## Executive recommendation

Cedar is the one team that trails on every measure in this dataset — lowest completion (90.48), highest defect count (8) and largest schedule variance (+340 minutes) — while Atlas (93.68) and Birch (94.67) both sit within 1.54 percentage points of the overall 93.13. The recommended action is therefore narrow: examine Cedar's weekly records and the process behind them first, and leave Atlas and Birch practice unchanged as the reference point. Because the data covers only six weeks and three teams and carries no information on causes, staffing, order type or rework, this is a prioritisation for investigation rather than a finding about why Cedar differs.

## Overall findings

| Metric | Value |
|---|---|
| Records | 18 |
| Work orders | 233 |
| Completed orders | 217 |
| Defects | 18 |
| Planned minutes | 14985 |
| Actual minutes | 15440 |
| Completion | 93.13 |
| Minutes per completed order | 71.15 |
| Schedule variance | 455 |

Across the full dataset, 93.13 percent of work orders were completed, at 71.15 minutes per completed order, with 455 more actual minutes than planned minutes and 18 defects recorded.

## Per-team findings

| Team | Work orders | Completed | Completion | Defects | Planned min | Actual min | Min/completed | Variance |
|---|---|---|---|---|---|---|---|---|
| Atlas | 95 | 89 | 93.68 | 7 | 5700 | 5780 | 64.94 | 80 |
| Birch | 75 | 71 | 94.67 | 3 | 4875 | 4910 | 69.15 | 35 |
| Cedar | 63 | 57 | 90.48 | 8 | 4410 | 4750 | 83.33 | 340 |

**Completion.** Birch has the highest completion rate at 94.67, Atlas is second at 93.68, and Cedar is lowest at 90.48 — 2.65 percentage points below the overall 93.13 and 4.19 points below Birch. Cedar also has the smallest order book (63 work orders) and the fewest completions (57).

**Defects.** The 18 defects are spread 7 (Atlas), 3 (Birch) and 8 (Cedar). Cedar records the most defects on the fewest work orders, while Birch records the fewest defects on 75 work orders. Atlas's 7 defects sit between the two on a 95-order book. No team records zero defects at team level.

**Schedule variance.** Every team ran over its planned minutes: Atlas by 80, Birch by 35 and Cedar by 340. Cedar alone accounts for 340 of the 455 total variance minutes, with the remaining 115 being Atlas's 80 plus Birch's 35. Cedar also carries the highest minutes per completed order at 83.33, against 64.94 for Atlas and 69.15 for Birch, while Atlas has the lowest despite the largest order book.

## Method

The sole factual input is `input/operations.csv`. Integer totals for each team and for the dataset as a whole are exact sums of the corresponding weekly columns in that file; every other figure is derived with these three formulas, applied to the summed integers and rounded once to two decimal places:

- **Completion percent** = completed orders ÷ work orders × 100
- **Minutes per completed order** = actual minutes ÷ completed orders
- **Schedule variance (minutes)** = actual minutes − planned minutes

`completion_percent` and `minutes_per_completed_order` are reported to exactly two decimal places; minutes and order counts are whole numbers. No records were added, no values were interpolated, and no units were converted. Figures in this brief are quoted from the verified `metrics.json` rather than re-derived from rounded values.

## Scope limits

Conclusions apply only to the supplied six-week, three-team dataset. The data supports statements about observed completion, defect counts and planned-versus-actual minutes per team; it holds no information on order content, staffing, sequencing, rework or external conditions, so it cannot establish why any team's figures differ.
