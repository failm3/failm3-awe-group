'use strict';

/**
 * Separated key/value record parser (see FORMAT.md).
 *
 * Grammar:
 *   - Records end with LF, CRLF or CR. A single line ending after the last
 *     record is accepted as its terminator.
 *   - A record has one or more fields separated by a literal `;`.
 *   - Unquoted field: exactly `KEY=VALUE` with one `=` and no `"`.
 *   - Quoted field: the whole field in double quotes; `""` decodes to `"`.
 *     The quoted text may contain `;`, `=`, CR and LF. Only a separator, a
 *     record ending or end of input may follow the closing quote.
 *   - KEY matches [A-Z][A-Z0-9_]*. The decoded field is split at its first
 *     `=`; only VALUE is trimmed.
 *
 * Errors: Error("INVALID_FORMAT") for syntax/duplicate/key problems,
 * Error("INVALID_VALUE") for missing or invalid known fields. Within a
 * record, every syntax check runs before any semantic check.
 */

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order; this also defines output key order.
// COLOR is the only documented optional field, so every other key
// (including FLAGS) is unknown and dropped.
const INT_FIELDS = [
  ['WINDOW', 2, 20],
  ['RATE', 0, 30],
  ['LIMIT', 1, 125],
];
const COLOR_VALUES = new Set(['red', 'blue']);

function fail(code) {
  throw new Error(code);
}

function isLineEnd(ch) {
  return ch === '\n' || ch === '\r';
}

/**
 * Tokenize one field starting at `pos`.
 * Returns { text, quoted, end } where `end` is the index just after the field.
 */
function readField(text, pos) {
  const n = text.length;

  if (text[pos] === '"') {
    let i = pos + 1;
    let decoded = '';
    for (;;) {
      if (i >= n) fail(INVALID_FORMAT); // unterminated quote
      const ch = text[i];
      if (ch === '"') {
        if (text[i + 1] === '"') {
          decoded += '"';
          i += 2;
          continue;
        }
        i += 1;
        break;
      }
      decoded += ch;
      i += 1;
    }
    if (i < n && text[i] !== ';' && !isLineEnd(text[i])) {
      fail(INVALID_FORMAT); // characters after a closing quote
    }
    return { text: decoded, quoted: true, end: i };
  }

  let i = pos;
  while (i < n && text[i] !== ';' && !isLineEnd(text[i])) {
    if (text[i] === '"') fail(INVALID_FORMAT); // quote in unquoted field
    i += 1;
  }
  return { text: text.slice(pos, i), quoted: false, end: i };
}

function parseUint(raw, min, max) {
  if (!CANONICAL_UINT_RE.test(raw)) fail(INVALID_VALUE);
  const n = Number(raw);
  if (n < min || n > max) fail(INVALID_VALUE);
  return n;
}

/** Validate a record's fields (syntax first, then semantics) and build it. */
function buildRecord(fields) {
  const values = new Map();

  // Syntax and duplicate validation for every field, known or unknown.
  for (const { text, quoted } of fields) {
    const eq = text.indexOf('=');
    if (eq === -1) fail(INVALID_FORMAT);
    if (!quoted && text.indexOf('=', eq + 1) !== -1) fail(INVALID_FORMAT);
    const key = text.slice(0, eq);
    if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
    if (values.has(key)) fail(INVALID_FORMAT);
    values.set(key, text.slice(eq + 1).trim());
  }

  // Semantic validation; unknown keys are simply not copied.
  const out = {};
  for (const [key, min, max] of INT_FIELDS) {
    if (!values.has(key)) fail(INVALID_VALUE);
    out[key] = parseUint(values.get(key), min, max);
  }
  if (values.has('COLOR')) {
    const color = values.get('COLOR');
    if (!COLOR_VALUES.has(color)) fail(INVALID_VALUE);
    out.COLOR = color;
  }
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  if (text === '') return [];

  const n = text.length;
  const records = [];
  let pos = 0;

  while (pos < n) {
    const fields = [];
    for (;;) {
      const field = readField(text, pos);
      fields.push(field);
      pos = field.end;
      if (pos < n && text[pos] === ';') {
        pos += 1; // another field must follow (possibly empty -> error)
        continue;
      }
      // End of input or a record ending.
      if (pos < n) {
        pos += text[pos] === '\r' && text[pos + 1] === '\n' ? 2 : 1;
      }
      break;
    }
    records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { readInput };
