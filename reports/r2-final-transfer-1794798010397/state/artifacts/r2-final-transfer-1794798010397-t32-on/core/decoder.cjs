'use strict';

// Separated key/value record parser (see FORMAT.md).
// Syntax/quoting/key/duplicate/whitespace errors (INVALID_FORMAT) for a record
// are raised before any semantic error (INVALID_VALUE) for that record.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const FIELDS = [['WINDOW', 3, 40], ['RATE', 0, 10], ['LIMIT', 1, 75]];

function bad() { throw new Error('INVALID_FORMAT'); }
function badValue() { throw new Error('INVALID_VALUE'); }
function isEnd(ch) { return ch === '\n' || ch === '\r'; }

function decodeSeparated(text) {
  if (typeof text !== 'string') bad();
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const values = new Map();
    for (;;) {
      let decoded = '';
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        i += 1;
        let closed = false;
        while (i < n) {
          const ch = text[i];
          if (ch === '"') {
            if (text[i + 1] === '"') { decoded += '"'; i += 2; continue; }
            i += 1;
            closed = true;
            break;
          }
          decoded += ch;
          i += 1;
        }
        if (!closed) bad();
        if (i < n && text[i] !== ';' && !isEnd(text[i])) bad();
      } else {
        while (i < n && text[i] !== ';' && !isEnd(text[i])) {
          if (text[i] === '"') bad();
          decoded += text[i];
          i += 1;
        }
      }
      const eq = decoded.indexOf('=');
      if (eq < 0) bad();
      if (!quoted && decoded.indexOf('=', eq + 1) >= 0) bad();
      const key = decoded.slice(0, eq);
      const value = decoded.slice(eq + 1);
      if (!KEY_RE.test(key)) bad();
      if (value !== value.trim()) bad();
      if (values.has(key)) bad();
      values.set(key, value);
      if (i < n && text[i] === ';') { i += 1; continue; }
      if (i < n) {
        const seen = text[i];
        i += 1;
        if (seen === '\r' && i < n && text[i] === '\n') i += 1;
      }
      break;
    }
    const record = {};
    for (const [name, min, max] of FIELDS) {
      if (!values.has(name)) badValue();
      const raw = values.get(name);
      if (!UINT_RE.test(raw)) badValue();
      const num = Number(raw);
      if (!Number.isSafeInteger(num) || num < min || num > max) badValue();
      record[name] = num;
    }
    out.push(record);
  }
  return out;
}

module.exports = { decodeSeparated };
