'use strict';

const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const Q = String.fromCharCode(34);
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANON_RE = /^(0|[1-9][0-9]*)$/;
const DEC_RE = /^[0-9]+$/;

function fail(message) {
  throw new Error(message);
}

// Parse one field starting at position i. Returns { key, value, next }.
function parseField(text, i, seen) {
  const n = text.length;
  let raw;
  let quoted = false;
  if (i < n && text[i] === Q) {
    quoted = true;
    i += 1;
    let buf = '';
    let closed = false;
    while (i < n) {
      const c = text[i];
      if (c === Q) {
        if (text[i + 1] === Q) {
          buf += Q;
          i += 2;
        } else {
          i += 1;
          closed = true;
          break;
        }
      } else {
        buf += c;
        i += 1;
      }
    }
    if (!closed) fail('INVALID_FORMAT');
    if (i < n && text[i] !== '|' && text[i] !== LF && text[i] !== CR) fail('INVALID_FORMAT');
    raw = buf;
  } else {
    const start = i;
    while (i < n && text[i] !== '|' && text[i] !== LF && text[i] !== CR) i += 1;
    raw = text.slice(start, i);
    if (raw.indexOf(Q) !== -1) fail('INVALID_FORMAT');
  }
  const eq = raw.indexOf('=');
  if (eq < 0) fail('INVALID_FORMAT');
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) fail('INVALID_FORMAT');
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
  if (value !== value.trim()) fail('INVALID_FORMAT');
  if (seen.has(key)) fail('INVALID_FORMAT');
  seen.add(key);
  return { key, value, next: i };
}

function canonicalInt(v, min, max) {
  if (!CANON_RE.test(v)) return null;
  const num = Number(v);
  return num >= min && num <= max ? num : null;
}

function decimalInt(v, min, max) {
  if (!DEC_RE.test(v)) return null;
  const num = Number(v);
  return num >= min && num <= max ? num : null;
}

const SCHEMA = [
  { key: 'WINDOW', required: true, parse: (v) => canonicalInt(v, 3, 40) },
  { key: 'RATE', required: true, parse: (v) => canonicalInt(v, 0, 20) },
  { key: 'LIMIT', required: true, parse: (v) => canonicalInt(v, 1, 150) },
  { key: 'DURATION', required: false, parse: (v) => decimalInt(v, 1, 90) },
];

function buildRecord(fields) {
  const map = new Map(fields);
  const out = {};
  for (const spec of SCHEMA) {
    if (!map.has(spec.key)) {
      if (spec.required) fail('INVALID_VALUE');
      continue;
    }
    const num = spec.parse(map.get(spec.key));
    if (num === null) fail('INVALID_VALUE');
    out[spec.key] = num;
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') fail('INVALID_FORMAT');
  const results = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const fields = [];
    const seen = new Set();
    for (;;) {
      const f = parseField(text, i, seen);
      fields.push([f.key, f.value]);
      i = f.next;
      if (i >= n) break;
      const c = text[i];
      if (c === '|') {
        i += 1;
        continue;
      }
      if (c === CR && text[i + 1] === LF) i += 2;
      else i += 1;
      break;
    }
    results.push(buildRecord(fields));
  }
  return results;
}

module.exports = { parseBundle };
