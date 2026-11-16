# Mission r2-experience-reuse-1794858271974-t07-off — Separated record parser 07 OFF

## What was done
Repaired `src/export.cjs` so `parseExport(text)` implements the full FORMAT.md grammar
(the original stub split on lines and `=` with no quoting, validation, or ordering rules).

## Implementation summary
- Record separators: LF, CRLF, CR (blank input `""` -> `[]`).
- Field tokenizer over literal `|` separators with a quote-aware state:
  - Unquoted field: exactly one `=`; contains a `"` -> `INVALID_FORMAT`; key must match
    `[A-Z][A-Z0-9_]*`.
  - Whole-field quoting: `""` decodes to `"`; separators, `=`, CR and LF allowed inside;
    any character after the closing quote other than `|`, CR, LF or EOF -> `INVALID_FORMAT`;
    unterminated quote -> `INVALID_FORMAT`.
- Per-record two-phase parse: full syntax pass (fields, quotes, keys, duplicate decoded keys)
  completes before any semantic validation, so syntax/duplicate errors win over value errors.
- Whitespace: only decoded VALUEs are trimmed.
- Semantics: WINDOW `0|[1-9][0-9]*` in 2..40, RATE 0..40, LIMIT 1..50, all required ->
  `INVALID_VALUE`; FLAGS = one or more comma-separated, non-repeating `cold|warm` -> array.
- Numbers converted with `Number`; `COLOR` and unknown keys stay strings.
- Key insertion order: WINDOW, RATE, LIMIT, FLAGS (when present), then unknown keys in record
  field order. Keys are written with `Object.defineProperty`, so `__proto__`/`constructor`-style
  keys stay plain data and the result prototype is untouched.
- Errors are exactly `new Error("INVALID_FORMAT")` / `new Error("INVALID_VALUE")` with no prefix.
- Module still exports `{ parseExport }` (CommonJS).

## Verification
- `node visible.test.cjs` -> `visible PASS` (test file unmodified).
- Extra ad-hoc checks (run via `node -e`, not saved as tests per scope rules): mixed CRLF/CR/LF
  multi-record input, quoted keys/values with embedded `|`, `=`, `""` and newlines, trailing
  newline handling, `COLOR` trimming, FLAGS quoting/order, canonical-integer rejections
  (`03`, out-of-range), duplicate keys, bad keys, quotes in unquoted fields, junk after a
  closing quote, missing required fields, and `CONSTRUCTOR`/`__PROTO__` prototype safety.

## Artifacts
- `src/export.cjs` — repaired parser (mission artifact)
- `REPORT.md` — this report

## Issues
None. No packages, network, external files, delegation, or test modifications were used.
