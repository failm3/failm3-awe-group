# Independent verification report — observation-digest-v1

**Mission:** `r2-acquisition-77986c32-d4ae-4755-8c0e-71dc4e23d397`
**Verifier role:** independent verifier — did not author the procedure, did not run it, did not trust any stated number
**Generated:** 2026-11-16T09:08:20Z
**Overall verdict: FAIL** — on delivery and invocation evidence. The arithmetic that exists is independently confirmed **correct**.

---

## 1. Bottom line

Every number in the qualified output is right, and I derived all of them myself from the input bytes:

| Metric | Independently computed |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

The procedure's bytes are the qualified bytes, and its output is byte-identical to the qualified baseline `9cd7f88d…4382` — **there is no divergence to explain**.

But the mission root contains **no `digest.json`, no `digest.md`, and no invocation receipt**. The fixed-args final invocation never ran; the executor reported itself blocked on a shell qualification denial and wrote nothing. So the criteria that depend on those deliverables fail, and the only digest artifacts that exist sit in `probe/` directories that the approved scope explicitly forbids as the final output.

> Correct work, never delivered. The gap is execution and registration, not correctness or qualification.

---

## 2. What I verified, and how

Method: Python 3.14.4 standard library only — `json`, `hashlib`, `collections`, `fractions.Fraction`, `decimal.Decimal`. Read-only. Nothing was taken from the procedure's output, the qualification receipt, or the upstream expectation block as authority.

### 2.1 Inputs re-hashed from disk

| File | SHA-256 | Size | Matches receipt |
| --- | --- | --- | --- |
| `input/pilot.observations.json` | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` | 474 B | yes |
| `procedures/observation-digest-v1.js` | `3b85b93000db6393956b9fa7e428dce431965d8d729432c478819c0f706455d5` | 4753 B | yes, hash **and** size |

The procedure hash and size both match the qualification receipt, so the bytes on disk are demonstrably the bytes that were qualified.

### 2.2 Per-row derivation

```text
North / Harbor : scheduled 12, completed 11, incidents 2
South / Harbor : scheduled  8, completed  8, incidents 1
North / Ridge  : scheduled 10, completed  7, incidents 3
```

Hand check: `12+8+10 = 30` scheduled, `11+8+7 = 26` completed, `2+1+3 = 6` incidents. North: `12+10 = 22` scheduled, `11+7 = 18` completed, `2+3 = 5` incidents. South: `8 / 8 / 1`. Site totals sum exactly to every headline total, and site row counts sum to `row_count`.

---

## 3. Exact-rational percentage check

Percentages were held as `Fraction` throughout — never floating point — and rounded by adding `1/2` in rational arithmetic and flooring. Each was cross-checked against `Decimal(...).quantize('0.01', ROUND_HALF_UP)`.

| Scope | Fraction completed/scheduled | ×100 | Half-up, 2 dp | Decimal HALF_UP | Exact tie? |
| --- | --- | --- | --- | --- | --- |
| Total | `13/15` = 0.8666… | `260/3` | **86.67** | 86.67 | no (3rd digit 6) |
| North | `9/11` = 0.8181… | `900/11` | **81.82** | 81.82 | no (3rd digit 8) |
| South | `1` = 1.0 | `100` | **100.00** | 100.00 | yes — whole number, rounding is a no-op |

### 3.1 Is the documented rounding rule the implemented one?

The procedure documents *"rounded half-up to 2 decimals using integer arithmetic"* and implements `cents = floor((completed*20000 + scheduled) / (2*scheduled))`. I tested that formula against exact `Fraction` half-up over **80,600** cases (`scheduled` 1..400, `completed` 0..scheduled):

- **Mismatches: 0**

And it is genuinely half-up rather than banker's rounding on real ties:

| completed | scheduled | exact | half-up | half-even | procedure |
| --- | --- | --- | --- | --- | --- |
| 1 | 32 | 3.125 | **3.13** | 3.12 | 3.13 |
| 1 | 160 | 0.625 | **0.63** | 0.62 | 0.63 |

The rule as documented is the rule as implemented. None of the three real percentages sits on a tie, so the distinction does not affect this fixture's values — but the rule is sound regardless.

---

## 4. `digest.json` — field by field

Three copies exist and all three are byte-identical: `probe/scratch-run-1/digest.json`, `probe/scratch-run-2/digest.json`, `probe/qualified-probe-digest.json` — each `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382`, 338 bytes, trailing newline present, key order `row_count, scheduled, completed, incidents, completion_percent, sites`.

| Field | Expected | Observed | JSON number | Python type | Pass |
| --- | --- | --- | --- | --- | --- |
| `row_count` | 3 | 3 | yes | int | ✅ |
| `scheduled` | 30 | 30 | yes | int | ✅ |
| `completed` | 26 | 26 | yes | int | ✅ |
| `incidents` | 6 | 6 | yes | int | ✅ |
| `completion_percent` | 86.67 | 86.67 | yes | float | ✅ |

| Site | Rows | Scheduled | Completed | Incidents | % raw token | Pass |
| --- | --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | `81.82` | ✅ |
| South | 1 | 8 | 8 | 1 | `100.00` | ✅ |

`sites` is an object keyed by site name, keyed exactly `North`/`South`, with full totals per site. All fields pass.

**On "2 decimals":** every `completion_percent` token in the raw bytes carries exactly two decimal places, including `100.00`. Parsed as a number, `100.00` is the float `100.0` in both JavaScript and Python — no JSON number can retain a trailing zero after parsing. The requirement is satisfied on the serialized bytes, which is the only place it can be satisfied, and the procedure deliberately hand-builds the JSON to guarantee it.

---

## 5. `digest.md` — field by field

`probe/scratch-run-1/digest.md` and `probe/scratch-run-2/digest.md` are byte-identical (`aeb19a11…41b8`). Every value appears as a rendered row matching the JSON:

- `| row_count | 3 |` ✅
- `| scheduled | 30 |` ✅
- `| completed | 26 |` ✅
- `| incidents | 6 |` ✅
- `| completion_percent | 86.67 |` ✅
- `| North | 2 | 22 | 18 | 5 | 81.82 |` ✅
- `| South | 1 | 8 | 8 | 1 | 100.00 |` ✅

The `## Method` section is present and genuinely reproducible: it states the parse-one-row-per-observation rule, that the four totals are integer sums over all rows, that `completion_percent = completed / scheduled × 100` rounded half-up to 2 decimals with integer arithmetic, and that site totals group on the exact `site` value using the same formula. It also cites the source file and period. Following those four steps reproduces the table exactly — I did exactly that, independently, in §2–3.

