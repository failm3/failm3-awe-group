# R2 independent verified-experience reuse — preregistered protocol

Status: independent new experiment, approved by the owner for 20 pairs, a 900 second
per-arm cap and host concurrency 4. The earlier frozen experiment and all of its
files are evidence only and are never rerun, edited, replaced or used as the result.

## Design

- Exactly 20 deterministic independent target instances, indices 00–19, evaluated as
  paired ON/OFF arms. Every arm is a fresh approved mission with a fresh workspace.
  Pair parity fixes order: ON then OFF for even indices; OFF then ON for odd indices.
  No adaptive stopping, exclusions, repairs or retries.
- A host scheduler runs at most four arms concurrently. Scheduling does not change
  pair assignment, arm identity, target configuration, budget or independent grading.
- Targets repair a CommonJS `key=value` separated-record parser. The source is a
  strict delimited CSV parser; CSV is not the target grammar. Each target receives
  only FORMAT.md, its assigned stub module and a two-assert visible test. Inputs,
  expected outputs, verifier code and hidden cases remain under host control.
- The same deterministic target variation, 44 hidden cases per target, visible-test
  integrity check, independent subprocess execution and exact output/key-order checks
  as the frozen harness are reused without modifying that harness.
- ON receives only the independently verified source artifact reference through the
  production host-only experience channel. OFF receives no experience. Both arms use
  the same coder role, model, tools, eight-step limit and zero provider retries.
- The whole arm has a 900 second wall cap. Abort is observed; a cap expiry invalidates
  that arm and its pair. No cap expiry is converted into a PASS or retried.

## Success and analysis

An arm passes only when its independently executed visible and all 44 hidden cases
pass and exactly one outcome-attributed parser artifact has the verified bytes.
Protocol validity additionally requires exactly one completed SDK call on the pinned
Router.Cheap model, no provider error, zero retries, intact visible test, only the
registered tools, correct ON/OFF reference attestation and observed wall cap.

The experiment is valid only with 40 unique attempts, 20 valid pairs, 40 unique
completed pinned-model ledger calls and an intact harness attestation. The primary
analysis is paired ON/OFF pass rates and exact two-sided McNemar on discordant pairs.
A statistically non-significant or zero/negative difference remains a valid negative
result; no criterion is rewritten after execution. Provider monetary cost is UNKNOWN
unless independently supplied by the provider; token usage is reported separately.

## Safety and evidence

Live execution requires `--run-authorized-experience-reuse` and the already-selected
dedicated Nox Runtime environment file. Offline preflight makes no provider calls.
No external action, publication, package installation, credential disclosure, secret
path recording or additional authority is granted by a catalogue or experience record.
The run stores specifications, artifact hashes, attribution, model ledger references,
intervals, checks, analysis and the final conclusion under a new report directory.
