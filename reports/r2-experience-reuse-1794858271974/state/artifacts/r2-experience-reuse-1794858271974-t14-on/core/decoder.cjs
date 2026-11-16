'use strict';

/**
 * Separated key/value record decoder.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR; empty input yields []
 *  - fields separated by ';', each field is KEY=VALUE (quoted field allowed as a whole)
 *  - KEY matches [A-Z][A-Z0-9_]*
 *  - "" inside a quoted field decodes to a single '"'
 *  - errors: Error('INVALID_FORMAT') / Error('INVALID_VALUE')
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (required fields first, then optional ones).
const SCHEMA_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

function fail(code) {
  throw new Error(code);
}

function isTerminator(ch) {
  return ch === '\r' || ch === '\n';
}

/**
 * Split the raw text into records; each record is an array of decoded field
 * strings (outer quotes removed and "" collapsed to '"').
 *
 * Syntax problems throw INVALID_FORMAT immediately:
 *  - unterminated quote
 *  - characters after a closing quote (other than a separator / record end)
 *  - quote appearing inside an unquoted field
 */
function splitRecords(text) {
  const records = [];
  let fields = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    // A line terminator at the very start of a record means a blank line: skip it.
    if (isTerminator(text[i])) {
      const ch = text[i];
      i += 1;
      if (ch === '\r' && text[i] === '\n') i += 1;
      continue;
    }

    let value;

    if (text[i] === '"') {
      // Whole-field quoted form.
      let out = '';
      let closed = false;
      i += 1;
      while (i < n) {
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            out += '"';
            i += 2;
          } else {
            i += 1;
            closed = true;
            break;
          }
        } else {
          out += ch;
          i += 1;
        }
      }
      if (!closed) fail('INVALID_FORMAT');
      value = out;

      // Nothing may follow the closing quote except a separator or record end.
      if (i < n) {
        const ch = text[i];
        if (ch !== ';' && !isTerminator(ch)) fail('INVALID_FORMAT');
      }
    } else {
      // Unquoted field: runs to the next separator or record terminator.
      let out = '';
      while (i < n) {
        const ch = text[i];
        if (ch === ';' || isTerminator(ch)) break;
        if (ch === '"') fail('INVALID_FORMAT');
        out += ch;
        i += 1;
      }
      value = out;
    }

    fields.push(value);

    if (i >= n) break;

    const ch = text[i];
    if (ch === ';') {
      i += 1;
      // A separator at end of input still opens one more (empty) field.
      if (i >= n) fields.push('');
      continue;
    }

    // Record terminator.
    i += 1;
    if (ch === '\r' && text[i] === '\n') i += 1;
    records.push(fields);
    fields = [];
  }

  if (fields.length > 0) records.push(fields);
  return records;
}

function parseCanonicalUint(raw, min, max) {
  if (!CANONICAL_UINT_RE.test(raw)) fail('INVALID_VALUE');
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < min || num > max) fail('INVALID_VALUE');
  return num;
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function decodeRecord(fields) {
  const seen = new Set();
  const values = new Map();
  const unknown = [];

  for (let f = 0; f < fields.length; f += 1) {
    const field = fields[f];
    const eq = field.indexOf('=');
    if (eq === -1) fail('INVALID_FORMAT');
    if (field.indexOf('=', eq + 1) !== -1) fail('INVALID_FORMAT');

    const key = field.slice(0, eq);
    if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
    if (seen.has(key)) fail('INVALID_FORMAT');
    seen.add(key);

    const value = field.slice(eq + 1).trim();
    if (SCHEMA_ORDER.indexOf(key) === -1) {
      unknown.push([key, value]);
    } else {
      values.set(key, value);
    }
  }

  // Semantic validation (syntax already settled for this record).
  if (!values.has('WINDOW')) fail('INVALID_VALUE');
  if (!values.has('RATE')) fail('INVALID_VALUE');
  if (!values.has('LIMIT')) fail('INVALID_VALUE');

  const window = parseCanonicalUint(values.get('WINDOW'), 3, 60);
  const rate = parseCanonicalUint(values.get('RATE'), 0, 30);
  const limit = parseCanonicalUint(values.get('LIMIT'), 1, 75);

  let color;
  if (values.has('COLOR')) {
    color = values.get('COLOR');
    if (color !== 'teal' && color !== 'gold') fail('INVALID_VALUE');
  }

  let flags;
  if (values.has('FLAGS')) {
    const raw = values.get('FLAGS');
    flags = raw === '' ? [] : raw.split(',');
  }

  const record = {};
  defineOwn(record, 'WINDOW', window);
  defineOwn(record, 'RATE', rate);
  defineOwn(record, 'LIMIT', limit);
  if (color !== undefined) defineOwn(record, 'COLOR', color);
  if (flags !== undefined) defineOwn(record, 'FLAGS', flags);
  for (let u = 0; u < unknown.length; u += 1) {
    defineOwn(record, unknown[u][0], unknown[u][1]);
  }
  return record;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') fail('INVALID_FORMAT');
  if (text.length === 0) return [];

  const rawRecords = splitRecords(text);
  const out = [];
  for (let r = 0; r < rawRecords.length; r += 1) {
    out.push(decodeRecord(rawRecords[r]));
  }
  return out;
}

module.exports = { decodeSeparated };
