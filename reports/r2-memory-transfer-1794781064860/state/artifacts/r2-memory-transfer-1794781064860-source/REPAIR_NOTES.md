# Mission r2-memory-transfer-1794781064860-source — Source ledger parser repair

## Change
`src/ledger.cjs` — replaced the naive `trim().split(/\r?\n/).map(l => l.split(','))`
implementation with a character-level state machine implementing all of FORMAT.md.

Previous defects: it split on every newline (breaking quoted newlines), had no quote
handling at all (no delimiters/quotes inside quoted fields, no `""` unescaping), used
`trim()` which destroyed empty leading/trailing fields, and never raised
`Error('INVALID_FORMAT')` for malformed input.

## Parser states
- `FIELD_START` — start of a field; `"` opens a quoted field, `,` emits an empty
  unquoted field, a newline terminates the record with an empty field.
- `UNQUOTED` — bare field; `,` / newline end it, a `"` throws INVALID_FORMAT.
- `QUOTED` — everything literal, including `,`, CR and LF.
- `QUOTE_CLOSED` — after a closing `"`; `"` re-enters QUOTED as an escaped quote,
  `,`/newline end the field, any other character throws INVALID_FORMAT.

`\r\n` is consumed as one separator; lone `\r` and lone `\n` also separate records.
A single trailing record separator does not create a spurious empty row; input
ending mid-quote throws INVALID_FORMAT.

## Verification
Visible test: `node visible.test.cjs` -> `visible PASS` (exit 0).
Additional edge checks (all passed): empty input -> `[]`; no trailing newline;
CRLF; trailing/empty unquoted fields; quoted delimiter, quoted `""` escape and
quoted empty field; embedded CRLF inside a quoted field; and four malformed cases
(`"abc`, `"a"b`, `a"b`, `"a""`) each throwing `Error('INVALID_FORMAT')`.

No tests were modified, no packages installed, no network or external files used.
