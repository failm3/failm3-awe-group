'use strict';

/*
 * Separated key/value record decoder.
 * Implements FORMAT.md exactly.
 */

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (documented fields only).
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const INTEGER_RANGES = {
  WINDOW: [1, 40],
  RATE: [0, 10],
  LIMIT: [1, 25],
};
const REQUIRED_FIELDS = ['WINDOW', 'RATE', 'LIMIT'];

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

/**
 * Split the raw text into records; each record is an array of
 * { quoted, content } field descriptors where `content` is the already
 * unescaped field text (key/value text with any surrounding quotes removed).
 */
function scan(text) {
  const records = [];
  let fields = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    // ---- read one field ----
    if (text[i] === '"') {
      // Fully quoted field.
      i += 1;
      let buf = '';
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            buf += '"';
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        buf += c;
        i += 1;
      }
      if (!closed) invalidFormat();
      // Nothing may follow a closing quote except a separator or record ending.
      if (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
        invalidFormat();
      }
      fields.push({ quoted: true, content: buf });
    } else {
      // Unquoted field: runs until a separator or record ending.
      let buf = '';
      while (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
        if (text[i] === '"') invalidFormat(); // quotes in unquoted fields
        buf += text[i];
        i += 1;
      }
      fields.push({ quoted: false, content: buf });
    }

    // ---- field/record boundary ----
    if (i >= n) break;

    if (text[i] === ';') {
      i += 1;
      if (i >= n) invalidFormat(); // trailing separator -> empty field
      continue;
    }

    // Record ending: LF, CRLF or CR.
    if (text[i] === '\r' && text[i + 1] === '\n') {
      i += 2;
    } else {
      i += 1;
    }
    records.push(fields);
    fields = [];
  }

  if (fields.length > 0) records.push(fields);
  return records;
}

/** Decode one record's fields into ordered [key, value] pairs, validating syntax. */
function parseRecordFields(rawFields) {
  const pairs = [];
  const seen = new Set();

  for (const field of rawFields) {
    const content = field.content;
    const eq = content.indexOf('=');
    if (eq < 0) invalidFormat();

    if (!field.quoted) {
      // Unquoted fields must contain exactly one equals sign.
      if (content.indexOf('=', eq + 1) !== -1) invalidFormat();
    }

    const key = content.slice(0, eq);
    const value = content.slice(eq + 1);

    if (!KEY_PATTERN.test(key)) invalidFormat();

    // Whitespace policy: VALUE must already equal its trimmed form.
    if (value !== value.trim()) invalidFormat();

    if (seen.has(key)) invalidFormat();
    seen.add(key);

    pairs.push([key, value]);
  }

  if (pairs.length === 0) invalidFormat();
  return pairs;
}

function decodeInteger(key, value) {
  const range = INTEGER_RANGES[key];
  if (!CANONICAL_UINT.test(value)) invalidValue();
  const number = Number(value);
  if (!Number.isSafeInteger(number)) invalidValue();
  if (number < range[0] || number > range[1]) invalidValue();
  return number;
}

function setOwn(target, key, value) {
  // Always create a genuine own data property; never touch the prototype
  // (matters for "__proto__" and friends, which still count as plain data).
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(pairs) {
  const present = new Map();
  for (const [key, value] of pairs) present.set(key, value);

  // Required fields must exist before any value conversion ordering matters.
  for (const key of REQUIRED_FIELDS) {
    if (!present.has(key)) invalidValue();
  }

  const result = {};
  const emitted = new Set();

  const convert = (key, value) => {
    if (Object.prototype.hasOwnProperty.call(INTEGER_RANGES, key)) {
      return decodeInteger(key, value);
    }
    if (key === 'FLAGS') {
      return value === '' ? [] : value.split(',');
    }
    return value; // COLOR and retained unknown fields stay strings
  };

  // Known fields first, in schema order.
  for (const key of KNOWN_FIELDS) {
    if (present.has(key)) {
      setOwn(result, key, convert(key, present.get(key)));
      emitted.add(key);
    }
  }

  // Then retained unknown fields in original record field order.
  for (const [key, value] of pairs) {
    if (emitted.has(key) || KNOWN_FIELDS.indexOf(key) !== -1) continue;
    setOwn(result, key, value);
  }

  return result;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];

  const records = scan(text);
  const out = [];
  for (const rawFields of records) {
    // Syntax/duplicate/whitespace problems first (per record), then semantics.
    const pairs = parseRecordFields(rawFields);
    out.push(buildRecord(pairs));
  }
  return out;
}

module.exports = { decodeSeparated };
