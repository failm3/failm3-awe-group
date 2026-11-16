'use strict';

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

// Known-field schema order; also the output key insertion order.
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const INTEGER_FIELDS = {
  WINDOW: { min: 2, max: 20 },
  RATE: { min: 0, max: 30 },
  LIMIT: { min: 1, max: 125 }
};
const COLORS = ['red', 'blue'];

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
// Canonical unsigned decimal integer: 0, or a nonzero digit run with no
// leading zero. No sign, no whitespace (VALUE is already trimmed).
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

function fail(code) {
  throw new Error(code);
}

// Single-pass scan: records are separated by LF / CRLF / CR, but only outside
// quoted fields, since quotes may legally contain CR and LF.
function scanRecords(text) {
  const n = text.length;
  const records = [];
  let fields = [];
  let i = 0;

  while (i < n) {
    let field = '';

    if (text[i] === '"') {
      // Whole field is quoted; a doubled quote decodes to one quote.
      i++;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        field += c;
        i++;
      }
      if (!closed) fail(INVALID_FORMAT);           // unterminated quote
      if (i < n) {
        const after = text[i];
        // Nothing may follow a closing quote except a separator or record end.
        if (after !== ';' && after !== '\r' && after !== '\n') fail(INVALID_FORMAT);
      }
    } else {
      while (i < n) {
        const c = text[i];
        if (c === ';' || c === '\r' || c === '\n') break;
        if (c === '"') fail(INVALID_FORMAT);        // quote inside unquoted field
        field += c;
        i++;
      }
    }

    fields.push(field);

    if (i >= n) break;

    if (text[i] === ';') {
      i++;
      if (i >= n) fail(INVALID_FORMAT);             // dangling separator => empty field
      continue;
    }

    // Record terminator.
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i++;

    if (fields.length === 1 && fields[0] === '') fields = [];   // blank line
    else {
      records.push(fields);
      fields = [];
    }
  }

  if (fields.length > 0) records.push(fields);
  return records;
}

function decodeField(field) {
  const eq = field.indexOf('=');
  if (eq < 0) fail(INVALID_FORMAT);
  if (field.indexOf('=', eq + 1) !== -1) fail(INVALID_FORMAT);

  const key = field.slice(0, eq);
  if (!KEY_RE.test(key)) fail(INVALID_FORMAT);

  // Whitespace policy: trim only the decoded VALUE.
  return [key, field.slice(eq + 1).trim()];
}

function parseRecord(fields) {
  const values = new Map();

  // Pass 1: syntax and duplicate-key validation (takes precedence).
  for (const field of fields) {
    const [key, value] = decodeField(field);
    if (values.has(key)) fail(INVALID_FORMAT);
    values.set(key, value);
  }

  // Pass 2: semantic validation, emitting keys in schema order so unknown
  // keys are dropped without ever touching the result prototype.
  const record = {};
  for (const key of SCHEMA) {
    const present = values.has(key);

    if (Object.prototype.hasOwnProperty.call(INTEGER_FIELDS, key)) {
      if (!present) fail(INVALID_VALUE);
      const raw = values.get(key);
      if (!UINT_RE.test(raw)) fail(INVALID_VALUE);
      const num = Number(raw);
      const { min, max } = INTEGER_FIELDS[key];
      if (num < min || num > max) fail(INVALID_VALUE);
      record[key] = num;
      continue;
    }

    if (!present) continue;

    const raw = values.get(key);

    if (key === 'COLOR') {
      if (!COLORS.includes(raw)) fail(INVALID_VALUE);
      record[key] = raw;
      continue;
    }

    // FLAGS: the only documented optional list field -> array of strings.
    record[key] = raw === ''
      ? []
      : raw.split(',').map((part) => part.trim()).filter((part) => part !== '');
  }

  return record;
}

function readInput(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  if (text === '') return [];
  return scanRecords(text).map(parseRecord);
}

module.exports = { readInput };