---

## 6. Baseline byte comparison

| File | SHA-256 | vs baseline |
| --- | --- | --- |
| Qualified probe baseline | `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382` | — |
| `probe/scratch-run-1/digest.json` | `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382` | **match** |
| `probe/scratch-run-2/digest.json` | `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382` | **match** |
| `probe/qualified-probe-digest.json` | `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382` | **match** |

**Divergence: none.** All three copies are byte-for-byte the baseline, so there is nothing to explain. Independently, my field-by-field and exact-rational recompute agrees with the baseline's contents — so the hash and the arithmetic corroborate each other rather than agreeing by construction.

One file deliberately does **not** match and correctly so: `probe/perturb/out/digest.json` (`8e77294e…e01a`) was produced from a perturbed fixture and must not equal the baseline.

---

## 7. Negative control — is the output actually derived from the input?

The perturbation fixture appends one `East/Probe` row (`scheduled 4, completed 1, incidents 0`). I recomputed from that fixture independently:

- row_count 4, scheduled 34, completed 27, incidents 6, completion_percent **79.41**, new site key `East` created

This matches the procedure's perturbed output exactly, and `79.41` = `27/34 × 100` rounds correctly under half-up. A procedure echoing embedded constants would have kept `86.67` here. The output is a function of the input bytes. This is what makes the baseline match meaningful rather than circular.

---

## 8. Acceptance criteria — explicit pass/fail

### Criterion 1 — capability identified, one bounded acquisition, replanned with a qualified procedure: **PASS**

`observation.json` names the missing capability `observation-digest-v1` and records one bounded acquisition to `procedures/observation-digest-v1.js`; `probe/qualification-receipt.json` records verdict `qualified`. I confirmed the on-disk procedure hashes to `3b85b930…55d5` at 4753 bytes — the receipt's exact hash and size — so the qualified bytes are the installed bytes. This criterion covers acquisition and qualification; it does not require the final run.

### Criterion 2 — invoked with exact qualified bytes and fixed args, durable invocation receipt present: **FAIL**

No invocation receipt exists anywhere in the tree. A `*receipt*` search returns only `probe/qualification-receipt.json`, which is a **qualification** receipt, not an invocation receipt. No `digest.json`/`digest.md` exists in the mission root — the fixed second argument — so the fixed-args invocation demonstrably never occurred. The executor's own report states it stopped before running the procedure and wrote nothing. The probe runs did use the exact qualified bytes, but wrote to scratch directories, not to the fixed second argument.

