'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(?:0|[1-9][0-9]*)$/;
const REQUIRED = [['WINDOW', 1, 30], ['RATE', 0, 10], ['LIMIT', 1, 25]];

function fail(message) {
  throw new Error(message);
}

function define(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function processRecord(fields) {
  const seen = new Map();
  for (const f of fields) {
    const t = f.text;
    const eq = t.indexOf('=');
    if (eq < 0) fail('INVALID_FORMAT');
    if (!f.quoted && t.indexOf('=', eq + 1) !== -1) fail('INVALID_FORMAT');
    const key = t.slice(0, eq);
    const value = t.slice(eq + 1);
    if (!KEY_RE.test(key) || seen.has(key) || value !== value.trim()) fail('INVALID_FORMAT');
    seen.set(key, value);
  }
  const out = {};
  for (const [name, min, max] of REQUIRED) {
    const raw = seen.get(name);
    if (raw === undefined || !INT_RE.test(raw)) fail('INVALID_VALUE');
    const num = Number(raw);
    if (num < min || num > max) fail('INVALID_VALUE');
    define(out, name, num);
  }
  for (const [key, value] of seen) {
    if (!REQUIRED.some((r) => r[0] === key)) define(out, key, value);
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') fail('INVALID_FORMAT');
  if (text === '') return [];
  const n = text.length;
  const records = [];
  let i = 0;
  while (i < n) {
    const fields = [];
    for (;;) {
      let value;
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        i++;
        let buf = '';
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { buf += '"'; i += 2; } else { i++; closed = true; break; }
          } else { buf += c; i++; }
        }
        if (!closed) fail('INVALID_FORMAT');
        value = buf;
      } else {
        const start = i;
        while (i < n) {
          const c = text[i];
          if (c === ';' || c === '\n' || c === '\r') break;
          if (c === '"') fail('INVALID_FORMAT');
          i++;
        }
        value = text.slice(start, i);
      }
      fields.push({ text: value, quoted });
      if (i >= n) break;
      const d = text[i];
      if (d === ';') { i++; continue; }
      if (d === '\n') { i++; break; }
      if (d === '\r') { i++; if (text[i] === '\n') i++; break; }
      fail('INVALID_FORMAT');
    }
    records.push(processRecord(fields));
  }
  return records;
}

module.exports = { parseBundle };
