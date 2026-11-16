'use strict';

const Q = String.fromCharCode(34);
const SEP = ';';
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const SCHEMA = [['WINDOW', 1, 30], ['RATE', 0, 10], ['LIMIT', 1, 25]];

function fail(message) {
  return new Error(message);
}

function isEnd(c) {
  return c === '\n' || c === '\r';
}

// Reads one record starting at index `start`. Throws INVALID_FORMAT for any
// syntax, key, whitespace or duplicate-key problem. Returns the decoded fields
// in original order and the index where the next record begins.
function readRecord(text, start) {
  const n = text.length;
  const fields = [];
  const seen = new Set();
  let i = start;
  for (;;) {
    let raw = '';
    let quoted = false;
    if (text[i] === Q) {
      quoted = true;
      i++;
      for (;;) {
        if (i >= n) throw fail('INVALID_FORMAT');
        const c = text[i];
        if (c === Q) {
          if (text[i + 1] === Q) {
            raw += Q;
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
      if (i < n && text[i] !== SEP && !isEnd(text[i])) throw fail('INVALID_FORMAT');
    } else {
      const s = i;
      while (i < n && text[i] !== SEP && !isEnd(text[i])) {
        if (text[i] === Q) throw fail('INVALID_FORMAT');
        i++;
      }
      raw = text.slice(s, i);
    }

    const eq = raw.indexOf('=');
    if (eq < 0) throw fail('INVALID_FORMAT');
    if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw fail('INVALID_FORMAT');
    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    if (!KEY_RE.test(key)) throw fail('INVALID_FORMAT');
    if (value !== value.trim()) throw fail('INVALID_FORMAT');
    if (seen.has(key)) throw fail('INVALID_FORMAT');
    seen.add(key);
    fields.push([key, value]);

    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === SEP) {
      i++;
      continue;
    }
    i++;
    if (c === '\r' && text[i] === '\n') i++;
    return { fields, next: i };
  }
}

function buildRecord(fields) {
  const map = new Map(fields);
  const out = {};
  const set = (k, v) => Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  for (const [name, min, max] of SCHEMA) {
    const v = map.get(name);
    if (v === undefined || !INT_RE.test(v)) throw fail('INVALID_VALUE');
    const num = Number(v);
    if (!(num >= min && num <= max)) throw fail('INVALID_VALUE');
    set(name, num);
  }
  const known = new Set(SCHEMA.map((s) => s[0]));
  for (const [k, v] of fields) {
    if (!known.has(k)) set(k, v);
  }
  return out;
}

function parseBundle(text) {
  const n = text.length;
  const result = [];
  let i = 0;
  while (i < n) {
    const { fields, next } = readRecord(text, i);
    result.push(buildRecord(fields));
    i = next;
  }
  return result;
}

module.exports = { parseBundle };
