# Independent verification report: observation-digest-v1

Mission: r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d

`<root>` below means the scope root /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794810873041/state/artifacts/r2-acquisition-7a5ed56f-2922-4a18-a7e6-f36ffd6f519d

## 1. Method and constraints

All checks were read-only. digest.json, digest.md, receipt.json, the procedure source and the input fixture were not modified, the qualified command was not re-run, and nothing was written except this report. Three mechanisms were used, none of which reuse the procedure source or its BigInt path:

1. python3 `json` + `decimal` (ROUND_HALF_UP), computed from `<root>/input/pilot.observations.json`.
2. awk text scan of the fixture (no JSON parser) with explicit integer half-up arithmetic.
3. Byte-level reconstruction of digest.json (and the totals/by-site section of digest.md) from the fixture, compared by sha256 against the files on disk.

The probe numbers from acquisition (3 / 30 / 26 / 6 / 86.67, North 22/18/5 at 81.82, South 8/8/1 at 100) were treated as evidence only and compared at the end.

## 2. Fixture (read directly, 474 bytes)

| # | site | cohort | scheduled | completed | incidents |
| --- | --- | --- | --- | --- | --- |
| 1 | North | Harbor | 12 | 11 | 2 |
| 2 | South | Harbor | 8 | 8 | 1 |
| 3 | North | Ridge | 10 | 7 | 3 |

## 3. Step-by-step independent arithmetic

Totals:
- row_count = 3
- scheduled = 12 + 8 + 10 = 30
- completed = 11 + 8 + 7 = 26
- incidents = 2 + 1 + 3 = 6
- completion_percent: 26 * 10000 = 260000; 260000 / 30 = 8666 remainder 20 (8666 * 30 = 259980); 2 * 20 = 40 >= 30, so round up to 8667 hundredths = **86.67**. Cross-check: 26/30*100 = 86.6666... -> 86.67 (not near a rounding tie, so half-up and half-even agree).

North (rows 1 and 3):
- rows = 2; scheduled = 12 + 10 = 22; completed = 11 + 7 = 18; incidents = 2 + 3 = 5
- completion_percent: 18 * 10000 = 180000; 180000 / 22 = 8181 remainder 18 (8181 * 22 = 179982); 2 * 18 = 36 >= 22, so 8182 hundredths = **81.82**. Cross-check: 18/22*100 = 81.8181... -> 81.82.

South (row 2):
- rows = 1; scheduled = 8; completed = 8; incidents = 1
- completion_percent: 8 * 10000 = 80000; 80000 / 8 = 10000 remainder 0, so 10000 hundredths = **100.00**.

Sites sum to totals: rows 2 + 1 = 3; scheduled 22 + 8 = 30; completed 18 + 8 = 26; incidents 5 + 1 = 6.

The python3 Decimal run and the awk run produced these same values (awk: total q=8667 r=20; North q=8182 r=18; South q=10000 r=0).

## 4. Side-by-side comparison

| Field | Independent | digest.json | digest.md | Result |
| --- | --- | --- | --- | --- |
| row_count | 3 | 3 | 3 | MATCH |
| scheduled | 30 | 30 | 30 | MATCH |
| completed | 26 | 26 | 26 | MATCH |
| incidents | 6 | 6 | 6 | MATCH |
| completion_percent | 86.67 | 86.67 | 86.67 | MATCH |
| North rows/sched/compl/inc | 2/22/18/5 | 2/22/18/5 | 2/22/18/5 | MATCH |
| North completion_percent | 81.82 | 81.82 | 81.82 | MATCH |
| South rows/sched/compl/inc | 1/8/8/1 | 1/8/8/1 | 1/8/8/1 | MATCH |
| South completion_percent | 100.00 | 100 (JSON number) | 100.00 | MATCH (numerically equal) |

Types in digest.json: row_count, scheduled, completed, incidents are JSON integers; completion_percent values are JSON numbers; `sites` is an object keyed by site name (North, South), each with rows, scheduled, completed, incidents, completion_percent.

Probe comparison: every probe figure equals the independent figure. No mismatch.

## 5. Byte-level evidence (measured at verification time)

| File | Bytes | sha256 |
| --- | --- | --- |
| input/pilot.observations.json | 474 | 412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766 |
| bin/observation-digest-v1.js | 8837 | a2fee381effeb02550470b381804b096c59237f84df69e3f8601cd39c4d871e0 |
| digest.json | 467 | 95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80 |
| digest.md | 1983 (1981 characters; the single arrow character is 3 bytes in UTF-8) | d9a8a7d9da08e57ee355b2b043608b32235246c8043c88cd13864df55d93a384 |
| receipt.json | 6331 | fddc92f8ebc917601250e0c0094e46f423d041e33d21da4913b7bf3f9e2acbd4 (as read now; a file cannot contain its own hash) |

