'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order.
const SCHEMA = [
  { key: 'WINDOW', required: true, parse: (v) => parseUint(v, 3, 60) },
  { key: 'RATE', required: true, parse: (v) => parseUint(v, 0, 30) },
  { key: 'LIMIT', required: true, parse: (v) => parseUint(v, 1, 75) },
  { key: 'COLOR', required: false, parse: (v) => parseEnum(v, ['teal', 'gold']) },
];
const KNOWN = new Map(SCHEMA.map((f) => [f.key, f]));

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function parseUint(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
  return n;
}

function parseEnum(value, allowed) {
  if (!allowed.includes(value)) throw valueError();
  return value;
}

function setOwn(obj, key, value) {
  // defineProperty keeps prototype-looking keys as plain data.
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Turn one raw field into [key, trimmedValue], enforcing syntax rules.
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();
  // Unquoted fields must contain exactly one equals sign.
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return [key, raw.slice(eq + 1).trim()];
}

// Syntax checks (duplicates) first, then semantic validation.
function buildRecord(fields) {
  const seen = new Map();
  for (const [key, value] of fields) {
    if (seen.has(key)) throw formatError();
    seen.set(key, value);
  }

  const out = {};
  for (const field of SCHEMA) {
    if (!seen.has(field.key)) {
      if (field.required) throw valueError();
      continue;
    }
    setOwn(out, field.key, field.parse(seen.get(field.key)));
  }
  for (const [key, value] of fields) {
    if (!KNOWN.has(key)) setOwn(out, key, value);
  }
  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false; // currently inside a quoted field
  let wasQuoted = false; // current field was quoted
  let afterQuote = false; // closing quote seen, only separator/ending allowed
  let recordStarted = false; // any character consumed for the current record

  const endField = () => {
    fields.push(splitField(field, wasQuoted));
    field = '';
    wasQuoted = false;
    afterQuote = false;
  };
  const endRecord = () => {
    endField();
    records.push(buildRecord(fields));
    fields = [];
    recordStarted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '\r' || c === '\n') {
      // An empty line is a record with no fields, which is invalid.
      if (!recordStarted) throw formatError();
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
      continue;
    }

    recordStarted = true;

    if (c === ';') {
      endField();
      continue;
    }

    if (afterQuote) throw formatError();

    if (c === '"') {
      // A quote may only open a field; anywhere else it is an error.
      if (field !== '' || wasQuoted) throw formatError();
      inQuotes = true;
      wasQuoted = true;
      continue;
    }

    field += c;
  }

  if (inQuotes) throw formatError();
  // A final record terminator is optional; anything after it is a record.
  if (recordStarted) endRecord();

  return records;
}

module.exports = { decodeSeparated };
