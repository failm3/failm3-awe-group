# Independent Verification Report

**Mission:** `r2-acquisition-731c40a0-d758-49c9-b0cd-27edbda49a14`
**Approved spec sha256:** `73aaae13baf18e8611ee4925d7cd3a974fdc6c9cf65b72d262633d93e526d05b`
**Verifier role:** analyst, read-only. `digest.json`, `digest.md` and `observation_digest_v1.mjs` were not modified; the acquisition was not re-run.
**Workspace:** `.../state/artifacts/r2-acquisition-731c40a0-d758-49c9-b0cd-27edbda49a14`

## Verdict

| # | Acceptance criterion | Verdict |
| --- | --- | --- |
| 1 | Missing capability identified, one bounded acquisition, replanned onto a qualified local procedure | **PASS** |
| 2 | Exact qualified executable bytes + fixed args invoked; durable invocation receipt present | **PARTIAL** — bytes and args PASS, receipt **FAIL** |
| 3 | Exact numeric fields, 2-decimal completion_percent, sites object summing to globals, matching digest.md with reproducible method | **PASS** |
| 4 | Registered artifacts passing independent host verification and independent Nox QA | **PARTIAL** — host byte verification PASS, registration/QA **unverifiable here** |

**Overall: PASS on all the data requirements; two gaps are evidentiary, not numeric.** No number in `digest.json` or `digest.md` disagrees with my own reduction of the raw fixture. The open items are a missing invocation receipt (D1) and two facts only the host registry and Nox QA can attest.

## Independently computed numbers

I re-derived everything in Python 3 (`verify/independent_reduction.py`, `verify/verify_deliverables.py`, `verify/check_md_reproducible.py`) reading `input/pilot.observations.json` directly — a different language, a different rounding path (`Decimal` + `ROUND_HALF_UP` on exact rationals), and a different grouping/sort strategy than the produced Node procedure uses, so agreement is evidence rather than a repeat of the same code.

| Metric | Value | Derivation |
| --- | ---: | --- |
| row_count | 3 | `observations.length` |
| scheduled | 30 | 12 + 8 + 10 |
| completed | 26 | 11 + 8 + 7 |
| incidents | 6 | 2 + 1 + 3 |
| completion_percent | 86.67 | 26 / 30 × 100 = 86.6666… → half-up 2dp |

| Site | rows | scheduled | completed | incidents | completion_percent |
| --- | ---: | ---: | ---: | ---: | ---: |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

North = Harbor (12/11/2) + Ridge (10/7/3); 18/22 × 100 = 81.8181… → 81.82. South is a single row; 8/8 × 100 = 100.

Internal consistency, all true: site scheduled sum = 30, site completed sum = 26, site incidents sum = 6, site rows sum = 3 — each equal to its global counterpart.

**Agreement:** `digest.json` equals this reduction on every global field and every per-site field. Zero numeric discrepancies.

## Criterion 3 detail — every sub-check passed

- **JSON typing:** `row_count`=int, `scheduled`=int, `completed`=int, `incidents`=int, `completion_percent`=float. Nothing is a string; `period: "2026-W45"` is the only quoted alphanumeric, as it should be.
- **Two decimals:** the literal JSON token is `86.67`, matching `^-?\d+\.\d{2}$`.
- **Sites:** object with keys `["North","South"]`; sums equal the globals exactly (30 / 26 / 6 / 3).
- **Arithmetic:** 26/30×100 half-up to 2dp = 86.67, identical to the file.
- **digest.md parity:** both per-site rows match the reconstructed rows verbatim — `| North | 2 | 22 | 18 | 5 | 81.82 |` and `| South | 1 | 8 | 8 | 1 | 100.00 |`.
- **Reproducible method:** I re-rendered the expected value-bearing section of `digest.md` from `digest.json` alone, without touching the procedure, and it matched the shipped file **byte-for-byte (452 bytes)**. The `## Method` section documents parse → sum → group → round-half-up → emit, and states the reproduce command `node observation_digest_v1.mjs <observations.json> <output-dir>`.

