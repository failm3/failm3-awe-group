# Operations Brief — Six Weeks, Three Teams

## Executive recommendation

**Target Cedar first.** Across the six weeks Cedar carries the widest schedule variance at **340 minutes**, the highest time per completed order at **83.33 minutes**, and the lowest completion percent at **90.48%** (57 of 63 work orders). It does this on the smallest work-order base of the three teams, so the problem is not volume — Cedar's actual time exceeded planned time in all six of its weeks, and its 340 minutes account for the largest share of the overall 455-minute variance.

**Treat Atlas as a secondary reliability concern.** Atlas's schedule variance is also positive at **80 minutes**, and it records **7 defects** — second-highest behind Cedar's 8. Atlas is not slow: at **64.94 minutes per completed order** it is the fastest of the three teams, and it completed 89 of 95 work orders (**93.68%**). But it absorbs the most work of any team (95 work orders, 5780 actual minutes), so a positive variance at that scale is worth watching alongside its defect count.

**Birch is the reference point within this dataset.** Highest completion percent at **94.67%** (71 of 75), lowest schedule variance at **35 minutes**, the lowest defect count at 3, and the second-lowest time per completed order at 69.15 minutes. No corrective action is indicated for Birch on these figures.

Proportionate scope of action: remediation effort should concentrate on Cedar's planning accuracy and throughput; Atlas warrants a review of where its defect volume arises. This is a six-week, three-team observation — the data establishes where the shortfall is, not its cause, and no trend beyond these six weeks is asserted.

## Overall findings

- Work orders: **233**
- Completed orders: **217**
- Defects: **18**
- Completion percent: **93.13%**
- Minutes per completed order: **71.15**
- Planned minutes: **14985**
- Actual minutes: **15440**
- Schedule variance: **+455 minutes**

## Per-team findings

### Atlas
- Completion percent: **93.68%**
- Completed orders: **89** of **95** work orders
- Defects: **7**
- Schedule variance: **+80 minutes**

### Birch
- Completion percent: **94.67%**
- Completed orders: **71** of **75** work orders
- Defects: **3**
- Schedule variance: **+35 minutes**

### Cedar
- Completion percent: **90.48%**
- Completed orders: **57** of **63** work orders
- Defects: **8**
- Schedule variance: **+340 minutes**

## Method

**Source.** `input/operations.csv` is the sole factual source for every figure above — 18 data rows covering three teams (Atlas, Birch, Cedar) across six weeks. No other data was used.

**Formulas.**
- Completion percent = completed orders / work orders × 100
- Minutes per completed order = actual minutes / completed orders
- Schedule variance = actual minutes − planned minutes

**Computation notes.** Aggregates are summed from the raw rows, not averaged from pre-rounded values, and rounded to two decimals only at presentation time. Percentages and minutes per order use half-up rounding. Defects are summed per row as recorded. No units were converted and no records were invented — every team figure traces to the six rows for that team, and each total equals the sum of the three team figures.
