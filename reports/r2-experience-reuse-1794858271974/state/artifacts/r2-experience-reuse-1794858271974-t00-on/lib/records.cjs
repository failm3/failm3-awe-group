'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order, with inclusive integer ranges.
const SCHEMA = [
  ['WINDOW', 1, 20],
  ['RATE', 0, 10],
  ['LIMIT', 1, 25],
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Split one raw field (already decoded) into key/value and check its syntax.
// Unquoted fields must contain exactly one '='; quoted fields may contain
// further '=' characters inside VALUE, so they are split at the first '='.
function splitField(field) {
  const text = field.text;
  const eq = text.indexOf('=');
  if (eq === -1) throw formatError();
  if (!field.quoted && text.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = text.slice(0, eq);
  const value = text.slice(eq + 1);
  if (!KEY_RE.test(key)) throw formatError();
  if (value !== value.trim()) throw formatError();
  return [key, value];
}

// Validate a complete record: syntax/duplicates/whitespace first, then semantics.
function buildRecord(fields) {
  const seen = new Map();
  for (const field of fields) {
    const [key, value] = splitField(field);
    if (seen.has(key)) throw formatError();
    seen.set(key, value);
  }

  // Unknown keys are dropped here, after syntax and duplicate validation.
  const record = {};
  for (const [name, min, max] of SCHEMA) {
    if (!seen.has(name)) throw valueError();
    const raw = seen.get(name);
    if (!CANONICAL_UINT_RE.test(raw)) throw valueError();
    const num = Number(raw);
    if (!Number.isSafeInteger(num) || num < min || num > max) throw valueError();
    record[name] = num;
  }
  return record;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const records = [];
  let fields = [];
  let field = '';
  let fieldQuoted = false;
  let inQuotes = false;
  let afterQuote = false;
  // True when no character of the current record has been consumed yet.
  let recordEmpty = true;

  const endField = () => {
    if (!fieldQuoted && field === '') throw formatError(); // empty field
    fields.push({ text: field, quoted: fieldQuoted });
    field = '';
    fieldQuoted = false;
    afterQuote = false;
  };

  const endRecord = () => {
    endField();
    records.push(buildRecord(fields));
    fields = [];
    recordEmpty = true;
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

    if (c === ';') {
      endField();
      recordEmpty = false;
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
    } else if (afterQuote) {
      throw formatError(); // characters after a closing quote
    } else if (c === '"') {
      if (field !== '') throw formatError(); // quote inside unquoted field
      inQuotes = true;
      fieldQuoted = true;
      recordEmpty = false;
    } else {
      field += c;
      recordEmpty = false;
    }
  }

  if (inQuotes) throw formatError(); // unterminated quote
  // A final record ending does not start a new record.
  if (!recordEmpty) endRecord();

  return records;
}

module.exports = { parseRecords };
