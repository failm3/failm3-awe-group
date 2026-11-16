# Six-Week Operations Brief

**Source:** `input/operations.csv` — 18 weekly records (six weeks, W01–W06, three teams)
**Companion data:** `metrics.json`
**Scope:** Atlas, Birch and Cedar only; nothing outside the supplied six-week dataset is used.

---

## Executive recommendation

Direct the next review at **Cedar**. It is the only team that ran over its planned minutes in
every one of the six weeks, and it accounts for 340 of the 455 total overrun minutes — roughly
three-quarters of the whole variance — while posting both the lowest completion rate (90.48%)
and the highest cost per completed order (83.33 minutes). Cedar also records the most defects
(8) against the fewest completed orders (57).

**Birch** is the strongest performer on the two quality measures that this dataset supports:
highest completion (94.67%) and fewest defects (3), at 69.15 minutes per completed order.
**Atlas** is the volume anchor at 95 work orders and 89 completed, with a small net overrun
of 80 minutes, but it carries 7 defects and the least stable weekly minute variance of the
three teams. No team met plan overall; every team's actual minutes exceed planned minutes.

---

## Overall findings

| Metric | Value |
|---|---|
| Records | 18 (six weeks × three teams) |
| Work orders | 233 |
| Completed orders | 217 |
| Not completed | 16 |
| Defects | 18 |
| Planned minutes | 14,985 |
| Actual minutes | 15,440 |
| Schedule variance (actual − planned) | **+455 minutes** |
| Completion rate | **93.13%** |
| Minutes per completed order | **71.15** |

- Of 233 work orders, 217 were completed — 16 short of full completion — for a completion rate
  of 93.13%.
- The three teams consumed 455 more minutes than planned (15,440 actual against 14,985 planned).
- 18 defects were recorded across 217 completed orders.

## Per-team findings

| Team | Work orders | Completed | Defects | Planned min | Actual min | Variance (min) | Completion | Min per completed order |
|---|---|---|---|---|---|---|---|---|
| Atlas | 95 | 89 | 7 | 5,700 | 5,780 | **+80** | 93.68% | 64.94 |
| Birch | 75 | 71 | 3 | 4,875 | 4,910 | **+35** | 94.67% | 69.15 |
| Cedar | 63 | 57 | 8 | 4,410 | 4,750 | **+340** | 90.48% | 83.33 |
| **Overall** | **233** | **217** | **18** | **14,985** | **15,440** | **+455** | **93.13%** | **71.15** |

**Completion.** Atlas completes 93.68% of its work orders (89 of 95, 6 outstanding). Birch leads
at 94.67% (71 of 75, 4 outstanding). Cedar trails at 90.48% (57 of 63, 6 outstanding) — the
largest share of unfinished work relative to its order book.

**Defects.** Birch records the fewest defects, 3, on 71 completed orders. Atlas records 7 on 89
completed orders. Cedar records the most, 8, on the smallest completed base, 57 orders.

**Schedule variance.** All three teams finished over plan, but not proportionally. Cedar's
+340 minutes is by far the largest overrun and is positive in all six weeks (+70, +35, +35,
+50, +80, +70); its worst single week is W05, 920 actual against 840 planned. Birch's +35
minutes is the smallest net overrun and is the product of offsetting weeks: over in W02 (+45),
W05 (+35) and W06 (+30), under in W01 (−20), W03 (−25) and W04 (−30). Atlas's +80 minutes is
likewise mixed: over in W02 (+50), W04 (+60) and W06 (+60), under in W01 (−35), W03 (−30) and
W05 (−25). No team beat plan on the six-week total.

---

## Method

Every figure above is derived from **`input/operations.csv`**, the sole factual input, which was
left unmodified. It contains one row per team per week: 18 data rows after the header
(`week, team, work_orders, completed_orders, defects, planned_minutes, actual_minutes`).

The three formulas used are:

1. **Completion rate** — `completed_orders / work_orders × 100`
   - Atlas: 89 / 95 × 100 = 93.68; Birch: 71 / 75 × 100 = 94.67; Cedar: 57 / 63 × 100 = 90.48; Overall: 217 / 233 × 100 = 93.13
2. **Minutes per completed order** — `actual_minutes / completed_orders`
   - Atlas: 5,780 / 89 = 64.94; Birch: 4,910 / 71 = 69.15; Cedar: 4,750 / 57 = 83.33; Overall: 15,440 / 217 = 71.15
3. **Schedule variance** — `actual_minutes − planned_minutes` (positive means over plan)
   - Atlas: 5,780 − 5,700 = +80; Birch: 4,910 − 4,875 = +35; Cedar: 4,750 − 4,410 = +340; Overall: 15,440 − 14,985 = +455

Procedure and conventions:

- The integer columns (`work_orders`, `completed_orders`, `defects`, `planned_minutes`,
  `actual_minutes`) were summed directly from the 18 raw rows per team. Overall totals are the
  sums of the three team subtotals; they were additionally checked against a column-wise pass
  over all 18 rows, and both passes agree on every integer.
- The two ratio metrics were computed from the integer sums and only then rounded to exactly two
  decimal places. No rounded intermediate was ever fed into a later calculation, and no figure
  was rounded a second time.
- Variance is `actual minus planned` and is reported in the source's own minutes throughout; no
  unit conversion of any kind was performed.
- No records were added, removed, interpolated or estimated. All conclusions are limited to the
  six supplied weeks and the three supplied teams.
- Every figure quoted in this document was cross-checked against the persisted `metrics.json`,
  which reconciles exactly with the raw rows on all counts, minutes and derived values.
