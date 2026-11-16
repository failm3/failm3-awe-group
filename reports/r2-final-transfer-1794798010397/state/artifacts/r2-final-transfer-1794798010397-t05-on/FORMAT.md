# Separated key/value records

Repair src/export.cjs, exporting CommonJS function `parseExport(text)`.

- UTF-8 JavaScript string input; empty string returns `[]`. Records use LF, CRLF, or CR.
- Each record has one or more fields separated by literal `|`. Each unquoted field is exactly `KEY=VALUE` with one equals sign; KEY matches `[A-Z][A-Z0-9_]*`.
- A whole field may be double quoted, including its key/value text. Inside quotes, two double quotes decode to one quote. Quotes may contain separators, equals signs, CR and LF. No characters may follow a closing quote except a separator or record ending. Unterminated quotes, quotes in unquoted fields, bad keys, and duplicate decoded keys throw `Error("INVALID_FORMAT")`.
- Whitespace policy: VALUE must already equal its trimmed form; otherwise INVALID_FORMAT.
- Unknown keys: retain decoded unknown string values in original record field order after known fields. A prototype-looking key is still data and must not alter the result prototype.
- Output is an array of ordinary own-key objects, in record order. Duplicate object key insertion order is known-field schema order, then retained unknown field order.

Required in every record: WINDOW, RATE, LIMIT. Missing or invalid required fields throw `Error("INVALID_VALUE")`.

- WINDOW: canonical unsigned decimal integer (0 or nonzero without leading zero), 3..20 inclusive.
- RATE: canonical unsigned decimal integer, 0..20 inclusive.
- LIMIT: canonical unsigned decimal integer, 1..150 inclusive.
- DURATION: decimal integer 1..30, inclusive.

Only the documented optional field is recognized. Convert valid integer values to JavaScript numbers; COLOR remains a string and FLAGS becomes an array. Syntax/duplicate/whitespace problems take precedence over semantic errors while parsing each record. Use exactly the error messages above, with no prefixes.
