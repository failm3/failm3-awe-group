'use strict';

// Separated key/value record parser.
// See FORMAT.md for the authoritative grammar and semantics.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order: required fields first, then the documented optional
// fields in their documented order.
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const KNOWN = new Set(KNOWN_ORDER);

// Inclusive ranges for the integer-valued required fields.
const INT_RANGES = {
  WINDOW: [1, 30],
  RATE: [0, 30],
  LIMIT: [1, 25],
};

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Trim only leading/trailing whitespace of a decoded VALUE.
function trimValue(value) {
  return value.replace(/^\s+/, '').replace(/\s+$/, '');
}

// Define an own, enumerable property without ever touching the prototype chain.
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function toFlags(value) {
  if (value === '') return [];
  const out = [];
  for (const part of value.split(',')) {
    const trimmed = trimValue(part);
    if (trimmed !== '') out.push(trimmed);
  }
  return out;
}

// Split the raw text into records of fields. Records use LF, CRLF or CR.
// Fields are separated by a literal ';'. A field may be entirely wrapped in
// double quotes; inside quotes "" decodes to a single quote and separators,
// equals signs, CR and LF are literal data.
function scanRecords(text) {
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let closedQuote = false;
  let fieldQuoted = false;
  let i = 0;

  const endField = () => {
    fields.push({ text: field, quoted: fieldQuoted });
    field = '';
    fieldQuoted = false;
    closedQuote = false;
  };

  const endRecord = () => {
    endField();
    records.push(fields);
    fields = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          closedQuote = true;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }

    if (closedQuote) {
      // After a closing quote only a separator or a record ending may follow.
      if (ch === ';') {
        endField();
        i += 1;
      } else if (ch === '\n') {
        endRecord();
        i += 1;
      } else if (ch === '\r') {
        endRecord();
        i += text[i + 1] === '\n' ? 2 : 1;
      } else {
        throw invalidFormat();
      }
      continue;
    }

    if (ch === '"') {
      // A quote may only open a field, never appear inside an unquoted one.
      if (field === '') {
        inQuotes = true;
        fieldQuoted = true;
        i += 1;
      } else {
        throw invalidFormat();
      }
    } else if (ch === ';') {
      endField();
      i += 1;
    } else if (ch === '\n') {
      endRecord();
      i += 1;
    } else if (ch === '\r') {
      endRecord();
      i += text[i + 1] === '\n' ? 2 : 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  if (inQuotes) throw invalidFormat();

  if (fields.length > 0 || field !== '' || closedQuote) {
    endField();
    records.push(fields);
  }

  return records;
}

function parseRecord(fields) {
  if (fields.length === 0) throw invalidFormat();

  const values = new Map();
  const unknownKeys = [];
  let knownCount = 0;

  for (const item of fields) {
    const raw = item.text;
    const eq = raw.indexOf('=');
    if (eq === -1) throw invalidFormat();

    // Unquoted fields must contain exactly one '='; quoted fields may carry
    // equals signs inside their decoded value text.
    if (!item.quoted && raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();

    const key = raw.slice(0, eq);
    if (!KEY_RE.test(key)) throw invalidFormat();
    if (values.has(key)) throw invalidFormat();

    const value = trimValue(raw.slice(eq + 1));
    values.set(key, value);

    if (KNOWN.has(key)) knownCount += 1;
    else unknownKeys.push(key);
  }

  if (knownCount === 0 && unknownKeys.length === 0) throw invalidFormat();

  const record = {};

  for (const name of KNOWN_ORDER) {
    if (!values.has(name)) {
      if (INT_RANGES[name]) throw invalidValue();
      continue;
    }
    const raw = values.get(name);

    if (INT_RANGES[name]) {
      if (!UINT_RE.test(raw)) throw invalidValue();
      const num = Number(raw);
      const [lo, hi] = INT_RANGES[name];
      if (!(num >= lo && num <= hi)) throw invalidValue();
      setOwn(record, name, num);
    } else if (name === 'COLOR') {
      if (raw !== 'green' && raw !== 'amber') throw invalidValue();
      setOwn(record, name, raw);
    } else if (name === 'FLAGS') {
      setOwn(record, name, toFlags(raw));
    }
  }

  for (const key of unknownKeys) {
    setOwn(record, key, values.get(key));
  }

  return record;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = scanRecords(text);
  const out = [];
  for (const fields of records) {
    out.push(parseRecord(fields));
  }
  return out;
}

module.exports = { parseExport };
