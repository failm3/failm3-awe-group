'use strict';

/**
 * Parser for the separated key/value record format described in FORMAT.md.
 *
 * Records are separated by LF, CRLF or CR. Fields are separated by a literal
 * `|`. Each field is `KEY=VALUE`, optionally wholly double quoted (with `""`
 * decoding to a single `"`). Values are whitespace-trimmed; unknown keys are
 * retained after the known schema keys.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const KNOWN_FIELD_SET = new Set(KNOWN_FIELDS);
const FLAG_VALUES = new Set(['cold', 'warm']);

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

/**
 * Reads a single field starting at `start`.
 * Returns the decoded field text plus the index of the first character after
 * the field (a separator, a record terminator, or end of input).
 */
function readField(text, start) {
  const n = text.length;

  if (start < n && text[start] === '"') {
    let i = start + 1;
    let decoded = '';
    let closed = false;
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        if (text[i + 1] === '"') {
          decoded += '"';
          i += 2;
          continue;
        }
        closed = true;
        i += 1;
        break;
      }
      decoded += c;
      i += 1;
    }
    if (!closed) invalidFormat();
    if (i < n) {
      const after = text[i];
      if (after !== '|' && after !== '\n' && after !== '\r') invalidFormat();
    }
    return { value: decoded, next: i };
  }

  let i = start;
  let decoded = '';
  while (i < n) {
    const c = text[i];
    if (c === '|' || c === '\n' || c === '\r') break;
    if (c === '"') invalidFormat();
    decoded += c;
    i += 1;
  }
  return { value: decoded, next: i };
}

function readInteger(raw, min, max) {
  if (!CANONICAL_UINT_RE.test(raw)) invalidValue();
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < min || num > max) invalidValue();
  return num;
}

function readFlags(raw) {
  const parts = raw.split(',');
  const seen = new Set();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!FLAG_VALUES.has(part)) invalidValue();
    if (seen.has(part)) invalidValue();
    seen.add(part);
  }
  return parts;
}

function buildRecord(fields) {
  const values = new Map();

  // Phase 1: syntax, key validity and duplicate detection for the whole record.
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const eq = field.indexOf('=');
    if (eq < 0) invalidFormat();
    if (field.indexOf('=', eq + 1) !== -1) invalidFormat();
    const key = field.slice(0, eq);
    if (!KEY_RE.test(key)) invalidFormat();
    if (values.has(key)) invalidFormat();
    values.set(key, field.slice(eq + 1).trim());
  }

  // Phase 2: semantics.
  const record = {};
  const set = (key, value) => {
    Object.defineProperty(record, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  if (!values.has('WINDOW')) invalidValue();
  set('WINDOW', readInteger(values.get('WINDOW'), 2, 40));

  if (!values.has('RATE')) invalidValue();
  set('RATE', readInteger(values.get('RATE'), 0, 40));

  if (!values.has('LIMIT')) invalidValue();
  set('LIMIT', readInteger(values.get('LIMIT'), 1, 50));

  if (values.has('COLOR')) set('COLOR', values.get('COLOR'));
  if (values.has('FLAGS')) set('FLAGS', readFlags(values.get('FLAGS')));

  // Unknown keys keep their original record field order, after known fields.
  for (const [key, value] of values) {
    if (!KNOWN_FIELD_SET.has(key)) set(key, value);
  }

  return record;
}

function parseExport(text) {
  if (typeof text !== 'string') invalidFormat();

  const n = text.length;
  if (n === 0) return [];

  const records = [];
  let i = 0;

  for (;;) {
    const fields = [];
    for (;;) {
      const field = readField(text, i);
      fields.push(field.value);
      i = field.next;

      if (i >= n) break;

      const c = text[i];
      if (c === '|') {
        i += 1;
        continue;
      }
      // Record terminator.
      if (c === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
      break;
    }

    records.push(buildRecord(fields));

    // A trailing terminator at end of input does not start another record.
    if (i >= n) break;
  }

  return records;
}

module.exports = { parseExport };
