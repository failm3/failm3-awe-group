'use strict';

/*
 * Separated key/value records -- reference implementation of FORMAT.md.
 *
 * Grammar (informal):
 *   text    := [ record ( *EOL record )* [ *EOL ] ]
 *   record  := field ( ";" field )*
 *   field   := quoted-field | plain-field
 *   quoted-field := '"' ( char | '""' )* '"'
 *   plain-field  := KEY "=" VALUE          (exactly one '=' ; no '"')
 * Separators between records are LF, CRLF or CR, but a line break inside a
 * quoted field belongs to that field's text.
 */

const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const KNOWN_SET = new Set(KNOWN_FIELDS);
const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Store every key as a real own data property so prototype-looking keys
// ("__proto__", "constructor", ...) stay plain data.
function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function parseInteger(raw, min, max) {
  if (!CANONICAL_UINT_RE.test(raw)) throw invalidValue();
  const n = Number(raw);
  if (n < min || n > max) throw invalidValue();
  return n;
}

function buildRecord(fields) {
  const values = new Map();
  for (const field of fields) {
    values.set(field.key, field.value);
  }

  const record = {};

  // Known fields are inserted in schema order.
  for (const name of KNOWN_FIELDS) {
    if (!values.has(name)) continue;
    const raw = values.get(name);
    let value;
    if (name === 'WINDOW') {
      value = parseInteger(raw, 3, 20);
    } else if (name === 'RATE') {
      value = parseInteger(raw, 0, 10);
    } else if (name === 'LIMIT') {
      value = parseInteger(raw, 1, 75);
    } else if (name === 'COLOR') {
      value = raw;
    } else {
      value = raw.split(',');
    }
    defineOwn(record, name, value);
  }

  // Retained unknown fields keep their original record order, after the
  // known fields.
  for (const field of fields) {
    if (KNOWN_SET.has(field.key)) continue;
    defineOwn(record, field.key, field.value);
  }

  for (const required of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!values.has(required)) throw invalidValue();
  }

  return record;
}

function parseRecords(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseRecords expects a string');
  }

  const n = text.length;
  const records = [];
  let i = 0;

  while (i < n) {
    // Blank lines between records carry no data; the empty document is [].
    while (i < n && (text[i] === '\n' || text[i] === '\r')) {
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
    }
    if (i >= n) break;

    const fields = [];
    let recordEnded = false;

    while (!recordEnded) {
      let key;
      let value;

      if (text[i] === '"') {
        // Whole-field quotation; "" decodes to one quote, separators,
        // equals signs, CR and LF are literal inside the quotes.
        let decoded = '';
        let j = i + 1;
        let closed = false;
        while (j < n) {
          const ch = text[j];
          if (ch === '"') {
            if (text[j + 1] === '"') {
              decoded += '"';
              j += 2;
              continue;
            }
            j += 1;
            closed = true;
            break;
          }
          decoded += ch;
          j += 1;
        }
        if (!closed) throw invalidFormat();
        if (j < n && text[j] !== ';' && text[j] !== '\r' && text[j] !== '\n') {
          throw invalidFormat();
        }
        i = j;

        const eq = decoded.indexOf('=');
        if (eq === -1) throw invalidFormat();
        key = decoded.slice(0, eq);
        value = decoded.slice(eq + 1);
      } else {
        let j = i;
        while (j < n && text[j] !== ';' && text[j] !== '\r' && text[j] !== '\n') {
          if (text[j] === '"') throw invalidFormat();
          j += 1;
        }
        const raw = text.slice(i, j);
        i = j;

        const eq = raw.indexOf('=');
        if (eq === -1) throw invalidFormat();
        if (raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();
        key = raw.slice(0, eq);
        value = raw.slice(eq + 1);
      }

      if (!KEY_RE.test(key)) throw invalidFormat();
      if (value !== value.trim()) throw invalidFormat();
      for (const field of fields) {
        if (field.key === key) throw invalidFormat();
      }
      fields.push({ key, value });

      if (i >= n) {
        recordEnded = true;
        break;
      }

      const ch = text[i];
      if (ch === ';') {
        i += 1;
        // A separator must be followed by another field in the same record.
        if (i >= n) throw invalidFormat();
        const next = text[i];
        if (next === ';' || next === '\r' || next === '\n') throw invalidFormat();
        continue;
      }

      // CR / LF terminates the record.
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      recordEnded = true;
    }

    records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { parseRecords };
