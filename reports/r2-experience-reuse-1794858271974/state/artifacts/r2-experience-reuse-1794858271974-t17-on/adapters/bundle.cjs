'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

// Known fields in schema order. Every other key is validated, then dropped.
const SCHEMA = [
  { key: 'WINDOW', required: true, parse: v => canonicalInRange(v, 3, 40) },
  { key: 'RATE', required: true, parse: v => canonicalInRange(v, 0, 20) },
  { key: 'LIMIT', required: true, parse: v => canonicalInRange(v, 1, 150) },
  { key: 'DURATION', required: false, parse: v => decimalInRange(v, 1, 90) },
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function canonicalInRange(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (n < min || n > max) throw valueError();
  return n;
}

function decimalInRange(value, min, max) {
  if (!DECIMAL_INT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw valueError();
  return n + 0; // normalizes -0
}

// Syntax check of one decoded field; returns [key, value].
function splitField(content, quoted) {
  const eq = content.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && content.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = content.slice(0, eq);
  const value = content.slice(eq + 1);
  if (!KEY_RE.test(key)) throw formatError();
  if (value.trim() !== value) throw formatError();
  return [key, value];
}

// Semantic validation of one syntactically valid record.
function buildRecord(fields) {
  const result = {};
  for (const spec of SCHEMA) {
    if (!fields.has(spec.key)) {
      if (spec.required) throw valueError();
      continue;
    }
    result[spec.key] = spec.parse(fields.get(spec.key));
  }
  return result;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  if (text === '') return records;

  let fields = new Map(); // decoded key -> raw value for the current record
  let field = '';
  let quoted = false; // field started with a quote
  let inQuotes = false; // currently inside the quoted section
  let pending = false; // current record has at least one character

  const endField = () => {
    const [key, value] = splitField(field, quoted);
    if (fields.has(key)) throw formatError();
    fields.set(key, value);
    field = '';
    quoted = false;
  };
  const endRecord = () => {
    endField();
    records.push(buildRecord(fields));
    fields = new Map();
    pending = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (quoted) {
      // After the closing quote only a separator or a record ending may follow.
      if (c !== '|' && c !== '\n' && c !== '\r') throw formatError();
    }
    if (c === '|') {
      endField();
      pending = true;
    } else if (c === '\n' || c === '\r') {
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else if (c === '"') {
      if (field !== '') throw formatError();
      quoted = true;
      inQuotes = true;
      pending = true;
    } else {
      field += c;
      pending = true;
    }
  }

  if (inQuotes) throw formatError();
  // A single trailing record ending does not start a new record.
  if (pending) endRecord();
  return records;
}

module.exports = { parseBundle };
