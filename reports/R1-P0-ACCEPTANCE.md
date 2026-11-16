# R1 continuation — finite acceptance boundary

## Finite P0 integration disposition: ACCEPTED

The Git commit containing this report is the local P0 integration checkpoint on
`r1/dev`. Acceptance covers only the five boundaries below and their recorded
Linux host/tool prerequisites. It does not claim R1-wide production readiness,
universal competence, professional practice qualification or live-provider
certification.

| Final check | Result / retained evidence |
|---|---|
| Complete offline regression | **39/39 suites PASS**, 0 failures, `r1-p0/full-offline-verified/summary.json` and per-suite logs; 2026-11-13T23:31:31Z–23:38:40Z |
| TypeScript | PASS, `r1-p0/typecheck-complete.log` |
| Production build | PASS, `r1-p0/build-complete.log` |
| Independent admission review | Finite P0 PASS, `r1-p0-reverification.md` |
| Independent final write correction | PASS with current source hashes, `r1-p0-final-write-review.md` |
| R0 trace preservation | **55/55 hashes OK**, `r1-p0/r0-evidence-recheck.log`; `r0-frozen-v5` still resolves to `f0d81dcad924e1d646066ee246309f8a6eddcf36` |
| R0 data preservation | **252 files**, tree `85b9030f8bcc8b91a438b8b65fa9bf1f7647887ac631537446e8ffc4ea72ee6b`, `r1-p0/r0-preservation-recheck.json` |

Reproduce without provider access using a new evidence destination:

```sh
npm run typecheck
npm run build
AWE_TEST_RESULTS_DIR=reports/r1-p0/reproduction node scripts/run-offline-tests.mjs
```

Explicitly authorized work was bounded to the approved mission and role/tool
targets. Normal CLI/API hosts still require trusted policy reconstruction;
request/model metadata cannot choose engineering practice. All earlier failed
or partial evidence remains retained rather than rewritten into a PASS.

Starting checkpoint: clean `r1/dev` at `189144a`, predecessor `471a6da`; the
historical 30/30 suite summary was verified without rerunning at continuation
start. This continuation changes that tree and requires fresh evidence. R0
frozen commit remains `f0d81dcad924e1d646066ee246309f8a6eddcf36`.

## P0 acceptance for local product work

1. **Admission:** production execution requires matching host-authorized
   qualification/admission or explicitly host-authorized bounded qualification
   practice. Missing, wrong, revoked or stale bindings deny before effects;
   delegation, recursive tools, repair, final acceptance and resumed execution
   preserve the decision. Solver input cannot issue its own receipt.
2. **Filesystem:** child has only its mission writable tree, no host secrets,
   sibling state or host service sockets. Generic direct file read/write/list
   rejects symlink redirection and hardlink aliases, bounds IO and retains
   cancellation/ownership controls.
3. **Resources:** actual kernel-enforced process/memory boundaries must be
   demonstrated for executable product work. Per-UID global limits are not
   claimed as per-mission containment. CPU/time/file/fd bounds have low-cost
   negative probes. Unsupported host configuration is a named blocker, not an
   unbounded fallback or permission to reconfigure unrelated installations.
4. **Recovery:** owner death/cancel/revoke must settle descendants before
   publishing success/cancel/reusable state; unknown remote outcomes persist.
5. **Evidence:** relevant real integration tests, independent review, committed
   results and R0 preservation. Mocks alone cannot certify a boundary.

## Integration status

- Production managers reject missing host policy/qualification before Head.
  Practice execution must be supplied as a host-only option explicitly bound to
  mission and specification hash; request metadata cannot select it.
- Admission generation is carried through delegations, repairs, recursive tool
  contexts, actual file/artifact writes and shell release. Independent
  acceptance and persisted write provenance are fenced.
- Existing lifecycle process fixtures explicitly identify their host practice
  purpose; they do not masquerade as product-qualified executions.
- Resource isolation is integrated through systemd user scopes and prlimit,
  with verified real child controls in `r1-resource-limits.md`.
- File operation trust and the reproduced host-rename limitation are precisely
  recorded in `r1-p0-fs-boundary-resolution.md`; an actual confined rename
  denial test was added rather than weakening or discarding the review.

These changes are a checkpoint, not R1-wide production readiness. The
incomplete per-transport billing record and aggregate filesystem quota remain
explicit limits.

## Independent review disposition

- `r1-p0-final-review.md` remains the original FAIL and reproduction history.
- `r1-p0-reverification.md` reports **PASS for this finite P0 engineering
  boundary**, against the exact production hashes recorded there before the
  final `file_write` regression repair described below. It
  confirms recursive role/tool authorization and admission-locked reservation,
  pre-spawn launch-record cleanup, host CLI/API policy reconstruction and exact
  UNKNOWN usage handling. This is not a live-provider, professional-practitioner
  or deployment certification.
- Selected independent runs: admission **14/14**, shell **4/4**, host policy
  **1/1**, ledger **8/8**, recursion **9/9**, resource limits **13/13** and
  CLI/API interfaces **97 checks**. Full-suite evidence and the local Git
  checkpoint are separately retained in the final integration record.
- `host-integration/` is a timed-out partial run, never a pass receipt.
  `host-integration-final/` completed the focused six-suite integration.
  `usage-unknown-fix/` records the corrected missing-usage edge and separately
  retains a legacy child-fixture failure. `legacy-child-boundaries/` then passed
  runtime-manager **76 checks**, final-manager **79**, recovery **95** and the
  offline harness check. Explicit `offlineFixture: true` applies only to those
  synthetic, fully injected test children and does not relax production setup.
- `full-offline-final/` then exposed a real `file_write` ordering regression:
  the other 38 suites passed, but its final tool fence ran before the mission
  lock. The failed evidence is retained. The repair leaves that check inside
  `withMissionWrite` while retaining host admission and durable intent;
  `final-tools-fix/` passed final-tools **12/12** and admission **14/14**.
  The independent follow-up `r1-p0-final-write-review.md` separately replayed
  the same **12/12** and **14/14**, verified the current source hashes, and
  found no weakened admission, durable intent, cancellation, seal or artifact
  semantics. Its narrow PASS does not substitute for the whole-suite result.
  `full-offline-tool-timeout/` is an incomplete harness run ended by a 120s
  command timeout, not a suite result or acceptance receipt.

## Web practice after this checkpoint

The finite interactive web-product contract and real-browser defect controls
are implemented. `scripts/r1-local-web-mission.ts` performs the separately
authorized bounded local practice mission only with
`--run-authorized-local-web-practice`; it refuses the offline fixture guard.
It uses the actual Manager/tools/artifact storage, narrow coder/executor grants,
and fresh independent browser verification after terminalization. Its receipt
is outside the candidate product tree and carries provider cost **UNKNOWN**.
No deployment or publication is authorized by this checkpoint; a verifier
fixture is not evidence of autonomous product construction.

Routing and memory comparison must state observed metrics and equal budgets;
no improvement is an admissible result. Cost is UNKNOWN unless actually reported.
