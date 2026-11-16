'use strict';

// Separated key/value record parser implementing FORMAT.md.

const FORMAT_ERR = 'INVALID_FORMAT';
const VALUE_ERR = 'INVALID_VALUE';
const Q = String.fromCharCode(34);

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order: [name, min, max]. All are required.
const SCHEMA = [['WINDOW', 1, 60], ['RATE', 0, 10], ['LIMIT', 1, 25]];

function fail(message) {
  throw new Error(message);
}

// Split into raw records; line breaks inside quotes are data.
function splitRecords(text) {
  const records = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  let inQuotes = false;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === Q) {
        if (text[i + 1] === Q) {
          i += 2;
          continue;
        }
        inQuotes = false;
      }
      i += 1;
      continue;
    }
    if (ch === Q) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      records.push(text.slice(start, i));
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      i += 1;
      start = i;
      continue;
    }
    i += 1;
  }
  if (inQuotes) fail(FORMAT_ERR);
  if (start < n) records.push(text.slice(start));
  return records;
}

// Split one raw record into decoded fields: [{ value, quoted }].
function splitFields(record) {
  const n = record.length;
  if (n === 0) fail(FORMAT_ERR);
  const fields = [];
  let i = 0;
  for (;;) {
    if (record[i] === Q) {
      let j = i + 1;
      let value = '';
      let closed = false;
      while (j < n) {
        const ch = record[j];
        if (ch === Q) {
          if (record[j + 1] === Q) {
            value += Q;
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        value += ch;
        j += 1;
      }
      if (!closed) fail(FORMAT_ERR);
      if (j < n && record[j] !== ';') fail(FORMAT_ERR);
      fields.push({ value, quoted: true });
      i = j;
    } else {
      const next = record.indexOf(';', i);
      const end = next === -1 ? n : next;
      const value = record.slice(i, end);
      if (value.includes(Q)) fail(FORMAT_ERR);
      fields.push({ value, quoted: false });
      i = end;
    }
    if (i >= n) break;
    i += 1;
    if (i >= n) fail(FORMAT_ERR);
  }
  return fields;
}

// Syntax, whitespace and duplicate validation; returns Map(key -> string value).
function parseRecord(record) {
  const decoded = new Map();
  for (const field of splitFields(record)) {
    const text = field.value;
    const eq = text.indexOf('=');
    if (eq === -1) fail(FORMAT_ERR);
    if (!field.quoted && text.indexOf('=', eq + 1) !== -1) fail(FORMAT_ERR);
    const key = text.slice(0, eq);
    const value = text.slice(eq + 1);
    if (!KEY_RE.test(key)) fail(FORMAT_ERR);
    if (value !== value.trim()) fail(FORMAT_ERR);
    if (decoded.has(key)) fail(FORMAT_ERR);
    decoded.set(key, value);
  }
  return decoded;
}

function parseExport(text) {
  if (typeof text !== 'string') fail(FORMAT_ERR);
  if (text.length === 0) return [];
  const out = [];
  for (const record of splitRecords(text)) {
    const fields = parseRecord(record);
    const obj = {};
    for (const [name, min, max] of SCHEMA) {
      if (!fields.has(name)) fail(VALUE_ERR);
      const raw = fields.get(name);
      if (!UINT_RE.test(raw)) fail(VALUE_ERR);
      const num = Number(raw);
      if (num < min || num > max) fail(VALUE_ERR);
      obj[name] = num;
    }
    out.push(obj);
  }
  return out;
}

module.exports = { parseExport };
