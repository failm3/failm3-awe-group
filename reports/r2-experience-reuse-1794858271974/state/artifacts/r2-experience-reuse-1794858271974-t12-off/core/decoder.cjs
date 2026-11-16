'use strict';

/**
 * Decoder for the "separated key/value records" format documented in FORMAT.md.
 *
 * Grammar summary
 * ---------------
 *   text    := record ( SEP record )* SEP?          // SEP := LF | CRLF | CR
 *   record  := field ( ';' field )*                 // at least one field
 *   field   := quoted | unquoted
 *   unquoted:= KEY '=' VALUE                        // exactly one '=' , no '"'
 *   quoted  := '"' ( [^"] | '""' )* '"'             // whole field; '""' -> '"'
 *   KEY     := [A-Z][A-Z0-9_]*
 *
 * A quoted field may contain ';', '=', CR and LF.  Nothing may follow the
 * closing quote except a field separator or the end of the record.
 *
 * Error precedence inside one record: syntax / duplicate / whitespace problems
 * are raised as INVALID_FORMAT while the record is being parsed; semantic
 * problems (missing or out-of-range required fields) are raised afterwards as
 * INVALID_VALUE.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (used for the insertion order of decoded objects).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const KNOWN = new Set(SCHEMA);

// Required fields and their inclusive canonical-integer bounds, schema order.
const REQUIRED = [
  ['WINDOW', 1, 40],
  ['RATE', 0, 10],
  ['LIMIT', 1, 25],
];

function invalid(message) {
  throw new Error(message);
}

/** Define an own enumerable property without triggering the __proto__ setter. */
function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function isLineBreak(c) {
  return c === '\n' || c === '\r';
}

/**
 * Split a decoded field body into KEY / VALUE and apply the lexical rules that
 * do not depend on the quoting style (key syntax, value whitespace policy).
 */
function splitField(raw, wasQuoted) {
  const eq = raw.indexOf('=');
  if (eq === -1) invalid('INVALID_FORMAT');
  // Unquoted fields must be exactly KEY=VALUE: a single equals sign.
  // Quoted fields keep everything after the first '=' as the value.
  if (!wasQuoted && raw.indexOf('=', eq + 1) !== -1) invalid('INVALID_FORMAT');

  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);

  if (!KEY_RE.test(key)) invalid('INVALID_FORMAT'); // bad / empty key
  if (value !== value.trim()) invalid('INVALID_FORMAT'); // whitespace policy

  return { key, value };
}

/**
 * Parse one field starting at `start`.  Returns the decoded {key, value} and
 * the index of the first character after the field (a separator, a record
 * break, or the end of input).
 */
function parseField(text, start) {
  const n = text.length;
  let i = start;

  if (text[i] === '"') {
    // Whole field is quoted.
    let raw = '';
    let closed = false;
    i += 1;
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        if (text[i + 1] === '"') {
          raw += '"';
          i += 2;
          continue;
        }
        i += 1;
        closed = true;
        break;
      }
      raw += c;
      i += 1;
    }
    if (!closed) invalid('INVALID_FORMAT'); // unterminated quote
    if (i < n) {
      const c = text[i];
      if (c !== ';' && !isLineBreak(c)) invalid('INVALID_FORMAT');
    }
    return { field: splitField(raw, true), next: i };
  }

  let raw = '';
  while (i < n) {
    const c = text[i];
    if (c === ';' || isLineBreak(c)) break;
    if (c === '"') invalid('INVALID_FORMAT'); // quote inside unquoted field
    raw += c;
    i += 1;
  }
  return { field: splitField(raw, false), next: i };
}

/** Convert one fully syntax-checked record into the output object. */
function buildRecord(fields) {
  const values = new Map();
  for (const { key, value } of fields) {
    if (values.has(key)) invalid('INVALID_FORMAT'); // duplicate decoded key
    values.set(key, value);
  }

  // Semantic validation happens only after the whole record parsed cleanly.
  for (const [name, lo, hi] of REQUIRED) {
    if (!values.has(name)) invalid('INVALID_VALUE');
    const raw = values.get(name);
    if (!UINT_RE.test(raw)) invalid('INVALID_VALUE');
    const num = Number(raw);
    if (!Number.isSafeInteger(num) || num < lo || num > hi) {
      invalid('INVALID_VALUE');
    }
    values.set(name, num);
  }

  const out = {};

  // Known fields first, in schema order.
  for (const name of SCHEMA) {
    if (!values.has(name)) continue;
    let value = values.get(name);
    if (name === 'FLAGS') {
      value = value === '' ? [] : value.split(',');
    }
    // WINDOW / RATE / LIMIT are already numbers; COLOR stays a string.
    defineOwn(out, name, value);
  }

  // Then retained unknown fields in original field order.
  for (const { key } of fields) {
    if (KNOWN.has(key)) continue;
    defineOwn(out, key, values.get(key));
  }

  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') invalid('INVALID_FORMAT');
  if (text.length === 0) return [];

  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    const c = text[i];
    if (isLineBreak(c)) {
      // Empty segment (blank line / trailing terminator): no record content.
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    const fields = [];
    for (;;) {
      const { field, next } = parseField(text, i);
      fields.push(field);
      i = next;

      if (i >= n) break;

      const sep = text[i];
      if (sep === ';') {
        i += 1;
        continue;
      }
      if (sep === '\n') {
        i += 1;
        break;
      }
      if (sep === '\r') {
        i += text[i + 1] === '\n' ? 2 : 1;
        break;
      }
      invalid('INVALID_FORMAT');
    }

    if (fields.length > 0) records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { decodeSeparated };
