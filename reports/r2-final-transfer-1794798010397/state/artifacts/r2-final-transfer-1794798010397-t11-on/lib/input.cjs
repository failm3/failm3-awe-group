'use strict';

// Separated key/value record parser.
//
// Grammar (see FORMAT.md):
//   text      := record (TERM record)* TERM?
//   record    := field ('|' field)+
//   field     := unquoted | quoted
//   unquoted  := KEY '=' VALUE           (no '"' allowed anywhere)
//   quoted    := '"' ('""' -> '"' | any char incl. '|', '=', CR, LF)* '"'
//
// After decoding, a field must be exactly KEY=VALUE (one '='), with
// KEY matching /^[A-Z][A-Z0-9_]*$/. Only VALUE gets whitespace-trimmed.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

const FLAG_VALUES = ['dry', 'live'];

// Known-field schema order (used as output key insertion order).
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];

const WINDOW_MIN = 3;
const WINDOW_MAX = 30;
const RATE_MIN = 0;
const RATE_MAX = 40;
const LIMIT_MIN = 1;
const LIMIT_MAX = 150;

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

// Convert one raw field into a list of decoded KEY=VALUE field records.
// Throws INVALID_FORMAT for any syntactic problem.
function tokenizeRecords(text) {
  const records = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const fields = [];
    let recordDone = false;

    while (!recordDone) {
      let decoded = '';

      if (text[i] === '"') {
        // Whole-field quoted form.
        i += 1;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
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
        if (!closed) invalidFormat();
        fields.push(decoded);
        // Nothing may follow a closing quote except a separator or the
        // end of the record.
        if (i < n) {
          const c = text[i];
          if (c !== '|' && c !== '\n' && c !== '\r') invalidFormat();
        }
      } else {
        // Unquoted form: runs until a separator or record terminator.
        while (i < n) {
          const c = text[i];
          if (c === '|' || c === '\n' || c === '\r') break;
          if (c === '"') invalidFormat(); // quotes are not allowed unquoted
          decoded += c;
          i += 1;
        }
        fields.push(decoded);
      }

      if (i >= n) {
        recordDone = true;
      } else if (text[i] === '|') {
        i += 1;
      } else {
        // Record terminator: LF, CRLF or CR.
        if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
        else i += 1;
        recordDone = true;
      }
    }

    records.push(fields);
  }

  return records;
}

// Split a decoded field into { key, value } with the value trimmed.
// Throws INVALID_FORMAT on bad structure or a malformed key.
function decodeField(decoded) {
  const eq = decoded.indexOf('=');
  if (eq < 0) invalidFormat();
  if (decoded.indexOf('=', eq + 1) !== -1) invalidFormat();

  const key = decoded.slice(0, eq);
  if (!KEY_RE.test(key)) invalidFormat();

  return { key, value: decoded.slice(eq + 1).trim() };
}

function parseUint(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) invalidValue();
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) invalidValue();
  return number;
}

function parseFlags(value) {
  const parts = value.split(',');
  const seen = Object.create(null);
  const flags = [];
  for (const part of parts) {
    if (!FLAG_VALUES.includes(part)) invalidValue();
    if (seen[part]) invalidValue();
    seen[part] = true;
    flags.push(part);
  }
  if (flags.length < 1) invalidValue();
  return flags;
}

function buildRecord(fields) {
  // Phase 1: syntax (structure, keys) and duplicates, in field order.
  const values = new Map();
  const order = [];
  for (const decoded of fields) {
    const { key, value } = decodeField(decoded);
    if (values.has(key)) invalidFormat();
    values.set(key, value);
    order.push(key);
  }

  // Phase 2: semantic validation.
  if (!values.has('WINDOW')) invalidValue();
  if (!values.has('RATE')) invalidValue();
  if (!values.has('LIMIT')) invalidValue();

  const out = {};
  for (const name of KNOWN_FIELDS) {
    if (!values.has(name)) continue;
    const raw = values.get(name);
    if (name === 'WINDOW') {
      out.WINDOW = parseUint(raw, WINDOW_MIN, WINDOW_MAX);
    } else if (name === 'RATE') {
      out.RATE = parseUint(raw, RATE_MIN, RATE_MAX);
    } else if (name === 'LIMIT') {
      out.LIMIT = parseUint(raw, LIMIT_MIN, LIMIT_MAX);
    } else if (name === 'FLAGS') {
      out.FLAGS = parseFlags(raw);
    } else {
      // COLOR stays a string.
      out.COLOR = raw;
    }
  }

  return out;
}

function readInput(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];

  const records = tokenizeRecords(text);
  const result = [];
  for (const fields of records) {
    result.push(buildRecord(fields));
  }
  return result;
}

module.exports = { readInput };
