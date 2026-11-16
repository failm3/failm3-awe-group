'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order, with inclusive integer ranges.
const SCHEMA = [
  ['WINDOW', 3, 40],
  ['RATE', 0, 10],
  ['LIMIT', 1, 75],
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Split "KEY=VALUE" text into a validated [key, value] pair.
// Unquoted fields must contain exactly one '='; quoted fields may contain
// further '=' characters in the value.
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) throw formatError();
  if (value !== value.trim()) throw formatError();
  return [key, value];
}

function parseUint(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
  return n;
}

// Apply semantic validation to one syntactically valid record.
function buildRecord(fields) {
  const out = {};
  for (const [name, min, max] of SCHEMA) {
    if (!fields.has(name)) throw valueError();
    out[name] = parseUint(fields.get(name), min, max);
  }
  // All other keys are unknown and dropped (no optional field is defined).
  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  const len = text.length;
  if (len === 0) return records;

  let i = 0;
  let fields = new Map();

  const addField = (raw, quoted) => {
    const [key, value] = splitField(raw, quoted);
    if (fields.has(key)) throw formatError();
    fields.set(key, value);
  };

  for (;;) {
    // Parse one field starting at i.
    let raw;
    let quoted = false;
    if (i < len && text[i] === '"') {
      quoted = true;
      i++;
      raw = '';
      let closed = false;
      while (i < len) {
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            raw += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        raw += ch;
        i++;
      }
      if (!closed) throw formatError();
      if (i < len && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
        throw formatError();
      }
    } else {
      const start = i;
      while (i < len && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
        if (text[i] === '"') throw formatError();
        i++;
      }
      raw = text.slice(start, i);
    }
    addField(raw, quoted);

    // Field delimiter: separator, record ending, or end of input.
    if (i < len && text[i] === ';') {
      i++;
      continue;
    }

    records.push(buildRecord(fields));
    fields = new Map();

    if (i >= len) break;
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i++;
    // A single trailing record ending terminates the last record.
    if (i >= len) break;
  }

  return records;
}

module.exports = { decodeSeparated };
