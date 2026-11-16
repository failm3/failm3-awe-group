'use strict';

const FORMAT_ERR = 'INVALID_FORMAT';
const VALUE_ERR = 'INVALID_VALUE';
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const FLAG_VALUES = ['alpha', 'beta'];

function fail(message) {
  throw new Error(message);
}

// Parses one record starting at `start`. Returns the decoded [key, trimmedValue] pairs
// and the index where the next record begins. Syntax errors throw INVALID_FORMAT.
function parseRecord(text, start) {
  const n = text.length;
  const fields = [];
  let i = start;
  for (;;) {
    let key;
    let value;
    if (text[i] === '"') {
      i++;
      let decoded = '';
      for (;;) {
        if (i >= n) fail(FORMAT_ERR);
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') { decoded += '"'; i += 2; } else { i++; break; }
        } else {
          decoded += c;
          i++;
        }
      }
      const eq = decoded.indexOf('=');
      if (eq < 0) fail(FORMAT_ERR);
      key = decoded.slice(0, eq);
      value = decoded.slice(eq + 1);
    } else {
      let j = i;
      while (j < n && text[j] !== '|' && text[j] !== '\r' && text[j] !== '\n') j++;
      const raw = text.slice(i, j);
      i = j;
      if (raw.indexOf('"') >= 0) fail(FORMAT_ERR);
      const eq = raw.indexOf('=');
      if (eq < 0 || raw.indexOf('=', eq + 1) >= 0) fail(FORMAT_ERR);
      key = raw.slice(0, eq);
      value = raw.slice(eq + 1);
    }
    if (!KEY_RE.test(key)) fail(FORMAT_ERR);
    fields.push([key, value.trim()]);
    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === '|') { i++; continue; }
    if (c === '\r') { i++; if (text[i] === '\n') i++; return { fields, next: i }; }
    if (c === '\n') return { fields, next: i + 1 };
    fail(FORMAT_ERR); // character after a closing quote
  }
}

function intField(value, lo, hi) {
  if (value === undefined || !INT_RE.test(value)) fail(VALUE_ERR);
  const x = Number(value);
  if (!(x >= lo && x <= hi)) fail(VALUE_ERR);
  return x;
}

function flagsField(value) {
  const parts = value.split(',');
  const seen = new Set();
  for (const p of parts) {
    if (!FLAG_VALUES.includes(p) || seen.has(p)) fail(VALUE_ERR);
    seen.add(p);
  }
  return parts;
}

function buildRecord(map) {
  const record = {};
  record.WINDOW = intField(map.get('WINDOW'), 2, 60);
  record.RATE = intField(map.get('RATE'), 0, 40);
  record.LIMIT = intField(map.get('LIMIT'), 1, 50);
  if (map.has('FLAGS')) record.FLAGS = flagsField(map.get('FLAGS'));
  return record; // unknown keys are dropped
}

function parseBundle(text) {
  if (typeof text !== 'string') fail(FORMAT_ERR);
  const out = [];
  let pos = 0;
  while (pos < text.length) {
    const rec = parseRecord(text, pos);
    pos = rec.next;
    const map = new Map();
    for (const [k, v] of rec.fields) {
      if (map.has(k)) fail(FORMAT_ERR);
      map.set(k, v);
    }
    out.push(buildRecord(map));
  }
  return out;
}

module.exports = { parseBundle };
