# Mission r2-final-transfer-1794798010397-t01-on — Separated record parser 01 ON

## Outcome

`lib/records.cjs` repaired to implement the full `FORMAT.md` grammar and semantics.
The unmodified `visible.test.cjs` passes (`visible PASS`, exit 0).

## Implementation notes (decision log against FORMAT.md)

- **Records**: LF, CRLF, or CR terminators; empty string -> `[]`. Empty lines are
  **not** skipped — a blank line is a record with a single empty field, which fails
  the `KEY=VALUE` / key-syntax rules (`INVALID_FORMAT`).
- **Fields**: split on literal `|`. Each field must yield exactly one `[key, value]`
  pair; a trailing `|`, a leading `|`, or `||` produces an empty field -> `INVALID_FORMAT`.
- **Unquoted field**: must contain exactly one `=` and must not contain a `"`;
  otherwise `INVALID_FORMAT`. Everything after the single `=` is the value verbatim.
- **Quoted field**: a whole field may be double quoted. The quote must be the **first**
  character of the field; a quote anywhere inside an unquoted field is an error.
  Inside quotes `""` decodes to `"`; separators, `=`, CR and LF are literal data
  (so CRLF inside quotes is the two characters `\r\n`, not a terminator).
  After the closing quote only `|`, CR, LF, or end-of-input may follow.
  Unterminated quotes -> `INVALID_FORMAT`.
  A quoted field is split at its **first** `=` (quotes may contain further `=`).
- **Keys**: `[A-Z][A-Z0-9_]*` on the decoded key text, for quoted and unquoted alike.
- **Whitespace policy**: `value === value.trim()` must hold for the decoded value;
  otherwise `INVALID_FORMAT` (applies to unknown fields too, since it is a syntax check).
- **Precedence**: the whole input is tokenised/validated for syntax and duplicate
  decoded keys first, then semantics. So a syntax or duplicate error in a record is
  reported before `INVALID_VALUE` for a bad/missing required field, and a syntax
  error later in the input wins over an earlier record's value error (records are
  parsed and validated in order).
- **Known fields, schema order**: `WINDOW` (canonical unsigned int 2..30),
  `RATE` (canonical unsigned int 0..20), `LIMIT` (canonical unsigned int 1..50),
  `DURATION` (the one documented optional field; decimal integer 1..60).
  "Canonical unsigned decimal" = `0` or nonzero without leading zero, so `03`, `+1`,
  `-0`, ` 1` are all `INVALID_VALUE`.
- **Output**: `{}` literals only — no assignment by dynamic key ever touches a
  prototype, so a prototype-looking key (`__PROTO__`, `CONSTRUCTOR`, `PROTO`, ...) is
  ordinary data and is dropped as unknown without mutating any object.
- **Ordering**: object keys are inserted in known-field schema order
  (`WINDOW`, `RATE`, `LIMIT`, `DURATION`) then retained unknown field order. Unknown
  keys are dropped (none retained here, so ordering is the schema order).
- **Values**: valid integers become JS numbers; string fields keep their decoded
  string.

## Verification performed

Ran the visible test plus ~50 ad-hoc probes covering: CR/CRLF/LF, whole-field quoting,
`""` escapes, separators/equals/CR/LF inside quotes, characters after a closing quote,
unterminated quotes, quotes in unquoted fields, missing/empty/duplicate/`=`-less
fields, bad keys, duplicate decoded keys, trailing `|`, whitespace in unquoted and
quoted values, unknown-key dropping (including prototype-looking keys, with
`Object.getPrototypeOf(result[0]) === Object.prototype` checked true), schema key
ordering, boundary values (`2/20/50`, `30/0/1`, `DURATION=1|60`), out-of-range and
non-canonical numbers (`03`, `+1`, `-0`, huge), and format-before-value precedence.

## Artifacts

- `lib/records.cjs` — repaired CommonJS module exporting `parseRecords`.
- `visible-test-run.log` — captured output of the unmodified visible test.
- `report.md` — this report.

## Issues

None. No packages, network, external files, delegation, or test edits were used; the
visible test file is untouched.
