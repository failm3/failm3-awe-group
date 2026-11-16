'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records terminated by LF, CRLF or CR
 *  - fields separated by ';'
 *  - whole field may be double quoted, "" decodes to '"'
 *  - KEY matches [A-Z][A-Z0-9_]*
 *  - required: WINDOW, RATE, LIMIT; no optional semantic field is defined, so
 *    every other key (including COLOR/FLAGS) is an unknown string field
 *  - syntax/duplicate/whitespace problems take precedence over semantic errors
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

function fail(message) {
  throw new Error(message);
}

/** True when the character terminates a record. */
function isRecordTerminator(ch) {
  return ch === '\n' || ch === '\r';
}

/**
 * Split the document into raw records, respecting quoted regions so that
 * CR/LF (and ';') inside quotes never terminate a record.
 * Empty input yields no records; blank records (nothing between terminators)
 * carry no fields and are skipped, so a trailing terminator is harmless.
 */
function splitRecords(text) {
  const records = [];
  const n = text.length;
  let start = 0;
  let i = 0;
  let inQuotes = false;
  let atFieldStart = true;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          i += 2; // escaped quote, stay inside
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      i += 1;
      continue;
    }

    if (atFieldStart && ch === '"') {
      inQuotes = true;
      atFieldStart = false;
      i += 1;
      continue;
    }

    if (ch === ';') {
      atFieldStart = true;
      i += 1;
      continue;
    }

    if (isRecordTerminator(ch)) {
      records.push(text.slice(start, i));
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      i += 1;
      start = i;
      atFieldStart = true;
      continue;
    }

    atFieldStart = false;
    i += 1;
  }

  // Text after the last terminator is a final record unless it is empty
  // (empty input, or input ending with a record ending).
  if (start < n) records.push(text.slice(start, n));

  return records.filter((record) => record.length > 0);
}

/**
 * Split one record into decoded fields.
 * Returns an array of { text, quoted } where `text` is the quote-decoded
 * field body. Throws INVALID_FORMAT on malformed quoting.
 */
function splitFields(record) {
  const fields = [];
  const n = record.length;
  let i = 0;

  for (;;) {
    if (i < n && record[i] === '"') {
      let j = i + 1;
      let buf = '';
      let closed = false;

      while (j < n) {
        const ch = record[j];
        if (ch === '"') {
          if (record[j + 1] === '"') {
            buf += '"';
            j += 2;
            continue;
          }
          closed = true;
          j += 1;
          break;
        }
        buf += ch;
        j += 1;
      }

      if (!closed) fail(INVALID_FORMAT); // unterminated quote
      // Nothing may follow a closing quote except a separator or record end.
      if (j < n && record[j] !== ';') fail(INVALID_FORMAT);

      fields.push({ text: buf, quoted: true });
      i = j;

      if (i < n) {
        i += 1; // skip ';' and parse the next field (possibly empty at the end)
        continue;
      }
      break;
    }

    const semi = record.indexOf(';', i);
    const end = semi === -1 ? n : semi;
    const raw = record.slice(i, end);

    if (raw.indexOf('"') !== -1) fail(INVALID_FORMAT); // quotes in unquoted field
    fields.push({ text: raw, quoted: false });

    if (semi === -1) break;
    i = semi + 1;
  }

  return fields;
}

/** Parse one (already quote-decoded) field into a key/value pair. */
function parseField(field) {
  const body = field.text;
  let key;
  let value;

  if (field.quoted) {
    // Quotes may contain equals signs, so only the first one delimits.
    const eq = body.indexOf('=');
    if (eq === -1) fail(INVALID_FORMAT);
    key = body.slice(0, eq);
    value = body.slice(eq + 1);
  } else {
    const parts = body.split('=');
    if (parts.length !== 2) fail(INVALID_FORMAT); // requires exactly one '='
    key = parts[0];
    value = parts[1];
  }

  if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
  if (value !== value.trim()) fail(INVALID_FORMAT); // VALUE must already be trimmed

  return { key, value };
}

function canonicalUnsigned(value) {
  if (!CANONICAL_UINT_RE.test(value)) return null;
  return Number(value);
}

function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

const SCHEMA = ['WINDOW', 'RATE', 'LIMIT'];
const SCHEMA_SET = new Set(SCHEMA);

const INTEGER_RANGES = {
  WINDOW: [2, 60],
  RATE: [0, 10],
  LIMIT: [1, 125],
};

function buildRecord(record) {
  // ---- phase 1: syntax, duplicates, whitespace (all fields) ----
  const fields = splitFields(record);
  const seen = new Set();
  const parsed = [];

  for (const field of fields) {
    const { key, value } = parseField(field);
    if (seen.has(key)) fail(INVALID_FORMAT); // duplicate decoded key
    seen.add(key);
    parsed.push({ key, value });
  }

  // ---- phase 2: semantics ----
  const out = {};

  for (const key of SCHEMA) {
    const found = parsed.find((entry) => entry.key === key);
    if (!found) fail(INVALID_VALUE); // missing required field
    const num = canonicalUnsigned(found.value);
    const [min, max] = INTEGER_RANGES[key];
    if (num === null || num < min || num > max) fail(INVALID_VALUE);
    setOwn(out, key, num);
  }

  // ---- unknown keys, retained in original field order as strings ----
  for (const entry of parsed) {
    if (SCHEMA_SET.has(entry.key)) continue;
    setOwn(out, entry.key, entry.value);
  }

  return out;
}

function parseExport(text) {
  const records = splitRecords(text);
  return records.map(buildRecord);
}

module.exports = { parseExport };
