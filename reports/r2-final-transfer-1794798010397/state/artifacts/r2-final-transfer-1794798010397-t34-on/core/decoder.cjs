'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;

function invalidFormat() { return new Error('INVALID_FORMAT'); }
function invalidValue() { return new Error('INVALID_VALUE'); }

function parseField(raw, quoted) {
  const idx = raw.indexOf('=');
  if (idx < 0) throw invalidFormat();
  const key = raw.slice(0, idx);
  const value = raw.slice(idx + 1);
  if (!quoted && value.indexOf('=') >= 0) throw invalidFormat();
  if (!KEY_RE.test(key)) throw invalidFormat();
  return { key, value: value.trim() };
}

function toInt(v, min, max) {
  if (v === undefined || !INT_RE.test(v)) throw invalidValue();
  const n = Number(v);
  if (n < min || n > max) throw invalidValue();
  return n;
}

function buildRecord(fields) {
  const seen = new Map();
  for (const f of fields) {
    if (seen.has(f.key)) throw invalidFormat();
    seen.set(f.key, f.value);
  }
  const obj = {};
  obj.WINDOW = toInt(seen.get('WINDOW'), 2, 60);
  obj.RATE = toInt(seen.get('RATE'), 0, 30);
  obj.LIMIT = toInt(seen.get('LIMIT'), 1, 125);
  if (seen.has('COLOR')) {
    const c = seen.get('COLOR');
    if (c !== 'teal' && c !== 'gold') throw invalidValue();
    obj.COLOR = c;
  }
  return obj;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw invalidFormat();
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const fields = [];
    let recordEnd = false;
    while (!recordEnd) {
      let raw = '';
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        i++;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { raw += '"'; i += 2; }
            else { i++; closed = true; break; }
          } else { raw += c; i++; }
        }
        if (!closed) throw invalidFormat();
        if (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') throw invalidFormat();
      } else {
        while (i < n) {
          const c = text[i];
          if (c === ';' || c === '\n' || c === '\r') break;
          if (c === '"') throw invalidFormat();
          raw += c;
          i++;
        }
      }
      fields.push(parseField(raw, quoted));
      if (i >= n) {
        recordEnd = true;
      } else if (text[i] === ';') {
        i++;
      } else {
        if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
        else i++;
        recordEnd = true;
      }
    }
    out.push(buildRecord(fields));
  }
  return out;
}

module.exports = { decodeSeparated };
