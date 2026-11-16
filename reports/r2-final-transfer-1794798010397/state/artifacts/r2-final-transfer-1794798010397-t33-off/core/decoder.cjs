'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records delimited by LF, CRLF or CR (but not inside double-quoted fields)
 *  - fields delimited by literal '|' (but not inside double-quoted fields)
 *  - field is KEY=VALUE, KEY matches [A-Z][A-Z0-9_]*
 *  - a whole field may be double quoted; "" inside quotes decodes to "
 *  - unknown keys are dropped after syntax/duplicate validation
 *  - output: array of ordinary own-key plain objects in record order
 */

const FORMAT_ERROR = 'INVALID_FORMAT';
const VALUE_ERROR = 'INVALID_VALUE';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT_RE = /^-?[0-9]+$/;

// Required integer fields with their inclusive ranges.
const REQUIRED_FIELDS = [
  { name: 'WINDOW', min: 1, max: 50 },
  { name: 'RATE', min: 0, max: 20 },
  { name: 'LIMIT', min: 1, max: 100 },
];

function fail(message) {
  throw new Error(message);
}

/**
 * Split text into raw record strings, honouring double-quoted sections so a
 * CR/LF inside a quoted field does not terminate the record.
 * A trailing record separator does not produce a trailing empty record.
 */
function splitRecords(text) {
  const records = [];
  let current = '';
  let i = 0;
  const n = text.length;
  let inQuotes = false;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote: stays inside the quoted section.
          current += '""';
          i += 2;
          continue;
        }
        inQuotes = false;
        current += ch;
        i += 1;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === '\r') {
      records.push(current);
      current = '';
      i += text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    if (ch === '\n') {
      records.push(current);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  if (current !== '') records.push(current);
  return records;
}

function validateKey(key) {
  if (!KEY_RE.test(key)) fail(FORMAT_ERROR);
}

function validateValueSpacing(value) {
  // VALUE must already equal its trimmed form.
  if (value !== value.trim()) fail(FORMAT_ERROR);
}

/**
 * Parse one record into a list of { key, value } pairs (values already
 * unescaped). Performs every syntactic / duplicate / whitespace check.
 */
function parseFields(record) {
  const fields = [];
  const seen = new Set();
  const n = record.length;
  let i = 0;

  const pushField = (key, value) => {
    validateKey(key);
    validateValueSpacing(value);
    if (seen.has(key)) fail(FORMAT_ERROR);
    seen.add(key);
    fields.push({ key, value });
  };

  for (;;) {
    let key;
    let value;
    let next;

    if (record[i] === '"') {
      // Whole field is quoted.
      let j = i + 1;
      let content = '';
      let closed = false;

      while (j < n) {
        if (record[j] === '"') {
          if (record[j + 1] === '"') {
            content += '"';
            j += 2;
            continue;
          }
          j += 1;
          closed = true;
          break;
        }
        content += record[j];
        j += 1;
      }

      if (!closed) fail(FORMAT_ERROR);
      // No characters may follow a closing quote except a separator or the
      // end of the record.
      if (j < n && record[j] !== '|') fail(FORMAT_ERROR);

      const eq = content.indexOf('=');
      if (eq < 0) fail(FORMAT_ERROR);
      key = content.slice(0, eq);
      value = content.slice(eq + 1);
      next = j < n ? j + 1 : n;
    } else {
      // Unquoted field: literal KEY=VALUE with exactly one equals sign.
      let j = i;
      let content = '';
      while (j < n && record[j] !== '|') {
        if (record[j] === '"') fail(FORMAT_ERROR); // quotes in unquoted fields
        content += record[j];
        j += 1;
      }
      const eq = content.indexOf('=');
      if (eq < 0) fail(FORMAT_ERROR);
      if (content.indexOf('=', eq + 1) !== -1) fail(FORMAT_ERROR);
      key = content.slice(0, eq);
      value = content.slice(eq + 1);
      next = j < n ? j + 1 : n;
    }

    pushField(key, value);
    if (next >= n) break;
    i = next;
  }

  if (fields.length === 0) fail(FORMAT_ERROR);
  return fields;
}

function parseCanonicalUInt(raw, spec) {
  if (!CANONICAL_UINT_RE.test(raw)) fail(VALUE_ERROR);
  const num = Number(raw);
  if (!Number.isInteger(num) || num < spec.min || num > spec.max) fail(VALUE_ERROR);
  return num;
}

function parseDuration(raw) {
  if (!DECIMAL_INT_RE.test(raw)) fail(VALUE_ERROR);
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1 || num > 120) fail(VALUE_ERROR);
  return num;
}

function parseFlags(raw) {
  if (raw === '') return [];
  return raw.split(',');
}

function buildRecordObject(fields) {
  const byKey = new Map();
  for (const field of fields) byKey.set(field.key, field.value);

  const out = {};

  // Semantics: syntax has already been fully validated for this record.
  for (const spec of REQUIRED_FIELDS) {
    if (!byKey.has(spec.name)) fail(VALUE_ERROR);
    out[spec.name] = parseCanonicalUInt(byKey.get(spec.name), spec);
  }

  if (byKey.has('DURATION')) out.DURATION = parseDuration(byKey.get('DURATION'));
  if (byKey.has('COLOR')) out.COLOR = byKey.get('COLOR');
  if (byKey.has('FLAGS')) out.FLAGS = parseFlags(byKey.get('FLAGS'));

  // Every remaining (unknown) key is dropped.
  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') fail(FORMAT_ERROR);
  if (text === '') return [];

  const records = splitRecords(text);
  const result = [];

  for (const record of records) {
    const fields = parseFields(record);
    result.push(buildRecordObject(fields));
  }

  return result;
}

module.exports = { decodeSeparated };
