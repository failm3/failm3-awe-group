'use strict';

const DQ = String.fromCharCode(34);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(?:0|[1-9][0-9]*)$/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

function parseInteger(value, min, max) {
  if (typeof value !== 'string' || !INT_RE.test(value)) throw invalidValue();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw invalidValue();
  return n;
}

function buildRecord(fields) {
  const map = new Map(fields);
  const result = {};
  result.WINDOW = parseInteger(map.get('WINDOW'), 3, 30);
  result.RATE = parseInteger(map.get('RATE'), 0, 30);
  result.LIMIT = parseInteger(map.get('LIMIT'), 1, 75);
  if (map.has('COLOR')) {
    const color = map.get('COLOR');
    if (color !== 'green' && color !== 'amber') throw invalidValue();
    result.COLOR = color;
  }
  return result;
}

function isBreak(ch) {
  return ch === LF || ch === CR;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  const n = text.length;
  const out = [];
  let i = 0;
  while (i < n) {
    const fields = [];
    const seen = new Set();
    let recordDone = false;
    while (!recordDone) {
      let decoded;
      let quoted = false;
      if (text[i] === DQ) {
        quoted = true;
        i++;
        let buf = '';
        let closed = false;
        while (i < n) {
          const ch = text[i];
          if (ch === DQ) {
            if (text[i + 1] === DQ) {
              buf += DQ;
              i += 2;
              continue;
            }
            i++;
            closed = true;
            break;
          }
          buf += ch;
          i++;
        }
        if (!closed) throw invalidFormat();
        decoded = buf;
        if (i < n && text[i] !== ';' && !isBreak(text[i])) throw invalidFormat();
      } else {
        const start = i;
        while (i < n && text[i] !== ';' && !isBreak(text[i])) i++;
        decoded = text.slice(start, i);
        if (decoded.includes(DQ)) throw invalidFormat();
      }
      const eq = decoded.indexOf('=');
      if (eq < 0) throw invalidFormat();
      if (!quoted && decoded.indexOf('=', eq + 1) !== -1) throw invalidFormat();
      const key = decoded.slice(0, eq);
      if (!KEY_RE.test(key)) throw invalidFormat();
      const value = decoded.slice(eq + 1).trim();
      if (seen.has(key)) throw invalidFormat();
      seen.add(key);
      fields.push([key, value]);
      if (i >= n) {
        recordDone = true;
      } else if (text[i] === ';') {
        i++;
      } else {
        if (text[i] === CR && text[i + 1] === LF) i += 2;
        else i++;
        recordDone = true;
      }
    }
    out.push(buildRecord(fields));
  }
  return out;
}

module.exports = { parseExport };
