'use strict';

// Repair of adapters/bundle.cjs per FORMAT.md:
// "Separated key/value records" — parseBundle(text).

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields, in schema (output insertion) order: [name, min, max].
const SCHEMA = [
  ['WINDOW', 2, 30],
  ['RATE', 0, 10],
  ['LIMIT', 1, 125],
];

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Splits text starting at `start` into raw fields of one record.
// Returns { fields, quotedFlags, next }; `next` is the index just past the
// record terminator (or text.length at end of input).
function readRecord(text, start) {
  const fields = [];
  const quotedFlags = [];
  let field = '';
  let wasQuoted = false;
  let inQuotes = false;
  let justClosed = false;
  let i = start;

  const endField = () => {
    fields.push(field);
    quotedFlags.push(wasQuoted);
    field = '';
    wasQuoted = false;
    justClosed = false;
  };

  for (; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // "" decodes to one quote
          i++;
        } else {
          inQuotes = false;
          justClosed = true;
        }
      } else {
        field += c; // separators, equals signs, CR and LF are literal
      }
      continue;
    }

    if (c === ';') {
      endField();
      continue;
    }

    if (c === '\n' || c === '\r') {
      endField();
      const next = c === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
      return { fields, quotedFlags, next };
    }

    // Nothing may follow a closing quote except a separator or record ending.
    if (justClosed) throw invalidFormat();

    if (c === '"') {
      // A whole field may be quoted; a quote cannot start inside a field.
      if (field !== '' || wasQuoted) throw invalidFormat();
      inQuotes = true;
      wasQuoted = true;
      continue;
    }

    field += c;
  }

  if (inQuotes) throw invalidFormat(); // unterminated quote
  endField();
  return { fields, quotedFlags, next: i };
}

// Syntax, duplicate and whitespace validation for one record's fields.
function collectEntries(fields, quotedFlags) {
  const entries = new Map();
  for (let k = 0; k < fields.length; k++) {
    const raw = fields[k];
    const eq = raw.indexOf('=');
    if (eq === -1) throw invalidFormat();
    // Unquoted fields must be exactly KEY=VALUE with one equals sign.
    if (!quotedFlags[k] && raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();
    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);
    if (!KEY_RE.test(key)) throw invalidFormat();
    if (value !== value.trim()) throw invalidFormat(); // VALUE must be trimmed
    if (entries.has(key)) throw invalidFormat(); // duplicate decoded key
    entries.set(key, value);
  }
  return entries;
}

// Semantic validation; unknown keys were already dropped from consideration.
function buildObject(entries) {
  const out = {};
  for (const [name, min, max] of SCHEMA) {
    if (!entries.has(name)) throw invalidValue();
    const raw = entries.get(name);
    if (!CANONICAL_UINT_RE.test(raw)) throw invalidValue();
    const n = Number(raw);
    if (n < min || n > max) throw invalidValue();
    out[name] = n;
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const result = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, quotedFlags, next } = readRecord(text, pos);
    const entries = collectEntries(fields, quotedFlags);
    result.push(buildObject(entries));
    pos = next;
  }
  return result;
}

module.exports = { parseBundle };
