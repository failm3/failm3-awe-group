'use strict';

// Separated key/value records parser. See FORMAT.md.

const KNOWN_KEYS = ['WINDOW', 'RATE', 'LIMIT', 'DURATION'];
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[0-9]+$/;

function fail(message) {
  throw new Error(message);
}

// Scan one record starting at `start`. Returns { fields, next }.
// A field is { quoted: false, raw } or { quoted: true, value }.
function scanRecord(text, start) {
  const n = text.length;
  const fields = [];
  let i = start;
  for (;;) {
    let field;
    if (text[i] === '"') {
      let j = i + 1;
      let out = '';
      for (;;) {
        if (j >= n) fail('INVALID_FORMAT');
        const ch = text[j];
        if (ch === '"') {
          if (text[j + 1] === '"') {
            out += '"';
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        out += ch;
        j += 1;
      }
      field = { quoted: true, value: out };
      i = j;
      if (i < n && text[i] !== '|' && text[i] !== '\r' && text[i] !== '\n') fail('INVALID_FORMAT');
    } else {
      const s = i;
      while (i < n) {
        const ch = text[i];
        if (ch === '|' || ch === '\r' || ch === '\n') break;
        if (ch === '"') fail('INVALID_FORMAT');
        i += 1;
      }
      field = { quoted: false, raw: text.slice(s, i) };
    }
    fields.push(field);
    if (i >= n) return { fields, next: n };
    if (text[i] === '|') {
      i += 1;
      continue;
    }
    if (text[i] === '\r') {
      i += 1;
      if (i < n && text[i] === '\n') i += 1;
    } else {
      i += 1;
    }
    return { fields, next: i };
  }
}

function decodeField(field) {
  let key;
  let value;
  if (field.quoted) {
    const eq = field.value.indexOf('=');
    if (eq === -1) fail('INVALID_FORMAT');
    key = field.value.slice(0, eq);
    value = field.value.slice(eq + 1);
  } else {
    const raw = field.raw;
    const eq = raw.indexOf('=');
    if (eq === -1 || raw.indexOf('=', eq + 1) !== -1) fail('INVALID_FORMAT');
    key = raw.slice(0, eq);
    value = raw.slice(eq + 1);
  }
  if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
  if (value !== value.trim()) fail('INVALID_FORMAT');
  return { key, value };
}

function canonicalInt(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) fail('INVALID_VALUE');
  const num = Number(value);
  if (num < min || num > max) fail('INVALID_VALUE');
  return num;
}

function decimalInt(value, min, max) {
  if (!DECIMAL_INT_RE.test(value)) fail('INVALID_VALUE');
  const num = Number(value);
  if (num < min || num > max) fail('INVALID_VALUE');
  return num;
}

function buildRecord(entries) {
  const map = new Map();
  for (const { key, value } of entries) {
    if (map.has(key)) fail('INVALID_FORMAT');
    map.set(key, value);
  }
  if (!map.has('WINDOW') || !map.has('RATE') || !map.has('LIMIT')) fail('INVALID_VALUE');
  const windowValue = canonicalInt(map.get('WINDOW'), 3, 60);
  const rateValue = canonicalInt(map.get('RATE'), 0, 20);
  const limitValue = canonicalInt(map.get('LIMIT'), 1, 150);
  const durationValue = map.has('DURATION') ? decimalInt(map.get('DURATION'), 1, 150) : undefined;

  const out = {};
  const set = (key, value) => {
    Object.defineProperty(out, key, { value, writable: true, enumerable: true, configurable: true });
  };
  set('WINDOW', windowValue);
  set('RATE', rateValue);
  set('LIMIT', limitValue);
  if (durationValue !== undefined) set('DURATION', durationValue);
  for (const [key, value] of map) {
    if (KNOWN_KEYS.indexOf(key) !== -1) continue;
    set(key, value);
  }
  return out;
}

function readInput(text) {
  if (text === '') return [];
  const n = text.length;
  const result = [];
  let i = 0;
  while (i < n) {
    const { fields, next } = scanRecord(text, i);
    result.push(buildRecord(fields.map(decodeField)));
    i = next;
  }
  return result;
}

module.exports = { readInput };
