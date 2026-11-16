'use strict';

/*
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR (a CR/LF inside a quoted field is data)
 *  - fields separated by a literal ';'
 *  - a whole field may be double quoted; '""' inside quotes decodes to '"'
 *  - unquoted fields are exactly KEY=VALUE (a single '='), KEY = [A-Z][A-Z0-9_]*
 *  - VALUE must already equal its trimmed form
 *  - required fields WINDOW/RATE/LIMIT are canonical unsigned decimals in range
 *  - no optional semantic fields are defined for this format, so COLOR, FLAGS
 *    and any other non-required key are retained as unknown string values
 *  - unknown keys are retained, in field order, after the known fields
 */

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known field schema order. FORMAT.md defines no additional semantic field.
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT'];

const RANGES = {
  WINDOW: [1, 40],
  RATE: [0, 10],
  LIMIT: [1, 25],
};

function fail(message) {
  return new Error(message);
}

// A "record terminator" is CRLF, CR, LF or end of input.
// Returns the index just past the terminator.
function skipTerminator(text, j) {
  if (text[j] === '\r') return text[j + 1] === '\n' ? j + 2 : j + 1;
  if (text[j] === '\n') return j + 1;
  return j;
}

function atTerminator(text, j) {
  const c = text[j];
  return c === undefined || c === '\n' || c === '\r';
}

/**
 * Split one field's decoded text into { key, value }.
 * Quoted fields are split at the first '=' (the quotes may legitimately contain
 * further equals signs); unquoted fields must contain exactly one '='.
 */
function splitField(field, wasQuoted) {
  const eq = field.indexOf('=');
  if (eq < 0) throw fail(INVALID_FORMAT);
  if (!wasQuoted && field.indexOf('=', eq + 1) !== -1) throw fail(INVALID_FORMAT);
  const key = field.slice(0, eq);
  const value = field.slice(eq + 1);
  if (!KEY_RE.test(key)) throw fail(INVALID_FORMAT);
  if (value !== value.trim()) throw fail(INVALID_FORMAT);
  return { key, value };
}

/**
 * Parse a single record starting at `start`.
 * Returns { pairs, next } where `next` is the index of the following record.
 * All syntax, duplicate-key and whitespace checks happen here so that they take
 * precedence over semantic (INVALID_VALUE) problems.
 */
function parseRecord(text, start) {
  const n = text.length;
  const pairs = [];
  let i = start;

  for (;;) {
    let content;

    if (text[i] === '"') {
      // ---- quoted field ----
      let j = i + 1;
      let s = '';
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === '"') {
          if (text[j + 1] === '"') {
            s += '"';
            j += 2;
          } else {
            j += 1;
            closed = true;
            break;
          }
        } else {
          s += c;
          j += 1;
        }
      }
      if (!closed) throw fail(INVALID_FORMAT); // unterminated quote

      // Nothing may follow a closing quote except ';', a record ending or EOF.
      if (!(j >= n || text[j] === ';' || atTerminator(text, j))) {
        throw fail(INVALID_FORMAT);
      }

      pairs.push(splitField(s, true));

      if (j >= n) return { pairs, next: n };
      if (text[j] === ';') {
        i = j + 1;
        continue;
      }
      return { pairs, next: skipTerminator(text, j) };
    }

    // ---- unquoted field ----
    let j = i;
    let s = '';
    while (j < n && !atTerminator(text, j) && text[j] !== ';') {
      if (text[j] === '"') throw fail(INVALID_FORMAT); // quote inside unquoted field
      s += text[j];
      j += 1;
    }

    pairs.push(splitField(s, false));

    if (j >= n) return { pairs, next: n };
    if (text[j] === ';') {
      i = j + 1;
      continue;
    }
    return { pairs, next: skipTerminator(text, j) };
  }
}

function toCanonicalInt(name, value) {
  const [min, max] = RANGES[name];
  if (!UINT_RE.test(value)) throw fail(INVALID_VALUE);
  const num = Number(value);
  if (num < min || num > max) throw fail(INVALID_VALUE);
  return num;
}

// Define an own enumerable property without ever touching the prototype chain
// (so keys such as "__proto__" stay plain data).
function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(pairs) {
  const seen = new Map();
  for (const pair of pairs) {
    if (seen.has(pair.key)) throw fail(INVALID_FORMAT); // duplicate decoded key
    seen.set(pair.key, pair.value);
  }

  // Required fields: missing or invalid -> INVALID_VALUE.
  for (const name of Object.keys(RANGES)) {
    if (!seen.has(name)) throw fail(INVALID_VALUE);
  }

  const record = {};
  for (const name of SCHEMA) {
    if (!seen.has(name)) continue;
    defineOwn(record, name, toCanonicalInt(name, seen.get(name)));
  }

  // Unknown keys: retained verbatim, in original record field order.
  const known = new Set(SCHEMA);
  for (const pair of pairs) {
    if (known.has(pair.key)) continue;
    defineOwn(record, pair.key, pair.value);
  }

  return record;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw fail(INVALID_FORMAT);
  if (text === '') return [];

  const records = [];
  let i = 0;
  while (i < text.length) {
    const parsed = parseRecord(text, i);
    records.push(buildRecord(parsed.pairs));
    i = parsed.next;
  }
  return records;
}

module.exports = { decodeSeparated };
