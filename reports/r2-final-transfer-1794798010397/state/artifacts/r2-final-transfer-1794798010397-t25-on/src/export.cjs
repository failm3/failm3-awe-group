'use strict';
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const Q = String.fromCharCode(34);
const bad = () => new Error('INVALID_FORMAT');
const invalid = () => new Error('INVALID_VALUE');
const KEY = /^[A-Z][A-Z0-9_]*$/;
const CANON = /^(0|[1-9][0-9]*)$/;
const DEC = /^[0-9]+$/;

function isEnd(c) {
  return c === CR || c === LF;
}

function intIn(v, re, lo, hi) {
  if (v === undefined || !re.test(v)) throw invalid();
  const n = Number(v);
  if (!(n >= lo && n <= hi)) throw invalid();
  return n;
}

function finish(fields) {
  const map = new Map();
  for (const f of fields) {
    const s = f.text;
    const idx = s.indexOf('=');
    if (idx < 0) throw bad();
    const key = s.slice(0, idx);
    const value = s.slice(idx + 1);
    if (!f.quoted && value.indexOf('=') >= 0) throw bad();
    if (!KEY.test(key)) throw bad();
    if (value !== value.trim()) throw bad();
    if (map.has(key)) throw bad();
    map.set(key, value);
  }
  const out = {};
  out.WINDOW = intIn(map.get('WINDOW'), CANON, 2, 20);
  out.RATE = intIn(map.get('RATE'), CANON, 0, 20);
  out.LIMIT = intIn(map.get('LIMIT'), CANON, 1, 50);
  if (map.has('DURATION')) out.DURATION = intIn(map.get('DURATION'), DEC, 1, 30);
  return out;
}

function parseExport(text) {
  if (typeof text !== 'string') throw bad();
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const fields = [];
    for (;;) {
      if (text[i] === Q) {
        i++;
        let s = '';
        for (;;) {
          if (i >= n) throw bad();
          const c = text[i];
          if (c === Q) {
            if (text[i + 1] === Q) { s += Q; i += 2; }
            else { i++; break; }
          } else { s += c; i++; }
        }
        fields.push({ text: s, quoted: true });
        if (i < n && text[i] !== '|' && !isEnd(text[i])) throw bad();
      } else {
        const start = i;
        while (i < n && text[i] !== '|' && !isEnd(text[i])) {
          if (text[i] === Q) throw bad();
          i++;
        }
        fields.push({ text: text.slice(start, i), quoted: false });
      }
      if (i >= n) break;
      const c = text[i];
      i++;
      if (c === '|') continue;
      if (c === CR && text[i] === LF) i++;
      break;
    }
    out.push(finish(fields));
  }
  return out;
}

module.exports = { parseExport };
