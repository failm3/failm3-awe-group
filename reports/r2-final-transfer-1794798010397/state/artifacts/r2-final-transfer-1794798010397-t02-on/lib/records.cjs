'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const QUOTE = '"';

function fail(message) {
  throw new Error(message);
}

function intIn(value, lo, hi) {
  if (!INT_RE.test(value)) fail('INVALID_VALUE');
  const n = Number(value);
  if (n < lo || n > hi) fail('INVALID_VALUE');
  return n;
}

function buildRecord(fields) {
  const seen = new Map();
  for (const f of fields) {
    let key;
    let value;
    if (f.quoted) {
      const idx = f.text.indexOf('=');
      if (idx < 0) fail('INVALID_FORMAT');
      key = f.text.slice(0, idx);
      value = f.text.slice(idx + 1);
    } else {
      const parts = f.text.split('=');
      if (parts.length !== 2) fail('INVALID_FORMAT');
      key = parts[0];
      value = parts[1];
    }
    if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
    if (seen.has(key)) fail('INVALID_FORMAT');
    seen.set(key, value.trim());
  }
  for (const req of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!seen.has(req)) fail('INVALID_VALUE');
  }
  const out = {
    WINDOW: intIn(seen.get('WINDOW'), 3, 40),
    RATE: intIn(seen.get('RATE'), 0, 30),
    LIMIT: intIn(seen.get('LIMIT'), 1, 75),
  };
  if (seen.has('COLOR')) {
    const color = seen.get('COLOR');
    if (color !== 'cyan' && color !== 'magenta') fail('INVALID_VALUE');
    out.COLOR = color;
  }
  return out;
}

function parseRecords(text) {
  if (typeof text !== 'string') fail('INVALID_FORMAT');
  const n = text.length;
  const records = [];
  let i = 0;
  while (i < n) {
    const fields = [];
    for (;;) {
      let fieldText;
      let quoted = false;
      if (text[i] === QUOTE) {
        quoted = true;
        i++;
        fieldText = '';
        for (;;) {
          if (i >= n) fail('INVALID_FORMAT');
          const c = text[i];
          if (c === QUOTE) {
            if (text[i + 1] === QUOTE) {
              fieldText += QUOTE;
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            fieldText += c;
            i++;
          }
        }
        if (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') fail('INVALID_FORMAT');
      } else {
        const start = i;
        while (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') i++;
        fieldText = text.slice(start, i);
        if (fieldText.indexOf(QUOTE) !== -1) fail('INVALID_FORMAT');
      }
      fields.push({ text: fieldText, quoted });
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
    records.push(buildRecord(fields));
  }
  return records;
}

module.exports = { parseRecords };
