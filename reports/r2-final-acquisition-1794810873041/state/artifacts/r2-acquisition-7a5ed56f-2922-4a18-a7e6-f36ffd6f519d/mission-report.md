# Mission report — r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d

**Title:** Unknown observation-digest mission
**Objective:** Acquire and actually use the new observation-digest-v1 competence to produce an exact operational digest from the supplied observations.
**Approved specification sha256:** `38749657649bc8c09508bca77cab6f8cfee2a41c9880bc0ad08a3e19d0efbeef`
**Scope root (`<root>`):** `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794810873041/state/artifacts/r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d`

This report is documentary. It adds no new measurements of its own beyond reading the files below, states no value that is not present in a registered artifact, and alters no existing deliverable.

---

## 1. Workflow narrative

### 1.1 Capability identification

The head identified that no registered tool and no existing local procedure provided **observation-digest-v1**. The gap is recorded in the acquisition artifact `observation.json` (field `capability`: `observation-digest-v1`, `status`: `available` after acquisition, with `detail` recording that the capability was absent and that no network or package source was used to obtain it). The required behaviour, taken from the specification: independently read the JSON observation fixture, compute exact row/site totals and a completion percentage, and persist `digest.json` and `digest.md`.

### 1.2 One bounded acquisition

A single bounded acquisition was performed and replanned into a qualified local procedure:

| Item | Value (from registered artifacts) |
| --- | --- |
| Attempt id | `ef05d5a7-86bd-4978-b834-152c37b98f88` |
| Qualification id | `q-r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d` |
| Admission id | `2a66b6a5-a4db-4dc8-b3b2-ef837c4f122b` |
| Upstream receipt id | `r-d99ecf95-f1a7-4da4-b719-c89462d3a5b5` |
| Procedure | `observation-digest-v1` (Node standard library only, dependency-free) |
| Stable source path | `<root>/bin/observation-digest-v1.js` |
| Executable bytes | `8837` |
| Executable sha256 | `a2fee381effeb02550470b381804b096c59237f84df69e3f8601cd39c4d871e0` |
| Fixed args | `[<root>/input/pilot.observations.json, <root>]` |

The procedure source lives at a stable path below the scope root, as the specification requires. `observation.json` records that the source computes totals with integer/rational arithmetic only and that it produced byte-identical digest files on a repeat run into a throwaway directory during acquisition.

**Caveat carried forward, not resolved:** `observation.json` itself records that the source *was executed as a probe during acquisition* into `probe-capability-check/`, which the task asked to avoid. The specification's own risk line — *"A model-authored observation is not qualification"* — is why the acquisition record is treated as evidence only in this report, and why the values below are substantiated by the independent recomputation in §4 rather than by the acquisition narrative.

### 1.3 Gated fixed-argument invocation

The qualified procedure was invoked **once**, with `invocation_count: 1` in the receipt, using the exact qualified executable bytes and the exact fixed arguments from the specification:

```
node -- '<root>/bin/observation-digest-v1.js' '<root>/input/pilot.observations.json' '<root>'
```

