'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order. Output keys are inserted in this order.
const SCHEMA = [
  { key: 'WINDOW', required: true, parse: v => parseUint(v, 3, 40) },
  { key: 'RATE', required: true, parse: v => parseUint(v, 0, 30) },
  { key: 'LIMIT', required: true, parse: v => parseUint(v, 1, 75) },
  { key: 'COLOR', required: false, parse: v => parseEnum(v, ['cyan', 'magenta']) },
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function parseUint(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
  return n;
}

function parseEnum(value, allowed) {
  if (!allowed.includes(value)) throw valueError();
  return value;
}

// Split decoded "KEY=VALUE" text into a validated key and a trimmed value.
// Unquoted fields must contain exactly one '='; quoted fields may contain more
// (they belong to the value).
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return { key, value: raw.slice(eq + 1).trim() };
}

function isRecordEnd(ch) {
  return ch === '\n' || ch === '\r';
}

// Reads one record starting at index `pos`. Returns the fields and the index
// just past the record terminator (or text.length at end of input).
function readRecord(text, pos) {
  const fields = [];
  const len = text.length;

  for (;;) {
    let raw;
    let quoted = false;

    if (text[pos] === '"') {
      quoted = true;
      pos++;
      let buf = '';
      for (;;) {
        if (pos >= len) throw formatError(); // unterminated quote
        const ch = text[pos];
        if (ch === '"') {
          if (text[pos + 1] === '"') {
            buf += '"';
            pos += 2;
            continue;
          }
          pos++;
          break;
        }
        buf += ch;
        pos++;
      }
      // Only a separator, a record ending or end of input may follow.
      if (pos < len && text[pos] !== ';' && !isRecordEnd(text[pos])) {
        throw formatError();
      }
      raw = buf;
    } else {
      const start = pos;
      while (pos < len && text[pos] !== ';' && !isRecordEnd(text[pos])) {
        if (text[pos] === '"') throw formatError(); // quote in unquoted field
        pos++;
      }
      raw = text.slice(start, pos);
    }

    fields.push(splitField(raw, quoted));

    if (pos >= len) return { fields, next: len };
    const ch = text[pos];
    if (ch === ';') {
      pos++;
      continue;
    }
    // Record ending: CRLF, LF or CR.
    if (ch === '\r' && text[pos + 1] === '\n') pos += 2;
    else pos++;
    return { fields, next: pos };
  }
}

function buildRecord(fields) {
  const byKey = new Map();
  for (const { key, value } of fields) {
    if (byKey.has(key)) throw formatError(); // duplicate decoded key
    byKey.set(key, value);
  }

  // Unknown keys are dropped. Assigning only schema keys means a
  // prototype-looking key can never reach the result object.
  const out = {};
  for (const field of SCHEMA) {
    if (!byKey.has(field.key)) {
      if (field.required) throw valueError();
      continue;
    }
    out[field.key] = field.parse(byKey.get(field.key));
  }
  return out;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  let pos = 0;
  while (pos < text.length) {
    // Syntax and duplicate checks for a record run before its semantic checks.
    const { fields, next } = readRecord(text, pos);
    records.push(buildRecord(fields));
    pos = next;
  }
  return records;
}

module.exports = { parseRecords };
