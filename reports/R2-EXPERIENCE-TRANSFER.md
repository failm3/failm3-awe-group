# R2 verified-experience implementation and transfer evidence

Date: 2026-11-16

## Scope and non-claims

This change adds opt-in, host-only transfer of a bounded source artifact into a
fresh specialist request. It does not enable Mastra semantic memory, grant a
new tool, approve a target mission, authenticate arbitrary local callers, or
qualify UCL/UNVETTED candidates. A single paired experiment, if valid, is not
statistical proof of broad generalization.

## Controls

- Source mission must be completed, approved-spec bound and distinct from the
  target. Source and independent verification artifacts must be registered,
  hash-intact regular files reopened with `O_NOFOLLOW` and snapshotted through
  one descriptor.
- The verification record has a strict schema and binds the exact source
  artifact ID/SHA-256, verifier SHA-256 and positive independent test evidence.
- Qualification generation, receipt, evidence refs and live host grant/resource
  policy are checked before retrieval and actual dispatch. Revocation and stale
  generation fail closed. No qualification lock is held across an `await`.
- Target mission requires its own immutable approval, running/approved status,
  exact qualified role and a separate target memory-policy callback.
- Retrieved source text is delimited untrusted reference data in the **user**
  message, never concatenated into system instructions. Tool ceilings remain
  governed only by the approved target specification.
- Host-selected experience dispatch uses `maxRetries:0`; post-tool steps and
  synchronous tool effects repeat the ordinary mission and source/target fences.
  Automatic repair executors do not inherit coder-qualified experience.
- Store reads/writes use nofollow/descriptor checks and a file lock. Selection
  is exact on scope, capability hash and profile hash; ambiguity fails closed.

## Offline and independent review

`src/tests/r2-verified-experience.test.ts` exercises real specialist execution
with a real granted `file_write` tool, verifies user-vs-system placement and
host-observed injection attestation, and checks selection mismatch, unapproved
or policy-denied targets, artifact tampering, revocation and post-retrieval
per-step denial. Existing qualification, recursion and mission-admission suites
also run against the modified production seam.

Independent read-only QA found and drove repairs for reentrant qualification
inspection, strict live QA serialization, binding canonicalization, artifact
attribution, target approval, live dispatch/tool fences, untrusted-content
placement, exact model pinning, result validity and actual on-arm injection.
The final independent static review found no remaining deterministic defects.
A separate read-only evidence audit of the final pair confirmed all ten validity
checks, exact artifact and visible-test hashes, approved-spec recomputation,
qualification/admission lineage, reconstructed reference hash, one completed
model call per target and the negative transfer predicate. No discrepancies were
found. These audits establish this bounded result, not broad generalization.

## Live experiment design

`scripts/r2-memory-transfer.ts --run-authorized-memory-transfer` creates a new
isolated state root and three fresh workspaces. A source coder must repair a
comma-delimited parser. The hidden host verifier then executes the unchanged
visible test and independent edge cases. Only the exact attributed, verified
source implementation can be published.

Two fresh semicolon-delimited target tasks use the same pinned model, tool
grant, specification, `maxSteps:10` and host experience policy (including zero
SDK retries in both arms). Each outcome records the actual retry option, and the
validity gate requires both observed values to be zero. Only memory-on receives
the source artifact reference. The host result separately reports:

- `experiment_valid`: both arms and required controls actually executed;
- `transfer_observed`: memory-on passed the same hidden verifier while
  memory-off did not.

Equal model/max-step cap is claimed, not equal tokens or spend. Provider cost
remains UNKNOWN. Earlier invalid runs are retained unchanged; they are not
counted as transfer evidence. In particular, the first two Kimi source attempts
returned a JSON string instead of the documented row array; the next Fable
attempt modified the visible test to expect that string, and the immutable-test
hash fence correctly rejected it. The fixture's visible expectation was then
corrected to the originally intended array and all later runs use fresh state.
The first complete pair (`1794780219424`) passed both target arms and therefore
observed no correctness delta; a subsequent independent audit found unequal SDK
retry settings, so its self-declared validity is retained only as historical
evidence and is not accepted as the controlled final comparison.

## Final controlled live pair

Code checkpoint: `eb6d7966d3c3b5a414f98277bdfb83475477b2b8`.
Run root: `reports/r2-memory-transfer-1794781064860/`.
`result.json` SHA-256: `a87858c9ed9ac96419eeefa0d0a0754c247569e3cc32cfec4cde14ad3fed3ad2`.

**Experiment valid: YES. Correctness transfer observed: NO.** Both target arms
produced the assigned parser and passed the same independent verifier. The
memory-on arm explicitly reported adapting the reference, while the memory-off
arm independently solved the same fresh task. Therefore this run demonstrates
safe, qualified retrieval and adaptation but no measured correctness advantage.
It does not justify a broad memory-learning or R2-readiness claim.

Exact backing-byte SHA-256 values:

- source `src/ledger.cjs`: `2593ad97d4531cfd65ea2e2cd955871303aeacfc34b78ad520ec25cfb529fd6d`;
- source independent-verification record: `37f77ac8008a534dd3b99dc071649d7c8eb3fa649533aa08797517076ae10513`;
- memory-on `lib/roster.cjs`: `ecfef3705ee4864f19785a6a6242194d2d1047c94e5b7405f77531eb5c11acf6`;
- memory-off `lib/roster.cjs`: `4ad6deefad44095c20a40e6347e1f522f5b794f8cd29a861e1a2c04b25676f9d`.

The run has three completed `claude-fable-5-2` calls (source and one per arm).
Both target outcomes record `provider_max_retries:0`, max steps are 10, and no
equal token/spend claim is made. Provider cost remains UNKNOWN. The interrupted
run `1794780549627` has no terminal `result.json` and is not acceptance evidence.

## Final regression and overall disposition

The post-restart full run is retained in `reports/r2-full-regression-accepted/`:
45/45 suites passed, zero failed, from 2026-11-15T22:22:25.494Z through
2026-11-15T22:26:28.459Z. It includes `ucl-bridge` and `r2-verified-experience`.
TypeScript build and `git diff --check` passed on the same code checkpoint.

Overall R2 readiness remains **NOT CONFIRMED**. The prior six-item bounded
CSV/HTML/PNG mission evidence and the read-only UCL advisory integration remain
valid in their stated scopes. The additional measured verified-experience
transfer criterion is **NOT MET** because the controlled off arm also passed.
This is an evidence boundary, not a request to weaken the verifier or repeat
runs until a preferred answer appears.
