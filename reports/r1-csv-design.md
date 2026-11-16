# R1 deterministic CSV analytics engine

## Implemented surface

- `src/capabilities/csv-analytics.ts` exports `analyzeCsvAnalytics(input: Uint8Array, limits: CsvAnalyticsLimits)`, the result/types, pinned contract digest, and `renderCsvAnalyticsReport(result)`.
- Explicit limits are `{ maxBytes, maxRows }`: nonnegative safe integers, with no defaults. Rows mean data records before deduplication, excluding the header. Zero rows permits header-only input.
- Input is original bytes, not a JavaScript string, preserving exact SHA-256 provenance and allowing strict UTF-8 validation. The contract digest is SHA-256 of the exact checked-in `research/r1-kortix/ANALYTICS-CONTRACT.md` bytes: `ee21de150b9c8101aa5ab8a275b80ccdf0dccfb982ecf26d61d83f217ea1ba0c`.
- `PASS_DATA` includes both currencies, decimal-string amounts, unique-event counts in `counts.{settled_sales,settled_refunds,pending_sales,pending_refunds}`, empty-group flags, and global row/deduplication counts.
- `BLOCKED_INPUT` omits `metrics` entirely, returning the first diagnostic only. Row means one-based logical record, with header at 1; field is a schema name or one-based column before the schema is known. Conflicts include the event ID and original conflicting record number.
- Human-readable reports use exact integer cents, explain net, deduplication, separate currencies, pending exclusions, scale 2, no FX, and no causal/financial-audit claim. Blocked reports contain only diagnostics and provenance.

## Validation and arithmetic

The installed package manifest/lockfile contains no CSV parsing library. A narrow strict state-machine parser handles quoted fields, doubled quotes, embedded LF/CRLF, reordered/quoted headers, and terminal record separators. It rejects relaxed quoting, bare CR, skipped blank records, BOM, invalid UTF-8, schema drift, and incorrect record widths. Parsed values are never trimmed or case-normalized. Embedded newlines/commas/quotes parse correctly but subsequently fail the contract's strict value grammar.

Every data record validates before deduplication. Canonical amount grammar and lexical range checking precede BigInt conversion; aggregation occurs only after all duplicate conflicts have been checked. Monetary sums and signed net use BigInt and serialize as decimal strings. Distinct event IDs sharing an order ID remain distinct events. Identical parsed records collapse independently of CSV quoting and row order.

## Evidence

Run the isolated suite:

```sh
node --import tsx --test src/tests/r1-csv-analytics.test.ts
```

The 15 tests cover public controls, full expected metrics, pending/refund/zero-group behavior, sums beyond safe integer including cancellation, every conflicting field in both orders, validation-before-deduplication, exact enums/ASCII IDs, malformed CSV/UTF-8/BOM, mandatory byte/row limits including raw duplicates, and a 160-event varied fixture with 320 duplicate records. Metamorphic cases cover permutation, header reordering, quoting and line endings. Expected monetary values are hand-derived constants; this suite is implementation testing, not an independent qualified oracle or holdout evaluation.

Isolated strict typecheck:

```sh
./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --esModuleInterop --skipLibCheck src/capabilities/csv-analytics.ts src/tests/r1-csv-analytics.test.ts
```

## Integration obligations and limits

This is an in-memory, side-effect-free engine. Its caller must obtain mission-approved limits **before reading** and enforce bounded file acquisition; the engine checks the received byte length before decoding/parsing but cannot retroactively bound file reads. Authorization, file paths, storage, tools, charts, mission approval, and independent reference/checker qualification belong to subsequent integration. The engine has no network, credentials, environment or application-storage access. It returns one deterministic error rather than accumulating all defects. The diagnostic document digest deliberately fails its test if the contract changes, requiring deliberate implementation review/versioning.
