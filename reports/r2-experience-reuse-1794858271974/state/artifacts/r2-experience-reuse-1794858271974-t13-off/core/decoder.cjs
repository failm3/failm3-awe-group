'use strict';

/*
 * Separated key/value record decoder (see FORMAT.md).
 *
 * Records end with LF, CRLF or CR outside quotes. Fields are separated by '|'
 * outside quotes. A whole field may be double quoted ("" decodes to "), and
 * quoted text may contain '|', '=', CR and LF. Records are lexed and validated
 * one at a time, so within a record syntax errors (INVALID_FORMAT) win over
 * semantic errors (INVALID_VALUE), and earlier records are reported first.
 */

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

function fail(message) {
  throw new Error(message);
}

function canonicalUint(min, max) {
  return (raw) => {
    if (!CANONICAL_UINT_RE.test(raw)) fail(INVALID_VALUE);
    const num = Number(raw);
    if (num < min || num > max) fail(INVALID_VALUE);
    return num;
  };
}

function decimalInt(min, max) {
  return (raw) => {
    if (!DECIMAL_INT_RE.test(raw)) fail(INVALID_VALUE);
    const num = Number(raw);
    if (num < min || num > max) fail(INVALID_VALUE);
    return num;
  };
}

// Known fields in schema order. DURATION is the only documented optional field.
const SCHEMA = [
  { key: 'WINDOW', required: true, convert: canonicalUint(2, 50) },
  { key: 'RATE', required: true, convert: canonicalUint(0, 20) },
  { key: 'LIMIT', required: true, convert: canonicalUint(1, 50) },
  { key: 'DURATION', required: false, convert: decimalInt(1, 120) }
];
const KNOWN = new Set(SCHEMA.map((f) => f.key));

/**
 * Lex one record starting at `pos`.
 * Returns { fields: [{ text, quoted }], next } where `next` is the index just
 * past the record ending (or text.length).
 */
function lexRecord(text, pos) {
  const n = text.length;
  const fields = [];
  let i = pos;

  for (;;) {
    let value = '';
    let quoted = false;

    if (text[i] === '"') {
      quoted = true;
      i += 1;
      for (;;) {
        if (i >= n) fail(INVALID_FORMAT); // unterminated quote
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      // Only a separator or a record ending may follow a closing quote.
      if (i < n && text[i] !== '|' && text[i] !== '\r' && text[i] !== '\n') {
        fail(INVALID_FORMAT);
      }
    } else {
      while (i < n) {
        const ch = text[i];
        if (ch === '|' || ch === '\r' || ch === '\n') break;
        if (ch === '"') fail(INVALID_FORMAT); // quote inside unquoted field
        value += ch;
        i += 1;
      }
    }

    fields.push({ text: value, quoted });

    if (i < n && text[i] === '|') {
      i += 1;
      continue;
    }
    if (i < n && text[i] === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
    } else if (i < n && text[i] === '\n') {
      i += 1;
    }
    return { fields, next: i };
  }
}

/** Syntax-check a record's fields; returns Map of key -> raw value. */
function parseFields(fields) {
  const values = new Map();
  for (const { text, quoted } of fields) {
    const eq = text.indexOf('=');
    if (eq === -1) fail(INVALID_FORMAT);
    // Unquoted fields need exactly one '='; quoted values may contain more.
    if (!quoted && text.indexOf('=', eq + 1) !== -1) fail(INVALID_FORMAT);
    const key = text.slice(0, eq);
    const value = text.slice(eq + 1);
    if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
    if (values.has(key)) fail(INVALID_FORMAT);
    if (value !== value.trim()) fail(INVALID_FORMAT);
    values.set(key, value);
  }
  return values;
}

function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

/** Semantic validation and conversion of one record. */
function buildRecord(values) {
  const out = {};
  for (const { key, required, convert } of SCHEMA) {
    if (!values.has(key)) {
      if (required) fail(INVALID_VALUE);
      continue;
    }
    setOwn(out, key, convert(values.get(key)));
  }
  for (const [key, value] of values) {
    if (!KNOWN.has(key)) setOwn(out, key, value);
  }
  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  const result = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next } = lexRecord(text, pos);
    result.push(buildRecord(parseFields(fields)));
    pos = next;
  }
  return result;
}

module.exports = { decodeSeparated };
