'use strict';

/*
 * Separated key/value record parser — implements FORMAT.md.
 *
 *  - UTF-8 JavaScript string input; empty string returns []
 *  - Records are separated by LF, CRLF or CR
 *  - Fields within a record are separated by a literal '|'
 *  - Each unquoted field is exactly KEY=VALUE with one equals sign
 *  - KEY matches [A-Z][A-Z0-9_]*
 *  - A whole field may be double quoted, including its key/value text; inside
 *    quotes "" decodes to one quote, and quotes may contain separators, equals
 *    signs, CR and LF. Nothing may follow a closing quote except a separator or
 *    a record ending.
 *  - VALUE must already equal its trimmed form
 *  - Unknown keys are dropped after syntax and duplicate validation
 *  - Required keys: WINDOW, RATE, LIMIT; optional: DURATION, COLOR, FLAGS
 */

const FIELD_KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

// Known-field schema order — also the output object's key insertion order.
const SCHEMA_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS'];
const REQUIRED_KEYS = ['WINDOW', 'RATE', 'LIMIT'];

// Inclusive bounds for the integer-valued known fields.
const RANGES = {
  WINDOW: [2, 30],
  RATE: [0, 20],
  LIMIT: [1, 50],
  DURATION: [1, 60]
};

const QUOTE = '"';
const SEPARATOR = '|';

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

function isRecordEnd(ch) {
  return ch === '\n' || ch === '\r';
}

/**
 * Tokenize the whole text into records of decoded fields.
 * Quoting is tracked over the full text, so a quoted field may itself contain
 * CR and LF without ending the record.
 *
 * @param {string} text
 * @returns {Array<Array<{quoted: boolean, text: string}>>}
 */
function tokenizeRecords(text) {
  const records = [];
  const n = text.length;
  let i = 0;

  while (i < n) {
    const fields = [];
    for (;;) {
      if (text[i] === QUOTE) {
        // Quoted field: a doubled quote decodes to a single quote.
        let buf = '';
        let closed = false;
        i += 1;
        while (i < n) {
          const ch = text[i];
          if (ch === QUOTE) {
            if (text[i + 1] === QUOTE) {
              buf += QUOTE;
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          buf += ch;
          i += 1;
        }
        if (!closed) {
          // Unterminated quote.
          invalidFormat();
        }
        // Only a separator or a record ending may follow a closing quote.
        if (i < n && text[i] !== SEPARATOR && !isRecordEnd(text[i])) {
          invalidFormat();
        }
        fields.push({ quoted: true, text: buf });
      } else {
        // Unquoted field: runs to the next separator or record ending.
        const start = i;
        while (i < n && text[i] !== SEPARATOR && !isRecordEnd(text[i])) {
          i += 1;
        }
        const raw = text.slice(start, i);
        if (raw.indexOf(QUOTE) !== -1) {
          // A quote inside an unquoted field is not allowed.
          invalidFormat();
        }
        fields.push({ quoted: false, text: raw });
      }

      if (i < n && text[i] === SEPARATOR) {
        i += 1;
        // A separator at end of input yields a trailing empty field, which is
        // accepted here and rejected later for having no '='.
        continue;
      }

      // Record ending (or end of input).
      if (i < n) {
        if (text[i] === '\r' && text[i + 1] === '\n') {
          i += 2;
        } else {
          i += 1;
        }
      }
      break;
    }
    records.push(fields);
  }

  return records;
}

/**
 * Split a decoded field into {key, value} and enforce key / whitespace rules.
 */
function splitKeyValue(field) {
  const text = field.text;
  const eq = text.indexOf('=');
  if (eq === -1) {
    invalidFormat();
  }
  if (!field.quoted && text.indexOf('=', eq + 1) !== -1) {
    // An unquoted field must contain exactly one equals sign.
    invalidFormat();
  }

  const key = text.slice(0, eq);
  const value = text.slice(eq + 1);

  if (!FIELD_KEY_RE.test(key)) {
    invalidFormat();
  }
  // The value must already equal its trimmed form.
  if (value !== value.trim()) {
    invalidFormat();
  }

  return { key, value };
}

/**
 * Parse a canonical unsigned decimal, or a signed decimal for DURATION.
 * Returns null when the text is not a valid integer of the required shape.
 */
function parseInteger(value, canonicalOnly) {
  if (canonicalOnly) {
    if (!CANONICAL_UINT_RE.test(value)) {
      return null;
    }
    return Number(value);
  }
  if (!DECIMAL_INT_RE.test(value)) {
    return null;
  }
  return Number(value);
}

/**
 * Parse one record (already tokenized) into an ordinary own-key object.
 */
function parseRecord(fields) {
  const seen = new Set();
  const map = new Map();

  // Phase 1 — syntax, duplicate and whitespace validation for every field.
  // These take precedence over semantic errors for the whole record.
  for (const field of fields) {
    const { key, value } = splitKeyValue(field);
    if (seen.has(key)) {
      invalidFormat();
    }
    seen.add(key);
    map.set(key, value);
  }

  // Phase 2 — required fields must be present.
  for (const key of REQUIRED_KEYS) {
    if (!map.has(key)) {
      invalidValue();
    }
  }

  // Phase 3 — build the result in schema order, dropping unknown keys.
  const out = {};
  for (const key of SCHEMA_ORDER) {
    if (!map.has(key)) {
      continue;
    }
    const raw = map.get(key);

    if (key === 'COLOR') {
      out.COLOR = raw;
      continue;
    }
    if (key === 'FLAGS') {
      out.FLAGS = raw === '' ? [] : raw.split(',');
      continue;
    }

    const num = parseInteger(raw, key !== 'DURATION');
    if (num === null) {
      invalidValue();
    }
    const bounds = RANGES[key];
    if (num < bounds[0] || num > bounds[1]) {
      invalidValue();
    }
    out[key] = num;
  }

  return out;
}

/**
 * Parse separated key/value records.
 * @param {string} text
 * @returns {Array<Object>}
 */
function parseRecords(text) {
  if (typeof text !== 'string') {
    invalidFormat();
  }
  if (text.length === 0) {
    return [];
  }

  const records = tokenizeRecords(text);
  const result = [];
  for (const fields of records) {
    result.push(parseRecord(fields));
  }
  return result;
}

module.exports = { parseRecords };
