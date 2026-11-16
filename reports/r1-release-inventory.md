# R1 implementation inventory and checkpoint

## Identity / preservation

- Working branch: `r1/dev`; research import parent `ce51710`.
- Frozen R0 commit: `f0d81dcad924e1d646066ee246309f8a6eddcf36` (annotated tag `r0-frozen-v5`).
- Existing archive-only restore proof is retained in `backups/r0/RESTORE.md`.
- R0 evidence manifest rechecked: **55/55 OK** using
  `sha256sum -c reports/r0-test-results/evidence.sha256`.
- R1 test output now uses `AWE_TEST_RESULTS_DIR`; original R0 logs are preserved.
- Removed only the identified earlier R1 probe (`r1-probe.txt` with exact byte
  `1`, and empty `debug-mission/sigkill-recovery` directories). Rehashed R0
  `.awe-data`: **252 files, exact original tree hash MATCH**
  `85b9030f8bcc8b91a438b8b65fa9bf1f7647887ac631537446e8ffc4ea72ee6b`.
- No remote publication, infrastructure purchase or new provider authorization.
- System clock reports November 13 UTC while session date is November 14;
  evidence keeps actual machine timestamps without rewriting them.

## Existing-equivalent / change map

| Responsibility | Existing seam | R1 work |
|---|---|---|
| Prompt Master / approval | `agents/prompt-master.ts`, `index.ts`, `cli/index.ts`, `api/server.ts` | Full spec approval binding; no new planner |
| Head / specialization | `agents/head-agent.ts`, `agents/specialists.ts` | Full approved context, selected grants, provisioned mission workspace |
| Scheduler / repair / recovery | `agents/mission-manager.ts`, `agents/lifecycle.ts` | Existing ownership protocol reused; checkpoint spec hash and execution fence |
| Persistence / CAS | `utils/storage.ts`, `utils/r0-runtime-fs.ts` | Immutable approved requirements; same store for qualification and ledger |
| Executable tools | `tools/index.ts`, `security/tool-context.ts` | Fresh allowlisted bwrap filesystem, private temp, no shell network, parent release pipe |
| Domain calculation | `capabilities/csv-analytics.ts`, `tools/csv-analytics.ts` | Exact-integer CSV analytics and bounded acquisition |
| Independent verification | `capabilities/csv-verifier.ts`, `agents/csv-qa.ts` | Separate calculator; authoritative raw input digest, artifact snapshot verification |
| QA | `agents/qa-agent.ts`, `agents/qa-gate.ts` | Existing QA retained; domain evidence defects are binding |
| Qualifications | `utils/qualification.ts` | Independent host issuer, receipt, admission, generation fence and revoke |
| Experience | Existing persistent artifact store | Scoped lesson and second-input qualification integration; no vector DB |
| Calls / cost | `utils/model-ledger.ts` | Durable start/finish for each explicit SDK generate call; missing usage and money UNKNOWN |

## Verified regression repair

`SIGKILL parent ready` was caused by a test helper referenced outside a nested
child workspace. The fixture now stages the dependency-free executable inside
its explicit grant. No host-tree access was restored to accommodate the test.

- `reports/r1-test-results/recovery`: adapters 23/23; lifecycle 9/9.
- `reports/r1-test-results/grant`: two actual bwrap isolation tests.
- `reports/r1-test-results/isolation-fixed`: isolation and shared-memory boundary.
- `reports/r1-test-results/spec-fixtures`: early checkpoint/recovery 13 checks;
  API/CLI interfaces 94 checks after explicit-approval fixture migration.

## Current limits — not release acceptance

The earlier regression-repair findings above are historical. The continuation's
current finite boundary and review status are in `R1-P0-ACCEPTANCE.md`.

- Tested Linux shell work has real delegated cgroup and inherited resource
  limits. Hosts without the required delegation fail closed. Unrestricted host
  ancestor relocation is outside the supported filesystem guarantee; aggregate
  persistent disk quota and shell bind-source preparation races remain open.
- Actual specialist execution receives a mission-only grant, with role/tool and
  generation-fenced admission. A local engineering-practice grant cannot become
  product qualification after restart.
- Shell networking is denied. Web/browser adapters retain their separate grants.
- Ledger records SDK invocations, including aggregate tool-step usage. It does
  not yet identify every transport retry or embeddings operation. No dollar
  amount is inferred from token counts.
- Qualification APIs are host-only and tested. Global admission enforcement for
  every arbitrary capability is not claimed.
- CSV oracle is separately implemented and tested, but independent professional
  qualification is narrow and no universal domain competence is inferred.
- Legacy unbound missions remain recoverable but cannot execute through the
  production R1 route until explicitly reconciled/reapproved. No silent binding.
