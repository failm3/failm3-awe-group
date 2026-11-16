'use strict';

// Separated key/value records, as specified in FORMAT.md.
// readInput(text) -> array of ordinary objects, one per record.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order, with inclusive integer bounds.
// FORMAT.md defines no optional semantic field, so every other key is unknown.
const SCHEMA = [
  ['WINDOW', 2, 50],
  ['RATE', 0, 10],
  ['LIMIT', 1, 125],
];
const KNOWN = new Set(SCHEMA.map(([key]) => key));

function fail(code) {
  throw new Error(code);
}

// Define an own enumerable data property so keys such as "__proto__"
// stay plain data and never change the object's prototype.
function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Convert one record's decoded field texts into an object.
// All syntax checks run before any semantic check.
function buildRecord(fields) {
  const values = new Map();

  for (const raw of fields) {
    const eq = raw.indexOf('=');
    if (eq < 0 || raw.indexOf('=', eq + 1) !== -1) fail('INVALID_FORMAT');

    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);

    if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
    if (value !== value.trim()) fail('INVALID_FORMAT');
    if (values.has(key)) fail('INVALID_FORMAT');

    values.set(key, value);
  }

  const out = {};

  for (const [key, lo, hi] of SCHEMA) {
    if (!values.has(key)) fail('INVALID_VALUE');
    const raw = values.get(key);
    if (!UINT_RE.test(raw)) fail('INVALID_VALUE');
    const num = Number(raw);
    if (num < lo || num > hi) fail('INVALID_VALUE');
    setOwn(out, key, num);
  }

  // Map preserves original field order for the retained unknown fields.
  for (const [key, value] of values) {
    if (!KNOWN.has(key)) setOwn(out, key, value);
  }

  return out;
}

function readInput(text) {
  if (typeof text !== 'string') fail('INVALID_FORMAT');
  if (text === '') return [];

  const result = [];
  let record = [];
  let field = '';
  let quoted = false; // inside a quoted field
  let closed = false; // closing quote consumed for the current field

  const endField = () => {
    record.push(field);
    field = '';
    closed = false;
  };
  const endRecord = () => {
    endField();
    result.push(buildRecord(record));
    record = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];

    if (quoted) {
      if (c !== '"') {
        field += c; // separators, '=', CR and LF are literal data here
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (c === ';') {
      endField();
    } else if (c === '\n' || c === '\r') {
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i += 1;
    } else if (closed) {
      fail('INVALID_FORMAT'); // text after a closing quote
    } else if (c === '"') {
      if (field !== '') fail('INVALID_FORMAT'); // quote in unquoted field
      quoted = true;
    } else {
      field += c;
    }
  }

  if (quoted) fail('INVALID_FORMAT'); // unterminated quote

  // A final record ending does not start a new record.
  if (closed || field !== '' || record.length > 0) endRecord();

  return result;
}

module.exports = { readInput };
