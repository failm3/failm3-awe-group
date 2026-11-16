'use strict';

/**
 * Parses the separated key/value record format described in FORMAT.md.
 *
 * Grammar recap:
 *  - Records are separated by LF, CRLF or CR (outside quotes only).
 *  - Fields inside a record are separated by a literal '|' (outside quotes only).
 *  - An unquoted field is exactly KEY=VALUE with exactly one '=' where
 *    KEY matches [A-Z][A-Z0-9_]*.
 *  - A whole field may be double quoted (including its key/value text).
 *    Inside quotes "" decodes to a single '"'. Quoted content may contain
 *    field separators, '=' and CR/LF. Nothing may follow the closing quote
 *    other than a separator or the end of the record.
 *  - Only decoded VALUEs are trimmed.
 *  - Known keys: WINDOW, RATE, LIMIT (required), FLAGS, COLOR (optional).
 *    Unknown keys are dropped after syntax/duplicate validation.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const FLAG_VALUES = ['dry', 'live'];

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

function canonicalUint(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  return Number(value);
}

function buildRecord(fields) {
  // Decode each field's KEY / VALUE and validate syntax + duplicates.
  const entries = new Map();
  for (let f = 0; f < fields.length; f++) {
    const field = fields[f];
    const raw = field.value;
    const eq = raw.indexOf('=');

    if (eq < 0) invalidFormat();
    // Unquoted fields must contain exactly one '='; quoted fields may embed
    // extra '=' characters inside the (fully quoted) field text.
    if (!field.quoted && raw.indexOf('=', eq + 1) !== -1) invalidFormat();

    const key = raw.slice(0, eq);
    if (!KEY_RE.test(key)) invalidFormat();
    if (entries.has(key)) invalidFormat();

    // Whitespace policy: trim leading/trailing whitespace from VALUE only.
    entries.set(key, raw.slice(eq + 1).trim());
  }

  // Semantic validation (after all syntax/duplicate checks for this record).
  if (!entries.has('WINDOW') || !entries.has('RATE') || !entries.has('LIMIT')) {
    invalidValue();
  }

  const windowValue = canonicalUint(entries.get('WINDOW'));
  if (windowValue === null || windowValue < 3 || windowValue > 30) invalidValue();

  const rateValue = canonicalUint(entries.get('RATE'));
  if (rateValue === null || rateValue < 0 || rateValue > 40) invalidValue();

  const limitValue = canonicalUint(entries.get('LIMIT'));
  if (limitValue === null || limitValue < 1 || limitValue > 150) invalidValue();

  let flagsValue;
  if (entries.has('FLAGS')) {
    const parts = entries.get('FLAGS').split(',');
    flagsValue = [];
    const seen = new Set();
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (FLAG_VALUES.indexOf(part) === -1) invalidValue();
      if (seen.has(part)) invalidValue();
      seen.add(part);
      flagsValue.push(part);
    }
  }

  // Known-field schema order, then (none) retained unknown field order.
  const record = {};
  record.WINDOW = windowValue;
  record.RATE = rateValue;
  record.LIMIT = limitValue;
  if (flagsValue !== undefined) record.FLAGS = flagsValue;
  if (entries.has('COLOR')) record.COLOR = entries.get('COLOR');
  return record;
}

function readInput(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];

  const out = [];
  let fields = [];
  let buffer = '';
  let started = false;
  let inQuotes = false;
  let quoteClosed = false;
  let fieldQuoted = false;

  function endField() {
    fields.push({ value: buffer, quoted: fieldQuoted });
    buffer = '';
    started = false;
    inQuotes = false;
    quoteClosed = false;
    fieldQuoted = false;
  }

  function endRecord() {
    endField();
    out.push(buildRecord(fields));
    fields = [];
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          buffer += '"';
          i++;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        buffer += ch; // separators, '=' , CR and LF are data inside quotes
      }
      continue;
    }

    if (quoteClosed) {
      // Nothing may follow the closing quote except a separator or record end.
      if (ch === '|') {
        endField();
      } else if (ch === '\n') {
        endRecord();
      } else if (ch === '\r') {
        endRecord();
        if (text[i + 1] === '\n') i++;
      } else {
        invalidFormat();
      }
      continue;
    }

    if (ch === '"') {
      if (started) invalidFormat(); // quote inside an unquoted field
      inQuotes = true;
      fieldQuoted = true;
      started = true;
    } else if (ch === '|') {
      endField();
    } else if (ch === '\n') {
      endRecord();
    } else if (ch === '\r') {
      endRecord();
      if (text[i + 1] === '\n') i++;
    } else {
      buffer += ch;
      started = true;
    }
  }

  if (inQuotes) invalidFormat(); // unterminated quote

  if (quoteClosed || started || fields.length > 0) {
    endRecord();
  }

  return out;
}

module.exports = { readInput };
