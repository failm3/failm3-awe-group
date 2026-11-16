# Operations Brief: Six-Week Performance Analysis

## Executive Recommendation

Prioritize Cedar, which shows the lowest completion rate (90.48%), the highest defect count (8 of 18 total defects), and accounts for 340 of the 455 overall schedule-variance minutes. The data indicates Cedar's performance lags both Atlas and Birch across all measured dimensions within this six-week period.

## Overall Findings

Across the three-team operation:

- **Completion:** 217 of 233 work orders completed (93.13%)
- **Defects:** 18 total
- **Schedule:** 14985 planned minutes versus 15440 actual minutes
- **Schedule variance:** +455 minutes
- **Efficiency:** 71.15 minutes per completed order

## Per-Team Findings

| Team  | Work Orders | Completed | Completion % | Defects | Planned Minutes | Actual Minutes | Schedule Variance | Minutes per Completed |
|-------|-------------|-----------|--------------|---------|-----------------|----------------|-------------------|-----------------------|
| Atlas | 95          | 89        | 93.68        | 7       | 5700            | 5780           | +80               | 64.94                 |
| Birch | 75          | 71        | 94.67        | 3       | 4875            | 4910           | +35               | 69.15                 |
| Cedar | 63          | 57        | 90.48        | 8       | 4410            | 4750           | +340              | 83.33                 |

### Atlas

- Work orders: 95 total, 89 completed (93.68%)
- Defects: 7
- Schedule: 5700 planned minutes, 5780 actual minutes
- Schedule variance: +80 minutes
- Efficiency: 64.94 minutes per completed order

### Birch

- Work orders: 75 total, 71 completed (94.67%)
- Defects: 3
- Schedule: 4875 planned minutes, 4910 actual minutes
- Schedule variance: +35 minutes
- Efficiency: 69.15 minutes per completed order

### Cedar

- Work orders: 63 total, 57 completed (90.48%)
- Defects: 8
- Schedule: 4410 planned minutes, 4750 actual minutes
- Schedule variance: +340 minutes
- Efficiency: 83.33 minutes per completed order

## Method

The sole data source is `input/operations.csv`, which contains 18 records spanning six weeks (W01–W06) across three teams (Atlas, Birch, Cedar). 

**Formulas applied:**

- **Completion percent** = (completed orders ÷ work orders) × 100
- **Minutes per completed order** = actual minutes ÷ completed orders
- **Schedule variance minutes** = actual minutes − planned minutes

All ratios are computed from raw summed integers and rounded to two decimal places. Minutes are reported as minutes with no unit conversion. No records were invented or excluded from the analysis.

## Scope and Limitations

All findings and conclusions are limited to the supplied six-week, three-team dataset. Extrapolation beyond this period or these teams is not supported by the data.