## Hashes checked

Every value below was recomputed with `sha256sum` by me; all seven re-checks returned `OK`.

| File | bytes | sha256 |
| --- | ---: | --- |
| `input/pilot.observations.json` | 474 | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` |
| `observation_digest_v1.mjs` | 6541 | `e51560a01847a3410c3eedbfe9d261c483e717fe32606220238a0eda757d58db` |
| `observation.json` | 2190 | `c0f7e31e11dacb791641804f55549e5fe3c048d0506f8b28a6c1fea35d2165f9` |
| `digest.json` | 467 | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` |
| `digest.md` | 1290 | `3047ef66747e96b241f462769078c169d8a43c05da38f049a371226e322d64f2` |
| `probe/digest.json` | 467 | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` |
| `probe/digest.md` | 1290 | `3047ef66747e96b241f462769078c169d8a43c05da38f049a371226e322d64f2` |

Cross-checks:

- The declared `local_target.executable_sha256` (`e51560a0…`) **matches the local executable bytes**.
- The two sha256 values declared for the probe artifacts in `observation.json` (`95777cc3…`, `3047ef66…`) **match the probe bytes**.
- The final deliverables are **byte-identical to the probe pair**. For a deterministic procedure whose output is a pure function of the fixture this is expected, so on its own it is reproducibility evidence and not proof of a fresh run. The fresh-run discriminator is timestamps: the probe pair was written in one pass at `07:28:48.410262600`, whereas `digest.json` (`07:31:50.334190800`) and `digest.md` (`07:32:37.461135100`) are **two distinct later writes 47.127 s apart** — inconsistent with a file copy, consistent with the procedure's two sequential `writeFileSync` calls.
- `local_target.args` is exactly `[<workspace>/input/pilot.observations.json, <workspace>]` — element-for-element the spec-mandated list, containing no `probe` component, so no probe output directory was used as the final args output.

## Discrepancies

**D1 — medium — AC2: no durable invocation receipt exists.** A recursive scan of the whole workspace for filenames containing `receipt` or `invoc` returned zero files, and no registry-listing surface is exposed to me. The nearest record, `observation.json → local_target`, **cannot** serve as the receipt: its mtime `07:30:04.428558800` *precedes* both deliverables (`07:31:50.334190800` and `07:32:37.461135100`) by 106 s and 153 s. It is a pre-invocation plan record. What does evidence the final run is the two correctly ordered later writes, byte identity with the deterministic output, and the executable hash match — strong circumstantial evidence, but not the durable receipt the criterion names. Remedy: register a receipt capturing executable path + sha256, both fixed args, exit status and completion time *after* the run.

**D2 — cosmetic — AC3 (advisory, not a failure).** South's per-site `completion_percent` serializes as the JSON number `100`, while `digest.md` renders `100.00`. This does not breach the criterion, which scopes the two-decimal requirement to the global field, and `100` is numerically identical to `100.00`. JSON carries no trailing-zero significance, so this is unavoidable in JSON and correct in the rendered document. No remedy needed; recorded for transparency.

**Unverifiable from here:** registry-side stored bytes of `digest.json`/`digest.md` (no listing tool), and the independent Nox QA verdict (separate authority, no QA result in the workspace). AC4's data half passes completely; its registration and QA halves are host-gated.

## Integrity and tooling note

No deliverable was modified, no acquisition was re-run, nothing was installed, and no network was used. Files I created are confined to `verify/` plus `verification.json` and `verification.md`.

One correction to the executor's narrative: it reported the shell as gated to the single qualified `node` command, which is why it could not self-hash. My session's shell was unrestricted within the workspace — `python3`, `node`, `sha256sum` and `awk` were all available. That earlier limitation was session-specific; every hash and every number in this report was computed directly from the bytes, not taken from the acquisition narrative. Consistent with the spec risk that visible examples and prior probe numbers do not replace independent arithmetic verification, nothing here is copied forward.