- `arguments_match_qualified_fixed_args`: `true`
- `output_root_is_final_root_not_probe`: `true` — `args[1]` is the final root; neither the receipt arguments nor the procedure's own stdout contain `probe`
- `exit_code`: `0`; `stderr`: `""` (empty)
- `wrapper_flags_redirections_env_overrides`: `none`
- `cwd`: `<root>`
- `input_sha256`: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` (`input/pilot.observations.json`, 474 bytes), computed by the procedure over the bytes it actually read at runtime

The durable invocation receipt is `<root>/receipt.json` (§5).

The executor recorded that the host shell accepted only this exact fixed node command and refused every other shell command in that delegation (`QualificationDeniedError`), which is why the receipt carries no measured output-file hashes; the executor left them `null` rather than guessing. The verifier later measured them (see §4.3) but did not edit the receipt.

### 1.4 Independent verification

An independent verification pass recomputed everything from the fixture using three mechanisms that share no code with `observation-digest-v1.js`: (1) `python3` `json` + `decimal` with `ROUND_HALF_UP`; (2) an `awk` text scan of the fixture with no JSON parser, using integer half-up arithmetic; (3) byte-level reconstruction of `digest.json` from the fixture in an independent implementation, compared by sha256. Outcome, quoted from `verification-report.md` §9: **PASS**. Details in §6 below.

---

## 2. Reproducible digest method

The method is recorded verbatim in `digest.md` under **"## Method (reproducible)"**, steps 1–7. Its operative rule, quoted from that file:

> `completion_percent` = `completed / scheduled * 100`, computed in exact integer arithmetic as hundredths: `q = (completed * 10000) / scheduled` with remainder `r`; if `r * 2 >= scheduled` then `q = q + 1` (round half up); result = `q / 100`. Division by zero yields `0.00`. No floating-point rounding is involved, so the value is host-independent.

Supporting rules, also from that section: `row_count` is the number of elements of `observations`; `scheduled`, `completed`, `incidents` are exact integer sums over all rows and are also reported per site; `sites` is an object keyed by every distinct `site`, keys sorted by Unicode code point ascending, each entry carrying `rows`, `scheduled`, `completed`, `incidents` and its own `completion_percent` computed by the same rule; outputs are written as `digest.json` (2-space indented JSON, trailing newline) and `digest.md`.

`digest.md` closes with the file's own verification example, quoted exactly:

> Verification example: `26 / 30 * 100` = 86.67 → rounded half up to 2 decimals = 86.67.

---

## 3. Final figures, reproduced exactly as they appear

No value below is rounded, reformatted or restated. Where the two files render a value differently, both renderings are shown.

### 3.1 `digest.json` (exact, 467 bytes)

```json
{
  "source": "Lumen Harbor field pilot",
  "period": "2026-W45",
  "row_count": 3,
  "scheduled": 30,
  "completed": 26,
  "incidents": 6,
  "completion_percent": 86.67,
  "sites": {
    "North": {
      "rows": 2,
      "scheduled": 22,
      "completed": 18,
      "incidents": 5,
      "completion_percent": 81.82
    },
    "South": {
      "rows": 1,
      "scheduled": 8,
      "completed": 8,
      "incidents": 1,
      "completion_percent": 100
    }
  }
}
```

### 3.2 `digest.md` — Totals and By site sections (exact)

```markdown
## Totals

| Metric | Value |
| --- | --- |
| Rows | 3 |
| Scheduled | 30 |
| Completed | 26 |
| Incidents | 6 |
| Completion percent | 86.67 |

## By site

