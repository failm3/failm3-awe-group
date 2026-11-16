# Invocation Receipt — observation-digest-v1

**Mission:** `r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4`
**Capability:** `observation-digest-v1`
**Approved specification:** sha256 `53a586c3e0f25493a61a0bcaa6e1c1c12edff8ec1d86e8c8a5e3e44d6ff727f7`
**Analyst verdict:** **PASS** — zero mismatches, zero hard failures
**Status:** all four acceptance criteria satisfied; nothing unmet

---

## 1. Durable invocation evidence

Recorded from the executor's run receipt and cross-checked against the qualification
record in `observation.json`. These identifiers are the durable evidence that the
qualified procedure — not a copy, not a stand-in — was the thing invoked.

| field | value |
| --- | --- |
| attempt_id | `49ac932a-75dd-41a2-bc33-d7c32ad382aa` |
| qualification_id | `q-r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4` |
| admission_receipt | `r-b75ebe1d-6d8d-4954-b0e5-afe7ffb5c646` |
| executable_path | `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/procedures/observation-digest-v1.js` |
| executable_sha256 | `4e2cecb1a2ffe4700575ffd588f7f9860b26c7209164b521aa0488c9d9461cf6` |
| command_sha256 | `c3750ae468f4520f744c19f0ac12510baec32b02dd1ee9a189827ccf7aeea657` |
| exit_status | `0` |
| invocations of the qualified command | **1** |
| probe artifact | `fcc62a9f-5b48-4cc9-8a19-5e054dd46b98`, sha256 `ebbe07f9b6f4c4d83585757c7836e92352c1867a2370d174251458ffa5778f5a` |

The probe artifact is the qualification evidence that predates the run. It is **not**
the source of any figure in the digest; it is listed so the acquisition chain can be
audited end to end.

### Fixed arguments

Argument 1 — observations fixture:

```
/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/input/pilot.observations.json
```

Argument 2 — artifacts root (the qualified output directory, not a probe directory):

```
/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4
```

Both match the `args` array in `observation.json` exactly, and match the scope
constraint that a probe output directory must not be the final output argument.

---

## 2. Verbatim command

Reproduced exactly as executed, single invocation, no shell chaining and no appended
commands:

```
node -- '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/procedures/observation-digest-v1.js' '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/input/pilot.observations.json' '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4'
```

`--` terminates option parsing so the procedure path cannot be read as a node flag;
the remaining two tokens are the fixed arguments in the qualified order.

---

## 3. Exit status and streams

**Exit status:** `0`

**stdout (verbatim, single line):**

```
{"procedure":"observation-digest-v1","input":"/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/input/pilot.observations.json","input_sha256":"412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766","outputs":[{"path":"/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/digest.json","bytes":563,"sha256":"9cc4baeca60dc291cd863ce370ecc2ee39d66bdb6d2dc4a5694d446df2545c0d"},{"path":"/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/digest.md","bytes":1930,"sha256":"49440aa1ff5911e834fb1a295cf8e074f1d5206857f5515a9984d5b3aa84deb6"}],"row_count":3,"completion_percent":86.67}
```

**stderr:** empty — zero bytes captured.

The procedure's own receipt reports both output paths inside the qualified artifacts
root, confirming the output argument took effect and no probe directory was used.

### Note on one preceding gate refusal

Before the successful invocation, one shell attempt was **refused by the gate**
(`QualificationDeniedError`) because it chained an extra command onto the invocation.
That attempt never executed the procedure — the gate rejected the command rather than
running it — so it does not count as a second invocation and produced no output. It is
recorded here because a receipt that hides a refused attempt is not an honest receipt.
The single qualified command above was executed once, and its `invocation_count` is 1.

---

## 4. Registration record

Registered via `save_artifact` / `file_write` under
`mission_id = r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4`. Each entry below
records the byte-level identity **as observed at registration time** and the analyst
verdict covering that artifact.

| artifact | artifact_id | path (relative to artifacts root) | bytes | sha256 | analyst verdict |
| --- | --- | --- | --- | --- | --- |
| `digest.json` | `04d3abc0-ac44-45a0-8848-77d2207ec644` | `digest.json` | 563 | `9cc4baeca60dc291cd863ce370ecc2ee39d66bdb6d2dc4a5694d446df2545c0d` | PASS — all five top-level fields and all five fields × two sites match the independent recomputation; site key set derived from the raw fixture is identical; no duplicate keys |
| `digest.md` | `bafa42b0-87e2-4537-9567-7d47262e6ec8` | `digest.md` | 1930 | `49440aa1ff5911e834fb1a295cf8e074f1d5206857f5515a9984d5b3aa84deb6` | PASS — 20/20 checks pass; overall table, both site rows and TOTAL row carry the same values as `digest.json`; method section states the absolute input path, formula, half-up rounding to 2 dp, `scheduled==0` guard, and the exact qualified invocation |
| `verification.json` | `0f0b75a8-93d0-46fa-8c28-29a0bf8a4fe2` | `verification.json` | 12537 | `665501f4…` (prefix as reported by the analyst; full digest recorded there) | PASS — the independent verification record itself; `mismatches: []`, `hard_failures: []`, `verdict: "PASS"` |
| `invocation-receipt.md` | *(this file — id assigned by the registration layer at write time; see the delegation summary)* | `invocation-receipt.md` | *(self-referential — see below)* | *(not computed in this step)* | this document — durable evidence, not a verified numeric deliverable |

