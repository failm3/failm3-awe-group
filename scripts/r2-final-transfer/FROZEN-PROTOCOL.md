# R2 final controlled verified-experience transfer — frozen protocol

Status: preregistered before target construction. Confirmatory execution is permitted only with
`--run-authorized-final-transfer`. Offline `--preflight` never imports the provider runtime and never executes a target.

## Design

- Exactly 40 deterministic, independent target instances (indices 00–39), evaluated as paired ON/OFF arms.
  Every arm is a fresh approved mission with a fresh workspace. Pair parity fixes order: ON then OFF for even
  indices; OFF then ON for odd indices. No parallel arms, adaptive stopping, exclusions, repairs, or retries.
- Targets repair a CommonJS `key=value` separated-record parser. The source is a strict delimited CSV parser;
  CSV is not the target grammar. Each target receives only `FORMAT.md`, its assigned stub module, and a tiny
  two-assert visible test. Inputs, expected outputs, verifier code, and hidden cases remain under host control.
- Deterministic target variation: `;` or `|` separators, strict/trim whitespace, drop/retain unknown fields,
  input and export names, numeric bounds, COLOR/FLAGS enum sets and case behavior, and the optional
  DURATION/COLOR/FLAGS semantic variant. All targets require WINDOW/RATE/LIMIT.
- Each target has 44 hidden cases: valid, syntax-invalid, and semantic-invalid. The host requires stable deep-equal
  output and an actual `Error` whose message is exactly `INVALID_FORMAT` or `INVALID_VALUE`, according to the case.
- The source artifact is the exact host-built `parseLedgerCsv` CommonJS implementation. Two ordinary visible
  examples and an independently executed edge corpus qualify it. ON receives only those exact verified source
  bytes through `saveVerifiedExperience` / `retrieveVerifiedExperience`; OFF receives no reference. The source
  artifact has no target-specific vocabulary, schemas, cases, or solutions.
- Final success depends solely on the final assigned parser file, attributed to the specialist outcome and matching
  the independently verified bytes. Visible-test modification, missing/ambiguous attribution, or artifact mutation
  during verification invalidates the arm. Secondary token, latency, or step efficiency is never evidence of success.

## Execution controls (identical for every target attempt)

- Role: `coder`; model route: Router.Cheap `claude-fable-5-2`, selected by host configuration independent of
  environment role defaults. Provider rejection is recorded and never causes model substitution.
- Actual registered tools only: `file_read`, `file_list`, `file_write`, `shell`, `save_artifact`.
  No `delegate`, packages, Internet tools, or network access.
- Real `executeSpecialist`, persisted approved-spec binding, `maxSteps: 8`, `maxRetries: 0`, and a 240,000 ms
  abort wall cap. One attempt per arm. There are no repairs, repetitions, or discretionary substitutions.
- Host memory policy admits only the one qualification, coder role, the current ON mission, and its unchanged
  approved specification. Source approval is not target approval.

## Freezing, accounting, and validity

Before any provider dispatch the runner hashes this protocol, all harness/fixture source files, all 40 deterministic
visible specifications, and all hidden-case digests into `attestation.json`. Live results and ledger snapshots are
written under a new run root. Post-run hashes must match. Every attempted arm remains in `result.json`, including
provider errors, timeouts, protocol-invalid arms, and failures. A pair is included in the primary analysis only when
both arms satisfy the preregistered protocol-validity checks; all attempted outcomes remain reported separately.

Global validity additionally requires exactly 40 pairs/80 distinct target attempts, source verification and
qualification, ON-only reference attestation on every valid ON attempt, pinned model and retry controls, no OFF
reference, intact fixtures, and final attributed artifacts. Provider rejection, timeouts, changed visible tests,
missing ledgers, or unexpected model IDs invalidate the affected attempt rather than triggering replacement.

## Frozen primary analysis

For protocol-valid paired outcomes, let `b` = ON pass / OFF fail and `c` = ON fail / OFF pass. Report ON and OFF arm
pass counts, `delta = ON_rate - OFF_rate`, discordant counts, and the exact two-sided McNemar sign-test p-value:

`p = min(1, 2 * sum_{k=0}^{min(b,c)} BinomialPMF(k; b+c, 0.5))`.

There is no continuity correction and no optional stopping. Secondary efficiency measures, if present, cannot alter
the conclusion or establish transfer.

## Offline qualification

Run:

```sh
./node_modules/.bin/tsx scripts/r2-final-transfer/runner.ts --preflight
```

Preflight checks all 40 references against all hidden cases, confirms source reference/visible/edge behavior, and
requires seeded split-only, escape, duplicate, and range mutants to fail. It also checks deterministic regeneration,
case-category counts, workspace-visible material isolation, and the frozen analysis implementation. It makes no
provider/model/network calls. The separate live flag is intentionally not exercised by offline tests.
