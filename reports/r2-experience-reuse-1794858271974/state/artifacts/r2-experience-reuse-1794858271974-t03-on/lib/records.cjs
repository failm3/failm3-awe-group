'use strict';

// Separated key/value records parser — implements FORMAT.md.
//
// Grammar summary:
//   text        := record (TERM record)* TERM?        (empty text => [])
//   TERM        := LF | CRLF | CR
//   record      := field ('|' field)*
//   field       := QUOTED | UNQUOTED
//   QUOTED      := '"' quoted-body '"'                (whole field quoted)
//   quoted-body := ( '"' '"' | any-char-except-'"' )*
//   UNQUOTED    := any-char-except-'|', TERM, '"'
//
// A field's decoded text must be KEY=VALUE with KEY matching [A-Z][A-Z0-9_]*.
// Unquoted fields must contain exactly one '='; quoted fields split on the
// first '=' so their values may contain equals signs, separators and newlines.

const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const KNOWN = new Set(SCHEMA);
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const WS_RE = /\s/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Trim leading/trailing (JavaScript) whitespace — applied to decoded VALUE only.
function trimWhitespace(text) {
  let start = 0;
  let end = text.length;
  while (start < end && WS_RE.test(text[start])) start++;
  while (end > start && WS_RE.test(text[end - 1])) end--;
  return text.slice(start, end);
}

// Split a decoded field into its KEY and trimmed VALUE.
function splitField(decoded, quoted) {
  const eq = decoded.indexOf('=');
  if (eq < 0) throw invalidFormat();
  if (!quoted && decoded.indexOf('=', eq + 1) !== -1) throw invalidFormat();
  const key = decoded.slice(0, eq);
  const value = trimWhitespace(decoded.slice(eq + 1));
  return { key: key, value: value };
}

// Canonical unsigned decimal integer within [min, max].
function parseUnsigned(raw, min, max) {
  if (!UINT_RE.test(raw)) throw invalidValue();
  const n = Number(raw);
  if (n < min || n > max) throw invalidValue();
  return n;
}

function parseFlags(raw) {
  const parts = raw.split(',');
  const seen = new Set();
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part !== 'read' && part !== 'write') throw invalidValue();
    if (seen.has(part)) throw invalidValue();
    seen.add(part);
  }
  return parts;
}

// Validate one record's fields (syntax + duplicates first, then semantics).
function buildRecord(fields) {
  if (fields.length === 0) throw invalidFormat();

  const values = new Map();
  const order = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const split = splitField(field.text, field.quoted);
    if (!KEY_RE.test(split.key)) throw invalidFormat();
    if (values.has(split.key)) throw invalidFormat();
    values.set(split.key, split.value);
    order.push(split.key);
  }

  // Required fields must be present before any value is validated.
  if (!values.has('WINDOW') || !values.has('RATE') || !values.has('LIMIT')) {
    throw invalidValue();
  }

  const window = parseUnsigned(values.get('WINDOW'), 1, 50);
  const rate = parseUnsigned(values.get('RATE'), 0, 40);
  const limit = parseUnsigned(values.get('LIMIT'), 1, 100);
  const flags = values.has('FLAGS') ? parseFlags(values.get('FLAGS')) : undefined;

  // Known-field schema order first, then any retained unknown fields.
  const record = {};
  for (let i = 0; i < SCHEMA.length; i++) {
    const key = SCHEMA[i];
    if (!values.has(key)) continue;
    if (key === 'WINDOW') record.WINDOW = window;
    else if (key === 'RATE') record.RATE = rate;
    else if (key === 'LIMIT') record.LIMIT = limit;
    else if (key === 'FLAGS') record.FLAGS = flags;
    else if (key === 'COLOR') record.COLOR = values.get('COLOR');
  }
  // No other optional fields are documented, so every unknown key is dropped
  // here, after syntax and duplicate validation have already passed.
  return record;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = [];
  let fields = [];
  let started = false;
  let i = 0;
  const len = text.length;

  const endRecord = () => {
    records.push(buildRecord(fields));
    fields = [];
    started = false;
  };

  while (i < len) {
    let decoded;
    let quoted;

    if (text[i] === '"') {
      quoted = true;
      i++;
      decoded = '';
      let closed = false;
      while (i < len) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            decoded += '"';
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          decoded += c;
          i++;
        }
      }
      if (!closed) throw invalidFormat();
    } else {
      quoted = false;
      let j = i;
      while (j < len && text[j] !== '|' && text[j] !== '\n' && text[j] !== '\r') j++;
      decoded = text.slice(i, j);
      i = j;
      if (decoded.indexOf('"') !== -1) throw invalidFormat();
    }

    fields.push({ text: decoded, quoted: quoted });
    started = true;

    if (i >= len) break;

    const c = text[i];
    if (c === '|') {
      i++;
      if (i >= len) throw invalidFormat();
      continue;
    }
    if (c === '\r') {
      i += text[i + 1] === '\n' ? 2 : 1;
      endRecord();
      continue;
    }
    if (c === '\n') {
      i++;
      endRecord();
      continue;
    }
    // Anything else right after a closing quote (or unquoted field end) is invalid.
    throw invalidFormat();
  }

  if (started) endRecord();

  return records;
}

module.exports = { parseRecords };