- Final digest.json and digest.md have the same sha256 as the acquisition probe copies in probe-capability-check/ and the same hashes recorded in observation.json for the probe artifacts. The procedure is deterministic and the final files are byte-identical to its output.
- digest.json was reconstructed from the fixture by my independent implementation and is **byte-identical** (467 bytes, same sha256). The first attempt differed by 2 bytes only because Python serialised 100.00 as 100.0 where the procedure emits 100; after matching that integer-valued number rendering the files were identical.
- digest.md: my reconstruction of the header, Totals and By site sections is a strict prefix of the file on disk. The remainder is the static Method (reproducible) section and a verification example line, which I checked by reading (steps 1-7 describe exactly the arithmetic used above).

## 6. Invocation check

- receipt.arguments equals the spec fixed args exactly: [`<root>/input/pilot.observations.json`, `<root>`]. The same holds for the arguments echoed in the procedure's own stdout.
- args[1] is the final root; neither the receipt arguments nor the procedure stdout contain 'probe'. No probe directory was used as the final output.
- Executable path equals `<root>/bin/observation-digest-v1.js`. The measured sha256 (a2fee381...71e0) equals the attested qualification value in the receipt, and the file mtime (06:37:18) predates the final outputs (06:40:59), so the source was not altered after qualification.
- command_line begins `node --`, invocation_count = 1, exit_code = 0, stderr empty. The input sha256 in the receipt (412c65c3...3766) equals the measured hash.
- Limit: I can confirm what the receipt records and that its data is consistent with the files on disk. I cannot re-observe the original execution itself or read the host qualification/admission records.

## 7. Acceptance criteria

| # | Criterion | Verdict | Basis |
| --- | --- | --- | --- |
| 1 | Head identifies the missing capability, performs one bounded acquisition, replans with a qualified local procedure | PASS with caveats (documentary only) | observation.json names observation-digest-v1 as missing and records a derived stdlib-only procedure at a stable path below the scope root; the receipt carries qualification_id and admission_id. I did not independently inspect the qualification record. Caveat: observation.json says the source was executed as a probe during acquisition (and a second throwaway run), which the task asked to avoid; probe outputs are confined to probe-capability-check/ and were not used as final output. |
| 2 | Procedure invoked with exact qualified executable bytes and fixed args; durable receipt present | PASS | Executable sha256 measured and equal to attested; args exactly equal the spec; receipt.json exists. The receipt's own gaps are listed in section 8. |
| 3 | digest.json exact numeric fields and sites object; digest.md same values with reproducible method | PASS | All values match section 3. digest.json reproduced byte-for-byte independently. digest.md values identical and contains a 7-step method that reproduces the numbers. See the note on South 100 below. |
| 4 | Deliverables are registered artifacts whose bytes pass independent host verification and independent Nox QA | PASS for the byte-verification component only | Bytes verified by sha256 and reconstruction above. Whether the registry holds these exact bytes, and the outcome of Nox QA, are not observable from here and are not asserted. |

## 8. Discrepancies and caveats

1. The receipt records sha256 for digest.json and digest.md as null / not-measured. They are now measured (section 5) and should be added by the host if the receipt is to be complete. This verification does not change the receipt.
2. The receipt gives digest.md observed_size_bytes as 1981. That is the character count; the file is 1983 bytes. Minor receipt inaccuracy, no effect on the digest values.
3. The executor was concerned that save_artifact might have overwritten the procedure-written files. The on-disk bytes are identical to the probe outputs (same hashes) and digest.json is reproduced independently, so any rewrite preserved the content exactly. Digest bytes are therefore sound, but the receipt's 'byte-for-byte' claim is now supported by hashes rather than the original observation.
4. South completion_percent is the JSON number 100, not the text 100.00, because JSON numbers do not carry trailing zeros. It is numerically exactly 100.00, and digest.md shows 100.00. I treat this as compliant with 'numeric, 2 decimals'; a consumer requiring literal 100.00 text in the JSON would need a string field, which the spec does not ask for.
5. The executor reported that the host shell refused every command except the fixed node command. In this verification session read-only shell commands (sha256sum, stat, python3, awk) executed normally.

## 9. Overall verdict

**PASS.** Every recomputed value matches digest.json and digest.md exactly, and no probe or reference number conflicts with the independent arithmetic. Caveats concern receipt completeness (section 8, items 1 and 2) and the parts of criteria 1 and 4 that cannot be observed from the files (qualification record, registry contents, Nox QA).
