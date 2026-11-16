'use strict';

// Separated key/value record parser (see FORMAT.md).
// Exports readInput(text) -> Array of plain objects.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(0|[1-9][0-9]*)$/;

// Known-field schema order.
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const KNOWN = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

// Semantic integer fields: canonical unsigned decimal integer + inclusive range.
const INT_RANGES = {
  WINDOW: [3, 50],
  RATE: [0, 10],
  LIMIT: [1, 75]
};

function fail(kind) {
  throw new Error(kind === 'value' ? 'INVALID_VALUE' : 'INVALID_FORMAT');
}

// Split the whole text into records of decoded field strings.
// Quote-aware: quoted regions may contain ';', '=', CR and LF.
function splitRecords(text) {
  const records = [];
  let fields = [];
  let field = '';
  let mode = 'start'; // start | unquoted | quoted | afterQuote
  let fieldWasQuoted = false;
  let flags = []; // parallel quoted-flags for current record

  const pushField = () => {
    fields.push(field);
    flags.push(fieldWasQuoted);
    field = '';
    fieldWasQuoted = false;
    mode = 'start';
  };

  const closeRecord = () => {
    pushField();
    records.push({ fields, quoted: flags });
    fields = [];
    flags = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (mode === 'afterQuote') {
      if (c === ';') pushField();
      else if (c === '\n') closeRecord();
      else if (c === '\r') {
        closeRecord();
        if (text[i + 1] === '\n') i++;
      } else fail('format');
      continue;
    }

    if (mode === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          mode = 'afterQuote';
        }
      } else {
        field += c;
      }
      continue;
    }

    // start or unquoted
    if (c === ';') {
      pushField();
    } else if (c === '\n') {
      closeRecord();
    } else if (c === '\r') {
      closeRecord();
      if (text[i + 1] === '\n') i++;
    } else if (c === '"') {
      if (mode === 'start') {
        mode = 'quoted';
        fieldWasQuoted = true;
      } else {
        fail('format'); // quotes in unquoted fields
      }
    } else {
      field += c;
      mode = 'unquoted';
    }
  }

  if (mode === 'quoted') fail('format'); // unterminated quote
  if (mode === 'afterQuote') {
    closeRecord();
  } else if (mode === 'unquoted' || fields.length > 0 || field !== '') {
    closeRecord();
  }

  return records;
}

function decodeField(raw, wasQuoted) {
  const eq = raw.indexOf('=');
  if (eq < 0) fail('format');
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);

  // Unquoted fields must be exactly KEY=VALUE with one equals sign.
  if (!wasQuoted && value.indexOf('=') >= 0) fail('format');

  if (!KEY_RE.test(key)) fail('format');
  if (value !== value.trim()) fail('format');

  return { key, value };
}

function toFlags(value) {
  if (value === '') return [];
  const out = [];
  for (const part of value.split(',')) {
    const item = part.trim();
    if (item !== '') out.push(item);
  }
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') fail('format');
  if (text === '') return [];

  const records = splitRecords(text);
  const result = [];

  for (const record of records) {
    const seen = new Set();
    const values = new Map();

    for (let i = 0; i < record.fields.length; i++) {
      const { key, value } = decodeField(record.fields[i], record.quoted[i]);
      if (seen.has(key)) fail('format'); // duplicate decoded key
      seen.add(key);
      values.set(key, value);
    }

    // Semantic validation happens only after syntax/duplicate/whitespace.
    const row = {};
    for (const key of REQUIRED) {
      if (!values.has(key)) fail('value');
      const raw = values.get(key);
      if (!UINT_RE.test(raw)) fail('value');
      const n = Number(raw);
      const [lo, hi] = INT_RANGES[key];
      if (n < lo || n > hi) fail('value');
      row[key] = n;
    }

    // Optional documented fields, in schema order.
    if (values.has('COLOR')) row.COLOR = values.get('COLOR');
    if (values.has('FLAGS')) row.FLAGS = toFlags(values.get('FLAGS'));

    // Unknown keys are dropped (after syntax + duplicate validation above).
    result.push(row);
  }

  return result;
}

module.exports = { readInput, KNOWN, REQUIRED };
