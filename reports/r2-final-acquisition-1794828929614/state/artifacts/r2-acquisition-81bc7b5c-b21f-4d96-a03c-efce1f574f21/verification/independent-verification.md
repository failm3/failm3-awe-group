# Independent verification report — observation digest

- **Mission:** `r2-acquisition-81bc7b5c-b21f-4d96-a03c-efce1f574f21`
- **Verified against:** approved spec sha256 `311538e4…68fb6`
- **Verifier method:** hand-worked exact arithmetic read directly from the fixture bytes
- **Acquisition skill invoked:** **no** — this is verification, not qualification
- **Overall verdict:** **PASS**, with two documentation/representational deficiencies that change no number

---

## 1. What was verified, and how

I read three files as bytes through `file_read`, with no dependence on any upstream
summary:

| File | Bytes observed |
| --- | ---: |
| `input/pilot.observations.json` | 474 |
| `digest.json` | 477 |
| `digest.md` | 1514 |

Sizes match the sizes claimed in `invocation-receipt.json` (477 / 1514).

The independent route is **hand-worked integer and rational arithmetic**. Every
percentage was evaluated by taking the exact integer quotient and remainder of
`numerator × 10000 ÷ denominator`, then applying the half-up decision rule directly:

```
q, r = divmod(numerator * 10000, denominator)
if 2*r >= denominator: q += 1        # half-up on the exact remainder
percent = q / 100                    # rendered to 2 decimals
```

No Node was executed. The procedure's own output was treated as an untrusted claim
and only compared against, never used as an input to, my arithmetic. Where a
truncating implementation would have produced a different answer, I say so
explicitly, because that is the check that distinguishes real half-up rounding from
a coincidentally-similar value.

**Honest limitation:** no shell and no hashing facility were exposed to me this
session, so the three `sha256` values quoted upstream (`412c65c3…` fixture,
`571d8fd2…` digest.json, `cfbdcf29…` digest.md) could **not** be recomputed. They
are recorded as unverified-by-me. Byte sizes and file contents were verified
directly, which is the substitute corroboration I actually have.

---

## 2. Input, as read from the fixture bytes

`source` = `Lumen Harbor field pilot`, `period` = `2026-W45`, three rows:

| # | site | cohort | scheduled | completed | incidents |
| ---: | --- | --- | ---: | ---: | ---: |
| 0 | North | Harbor | 12 | 11 | 2 |
| 1 | South | Harbor | 8 | 8 | 1 |
| 2 | North | Ridge | 10 | 7 | 3 |

---

## 3. Independent recomputation

### Grand totals

| Metric | Work | Value |
| --- | --- | ---: |
| `row_count` | 3 rows present | **3** |
| `scheduled` | 12 + 8 + 10 | **30** |
| `completed` | 11 + 8 + 7 | **26** |
| `incidents` | 2 + 1 + 3 | **6** |
| `completion_percent` | 26/30 × 100 = 260/3 = 86.666… | **86.67** |

Rounding work for the grand total: `260000 = 30 × 8666 + 20`, remainder 20;
`2 × 20 = 40 ≥ 30` so increment → `8667/100` = **86.67**.
A truncating implementation would have produced **86.66**, so this value
*discriminates* half-up from truncation.

### Per-site totals

**North** (rows 0 and 2): `row_count` 2, `scheduled` 12+10 = **22**,
`completed` 11+7 = **18**, `incidents` 2+3 = **5**.
`18/22 × 100 = 900/11 = 81.8181…`; `180000 = 22 × 8181 + 18`, remainder 18,
`2 × 18 = 36 ≥ 22` → increment → **81.82**. Truncation would give 81.81.

**South** (row 1): `row_count` 1, `scheduled` **8**, `completed` **8**,
`incidents` **1**. `8/8 = 1` exactly; `80000 = 8 × 10000 + 0`, remainder 0,
`2 × 0 = 0 < 8` → no increment → **100.00**. Exact, no rounding decision arises.

### A discriminator against the wrong formula

An implementation that averaged the per-site percentages instead of pooling the
integer totals would report `(81.82 + 100.00)/2 = 90.91`. The digest reports
**86.67**, which is the pooled `26/30` form. The correct formula is in use.

---

## 4. Field-by-field comparison — `digest.json`

| Field | Independent | digest.json | Type | Match |
| --- | ---: | ---: | --- | :---: |
| `source` | Lumen Harbor field pilot | Lumen Harbor field pilot | string | ✅ |
| `period` | 2026-W45 | 2026-W45 | string | ✅ |
| `row_count` | 3 | 3 | number | ✅ |
| `scheduled` | 30 | 30 | number | ✅ |
| `completed` | 26 | 26 | number | ✅ |
| `incidents` | 6 | 6 | number | ✅ |
| `completion_percent` | 86.67 | 86.67 | number | ✅ |
| `sites.North.row_count` | 2 | 2 | number | ✅ |
| `sites.North.scheduled` | 22 | 22 | number | ✅ |
| `sites.North.completed` | 18 | 18 | number | ✅ |
| `sites.North.incidents` | 5 | 5 | number | ✅ |
| `sites.North.completion_percent` | 81.82 | 81.82 | number | ✅ |
| `sites.South.row_count` | 1 | 1 | number | ✅ |
| `sites.South.scheduled` | 8 | 8 | number | ✅ |
| `sites.South.completed` | 8 | 8 | number | ✅ |
| `sites.South.incidents` | 1 | 1 | number | ✅ |
| `sites.South.completion_percent` | 100.00 | 100 | number | ✅ (see D2) |

**17 of 17 fields match.** No string-encoded numerics anywhere; `sites` is a JSON
object, not an array.

## 5. Field-by-field comparison — `digest.md` vs `digest.json`

