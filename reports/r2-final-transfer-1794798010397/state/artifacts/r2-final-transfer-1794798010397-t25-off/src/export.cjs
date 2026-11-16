'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_INT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Parses one record starting at index `start`. Returns { fields, next } where
// fields is an array of { raw, quoted } and next is the index after the record
// terminator (or text.length).
function scanRecord(text, start) {
  const n = text.length;
  const fields = [];
  let i = start;
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
            continue;
          }
          i++;
          closed = true;
          break;
        }
        raw += c;
        i++;
      }
      if (!closed) throw invalidFormat();
    } else {
      const begin = i;
      while (i < n) {
        const c = text[i];
        if (c === '|' || c === '\r' || c === '\n') break;
        if (c === '"') throw invalidFormat();
        i++;
      }
      raw = text.slice(begin, i);
    }
    fields.push({ raw, quoted });

    // After a field: separator, record ending, or end of input only.
    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === '|') {
      i++;
      continue;
    }
    if (c === '\n') return { fields, next: i + 1 };
    if (c === '\r') {
      i++;
      if (text[i] === '\n') i++;
      return { fields, next: i };
    }
    throw invalidFormat();
  }
}

function parseField(field, seen) {
  const raw = field.raw;
  const eq = raw.indexOf('=');
  if (eq < 0) throw invalidFormat();
  if (!field.quoted && raw.indexOf('=', eq + 1) >= 0) throw invalidFormat();
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) throw invalidFormat();
  if (value !== value.trim()) throw invalidFormat();
  if (seen.has(key)) throw invalidFormat();
  seen.set(key, value);
}

function canonicalInt(value, min, max) {
  if (typeof value !== 'string' || !CANONICAL_INT_RE.test(value)) throw invalidValue();
  const num = Number(value);
  if (!(num >= min && num <= max)) throw invalidValue();
  return num;
}

function buildRecord(seen) {
  const record = {};
  record.WINDOW = canonicalInt(seen.get('WINDOW'), 2, 20);
  record.RATE = canonicalInt(seen.get('RATE'), 0, 20);
  record.LIMIT = canonicalInt(seen.get('LIMIT'), 1, 50);
  if (seen.has('DURATION')) {
    const d = seen.get('DURATION');
    if (!DECIMAL_INT_RE.test(d)) throw invalidValue();
    const num = Number(d);
    if (!(num >= 1 && num <= 30)) throw invalidValue();
    record.DURATION = num;
  }
  return record;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  const result = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const { fields, next } = scanRecord(text, i);
    const seen = new Map();
    for (const field of fields) parseField(field, seen);
    result.push(buildRecord(seen));
    i = next;
  }
  return result;
}

module.exports = { parseExport };
