'use strict';

/*
 * Separated key/value record parser (see FORMAT.md).
 *
 * Grammar notes:
 *  - Records are terminated by LF, CRLF, or CR (outside of quoted fields).
 *  - Fields inside a record are separated by a literal '|' (outside of quotes).
 *  - A field is either bare (KEY=VALUE, exactly one '=') or entirely wrapped in
 *    double quotes. Inside quotes, "" decodes to a single quote, and separators,
 *    '=', CR and LF are ordinary content. Nothing but a separator, a record
 *    terminator or end-of-input may follow a closing quote.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

// Known-field schema order (also the key insertion order of each result object).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS'];

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

function isTerminator(ch) {
  return ch === '\n' || ch === '\r';
}

function defineOwn(obj, key, value) {
  // Safe for prototype-looking keys: always creates a plain own data property.
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function parseCanonicalUInt(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) invalidValue();
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < min || num > max) invalidValue();
  return num;
}

function parseDecimalInt(value, min, max) {
  if (!DECIMAL_INT_RE.test(value)) invalidValue();
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num < min || num > max) invalidValue();
  return num;
}

function readInput(text) {
  if (typeof text !== 'string') invalidFormat();

  const n = text.length;
  if (n === 0) return [];

  const results = [];
  let i = 0;

  while (i < n) {
    // A record must contain at least one field.
    if (isTerminator(text[i])) invalidFormat();

    const values = new Map(); // decoded key -> decoded value, per record
    const seen = new Set(); // duplicate detection over decoded keys

    for (;;) {
      const field = scanField();
      const raw = field.text;

      const eq = raw.indexOf('=');
      if (eq < 0) invalidFormat();
      // Quoting may contain equals signs; a bare field must have exactly one.
      if (!field.quoted && raw.indexOf('=', eq + 1) >= 0) invalidFormat();

      const key = raw.slice(0, eq);
      const value = raw.slice(eq + 1);

      if (!KEY_RE.test(key)) invalidFormat();
      if (seen.has(key)) invalidFormat(); // duplicate decoded key
      if (value !== value.trim()) invalidFormat(); // whitespace policy

      seen.add(key);
      values.set(key, value);

      if (i >= n) break; // end of input ends the record

      const ch = text[i];
      if (ch === '|') {
        i += 1;
        if (i >= n) invalidFormat(); // trailing separator => empty field
        if (isTerminator(text[i])) invalidFormat(); // empty field
        continue; // next field of the same record
      }

      if (isTerminator(ch)) {
        if (ch === '\r' && text[i + 1] === '\n') i += 2;
        else i += 1;
        break; // record ends
      }

      // scanField already guarantees one of the above after a field.
      invalidFormat();
    }

    results.push(buildRecord(values));
  }

  return results;

  // ---- local helpers (close over text / i) ----

  function scanField() {
    if (text[i] === '"') {
      // Fully quoted field.
      i += 1;
      let out = '';
      let closed = false;

      while (i < n) {
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            out += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        out += ch; // quotes may contain separators, '=', CR and LF
        i += 1;
      }

      if (!closed) invalidFormat(); // unterminated quote

      if (i < n) {
        const next = text[i];
        if (!(next === '|' || isTerminator(next))) invalidFormat();
      }

      return { text: out, quoted: true };
    }

    // Bare field: runs until a separator or a record terminator.
    let out = '';
    while (i < n) {
      const ch = text[i];
      if (ch === '|' || isTerminator(ch)) break;
      if (ch === '"') invalidFormat(); // quotes in unquoted fields
      out += ch;
      i += 1;
    }
    return { text: out, quoted: false };
  }

  function buildRecord(values) {
    if (!values.has('WINDOW') || !values.has('RATE') || !values.has('LIMIT')) {
      invalidValue(); // missing required field
    }

    const record = {};

    for (const key of SCHEMA) {
      if (!values.has(key)) continue;
      const raw = values.get(key);

      switch (key) {
        case 'WINDOW':
          defineOwn(record, key, parseCanonicalUInt(raw, 1, 60));
          break;
        case 'RATE':
          defineOwn(record, key, parseCanonicalUInt(raw, 0, 20));
          break;
        case 'LIMIT':
          defineOwn(record, key, parseCanonicalUInt(raw, 1, 100));
          break;
        case 'DURATION':
          defineOwn(record, key, parseDecimalInt(raw, 1, 150));
          break;
        case 'COLOR':
          defineOwn(record, key, raw); // stays a string
          break;
        case 'FLAGS':
          defineOwn(
            record,
            key,
            raw
              .split(',')
              .map((part) => part.trim())
              .filter((part) => part !== '')
          ); // becomes an array
          break;
        default:
          break; // unknown keys were dropped before reaching this point
      }
    }

    return record;
  }
}

module.exports = { readInput };
