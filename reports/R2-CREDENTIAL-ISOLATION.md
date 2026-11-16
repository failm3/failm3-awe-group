# R2 — Nox Runtime credential isolation

Date: 2026-11-16

## Verdict

- **OpenCode development contour: UNCHANGED / WORKING.** Its configuration and
  provider secret were not read, edited, exported, or replaced.
- **Nox Runtime contour: PASS for dedicated-key selection and real API use.**
  The only selected secret file is
  `/home/nox/.config/awe-group/secrets/routercheap-nox.env` (`awe-nox-runtime`).
  No secret value or reusable fingerprint is included in evidence.
- **R2 readiness: NOT CONFIRMED.** This credential check does not establish any
  of the six owner acceptance criteria by itself.

## Implemented boundary

Production `src/index.ts` no longer auto-loads a workspace `.env`. It requires
an absolute `AWE_RUNTIME_ENV_FILE`, loads that file with `override: true`,
requires a Router.Cheap key, and removes `OPENAI_API_KEY` so the compatible
adapter cannot fall back to an OpenCode/developer credential.

`scripts/run-nox-runtime.sh` starts Nox after unsetting inherited provider keys
and selects only the dedicated file. Its default is the canonical file above;
it also removes any inherited offline-test switch so the guarded launcher
cannot accidentally enter the synthetic test configuration. The specialist
shell environment separately filters provider credentials, and
`AWE_OFFLINE_TEST=1` retains synthetic offline fixtures rather than loading a
production secret. Offline tests verify missing/relative paths fail closed and
that a dedicated selection wins over inherited provider variables without
reading the developer workspace `.env`.

README commands now use the guarded launcher. No OpenCode configuration was
modified.

## Live checks

1. Direct Router.Cheap API request using the dedicated Nox selection:
   `deepseek-v4-flash`, response `OK`, provider-reported total usage **8 tokens**.
   Monetary cost: **UNKNOWN**.
2. Real Nox entry point through `scripts/run-nox-runtime.sh`, with deliberately
   invalid inherited OpenCode marker variables: Prompt Master completed a real
   `claude-opus-5-5` specification request, created pending mission
   `d71af751-89b1-409b-9b44-2256ec0445be`, and did **not** execute it because
   `--no-approve` was selected. The completed Nox model-ledger call reports
   **3,356 total tokens** and cost **UNKNOWN**.
3. Focused offline interface regression after the bootstrap change:
   **103 checks PASS**. This includes production-selection negative controls and
   a real guarded-launcher control with inherited `AWE_OFFLINE_TEST=1`: the
   launcher strips it and still refuses a missing dedicated credential file.
   Evidence: `reports/r2-final-review-wrapper/summary.json`.

The initial direct check exposed an invalid test URL (`/v1` without a host),
not a provider authentication result; it is not counted as a successful API
check. The corrected request and the subsequent real Nox Prompt Master request
both succeeded.

## Evidence and limitations

- Guarded CLI output: `reports/r2-runtime-credential-check/cli.txt`.
- Real model-ledger records remain in the ignored local Nox state root; usage is
  provider-reported, not an invoice or proof of remaining balance.
- Full post-change regression: `reports/r2-final-credential-regression/summary.json`,
  **46/46 suites PASS, 0 failed**; TypeScript typecheck and build also passed.
  Intermediate regressions that ran while the new test was being corrected are
  retained and are not represented as final green runs.
- No external action, purchase, publication, account change, OpenCode change,
  Windows/WSL change, Kortix/CUA activation, or remote Git operation occurred.
