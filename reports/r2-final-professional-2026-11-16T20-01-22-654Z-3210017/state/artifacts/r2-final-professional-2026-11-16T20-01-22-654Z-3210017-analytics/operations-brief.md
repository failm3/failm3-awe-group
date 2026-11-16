# Operations Brief — Six-Week, Three-Team Review

**Scope:** one six-week operating window, three teams (Atlas, Birch, Cedar), 18 weekly records.
**Source:** `input/operations.csv` only.

## Executive Recommendation

Overall delivery is close to plan: 217 of 233 work orders completed (93.13%), 18 defects, and +455 minutes of schedule variance against 14,985 planned minutes. The exposure is not spread evenly — it is concentrated in one team. Management attention for the next three-team six-week operation should be allocated accordingly:

1. **Make Cedar the single focus of the operating cadence.** Cedar carries the lowest completion (90.48%), the highest schedule overrun (340 minutes) and the highest defect count (8). Give Cedar a standing weekly review of its own planned-versus-actual minutes (4,410 planned against 4,750 actual) and a weekly defect triage of its 8 logged defects, rather than a review shared across all three teams.
2. **Use Birch as the reference operating pattern.** Birch holds the highest completion (94.67%) with only 3 defects and the smallest overrun (35 minutes). Have Cedar's weekly review work against Birch's practice, and avoid adding new process to Birch.
3. **Use Atlas as the throughput reference, not the variance target.** Atlas is mid-pack on completion (93.68%) and defects (7) with 80 minutes of overrun, but has the tightest minutes per completed order at 64.94 — the best observed rate in this dataset. Atlas's cycle discipline is the model for order-level pace; its defect count still warrants inclusion in the defect review.
4. **Leave the plan itself unchanged for the next cycle.** With 455 minutes of variance across 233 work orders, the planning baseline is not the observed problem. The observed problem is Cedar's execution against that baseline.

## Overall Findings

| Metric | Value |
| --- | --- |
| Records (weekly rows) | 18 |
| Work orders | 233 |
| Completed orders | 217 |
| Completion | 93.13% |
| Defects | 18 |
| Planned minutes | 14,985 |
| Actual minutes | 15,440 |
| Minutes per completed order | 71.15 |
| Schedule variance (minutes) | +455 |

Across the full six weeks and all three teams, execution ran modestly over the planned baseline: 14,985 planned minutes became 15,440 actual minutes, a variance of +455 minutes, while 217 of 233 work orders were completed and 18 defects were logged. The overall rate of 71.15 minutes per completed order is a blended figure that sits between the team extremes; it does not describe any single team's performance.

## Per-Team Findings

| Team | Work orders | Completed | Completion | Defects | Planned min | Actual min | Min / completed order | Schedule variance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Atlas | 95 | 89 | 93.68% | 7 | 5,700 | 5,780 | 64.94 | +80 |
| Birch | 75 | 71 | 94.67% | 3 | 4,875 | 4,910 | 69.15 | +35 |
| Cedar | 63 | 57 | 90.48% | 8 | 4,410 | 4,750 | 83.33 | +340 |

**Cedar — weakest on every outcome measure.** Cedar has the lowest completion at 90.48% (57 of 63 work orders), the highest schedule overrun at 340 minutes (4,410 planned against 4,750 actual) and the highest defect count at 8. Its 83.33 minutes per completed order is the slowest rate recorded, and its variance is the largest of the three teams.

**Birch — best on completion and quality.** Birch has the highest completion at 94.67% (71 of 75 work orders) with only 3 defects and the smallest overrun at 35 minutes (4,875 planned against 4,910 actual). Its 69.15 minutes per completed order is second to Atlas but it converts that pace into the strongest completion and defect outcome.

**Atlas — mid-pack, with the tightest cycle.** Atlas has 93.68% completion (89 of 95 work orders), 7 defects and 80 minutes of overrun (5,700 planned against 5,780 actual) — mid-pack on completion, defects and variance. Its distinguishing figure is the tightest minutes per completed order at 64.94, the lowest of any team, so Atlas delivers at the fastest observed rate while sitting between Birch and Cedar on completion and defects.

The contrast is therefore not "good team versus bad team" across the board: Birch leads on completion and defects, Atlas leads on cycle rate, and Cedar trails on all three outcome measures simultaneously. That combination — slowest rate, lowest completion, most defects and the largest overrun landing on the same team — is what justifies concentrating management attention on Cedar rather than spreading it evenly.

## Method

The sole source for every figure in this brief is `input/operations.csv`, a local file of 18 weekly records (three teams × six weeks) with the columns `week, team, work_orders, completed_orders, defects, planned_minutes, actual_minutes`. No other input was used. The file was read only and remains unchanged.

Integer values — `work_orders`, `completed_orders`, `defects`, `planned_minutes`, `actual_minutes` — were obtained by summing the corresponding CSV column, per team and across all records. The three derived figures use exactly these formulas:

- **Completion percent** = completed orders ÷ work orders × 100
- **Minutes per completed order** = actual minutes ÷ completed orders
- **Schedule variance (minutes)** = actual minutes − planned minutes

A positive schedule variance means actual minutes exceeded planned minutes; the variance is reported in minutes and is not signed twice.

**Units and integrity.** All time values are minutes. No unit conversion was applied — no conversion to hours, currency or any other measure. No records were added, removed, filtered, weighted or transformed: the 18 CSV rows are the complete and only basis for every total and every team figure. Percentages and per-order rates were rounded to two decimal places only at the final step, after the integer sums were confirmed.

**Limits of this document.** Every statement here is bounded by these 18 weekly records from this six-week window for these three teams. The brief describes observed completion, defects, planned and actual minutes and their variance only. It draws no comparison with other organisations or benchmarks, states no targets or thresholds, does not attribute Cedar's results to a cause, and makes no forecast for any future period.
