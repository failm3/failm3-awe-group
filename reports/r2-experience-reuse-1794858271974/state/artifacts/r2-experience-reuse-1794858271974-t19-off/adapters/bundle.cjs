'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order. Fields not listed here are dropped.
const SCHEMA = [
  { key: 'WINDOW', required: true, parse: v => parseIntRange(v, 2, 60) },
  { key: 'RATE', required: true, parse: v => parseIntRange(v, 0, 40) },
  { key: 'LIMIT', required: true, parse: v => parseIntRange(v, 1, 50) },
  { key: 'FLAGS', required: false, parse: parseFlags },
];

const ALLOWED_FLAGS = new Set(['alpha', 'beta']);

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function parseIntRange(value, min, max) {
  if (!UINT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (n < min || n > max) throw valueError();
  return n;
}

function parseFlags(value) {
  const items = value.split(',');
  const seen = new Set();
  for (const item of items) {
    if (!ALLOWED_FLAGS.has(item) || seen.has(item)) throw valueError();
    seen.add(item);
  }
  return items;
}

// Splits decoded "KEY=VALUE" text into a validated [key, trimmedValue] pair.
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return [key, raw.slice(eq + 1).trim()];
}

// Reads one record starting at index `pos`. Returns { fields, next } where
// `next` is the index after the record ending (or text.length at end of input).
function readRecord(text, pos) {
  const fields = [];
  const len = text.length;
  let i = pos;

  for (;;) {
    let raw;
    let quoted = false;

    if (text[i] === '"') {
      quoted = true;
      i++;
      raw = '';
      for (;;) {
        if (i >= len) throw formatError(); // unterminated quote
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            raw += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        raw += ch;
        i++;
      }
      // Only a separator, record ending, or end of input may follow.
      if (i < len && text[i] !== '|' && text[i] !== '\n' && text[i] !== '\r') {
        throw formatError();
      }
    } else {
      const start = i;
      while (i < len && text[i] !== '|' && text[i] !== '\n' && text[i] !== '\r') {
        if (text[i] === '"') throw formatError();
        i++;
      }
      raw = text.slice(start, i);
    }

    fields.push(splitField(raw, quoted));

    if (i < len && text[i] === '|') {
      i++;
      continue;
    }
    // Record ending: CRLF, LF, CR, or end of input.
    if (i < len) {
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
    }
    return { fields, next: i };
  }
}

function buildRecord(fields) {
  // Duplicate check on decoded keys, before unknown keys are dropped.
  const values = new Map();
  for (const [key, value] of fields) {
    if (values.has(key)) throw formatError();
    values.set(key, value);
  }

  const out = {};
  for (const field of SCHEMA) {
    if (!values.has(field.key)) {
      if (field.required) throw valueError();
      continue;
    }
    out[field.key] = field.parse(values.get(field.key));
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next } = readRecord(text, pos);
    records.push(buildRecord(fields));
    pos = next;
  }
  return records;
}

module.exports = { parseBundle };
