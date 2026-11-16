'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS'];
const FLAG_VALUES = ['fast', 'safe'];

function badFormat() {
  return new Error('INVALID_FORMAT');
}

function badValue() {
  return new Error('INVALID_VALUE');
}

function isEnd(c) {
  return c === '\n' || c === '\r';
}

function readRecord(text, start) {
  const n = text.length;
  let i = start;
  const fields = [];
  for (;;) {
    let value = '';
    let quoted = false;
    if (text[i] === '"') {
      quoted = true;
      i++;
      for (;;) {
        if (i >= n) throw badFormat();
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += c;
          i++;
        }
      }
      if (i < n && text[i] !== '|' && !isEnd(text[i])) throw badFormat();
    } else {
      while (i < n && text[i] !== '|' && !isEnd(text[i])) {
        if (text[i] === '"') throw badFormat();
        value += text[i];
        i++;
      }
    }
    fields.push({ value, quoted });
    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === '|') {
      i++;
      continue;
    }
    if (c === '\r' && text[i + 1] === '\n') i += 2;
    else i++;
    return { fields, next: i };
  }
}

function toPairs(fields) {
  const seen = new Set();
  const pairs = [];
  for (const f of fields) {
    const idx = f.value.indexOf('=');
    if (idx < 0) throw badFormat();
    if (!f.quoted && f.value.indexOf('=', idx + 1) !== -1) throw badFormat();
    const key = f.value.slice(0, idx);
    if (!KEY_RE.test(key)) throw badFormat();
    if (seen.has(key)) throw badFormat();
    seen.add(key);
    pairs.push([key, f.value.slice(idx + 1).trim()]);
  }
  return pairs;
}

function toInt(v, min, max) {
  if (!INT_RE.test(v)) throw badValue();
  const num = Number(v);
  if (!(num >= min && num <= max)) throw badValue();
  return num;
}

function toFlags(v) {
  if (v === '') throw badValue();
  const seen = new Set();
  const out = [];
  for (const part of v.split(',')) {
    if (!FLAG_VALUES.includes(part) || seen.has(part)) throw badValue();
    seen.add(part);
    out.push(part);
  }
  return out;
}

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function buildRecord(pairs) {
  const map = new Map(pairs);
  for (const req of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!map.has(req)) throw badValue();
  }
  const converted = {
    WINDOW: toInt(map.get('WINDOW'), 1, 20),
    RATE: toInt(map.get('RATE'), 0, 40),
    LIMIT: toInt(map.get('LIMIT'), 1, 100)
  };
  if (map.has('FLAGS')) converted.FLAGS = toFlags(map.get('FLAGS'));
  const result = {};
  for (const key of KNOWN_ORDER) {
    if (Object.prototype.hasOwnProperty.call(converted, key)) setOwn(result, key, converted[key]);
  }
  for (const [key, value] of pairs) {
    if (!KNOWN_ORDER.includes(key)) setOwn(result, key, value);
  }
  return result;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw badFormat();
  const out = [];
  let i = 0;
  while (i < text.length) {
    const rec = readRecord(text, i);
    i = rec.next;
    out.push(buildRecord(toPairs(rec.fields)));
  }
  return out;
}

module.exports = { decodeSeparated };
