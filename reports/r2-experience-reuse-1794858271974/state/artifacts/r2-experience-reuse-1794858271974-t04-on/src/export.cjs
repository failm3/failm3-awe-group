'use strict';

// Separated key/value record parser. See FORMAT.md for the full grammar.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Only the required fields are schema-defined; everything else is an unknown key.
const KNOWN_KEYS = ['WINDOW', 'RATE', 'LIMIT'];

function isTerminator(c) {
  return c === ';' || c === '\n' || c === '\r';
}

// Reads one record starting at index `start`. Returns the decoded fields and
// the index where the next record begins.
function readRecord(text, start) {
  const n = text.length;
  const fields = [];
  let i = start;

  for (;;) {
    let value;
    let quoted = false;

    if (text[i] === '"') {
      quoted = true;
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < n) {
        const c = text[j];
        if (c === '"') {
          if (text[j + 1] === '"') {
            buf += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        buf += c;
        j += 1;
      }
      if (!closed) throw new Error('INVALID_FORMAT');
      i = j;
      if (i < n && !isTerminator(text[i])) throw new Error('INVALID_FORMAT');
      value = buf;
    } else {
      let j = i;
      while (j < n && !isTerminator(text[j])) {
        if (text[j] === '"') throw new Error('INVALID_FORMAT');
        j += 1;
      }
      value = text.slice(i, j);
      i = j;
    }

    fields.push({ text: value, quoted });

    if (i >= n) return { fields, next: n };
    const c = text[i];
    i += 1;
    if (c === ';') continue;
    if (c === '\r' && i < n && text[i] === '\n') i += 1;
    return { fields, next: i };
  }
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function requireInt(map, key, min, max) {
  if (!map.has(key)) throw new Error('INVALID_VALUE');
  const raw = map.get(key);
  if (!CANONICAL_UINT_RE.test(raw)) throw new Error('INVALID_VALUE');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error('INVALID_VALUE');
  return n;
}

function buildRecord(fields) {
  const map = new Map();
  const order = [];

  // Pass 1: syntax / duplicate / whitespace problems take precedence.
  for (const f of fields) {
    const eq = f.text.indexOf('=');
    if (eq === -1) throw new Error('INVALID_FORMAT');
    if (!f.quoted && f.text.indexOf('=', eq + 1) !== -1) throw new Error('INVALID_FORMAT');
    const key = f.text.slice(0, eq);
    const value = f.text.slice(eq + 1);
    if (!KEY_RE.test(key)) throw new Error('INVALID_FORMAT');
    if (value !== value.trim()) throw new Error('INVALID_FORMAT');
    if (map.has(key)) throw new Error('INVALID_FORMAT');
    map.set(key, value);
    order.push(key);
  }

  // Pass 2: semantics.
  const windowVal = requireInt(map, 'WINDOW', 2, 60);
  const rate = requireInt(map, 'RATE', 0, 10);
  const limit = requireInt(map, 'LIMIT', 1, 125);

  const out = {};
  defineOwn(out, 'WINDOW', windowVal);
  defineOwn(out, 'RATE', rate);
  defineOwn(out, 'LIMIT', limit);

  // Unknown keys: retained as strings in original field order, after known fields.
  for (const key of order) {
    if (KNOWN_KEYS.indexOf(key) !== -1) continue;
    defineOwn(out, key, map.get(key));
  }

  return out;
}

function parseExport(text) {
  if (typeof text !== 'string') throw new Error('INVALID_FORMAT');
  if (text === '') return [];

  const result = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next } = readRecord(text, pos);
    result.push(buildRecord(fields));
    pos = next;
  }
  return result;
}

module.exports = { parseExport };
