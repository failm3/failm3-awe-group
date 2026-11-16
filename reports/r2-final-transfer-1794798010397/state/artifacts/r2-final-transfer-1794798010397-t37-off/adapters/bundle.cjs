'use strict';

/*
 * Separated key/value record parser (see FORMAT.md).
 *
 * Grammar summary implemented here:
 *   - records are terminated by LF, CRLF or CR (a single trailing terminator
 *     does not create an extra, empty record)
 *   - fields are separated by a literal '|'
 *   - a field is either KEY=VALUE (one '=' only, KEY ~ [A-Z][A-Z0-9_]*) or the
 *     same text wrapped entirely in double quotes, where "" decodes to '"'
 *   - no characters may follow a closing quote except '|' or end of record
 *   - VALUE must already equal its trimmed form
 *   - duplicate decoded keys are rejected
 */

const FORMAT_ERROR = 'INVALID_FORMAT';
const VALUE_ERROR = 'INVALID_VALUE';

const FIELD_KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS'];
const KNOWN_KEYS = new Set(KNOWN_ORDER);

const RANGES = {
  WINDOW: [2, 40],
  RATE: [0, 20],
  LIMIT: [1, 50],
};

const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];

function invalidFormat() {
  throw new Error(FORMAT_ERROR);
}

function invalidValue() {
  throw new Error(VALUE_ERROR);
}

/** Define an own, enumerable data property (safe for prototype-looking keys). */
function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value: value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Split the document into raw record strings. Newlines inside a quoted section
 * are part of the field content, so the scan tracks quoting.
 */
function splitRecords(text) {
  const records = [];
  let current = '';
  let inQuote = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const c = text[i];

    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          current += '""';
          i += 2;
          continue;
        }
        inQuote = false;
        current += c;
        i += 1;
        continue;
      }
      current += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuote = true;
      current += c;
      i += 1;
      continue;
    }

    if (c === '\r') {
      if (text[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      records.push(current);
      current = '';
      continue;
    }

    if (c === '\n') {
      i += 1;
      records.push(current);
      current = '';
      continue;
    }

    current += c;
    i += 1;
  }

  if (inQuote) {
    // Unterminated quoted field.
    invalidFormat();
  }

  // A trailing terminator ends the last record; it does not open a new one.
  if (current !== '') {
    records.push(current);
  }

  return records;
}

/**
 * Split one record into decoded fields: [{ text, quoted }, ...].
 * Throws INVALID_FORMAT on any quoting problem.
 */
function splitFields(record) {
  const fields = [];
  const n = record.length;
  let i = 0;

  for (;;) {
    let text = '';
    let quoted = false;

    if (i < n && record[i] === '"') {
      quoted = true;
      i += 1;
      let closed = false;
      while (i < n) {
        const c = record[i];
        if (c === '"') {
          if (record[i + 1] === '"') {
            text += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        text += c;
        i += 1;
      }
      if (!closed) {
        invalidFormat(); // unterminated quote
      }
      if (i < n && record[i] !== '|') {
        invalidFormat(); // stray characters after the closing quote
      }
    } else {
      while (i < n && record[i] !== '|') {
        if (record[i] === '"') {
          invalidFormat(); // quotes are not allowed in unquoted fields
        }
        text += record[i];
        i += 1;
      }
    }

    fields.push({ text: text, quoted: quoted });

    if (i < n && record[i] === '|') {
      i += 1;
      continue;
    }
    break;
  }

  return fields;
}

/** Parse one record into an ordered map of decoded key -> raw value string. */
function parseRecord(record) {
  const fields = splitFields(record);
  const values = new Map();

  for (const field of fields) {
    const text = field.text;

    // Exactly one '=' separates KEY from VALUE.
    const eq = text.indexOf('=');
    if (eq === -1 || text.indexOf('=', eq + 1) !== -1) {
      invalidFormat();
    }

    const key = text.slice(0, eq);
    const value = text.slice(eq + 1);

    if (!FIELD_KEY_RE.test(key)) {
      invalidFormat(); // bad key
    }
    if (value !== value.trim()) {
      invalidFormat(); // whitespace must already be trimmed
    }
    if (values.has(key)) {
      invalidFormat(); // duplicate decoded key
    }

    values.set(key, value);
  }

  return values;
}

function toBoundedInt(value, canonical, min, max) {
  const re = canonical ? CANONICAL_UINT_RE : DECIMAL_INT_RE;
  if (!re.test(value)) {
    invalidValue();
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    invalidValue();
  }
  return num;
}

function toFlags(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function buildObject(values) {
  // Semantic validation happens only after the whole record is syntactically
  // clean, so syntax/duplicate/whitespace problems win.
  for (const key of REQUIRED) {
    if (!values.has(key)) {
      invalidValue();
    }
  }

  const converted = new Map();

  for (const key of KNOWN_ORDER) {
    if (!values.has(key)) {
      continue;
    }
    const raw = values.get(key);
    if (key === 'COLOR') {
      converted.set(key, raw);
    } else if (key === 'FLAGS') {
      converted.set(key, toFlags(raw));
    } else {
      const range = RANGES[key];
      if (range) {
        converted.set(key, toBoundedInt(raw, true, range[0], range[1]));
      } else {
        // DURATION: plain decimal integer, 1..90.
        converted.set(key, toBoundedInt(raw, false, 1, 90));
      }
    }
  }

  const result = {};

  // Known fields first, in schema order.
  for (const key of KNOWN_ORDER) {
    if (converted.has(key)) {
      setOwn(result, key, converted.get(key));
    }
  }

  // Then retained unknown fields, in original record field order.
  for (const entry of values) {
    const key = entry[0];
    if (!KNOWN_KEYS.has(key)) {
      setOwn(result, key, entry[1]);
    }
  }

  return result;
}

function parseBundle(text) {
  if (typeof text !== 'string') {
    invalidFormat();
  }
  if (text.length === 0) {
    return [];
  }

  const records = splitRecords(text);
  const out = [];

  for (const record of records) {
    if (record.length === 0) {
      invalidFormat(); // a record must contain at least one field
    }
    out.push(buildObject(parseRecord(record)));
  }

  return out;
}

module.exports = { parseBundle };
