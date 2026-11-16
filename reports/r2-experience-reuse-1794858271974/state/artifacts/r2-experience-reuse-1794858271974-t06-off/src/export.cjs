'use strict';

// Parser for separated key/value records as specified in FORMAT.md.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order. Every known field is validated after the
// whole record has been parsed syntactically.
const SCHEMA = [
  { key: 'WINDOW', required: true, parse: intRange(1, 30) },
  { key: 'RATE', required: true, parse: intRange(0, 30) },
  { key: 'LIMIT', required: true, parse: intRange(1, 25) },
  { key: 'COLOR', required: false, parse: oneOf(['green', 'amber']) },
];
const KNOWN_KEYS = new Set(SCHEMA.map((f) => f.key));

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function intRange(min, max) {
  return (value) => {
    if (!CANONICAL_UINT_RE.test(value)) throw valueError();
    const n = Number(value);
    if (n < min || n > max) throw valueError();
    return n;
  };
}

function oneOf(allowed) {
  return (value) => {
    if (!allowed.includes(value)) throw valueError();
    return value;
  };
}

// Own, enumerable data property; never triggers the __proto__ setter.
function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function isRecordEnd(c) {
  return c === undefined || c === '\n' || c === '\r';
}

// Reads one record starting at `pos`. Returns { fields, next } where fields
// is a list of { raw, quoted } and next is the index after the record ending.
function readRecord(text, pos) {
  const fields = [];
  let i = pos;
  for (;;) {
    let raw;
    let quoted = false;
    if (text[i] === '"') {
      quoted = true;
      i += 1;
      let buf = '';
      for (;;) {
        if (i >= text.length) throw formatError(); // unterminated quote
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            buf += '"';
            i += 2;
          } else {
            i += 1;
            break;
          }
        } else {
          buf += c;
          i += 1;
        }
      }
      // Only a separator or a record ending may follow a closing quote.
      if (text[i] !== ';' && !isRecordEnd(text[i])) throw formatError();
      raw = buf;
    } else {
      const start = i;
      while (text[i] !== ';' && !isRecordEnd(text[i])) i += 1;
      raw = text.slice(start, i);
      if (raw.includes('"')) throw formatError();
    }
    fields.push({ raw, quoted });

    if (text[i] === ';') {
      i += 1;
      continue;
    }
    // Record ending: end of input, LF, CRLF, or CR.
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else if (text[i] !== undefined) i += 1;
    return { fields, next: i };
  }
}

// Syntax checks for one record; returns an ordered list of [key, value].
function decodeFields(fields) {
  const seen = new Set();
  const pairs = [];
  for (const { raw, quoted } of fields) {
    const eq = raw.indexOf('=');
    if (eq === -1) throw formatError();
    // Unquoted fields must contain exactly one equals sign.
    if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
    const key = raw.slice(0, eq);
    if (!KEY_RE.test(key)) throw formatError();
    if (seen.has(key)) throw formatError();
    seen.add(key);
    pairs.push([key, raw.slice(eq + 1).trim()]);
  }
  return pairs;
}

function buildRecord(pairs) {
  const values = new Map(pairs);
  const out = {};
  for (const field of SCHEMA) {
    if (!values.has(field.key)) {
      if (field.required) throw valueError();
      continue;
    }
    setOwn(out, field.key, field.parse(values.get(field.key)));
  }
  for (const [key, value] of pairs) {
    if (!KNOWN_KEYS.has(key)) setOwn(out, key, value);
  }
  return out;
}

function parseExport(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next } = readRecord(text, pos);
    // Per record: syntax/duplicate errors first, then semantic errors.
    records.push(buildRecord(decodeFields(fields)));
    pos = next;
  }
  return records;
}

module.exports = { parseExport };
