# Nox QA Report: r2-acquisition-233c5afa-cd6a-44ae-a709-37f091915ce9

Approved specification sha256: `a9db0ac2a435b4b7413965d813e8937984e9408e472cc7d999e1037dde3ecc55`

**Determination: NOT COMPLETE.**

This QA was read-only. It recomputed hashes and arithmetic from bytes on disk. It did not run the Node procedure and did not modify any deliverable. The only file it wrote is this report.

## What this QA could not see
- No artifact registry or registered-digest record is reachable from the sandbox. Registered artifact IDs appear only in upstream narrative.
- No invocation receipt exists on the accessible filesystem.
- No host qualification record exists. The only qualification evidence is `observation-digest-v1.observation.json`, which is a model-authored observation.

## Acceptance criteria

| # | Criterion | Result |
| --- | --- | --- |
| 1 | Missing capability identified, one bounded acquisition, replan onto a qualified local procedure | NOT CONFIRMED |
| 2 | Procedure invoked with exact qualified bytes and fixed args; durable receipt present | FAIL |
| 3 | digest.json and digest.md content and method | FAIL (strict), arithmetic correct |
| 4 | Deliverables are registered artifacts that pass host byte verification and QA | NOT CONFIRMED |
| Scope | No out-of-root writes, packages, network, external changes | No violation found, with limits below |

### Criterion 1: NOT CONFIRMED
- `procedures/observation-digest-v1.js` is 4728 bytes, and its recomputed sha256 is `7d340bab553ba2e89be7a07f6c91a1094ed67751976ffdfa801a62d0dec20445`. This equals `executable_sha256` in the observation file.
- The observation file records the capability, the procedure path and the fixed args. They match the spec.
- The spec warns that a model-authored observation is not qualification. I found no host qualification record, and no file in the tree names attempt `7dd43f3f-7dda-4201-87ca-74ff0d5eda72`. So the "actually qualified" and "one acquisition" claims rest on narrative only.

### Criterion 2: FAIL
- A recursive grep for `7dd43f3f-7dda-4201-87ca-74ff0d5eda72` under `/home/nox/.local/share/opencode/worktree/f08b0d` returned no matches.
- Only the `r2-final-acquisition-1794846721863/state/artifacts/<mission>` tree exists under the report directory. It holds no receipt.
- The receipt may live in host storage I cannot reach. I cannot confirm that, so it counts as absent.
- The command sha256 (`b78d6c60…cab9`) appears only in the executor's narrative. I could not check it.

### Criterion 3: FAIL on one literal, all arithmetic correct
Strict JSON parse of `digest.json` (rejects NaN/Infinity and duplicate keys) succeeded.
- Top-level keys: `row_count`, `scheduled`, `completed`, `incidents`, `completion_percent`, `sites`.
- `row_count` 3, `scheduled` 30, `completed` 26 and `incidents` 6 are JSON integers.
- `completion_percent` is 86.67.
- `sites` is keyed `North` and `South`.

I recomputed the North total from the fixture myself: scheduled 12+10 = 22, completed 11+7 = 18, incidents 2+3 = 5, and 18/22 = 81.82%. These match `digest.json`. Global 26/30 = 86.67%. Site sums reconcile to the global totals. I did not recompute South separately beyond reading its single row (8/8/1, 100%). The analyst's verifier covers South.

Failure: the literals in `digest.json` are `86.67`, `81.82` and `100`. South `completion_percent` is `100`, not `100.00`. The value is equal, but the criterion asks for 2 decimals. `digest.md` shows `100.00`. `JSON.stringify` causes this. The approver may rule `100` acceptable. Otherwise the procedure needs a change and a regenerated, newly qualified invocation.

`digest.md` presents the same values: totals, both site rows, Source "Lumen Harbor field pilot", Period "2026-W45", and the input sha256. Its Method section states the row-count, summing, percent and half-up rounding rules. Gaps: the replay command has no script path, and the method does not say sites are grouped by the `site` field.

### Criterion 4: NOT CONFIRMED
Recomputed sha256 of the on-disk bytes:

| File | Bytes | sha256 | Registered digest |
| --- | --- | --- | --- |
| digest.json | 403 | `b6f19e586465d349d74bb1999e5788fb72d502d46dcba8b320ad84f3d0cdab46` | not available (executor ID `8a2ae168-f043-4ca8-9a1f-33c15a7374a9`) |
| digest.md | 921 | `291f2efbd827b5c1f5a5334025e1162eafd1829cd350ddc1d9c67c8b71a4edd1` | not available (executor ID `11e97a9a-0fdf-4c4d-993e-6fb9ed3e2087`) |
| procedures/observation-digest-v1.js | 4728 | `7d340bab553ba2e89be7a07f6c91a1094ed67751976ffdfa801a62d0dec20445` | matches observation file |
| input/pilot.observations.json | 474 | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` | matches required fixture hash |
| verification-report.md | 6184 | `84f77374c49f332479353518da4dce7cc290879b8b6e362a19d738c34a710615` | not available (analyst ID `1c2e7845-aa66-40f7-870e-c6117e8aaa3a`) |
| verification/verification-result.json | 6450 | `508566cf7f36a24ea372dee6a2a0015a931d8b59e015f4dbd08dfb93318c5938` | not available |
| verification/verify_digest.py | 7168 | `3791a65a68e3df9b753eb1ec8ba2c47a42f462bc81805c1fa65887687a1f112d` | not available |

- The recomputed `digest.json` and `digest.md` hashes equal the values the analyst reported. That shows only that the files did not change between the analyst's check and this one. It does not match them to registered digests.
- `qualification/crosscheck.expected.json` and `qualification/observation-digest-probe.json` are byte-identical (`68c720e7…60b1`). That hash equals the probe artifact sha in the observation file.
- The executor said `save_artifact` rewrote the digest files after the procedure ran. So I cannot show the on-disk bytes equal the procedure's raw output. Confirming that needs the receipt or a host re-run.

### Scope compliance
- The sandbox tree contains only the mission artifact root. All 10 files found are inside it, and the outputs are at the root, not in a probe directory.
- Fixture and procedure hashes match their expected values, so neither was edited.
- Node built-ins only (`fs`, `path`, `crypto`) in the procedure source. No `require` of other modules, network primitives, `child_process` or `eval`. I checked this by reading the source.
- No-network, no-packages and no-external-changes claims for the executor and analyst sessions rest on their own reports and the source. I did not see a command log, so those are not independently confirmed.
- This QA ran only read-only commands plus saving this report.

## Final determination
**NOT COMPLETE.** Blocking items:
1. Criterion 2: no durable invocation receipt for attempt `7dd43f3f-7dda-4201-87ca-74ff0d5eda72`.
2. Criterion 3: South `completion_percent` is serialized as `100`. The approver must rule it acceptable, or the procedure must be fixed and re-qualified.
3. Criteria 1 and 4: need the host qualification record and the registered artifact digests to compare against the recomputed hashes above.

Arithmetic is correct throughout.