| Site | Rows | Scheduled | Completed | Incidents | Completion percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |
| **All sites** | **3** | **30** | **26** | **6** | **86.67** |
```

`digest.md` also carries the header lines `- Source: Lumen Harbor field pilot`, `- Period: 2026-W45`, and `- Input: `<root>/input/pilot.observations.json``.

### 3.3 Reading of the renderings

- Totals: `row_count` 3, `scheduled` 30, `completed` 26, `incidents` 6, `completion_percent` 86.67 — identical in both files.
- North: rows 2, scheduled 22, completed 18, incidents 5, completion_percent 81.82 — identical in both files.
- South: rows 1, scheduled 8, completed 8, incidents 1; `completion_percent` appears as `100` in `digest.json` and `100.00` in `digest.md`. This is JSON number rendering, not a value difference; the verifier treats it as numerically equal and compliant with "numeric, 2 decimals" (verification report §8 item 4, §4 table row "South completion_percent").
- Site totals sum to the whole: rows 2 + 1 = 3, scheduled 22 + 8 = 30, completed 18 + 8 = 26, incidents 5 + 1 = 6.

---

## 4. Independent verification of the figures

### 4.1 Arithmetic from the fixture (474 bytes, three rows)

| # | site | cohort | scheduled | completed | incidents |
| --- | --- | --- | --- | --- | --- |
| 1 | North | Harbor | 12 | 11 | 2 |
| 2 | South | Harbor | 8 | 8 | 1 |
| 3 | North | Ridge | 10 | 7 | 3 |

- Totals: 12 + 8 + 10 = 30 scheduled; 11 + 8 + 7 = 26 completed; 2 + 1 + 3 = 6 incidents.
- Whole-set percentage: 26 × 10000 = 260000; 260000 / 30 = 8666 remainder 20; 2 × 20 = 40 ≥ 30, so round up to 8667 hundredths = **86.67**.
- North: 22 scheduled, 18 completed, 5 incidents; 180000 / 22 = 8181 remainder 18; 2 × 18 = 36 ≥ 22, so 8182 hundredths = **81.82**.
- South: 8 scheduled, 8 completed, 1 incident; 80000 / 8 = 10000 remainder 0 = **100.00**.

### 4.2 Agreement across mechanisms

The `python3`/`Decimal` run, the `awk` run and the hand arithmetic all produce the values in §3. The byte-level reconstruction of `digest.json` from the fixture in an independent implementation is **byte-identical** to the file on disk (467 bytes, sha256 `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80`). This is the strongest available form of "reproducible method": a second implementation reproduces the artifact exactly. For `digest.md`, the verifier's reconstruction of the header, Totals and By site sections is a strict prefix of the file on disk; the remaining Method section is static text that the verifier read and checked against the arithmetic it performed.

### 4.3 Byte evidence recorded by the verifier

| File | Bytes | sha256 |
| --- | --- | --- |
| `input/pilot.observations.json` | 474 | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` |
| `bin/observation-digest-v1.js` | 8837 | `a2fee381effeb02550470b381804b096c59237f84df69e3f8601cd39c4d871e0` |
| `digest.json` | 467 | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` |
| `digest.md` | 1983 (1981 characters; the single arrow character is 3 bytes in UTF-8) | `d9a8a7d9da08e57ee355b2b043608b32235246c8043c88cd13864df55d93a384` |
| `receipt.json` | 6331 | `fddc92f8ebc917601250e0c0094e46f423d041e33d21da4913b7bf3f9e2acbd4` (a file cannot contain its own hash) |

The final `digest.json` and `digest.md` carry the same sha256 as the acquisition probe copies in `probe-capability-check/`, and the same hashes recorded in `observation.json` for the probe artifacts — the procedure is deterministic and the final deliverables are byte-identical to its output. The verifier also re-hashed the four protected files after its work and found them unchanged.

---

## 5. Artifact registry

### 5.1 Required deliverables

| Artifact | Artifact id | sha256 | Bytes |
| --- | --- | --- | --- |
| `digest.json` | `a117329d-a617-4ed2-9a99-b3ffde615a6f` | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` | 467 |
| `digest.md` | `6b07dfb7-4dab-4ac4-ba52-b75415b56e89` | `d9a8a7d9da08e57ee355b2b043608b32235246c8043c88cd13864df55d93a384` | 1983 |
| `receipt.json` (invocation receipt) | `e8113a32-c368-4694-a822-05715ace8689` | `fddc92f8ebc917601250e0c0094e46f423d041e33d21da4913b7bf3f9e2acbd4` | 6331 |
| `verification-report.md` | `8902adef-2a78-4f46-bbde-0b1beea58861` | **not recorded** — see §7 item 2 | 9508 |

The four sha256 values in the first three rows are the verifier's measurements of the files on disk; the verification report's own digest was not measured by any agent, and this report does not invent one.

### 5.2 Supporting artifacts and inputs

