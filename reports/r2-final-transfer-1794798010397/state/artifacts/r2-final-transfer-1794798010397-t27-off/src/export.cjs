'use strict';

function parseExport(text) {
  const Q = '\u0022';
  const fail = () => new Error('INVALID_FORMAT');
  const bad = () => new Error('INVALID_VALUE');
  const isEnd = (c) => c === '\r' || c === '\n';
  const intOf = (v, lo, hi) => {
    if (v === undefined || !/^(0|[1-9][0-9]*)$/.test(v)) throw bad();
    const x = Number(v);
    if (x < lo || x > hi) throw bad();
    return x;
  };

  if (text === '') return [];
  const n = text.length;
  let i = 0;
  const out = [];

  for (;;) {
    const fields = new Map();
    for (;;) {
      let raw;
      let quoted = false;
      if (text[i] === Q) {
        quoted = true;
        i++;
        let buf = '';
        for (;;) {
          if (i >= n) throw fail();
          const c = text[i];
          if (c === Q) {
            if (text[i + 1] === Q) { buf += Q; i += 2; continue; }
            i++;
            break;
          }
          buf += c;
          i++;
        }
        if (i < n && text[i] !== '|' && !isEnd(text[i])) throw fail();
        raw = buf;
      } else {
        const s = i;
        while (i < n && text[i] !== '|' && !isEnd(text[i])) i++;
        raw = text.slice(s, i);
        if (raw.includes(Q)) throw fail();
      }

      const eq = raw.indexOf('=');
      if (eq < 0) throw fail();
      const key = raw.slice(0, eq);
      const value = raw.slice(eq + 1);
      if (!quoted && value.includes('=')) throw fail();
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw fail();
      if (fields.has(key)) throw fail();
      fields.set(key, value.trim());

      if (i < n && text[i] === '|') { i++; continue; }
      break;
    }

    const rec = {};
    rec.WINDOW = intOf(fields.get('WINDOW'), 1, 40);
    rec.RATE = intOf(fields.get('RATE'), 0, 40);
    rec.LIMIT = intOf(fields.get('LIMIT'), 1, 100);
    if (fields.has('FLAGS')) {
      const parts = fields.get('FLAGS').split(',');
      const seen = new Set();
      for (const p of parts) {
        if ((p !== 'cold' && p !== 'warm') || seen.has(p)) throw bad();
        seen.add(p);
      }
      rec.FLAGS = parts;
    }
    out.push(rec);

    if (i >= n) break;
    if (text[i] === '\r') {
      i++;
      if (text[i] === '\n') i++;
    } else {
      i++;
    }
    if (i >= n) break;
  }
  return out;
}

module.exports = { parseExport };
