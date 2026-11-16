'use strict';

// Parser for the separated key/value record format described in FORMAT.md.

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';
const QUOTE = '"';
const CR = '\r';
const LF = '\n';
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;
// Only these fields are defined by FORMAT.md, in schema order: [name, min, max].
const REQUIRED = [['WINDOW', 2, 30], ['RATE', 0, 10], ['LIMIT', 1, 125]];

function fail(code) {
  throw new Error(code);
}

function isEnd(c) {
  return c === CR || c === LF;
}

// Split text into records of raw fields. A syntax error is stored as a sentinel
// record ({ error }) so earlier records are still processed first.
function tokenize(text) {
  const records = [];
  let record = [];
  let i = 0;
  const n = text.length;
  try {
    while (i < n) {
      let value;
      let quoted = false;
      if (text[i] === QUOTE) {
        quoted = true;
        i++;
        let out = '';
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === QUOTE) {
            if (text[i + 1] === QUOTE) {
              out += QUOTE;
              i += 2;
            } else {
              i++;
              closed = true;
              break;
            }
          } else {
            out += c;
            i++;
          }
        }
        if (!closed) fail(INVALID_FORMAT);
        if (i < n && text[i] !== ';' && !isEnd(text[i])) fail(INVALID_FORMAT);
        value = out;
      } else {
        const start = i;
        while (i < n && text[i] !== ';' && !isEnd(text[i])) {
          if (text[i] === QUOTE) fail(INVALID_FORMAT);
          i++;
        }
        value = text.slice(start, i);
      }
      record.push({ text: value, quoted: quoted });
      if (i >= n) break;
      if (text[i] === ';') {
        i++;
        if (i >= n || isEnd(text[i])) fail(INVALID_FORMAT); // empty trailing field
      } else {
        records.push(record);
        record = [];
        i += text[i] === CR && text[i + 1] === LF ? 2 : 1;
      }
    }
    if (record.length) records.push(record);
  } catch (e) {
    records.push({ error: e });
  }
  return records;
}

function decodeField(field) {
  const idx = field.text.indexOf('=');
  if (idx === -1) fail(INVALID_FORMAT);
  const key = field.text.slice(0, idx);
  const value = field.text.slice(idx + 1);
  if (!field.quoted && value.indexOf('=') !== -1) fail(INVALID_FORMAT);
  if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
  if (value !== value.trim()) fail(INVALID_FORMAT);
  return { key: key, value: value };
}

function buildRecord(rawFields) {
  // Syntax, whitespace and duplicate validation first.
  const byKey = new Map();
  for (let i = 0; i < rawFields.length; i++) {
    const pair = decodeField(rawFields[i]);
    if (byKey.has(pair.key)) fail(INVALID_FORMAT);
    byKey.set(pair.key, pair.value);
  }
  // Semantic validation; unknown keys are dropped.
  const out = {};
  for (let j = 0; j < REQUIRED.length; j++) {
    const name = REQUIRED[j][0];
    const lo = REQUIRED[j][1];
    const hi = REQUIRED[j][2];
    if (!byKey.has(name)) fail(INVALID_VALUE);
    const raw = byKey.get(name);
    if (!UINT_RE.test(raw)) fail(INVALID_VALUE);
    const num = Number(raw);
    if (num < lo || num > hi) fail(INVALID_VALUE);
    out[name] = num;
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  if (text === '') return [];
  const raw = tokenize(text);
  const result = [];
  for (let i = 0; i < raw.length; i++) {
    if (!Array.isArray(raw[i])) throw raw[i].error;
    result.push(buildRecord(raw[i]));
  }
  return result;
}

module.exports = { parseBundle: parseBundle };
