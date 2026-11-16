'use strict';

/*
 * decodeSeparated(text) — parser for the "Separated key/value records" format
 * documented in FORMAT.md.
 *
 * Grammar summary:
 *   text    := record ( (CRLF | CR | LF) record )*        (empty text -> [])
 *   record  := field ( ';' field )*
 *   field   := quoted | unquoted
 *   quoted  := '"' ... '"'      ("" decodes to one '"'; may hold ';', '=', CR, LF;
 *                                nothing but a separator/record end may follow the
 *                                closing quote)
 *   unquoted:= KEY '=' VALUE    (exactly one '=', no quotes anywhere in field)
 *   KEY     := [A-Z][A-Z0-9_]*
 *   VALUE   := already equal to its trimmed form
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Required fields with their semantic ranges, in documented schema order.
const REQUIRED = [
  ['WINDOW', 1, 40],
  ['RATE', 0, 10],
  ['LIMIT', 1, 25],
];

// FORMAT.md defines no additional semantic (optional) field for this format,
// so every other key is an unknown field retained as a string.
const KNOWN = REQUIRED.map(([name]) => name);

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

function setOwn(obj, key, value) {
  // defineProperty keeps hostile names (e.g. "__proto__") inert and always
  // creates an ordinary own enumerable key.
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function isCanonicalUint(s) {
  return CANONICAL_UINT_RE.test(s);
}

// Parse a single field (quoted or unquoted) starting at `start`.
// Returns the decoded field text and the index just past the field.
function parseField(text, start) {
  const n = text.length;

  if (text[start] === '"') {
    let j = start + 1;
    let buf = '';
    for (;;) {
      if (j >= n) invalidFormat(); // unterminated quote
      const ch = text[j];
      if (ch === '"') {
        if (j + 1 < n && text[j + 1] === '"') {
          buf += '"';
          j += 2;
          continue;
        }
        j += 1;
        break; // closing quote
      }
      buf += ch;
      j += 1;
    }
    if (j < n) {
      const c = text[j];
      if (c !== ';' && c !== '\r' && c !== '\n') invalidFormat();
    }
    return { raw: buf, quoted: true, next: j };
  }

  let j = start;
  while (j < n) {
    const c = text[j];
    if (c === ';' || c === '\r' || c === '\n') break;
    if (c === '"') invalidFormat(); // quotes are illegal in unquoted fields
    j += 1;
  }
  return { raw: text.slice(start, j), quoted: false, next: j };
}

// Split decoded field text into KEY / VALUE and validate the key, the number of
// equals signs and the whitespace policy.
function splitField(raw, quoted) {
  const eq = raw.indexOf('=');
  if (eq < 0) invalidFormat(); // not a KEY=VALUE field
  if (!quoted && raw.indexOf('=', eq + 1) !== -1) invalidFormat(); // must have exactly one '='
  const key = raw.slice(0, eq);
  const value = raw.slice(eq + 1);
  if (!KEY_RE.test(key)) invalidFormat();
  if (value !== value.trim()) invalidFormat(); // VALUE must already be trimmed
  return { key, value };
}

function buildRecord(fields) {
  const values = new Map();
  for (const field of fields) values.set(field.key, field.value);

  // Semantic validation of required fields (runs only after every field of the
  // record has passed syntax/duplicate/whitespace validation).
  const numbers = new Map();
  for (const [name, min, max] of REQUIRED) {
    if (!values.has(name)) invalidValue();
    const raw = values.get(name);
    if (!isCanonicalUint(raw)) invalidValue();
    const num = Number(raw);
    if (num < min || num > max) invalidValue();
    numbers.set(name, num);
  }

  const record = {};
  for (const [name] of REQUIRED) setOwn(record, name, numbers.get(name));
  for (const field of fields) {
    if (KNOWN.indexOf(field.key) !== -1) continue;
    setOwn(record, field.key, field.value); // unknown keys stay strings, record order
  }
  return record;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text.length === 0) return [];

  const n = text.length;
  const out = [];
  let fields = [];
  let seen = new Set();
  let i = 0;

  const finishRecord = () => {
    out.push(buildRecord(fields));
    fields = [];
    seen = new Set();
  };

  while (i < n) {
    const { raw, quoted, next } = parseField(text, i);
    const { key, value } = splitField(raw, quoted);
    if (seen.has(key)) invalidFormat(); // duplicate decoded key
    seen.add(key);
    fields.push({ key, value });
    i = next;

    if (i < n) {
      const c = text[i];
      if (c === ';') {
        i += 1;
        if (i >= n) invalidFormat(); // trailing separator implies an empty field
        continue;
      }
      if (c === '\r') {
        i += 1;
        if (i < n && text[i] === '\n') i += 1;
        finishRecord();
        continue;
      }
      if (c === '\n') {
        i += 1;
        finishRecord();
        continue;
      }
      invalidFormat();
    }
  }

  // A single trailing record terminator does not create an extra empty record.
  if (fields.length > 0) finishRecord();

  return out;
}

module.exports = { decodeSeparated };
