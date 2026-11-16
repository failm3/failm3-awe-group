'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const KNOWN = new Set(['WINDOW', 'RATE', 'LIMIT', 'COLOR']);

function fail(message) {
  throw new Error(message);
}

function intIn(value, lo, hi) {
  if (!INT_RE.test(value)) fail('INVALID_VALUE');
  const n = Number(value);
  if (n < lo || n > hi) fail('INVALID_VALUE');
  return n;
}

function isBoundary(c) {
  return c === ';' || c === '\n' || c === '\r';
}

function decodeSeparated(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const pairs = [];
    const seen = new Set();
    for (;;) {
      let field;
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        let buf = '';
        i++;
        for (;;) {
          if (i >= n) fail('INVALID_FORMAT');
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              buf += '"';
              i += 2;
              continue;
            }
            i++;
            break;
          }
          buf += c;
          i++;
        }
        if (i < n && !isBoundary(text[i])) fail('INVALID_FORMAT');
        field = buf;
      } else {
        const start = i;
        while (i < n && !isBoundary(text[i])) {
          if (text[i] === '"') fail('INVALID_FORMAT');
          i++;
        }
        field = text.slice(start, i);
      }
      const eq = field.indexOf('=');
      if (eq < 0) fail('INVALID_FORMAT');
      if (!quoted && field.indexOf('=', eq + 1) >= 0) fail('INVALID_FORMAT');
      const key = field.slice(0, eq);
      if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
      if (seen.has(key)) fail('INVALID_FORMAT');
      seen.add(key);
      pairs.push([key, field.slice(eq + 1).trim()]);
      if (i < n && text[i] === ';') {
        i++;
        continue;
      }
      break;
    }
    if (i < n) {
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
    }

    const m = new Map(pairs);
    for (const k of ['WINDOW', 'RATE', 'LIMIT']) {
      if (!m.has(k)) fail('INVALID_VALUE');
    }
    const rec = {};
    rec.WINDOW = intIn(m.get('WINDOW'), 3, 60);
    rec.RATE = intIn(m.get('RATE'), 0, 30);
    rec.LIMIT = intIn(m.get('LIMIT'), 1, 75);
    if (m.has('COLOR')) {
      const color = m.get('COLOR');
      if (color !== 'teal' && color !== 'gold') fail('INVALID_VALUE');
      rec.COLOR = color;
    }
    for (const [k, v] of pairs) {
      if (!KNOWN.has(k)) {
        Object.defineProperty(rec, k, { value: v, enumerable: true, writable: true, configurable: true });
      }
    }
    out.push(rec);
  }
  return out;
}

module.exports = { decodeSeparated };