### How the byte identity was established

At registration time each file was re-read from disk and its content and byte count
compared against the prior on-disk state. All three numeric deliverables were
**byte-identical**: 563 bytes, 1930 bytes and 12537 bytes respectively, unchanged from
the sizes the analyst recorded and returned by the procedure's own stdout receipt. So the
bytes now registered are the same bytes that passed independent recomputation —
registration did not alter, reorder or reformat anything.

Three limits are stated rather than papered over:

- The `sha256` values for the two digest files are **carried consistently** from the
  executor's run receipt and from the analyst's verification, which recomputed them
  independently; the two sources agree. The writer of this receipt had no hashing
  facility available in this step, so those digests were confirmed by that agreement plus
  content-and-size identity, not by a third independent hash computation.
- `verification.json`'s digest is given as the prefix `665501f4…` because that is all the
  analyst's report preserves; the full value is recorded in `verification.json` itself and
  in the analyst's artifact record. It is not reconstructed here by guesswork.
- This document deliberately states **no byte count, digest or artifact id for itself**.
  Any such figure written into the file is falsified by the act of writing it, and an
  earlier draft of this document did exactly that — it cited a self artifact_id that the
  next rewrite invalidated. Rather than repeat the error, the identity of
  `invocation-receipt.md` is reported in the delegation summary for this step, where it
  describes the final bytes on disk.

---

## 5. Verified values

Copied from the analyst's independent computation — a python3 standard-library
reimplementation reading the raw 474-byte fixture, separate from the Node procedure.
They are not read off `digest.json` by this step.

Input SHA-256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` (474 bytes)

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

Per-site rows sum exactly to the top-level totals. `86.67` comes from
`100*26/30 = 86.666…` and `81.82` from `100*18/22 = 81.818…`; neither is a rounding tie,
so half-up versus half-even cannot diverge on this fixture. `South` renders as `100` in
JSON and `100.00` in the markdown — JSON numbers cannot carry trailing zeros; the value
is exact and the two files agree.

---

## 6. Acceptance criteria — criterion by criterion

| # | criterion | satisfied by |
| --- | --- | --- |
| 1 | Head identifies the missing named capability, performs one bounded acquisition, replans with an actually qualified local procedure | `observation.json` records `capability: observation-digest-v1`, `status: available`, `acquired: procedures/observation-digest-v1.js`, and the `local_target` with its executable path, `executable_sha256 4e2cecb1…` and fixed args. Qualification is evidenced by probe artifact `fcc62a9f-5b48-4cc9-8a19-5e054dd46b98` (sha256 `ebbe07f9…`) and the qualification/admission pair `q-r2-acquisition-…` / `r-b75ebe1d-…` |
| 2 | The acquired procedure is invoked with its exact qualified executable bytes and fixed arguments; a durable invocation receipt is present | Sections 1–3 of this document: attempt `49ac932a-…`, `executable_sha256 4e2cecb1…`, `command_sha256 c3750ae468f4520f744c19f0ac12510baec32b02dd1ee9a189827ccf7aeea657`, the verbatim command, exit `0`, full stdout and empty stderr, with both outputs landing in the qualified root |
| 3 | `digest.json` has exact numeric row_count, scheduled, completed, incidents, completion_percent (2 decimals) and a sites object keyed by site with totals; `digest.md` presents the same values with a reproducible method | `digest.json` (artifact `04d3abc0-…`, 563 bytes) and `digest.md` (artifact `bafa42b0-…`, 1930 bytes); analyst verdict PASS on both, including the site key set derived independently from the fixture and the method section in the markdown |
| 4 | All deliverables are registered artifacts whose bytes pass independent host verification and independent Nox QA | The registration table in section 4, plus `verification.json` (artifact `0f0b75a8-…`, 12537 bytes) recording `verdict: "PASS"`, `mismatches: []`, `hard_failures: []` from a separate python3 implementation |

**No acceptance criterion is unmet.** The analyst verdict is PASS, so no criterion
required the failure path in this task.

---

## 7. Scope and exclusions

- Every deliverable lives inside the artifacts root
  `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4`.
- `digest.json` and `digest.md` were **not edited, reformatted or recomputed**. The
  procedure was **not re-invoked**. No value was adjusted by hand.
- No packages installed, no network used, nothing published, deployed or purchased, no
  external changes.
- No figure in this receipt derives from the probe run or from expectation; the only
  figures are those the analyst's independent recomputation produced, corroborated by
  the procedure's own stdout receipt.

---

## 8. Closing statement

The single qualified invocation of `observation-digest-v1` exited `0` with empty
stderr and wrote `digest.json` (563 bytes) and `digest.md` (1930 bytes) into the
qualified artifacts root. An independent python3 recomputation from the raw 474-byte
fixture agreed with every numeric field, both site rows, the site key set and the input
digest — verdict **PASS**, zero mismatches. All deliverables are registered artifacts
with recorded byte-level identity. All four acceptance criteria are satisfied; none is
unmet.
