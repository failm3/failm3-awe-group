'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR (outside of quoted fields)
 *  - fields separated by literal '|'
 *  - whole-field double quoting with "" -> " decoding
 *  - keys must match [A-Z][A-Z0-9_]*, exactly one '=' per field
 *  - values are trimmed; known fields converted to numbers / arrays
 *  - unknown fields retained as strings in field order after known fields
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known field schema order (required fields first, then the documented
// optional field). Unknown fields are appended after these in field order.
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS'];
const KNOWN_SET = new Set(KNOWN_FIELDS);

const WINDOW_MIN = 3;
const WINDOW_MAX = 50;
const RATE_MIN = 0;
const RATE_MAX = 40;
const LIMIT_MIN = 1;
const LIMIT_MAX = 150;
const FLAG_VALUES = new Set(['read', 'write']);

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

const QUOTE = 34; // '"'
const PIPE = '|';
const CR = '\r';
const LF = '\n';

/**
 * Split the raw text into records of decoded field texts.
 * Syntax problems (unterminated quotes, stray characters after a closing
 * quote, quotes inside unquoted fields, empty fields/records) raise
 * INVALID_FORMAT here, before any semantic checking happens.
 */
function tokenize(text) {
  const n = text.length;
  if (n === 0) return [];

  const records = [];
  let fields = [];
  let i = 0;

  for (;;) {
    // ---- read exactly one field, decoding quotes as needed ----
    let decoded;

    if (i < n && text.charCodeAt(i) === QUOTE) {
      // Whole-field quoted field.
      i += 1;
      let buf = '';
      let closed = false;
      while (i < n) {
        if (text.charCodeAt(i) === QUOTE) {
          if (i + 1 < n && text.charCodeAt(i + 1) === QUOTE) {
            buf += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        buf += text[i];
        i += 1;
      }
      if (!closed) invalidFormat(); // unterminated quote
      if (i < n) {
        const ch = text[i];
        // Nothing may follow a closing quote except a separator or record end.
        if (ch !== PIPE && ch !== CR && ch !== LF) invalidFormat();
      }
      decoded = buf;
    } else {
      // Unquoted field: ends at '|', a record terminator, or end of input.
      let buf = '';
      while (i < n) {
        const ch = text[i];
        if (ch === '"') invalidFormat(); // quotes in unquoted fields
        if (ch === PIPE || ch === CR || ch === LF) break;
        buf += ch;
        i += 1;
      }
      decoded = buf;
    }

    fields.push(decoded);

    // ---- consume the separator / terminator that ended the field ----
    if (i >= n) {
      records.push(fields);
      fields = [];
      break;
    }

    const ch = text[i];

    if (ch === PIPE) {
      i += 1;
      // A separator must be followed by another field of the same record.
      if (i >= n) invalidFormat();
      if (text[i] === PIPE || text[i] === CR || text[i] === LF) invalidFormat();
      continue;
    }

    // Record terminator: CRLF counts as one terminator.
    if (ch === CR) {
      i += 1;
      if (i < n && text[i] === LF) i += 1;
    } else {
      i += 1; // LF
    }

    records.push(fields);
    fields = [];

    if (i >= n) break; // a trailing terminator does not add a record
    // A record must have at least one field.
    if (text[i] === PIPE || text[i] === CR || text[i] === LF) invalidFormat();
  }

  return records;
}

/**
 * Split one decoded field text into [key, value].
 * Exactly one '=' is allowed and the key must match [A-Z][A-Z0-9_]*.
 * Only the decoded VALUE gets its outer whitespace trimmed.
 */
function splitField(decoded) {
  const eq = decoded.indexOf('=');
  if (eq === -1) invalidFormat();
  if (decoded.indexOf('=', eq + 1) !== -1) invalidFormat();

  const key = decoded.slice(0, eq);
  if (!KEY_RE.test(key)) invalidFormat();

  const value = decoded.slice(eq + 1).trim();
  return [key, value];
}

/** Returns a Number for a canonical unsigned decimal integer, else null. */
function parseCanonicalUint(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  return Number(value);
}

function defineOwn(target, key, value) {
  // Use defineProperty so keys such as "__proto__" become plain own data
  // properties instead of mutating the object's prototype.
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** Builds one output record from its decoded [key, value] pairs. */
function buildRecord(pairs) {
  // --- syntax: duplicate decoded keys ---
  const seen = new Set();
  for (let k = 0; k < pairs.length; k += 1) {
    const key = pairs[k][0];
    if (seen.has(key)) invalidFormat();
    seen.add(key);
  }

  const byKey = new Map(pairs);

  // --- semantics (invalid values / missing required fields) ---
  if (!byKey.has('WINDOW') || !byKey.has('RATE') || !byKey.has('LIMIT')) {
    invalidValue();
  }

  const window = parseCanonicalUint(byKey.get('WINDOW'));
  if (window === null || window < WINDOW_MIN || window > WINDOW_MAX) {
    invalidValue();
  }

  const rate = parseCanonicalUint(byKey.get('RATE'));
  if (rate === null || rate < RATE_MIN || rate > RATE_MAX) invalidValue();

  const limit = parseCanonicalUint(byKey.get('LIMIT'));
  if (limit === null || limit < LIMIT_MIN || limit > LIMIT_MAX) invalidValue();

  let flags;
  if (byKey.has('FLAGS')) {
    const raw = byKey.get('FLAGS');
    const parts = raw.split(',');
    if (parts.length < 1) invalidValue();
    const used = new Set();
    flags = [];
    for (let p = 0; p < parts.length; p += 1) {
      const part = parts[p];
      if (!FLAG_VALUES.has(part)) invalidValue();
      if (used.has(part)) invalidValue();
      used.add(part);
      flags.push(part);
    }
  }

  // --- assemble: known schema order first, then unknown fields in order ---
  const out = {};
  defineOwn(out, 'WINDOW', window);
  defineOwn(out, 'RATE', rate);
  defineOwn(out, 'LIMIT', limit);
  if (flags !== undefined) defineOwn(out, 'FLAGS', flags);

  for (let k = 0; k < pairs.length; k += 1) {
    const key = pairs[k][0];
    if (!KNOWN_SET.has(key)) defineOwn(out, key, pairs[k][1]);
  }

  return out;
}

function parseRecords(text) {
  const records = tokenize(text);
  const out = [];
  for (let r = 0; r < records.length; r += 1) {
    const record = records[r];
    const pairs = [];
    for (let f = 0; f < record.length; f += 1) {
      pairs.push(splitField(record[f]));
    }
    out.push(buildRecord(pairs));
  }
  return out;
}

module.exports = { parseRecords };
