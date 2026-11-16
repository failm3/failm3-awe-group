'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT = /^[+-]?[0-9]+$/;

// Known fields in schema order. Only DURATION is optional.
const SCHEMA = [
  { key: 'WINDOW', required: true, pattern: CANONICAL_UINT, min: 2, max: 30 },
  { key: 'RATE', required: true, pattern: CANONICAL_UINT, min: 0, max: 20 },
  { key: 'LIMIT', required: true, pattern: CANONICAL_UINT, min: 1, max: 50 },
  { key: 'DURATION', required: false, pattern: DECIMAL_INT, min: 1, max: 60 },
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Split one field's decoded text into a validated [key, value] pair.
// Unquoted fields must contain exactly one '='; quoted fields split at the first '='.
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

// Read one record starting at index i. Returns { fields, next }, where next is
// the index just past the record terminator (or text.length).
function readRecord(text, i) {
  const fields = [];
  const n = text.length;
  for (;;) {
    let raw = '';
    let quoted = false;
    if (text[i] === '"') {
      quoted = true;
      i++;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            raw += '"';
            i += 2;
          } else {
            closed = true;
            i++;
            break;
          }
        } else {
          raw += c;
          i++;
        }
      }
      if (!closed) throw formatError();
      if (i < n && text[i] !== '|' && text[i] !== '\n' && text[i] !== '\r') {
        throw formatError();
      }
    } else {
      while (i < n) {
        const c = text[i];
        if (c === '|' || c === '\n' || c === '\r') break;
        if (c === '"') throw formatError();
        raw += c;
        i++;
      }
    }
    fields.push(splitField(raw, quoted));

    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === '|') {
      i++;
      continue;
    }
    // Record terminator: CRLF, LF, or CR.
    if (c === '\r' && text[i + 1] === '\n') return { fields, next: i + 2 };
    return { fields, next: i + 1 };
  }
}

function buildRecord(fields) {
  // Syntax and duplicate validation happen before any semantic checks.
  const seen = new Map();
  for (const [key, value] of fields) {
    if (seen.has(key)) throw formatError();
    seen.set(key, value);
  }

  const out = {};
  for (const spec of SCHEMA) {
    if (!seen.has(spec.key)) {
      if (spec.required) throw valueError();
      continue;
    }
    const value = seen.get(spec.key);
    if (!spec.pattern.test(value)) throw valueError();
    const num = Number(value);
    if (!Number.isSafeInteger(num) || num < spec.min || num > spec.max) throw valueError();
    out[spec.key] = num;
  }
  // Unknown keys are dropped.
  return out;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  let i = 0;
  while (i < text.length) {
    const { fields, next } = readRecord(text, i);
    records.push(buildRecord(fields));
    i = next;
  }
  return records;
}

module.exports = { parseRecords };
