'use strict';

// Separated key/value record decoder.
// Implements the grammar and semantics documented in FORMAT.md.

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
// Canonical unsigned decimal integer: "0" or a nonzero value without a leading zero.
const UINT_PATTERN = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (used for object key insertion order).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const KNOWN_KEYS = new Set(SCHEMA);
const REQUIRED_KEYS = new Set(['WINDOW', 'RATE', 'LIMIT']);
const FLAG_VALUES = new Set(['fast', 'safe']);
const RANGES = {
  WINDOW: [3, 20],
  RATE: [0, 40],
  LIMIT: [1, 150],
};

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function isBreak(ch) {
  return ch === '\r' || ch === '\n';
}

// Reads one field per call: a whole-field double-quoted field or an unquoted
// field. Throws INVALID_FORMAT for unterminated quotes, stray quotes and any
// character following a closing quote other than a separator or record end.
function createRecordReader(text) {
  const n = text.length;
  let i = 0;

  function readQuoted() {
    i += 1; // opening quote
    let out = '';
    for (;;) {
      if (i >= n) throw formatError(); // unterminated quote
      const ch = text[i];
      if (ch === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          out += '"'; // doubled quote decodes to one quote
          i += 2;
          continue;
        }
        i += 1; // closing quote
        break;
      }
      out += ch;
      i += 1;
    }
    if (i < n && text[i] !== '|' && !isBreak(text[i])) throw formatError();
    return out;
  }

  function readUnquoted() {
    let out = '';
    for (;;) {
      if (i >= n) break;
      const ch = text[i];
      if (ch === '|' || isBreak(ch)) break;
      if (ch === '"') throw formatError(); // quote inside an unquoted field
      out += ch;
      i += 1;
    }
    return out;
  }

  function consumeBreak() {
    if (text[i] === '\r') {
      i += 1;
      if (i < n && text[i] === '\n') i += 1;
    } else if (text[i] === '\n') {
      i += 1;
    }
  }

  // Returns the field list of the next record, or null when input is exhausted.
  // Empty (zero-length) records are skipped.
  return function nextRecord() {
    while (i < n) {
      if (isBreak(text[i])) {
        consumeBreak();
        continue;
      }
      const fields = [];
      for (;;) {
        let field;
        if (i < n && text[i] === '"') {
          field = { quoted: true, text: readQuoted() };
        } else if (i >= n || text[i] === '|' || isBreak(text[i])) {
          field = { quoted: false, text: '' };
        } else {
          field = { quoted: false, text: readUnquoted() };
        }
        fields.push(field);
        if (i >= n) break;
        if (text[i] === '|') {
          i += 1;
          continue;
        }
        if (isBreak(text[i])) break;
        throw formatError();
      }
      if (i < n) consumeBreak();
      return fields;
    }
    return null;
  };
}

function parseUint(key, raw) {
  if (!UINT_PATTERN.test(raw)) throw valueError();
  const num = Number(raw);
  const range = RANGES[key];
  if (num < range[0] || num > range[1]) throw valueError();
  return num;
}

function parseFlags(raw) {
  const parts = raw.split(',');
  const seen = new Set();
  for (const part of parts) {
    if (!FLAG_VALUES.has(part)) throw valueError();
    if (seen.has(part)) throw valueError();
    seen.add(part);
  }
  return parts;
}

// Syntax and duplicate validation for one record, then semantic validation,
// then unknown-key removal.
function buildRecord(fields) {
  const seen = new Set();
  const values = new Map();

  for (const field of fields) {
    const raw = field.text;
    const eq = raw.indexOf('=');
    if (eq <= 0) throw formatError();
    if (raw.indexOf('=', eq + 1) !== -1) throw formatError();
    const key = raw.slice(0, eq);
    if (!KEY_PATTERN.test(key)) throw formatError();
    if (seen.has(key)) throw formatError(); // duplicate decoded key
    seen.add(key);
    values.set(key, raw.slice(eq + 1).trim()); // trim VALUE only
  }

  const entries = [];
  for (const key of SCHEMA) {
    if (!values.has(key)) {
      if (REQUIRED_KEYS.has(key)) throw valueError();
      continue;
    }
    const raw = values.get(key);
    if (key === 'FLAGS') {
      entries.push([key, parseFlags(raw)]);
    } else if (key === 'COLOR') {
      entries.push([key, raw]);
    } else {
      entries.push([key, parseUint(key, raw)]);
    }
  }

  for (const [key, raw] of values) {
    if (!KNOWN_KEYS.has(key)) entries.push([key, raw]);
  }

  // Object.fromEntries defines own data properties, so prototype-looking keys
  // stay plain data and never mutate the result prototype.
  return Object.fromEntries(entries);
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw formatError();
  const nextRecord = createRecordReader(text);
  const records = [];
  for (let fields = nextRecord(); fields !== null; fields = nextRecord()) {
    records.push(buildRecord(fields));
  }
  return records;
}

module.exports = { decodeSeparated };
