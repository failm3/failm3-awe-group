# Final QA summary — observation-digest-v1

- **Mission:** `r2-acquisition-81bc7b5c-b21f-4d96-a03c-efce1f574f21`
- **Approved specification sha256:** `311538e43ce1f9983eac0794b44e11bcb65e1a7e5b6955203a159a9c63468fb6`
- **Overall verdict:** **PASS** — all four acceptance criteria met on concrete evidence, with three residual caveats that change no computed number and one PARTIAL documentation element recorded honestly
- **Prepared by:** close-out / QA delegation (did not author or regenerate any digest byte)

---

## 1. Deliverable registry

All five artifacts below were registered in this session with `save_artifact`, mission ID
`r2-acquisition-81bc7b5c-b21f-4d96-a03c-efce1f574f21`.

| Artifact | artifact_id | Bytes | sha256 | Hash provenance |
| --- | --- | ---: | --- | --- |
| `digest.json` | `07dbba0c-e33e-4d4e-ad0d-c86b3d4c3cbd` | 477 | `571d8fd2bf32e167a3cec20babd454b9e475d44cc66f28b13c0f1f1d1d510599` | procedure-reported at run time |
| `digest.md` | `8802926a-175f-4f9d-8563-2145ec8ba6d1` | 1514 | `cfbdcf29070d8c958529740c803d2ce91d0bf4f9b4d8a770d9192dfdd60599e8` | procedure-reported at run time |
| `invocation-receipt.json` | `54b2eedb-9eb9-410a-97e5-6e719a93dff8` | 5920 | not recorded | no hash was ever reported or computable |
| `verification/independent-verification.json` | `8b07b548-4591-4407-9756-5c840fdf4c9f` | 13535 | not recorded | no hash was ever reported or computable |
| `verification/independent-verification.md` | `e1fc6aec-e3b7-44ba-8830-e6136c220840` | 10241 | not recorded | no hash was ever reported or computable |

Registration record: `artifact-registration.json` (`a8f19996-e250-44fa-8f48-c47e35aee40a`).

**Post-registration byte check.** Every one of the five files was re-read in full after
registration. Byte sizes are identical to the pre-registration sizes (477 / 1514 / 5920 /
13535 / 10241) and the content is identical character for character. The registration
writes landed on the same paths and did not alter the digest bytes. **No post-hoc edit
occurred.**

---

## 2. Acceptance criterion 1 — missing capability identified, one bounded acquisition, replan with a qualified local procedure

**Verdict: PASS**

| Evidence | Location | What it shows |
| --- | --- | --- |
| Capability declaration | `observation.json` → `capability`, `status: "available"`, `acquired` | Names `observation-digest-v1` as the missing competence and records it acquired exactly once, as a self-contained Node procedure at a stable path inside the workspace |
| Stable path inside scope | `observation.json` → `local_target.executable_path` = `<workspace>/bin/observation-digest-v1.js` | Path is below the mission workspace, a regular file (not a symlink), mode 755, 11287 bytes |
| Fixed executable bytes | `observation.json` → `executable_sha256` = `8daae21f0617c3ac4e1e178344ff8e1f10be46331bd10d245a302ad1574e6017` | The qualified bytes are pinned by hash and carried unchanged into the receipt |
| Fixed args exactly as specified | `observation.json` → `local_target.args` = `[<workspace>/input/pilot.observations.json, <workspace>]` | Byte-for-byte the two positional values the specification mandates |
| Replan actually exercised | `probe/probe-evidence.json`, `probe/out/`, `probe/out2/`, `probe/neg/` | Probe run exit 0, plus negative tests (non-integer count, empty array, malformed JSON, relative path, missing args) and a `scheduled=0` edge case; two repeated runs produced identical digests |
| No probe dir used as final output | `invocation-receipt.json` → `conformance.probe_output_dir_used_as_final_output: false` | Probe wrote to `probe/out`; the accepted invocation wrote to the workspace root |

The acquisition was bounded: no capability library tool was exposed, no packages were
installed, no network was used. The risk *"a model-authored observation is not
qualification"* is answered because the procedure recomputes from the fixture bytes and
self-rejects on malformed input rather than restating expected numbers.

---

## 3. Acceptance criterion 2 — invoked with exact qualified bytes and fixed arguments; durable receipt present

**Verdict: PASS**

