# Test run: core/decoder.cjs

Command: `node visible.test.cjs` (test file unmodified)
Output: `visible PASS`, exit code 0

Additional ad-hoc checks against FORMAT.md (all matched expected behavior):
- Empty string returns []. LF, CRLF and CR records parse; a final record ending does not create an extra record.
- Whole-field quoting works: `""` decodes to `"`, and quoted fields can contain `;`, `=`, CR and LF. Text after a closing quote, unterminated quotes, quotes inside unquoted fields, a second `=` in an unquoted field, bad keys, empty fields and duplicate decoded keys (including one quoted and one unquoted copy) all throw INVALID_FORMAT.
- VALUE trimming applies, including inside quoted fields.
- Values that are non-canonical (e.g. leading zero), out of range, missing, or a COLOR outside the case-sensitive set teal/gold throw INVALID_VALUE.
- A syntax error takes precedence over a semantic error in the same record.
- Unknown keys are dropped. Prototype-looking keys never change the result's prototype.
- Output key order follows the schema (WINDOW, RATE, LIMIT, COLOR), whatever the input order.

Spec note: FORMAT.md says "FLAGS becomes an array", but it documents no FLAGS field and says only the documented optional field (COLOR) is recognized. FLAGS is therefore treated as an unknown key and dropped.
