'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(0|[1-9][0-9]*)$/;
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const INT_RANGES = { WINDOW: [2, 40], RATE: [0, 30], LIMIT: [1, 125] };
const COLORS = ['cyan', 'magenta'];

function formatError() { return new Error('INVALID_FORMAT'); }
function valueError() { return new Error('INVALID_VALUE'); }

// Split decoded field text into [key, value]. Unquoted fields need exactly one '='.
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq < 0) throw formatError();
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return [key, raw.slice(eq + 1).trim()];
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

// fields: array of { raw, quoted } for one record, in original order.
function buildRecord(fields) {
  // Syntax and duplicate checks for the whole record come before semantic checks.
  const values = new Map();
  for (const f of fields) {
    const [key, value] = splitField(f.raw, f.quoted);
    if (values.has(key)) throw formatError();
    values.set(key, value);
  }

  const out = {};
  for (const key of REQUIRED) {
    if (!values.has(key)) throw valueError();
    const v = values.get(key);
    if (!UINT_RE.test(v)) throw valueError();
    const n = Number(v);
    const [min, max] = INT_RANGES[key];
    if (n < min || n > max) throw valueError();
    defineOwn(out, key, n);
  }
  if (values.has('COLOR')) {
    const v = values.get('COLOR');
    if (!COLORS.includes(v)) throw valueError();
    defineOwn(out, 'COLOR', v);
  }
  for (const [key, value] of values) {
    if (!KNOWN_ORDER.includes(key)) defineOwn(out, key, value);
  }
  return out;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;   // currently inside a quoted field
  let afterQuote = false; // closing quote seen; only separator or record ending may follow
  let fieldQuoted = false;

  const endField = () => {
    fields.push({ raw: field, quoted: fieldQuoted });
    field = '';
    fieldQuoted = false;
    afterQuote = false;
  };
  const endRecord = () => {
    // A record must contain at least one field; an empty line is not a record.
    if (fields.length === 0 && field === '' && !fieldQuoted) throw formatError();
    endField();
    records.push(buildRecord(fields));
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; afterQuote = true; }
      } else {
        field += c;
      }
    } else if (c === ';') {
      endField();
    } else if (c === '\n' || c === '\r') {
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (afterQuote) {
      throw formatError();
    } else if (c === '"') {
      if (field !== '') throw formatError(); // quote inside unquoted field
      inQuotes = true;
      fieldQuoted = true;
    } else {
      field += c;
    }
  }

  if (inQuotes) throw formatError();
  // A final record ending is a terminator, not the start of an empty record.
  if (field !== '' || fieldQuoted || fields.length > 0) endRecord();
  return records;
}

module.exports = { parseRecords };
