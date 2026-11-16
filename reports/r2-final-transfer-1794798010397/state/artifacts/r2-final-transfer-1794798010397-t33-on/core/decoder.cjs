'use strict';

// Separated key/value records -- see FORMAT.md.
//
// decodeSeparated(text) -> array of plain objects, one per record.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INTEGER_RE = /^[+-]?[0-9]+$/;

// Known-field schema order (drives own-key insertion order of every record).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS'];
const KNOWN = new Set(SCHEMA);

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Split the raw text into records of raw fields.
// Each field is { value: string, quoted: boolean } where `value` is the
// logical field text (quote characters / doubled quotes already resolved).
function splitRecords(text) {
  const n = text.length;
  const records = [];
  let fields = [];
  let buf = '';
  let inQuotes = false;
  let closedQuote = false;
  let recordPending = false;
  let i = 0;

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          buf += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
        i += 1;
        continue;
      }
      buf += c;
      i += 1;
      continue;
    }

    if (closedQuote) {
      // Nothing may follow a closing quote except a separator or record end.
      if (c === '|') {
        fields.push({ value: buf, quoted: true });
        buf = '';
        closedQuote = false;
        recordPending = true;
        i += 1;
        continue;
      }
      if (c === '\r' || c === '\n') {
        fields.push({ value: buf, quoted: true });
        records.push(fields);
        fields = [];
        buf = '';
        closedQuote = false;
        recordPending = false;
        i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      throw invalidFormat();
    }

    if (c === '"') {
      // A quote may only open a field.
      if (buf !== '') throw invalidFormat();
      inQuotes = true;
      recordPending = true;
      i += 1;
      continue;
    }

    if (c === '|') {
      fields.push({ value: buf, quoted: false });
      buf = '';
      recordPending = true;
      i += 1;
      continue;
    }

    if (c === '\r' || c === '\n') {
      fields.push({ value: buf, quoted: false });
      records.push(fields);
      fields = [];
      buf = '';
      recordPending = false;
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    buf += c;
    recordPending = true;
    i += 1;
  }

  if (inQuotes) throw invalidFormat();

  if (recordPending || closedQuote || buf !== '') {
    fields.push({ value: buf, quoted: closedQuote });
    records.push(fields);
  }

  return records;
}

// Validate the syntax of a single field and return its decoded key/value.
function decodeField(field) {
  const text = field.value;
  const eq = text.indexOf('=');
  if (eq < 0) throw invalidFormat();
  if (!field.quoted && text.indexOf('=', eq + 1) !== -1) {
    // Unquoted fields hold exactly one equals sign.
    throw invalidFormat();
  }

  const key = text.slice(0, eq);
  const value = text.slice(eq + 1);

  if (!KEY_RE.test(key)) throw invalidFormat();
  if (value !== value.trim()) throw invalidFormat();

  return { key, value };
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function readCanonicalUnsigned(value, min, max) {
  if (!CANONICAL_UNSIGNED_RE.test(value)) throw invalidValue();
  const num = Number(value);
  if (num < min || num > max) throw invalidValue();
  return num;
}

function readDuration(value) {
  if (!DECIMAL_INTEGER_RE.test(value)) throw invalidValue();
  const num = Number(value);
  if (!Number.isInteger(num)) throw invalidValue();
  if (num < 1 || num > 120) throw invalidValue();
  return num;
}

function readColor(value) {
  return value;
}

function readFlags(value) {
  if (value === '') return [];
  return value.split(',');
}

function decodeRecord(rawFields) {
  // 1. Syntax of every field, and duplicate-key detection (on decoded keys).
  const entries = [];
  const seen = new Set();
  for (const field of rawFields) {
    const { key, value } = decodeField(field);
    if (seen.has(key)) throw invalidFormat();
    seen.add(key);
    entries.push([key, value]);
  }

  // 2. Drop unknown keys (after syntax and duplicate validation).
  const byKey = new Map();
  for (const [key, value] of entries) {
    if (KNOWN.has(key)) byKey.set(key, value);
  }

  // 3. Semantic validation of required fields.
  if (!byKey.has('WINDOW') || !byKey.has('RATE') || !byKey.has('LIMIT')) {
    throw invalidValue();
  }

  const record = {};
  for (const key of SCHEMA) {
    if (!byKey.has(key)) continue;
    const value = byKey.get(key);
    let converted;
    switch (key) {
      case 'WINDOW':
        converted = readCanonicalUnsigned(value, 1, 50);
        break;
      case 'RATE':
        converted = readCanonicalUnsigned(value, 0, 20);
        break;
      case 'LIMIT':
        converted = readCanonicalUnsigned(value, 1, 100);
        break;
      case 'DURATION':
        converted = readDuration(value);
        break;
      case 'COLOR':
        converted = readColor(value);
        break;
      case 'FLAGS':
        converted = readFlags(value);
        break;
      default:
        continue;
    }
    defineOwn(record, key, converted);
  }

  return record;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = splitRecords(text);
  const out = [];
  for (const rawFields of records) {
    out.push(decodeRecord(rawFields));
  }
  return out;
}

module.exports = { decodeSeparated };
