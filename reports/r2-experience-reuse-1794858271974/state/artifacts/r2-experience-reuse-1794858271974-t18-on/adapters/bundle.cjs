'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Scan one record starting at `start`. Returns the raw decoded fields and the
// index where the next record begins. Throws INVALID_FORMAT on syntax errors.
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
      for (;;) {
        if (i >= n) throw formatError();
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            raw += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          raw += c;
          i++;
        }
      }
      if (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') throw formatError();
    } else {
      while (i < n) {
        const c = text[i];
        if (c === ';' || c === '\n' || c === '\r') break;
        if (c === '"') throw formatError();
        raw += c;
        i++;
      }
    }
    fields.push({ raw, quoted });
    if (i < n && text[i] === ';') {
      i++;
      continue;
    }
    if (i < n) {
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
    }
    break;
  }
  return { fields, next: i };
}

function buildRecord(fields) {
  const seen = new Set();
  const values = new Map();
  for (const f of fields) {
    let idx = f.raw.indexOf('=');
    if (!f.quoted && idx !== -1 && f.raw.indexOf('=', idx + 1) !== -1) idx = -1;
    if (idx < 0) throw formatError();
    const key = f.raw.slice(0, idx);
    if (!KEY_RE.test(key)) throw formatError();
    if (seen.has(key)) throw formatError();
    seen.add(key);
    values.set(key, f.raw.slice(idx + 1).trim());
  }

  const intField = (name, min, max) => {
    const v = values.get(name);
    if (v === undefined || !INT_RE.test(v)) throw valueError();
    const x = Number(v);
    if (!(x >= min && x <= max)) throw valueError();
    return x;
  };

  const rec = {};
  rec.WINDOW = intField('WINDOW', 1, 50);
  rec.RATE = intField('RATE', 0, 30);
  rec.LIMIT = intField('LIMIT', 1, 25);
  if (values.has('COLOR')) {
    const c = values.get('COLOR');
    if (c !== 'white' && c !== 'black') throw valueError();
    rec.COLOR = c;
  }
  return rec;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw formatError();
  const out = [];
  let i = 0;
  while (i < text.length) {
    const { fields, next } = scanRecord(text, i);
    out.push(buildRecord(fields));
    i = next;
  }
  return out;
}

module.exports = { parseBundle };
