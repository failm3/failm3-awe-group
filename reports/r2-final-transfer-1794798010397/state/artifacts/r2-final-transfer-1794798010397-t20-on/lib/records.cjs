'use strict';

// Separated key/value record parser. See FORMAT.md.
//
// Grammar (informal):
//   document := record (NEWLINE record)* NEWLINE?
//   record   := field (';' field)*
//   field    := unquoted | quoted
//   unquoted := KEY '=' VALUE            (exactly one '=', no quotes)
//   quoted   := '"' ... '"'              (whole field quoted, '""' -> '"')
//   NEWLINE  := LF | CRLF | CR

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

// Splits the raw text into records, where each record is an array of
// { text, quoted } field entries. Quoting is resolved here ('' -> '"');
// record terminators and separators inside quotes are literal data.
function scanRecords(text) {
  const records = [];
  let fields = [];
  let buf = '';
  let inQuotes = false;
  let afterQuote = false; // just closed a quoted field
  let quotedField = false; // current field was quoted
  let fieldChars = 0; // raw chars consumed for the current field
  const n = text.length;

  const endField = () => {
    fields.push({ text: buf, quoted: quotedField });
    buf = '';
    quotedField = false;
    afterQuote = false;
    fieldChars = 0;
  };

  const endRecord = () => {
    endField();
    records.push(fields);
    fields = [];
  };

  for (let i = 0; i < n; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        buf += c;
      }
      continue;
    }

    if (afterQuote) {
      if (c === ';') {
        endField();
      } else if (c === '\n') {
        endRecord();
      } else if (c === '\r') {
        endRecord();
        if (text[i + 1] === '\n') i++;
      } else {
        invalidFormat();
      }
      continue;
    }

    if (c === '"') {
      if (fieldChars !== 0) invalidFormat(); // quotes inside unquoted fields
      inQuotes = true;
      quotedField = true;
      fieldChars++;
      continue;
    }

    if (c === ';') {
      endField();
      continue;
    }

    if (c === '\n') {
      endRecord();
      continue;
    }

    if (c === '\r') {
      endRecord();
      if (text[i + 1] === '\n') i++;
      continue;
    }

    buf += c;
    fieldChars++;
  }

  if (inQuotes) invalidFormat(); // unterminated quote

  // Trailing terminator produces no extra record; anything else is a field.
  if (fields.length > 0 || afterQuote || fieldChars > 0 || buf !== '') {
    endRecord();
  }

  return records;
}

function decodeField(field) {
  const raw = field.text;

  let key;
  let value;

  if (field.quoted) {
    const eq = raw.indexOf('=');
    if (eq < 0) invalidFormat();
    key = raw.slice(0, eq);
    value = raw.slice(eq + 1);
  } else {
    const eq = raw.indexOf('=');
    if (eq < 0) invalidFormat();
    if (raw.indexOf('=', eq + 1) >= 0) invalidFormat(); // exactly one '='
    key = raw.slice(0, eq);
    value = raw.slice(eq + 1);
  }

  if (!KEY_RE.test(key)) invalidFormat();

  // Whitespace policy: VALUE must already equal its trimmed form.
  if (value !== value.trim()) invalidFormat();

  return { key, value };
}

function parseCanonicalUint(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  return Number(value);
}

// FLAGS is the only array-valued field; its items are comma separated.
function convertFlags(value) {
  if (value === '') return [];
  return value.split(',');
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
  // Pass 1: syntax, duplicates and whitespace (takes precedence).
  const decoded = [];
  const seen = new Set();
  for (const field of fields) {
    const pair = decodeField(field);
    if (seen.has(pair.key)) invalidFormat();
    seen.add(pair.key);
    decoded.push(pair);
  }

  // Pass 2: semantics.
  const map = new Map();
  for (const pair of decoded) map.set(pair.key, pair.value);

  const window = map.has('WINDOW') ? parseCanonicalUint(map.get('WINDOW')) : null;
  const rate = map.has('RATE') ? parseCanonicalUint(map.get('RATE')) : null;
  const limit = map.has('LIMIT') ? parseCanonicalUint(map.get('LIMIT')) : null;

  if (window === null || window < 3 || window > 20) invalidValue();
  if (rate === null || rate < 0 || rate > 10) invalidValue();
  if (limit === null || limit < 1 || limit > 75) invalidValue();

  // Known fields, in schema order.
  const obj = {};
  defineField(obj, 'WINDOW', window);
  defineField(obj, 'RATE', rate);
  defineField(obj, 'LIMIT', limit);
  if (map.has('COLOR')) defineField(obj, 'COLOR', map.get('COLOR'));
  if (map.has('FLAGS')) defineField(obj, 'FLAGS', convertFlags(map.get('FLAGS')));

  // Retained unknown fields, in original field order.
  for (const pair of decoded) {
    if (KNOWN_ORDER.indexOf(pair.key) >= 0) continue;
    defineField(obj, pair.key, pair.value);
  }

  return obj;
}

function parseRecords(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];

  const records = scanRecords(text);
  const out = [];
  for (const fields of records) out.push(buildRecord(fields));
  return out;
}

module.exports = { parseRecords };
