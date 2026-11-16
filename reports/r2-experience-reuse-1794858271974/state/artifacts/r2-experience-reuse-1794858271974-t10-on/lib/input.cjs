'use strict';

const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;

const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const INT_RANGES = {
  WINDOW: [2, 20],
  RATE: [0, 30],
  LIMIT: [1, 125],
};
const COLOR_VALUES = ['red', 'blue'];

function isTerminator(c) {
  return c === '\n' || c === '\r';
}

// Read one record starting at index start. Returns { fields, next } where each
// field is { raw, quoted } with quotes already decoded. Throws INVALID_FORMAT
// on lexical problems (unterminated quote, quote inside an unquoted field,
// characters after a closing quote).
function readRecord(text, start) {
  const n = text.length;
  const fields = [];
  let i = start;

  for (;;) {
    if (text[i] === '"') {
      i++;
      let raw = '';
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
      if (!closed) throw new Error('INVALID_FORMAT');
      fields.push({ raw, quoted: true });
    } else {
      let raw = '';
      while (i < n) {
        const c = text[i];
        if (c === ';' || isTerminator(c)) break;
        if (c === '"') throw new Error('INVALID_FORMAT');
        raw += c;
        i++;
      }
      fields.push({ raw, quoted: false });
    }

    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === ';') {
      i++;
      continue;
    }
    if (isTerminator(c)) {
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      return { fields, next: i };
    }
    // Any other character after a closing quote is illegal.
    throw new Error('INVALID_FORMAT');
  }
}

function decodeField(field) {
  const raw = field.raw;
  const eq = raw.indexOf('=');
  if (eq < 0) throw new Error('INVALID_FORMAT');
  if (!field.quoted && raw.indexOf('=', eq + 1) !== -1) throw new Error('INVALID_FORMAT');
  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw new Error('INVALID_FORMAT');
  const value = raw.slice(eq + 1).trim();
  return [key, value];
}

function parseRecord(fields) {
  // Phase 1: syntax + duplicate validation for the whole record.
  const decoded = new Map();
  for (const field of fields) {
    const [key, value] = decodeField(field);
    if (decoded.has(key)) throw new Error('INVALID_FORMAT');
    decoded.set(key, value);
  }

  // Phase 2: semantic validation (unknown keys are dropped).
  for (const key of REQUIRED) {
    if (!decoded.has(key)) throw new Error('INVALID_VALUE');
  }

  const out = {};
  for (const key of SCHEMA) {
    if (!decoded.has(key)) continue;
    const value = decoded.get(key);
    if (key === 'COLOR') {
      if (COLOR_VALUES.indexOf(value) === -1) throw new Error('INVALID_VALUE');
      out[key] = value;
    } else {
      const range = INT_RANGES[key];
      if (!CANONICAL_UINT.test(value)) throw new Error('INVALID_VALUE');
      const num = Number(value);
      if (!Number.isSafeInteger(num) || num < range[0] || num > range[1]) {
        throw new Error('INVALID_VALUE');
      }
      out[key] = num;
    }
  }
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') throw new Error('INVALID_FORMAT');
  if (text === '') return [];
  const result = [];
  let i = 0;
  while (i < text.length) {
    const rec = readRecord(text, i);
    result.push(parseRecord(rec.fields));
    i = rec.next;
  }
  return result;
}

module.exports = { readInput };
