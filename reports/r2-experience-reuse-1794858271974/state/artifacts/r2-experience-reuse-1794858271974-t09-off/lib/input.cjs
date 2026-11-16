'use strict';

// Separated key/value records. See FORMAT.md.
//
// Exported: readInput(text) -> Array<Object>
//
// Grammar, in brief:
//   text    := record (TERM record)* TERM?      (TERM = LF | CRLF | CR)
//   record  := field ('|' field)*
//   field   := unquoted | '"' quoted '"'
//   unquoted := KEY '=' VALUE                  (exactly one '=', no '"')
//   KEY     := [A-Z][A-Z0-9_]*
//
// Records are parsed and validated one at a time so that, for any given
// record, syntax/duplicate/whitespace problems take precedence over semantic
// (INVALID_VALUE) problems of that same record.

// FORMAT.md: "Only the documented optional field is recognized" -> DURATION.
// COLOR/FLAGS are not documented fields here, so they are unknown and dropped.
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'DURATION'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INTEGER_RE = /^[+-]?[0-9]+$/;

// key -> [min, max, requiresCanonicalUnsignedForm]
const INT_RULES = {
  WINDOW: [1, 60, true],
  RATE: [0, 20, true],
  LIMIT: [1, 100, true],
  DURATION: [1, 150, false],
};

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

// Split a decoded field (quotes already removed) into a validated {key, value}
// pair, applying the key rule and the whitespace policy.
function splitField(fieldText) {
  const eq = fieldText.indexOf('=');
  if (eq < 0) invalidFormat();
  if (fieldText.indexOf('=', eq + 1) !== -1) invalidFormat();

  const key = fieldText.slice(0, eq);
  const value = fieldText.slice(eq + 1);

  if (!KEY_RE.test(key)) invalidFormat();
  // Whitespace policy: VALUE must already equal its trimmed form.
  if (value !== value.trim()) invalidFormat();

  return { key: key, value: value };
}

function isTerminator(c) {
  return c === '\r' || c === '\n';
}

// Parse the fields of one record starting at `pos`. Returns
// { fields, next } where next is the position after the record terminator
// (or text.length), and `eof` is true when the record ended the text.
function parseRecord(text, pos) {
  const n = text.length;
  const fields = [];

  for (;;) {
    if (pos >= n) invalidFormat(); // record must have >= 1 field
    if (isTerminator(text[pos])) invalidFormat(); // empty record

    let fieldText;

    if (text[pos] === '"') {
      // A whole field is quoted. Separators, '=' and CR/LF are literal
      // inside; two double quotes decode to one quote.
      pos += 1;
      let decoded = '';
      let closed = false;
      while (pos < n) {
        const c = text[pos];
        if (c === '"') {
          if (text[pos + 1] === '"') {
            decoded += '"';
            pos += 2;
            continue;
          }
          pos += 1;
          closed = true;
          break;
        }
        decoded += c;
        pos += 1;
      }
      if (!closed) invalidFormat(); // unterminated quote
      // Nothing may follow the closing quote but a separator or record end.
      if (pos < n && text[pos] !== '|' && !isTerminator(text[pos])) {
        invalidFormat();
      }
      fieldText = decoded;
    } else {
      // Unquoted field: a quote anywhere is a syntax error.
      const start = pos;
      while (pos < n && text[pos] !== '|' && !isTerminator(text[pos])) {
        if (text[pos] === '"') invalidFormat();
        pos += 1;
      }
      fieldText = text.slice(start, pos);
    }

    fields.push(splitField(fieldText));

    if (pos < n && text[pos] === '|') {
      pos += 1;
      continue;
    }

    if (pos < n) {
      if (text[pos] === '\r') {
        pos += 1;
        if (pos < n && text[pos] === '\n') pos += 1;
      } else {
        pos += 1; // '\n'
      }
    }

    return { fields: fields, next: pos };
  }
}

function convertField(key, raw) {
  const rule = INT_RULES[key];
  let textValue = raw;

  if (rule[2]) {
    if (!CANONICAL_UNSIGNED_RE.test(textValue)) invalidValue();
  } else if (!DECIMAL_INTEGER_RE.test(textValue)) {
    invalidValue();
  }

  const num = Number(textValue);
  if (!Number.isInteger(num)) invalidValue();
  if (num < rule[0] || num > rule[1]) invalidValue();
  return num;
}

function buildRecord(fields) {
  // Duplicate decoded keys are a syntax-level problem.
  const seen = new Set();
  for (const field of fields) {
    if (seen.has(field.key)) invalidFormat();
    seen.add(field.key);
  }

  // Known fields, converted in schema order; unknown keys are dropped here,
  // after syntax and duplicate validation.
  const values = new Map();
  for (const field of fields) {
    if (!SCHEMA.includes(field.key)) continue;
    values.set(field.key, convertField(field.key, field.value));
  }

  for (const key of REQUIRED) {
    if (!values.has(key)) invalidValue();
  }

  // Ordinary own-key object; insertion order is known-field schema order,
  // then retained unknown field order (unknowns are dropped). defineProperty
  // keeps prototype-looking keys from touching the prototype chain.
  const record = {};
  for (const key of SCHEMA) {
    if (!values.has(key)) continue;
    Object.defineProperty(record, key, {
      value: values.get(key),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return record;
}

function readInput(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text.length === 0) return [];

  const result = [];
  let pos = 0;
  while (pos < text.length) {
    const parsed = parseRecord(text, pos);
    result.push(buildRecord(parsed.fields));
    pos = parsed.next;
  }
  return result;
}

module.exports = { readInput };