| File | Artifact id | sha256 | Status |
| --- | --- | --- | --- |
| `input/pilot.observations.json` | not recorded | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` | input fixture, read-only |
| `bin/observation-digest-v1.js` | not recorded | `a2fee381effeb02550470b381804b096c59237f84df69e3f8601cd39c4d871e0` | qualified procedure source |
| `observation.json` | not recorded | not recorded | acquisition record |
| `probe-capability-check/digest.json` | `e2a8b042-31b8-4bb6-a913-bd2a7f353d3a` | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` | probe output (not final) |
| `probe-capability-check/digest.md` | `2c0c1d65-52c7-4a8c-b7fc-cd3a0e24d21c` | `d9a8a7d9da08e57ee355b2b043608b32235246c8043c88cd13864df55d93a384` | probe output (not final) |
| `probe-capability-check/receipt.stdout.json`, `receipt.stderr.txt` | `c494cb87-7d8e-4ffe-9e1d-795d2a176e88` (registered probe artifact; exact file mapping not recorded) | `70a55a910647f1499d6823162b6af303ebc4e9341704b92caaf90fbd2f74e721` (registered probe artifact; exact file mapping not recorded) | probe receipt capture |

The gaps in §5.2 are reported as gaps. Every value that appears there is a value an upstream agent recorded; nothing is inferred.

---

## 6. Verification verdict

From `verification-report.md` §9, quoted: **"PASS."** Every recomputed value matches `digest.json` and `digest.md` exactly, and no probe or reference number conflicts with the independent arithmetic.

Per-criterion outcomes as recorded by the verifier:

| # | Acceptance criterion (verbatim) | Verdict | Stated basis |
| --- | --- | --- | --- |
| 1 | Head identifies the missing named capability, performs one bounded acquisition and replans with an actually qualified local procedure. | PASS with caveats (documentary only) | `observation.json` names observation-digest-v1 as missing and records a derived stdlib-only procedure at a stable path below the scope root; the receipt carries `qualification_id` and `admission_id`. The verifier did not independently inspect the qualification record. Caveat: the source was executed as a probe during acquisition, and a second throwaway run occurred, which the task asked to avoid; probe outputs stayed in `probe-capability-check/` and were not used as final output. |
| 2 | The acquired procedure is invoked with its exact qualified executable bytes and fixed arguments; a durable invocation receipt is present. | PASS | Executable sha256 measured and equal to the attested qualification value; arguments exactly equal the specification's fixed args; `receipt.json` exists. The receipt's own gaps are §7 items 1–2. |
| 3 | `digest.json` has exact numeric row_count, scheduled, completed, incidents, completion_percent (2 decimals), and a sites object keyed by site with totals; `digest.md` presents the same values with a reproducible method. | PASS | All values match §4.1; `digest.json` reproduced byte-for-byte by an independent implementation; `digest.md` values identical and carries the 7-step method that reproduces them. |
| 4 | All deliverables are registered artifacts whose bytes pass independent host verification and independent Nox QA. | PASS **for the byte-verification component only** | Bytes verified by sha256 and by independent reconstruction. Whether the registry holds these exact bytes, and the outcome of independent Nox QA, are not observable from this vantage point and are **not asserted** here. |

This report does not upgrade criterion 4. Its QA and registry components remain unverified by any artifact produced in this mission, and are left to the host.

---

## 7. Known gaps and discrepancies (carried forward, not repaired)