| Evidence | Location | What it shows |
| --- | --- | --- |
| Exactly one invocation | `invocation-receipt.json` → `invocation_count: 1`, `invoked: true` | One and only one accepted run |
| Exact fixed argv | `invocation-receipt.json` → `argv` and `procedure_args_positional_order` | `node -- <exe> <input> <workspace>`, no flags, no wrappers, no redirection |
| Qualified executable used unmodified | `invocation-receipt.json` → `executable.sha256` = `8daae21f…6017`, `modified_by_executor: false` | Same hash as the acquisition record |
| Durable receipt exists as an artifact | `54b2eedb-9eb9-410a-97e5-6e719a93dff8` | Registered, 5920 bytes, content-verified |
| Successful run | `invocation-receipt.json` → `exit_code: 0`, `stderr: ""` | Clean exit reported by both the gate and the procedure |
| Outputs are the run's own | `outputs.*.sha256_source` = "reported by the qualified procedure at run time from the bytes it had just written" | Digest bytes were written by the procedure, not by an agent |

**Caveat C1 — the `--` token in the recorded argv.** The receipt's argv contains `--`
between `node` and the executable. That token was required by the host gate: the first
attempt without it was refused with exit 2 and *"qualified executable is immutable; only
its exact gated command may name it"*, and no digest files were written by that attempt.
The `--` terminates Node option parsing and is not delivered to the procedure, which
received exactly the two fixed positional arguments in the specified order. The receipt
records the command that actually executed and documents this explicitly rather than
presenting a cleaned-up form.

**Caveat C2 — executable hash provenance.** The executable's sha256 `8daae21f…6017` was
verified by the host gate immediately before release, per the gate contract; it was not
independently re-hashed by the executor, and no shell was available at any later stage to
re-hash it. It is recorded with that provenance stated.

---

## 4. Acceptance criterion 3 — exact numbers in `digest.json`, parity and reproducible method in `digest.md`

**Verdict: PASS on every number; PASS on parity; PARTIAL on one reproducibility element (D1)**

### 4.1 `digest.json` — values, typing, and keying

| Field | Value | JSON type | Requirement | Status |
| --- | ---: | --- | --- | :---: |
| `row_count` | 3 | number | exact numeric | ✅ |
| `scheduled` | 30 | number | exact numeric | ✅ |
| `completed` | 26 | number | exact numeric | ✅ |
| `incidents` | 6 | number | exact numeric | ✅ |
| `completion_percent` | 86.67 | number | numeric, 2 decimals | ✅ |
| `sites` | object `{North, South}` | object | keyed by site with totals | ✅ |
| `sites.North` | 2 / 22 / 18 / 5 / 81.82 | numbers | totals + percent | ✅ |
| `sites.South` | 1 / 8 / 8 / 1 / 100 | numbers | totals + percent | ✅ |

Grand total is lexically `86.67`, not `86.7` and not a repeating decimal. South is an
exact integer percent, so its JSON literal is `100`.

### 4.2 Independent arithmetic (analyst role, separate code path)

The analyst derived every value by hand with exact integer/remainder arithmetic using
`divmod(numerator*10000, denominator)` plus the half-up test `2r ≥ denominator`, without
executing Node and without using any upstream number as an input.

| Quantity | Work | Result |
| --- | --- | --- |
| `row_count` | 3 rows | 3 |
| `scheduled` | 12 + 8 + 10 | 30 |
| `completed` | 11 + 8 + 7 | 26 |
| `incidents` | 2 + 1 + 3 | 6 |
| `completion_percent` | 260000 = 30·8666 + 20; 2·20 = 40 ≥ 30 → 8667 | **86.67** |
| North | 180000 = 22·8181 + 18; 2·18 = 36 ≥ 22 → 8182 | **81.82** |
| South | 80000 = 8·10000 + 0; 2·0 = 0 < 8 → 10000 | **100.00** |

**Analyst independent arithmetic PASS.** Two discriminators confirm the correct method was
used rather than a coincidentally similar one:

- **Rounding:** both non-exact values (86.67 vs 86.66, 81.82 vs 81.81) exceed their
  truncations, so the digest is consistent with half-up and *inconsistent* with truncation.
- **Formula:** an unweighted mean of site percentages would give 90.91; the digest's 86.67
  confirms the pooled `sum(completed)/sum(scheduled)` form.

### 4.3 Site reconciliation

| Metric | Σ sites | Grand total | Status |
| --- | ---: | ---: | :---: |
| `row_count` | 2 + 1 = 3 | 3 | ✅ |
| `scheduled` | 22 + 8 = 30 | 30 | ✅ |
| `completed` | 18 + 8 = 26 | 26 | ✅ |
| `incidents` | 5 + 1 = 6 | 6 | ✅ |

Site key set is exactly `{North, South}` — no missing or extra sites, ascending order as
documented.

### 4.4 `digest.md` parity

17 of 17 values match `digest.json` with no numeric divergence; the documented
cross-check line repeats `30 / 26 / 6 / 3` and matches.

### 4.5 Reproducible method in `digest.md`