| Field | digest.json | digest.md | Match |
| --- | ---: | ---: | :---: |
| source | Lumen Harbor field pilot | Lumen Harbor field pilot | ✅ |
| period | 2026-W45 | 2026-W45 | ✅ |
| row_count | 3 | 3 | ✅ |
| scheduled | 30 | 30 | ✅ |
| completed | 26 | 26 | ✅ |
| incidents | 6 | 6 | ✅ |
| completion_percent | 86.67 | 86.67 | ✅ |
| North row_count / sched / comp / inc | 2 / 22 / 18 / 5 | 2 / 22 / 18 / 5 | ✅ |
| North completion_percent | 81.82 | 81.82 | ✅ |
| South row_count / sched / comp / inc | 1 / 8 / 8 / 1 | 1 / 8 / 8 / 1 | ✅ |
| South completion_percent | 100 | 100.00 | ✅ numerically (D2) |
| documented cross-check sums | 30 / 26 / 6 / 3 | 30 / 26 / 6 / 3 | ✅ |

**No divergence in any value.** The only difference is lexical: `100` in JSON vs
`100.00` in Markdown — the same number.

---

## 6. Typing and formatting checks

| Check | Result |
| --- | :---: |
| `row_count` / `scheduled` / `completed` / `incidents` are JSON numbers, not strings | ✅ |
| `completion_percent` is a JSON number, not a string | ✅ |
| Grand `completion_percent` rendered with exactly 2 decimals (`86.67`) | ✅ |
| Not `86.7` | ✅ |
| Not `86.666666…` | ✅ |
| Rounding is half-up, not truncation (86.67≠86.66, 81.82≠81.81) | ✅ |
| All per-site totals numeric | ✅ |
| `sites` is an object keyed by site name | ✅ |
| `sites.South.completion_percent` lexically 2dp in JSON | ❌ — `100` (D2) |

---

## 7. Site-to-grand-total reconciliation

| Metric | Σ sites | Grand total | Match |
| --- | ---: | ---: | :---: |
| `row_count` | 2 + 1 = 3 | 3 | ✅ |
| `scheduled` | 22 + 8 = 30 | 30 | ✅ |
| `completed` | 18 + 8 = 26 | 26 | ✅ |
| `incidents` | 5 + 1 = 6 | 6 | ✅ |

Site key set is exactly `{North, South}` — matching the distinct sites in the
fixture, with nothing missing and nothing extra — and keys appear in the ascending
order the method section documents.

---

## 8. Reproducibility audit of `digest.md`

| Required element | Present? | Evidence |
| --- | :---: | --- |
| Fixture path | ❌ | Method says only "Read the fixture JSON" (D1) |
| Input shape | ✅ | `observations` must be a non-empty array; `site` non-empty string; `scheduled`/`completed`/`incidents` non-negative integers |
| Formula for `completion_percent` | ✅ | `completed / scheduled * 100` as `round_half_up(completed*10000/scheduled)/100` |
| Rounding rule | ✅ | "round_half_up … rendered with exactly 2 decimal places"; plus the `scheduled = 0 → 0.00` convention |
| Cross-checks | ✅ | per-site sums vs grand totals; written files re-parsed and re-aggregated |

4 of the 5 elements the task names are present. The one gap is the fixture path.

In practice a third party could still reproduce the numbers — the input is a single
`.json` file with a unique name and the procedure takes exactly two fixed positional
arguments — but the document itself does not name the locator, so a reader holding
only `digest.md` would have to infer it. That is the whole of D1.

---

## 9. Deficiencies

**D1 — fixture path not stated in `digest.md`** *(severity: documentation;
PARTIAL on one element; affects no number)*
Add one line naming the absolute path of `input/pilot.observations.json`. All other
method elements are already sufficient.

**D2 — `sites.South.completion_percent` is `100` in JSON, `100.00` in Markdown**
*(severity: cosmetic/representational; affects no number)*
JSON number literals cannot carry a fixed decimal scale, so `100` and `100.00` are
the same value. Forcing `"100.00"` would require a string, which would violate the
separate requirement that `completion_percent` be numeric — the two criteria pull
against each other on exact-integer percentages, and numeric typing is the one the
task states for `completion_percent`. No fix is required; I note it so the trade-off
is explicit rather than silently glossed.

---

## 10. Acceptance-criterion verdicts

| Criterion | Verdict |
| --- | --- |
| `row_count`, `scheduled`, `completed`, `incidents` numeric and exactly equal independent values | **PASS** |
| `completion_percent` numeric, equals 86.67, exactly 2 decimals | **PASS** |
| `completion_percent` is half-up (not truncating, not float-drifting) | **PASS** |
| `sites` object keyed by site with numeric totals | **PASS** |
| Every site's contribution sums to the grand totals | **PASS** |
| `digest.md` states the same values as `digest.json` with no divergence | **PASS** |
| `digest.md` documents a reproducible method (path, shape, formula, rounding) | **PARTIAL** (D1) |
| This verifier modified no deliverable bytes | **PASS** |

**Overall: PASS.** Every computed value is exactly right, correctly typed, correctly
rounded, and reconciles across sites and across the two output formats. The single
shortfall is a one-line documentation omission in `digest.md` (D1) that does not
weaken any number. I have not softened any criterion to reach this verdict: if the
fixture path is held to be mandatory in the Markdown, that criterion is PARTIAL, and
it is recorded as PARTIAL here rather than rounded up to PASS.

---

### Files written by this verification

- `verification/independent-verification.json` — structured report, machine-readable
- `verification/independent-verification.md` — this document

No file under test was opened for writing; `digest.json`, `digest.md`,
`input/pilot.observations.json`, `bin/observation-digest-v1.js` and
`invocation-receipt.json` are untouched.
