# Completion Manifest - r2-acquisition-619ad2d8-925d-409a-9d14-65c17b68dfea

**Overall status: PASS with residual caveats.** All four acceptance criteria are supported by registered evidence. Several caveats below must be read with it.

This manifest documents already-registered evidence. No procedure was re-run, no artifact was altered, and no hash was computed by this agent. Every hash and size below is quoted from qa_independent_verification.json (verdict PASS, measured with an ungated shell), from invocation_receipt.json, or from observation.json.

## 1. Registered artifacts

| Artifact | Artifact ID | sha256 | Size (bytes) | Hash provenance |
| --- | --- | --- | --- | --- |
| digest.json | ed814a62-3a2d-4b87-9d1e-7c74d41f81bc | 95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80 | 467 | Measured by QA; equals the probe pin in observation.json |
| digest.md | 4a141baf-12c9-4fb6-9ab1-64a48cb10fe9 | 86a99639d28854a44a83cbc3bbaedb727e5ecf269776fc0eb620d8a7dc3c7cd8 | 1488 | Measured by QA; equals the probe pin in observation.json |
| invocation_receipt.json | 80c625b2-2c0e-412f-bb72-e08c39d9898b | f9ffa2b882d17683e81eea7e467a77939a9934361bfbd5250f3ca1762967a1d6 | 3712 | Measured by QA (self-hash pin; the receipt had no prior expectation) |
| qa_independent_verification.json | 746a6cb7-6581-4d11-9201-c9f007217996 | GAP: full sha256 not available to this manifest. Only the prefix f6222682 was reported. | GAP: see caveat 3 | Not recorded in full upstream |

Supporting pins, not deliverables:
- Procedure `procedures/observation_digest_v1.mjs`: sha256 7d1dd3ca97e4c1cbec9c1399c507d5b9d80aa8fea1b62075ac79219739b779c3. It equals the qualified executable_sha256 in observation.json and the receipt's expected value.
- Input fixture `input/pilot.observations.json`: sha256 412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766, 474 bytes.
- Probe artifacts from the acquisition: feb52242-6525-4158-8a36-a5939df0fd0a (sha256 95777cc3..., the digest.json probe) and 66edbef4-8e3a-4017-a01a-f2701cd92884 (sha256 86a99639..., the digest.md probe).
- Receipt command_sha256: d03cc88f08faad0b8bbcf7771e0309a8c50c394252e826f5a872ed6ab8be4ed2.

## 2. Digest values, cited exactly as found in digest.json

- row_count 3, scheduled 30, completed 26, incidents 6, completion_percent 86.67
- sites.North: rows 2, scheduled 22, completed 18, incidents 5, completion_percent 81.82
- sites.South: rows 1, scheduled 8, completed 8, incidents 1, completion_percent 100 (JSON literal; rendered 100.00 in digest.md)

## 3. Acceptance criteria mapping

**AC1. Missing named capability identified, one bounded acquisition, replan with a qualified local procedure.**
- Satisfied on the evidence in observation.json.
- The capability is named observation-digest-v1, with status available.
- The acquisition is a dependency-free Node ESM procedure at procedures/observation_digest_v1.mjs, using only node:fs and node:path. No packages, network or host change were used.
- The local_target pins runtime node, executable_sha256 7d1dd3ca..., and the two fixed args.
- Bounded probing was confined to the probe/ scratch directory. It covered the supplied fixture, an edge fixture (ties and a zero-scheduled site, giving 8.57) and a bad fixture (non-integer counter rejected with exit 3).
- Probe artifacts feb52242... and 66edbef4... are recorded.
- Limit of this evidence: the upstream agent reported that the shell gate pinned the qualified target to the exact fixed node command. The qualification record itself (qualification_id) was not supplied; see caveat 2.

**AC2. Exact qualified executable bytes invoked with fixed args; durable receipt present.**
- Satisfied.
- invocation_receipt.json (artifact 80c625b2-2c0e-412f-bb72-e08c39d9898b) records invocation_count 1 and exit_code 0.
- Its argv is node, --, the procedure path, the fixture path, then the artifact root as output. The output is not a probe directory.
- The args match the approved fixed args exactly.
- Its stdout is rows=3 scheduled=30 completed=26 incidents=6 completion_percent=86.67, and stderr is empty.
- The procedure sha256 was measured post-run by QA as 7d1dd3ca..., matching both the qualified pin and the receipt expectation. The pre-run check could not be done upstream (caveat 1). Because the procedure is deterministic and clock-free, the matching post-run hash is the evidence that the qualified bytes ran.

**AC3. Exact numeric fields, sites object, reproducible method.**
- Satisfied.
- digest.json holds integer row_count, scheduled, completed and incidents, plus completion_percent 86.67. No field is a string.
- The sites object is keyed North and South, each with rows, scheduled, completed, incidents and completion_percent.
- QA recomputed every figure with three separate implementations (Decimal ROUND_HALF_UP, pure integer arithmetic, awk). It also hand-checked the sums: 12+8+10=30, 11+8+7=26, 2+1+3=6.
- All 15 compared values agree between digest.json and digest.md.
- digest.md contains a six-step Method section plus a cross-check, which QA assessed as reproducible from the fixture alone.
- Note: South completion_percent is the JSON literal 100, not 100.00. QA judged this acceptable (JSON has no fixed-decimal type; the markdown renders 100.00). It is flagged for transparency.

**AC4. Deliverables registered, bytes host-verifiable, independent QA.**
- Registration: digest.json, digest.md, invocation_receipt.json and qa_independent_verification.json each have an artifact id (table above).
- Byte verification: QA measured digest.json, digest.md and the receipt on disk. The digest hashes equal the pinned probe hashes. A re-hash after QA showed all pins unchanged.
- Independent QA: qa_independent_verification.json has verdict PASS and empty findings, and it records that QA did not modify any examined artifact.
- Not confirmed by this manifest: the outcome of the host's own independent byte verification at the delegation boundary was not visible to this agent (caveat 4).

## 4. Residual caveats

1. **Pre-run procedure hash was not verified.** The upstream receipt records procedure_sha256.verified_before_run false because the shell gate denied sha256sum. QA closed this retroactively by measuring 7d1dd3ca... post-run.
2. **Receipt identifiers and timestamps are null.** attempt_id, qualification_id, started_at and finished_at are null and were not invented. Receipt sha256 fields for digest.json and digest.md are also null. QA's measured hashes supersede them for verification purposes, but the receipt itself was not corrected.
3. **The QA artifact has an incomplete hash and two differing on-disk copies.** The root-level qa_independent_verification.json is 17175 bytes. The qa/qa_independent_verification.json copy is 17886 bytes. Both report verdict PASS and the same hashes, but their text differs. It is not known which copy is the registered artifact 746a6cb7-6581-4d11-9201-c9f007217996, and only the sha256 prefix f6222682 is on record. Host verification should measure the registered bytes. This manifest does not assert a full hash for it.
4. **Host verification outcome not observed.** The QA verdict is a Nox-side measurement. The host-side check is outside this manifest's evidence.
5. **Receipt size field is wrong for digest.md.** The receipt says 1486, but the file is 1488 bytes. The receipt recorded a character count, because the em dash in the title is 3 UTF-8 bytes. Content hashes are correct and no digest value is affected. The receipt was deliberately left unedited.
6. **Re-registration of the digests.** digest.json and digest.md were registered via save_artifact from file_read text, rewriting the same paths. QA confirmed the resulting bytes hash exactly to the probe outputs, so bytes were preserved.
7. **This manifest's own hash is not self-referential.** No sha256 for completion_manifest.md is recorded inside it.
