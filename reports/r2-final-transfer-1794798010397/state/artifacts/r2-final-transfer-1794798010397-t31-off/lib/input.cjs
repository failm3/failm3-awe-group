'use strict';

// Separated key/value record parser.
// Specification: FORMAT.md (records separated by LF/CRLF/CR, fields by '|',
// optional whole-field double quoting, strict value validation).

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Documented (known) fields in schema order.
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const KNOWN = new Set(KNOWN_ORDER);

const FLAG_VALUES = new Set(['dry', 'live']);

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

// Lazily yields records of raw fields so each record is fully parsed (and any
// error raised) in record order. Quoting is honoured while scanning so that
// separators and line breaks inside quotes stay part of the value.
function* records(text) {
  const n = text.length;
  let i = 0;
  for (;;) {
    const record = [];
    for (;;) {
      if (i < n && text[i] === '"') {
        i += 1;
        let value = '';
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          value += c;
          i += 1;
        }
        if (!closed) invalidFormat();
        if (i < n) {
          const c = text[i];
          if (c !== '|' && c !== '\r' && c !== '\n') invalidFormat();
        }
        record.push({ quoted: true, value });
      } else {
        let value = '';
        while (i < n) {
          const c = text[i];
          if (c === '|' || c === '\r' || c === '\n') break;
          if (c === '"') invalidFormat();
          value += c;
          i += 1;
        }
        record.push({ quoted: false, value });
      }

      if (i >= n) {
        yield record;
        return;
      }
      const sep = text[i];
      if (sep === '|') {
        i += 1;
        continue;
      }
      // Record separator: LF, CRLF or CR.
      i += sep === '\r' && text[i + 1] === '\n' ? 2 : 1;
      yield record;
      if (i >= n) return; // trailing separator terminates the last record
      break;
    }
  }
}

function define(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function parseBoundedInt(raw, min, max) {
  if (typeof raw !== 'string' || !UINT_RE.test(raw)) invalidValue();
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < min || num > max) invalidValue();
  return num;
}

function parseFlags(raw) {
  const parts = raw.split(',');
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    if (!FLAG_VALUES.has(part)) invalidValue();
    if (seen.has(part)) invalidValue();
    seen.add(part);
    out.push(part);
  }
  return out;
}

function parseRecord(fields) {
  const seenKeys = new Set();
  const values = new Map();
  const unknownOrder = [];

  // 1. Syntax, key validity and duplicate detection for the whole record.
  for (const field of fields) {
    let key;
    let value;
    if (field.quoted) {
      const eq = field.value.indexOf('=');
      if (eq < 0) invalidFormat();
      key = field.value.slice(0, eq);
      value = field.value.slice(eq + 1);
    } else {
      const parts = field.value.split('=');
      if (parts.length !== 2) invalidFormat();
      key = parts[0];
      value = parts[1];
    }
    if (!KEY_RE.test(key)) invalidFormat();
    if (seenKeys.has(key)) invalidFormat();
    seenKeys.add(key);
    values.set(key, value.trim());
    if (!KNOWN.has(key)) unknownOrder.push(key);
  }

  // 2. Semantic validation.
  if (!values.has('WINDOW') || !values.has('RATE') || !values.has('LIMIT')) invalidValue();
  const windowValue = parseBoundedInt(values.get('WINDOW'), 2, 30);
  const rate = parseBoundedInt(values.get('RATE'), 0, 40);
  const limit = parseBoundedInt(values.get('LIMIT'), 1, 50);
  const flags = values.has('FLAGS') ? parseFlags(values.get('FLAGS')) : undefined;

  // 3. Ordinary object: known schema order, then unknown field order.
  const out = {};
  define(out, 'WINDOW', windowValue);
  define(out, 'RATE', rate);
  define(out, 'LIMIT', limit);
  if (flags !== undefined) define(out, 'FLAGS', flags);
  if (values.has('COLOR')) define(out, 'COLOR', values.get('COLOR'));
  for (const key of unknownOrder) define(out, key, values.get(key));
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];
  const out = [];
  for (const fields of records(text)) out.push(parseRecord(fields));
  return out;
}

module.exports = { readInput };
