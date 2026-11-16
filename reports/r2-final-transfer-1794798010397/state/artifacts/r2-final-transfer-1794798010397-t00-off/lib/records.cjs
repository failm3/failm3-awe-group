'use strict';

// Separated key/value record parser.
// See FORMAT.md for the authoritative grammar and semantics.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known field schema order (also the output key insertion order).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

const REQUIRED = {
  WINDOW: { min: 1, max: 20 },
  RATE: { min: 0, max: 10 },
  LIMIT: { min: 1, max: 25 },
};

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Split the raw text into records (arrays of decoded field strings).
// Handles LF, CRLF and CR record terminators, and double-quoted whole fields
// which may contain separators, equals signs, CR, LF and doubled quotes.
function scanRecords(text) {
  const records = [];

  let fields = [];
  let cur = '';
  let fieldStarted = false; // any character (including an opening quote) seen
  let inQuotes = false;
  let closedQuote = false;  // closing quote seen for the current field
  let quotedField = false;  // current field began with a double quote
  let quotedFieldFlags = [];

  function endField() {
    fields.push(cur);
    quotedFieldFlags.push(quotedField);
    cur = '';
    fieldStarted = false;
    inQuotes = false;
    closedQuote = false;
    quotedField = false;
  }

  function endRecord() {
    records.push({ values: fields, quoted: quotedFieldFlags });
    fields = [];
    quotedFieldFlags = [];
  }

  const len = text.length;
  let i = 0;

  while (i < len) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        closedQuote = true;
        i += 1;
        continue;
      }
      cur += c;
      i += 1;
      continue;
    }

    if (closedQuote) {
      // Nothing may follow a closing quote except a separator or record end.
      if (c === ';') {
        endField();
        i += 1;
        continue;
      }
      if (c === '\r' || c === '\n') {
        endField();
        endRecord();
        i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
        continue;
      }
      throw formatError();
    }

    if (c === ';') {
      endField();
      i += 1;
      continue;
    }

    if (c === '\r' || c === '\n') {
      endField();
      endRecord();
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    if (c === '"') {
      // A whole field may be quoted, but quotes are illegal in unquoted fields.
      if (fieldStarted) throw formatError();
      fieldStarted = true;
      quotedField = true;
      inQuotes = true;
      i += 1;
      continue;
    }

    fieldStarted = true;
    cur += c;
    i += 1;
  }

  if (inQuotes) throw formatError(); // unterminated quote

  if (fieldStarted || closedQuote || fields.length > 0) {
    endField();
    endRecord();
  }

  return records;
}

// Validate and decode a single field into { key, value }.
function decodeField(raw, wasQuoted) {
  if (raw.length === 0 && !wasQuoted) throw formatError();
  if (raw.length === 0) throw formatError();

  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();

  if (!wasQuoted) {
    // Each unquoted field is exactly KEY=VALUE with one equals sign.
    if (raw.indexOf('=', eq + 1) !== -1) throw formatError();
  }

  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);

  if (!KEY_RE.test(key)) throw formatError();
  // VALUE must already equal its trimmed form.
  if (value !== value.trim()) throw formatError();

  return { key, value };
}

function canonicalUint(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : null;
}

function buildRecord(entries) {
  const seen = new Set();
  for (const { key } of entries) {
    if (seen.has(key)) throw formatError();
    seen.add(key);
  }

  // Unknown keys are dropped after syntax and duplicate validation.
  const known = new Map();
  for (const { key, value } of entries) {
    if (SCHEMA.indexOf(key) !== -1) known.set(key, value);
  }

  // Semantic validation of required fields.
  const numbers = Object.create(null);
  for (const key of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!known.has(key)) throw valueError();
    const n = canonicalUint(known.get(key));
    if (n === null) throw valueError();
    const { min, max } = REQUIRED[key];
    if (n < min || n > max) throw valueError();
    numbers[key] = n;
  }

  // The single documented optional field, plus COLOR which stays a string.
  const record = {};
  for (const key of ['WINDOW', 'RATE', 'LIMIT']) {
    Object.defineProperty(record, key, {
      value: numbers[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (known.has('COLOR')) {
    Object.defineProperty(record, 'COLOR', {
      value: known.get('COLOR'),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (known.has('FLAGS')) {
    const raw = known.get('FLAGS');
    const flags = raw === '' ? [] : raw.split(',');
    if (flags.some((flag) => flag.length === 0)) throw valueError();
    Object.defineProperty(record, 'FLAGS', {
      value: flags,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }

  return record;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();
  if (text.length === 0) return [];

  const scanned = scanRecords(text);
  const out = [];

  for (let r = 0; r < scanned.length; r += 1) {
    const { values, quoted } = scanned[r];
    if (values.length === 0) throw formatError(); // a record has one or more fields

    const entries = [];
    for (let f = 0; f < values.length; f += 1) {
      entries.push(decodeField(values[f], quoted[f]));
    }
    out.push(buildRecord(entries));
  }

  return out;
}

module.exports = { parseRecords };
module.exports.parseRecords = parseRecords;
