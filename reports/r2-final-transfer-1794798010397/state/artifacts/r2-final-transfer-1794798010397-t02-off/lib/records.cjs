'use strict';

/**
 * Separated key/value records -- implements FORMAT.md.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (required first, then the documented optional fields).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const KNOWN = new Set(SCHEMA);
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];

const fmtError = () => new Error('INVALID_FORMAT');
const valError = () => new Error('INVALID_VALUE');

const isSepOrEnd = (ch) => ch === ';' || ch === '\r' || ch === '\n';

// Split a decoded field body into { key, value } under strict KEY=VALUE rules.
function splitField(body) {
  const eq = body.indexOf('=');
  if (eq < 0) throw fmtError(); // no equals sign
  if (body.indexOf('=', eq + 1) !== -1) throw fmtError(); // more than one equals
  const key = body.slice(0, eq);
  if (!KEY_RE.test(key)) throw fmtError();
  // Whitespace policy: trim leading/trailing whitespace from decoded VALUE only.
  const value = body.slice(eq + 1).trim();
  return { key, value };
}

function parseInteger(raw, min, max) {
  if (!UINT_RE.test(raw)) throw valError(); // non-canonical, signed, or empty
  const num = Number(raw);
  if (num < min || num > max) throw valError();
  return num;
}

// FLAGS is the documented optional field that decodes to an array. FORMAT.md
// attaches no element grammar to it, so its decoded value is simply split on
// commas with each element kept verbatim.
function parseFlags(raw) {
  return raw === '' ? [] : raw.split(',');
}

function parseRecords(text) {
  if (typeof text !== 'string') throw fmtError();
  if (text.length === 0) return [];

  const n = text.length;
  let i = 0;
  const records = [];

  // Read one field beginning at i; advance i past it.
  const readField = () => {
    const first = text[i];
    // A field may not be empty, so a separator/newline here is a syntax error.
    if (first === undefined || isSepOrEnd(first)) throw fmtError();

    if (first === '"') {
      // A whole field may be double quoted, including its key and value text.
      let j = i + 1;
      let out = '';
      let closed = false;
      while (j < n) {
        const ch = text[j];
        if (ch === '"') {
          if (j + 1 < n && text[j + 1] === '"') {
            out += '"'; // two double quotes decode to one quote
            j += 2;
            continue;
          }
          j += 1;
          closed = true;
          break;
        }
        out += ch; // quotes may contain separators, equals signs, CR and LF
        j += 1;
      }
      if (!closed) throw fmtError(); // unterminated quote
      // Nothing may follow a closing quote except a separator or record ending.
      if (j < n && !isSepOrEnd(text[j])) throw fmtError();
      i = j;
      return splitField(out);
    }

    // Unquoted field: runs to a separator or record ending; quotes are illegal.
    let j = i;
    while (j < n && !isSepOrEnd(text[j])) {
      if (text[j] === '"') throw fmtError(); // quotes in unquoted fields
      j += 1;
    }
    const body = text.slice(i, j);
    i = j;
    return splitField(body);
  };

  while (i < n) {
    const fields = [];
    for (;;) {
      fields.push(readField());
      if (i >= n) break;
      const c = text[i];
      if (c === ';') {
        i += 1;
        if (i >= n) throw fmtError(); // trailing separator leaves an empty field
        continue;
      }
      if (c === '\r') {
        i += 1;
        if (i < n && text[i] === '\n') i += 1; // CRLF
        break;
      }
      if (c === '\n') {
        i += 1;
        break;
      }
      throw fmtError();
    }

    // Whole-record syntax is validated first, then decoded-key uniqueness.
    const seen = new Set();
    for (const f of fields) {
      if (seen.has(f.key)) throw fmtError();
      seen.add(f.key);
    }

    // Drop unknown keys only after syntax and duplicate validation.
    const known = new Map();
    for (const f of fields) {
      if (KNOWN.has(f.key)) known.set(f.key, f.value);
    }

    // Required-field presence, then per-field value validation.
    for (const key of REQUIRED) {
      if (!known.has(key)) throw valError();
    }

    const out = {};
    for (const key of SCHEMA) {
      if (!known.has(key)) continue;
      const raw = known.get(key);
      let value;
      if (key === 'WINDOW') value = parseInteger(raw, 3, 40);
      else if (key === 'RATE') value = parseInteger(raw, 0, 30);
      else if (key === 'LIMIT') value = parseInteger(raw, 1, 75);
      else if (key === 'FLAGS') value = parseFlags(raw);
      else if (raw === 'cyan' || raw === 'magenta') value = raw;
      else throw valError(); // COLOR: case-sensitive enum
      // defineProperty makes every schema key a plain own enumerable data
      // property, so a prototype-looking key can never alter the result.
      Object.defineProperty(out, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    records.push(out);
  }

  return records;
}

module.exports = { parseRecords };
