# R2 final professional-mission harness

This self-contained harness defines two bounded local engineering-practice missions:

1. A source-grounded research brief with production recursive/parallel specialist delegation.
2. An exact CSV analytics package (`metrics.json` and `operations-brief.md`) with independent arithmetic and document verification.

Both use the real Head, `MissionManager`, specialists and independent production QA. No offline agent substitutes or hardcoded live PASS are used. Host policy is explicitly bound to each approved mission and exact approved tool set. Host-only model routing and fail-closed experience composition are recorded; request/model metadata cannot select policy records.

## Offline validation

```sh
./node_modules/.bin/tsx scripts/r2-final-professional/runner.ts --validate-only
```

This imports no production provider or storage runtime, executes no missions, and makes no provider/network calls. It accepts reference outputs, rejects citation/arithmetic/document/CSV mutants, and tests that sequential intervals are not reported as concurrent. It writes no report directory and exits nonzero on failure.

## Later explicitly authorized live run

From the repository root, with an absolute path to the dedicated Nox Runtime secret file already selected by the operator:

```sh
AWE_RUNTIME_ENV_FILE=/absolute/path/to/routercheap-nox.env ./node_modules/.bin/tsx scripts/r2-final-professional/runner.ts --run-authorized-professional
```

The live flag is the explicit approval of the two embedded specifications. The runner rejects any `AWE_OFFLINE_TEST` value, loads only the selected canonical file using `dotenv.config({ path, override: true })` before provider-capable imports, deletes `OPENAI_API_KEY`, and never records credential paths, secret values or reusable fingerprints.

A new `reports/r2-final-professional-*` directory is created only for an actual live run. It contains immutable pending specifications and approvals, per-mission evidence, actual artifact IDs/hashes, host-observed producer/delegation intervals, candidate/QA receipts, model ledger, measured overlap, attestation and `summary.json`. Provider cost is always `UNKNOWN`. Any failure yields `passed: false` and a nonzero exit.

A passing bounded run is evidence for these missions only; it does **not** declare R2 readiness.
