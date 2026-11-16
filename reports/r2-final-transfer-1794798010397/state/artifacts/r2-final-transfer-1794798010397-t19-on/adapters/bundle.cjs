'use strict';

/**
 * Separated key/value record parser.
 *
 * Grammar (see FORMAT.md):
 *   records   separated by LF, CRLF or CR
 *   record    one or more fields separated by '|'
 *   field     either an unquoted `KEY=VALUE` (exactly one '=') or a wholly
 *             double-quoted field (`"..."`, `""` decodes to `"`), where quotes
 *             may hold separators, equals signs, CR and LF.
 *
 * Errors: `Error('INVALID_FORMAT')` for syntax / duplicate key problems,
 * `Error('INVALID_VALUE')` for semantic problems (checked afterwards).
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order. COLOR is the only documented optional field.
const SCHEMA_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const INT_RANGES = {
  WINDOW: [2, 60],
  RATE: [0, 40],
  LIMIT: [1, 50],
};

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

/**
 * Split the raw text into records of decoded fields.
 * Each field is `{ text, quoted }` where `text` is the unquoted/decoded content.
 */
function splitRecords(text) {
  const records = [];
  let fields = [];
  let raw = '';
  let quotedField = false;
  let mode = 'open'; // 'open' | 'quoted' | 'after'
  let atRecordStart = true;

  const endField = () => {
    fields.push({ text: raw, quoted: quotedField });
    raw = '';
    quotedField = false;
    mode = 'open';
  };

  const endRecord = () => {
    endField();
    records.push(fields);
    fields = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (mode === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') {
          raw += '"';
          i++;
        } else {
          mode = 'after';
        }
      } else {
        raw += c; // separators, '=', CR and LF are literal inside quotes
      }
      continue;
    }

    if (mode === 'after') {
      // Nothing may follow a closing quote except a separator or record ending.
      if (c === '|') {
        endField();
        atRecordStart = false;
      } else if (c === '\n') {
        endRecord();
        atRecordStart = true;
      } else if (c === '\r') {
        endRecord();
        atRecordStart = true;
        if (text[i + 1] === '\n') i++;
      } else {
        invalidFormat();
      }
      continue;
    }

    // mode === 'open'
    if (c === '"') {
      if (raw !== '') invalidFormat(); // quotes inside an unquoted field
      mode = 'quoted';
      quotedField = true;
      atRecordStart = false;
    } else if (c === '|') {
      endField();
      atRecordStart = false;
    } else if (c === '\n') {
      endRecord();
      atRecordStart = true;
    } else if (c === '\r') {
      endRecord();
      atRecordStart = true;
      if (text[i + 1] === '\n') i++;
    } else {
      raw += c;
      atRecordStart = false;
    }
  }

  if (mode === 'quoted') invalidFormat(); // unterminated quote
  if (!atRecordStart) endRecord();

  return records;
}

/** Syntax phase for one record: field splitting, keys, duplicates. */
function decodeRecord(fields) {
  const entries = [];
  const seen = new Set();

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const text = field.text;
    const eq = text.indexOf('=');
    if (eq < 0) invalidFormat();

    const key = text.slice(0, eq);
    let value = text.slice(eq + 1);

    // An unquoted field is exactly KEY=VALUE with a single equals sign.
    if (!field.quoted && value.indexOf('=') !== -1) invalidFormat();
    if (!KEY_RE.test(key)) invalidFormat();
    if (seen.has(key)) invalidFormat();
    seen.add(key);

    // Whitespace is trimmed from decoded values only.
    value = value.trim();
    entries.push([key, value]);
  }

  return entries;
}

/** Semantic phase for one record: required fields, ranges, conversions. */
function buildRecord(entries) {
  const values = new Map(entries);

  for (let i = 0; i < REQUIRED.length; i++) {
    if (!values.has(REQUIRED[i])) invalidValue();
  }

  const outIndex = new Map();
  const out = {};
  const define = (key, value) => {
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    outIndex.set(key, value);
  };

  for (let i = 0; i < SCHEMA_ORDER.length; i++) {
    const key = SCHEMA_ORDER[i];
    if (!values.has(key)) continue;

    const rawValue = values.get(key);

    if (key === 'COLOR') {
      define(key, rawValue); // COLOR stays a string, unconstrained
      continue;
    }

    if (key === 'FLAGS') {
      define(key, parseFlags(rawValue));
      continue;
    }

    const range = INT_RANGES[key];
    if (!UINT_RE.test(rawValue)) invalidValue();
    const num = Number(rawValue);
    if (!Number.isSafeInteger(num) || num < range[0] || num > range[1]) {
      invalidValue();
    }
    define(key, num);
  }

  return out;
}

function parseFlags(value) {
  const parts = value.split(',');
  if (parts.length === 0) invalidValue();
  const seen = new Set();
  const result = [];
  for (let i = 0; i < parts.length; i++) {
    const flag = parts[i];
    if (flag !== 'alpha' && flag !== 'beta') invalidValue();
    if (seen.has(flag)) invalidValue();
    seen.add(flag);
    result.push(flag);
  }
  return result;
}

function parseBundle(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];

  const records = splitRecords(text);
  const out = [];
  for (let i = 0; i < records.length; i++) {
    out.push(buildRecord(decodeRecord(records[i])));
  }
  return out;
}

module.exports = { parseBundle };