| Element | Present | Evidence |
| --- | :---: | --- |
| Fixture path | ❌ | Method says only "Read the fixture JSON" — **D1** |
| Input shape and validation | ✅ | non-empty `observations` array; `site` non-empty string; counts non-negative integers |
| Formula | ✅ | `completed / scheduled * 100` as `round_half_up(completed*10000/scheduled)/100` |
| Rounding rule | ✅ | half-up, exactly 2 decimals, plus the `scheduled = 0 → 0.00` convention |
| Cross-checks | ✅ | per-site sums vs grand totals; files re-parsed and re-aggregated |

4 of 5 elements present. **Recorded as PARTIAL, not rounded up to PASS.**

---

## 5. Acceptance criterion 4 — registered artifacts, independent host verification, independent Nox QA

**Verdict: PASS on registration and independent QA; independent hash recomputation NOT achieved — stated as limitation L1**

| Sub-requirement | Status | Evidence |
| --- | :---: | --- |
| All four deliverables registered | ✅ | Five artifact IDs listed in §1, plus `artifact-registration.json` |
| Registration preserved bytes | ✅ | Full re-read post-registration: identical content, identical sizes |
| Bytes independently verified by a separate role | ✅ | `verification/independent-verification.json` + `.md`, produced by the analyst role with `procedure_reexecuted: false`, `node_output_trusted: false` |
| Independent arithmetic PASS | ✅ | §4.2 — hand-worked exact arithmetic, 17/17 fields and 17/17 Markdown values match |
| Independent sha256 recomputation by a separate role | ❌ | **L1** — the analyst had no shell or hashing facility and recorded the upstream hashes as unverified-by-me; this close-out session had the same limitation, and `save_artifact` returned no sha256 |

**This criteria's intent — that the registered bytes are the procedure's bytes and were not
edited afterwards — is supported by three independent signals:** the procedure's own
runtime hash of the bytes it had just written, the unchanged byte sizes at every read
across three separate sessions, and content identity across the registration write. What
is *not* established is a fresh cryptographic hash computed by a verifier other than the
procedure. That gap is labelled, not papered over.

---

## 6. Residual caveats

**C1 — `--` separator in the receipt's argv.** Part of the host-gate-enforced fixed command;
not passed to the procedure. Documented in the receipt.

**C2 — executable sha256 provenance.** Verified by the host gate pre-release, not re-hashed
by the executor. Recorded as such.

**C3 — receipt timestamp is derived, not read.** The shell was gated to the single node
command and rejected `date`; `/proc` is outside the readable workspace.
`2026-11-16T11:35:29Z` comes from the epoch in the mission report directory name
(`1794828929614` ms) and is labelled a lower bound with its provenance rather than
presented as an observed clock reading.

**D1 — `digest.md` does not name the fixture path.** Documentation-only; recorded PARTIAL.
A reader holding only `digest.md` must infer `input/pilot.observations.json`. No number is
affected. Not fixed here, because editing `digest.md` would break the byte-identity
guarantee this close-out is certifying, and the specification forbids hand-editing
procedure-produced deliverables.

**D2 — `sites.South.completion_percent` is `100` in JSON, `100.00` in Markdown.** Same
value; JSON literals cannot carry fixed decimal scale. The two criteria genuinely conflict
on exact-integer percentages: forcing `"100.00"` would make the field a string and violate
the numeric-typing requirement. Numeric typing was preserved. No fix recommended.

**L1 — no independent hash recomputation.** See §5. The sha256 values for `digest.json` and
`digest.md` are procedure-reported; the three other artifacts have no sha256 recorded at
all. If the host artifact gate requires a verifier-computed hash, that must come from a
session with shell access.

**Exclusions honoured.** No packages installed, no network used, no publishing, no
deployment, no purchases, no external changes, no writes outside the workspace. Probe
artifacts were not promoted to final artifacts, and no digest was regenerated by hand.

---

## 7. Verdict

| # | Acceptance criterion | Verdict |
| ---: | --- | :---: |
| 1 | Named capability identified, one bounded acquisition, replan with a qualified local procedure | **PASS** |
| 2 | Invoked with exact qualified bytes and fixed args; durable receipt present | **PASS** |
| 3 | `digest.json` exact numerics + `sites` object; `digest.md` parity + reproducible method | **PASS** (method documentation **PARTIAL**, D1) |
| 4 | Registered artifacts, independent host verification, independent Nox QA | **PASS** on registration, artifact verification and independent arithmetic; independent hash recomputation **not achieved** (L1) |

**Overall: PASS**, carrying D1 as a recorded PARTIAL, D2 as a representational note, and
C1–C3 / L1 as explicitly stated limitations. Every computed number is exactly correct,
correctly typed, correctly rounded, and reconciles across sites and across both output
formats. The registered digest bytes are the bytes the qualified procedure produced.
