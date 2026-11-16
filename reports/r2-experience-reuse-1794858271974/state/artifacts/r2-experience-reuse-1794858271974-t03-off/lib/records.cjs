'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md: records separated by LF, CRLF or CR; fields separated
 * by literal '|'; whole fields (key text included) may be double quoted with
 * '""' decoding to '"'; values are trimmed; unknown keys are dropped after
 * syntax/duplicate validation; required fields WINDOW/RATE/LIMIT are validated
 * as canonical unsigned integers and FLAGS as a comma separated flag list.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (used for the output object's key insertion order).
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const REQUIRED_FIELDS = ['WINDOW', 'RATE', 'LIMIT'];

const INTEGER_RANGES = {
  WINDOW: [1, 50],
  RATE: [0, 40],
  LIMIT: [1, 100],
};

const VALID_FLAGS = ['read', 'write'];

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

/** Splits decoded field text into a validated key and a trimmed value. */
function splitFieldText(raw) {
  const eq = raw.indexOf('=');
  if (eq < 0) throw invalidFormat(); // must be exactly KEY=VALUE
  if (raw.indexOf('=', eq + 1) !== -1) throw invalidFormat(); // exactly one '='

  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw invalidFormat();

  // Whitespace policy: trim leading/trailing whitespace from the decoded value only.
  return { key, value: raw.slice(eq + 1).trim() };
}

/** Reads one field starting at `start`; returns { key, value, next }. */
function readField(text, start) {
  const n = text.length;
  let raw;

  if (text[start] === '"') {
    // Whole-field double quoting.
    let buffer = '';
    let j = start + 1;
    for (;;) {
      if (j >= n) throw invalidFormat(); // unterminated quote
      const ch = text[j];
      if (ch === '"') {
        if (j + 1 < n && text[j + 1] === '"') {
          buffer += '"';
          j += 2;
          continue;
        }
        j += 1;
        break;
      }
      buffer += ch; // separators, '=', CR and LF are plain data inside quotes
      j += 1;
    }
    if (j < n) {
      const after = text[j];
      if (after !== '|' && after !== '\r' && after !== '\n') throw invalidFormat();
    }
    raw = buffer;
    const parsed = splitFieldText(raw);
    return { key: parsed.key, value: parsed.value, next: j };
  }

  // Unquoted field: runs to a separator or record ending; quotes are illegal.
  let j = start;
  while (j < n) {
    const ch = text[j];
    if (ch === '|' || ch === '\r' || ch === '\n') break;
    if (ch === '"') throw invalidFormat();
    j += 1;
  }
  raw = text.slice(start, j);
  const parsed = splitFieldText(raw);
  return { key: parsed.key, value: parsed.value, next: j };
}

function parseInteger(key, value) {
  if (!CANONICAL_UINT_RE.test(value)) throw invalidValue();
  const num = Number(value);
  const range = INTEGER_RANGES[key];
  if (!(num >= range[0] && num <= range[1])) throw invalidValue();
  return num;
}

function parseFlags(value) {
  if (value === '') throw invalidValue();
  const parts = value.split(',');
  const seen = new Set();
  const flags = [];
  for (const part of parts) {
    if (!VALID_FLAGS.includes(part)) throw invalidValue();
    if (seen.has(part)) throw invalidValue();
    seen.add(part);
    flags.push(part);
  }
  return flags;
}

function defineData(object, key, value) {
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Validates duplicate/unknown/semantic rules and builds the output object. */
function buildRecord(fields) {
  // Duplicate decoded keys are a syntax problem and precede every other check.
  const values = new Map();
  for (const field of fields) {
    if (values.has(field.key)) throw invalidFormat();
    values.set(field.key, field.value);
  }

  const record = {};
  for (const key of KNOWN_FIELDS) {
    if (!values.has(key)) continue;
    const raw = values.get(key);
    let value;
    if (key === 'FLAGS') value = parseFlags(raw);
    else if (key === 'COLOR') value = raw; // COLOR remains a string
    else value = parseInteger(key, raw);
    defineData(record, key, value);
  }

  for (const key of REQUIRED_FIELDS) {
    if (!values.has(key)) throw invalidValue();
  }

  return record; // unknown keys were dropped after validation
}

/**
 * Parses `text` into an array of plain objects.
 * @param {string} text
 * @returns {Array<Record<string, string|number|string[]>>}
 */
function parseRecords(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    if (text[i] === '\r' || text[i] === '\n') throw invalidFormat(); // empty record

    const fields = [];
    for (;;) {
      const field = readField(text, i);
      fields.push(field);
      i = field.next;
      if (i < n && text[i] === '|') {
        i += 1;
        continue;
      }
      break;
    }

    records.push(buildRecord(fields));

    if (i >= n) break;

    const ending = text[i];
    if (ending === '\r') {
      i += 1;
      if (i < n && text[i] === '\n') i += 1; // CRLF
    } else if (ending === '\n') {
      i += 1;
    } else {
      throw invalidFormat();
    }
  }

  return records;
}

module.exports = { parseRecords };
