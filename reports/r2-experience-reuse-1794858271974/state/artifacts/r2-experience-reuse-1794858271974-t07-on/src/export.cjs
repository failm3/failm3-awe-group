'use strict';

// Known fields in schema order. WINDOW, RATE, LIMIT are required; FLAGS is optional.
const KNOWN = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const FLAG_VALUES = new Set(['cold', 'warm']);
const INT_RANGES = {
  WINDOW: [2, 40],
  RATE: [0, 40],
  LIMIT: [1, 50],
};

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function isRecordEnd(c) {
  return c === '\n' || c === '\r';
}

function parseInteger(value, key) {
  if (!UINT_RE.test(value)) throw valueError();
  const num = Number(value);
  const [min, max] = INT_RANGES[key];
  if (!Number.isSafeInteger(num) || num < min || num > max) throw valueError();
  return num;
}

function parseFlags(value) {
  const items = value.split(',');
  const seen = new Set();
  for (const item of items) {
    if (!FLAG_VALUES.has(item) || seen.has(item)) throw valueError();
    seen.add(item);
  }
  return items;
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Syntax and duplicate checks for a whole record run before any semantic check.
function buildRecord(fields) {
  const values = new Map();
  const unknownOrder = [];
  for (const { raw, quoted } of fields) {
    const eq = raw.indexOf('=');
    if (eq < 0) throw formatError();
    if (!quoted && raw.indexOf('=', eq + 1) !== -1) throw formatError();
    const key = raw.slice(0, eq);
    if (!KEY_RE.test(key)) throw formatError();
    if (values.has(key)) throw formatError();
    values.set(key, raw.slice(eq + 1).trim());
    if (!KNOWN.includes(key)) unknownOrder.push(key);
  }

  for (const key of REQUIRED) {
    if (!values.has(key)) throw valueError();
  }

  const record = {};
  for (const key of KNOWN) {
    if (!values.has(key)) continue;
    const value = values.get(key);
    defineOwn(record, key, key === 'FLAGS' ? parseFlags(value) : parseInteger(value, key));
  }
  for (const key of unknownOrder) {
    defineOwn(record, key, values.get(key));
  }
  return record;
}

function parseExport(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const fields = [];
    for (;;) {
      if (text[i] === '"') {
        // Quoted field: the whole field (key and value) is inside quotes.
        i++;
        let buf = '';
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              buf += '"';
              i += 2;
              continue;
            }
            i++;
            closed = true;
            break;
          }
          buf += c;
          i++;
        }
        if (!closed) throw formatError();
        if (i < n && text[i] !== '|' && !isRecordEnd(text[i])) throw formatError();
        fields.push({ raw: buf, quoted: true });
      } else {
        const start = i;
        while (i < n && text[i] !== '|' && !isRecordEnd(text[i])) {
          if (text[i] === '"') throw formatError();
          i++;
        }
        fields.push({ raw: text.slice(start, i), quoted: false });
      }

      if (i < n && text[i] === '|') {
        i++;
        continue;
      }
      break;
    }

    // Consume the record ending (LF, CRLF, or CR). A final ending does not start a new record.
    if (i < n) {
      if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
      else i++;
    }

    records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { parseExport };