*To fix:* one run of `node -- procedures/observation-digest-v1.js <abs input> <abs mission root>` with the hash-verified procedure, plus a receipt recording the executable hash, exact fixed args, exit code, and resulting `digest.json` hash.

### Criterion 3 — `digest.json` exact numeric fields and sites object; `digest.md` same values with reproducible method: **FAIL**

The required files do not exist at the mission root, so the criterion cannot be satisfied as delivered. The **content requirement is fully met** by the bytes that do exist: all five values are exact JSON numbers, `completion_percent` tokens carry two decimals, `sites` is keyed by site with totals, and `digest.md` repeats every value with a four-step reproducible method. Content verdict **PASS**; deliverable-location verdict **FAIL**; the criterion as written requires the artifact, so the gate result is **FAIL**.

*Conditional:* running the same qualified bytes once with the fixed args will produce exactly `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382` — content already proven above.

### Criterion 4 — all deliverables registered, bytes pass host verification and Nox QA: **FAIL**

No final deliverables are registered. `observation.json` registers two probe artifacts: `a051cf91…` at sha `9cd7f88d…` (the probe `digest.json`) and `8f29f4da…` at sha `67a49b65…`. I resolved that second hash — it is the SHA-256 of **`probe/qualification-receipt.json` itself**, not a missing digest file. So the registered artifacts are a probe digest and the qualification receipt. Neither is a final deliverable, and no final `digest.md` is registered at all.

---

## 9. Deliverable inventory

Mission root listing: `input/`, `procedures/`, `probe/`, `observation.json`, `.oc-isolated/`.

| Required | Path | Exists |
| --- | --- | --- |
| Final digest JSON | `digest.json` | ❌ |
| Final digest MD | `digest.md` | ❌ |
| Invocation receipt | `invocation-receipt.json` | ❌ |

All digests present in the tree live under `probe/`: `probe/scratch-run-{1,2}/digest.{json,md}` and `probe/perturb/out/digest.{json,md}`. The approved scope states plainly: *"Do not use a probe output directory as the final args output."* These are therefore explicitly disqualified as final deliverables.

---

## 10. Expectation block reconciled

The upstream expectation block claimed exactly the values I independently derived — 3 / 30 / 26 / 6 / 86.67 and the same site totals. **Zero mismatches.**

This is corroboration, not the basis of any finding. I derived every number from the 474 input bytes *before* comparing, and no expectation was adjusted to fit an output nor any output adjusted to fit an expectation. Had they disagreed, this report would record a failure.

---

## 11. Risks addressed

- **"A model-authored observation is not qualification."** I did not accept `observation.json` or the receipt's prose as evidence. I re-hashed the procedure and input from disk and re-derived the arithmetic on an independent code path. The acquisition claim that survives scrutiny is byte-level: hash and size match.
- **"Visible examples do not replace independent arithmetic verification."** Every value was recomputed from the fixture with exact rationals, using a rounding rule validated over 80,600 cases and shown to move correctly under a perturbed fixture. Nothing was accepted because it appeared in an example or an earlier agent's summary.
- **"The candidate's own output is not evidence of its correctness."** Correctness rests on the Fraction/Decimal recompute and the negative control. The baseline byte match then confirms the procedure lands on that independently derived truth.

---

## 12. Scope compliance

Worked only inside the mission directory; wrote only `verification-report.json` and `verification-report.md`. Python standard library only — no packages, no network, no publishing, no deployment, no purchases, no external changes. Inputs read-only and unmodified. I did **not** execute the procedure: verification is read-only arithmetic per the exclusions, and running it would place output in the mission root that this task did not authorize me to create. One transient helper script was written to `/tmp` and deleted immediately; its content is fully reproduced by the commands summarized here.

---

## 13. Conclusion

The `observation-digest-v1` procedure is genuinely qualified and its arithmetic is exactly right on the real fixture, reproducing the qualified baseline hash precisely. The mission nonetheless **fails** its acceptance criteria because the final fixed-args invocation never happened: no `digest.json`, no `digest.md`, no invocation receipt at the mission root, and the only digest artifacts sit in probe directories the scope forbids as final output.

The gap is execution and registration, not correctness or qualification. One run of the hash-verified procedure against its fixed arguments closes criteria 2, 3 and 4, and the expected `digest.json` is `9cd7f88dc7782d713708a0fba8f76400753253e04aec3c333209dd496ae54382` with content independently confirmed in §2–7 above.
