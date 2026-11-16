'use strict';

/*
 * Separated key/value records parser.
 *
 * Implements FORMAT.md:
 *  - records are separated by LF, CRLF or CR; empty input yields []
 *  - fields inside a record are separated by a literal '|'
 *  - an unquoted field is exactly KEY=VALUE (one '='), KEY matches [A-Z][A-Z0-9_]*
 *  - a whole field may be double quoted (quotes may contain '|', '=', CR, LF);
 *    inside quotes "" decodes to a single '"'
 *  - nothing may follow a closing quote except '|', a record ending or EOF
 *  - VALUE must already equal its trimmed form
 *  - unknown keys are dropped *after* syntax/duplicate validation
 *  - WINDOW/RATE/LIMIT are required; DURATION is the only recognized
 *    optional field, so every other key (including COLOR/FLAGS) is unknown
 */

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

// Known-field schema order (used for output key insertion order).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'DURATION'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED_RE = /^(?:0|[1-9][0-9]*)$/; // no sign, no leading zero
const DECIMAL_INTEGER_RE = /^-?[0-9]+$/;

const RANGES = {
  WINDOW: [2, 30],
  RATE: [0, 20],
  LIMIT: [1, 50],
  DURATION: [1, 60]
};

function fail(message) {
  throw new Error(message);
}

/**
 * Split the raw text into records of decoded field strings.
 * Quotes are honoured while scanning, so '|', CR and LF inside quotes stay
 * part of the field. A record separator that terminates the final record at
 * end-of-input does not create a trailing empty record.
 */
function splitRecords(text) {
  const n = text.length;
  if (n === 0) return [];

  const records = [];
  let fields = [];
  let i = 0;

  while (i < n) {
    let field = '';

    if (text[i] === '"') {
      // Whole-field quoted form.
      i += 1;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        field += c;
        i += 1;
      }
      if (!closed) fail(INVALID_FORMAT);
      if (i < n) {
        const c = text[i];
        if (c !== '|' && c !== '\n' && c !== '\r') fail(INVALID_FORMAT);
      }
    } else {
      while (i < n) {
        const c = text[i];
        if (c === '|' || c === '\n' || c === '\r') break;
        if (c === '"') fail(INVALID_FORMAT); // quotes in unquoted fields
        field += c;
        i += 1;
      }
    }

    fields.push(field);

    if (i >= n) {
      records.push(fields);
      return records;
    }

    const sep = text[i];
    if (sep === '|') {
      i += 1;
      continue;
    }

    // Record separator: CRLF counts as one, CR and LF on their own as one.
    i += sep === '\r' && text[i + 1] === '\n' ? 2 : 1;
    records.push(fields);
    fields = [];
    if (i >= n) return records; // separator terminated the last record
  }

  records.push(fields);
  return records;
}

function defineField(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

function parseInteger(raw, key) {
  const [min, max] = RANGES[key];
  if (key === 'DURATION') {
    if (!DECIMAL_INTEGER_RE.test(raw)) fail(INVALID_VALUE);
  } else if (!CANONICAL_UNSIGNED_RE.test(raw)) {
    fail(INVALID_VALUE);
  }
  const num = Number(raw);
  if (num < min || num > max) fail(INVALID_VALUE);
  return num;
}

function parseRecord(fields) {
  // Pass 1: syntax, whitespace and duplicate validation for the whole record.
  const values = new Map();
  for (const field of fields) {
    const eq = field.indexOf('=');
    if (eq === -1) fail(INVALID_FORMAT);
    if (field.indexOf('=', eq + 1) !== -1) fail(INVALID_FORMAT);

    const key = field.slice(0, eq);
    const value = field.slice(eq + 1);

    if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
    if (value !== value.trim()) fail(INVALID_FORMAT);
    if (values.has(key)) fail(INVALID_FORMAT); // duplicate decoded key

    values.set(key, value);
  }

  // Pass 2: semantics (precedence over -- never mixed with -- pass 1).
  for (const key of REQUIRED) {
    if (!values.has(key)) fail(INVALID_VALUE);
  }

  const record = {};
  for (const key of SCHEMA) {
    if (!values.has(key)) continue;
    const parsed = parseInteger(values.get(key), key);
    defineField(record, key, parsed);
  }
  return record;
}

function parseRecords(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  if (text.length === 0) return [];
  return splitRecords(text).map(parseRecord);
}

module.exports = { parseRecords };
