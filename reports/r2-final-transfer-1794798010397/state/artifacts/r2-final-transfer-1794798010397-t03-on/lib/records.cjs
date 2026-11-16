'use strict';

// Separated key/value record parser.
// See FORMAT.md for the authoritative grammar and semantics.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const FLAG_VALUES = ['read', 'write'];

// Known-field schema order (see FORMAT.md).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Field scanner states.
const ST_START = 0; // nothing consumed yet for the current field
const ST_UNQUOTED = 1; // accumulating an unquoted field
const ST_QUOTED = 2; // inside a double quoted field
const ST_AFTER_QUOTE = 3; // closing quote seen, only separator / record end allowed

// Reads a single record starting at `start`.
// Returns { fields, next } where fields is an array of
// { value: <decoded text>, quoted: <boolean> } and `next` is the index
// just past the record separator (or text.length at end of input).
function readRecord(text, start) {
  const n = text.length;
  const fields = [];
  let field = '';
  let quoted = false;
  let state = ST_START;
  let i = start;

  const endField = () => {
    fields.push({ value: field, quoted });
    field = '';
    quoted = false;
    state = ST_START;
  };

  while (i < n) {
    const c = text[i];

    if (state === ST_QUOTED) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          // doubled quote decodes to a single quote
          field += '"';
          i += 2;
          continue;
        }
        state = ST_AFTER_QUOTE;
        i += 1;
        continue;
      }
      // Quotes may contain separators, equals signs, CR and LF.
      field += c;
      i += 1;
      continue;
    }

    if (state === ST_AFTER_QUOTE) {
      if (c === '|') {
        endField();
        i += 1;
        continue;
      }
      if (c === '\n' || c === '\r') {
        endField();
        i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
        return { fields, next: i };
      }
      // No characters may follow a closing quote.
      throw invalidFormat();
    }

    // ST_START / ST_UNQUOTED
    if (c === '|') {
      endField();
      i += 1;
      continue;
    }
    if (c === '\n' || c === '\r') {
      endField();
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      return { fields, next: i };
    }
    if (c === '"') {
      if (state === ST_UNQUOTED) {
        // Quotes are not allowed inside an unquoted field.
        throw invalidFormat();
      }
      // A whole field may be double quoted.
      quoted = true;
      state = ST_QUOTED;
      i += 1;
      continue;
    }
    field += c;
    state = ST_UNQUOTED;
    i += 1;
  }

  if (state === ST_QUOTED) {
    // Unterminated quote.
    throw invalidFormat();
  }
  endField();
  return { fields, next: n, eof: true };
}

// Splits a decoded field into [key, rawValue]; performs no semantics.
function splitField(field) {
  const text = field.value;
  const eq = text.indexOf('=');
  if (eq === -1) throw invalidFormat();
  if (!field.quoted && text.indexOf('=', eq + 1) !== -1) {
    // Unquoted fields must contain exactly one equals sign.
    throw invalidFormat();
  }
  const key = text.slice(0, eq);
  if (!KEY_RE.test(key)) throw invalidFormat();
  // Whitespace policy: trim leading/trailing whitespace from the VALUE only.
  const value = text.slice(eq + 1).trim();
  return { key, value };
}

function parseIntValue(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  return Number(value);
}

function parseFlags(value) {
  if (value === '') throw invalidValue();
  const parts = value.split(',');
  const seen = new Set();
  for (const part of parts) {
    if (FLAG_VALUES.indexOf(part) === -1) throw invalidValue();
    if (seen.has(part)) throw invalidValue();
    seen.add(part);
  }
  return parts;
}

// Builds one output object from a record's raw fields.
// All syntax / duplicate problems for the record are detected before any
// semantic validation, so they take precedence over INVALID_VALUE.
function buildRecord(fields) {
  const values = new Map();
  for (const field of fields) {
    const { key, value } = splitField(field);
    if (values.has(key)) throw invalidFormat();
    values.set(key, value);
  }

  // --- semantics ---
  if (!values.has('WINDOW') || !values.has('RATE') || !values.has('LIMIT')) {
    throw invalidValue();
  }

  const windowValue = parseIntValue(values.get('WINDOW'));
  if (windowValue === null || windowValue < 1 || windowValue > 50) throw invalidValue();

  const rateValue = parseIntValue(values.get('RATE'));
  if (rateValue === null || rateValue < 0 || rateValue > 40) throw invalidValue();

  const limitValue = parseIntValue(values.get('LIMIT'));
  if (limitValue === null || limitValue < 1 || limitValue > 100) throw invalidValue();

  let flags;
  if (values.has('FLAGS')) flags = parseFlags(values.get('FLAGS'));

  // Known-field schema order; unknown keys are dropped, never inserted.
  const record = {};
  record.WINDOW = windowValue;
  record.RATE = rateValue;
  record.LIMIT = limitValue;
  if (flags !== undefined) record.FLAGS = flags;
  if (values.has('COLOR')) record.COLOR = values.get('COLOR');

  // Guard against prototype pollution style keys (unreachable given KEY_RE,
  // but kept explicit so the result stays an ordinary object with own keys).
  if (Object.getPrototypeOf(record) !== Object.prototype) {
    throw invalidFormat();
  }

  return record;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = [];
  const n = text.length;
  let i = 0;

  for (;;) {
    const { fields, next, eof } = readRecord(text, i);
    records.push(buildRecord(fields));
    if (eof || next >= n) break;
    i = next;
  }

  return records;
}

module.exports = { parseRecords };
