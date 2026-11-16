'use strict';

/*
 * Separated key/value records decoder (see FORMAT.md).
 *
 * Contract:
 *  - string input; "" -> []
 *  - records end at LF, CRLF or CR (CR/LF inside quotes is literal data)
 *  - fields separated by literal '|'; each record has >= 1 field
 *  - a field decodes to KEY=VALUE, KEY ~ /^[A-Z][A-Z0-9_]*$/
 *  - a whole field may be double quoted (key/value text included); inside
 *    quotes "" decodes to one quote, and separators, '=', CR and LF are data
 *  - nothing may follow a closing quote except '|' or a record ending
 *  - VALUE must already equal its trimmed form
 *  - syntax / duplicate-key / whitespace problems => Error('INVALID_FORMAT')
 *    and are detected while parsing, before semantic problems of the record
 *  - missing or out-of-range required fields => Error('INVALID_VALUE')
 *  - output: array of ordinary own-key objects in record order; insertion
 *    order is schema order, then retained unknown fields in field order
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

// Recognized (known) fields. DURATION is the only documented optional field.
const KNOWN_KEYS = new Set(['WINDOW', 'RATE', 'LIMIT', 'DURATION']);
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];

const invalidFormat = () => new Error('INVALID_FORMAT');
const invalidValue = () => new Error('INVALID_VALUE');

/**
 * Split a decoded field body into key/value.
 * A wholly quoted field may carry extra literal '=' inside its value;
 * an unquoted field must contain exactly one '='.
 */
function splitField(body, quoted) {
  const idx = body.indexOf('=');
  if (idx < 0) throw invalidFormat();
  if (!quoted && body.indexOf('=', idx + 1) >= 0) throw invalidFormat();
  return { key: body.slice(0, idx), value: body.slice(idx + 1) };
}

function canonicalUint(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) throw invalidValue();
  const n = Number(value);
  if (n < min || n > max) throw invalidValue();
  return n;
}

function decimalInt(value, min, max) {
  if (!DECIMAL_INT_RE.test(value)) throw invalidValue();
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalidValue();
  return n;
}

/** Build one ordinary object from an ordered list of decoded fields. */
function buildRecord(fields) {
  const byKey = new Map();
  for (const f of fields) byKey.set(f.key, f.value);

  for (const key of REQUIRED) {
    if (!byKey.has(key)) throw invalidValue();
  }

  const out = {};
  const put = (key, value) => {
    // defineProperty keeps prototype-looking keys as plain own data keys and
    // never affects the result prototype.
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  put('WINDOW', canonicalUint(byKey.get('WINDOW'), 2, 50));
  put('RATE', canonicalUint(byKey.get('RATE'), 0, 20));
  put('LIMIT', canonicalUint(byKey.get('LIMIT'), 1, 50));
  if (byKey.has('DURATION')) {
    put('DURATION', decimalInt(byKey.get('DURATION'), 1, 120));
  }

  // Unknown keys keep their decoded string values in original field order.
  for (const f of fields) {
    if (KNOWN_KEYS.has(f.key)) continue;
    put(f.key, f.value);
  }

  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = [];
  let fields = [];
  let seen = new Set();
  let body = '';
  let fieldQuoted = false;
  let inQuotes = false;
  let afterQuote = false;
  let pending = false; // current record holds content not yet terminated

  const pushField = () => {
    const { key, value } = splitField(body, fieldQuoted);
    if (!KEY_RE.test(key)) throw invalidFormat();
    if (value !== value.trim()) throw invalidFormat();
    if (seen.has(key)) throw invalidFormat();
    seen.add(key);
    fields.push({ key, value });
    body = '';
    fieldQuoted = false;
    afterQuote = false;
  };

  const endRecord = () => {
    pushField();
    records.push(buildRecord(fields));
    fields = [];
    seen = new Set();
    body = '';
    fieldQuoted = false;
    afterQuote = false;
    pending = false;
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          body += '"';
          i++;
        } else {
          inQuotes = false;
          afterQuote = true;
        }
      } else {
        body += c;
      }
      continue;
    }

    if (afterQuote) {
      if (c === '|') {
        pushField();
        pending = true;
      } else if (c === '\n' || c === '\r') {
        endRecord();
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else {
        throw invalidFormat();
      }
      continue;
    }

    if (c === '"') {
      if (body !== '') throw invalidFormat(); // quote inside an unquoted field
      fieldQuoted = true;
      inQuotes = true;
      pending = true;
    } else if (c === '|') {
      pushField();
      pending = true;
    } else if (c === '\n' || c === '\r') {
      endRecord();
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else {
      body += c;
      pending = true;
    }
  }

  if (inQuotes) throw invalidFormat(); // unterminated quote
  if (pending || afterQuote || body !== '' || fields.length > 0) {
    endRecord();
  }

  return records;
}

module.exports = { decodeSeparated };