1. **`receipt.json` records `sha256: null` for both output files** (`sha256_status: "not-measured"`), because the host shell gate refused every command other than the exact fixed node invocation in that delegation. The values are now measured (§4.3) and recorded in the verification report, but the receipt was not edited. Completing the receipt is a host action.
2. **The verification report's own sha256 is unrecorded.** No agent measured it, and this report will not guess one. Its byte size, 9508, is what the file service reported when this report read it.
3. **`receipt.json` gives `digest.md` `observed_size_bytes`: 1981.** That is the character count; the file is 1983 bytes (one `→` is 3 bytes in UTF-8). Receipt inaccuracy only; no effect on any digest value.
4. **South `completion_percent` is the JSON number `100`, not the text `100.00`**, because JSON numbers do not carry trailing zeros. It is numerically exactly 100.00 and `digest.md` shows `100.00`. A consumer requiring literal `100.00` text inside the JSON would need a string field, which the specification does not request.
5. **Probe execution during acquisition.** `observation.json` states the procedure was executed as a probe (and into a throwaway directory a second time) before qualification, which the task asked to avoid. The final deliverables were produced only by the single gated run described in §1.3, into the final root.
6. **Executor's `save_artifact` concern.** The executor suspected that re-registering `digest.json` and `digest.md` might have overwritten the procedure-written files. The on-disk bytes are identical to the probe outputs and to the independently reconstructed `digest.json`, so any rewrite preserved the content exactly; the receipt's "byte-for-byte" wording is now supported by hashes rather than by the executor's original observation.
7. **Shell behaviour differs between delegations.** The executor reports the shell refused all commands except the fixed node command; the verifier reports read-only `sha256sum`, `stat`, `python3` and `awk` executing normally. Both are recorded as reported.
8. **This report is unhashed at the time of writing.** Its sha256 cannot be computed by a file that contains it, and no shell hashing was available to this delegation. Its artifact id is assigned at registration and is not quoted here.

---

## 8. Scope compliance

Statement of compliance with the approved specification's scope and exclusions, as evidenced by the artifacts:

| Constraint (verbatim from specification.scope, and from the delegation's carried exclusions) | Status | Evidence |
| --- | --- | --- |
| Work only in `<root>` | Complied | Every read and write named in §1–§3 is at or below `<root>`; `receipt.json` `scope_compliance.writes_outside_scope_root`: `"none"`. |
| Read `<root>/input/pilot.observations.json` | Complied | `input_sha256` `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`, `input_fixture_modified`: `false`. |
| Proposed procedure source must have a stable path below `<root>` | Complied | Source at `<root>/bin/observation-digest-v1.js`, sha256 `a2fee381effeb02550470b381804b096c59237f84df69e3f8601cd39c4d871e0`. |
| Fixed args must be exactly `[<root>/input/pilot.observations.json, <root>]` | Complied | Receipt `arguments` equals that list literally; `arguments_match_qualified_fixed_args`: `true`. |
| Do not use a probe output directory as the final args output | Complied | `output_root_is_final_root_not_probe`: `true`; no `probe` substring in receipt arguments or in the procedure's stdout. |
| No packages | Complied | `scope_compliance.packages_installed`: `false`; procedure uses Node standard library only. |
| No network | Complied | `scope_compliance.network_used`: `false`. |
| No publishing, deployment, purchases | Complied | `scope_compliance.publishing_deployment_purchases`: `"none"`. |
| No external changes | Complied | No writes outside the scope root; all existing deliverables read-only in this delegation, and re-hashed unchanged by the verifier. |
| No writes outside the scope root | Complied | As above; `writes_outside_scope_root`: `"none"`. |
| Do not alter existing deliverables | Complied by this report | This report read `digest.json`, `digest.md`, `receipt.json`, `verification-report.md` and the inputs; none was modified. `procedure_rerun`: `false`. |

Declared risks from the specification and how they were addressed:

- *"A model-authored observation is not qualification."* The acquisition narrative was not treated as substantiation. The figures in §3 rest on independent recomputation from the fixture (§4), and criterion 4 is explicitly not asserted beyond the byte-verification component (§6).
- *"Visible examples do not replace independent arithmetic verification."* Three mechanisms with no shared code recomputed every number, and one of them reproduced `digest.json` byte-for-byte.

---

## 9. Report footprint

This report is itself a registered artifact under mission id `r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d`, saved as `mission-report.md` in the scope root. It asserts nothing beyond the four deliverables in §5.1 and the recorded evidence in §4 and §6, and it intentionally leaves the unverifiable components of acceptance criterion 4 — registry byte fidelity and independent Nox QA — open for the host to close.
