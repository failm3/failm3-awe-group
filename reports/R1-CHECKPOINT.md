# R1 executable checkpoint

## Continuation disposition

The continuation's finite P0 acceptance is in `R1-P0-ACCEPTANCE.md`: trusted
host admission, descriptor-relative files, confined resource-bounded shell work,
recovery, final **39/39** offline suites and independent re-verification. The
original checkpoint below is retained as history; its earlier remaining-work
list and live CSV receipt do not describe the final continuation tree by
themselves.

## Result

R0 preserved. The interrupted SIGKILL regression is repaired. R1 now has an
actual CSV analytics capability integrated with existing tools, Head, specialist
execution and independent QA, plus tested host qualification/revoke and scoped
experience retention primitives.

## Evidence

| Check | Result / location |
|---|---|
| TypeScript / build | PASS (`npm run typecheck`, `npm run build`) |
| Complete offline regression | **30/30 suites PASS**, `r1-test-results/final/summary.json` |
| Subsequent input/report QA hardening | **2/2 suites PASS**, `r1-test-results/qa-hardened/summary.json` |
| Live existing manager route | **completed**, `r1-live-1794605930179/summary.json` |
| Independent live evidence audit | Arithmetic/identity PASS; complete product-chain PARTIAL, `r1-live-independent-review.md` |
| Offline qualification/transfer/revoke | `.r1-analytics-mission-5G50VM/summary.json` (workspace-root-relative) |
| R0 evidence / data | 55/55 hashes match; 252-file state tree hash matches frozen R0 |

Live mission `r1-live-237dbc13-6c96-4221-b268-a53e7457e629`:

- Head (`claude-opus-5-5`) → analyst (`deepseek-v4-flash`) → QA (`claude-opus-5-5`).
- Real `csv_analytics` execution and saved `csv-analytics.json`.
- USD net **9000 cents**, EUR net **7200 cents**, 5 raw rows, 4 unique events,
  1 duplicate, 1 pending event. Currency totals are never combined.
- Three durable SDK-call records, **22860 reported tokens**, monetary cost **UNKNOWN**.
- Engineering qualification authorization; not a production deployment or
  evidence of a newly collected end-user approval.

Offline transfer uses three separate processes. The second input gives USD
**777 cents**, EUR **-500 cents** and references the first mission's verified
lesson. Revoke blocks dispatch and acceptance; requalification does not revive
the old admission. This demonstrates persistence/use, not measured superiority
against a matched no-lesson baseline.

## Reproduction

```bash
npm run typecheck
npm run build
AWE_TEST_RESULTS_DIR=reports/r1-test-results/reproduction node scripts/run-offline-tests.mjs
node --import tsx scripts/r1-analytics-mission.ts
```

Authorized live qualification (uses configured prepaid provider credentials;
creates a fresh `reports/r1-live-<timestamp>/state`, never the R0 state):

```bash
node --import tsx scripts/r1-live-analytics.ts --run-authorized-qualification
```

## Independent review follow-up

After the live evidence audit, production CSV execution was tightened to check
the approved path and byte digest before calculation. Host QA now compares the
owner-visible report with the rendering of independently verified metrics;
bounded descriptor snapshots also check saved artifact identities. The
`qa-hardened` regression run covers the integrated path after those changes.

## Remaining R1 acceptance work

- Make capability admission mandatory across the generic manager/effect path,
  rather than only the explicit qualification integration route.
- Complete executable resource quotas and race-resistant generic file tools.
- Extend ledger coverage from SDK invocations to transport attempts/reservations
  and embeddings; keep absent usage and provider cost UNKNOWN.
- Measure learning transfer against equal-budget baseline; add broader private
  domain controls before claiming professional/universal qualification.
- Current live run demonstrates one delegation, not parallel recursive execution
  on this CSV mission (existing recursion regression remains green).

No R1-wide production readiness or universal competence claim is made. See
`r1-release-inventory.md` for current seams and migration constraints.
