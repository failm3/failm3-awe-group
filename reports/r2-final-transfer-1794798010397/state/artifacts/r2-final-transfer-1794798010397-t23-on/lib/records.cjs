'use strict';

/**
 * Separated key/value record parser.
 * Implements the local FORMAT.md grammar and semantics.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_INT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (used for object key insertion order).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];

const RANGES = {
  WINDOW: [3, 50],
  RATE: [0, 40],
  LIMIT: [1, 150]
};

const FLAG_VALUES = ['read', 'write'];

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

/**
 * Split the raw text into records of raw fields.
 * Each field is recorded together with whether it was a whole-quoted field.
 */
function tokenize(text) {
  const records = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    const fields = [];
    let atFieldStart = true; // true when the next char begins a new field
    let recordEnded = false;

    while (!recordEnded) {
      let value;
      let quoted = false;

      if (atFieldStart && text[i] === '"') {
        // Whole-quoted field: scan to the closing quote, decoding "" -> ".
        quoted = true;
        i += 1;
        let buf = '';
        let closed = false;
        while (i < len) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              buf += '"';
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          buf += c;
          i += 1;
        }
        if (!closed) throw invalidFormat(); // unterminated quote
        if (i < len) {
          const c = text[i];
          if (c !== '|' && c !== '\r' && c !== '\n') throw invalidFormat();
        }
        value = buf;
      } else {
        // Unquoted field: literal chars up to a separator or record ending.
        const start = i;
        while (i < len) {
          const c = text[i];
          if (c === '|' || c === '\r' || c === '\n') break;
          if (c === '"') throw invalidFormat(); // quote inside an unquoted field
          i += 1;
        }
        value = text.slice(start, i);
      }

      fields.push({ value: value, quoted: quoted });

      if (i >= len) {
        recordEnded = true;
        atFieldStart = false;
      } else if (text[i] === '|') {
        i += 1;
        atFieldStart = true;
      } else {
        // Record ending: CRLF, LF, or CR.
        if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
        else i += 1;
        recordEnded = true;
        atFieldStart = false;
      }
    }

    records.push(fields);
  }

  return records;
}

/**
 * Validate the decoded fields of one record and build its plain object.
 * Syntax / duplicate / whitespace problems beat semantic problems.
 */
function buildRecord(fields) {
  const seen = new Map();

  for (const field of fields) {
    const raw = field.value;
    if (raw === '') throw invalidFormat();

    const eq = raw.indexOf('=');
    if (eq < 0) throw invalidFormat();
    if (!field.quoted && raw.indexOf('=', eq + 1) !== -1) throw invalidFormat(); // exactly one '='

    const key = raw.slice(0, eq);
    if (!KEY_RE.test(key)) throw invalidFormat();
    if (seen.has(key)) throw invalidFormat(); // duplicate decoded key

    // Whitespace policy: trim leading/trailing whitespace from the value only.
    seen.set(key, raw.slice(eq + 1).trim());
  }

  if (fields.length === 0) throw invalidFormat();

  // --- semantics ---
  const out = {};

  for (const key of SCHEMA) {
    if (!seen.has(key)) continue;

    const value = seen.get(key);

    if (key === 'COLOR') {
      defineOwn(out, key, value);
      continue;
    }

    if (key === 'FLAGS') {
      defineOwn(out, key, parseFlags(value));
      continue;
    }

    defineOwn(out, key, parseInteger(key, value));
  }

  // Required fields must be present and valid.
  for (const key of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!seen.has(key)) throw invalidValue();
  }

  // Unknown keys: retained decoded strings, in original field order, after known fields.
  for (const [key, value] of seen) {
    if (SCHEMA.indexOf(key) !== -1) continue;
    defineOwn(out, key, value);
  }

  return out;
}

function parseInteger(key, value) {
  if (!CANONICAL_INT_RE.test(value)) throw invalidValue();
  const range = RANGES[key];
  const n = Number(value);
  if (n < range[0] || n > range[1]) throw invalidValue();
  return n;
}

function parseFlags(value) {
  const parts = value.split(',');
  if (parts.length === 0) throw invalidValue();
  const result = [];
  const seen = new Set();
  for (const part of parts) {
    if (FLAG_VALUES.indexOf(part) === -1) throw invalidValue();
    if (seen.has(part)) throw invalidValue();
    seen.add(part);
    result.push(part);
  }
  return result;
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value: value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

function parseRecords(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = tokenize(text);
  const result = [];
  for (const fields of records) {
    result.push(buildRecord(fields));
  }
  return result;
}

module.exports = { parseRecords };
