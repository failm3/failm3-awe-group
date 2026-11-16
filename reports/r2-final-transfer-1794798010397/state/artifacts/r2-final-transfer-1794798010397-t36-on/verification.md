# parseBundle verification

Command: `node visible.test.cjs` (test file unmodified) -> `visible PASS`, exit 0.

Extra edge cases checked against FORMAT.md:
- "" -> []; LF, CRLF, CR record endings; trailing record ending allowed
- Quoted whole fields with `;`, `=`, `""`, LF inside; quoted required field (`"WINDOW=2"`) accepted
- Known fields output first (WINDOW, RATE, LIMIT), then unknown fields as strings in source order
- INVALID_FORMAT: value whitespace, two `=` in unquoted field, duplicate key, text after closing quote,
  quote inside unquoted field, unterminated quote, lowercase key, empty field (trailing `;`), blank line
- INVALID_VALUE: missing required, leading zero, `+2`, out-of-range values
- Format errors win over semantic errors within a record (`WINDOW=99;...;WINDOW=1` -> INVALID_FORMAT)
- Result objects have Object.prototype; keys set with defineProperty
