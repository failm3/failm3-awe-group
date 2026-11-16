'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANON_RE = /^(0|[1-9][0-9]*)$/;
const DEC_RE = /^[0-9]+$/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

const KNOWN = [
  { key: 'WINDOW', required: true, re: CANON_RE, min: 3, max: 20 },
  { key: 'RATE', required: true, re: CANON_RE, min: 0, max: 20 },
  { key: 'LIMIT', required: true, re: CANON_RE, min: 1, max: 150 },
  { key: 'DURATION', required: false, re: DEC_RE, min: 1, max: 30 },
];
const KNOWN_KEYS = new Set(KNOWN.map((s) => s.key));

// Reads one record starting at `start`. Returns the decoded [key, value] fields
// in order and the index where the next record begins. Throws INVALID_FORMAT
// for any syntax, whitespace or duplicate-key problem.
function readRecord(text, start) {
  const n = text.length;
  const fields = [];
  const seen = new Set();
  let pos = start;
  for (;;) {
    let key;
    let val;
    if (text[pos] === '"') {
      let decoded = '';
      let closed = false;
      pos++;
      while (pos < n) {
        const ch = text[pos];
        if (ch === '"') {
          if (text[pos + 1] === '"') {
            decoded += '"';
            pos += 2;
            continue;
          }
          pos++;
          closed = true;
          break;
        }
        decoded += ch;
        pos++;
      }
      if (!closed) throw invalidFormat();
      const eq = decoded.indexOf('=');
      if (eq < 0) throw invalidFormat();
      key = decoded.slice(0, eq);
      val = decoded.slice(eq + 1);
    } else {
      let end = pos;
      while (end < n && text[end] !== '|' && text[end] !== '\n' && text[end] !== '\r') end++;
      const raw = text.slice(pos, end);
      pos = end;
      if (raw.indexOf('"') >= 0) throw invalidFormat();
      const parts = raw.split('=');
      if (parts.length !== 2) throw invalidFormat();
      key = parts[0];
      val = parts[1];
    }
    if (!KEY_RE.test(key)) throw invalidFormat();
    if (val !== val.trim()) throw invalidFormat();
    if (seen.has(key)) throw invalidFormat();
    seen.add(key);
    fields.push([key, val]);

    if (pos >= n) return { fields, next: n };
    const d = text[pos];
    if (d === '|') {
      pos++;
      continue;
    }
    if (d === '\r') {
      pos++;
      if (text[pos] === '\n') pos++;
      return { fields, next: pos };
    }
    if (d === '\n') return { fields, next: pos + 1 };
    // Anything else directly after a closing quote is invalid.
    throw invalidFormat();
  }
}

function toInt(value, re, min, max) {
  if (!re.test(value)) return null;
  const num = Number(value);
  return num >= min && num <= max ? num : null;
}

function buildRecord(fields) {
  const map = new Map(fields);
  const result = {};
  const set = (k, v) =>
    Object.defineProperty(result, k, { value: v, enumerable: true, writable: true, configurable: true });
  for (const spec of KNOWN) {
    if (!map.has(spec.key)) {
      if (spec.required) throw invalidValue();
      continue;
    }
    const num = toInt(map.get(spec.key), spec.re, spec.min, spec.max);
    if (num === null) throw invalidValue();
    set(spec.key, num);
  }
  for (const [k, v] of fields) {
    if (!KNOWN_KEYS.has(k)) set(k, v);
  }
  return result;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  const out = [];
  let pos = 0;
  while (pos < text.length) {
    const rec = readRecord(text, pos);
    pos = rec.next;
    out.push(buildRecord(rec.fields));
  }
  return out;
}

module.exports = { parseExport };
