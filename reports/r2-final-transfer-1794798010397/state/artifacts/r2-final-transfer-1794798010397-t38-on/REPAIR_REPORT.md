# Repair report — Separated record parser 38 ON

Mission: `r2-final-transfer-1794798010397-t38-on`
File repaired: `adapters/bundle.cjs` (sha256 `65f4e20fc5ff8b8e2d84a16f4ab14c9b805e5a8a380d2a88b49d922eaebc0b59`)
Visible test: unmodified (sha256 `303a31303d312aec6b91c6ecf1ba941702cde2ebd52d88702366e668f596bac1`), result `visible PASS`, exit 0.

## Original defect

The shipped stub was a lossy one-liner that split on newlines, `;` and `=` with no
grammar, no validation, no key normalization and no error signalling. It could not
satisfy any part of FORMAT.md beyond the two trivial examples.

## Implementation

A hand-written single-pass tokenizer plus a separate semantic pass.

### Tokenizer (`tokenizeRecords`)

- Records terminate on LF, CRLF or CR; CRLF is consumed as one separator.
- Fields terminate on `;`.
- **Quoted field**: only recognized when `"` is the *first* character of a field.
  Reads until the matching close; `""` decodes to `"`. Quotes may span `;`, `=`,
  CR and LF. After the closing quote, only `;`, CR, LF or EOF is legal.
- **Unquoted field**: a `"` anywhere is `INVALID_FORMAT`; exactly one `=` required.
- `KEY` validated against `^[A-Z][A-Z0-9_]*$`.
- Duplicate *decoded* keys within a record rejected (detected after quote decoding,
  so `"R""ATE=2"` collides with `RATE`).
- All syntactic errors are raised during this pass, which is what makes syntax
  failures outrank semantic ones (e.g. `WINDOW=999;...;RATE=3` → `INVALID_FORMAT`).

### Semantics (`buildRecord`)

- `WINDOW` 3..50, `RATE` 0..30, `LIMIT` 1..75, required.
- Coercion via `/^(?:0|[1-9][0-9]*)$/` then `Number`, so `04`, `4.0`, `1e1`, `-1`,
  `+4` and exponential forms are all `INVALID_VALUE`. Correctness does not depend on
  `Number.isInteger`.
- `COLOR` ∈ {`white`,`black`}, case-sensitive; stays a string.
- `FLAGS` becomes an array (comma/whitespace split; `""` → `[]`).
- Trim applies to the decoded **VALUE** only; keys and quoted key text are untouched.

### Output-object safety

Known fields are inserted first in schema order `WINDOW, RATE, LIMIT, COLOR, FLAGS`,
then retained unknown fields in original field order — matching the documented
"known-field schema order, then unknown field order". Unknown values stay strings.

Known-field *membership* is decided by exact string match through a `Map` and an
`indexOf` list — never by property lookup — so a key such as `CONSTRUCTOR` cannot be
mistaken for a known field. All writes go through `Object.defineProperty`, so
`__proto__` lands as an ordinary own enumerable data property and the result
prototype is untouched. Verified explicitly.

## Judgement calls (documented in code comments)

FORMAT.md declares exactly one optional field ("Only the documented optional field is
recognized") but then names both `COLOR` and `FLAGS` as conversions. Resolution:
both are treated as recognized optional fields, required fields first in schema
order, and a `FLAGS` value is a comma/whitespace-separated token list normalized to
an array of strings. `FLAGS=""` yields `[]`. A `FLAGS` value that cannot yield any
token (stray `=` / `"` / `;` via a quoted field) is `INVALID_VALUE`, since it is a
value-shape problem rather than a syntactic one. `FLAGS` is omitted when absent, the
same as `COLOR`.

A whitespace-only input is treated as a record that is missing all required fields,
hence `INVALID_VALUE`; only the truly empty string returns `[]`, exactly as specified.

## Verification

Ran the unmodified visible test (passes) plus an 18-case local suite covering: empty
input, trailing newline/CRLF, all three record terminators, quoted fields containing
`;`/`=`/CR/LF/`""`, quote-inside-unquoted rejection, value-only trimming, unknown-key
ordering, prototype-pollution keys, all numeric and enum boundaries, canonical-decimal
strictness, every listed `INVALID_FORMAT` case, every listed `INVALID_VALUE` case, and
syntax-over-semantics precedence. All 18 passed.

No packages, no network, no external files, no delegation, no test edits.
