'use strict';

// Separated key/value record decoder (see FORMAT.md).
// Text is a sequence of records; records end with LF, CRLF or CR and contain
// one or more `|`-separated fields of the form KEY=VALUE (optionally whole-field
// double quoted).

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order. Required fields are WINDOW, RATE, LIMIT; the
// documented optional fields are FLAGS and COLOR.
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const INT_RANGES = {
  WINDOW: [1, 20],
  RATE: [0, 40],
  LIMIT: [1, 100],
};
const FLAG_VALUES = ['fast', 'safe'];

function fail(message) {
  throw new Error(message);
}

// Split a decoded field body (`KEY=VALUE` after quote decoding) into key/value.
// `exactlyOneEquals` enforces the stricter unquoted-field rule.
function splitField(body, exactlyOneEquals) {
  const eq = body.indexOf('=');
  if (eq === -1) fail(INVALID_FORMAT);
  if (exactlyOneEquals && body.indexOf('=', eq + 1) !== -1) fail(INVALID_FORMAT);
  const key = body.slice(0, eq);
  if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
  return { key, value: body.slice(eq + 1).trim() };
}

// Parse one record starting at `start`. Returns { fields, next }.
function parseRecord(text, start) {
  const n = text.length;
  const fields = [];
  const seen = new Set();
  let i = start;

  for (;;) {
    let field;
    if (i < n && text.charCodeAt(i) === 34 /* " */) {
      // Whole-field quoted field: no escapes other than a doubled quote.
      i += 1;
      let body = '';
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            body += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        body += c;
        i += 1;
      }
      if (!closed) fail(INVALID_FORMAT);
      if (i < n) {
        const c = text[i];
        if (c !== '|' && c !== '\n' && c !== '\r') fail(INVALID_FORMAT);
      }
      field = splitField(body, false);
    } else {
      // Unquoted field: quotes are illegal, exactly one '=' allowed.
      let end = i;
      while (end < n) {
        const c = text[end];
        if (c === '|' || c === '\n' || c === '\r') break;
        if (c === '"') fail(INVALID_FORMAT);
        end += 1;
      }
      field = splitField(text.slice(i, end), true);
      i = end;
    }

    if (seen.has(field.key)) fail(INVALID_FORMAT);
    seen.add(field.key);
    fields.push(field);

    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === '|') {
      i += 1;
      continue;
    }
    if (c === '\r' && text[i + 1] === '\n') return { fields, next: i + 2 };
    return { fields, next: i + 1 };
  }
}

function toNumber(key, value) {
  const [min, max] = INT_RANGES[key];
  if (!CANONICAL_UINT_RE.test(value)) fail(INVALID_VALUE);
  const num = Number(value);
  if (num < min || num > max) fail(INVALID_VALUE);
  return num;
}

function toFlags(value) {
  const parts = value.split(',');
  if (parts.length === 0) fail(INVALID_VALUE);
  const out = [];
  for (const part of parts) {
    if (FLAG_VALUES.indexOf(part) === -1) fail(INVALID_VALUE);
    if (out.indexOf(part) !== -1) fail(INVALID_VALUE);
    out.push(part);
  }
  if (out.length === 0) fail(INVALID_VALUE);
  return out;
}

function convert(key, value) {
  if (key === 'FLAGS') return toFlags(value);
  if (key === 'WINDOW' || key === 'RATE' || key === 'LIMIT') return toNumber(key, value);
  return value; // COLOR and unknown keys stay strings
}

function defineField(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(fields) {
  const decoded = new Map();
  for (const field of fields) decoded.set(field.key, field.value);

  for (const key of REQUIRED) {
    if (!decoded.has(key)) fail(INVALID_VALUE);
  }

  // Convert before building so semantic errors win over nothing partially built.
  const converted = new Map();
  for (const [key, value] of decoded) {
    if (KNOWN_ORDER.indexOf(key) !== -1) converted.set(key, convert(key, value));
  }

  const record = {};
  for (const key of KNOWN_ORDER) {
    if (converted.has(key)) defineField(record, key, converted.get(key));
  }
  for (const field of fields) {
    if (KNOWN_ORDER.indexOf(field.key) === -1) defineField(record, field.key, field.value);
  }
  return record;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  if (text === '') return [];

  const records = [];
  let pos = 0;
  const n = text.length;
  while (pos < n) {
    const parsed = parseRecord(text, pos);
    records.push(buildRecord(parsed.fields));
    pos = parsed.next;
  }
  return records;
}

module.exports = { decodeSeparated };
