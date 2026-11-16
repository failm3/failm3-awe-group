# Mission r2-experience-reuse-1794858271974-t18-on — repair report

## Change
`adapters/bundle.cjs` was a stub (`trim().split()` / `Object.fromEntries`) with no
quoting, validation or error handling. It was replaced with a full implementation of
FORMAT.md:

- `parseBundle(text)` — character scanner; rejects non-string input with `INVALID_FORMAT`.
  Empty string returns `[]`. Records separated by LF, CRLF or CR.
- Fields separated by `;`. Unquoted fields must be exactly `KEY=VALUE` (exactly one `=`),
  `KEY` matching `[A-Z][A-Z0-9_]*`; any `"` in an unquoted field is `INVALID_FORMAT`.
- Whole-field double quoting: `""` decodes to `"`; quoted text may contain `;`, `=`, CR
  and LF; only a separator or record ending may follow the closing quote; unterminated
  quote is `INVALID_FORMAT`.
- Duplicate decoded keys (known or unknown) throw `INVALID_FORMAT` before unknown-key
  dropping. Key syntax/duplicates are checked for every field of the record before any
  value is validated, so syntax errors take precedence over semantic ones.
- Values get leading/trailing whitespace trimmed; only the value is trimmed.
- Semantic validation with `INVALID_VALUE`: WINDOW (`0|[1-9][0-9]*`, 1..50), RATE (0..30),
  LIMIT (1..25) as JS numbers; optional COLOR exactly `white` or `black` (case-sensitive).
- Unknown keys dropped after validation; records are plain objects built by assignment,
  so a prototype-looking key (`__proto__` etc.) stays data — `Object.prototype` of every
  record is `Object.prototype`.
- Output array is in record order; keys in schema order then unknown-field order.

## Verification
- `node visible.test.cjs` → `visible PASS` (test file unmodified).
- 24 additional edge cases checked (line endings, all-quoted fields, quoted separators
  and newlines, escaped quotes, illegal chars after closing quote, unterminated quote,
  quotes in unquoted fields, duplicates incl. unknown keys, bad keys, multi-`=` fields,
  whitespace trimming, leading zeros, all range bounds, COLOR case, missing required
  fields, format-vs-value precedence, `__proto__` key) — every result matched FORMAT.md.

## Artifacts
- `adapters/bundle.cjs` (repaired module)
- `report.md` (this file)

No packages, network, external files, delegation or test edits were used.
