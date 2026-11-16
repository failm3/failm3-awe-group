'use strict';

/*
 * Separated key/value records parser.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR
 *  - fields separated by literal ';'
 *  - field is KEY=VALUE, KEY matches [A-Z][A-Z0-9_]*
 *  - a whole field may be double quoted; "" inside quotes decodes to one quote;
 *    quotes may contain ';', '=', CR and LF; nothing may follow a closing quote
 *    except a separator or a record ending
 *  - VALUE must already equal its trimmed form
 *  - unknown keys are dropped after syntax/duplicate validation
 *  - required keys WINDOW, RATE, LIMIT (INVALID_VALUE when missing/invalid)
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED_RE = /^(?:0|[1-9][0-9]*)$/;

// Known field schema (insertion order defines output key order).
const SCHEMA = [
  { name: 'WINDOW', min: 3, max: 50 },
  { name: 'RATE', min: 0, max: 10 },
  { name: 'LIMIT', min: 1, max: 75 }
];

function failFormat() {
  throw new Error('INVALID_FORMAT');
}

function failValue() {
  throw new Error('INVALID_VALUE');
}

function isRecordEnd(ch) {
  return ch === '\n' || ch === '\r';
}

/**
 * Split the text into records of raw fields.
 * Each field is { raw, quoted } where `raw` is the decoded text.
 */
function splitRecords(text) {
  const records = [];
  let row = [];
  let field = '';
  let state = 'start'; // 'start' | 'unquoted' | 'quoted' | 'closed'

  const endField = () => {
    row.push({ raw: field, quoted: state === 'closed' });
    field = '';
    state = 'start';
  };

  const endRecord = () => {
    endField();
    records.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (state === 'quoted') {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          state = 'closed';
        }
      } else {
        // Quotes may contain ';', '=', CR and LF.
        field += ch;
      }
      continue;
    }

    if (state === 'closed') {
      if (ch === ';') {
        endField();
      } else if (isRecordEnd(ch)) {
        endRecord();
        if (ch === '\r' && text[i + 1] === '\n') i++;
      } else {
        // No characters may follow a closing quote.
        failFormat();
      }
      continue;
    }

    // state === 'start' or 'unquoted'
    if (ch === '"') {
      if (state === 'start') {
        state = 'quoted';
      } else {
        // Quotes may not appear in unquoted fields.
        failFormat();
      }
    } else if (ch === ';') {
      endField();
    } else if (isRecordEnd(ch)) {
      endRecord();
      if (ch === '\r' && text[i + 1] === '\n') i++;
    } else {
      field += ch;
      state = 'unquoted';
    }
  }

  if (state === 'quoted') {
    // Unterminated quote.
    failFormat();
  }

  const hasPendingField = state !== 'start' || row.length > 0;
  if (hasPendingField) {
    endRecord();
  }

  return records;
}

/** Decode a raw field into { key, value }, enforcing syntax rules. */
function decodeField(field) {
  const raw = field.raw;

  const eq = raw.indexOf('=');
  if (eq < 0) failFormat();

  if (!field.quoted) {
    // An unquoted field is exactly KEY=VALUE with one equals sign.
    if (raw.indexOf('=', eq + 1) !== -1) failFormat();
  }

  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);

  if (!KEY_RE.test(key)) failFormat();

  // Whitespace policy: VALUE must already equal its trimmed form.
  if (value !== value.trim()) failFormat();

  return { key, value };
}

function convert(value, spec) {
  if (!CANONICAL_UNSIGNED_RE.test(value)) failValue();
  const num = Number(value);
  if (num < spec.min || num > spec.max) failValue();
  return num;
}

function buildRecord(fields) {
  const decoded = [];
  const seen = new Set();

  for (const field of fields) {
    const { key, value } = decodeField(field);
    if (seen.has(key)) failFormat(); // duplicate decoded keys
    seen.add(key);
    decoded.push([key, value]);
  }

  // Semantic validation happens only after syntax/duplicate/whitespace checks.
  const values = new Map();
  for (const [key, value] of decoded) {
    if (!values.has(key)) values.set(key, value);
  }

  for (const spec of SCHEMA) {
    if (!values.has(spec.name)) failValue();
  }

  const out = {};
  for (const spec of SCHEMA) {
    const converted = convert(values.get(spec.name), spec);
    Object.defineProperty(out, spec.name, {
      value: converted,
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  return out;
}

/**
 * Parse the separated key/value record format.
 * @param {string} text
 * @returns {Array<Object>}
 */
function readInput(text) {
  if (typeof text !== 'string') failFormat();
  if (text === '') return [];

  const records = splitRecords(text);
  const result = [];
  for (const fields of records) {
    result.push(buildRecord(fields));
  }
  return result;
}

module.exports = { readInput };
