'use strict';

/**
 * Separated key/value record parser.
 *
 * See FORMAT.md. Implements the complete documented grammar:
 *  - records separated by LF, CRLF or CR (quote aware: CR/LF may appear inside quotes)
 *  - fields separated by a literal ';'
 *  - unquoted field: exactly KEY=VALUE with one '=' and KEY =~ /^[A-Z][A-Z0-9_]*$/
 *  - a whole field may be double quoted; "" inside quotes decodes to a single quote
 *  - nothing may follow the closing quote except ';' or a record ending
 *  - VALUE must already equal its trimmed form
 *  - duplicate decoded keys are rejected (before unknown keys are dropped)
 *  - unknown keys are dropped; known fields follow schema order
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order. Only these survive into the output object.
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

// Required fields with their inclusive integer ranges.
const REQUIRED = {
  WINDOW: { min: 1, max: 20 },
  RATE: { min: 0, max: 10 },
  LIMIT: { min: 1, max: 25 },
};

const FORMAT_ERROR = 'INVALID_FORMAT';
const VALUE_ERROR = 'INVALID_VALUE';

function fail(message) {
  throw new Error(message);
}

/** Parse a single field beginning at `start`. Returns { key, value, next }. */
function parseField(text, start) {
  const n = text.length;

  if (text[start] === '"') {
    // Whole-field quoted field.
    let i = start + 1;
    let decoded = '';
    let closed = false;
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          decoded += '"';
          i += 2;
          continue;
        }
        i += 1;
        closed = true;
        break;
      }
      decoded += c;
      i += 1;
    }
    if (!closed) fail(FORMAT_ERROR); // unterminated quote

    if (i < n) {
      const after = text[i];
      if (after !== ';' && after !== '\r' && after !== '\n') {
        fail(FORMAT_ERROR); // trailing junk after the closing quote
      }
    }

    const eq = decoded.indexOf('=');
    if (eq < 0) fail(FORMAT_ERROR); // quoted field still has to be KEY=VALUE
    const key = decoded.slice(0, eq);
    const value = decoded.slice(eq + 1);
    if (!KEY_RE.test(key)) fail(FORMAT_ERROR);
    if (value !== value.trim()) fail(FORMAT_ERROR);
    return { key, value, next: i };
  }

  // Unquoted field: runs to ';', CR, LF or end of input.
  let i = start;
  while (i < n) {
    const c = text[i];
    if (c === ';' || c === '\r' || c === '\n') break;
    if (c === '"') fail(FORMAT_ERROR); // quotes are not allowed in unquoted fields
    i += 1;
  }
  const raw = text.slice(start, i);
  const eq = raw.indexOf('=');
  if (eq < 0) fail(FORMAT_ERROR);
  if (raw.indexOf('=', eq + 1) !== -1) fail(FORMAT_ERROR); // exactly one '='
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) fail(FORMAT_ERROR);
  if (value !== value.trim()) fail(FORMAT_ERROR);
  return { key, value, next: i };
}

/** Convert a raw string to a JavaScript number using the semantic rules. */
function toCanonicalInteger(raw, min, max) {
  if (!CANONICAL_UINT_RE.test(raw)) return null;
  const num = Number(raw);
  if (!Number.isSafeInteger(num)) return null;
  if (num < min || num > max) return null;
  return num;
}

/** Validate semantics for one record and build its output object. */
function buildRecord(fields) {
  const map = new Map();
  for (const field of fields) map.set(field.key, field.value);

  for (const name of Object.keys(REQUIRED)) {
    if (!map.has(name)) fail(VALUE_ERROR); // missing required field
    const { min, max } = REQUIRED[name];
    const num = toCanonicalInteger(map.get(name), min, max);
    if (num === null) fail(VALUE_ERROR); // non-canonical or out of range
  }

  const out = {};
  for (const name of SCHEMA) {
    if (!map.has(name)) continue;
    const raw = map.get(name);
    if (Object.prototype.hasOwnProperty.call(REQUIRED, name)) {
      const { min, max } = REQUIRED[name];
      out[name] = toCanonicalInteger(raw, min, max);
    } else if (name === 'COLOR') {
      out[name] = raw; // COLOR stays a string
    } else if (name === 'FLAGS') {
      out[name] = raw === '' ? [] : raw.split(','); // FLAGS becomes an array
    }
  }
  return out;
}

/**
 * Parse the whole document.
 * @param {string} text
 * @returns {Array<object>}
 */
function parseRecords(text) {
  if (typeof text !== 'string') fail(FORMAT_ERROR);
  if (text === '') return [];

  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    const fields = [];
    const seen = new Set();
    let hasContent = false;
    let expectField = false; // set right after a ';'

    for (;;) {
      if (i >= n) {
        if (expectField) fail(FORMAT_ERROR); // dangling separator
        break;
      }
      const c = text[i];
      if (c === '\r' || c === '\n') {
        if (expectField) fail(FORMAT_ERROR); // dangling separator
        i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
        break;
      }

      const field = parseField(text, i);
      hasContent = true;
      if (seen.has(field.key)) fail(FORMAT_ERROR); // duplicate decoded key
      seen.add(field.key);
      fields.push(field);
      i = field.next;
      expectField = false;

      if (i < n && text[i] === ';') {
        i += 1;
        expectField = true;
      }
    }

    if (!hasContent) continue; // blank record between separators is ignored
    records.push(buildRecord(fields)); // semantics last, per record
  }

  return records;
}

module.exports = { parseRecords };
