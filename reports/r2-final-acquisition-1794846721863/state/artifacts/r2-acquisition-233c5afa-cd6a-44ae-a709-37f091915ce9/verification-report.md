# Independent verification: observation-digest-v1 output

## Verdict: FAIL (1 mismatch)

Every figure is correct. One formatting requirement is not met. `digest.json` serializes the South `completion_percent` as `100`, not `100.00`.

| Where | digest.json value | Required |
| --- | --- | --- |
| `sites.South.completion_percent` (line 20 of digest.json) | `100` | `100.00` (2 decimals) |

The numeric value is equal (100 == 100.00). The task and acceptance criterion 3 ask for completion_percent serialized to 2 decimals. The literal `100` does not meet that. The cause is in the procedure: `JSON.stringify` writes the number 100 as `100`. `digest.md` shows `100.00` for the same field, so the two files differ in presentation only.

The upstream executor reported this as expected JSON behaviour. I don't accept that as a pass. The spec asks for 2-decimal serialization, and a number written as `100.00` is valid JSON. Whether `100` is acceptable is the approver's decision. Under the stated check, it fails.

## Method (independent of the procedure)
- I did not read the Node source to derive numbers and did not run it. The Python verifier (`verification/verify_digest.py`, stdlib only) works from the fixture bytes.
- Fixture bytes read: 474 bytes, sha256 `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`. This matches the required hash, and the verifier aborts if it doesn't.
- Percent is computed with exact integer arithmetic (half-up on hundredths). A second computation with `Decimal` and `ROUND_HALF_UP` gave identical results.
- digest.json was parsed with literal-preserving hooks, so `100` and `100.00` can be told apart. No numbers are stringified, and all counts are JSON integers.

## Independently computed values
| Scope | rows | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| Global | 3 | 30 | 26 | 6 | 86.67 (2600/30 = 86.666...) |
| North | 2 | 22 | 18 | 5 | 81.82 (81.818...) |
| South | 1 | 8 | 8 | 1 | 100.00 |

## Field-by-field: digest.json
| Field | Computed | digest.json | Result |
| --- | --- | --- | --- |
| row_count | 3 | 3 | PASS |
| scheduled | 30 | 30 | PASS |
| completed | 26 | 26 | PASS |
| incidents | 6 | 6 | PASS |
| completion_percent (value) | 86.67 | 86.67 | PASS |
| completion_percent (2-decimal literal) | 86.67 | 86.67 | PASS |
| top-level keys | the 6 required | the 6 required | PASS |
| sites keys (by site name) | North, South | North, South | PASS |
| sites.North.rows / scheduled / completed / incidents | 2 / 22 / 18 / 5 | 2 / 22 / 18 / 5 | PASS (4 fields) |
| sites.North.completion_percent (value, 2-decimal literal) | 81.82 | 81.82 | PASS |
| sites.South.rows / scheduled / completed / incidents | 1 / 8 / 8 / 1 | 1 / 8 / 8 / 1 | PASS (4 fields) |
| sites.South.completion_percent (value) | 100.00 | 100 | PASS |
| **sites.South.completion_percent (2-decimal literal)** | **100.00** | **100** | **FAIL** |

All counts are JSON integers, with no stringified numbers.

## Field-by-field: digest.md
| Field | Computed | digest.md | Result |
| --- | --- | --- | --- |
| row_count | 3 | 3 | PASS |
| scheduled | 30 | 30 | PASS |
| completed | 26 | 26 | PASS |
| incidents | 6 | 6 | PASS |
| completion_percent | 86.67 | 86.67 | PASS |
| North row (rows/sched/comp/inc/%) | 2/22/18/5/81.82 | 2/22/18/5/81.82 | PASS |
| South row | 1/8/8/1/100.00 | 1/8/8/1/100.00 | PASS |
| Input SHA-256 | 412c65c3...3766 | 412c65c3...3766 | PASS |
| Source | Lumen Harbor field pilot | same | PASS |
| Period | 2026-W45 | same | PASS |

## Reconciliation (digest.json, sites vs global)
| Metric | Sum over sites | Global | Result |
| --- | --- | --- | --- |
| scheduled | 22 + 8 = 30 | 30 | PASS |
| completed | 18 + 8 = 26 | 26 | PASS |
| incidents | 5 + 1 = 6 | 6 | PASS |
| rows vs row_count | 2 + 1 = 3 | 3 | PASS |

The sites object is keyed by site name (`North`, `South`). Per-site percentages are computed from per-site totals. They are not averaged, which would give 90.91 rather than 86.67.

## Can a third party replay the method from digest.md?
Mostly yes. The Method section states these rules:
- Each entry of the `observations` array counts as one row.
- Sums are taken globally and per site.
- `completion_percent = completed / scheduled * 100`, half-up to 2 decimals.
- The input fixture is identified by its SHA-256 in the document.

Gaps, none of which change the verdict:
- Step 4 gives the replay command as `node -- observation-digest-v1.js <input.json> <output-dir>`, with no path to the script.
- The method never says that sites are grouped by the `site` field.
- It does not say that per-site percentages use per-site totals.
- It does not say that a `100` value in JSON is printed as `100` and in the markdown as `100.00`.

A reader can still recompute every value from the fixture and the stated rules. My Python verifier reproduced them without the script.

## Observations outside the pass/fail scope
- Current sha256 of `digest.json` is `b6f19e58...ab46` and of `digest.md` is `291f2efb...edd1`. The procedure file still hashes to the qualified `7d340bab...0445`.
- Upstream says `save_artifact` rewrote both files after the procedure ran. The bytes now on disk are those registered. I could not tell whether they equal the procedure's raw output, and I did not re-run it, per the exclusions.
- I did not check the invocation receipt. It lives outside the artifact root and is a host-gate item.
- `qualification/crosscheck.expected.json` and the probe file hold `100.0`, which is Python's JSON form of the same value. They are not part of the deliverable.

## Remediation (not applied, since digest files are read-only for me)
The procedure would have to emit `100.00` as a raw number literal, for example by building the JSON text with `toFixed(2)` for percent fields. Then the files would need regenerating through the qualified invocation. Alternatively, the approver can rule that `100` is acceptable under criterion 3.

## Artifacts
- `verification-report.md` (this report)
- `verification/verify_digest.py` (verifier, stdlib only, read-only on inputs)
- `verification/verification-result.json` (machine-readable output of the verifier run)
