'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR; fields by literal ';'
 *  - whole field may be double quoted; "" decodes to " inside a quoted field
 *  - quoted content may hold separators, '=' signs, CR and LF
 *  - syntax / duplicate / whitespace problems => Error("INVALID_FORMAT")
 *  - missing or invalid required values => Error("INVALID_VALUE")
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order: required fields first, then the documented optional fields.
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];

const LIMITS = {
  WINDOW: [2, 60],
  RATE: [0, 10],
  LIMIT: [1, 125],
};

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

/**
 * Split the raw text into records of raw field tokens.
 * A token is { quoted: boolean, text: string } where `text` is the decoded
 * field body (whole `KEY=VALUE` text for quoted fields).
 */
function scanRecords(text) {
  const records = [];
  let cur = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (c === '\r' || c === '\n') {
      // Record terminator: closes the current record.
      records.push(cur);
      cur = [];
      if (c === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }

    let token;
    if (c === '"') {
      // Whole field quoted (including key/value text).
      i += 1;
      let buf = '';
      let closed = false;
      while (i < n) {
        const d = text[i];
        if (d === '"') {
          if (text[i + 1] === '"') {
            buf += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        buf += d;
        i += 1;
      }
      if (!closed) throw invalidFormat();
      // Nothing may follow a closing quote except a separator or record ending.
      if (i < n) {
        const e = text[i];
        if (e !== ';' && e !== '\r' && e !== '\n') throw invalidFormat();
      }
      token = { quoted: true, text: buf };
    } else {
      const start = i;
      while (i < n) {
        const d = text[i];
        if (d === ';' || d === '\r' || d === '\n') break;
        if (d === '"') throw invalidFormat(); // quote inside an unquoted field
        i += 1;
      }
      token = { quoted: false, text: text.slice(start, i) };
    }

    cur.push(token);

    if (i < n && text[i] === ';') {
      i += 1;
      if (i >= n) throw invalidFormat(); // trailing separator => empty field
      continue;
    }

    if (i < n) {
      // Record terminator directly after the field.
      records.push(cur);
      cur = [];
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
    }
  }

  if (cur.length > 0) records.push(cur);
  return records;
}

/** Decode a field token into { key, value } following the syntax rules. */
function decodeField(token) {
  const body = token.text;
  const eq = body.indexOf('=');
  if (eq < 0) throw invalidFormat();

  const key = body.slice(0, eq);
  const value = body.slice(eq + 1);

  // Unquoted fields must be exactly KEY=VALUE with one equals sign.
  if (!token.quoted && value.indexOf('=') !== -1) throw invalidFormat();

  if (!KEY_RE.test(key)) throw invalidFormat();

  // Whitespace policy: VALUE must already equal its trimmed form.
  if (value !== value.trim()) throw invalidFormat();

  return { key, value };
}

function parseUint(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  const num = Number(value);
  if (!Number.isSafeInteger(num)) return null;
  return num;
}

/** Build one output object for a record, validating semantics. */
function buildRecord(tokens) {
  if (tokens.length === 0) throw invalidFormat(); // a record needs at least one field

  const known = new Map();
  const unknown = [];
  const seen = new Set();

  for (const token of tokens) {
    const { key, value } = decodeField(token);
    if (seen.has(key)) throw invalidFormat(); // duplicate decoded key
    seen.add(key);
    if (SCHEMA.includes(key)) known.set(key, value);
    else unknown.push([key, value]);
  }

  // Semantic validation of required fields.
  const numbers = new Map();
  for (const key of REQUIRED) {
    if (!known.has(key)) throw invalidValue();
    const num = parseUint(known.get(key));
    if (num === null) throw invalidValue();
    const [min, max] = LIMITS[key];
    if (num < min || num > max) throw invalidValue();
    numbers.set(key, num);
  }

  const out = {};
  const define = (key, value) => {
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  // Known-field schema order, then retained unknown field order.
  for (const key of SCHEMA) {
    if (!known.has(key)) continue;
    if (key === 'COLOR') {
      define(key, known.get(key));
    } else if (key === 'FLAGS') {
      const raw = known.get(key);
      define(key, raw === '' ? [] : raw.split(',').map((part) => part.trim()));
    } else {
      define(key, numbers.get(key));
    }
  }

  for (const [key, value] of unknown) define(key, value);

  return out;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text.length === 0) return [];

  const records = scanRecords(text);
  const result = [];
  for (const tokens of records) result.push(buildRecord(tokens));
  return result;
}

module.exports = { parseExport };
