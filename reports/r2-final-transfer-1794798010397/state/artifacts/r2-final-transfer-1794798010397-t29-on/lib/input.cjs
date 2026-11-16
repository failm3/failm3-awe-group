'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^-?[0-9]+$/;

// Known fields in schema order (output insertion order).
const SCHEMA = [
  { key: 'WINDOW', required: true, re: CANONICAL_UINT_RE, min: 3, max: 60 },
  { key: 'RATE', required: true, re: CANONICAL_UINT_RE, min: 0, max: 20 },
  { key: 'LIMIT', required: true, re: CANONICAL_UINT_RE, min: 1, max: 150 },
  { key: 'DURATION', required: false, re: DECIMAL_INT_RE, min: 1, max: 150 },
];
const KNOWN = new Set(SCHEMA.map((f) => f.key));

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function isRecordEnd(c) {
  return c === '\n' || c === '\r';
}

// Reads one record starting at index i. Returns { fields, next } where each
// field is { raw, quoted } and next is the index after the record terminator.
function readRecordTokens(text, i) {
  const fields = [];
  const n = text.length;
  for (;;) {
    let raw = '';
    let quoted = false;
    if (text[i] === '"') {
      quoted = true;
      i++;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            raw += '"';
            i += 2;
          } else {
            closed = true;
            i++;
            break;
          }
        } else {
          raw += c;
          i++;
        }
      }
      if (!closed) throw formatError();
      if (i < n && text[i] !== '|' && !isRecordEnd(text[i])) throw formatError();
    } else {
      while (i < n && text[i] !== '|' && !isRecordEnd(text[i])) {
        if (text[i] === '"') throw formatError();
        raw += text[i];
        i++;
      }
    }
    fields.push({ raw, quoted });
    if (i >= n) return { fields, next: n };
    const c = text[i];
    if (c === '|') {
      i++;
      continue;
    }
    // Record ending: LF, CR, or CRLF.
    if (c === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
    return { fields, next: i };
  }
}

function splitField(field) {
  const { raw, quoted } = field;
  const eq = raw.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) throw formatError();
  if (value !== value.trim()) throw formatError();
  return { key, value };
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(fields) {
  // Syntax, duplicate and whitespace checks for the whole record first.
  const pairs = fields.map(splitField);
  const values = new Map();
  for (const { key, value } of pairs) {
    if (values.has(key)) throw formatError();
    values.set(key, value);
  }

  // Semantic checks.
  const out = {};
  for (const spec of SCHEMA) {
    if (!values.has(spec.key)) {
      if (spec.required) throw valueError();
      continue;
    }
    const v = values.get(spec.key);
    if (!spec.re.test(v)) throw valueError();
    const num = Number(v);
    if (!Number.isInteger(num) || num < spec.min || num > spec.max) throw valueError();
    defineOwn(out, spec.key, num);
  }
  for (const { key, value } of pairs) {
    if (!KNOWN.has(key)) defineOwn(out, key, value);
  }
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  let i = 0;
  while (i < text.length) {
    const { fields, next } = readRecordTokens(text, i);
    records.push(buildRecord(fields));
    i = next;
  }
  return records;
}

module.exports = { readInput };
