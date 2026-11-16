'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order (also the output key order).
const SCHEMA = [
  { key: 'WINDOW', required: true, parse: v => parseIntInRange(v, 2, 60) },
  { key: 'RATE', required: true, parse: v => parseIntInRange(v, 0, 30) },
  { key: 'LIMIT', required: true, parse: v => parseIntInRange(v, 1, 125) },
  { key: 'COLOR', required: false, parse: v => parseEnum(v, ['teal', 'gold']) },
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function parseIntInRange(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value) || value.length > 4) throw valueError();
  const n = Number(value);
  if (n < min || n > max) throw valueError();
  return n;
}

function parseEnum(value, allowed) {
  if (!allowed.includes(value)) throw valueError();
  return value;
}

// Split decoded field text into key/value and validate the key.
function splitField(content, quoted) {
  const eq = content.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && content.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = content.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return { key, value: content.slice(eq + 1).trim() };
}

// Syntax/duplicate checks are already done; apply semantics to one record.
function buildRecord(fields) {
  const byKey = new Map();
  for (const { key, value } of fields) {
    if (byKey.has(key)) throw formatError();
    byKey.set(key, value);
  }
  const out = {};
  for (const field of SCHEMA) {
    if (!byKey.has(field.key)) {
      if (field.required) throw valueError();
      continue;
    }
    out[field.key] = field.parse(byKey.get(field.key));
  }
  // Unknown keys are dropped; nothing else is copied onto `out`.
  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const records = [];
  const len = text.length;
  let i = 0;
  let fields = [];

  // Parses one field starting at i; leaves i at the separator/record end/EOF.
  function readField() {
    if (text[i] === '"') {
      i++;
      let content = '';
      for (;;) {
        if (i >= len) throw formatError(); // unterminated quote
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            content += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        content += ch;
        i++;
      }
      if (i < len && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
        throw formatError(); // characters after closing quote
      }
      return splitField(content, true);
    }
    const start = i;
    while (i < len && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
      if (text[i] === '"') throw formatError(); // quote in unquoted field
      i++;
    }
    return splitField(text.slice(start, i), false);
  }

  for (;;) {
    fields.push(readField());
    if (i < len && text[i] === ';') {
      i++;
      continue;
    }
    // Record ends at EOF or a line ending (CRLF, LF, or CR).
    records.push(buildRecord(fields));
    fields = [];
    if (i >= len) break;
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
    if (i >= len) break; // a single trailing record ending is allowed
  }

  return records;
}

module.exports = { decodeSeparated };
