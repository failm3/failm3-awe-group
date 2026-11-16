# Test run: core/decoder.cjs

Command: `node visible.test.cjs` (unmodified visible test)
Output: `visible PASS` (exit 0)

Additional ad-hoc spec checks (temporary script in /tmp, removed afterward; not saved into workspace): `extra PASS`.
Covered: empty input, LF/CRLF/CR record endings, single trailing record ending, quoted fields with `""`, `;`, `=`, LF inside quotes,
text after closing quote, unterminated quote, quote inside unquoted field, bad keys, multiple `=` in unquoted fields,
duplicate keys (including duplicates of dropped unknown keys), untrimmed values, empty fields/records,
unknown-key dropping, normal Object prototype, schema key order (WINDOW, RATE, LIMIT),
range and canonical-integer checks for WINDOW 3..40, RATE 0..10, LIMIT 1..75, missing required fields,
and format errors taking precedence over value errors within a record.

Spec ambiguity: FORMAT.md says "No additional semantic field is defined" and also mentions an unnamed
"documented optional field" plus COLOR/FLAGS. No optional field is actually defined, so COLOR and FLAGS
are treated as unknown keys and dropped.
