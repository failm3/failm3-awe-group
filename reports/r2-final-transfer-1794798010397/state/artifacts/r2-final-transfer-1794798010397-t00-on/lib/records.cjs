'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Required known fields, in duplicate-key insertion (schema) order,
// with their inclusive integer ranges.
const SCHEMA = [
  ['WINDOW', 1, 20],
  ['RATE', 0, 10],
  ['LIMIT', 1, 25],
];

// The documented optional fields: COLOR stays a string, FLAGS becomes an array.
const OPTIONAL = ['COLOR', 'FLAGS'];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Split a decoded field into [key, value] and validate its syntax.
// An unquoted field must contain exactly one '='; a quoted field's value may
// contain further '=' characters, so split at the first one.
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) throw formatError();
  if (value !== value.trim()) throw formatError();
  return [key, value];
}

// Validate one record's fields syntactically first, then semantically.
function buildRecord(fields) {
  const decoded = [];
  const seen = new Set();
  for (const { raw, quoted } of fields) {
    const [key, value] = splitField(raw, quoted);
    if (seen.has(key)) throw formatError();
    seen.add(key);
    decoded.push([key, value]);
  }

  const values = new Map(decoded);
  const record = {};
  for (const [name, min, max] of SCHEMA) {
    if (!values.has(name)) throw valueError();
    const text = values.get(name);
    if (!CANONICAL_UINT_RE.test(text)) throw valueError();
    const n = Number(text);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
    record[name] = n;
  }

  // Optional fields are kept in field order; unknown keys are dropped.
  for (const [key, value] of decoded) {
    if (!OPTIONAL.includes(key)) continue;
    record[key] = key === 'FLAGS' ? splitFlags(value) : value;
  }

  return record;
}

function splitFlags(value) {
  if (value === '') return [];
  return value.split(',');
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const out = [];
  const len = text.length;
  let i = 0;

  // Each iteration parses one record and validates it before moving on, so
  // that record's syntax errors take precedence over its semantic errors.
  while (i < len) {
    const fields = [];
    let recordDone = false;

    while (!recordDone) {
      let raw = '';
      let quoted = false;

      if (i < len && text[i] === '"') {
        quoted = true;
        i++;
        let closed = false;
        while (i < len) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              raw += '"';
              i += 2;
            } else {
              i++;
              closed = true;
              break;
            }
          } else {
            raw += c;
            i++;
          }
        }
        if (!closed) throw formatError();
        // Only a separator, a record ending, or end of input may follow.
        if (i < len && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
          throw formatError();
        }
      } else {
        while (i < len) {
          const c = text[i];
          if (c === ';' || c === '\n' || c === '\r') break;
          if (c === '"') throw formatError();
          raw += c;
          i++;
        }
      }

      fields.push({ raw, quoted });

      if (i >= len) {
        recordDone = true;
      } else if (text[i] === ';') {
        i++;
      } else {
        // Record ending: CRLF, LF, or CR.
        if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
        else i++;
        recordDone = true;
      }
    }

    out.push(buildRecord(fields));
  }

  return out;
}

module.exports = { parseRecords };
