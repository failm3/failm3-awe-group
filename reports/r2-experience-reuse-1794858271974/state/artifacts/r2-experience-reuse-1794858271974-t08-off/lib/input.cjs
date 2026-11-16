'use strict';

// FORMAT.md: separated key/value records.
// readInput(text) -> array of ordinary own-key objects, in record order.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const DIGITS_RE = /^[0-9]+$/;

// Known-field schema order: required fields first, then the documented optional ones.
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const KNOWN = new Set(SCHEMA);

function fail(message) {
  throw new Error(message);
}

// Split the text into records of fields. A field is {text, quoted}.
// Quotes may contain separators, equals signs, CR and LF, so record
// boundaries can only be recognised outside quoted regions.
function tokenize(text) {
  const records = [];
  let fields = [];
  let pendingSeparator = false; // a ';' was just consumed
  let i = 0;
  const n = text.length;

  function endRecord() {
    if (fields.length > 0) records.push(fields);
    fields = [];
    pendingSeparator = false;
  }

  function lineEndWidth(pos) {
    return text[pos] === '\r' && text[pos + 1] === '\n' ? 2 : 1;
  }

  while (i < n) {
    const ch = text[i];

    if (ch === '\r' || ch === '\n') {
      if (pendingSeparator) fail('INVALID_FORMAT'); // trailing ';' -> empty field
      i += lineEndWidth(i);
      endRecord();
      continue;
    }

    // Start of a field.
    if (ch === ';') fail('INVALID_FORMAT'); // leading ';' or ';;' -> empty field
    pendingSeparator = false;

    if (ch === '"') {
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === '"') {
          if (text[j + 1] === '"') {
            buf += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        buf += c;
        j += 1;
      }
      if (!closed) fail('INVALID_FORMAT');
      fields.push({ text: buf, quoted: true });
      i = j;
    } else {
      let j = i;
      let buf = '';
      while (j < n) {
        const c = text[j];
        if (c === ';' || c === '\r' || c === '\n') break;
        if (c === '"') fail('INVALID_FORMAT'); // quotes in unquoted field
        buf += c;
        j += 1;
      }
      fields.push({ text: buf, quoted: false });
      i = j;
    }

    // Only a separator or a record ending may follow a closed/unquoted field.
    if (i >= n) break;
    if (text[i] === ';') {
      i += 1;
      pendingSeparator = true;
      continue;
    }
    if (text[i] === '\r' || text[i] === '\n') {
      i += lineEndWidth(i);
      endRecord();
      continue;
    }
    fail('INVALID_FORMAT');
  }

  if (pendingSeparator) fail('INVALID_FORMAT'); // ';' at end of text leaves an empty field
  endRecord();
  return records;
}

// Syntax + duplicate + whitespace validation for one record's fields.
function parseFields(fields) {
  const parsed = [];
  const seen = new Set();

  for (const field of fields) {
    const eq = field.text.indexOf('=');
    if (eq === -1) fail('INVALID_FORMAT');
    if (!field.quoted && field.text.indexOf('=', eq + 1) !== -1) {
      fail('INVALID_FORMAT'); // unquoted field must have exactly one '='
    }

    const key = field.text.slice(0, eq);
    const value = field.text.slice(eq + 1);

    if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
    if (seen.has(key)) fail('INVALID_FORMAT');
    seen.add(key);

    // Whitespace policy: VALUE must already equal its trimmed form.
    if (value !== value.trim()) fail('INVALID_FORMAT');

    parsed.push({ key, value });
  }

  return parsed;
}

// Canonical unsigned decimal integer, bounded.
function toInt(value, min, max) {
  if (!DIGITS_RE.test(value)) fail('INVALID_VALUE');
  if (value.length > 1 && value[0] === '0') fail('INVALID_VALUE'); // leading zero
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) fail('INVALID_VALUE');
  return num;
}

function parseFlags(value) {
  return value === '' ? [] : value.split(',');
}

function parseRecord(fields) {
  const parsed = parseFields(fields); // syntax / duplicate / whitespace first

  const values = new Map();
  for (const { key, value } of parsed) {
    if (KNOWN.has(key)) values.set(key, value); // unknown keys dropped
  }

  for (const req of REQUIRED) {
    if (!values.has(req)) fail('INVALID_VALUE');
  }

  const out = {};
  for (const name of SCHEMA) {
    if (!values.has(name)) continue;
    const value = values.get(name);
    switch (name) {
      case 'WINDOW':
        out.WINDOW = toInt(value, 3, 50);
        break;
      case 'RATE':
        out.RATE = toInt(value, 0, 10);
        break;
      case 'LIMIT':
        out.LIMIT = toInt(value, 1, 75);
        break;
      case 'COLOR':
        out.COLOR = value;
        break;
      case 'FLAGS':
        out.FLAGS = parseFlags(value);
        break;
      default:
        break;
    }
  }
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') return [];
  if (text === '') return [];

  const result = [];
  for (const fields of tokenize(text)) {
    result.push(parseRecord(fields));
  }
  return result;
}

module.exports = { readInput };
