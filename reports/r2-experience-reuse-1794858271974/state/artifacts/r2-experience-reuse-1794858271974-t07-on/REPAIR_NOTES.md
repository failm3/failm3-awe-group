# Repair notes — separated key/value record parser (t07 ON)

Mission: r2-experience-reuse-1794858271974-t07-on
Spec: FORMAT.md (sha256 e61c9cdd8a663c09debeef29d04b92e1dd17bf2182f8a6a020acdd28277bdeb2)
Module: src/export.cjs — CommonJS export `parseExport(text)`

## Implementation

Tokenizer records -> field list -> record builder.

- Records terminated by LF, CRLF or CR; a trailing terminator does not create an
  extra empty record; empty string returns `[]`. Empty records/lines are syntax
  errors (`INVALID_FORMAT`).
- Fields separated by literal `|`. An empty trailing field (`...|`) is an error
  because it has no `=`.
- Unquoted field: exactly one `=`, no `"` anywhere, key must match
  `[A-Z][A-Z0-9_]*` (checked after trimming does not apply to keys).
- Quoted field: whole field quoted; `""` decodes to `"`; may contain `|`, `=`,
  CR, LF; nothing may follow the closing quote except `|` or a record end;
  unterminated quote is an error. Quoted field text must still be `KEY=VALUE`
  with a valid key (may contain further `=` characters in the VALUE).
- Whitespace: leading/trailing whitespace trimmed from the decoded VALUE only
  (unknown values included). Keys and FLAGS members are not trimmed.
- Two-phase per record: all syntax/duplicate-key checks (`INVALID_FORMAT`) run
  before any semantics (`INVALID_VALUE`), so syntax errors win.
- Required: WINDOW 2..40, RATE 0..40, LIMIT 1..50, canonical unsigned decimal
  (`0` or no leading zero). Missing/invalid -> `INVALID_VALUE`.
- FLAGS optional: comma separated, one or more of cold/warm, no repeats, no
  other values -> array. COLOR (if present) is an unrecognized key and stays a
  string, inserted after known fields.
- Key insertion order: known schema order (WINDOW, RATE, LIMIT, FLAGS), then
  unknown keys in original record field order. Unknown values are strings;
  integers converted to JS numbers.
- All output keys written with `Object.defineProperty` so prototype-looking keys
  (`__proto__`, `constructor`, ...) are plain own data properties and the result
  prototype stays `Object.prototype`. `__proto__` parses as a *syntax* error only
  because `_` cannot start a key.

## Verification (all shell-run, node v22)

`node visible.test.cjs` -> `visible PASS`, exit 0 (test file untouched,
sha256 df487472fe9d5e08a66f3fac17636217361c82e030dc0d9e9ff7b9dd99487d70).

Extra ad-hoc cases exercised: empty input; LF/CRLF/CR mixes; quoted multi-line
values with `""`; whitespace trimming; unknown key ordering; duplicate keys;
lowercase keys; double `=` in unquoted values; unterminated quotes; text after a
closing quote; embedded quotes in unquoted fields; leading zeros; out-of-range
values; missing required fields; bad FLAGS (empty, repeats, other values);
blank line between records; trailing `|`; prototype-key handling.
