'use strict';

/**
 * Parser for separated key/value records (see FORMAT.md).
 *
 * Record separator : LF, CRLF or CR (unless inside quotes)
 * Field separator  : ';' (unless inside quotes)
 * Field            : KEY=VALUE, or a whole double quoted field where two
 *                    double quotes decode to one double quote.
 */

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order used for object key insertion order.
const FIELD_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

const REQUIRED_RANGES = [
  ['WINDOW', 2, 30],
  ['RATE', 0, 10],
  ['LIMIT', 1, 125],
];

const STRING_FIELD = 'COLOR';
const LIST_FIELD = 'FLAGS';

const QUOTE = 34; // '"'
const SEMICOLON = 59; // ';'
const CR = 13;
const LF = 10;

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

function defineOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Split a raw (already quote-decoded) field into key/value.
function splitField(text, quoted) {
  const eq = text.indexOf('=');
  if (eq < 0) invalidFormat();

  const key = text.slice(0, eq);
  const value = text.slice(eq + 1);

  if (!KEY_PATTERN.test(key)) invalidFormat();
  // Unquoted fields carry exactly one equals sign; quotes may carry more.
  if (!quoted && value.indexOf('=') !== -1) invalidFormat();
  // VALUE must already equal its trimmed form.
  if (value !== value.trim()) invalidFormat();

  return { key, value };
}

// Scan one record starting at `start`; returns decoded fields + end offset.
// The end offset is the record separator (CR/LF) or end of input.
function scanRecord(text, start) {
  const n = text.length;
  let pos = start;
  const fields = [];

  for (;;) {
    let raw;
    let quoted = false;

    if (pos < n && text.charCodeAt(pos) === QUOTE) {
      quoted = true;
      pos += 1;
      let decoded = '';
      for (;;) {
        if (pos >= n) invalidFormat(); // unterminated quote
        if (text.charCodeAt(pos) === QUOTE) {
          if (pos + 1 < n && text.charCodeAt(pos + 1) === QUOTE) {
            decoded += '"';
            pos += 2;
            continue;
          }
          pos += 1; // closing quote
          break;
        }
        decoded += text[pos];
        pos += 1;
      }
      if (pos < n) {
        const code = text.charCodeAt(pos);
        if (code !== SEMICOLON && code !== CR && code !== LF) invalidFormat();
      }
      raw = decoded;
    } else {
      const fieldStart = pos;
      while (pos < n) {
        const code = text.charCodeAt(pos);
        if (code === SEMICOLON || code === CR || code === LF) break;
        pos += 1;
      }
      raw = text.slice(fieldStart, pos);
      if (raw.indexOf('"') !== -1) invalidFormat(); // quote in unquoted field
    }

    fields.push(splitField(raw, quoted));

    if (pos < n && text.charCodeAt(pos) === SEMICOLON) {
      pos += 1;
      continue;
    }
    break;
  }

  return { fields, end: pos };
}

function parseFlags(value) {
  if (value === '') return [];
  const parts = [];
  for (const piece of value.split(',')) {
    const flag = piece.trim();
    if (flag !== '') parts.push(flag);
  }
  return parts;
}

// Turn one record's raw fields into the output object.
function buildRecord(fields) {
  const seen = new Set();
  const map = new Map();

  // Syntax/duplicate/whitespace validation first, in field order.
  for (const field of fields) {
    if (seen.has(field.key)) invalidFormat();
    seen.add(field.key);
    map.set(field.key, field.value);
  }

  // Semantic validation of required fields.
  for (const [key, min, max] of REQUIRED_RANGES) {
    if (!map.has(key)) invalidValue();
    const raw = map.get(key);
    if (!CANONICAL_UINT.test(raw)) invalidValue();
    const num = Number(raw);
    if (!(num >= min && num <= max)) invalidValue();
  }

  // Known fields only, in schema order; unknown keys were already validated
  // (syntax + duplicates) and are dropped here.
  const record = {};
  for (const key of FIELD_ORDER) {
    if (!map.has(key)) continue;
    const raw = map.get(key);
    let value;
    if (key === STRING_FIELD) value = raw;
    else if (key === LIST_FIELD) value = parseFlags(raw);
    else value = Number(raw);
    defineOwn(record, key, value);
  }
  return record;
}

function parseBundle(text) {
  if (typeof text !== 'string') invalidFormat();

  const n = text.length;
  const result = [];
  let pos = 0;

  while (pos < n) {
    const code = text.charCodeAt(pos);
    if (code === CR || code === LF) {
      // Empty record: contributes nothing.
      pos += 1;
      continue;
    }
    const scanned = scanRecord(text, pos);
    result.push(buildRecord(scanned.fields));
    pos = scanned.end;
  }

  return result;
}

module.exports = { parseBundle };
