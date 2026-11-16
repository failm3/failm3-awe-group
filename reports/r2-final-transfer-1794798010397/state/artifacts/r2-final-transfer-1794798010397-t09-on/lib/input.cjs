'use strict';

// Separated key/value records -- see FORMAT.md.
//
// Grammar summary implemented here:
//   * records are terminated by LF, CRLF or CR (never inside a quoted field)
//   * fields inside a record are separated by a literal '|'
//   * a field is either bare (exactly KEY=VALUE, one '=') or wholly double quoted
//   * inside quotes '""' decodes to '"'; separators, '=', CR and LF are literal
//   * after a closing quote only '|', a record ending or end of input may follow

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

// Schema order for known fields (also the property insertion order of output).
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS'];
const REQUIRED_FIELDS = ['WINDOW', 'RATE', 'LIMIT'];

const CANONICAL_UNSIGNED_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INTEGER_RE = /^-?[0-9]+$/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Lexer modes while scanning a single field.
const MODE_START = 0;
const MODE_BARE = 1;
const MODE_QUOTED = 2;
const MODE_AFTER_QUOTE = 3;

/**
 * Split the raw text into records of fields without interpreting key/value
 * syntax. Each field is { text, quoted } where `text` is already unescaped.
 * Structural / quoting problems raise INVALID_FORMAT here.
 */
function scanRecords(text) {
  const records = [];
  let fields = [];
  let buffer = '';
  let mode = MODE_START;
  let quoted = false;
  let pending = false; // current record already holds content

  const endField = () => {
    fields.push({ text: buffer, quoted });
    buffer = '';
    quoted = false;
    mode = MODE_START;
  };

  const endRecord = () => {
    endField();
    records.push(fields);
    fields = [];
    pending = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (mode === MODE_QUOTED) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          buffer += '"';
          i += 1;
        } else {
          mode = MODE_AFTER_QUOTE;
        }
      } else {
        buffer += ch;
      }
      continue;
    }

    if (mode === MODE_AFTER_QUOTE) {
      if (ch === '|') {
        endField();
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        endRecord();
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        continue;
      }
      throw invalidFormat();
    }

    // MODE_START or MODE_BARE
    if (ch === '"') {
      if (mode === MODE_BARE) throw invalidFormat(); // quote inside a bare field
      mode = MODE_QUOTED;
      quoted = true;
      pending = true;
      continue;
    }
    if (ch === '|') {
      endField();
      pending = true;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (pending) endRecord();
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      continue;
    }
    buffer += ch;
    mode = MODE_BARE;
    pending = true;
  }

  if (mode === MODE_QUOTED) throw invalidFormat(); // unterminated quote
  if (pending) {
    endField();
    records.push(fields);
  }
  return records;
}

/**
 * Phase 1: syntax, quoting and duplicate validation for one record.
 * Returns a Map of decoded key -> raw value string.
 */
function parseFields(fields) {
  const values = new Map();

  for (const field of fields) {
    const text = field.text;
    const eq = text.indexOf('=');
    if (eq < 0) throw invalidFormat();
    if (!field.quoted && text.indexOf('=', eq + 1) >= 0) throw invalidFormat();

    const key = text.slice(0, eq);
    const value = text.slice(eq + 1);

    if (!KEY_RE.test(key)) throw invalidFormat();
    if (value !== value.trim()) throw invalidFormat();
    if (values.has(key)) throw invalidFormat();

    values.set(key, value);
  }

  return values;
}

function canonicalUnsigned(value, min, max) {
  if (!CANONICAL_UNSIGNED_RE.test(value)) throw invalidValue();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw invalidValue();
  return n;
}

function decimalInteger(value, min, max) {
  if (!DECIMAL_INTEGER_RE.test(value)) throw invalidValue();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw invalidValue();
  return n;
}

/**
 * Phase 2: semantic validation and object construction for one record.
 */
function buildRecord(values) {
  for (const key of REQUIRED_FIELDS) {
    if (!values.has(key)) throw invalidValue();
  }

  const record = {};

  for (const key of KNOWN_FIELDS) {
    if (!values.has(key)) continue;
    const value = values.get(key);

    switch (key) {
      case 'WINDOW':
        record.WINDOW = canonicalUnsigned(value, 1, 60);
        break;
      case 'RATE':
        record.RATE = canonicalUnsigned(value, 0, 20);
        break;
      case 'LIMIT':
        record.LIMIT = canonicalUnsigned(value, 1, 100);
        break;
      case 'DURATION':
        record.DURATION = decimalInteger(value, 1, 150);
        break;
      case 'COLOR':
        record.COLOR = value;
        break;
      case 'FLAGS':
        record.FLAGS = value === '' ? [] : value.split(',');
        break;
      default:
        break;
    }
  }

  return record;
}

function readInput(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = scanRecords(text);
  return records.map((fields) => buildRecord(parseFields(fields)));
}

module.exports = { readInput };
