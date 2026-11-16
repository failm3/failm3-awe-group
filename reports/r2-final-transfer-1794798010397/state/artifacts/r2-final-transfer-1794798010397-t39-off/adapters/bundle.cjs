'use strict';

/**
 * Separated key/value record parser (see FORMAT.md).
 *
 * Records are separated by LF, CRLF or CR. Fields inside a record are
 * separated by a literal '|'. A whole field may be double quoted, in which
 * case the quotes wrap the entire "KEY=VALUE" text; inside quotes a doubled
 * quote decodes to a single quote and separators, equals signs, CR and LF have
 * no special meaning.
 */

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
const QUOTED_FIELD = /^([A-Z][A-Z0-9_]*)=([\s\S]*)$/;
const UNQUOTED_FIELD = /^([A-Z][A-Z0-9_]*)=([^=]*)$/;
const FLAG_VALUES = new Set(['alpha', 'beta']);

// Schema order of the recognized fields (insertion order of result objects).
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS'];

const INTEGER_FIELDS = [
  ['WINDOW', 1, 60],
  ['RATE', 0, 40],
  ['LIMIT', 1, 100]
];

function fail(message) {
  throw new Error(message);
}

/**
 * Split the whole text into records of raw fields.
 * Each raw field is { quoted, text } where `text` is the decoded payload (for
 * quoted fields the surrounding quotes are removed and doubled quotes
 * collapsed; for unquoted fields the literal slice).
 */
function splitRecords(text) {
  const records = [];
  const length = text.length;
  let index = 0;

  while (true) {
    const fields = [];
    let finished = false;

    while (!finished) {
      if (index < length && text[index] === '"') {
        // Quoted field: the quotes enclose the whole KEY=VALUE text.
        index += 1;
        let payload = '';
        let closed = false;
        while (index < length) {
          const ch = text[index];
          if (ch === '"') {
            if (index + 1 < length && text[index + 1] === '"') {
              payload += '"';
              index += 2;
              continue;
            }
            index += 1;
            closed = true;
            break;
          }
          payload += ch;
          index += 1;
        }
        if (!closed) fail(INVALID_FORMAT);
        if (index < length) {
          const next = text[index];
          if (next !== '|' && next !== '\r' && next !== '\n') {
            fail(INVALID_FORMAT); // characters after a closing quote
          }
        }
        fields.push({ quoted: true, text: payload });
      } else {
        // Unquoted field: runs until a separator or a record ending.
        const start = index;
        while (index < length) {
          const ch = text[index];
          if (ch === '|' || ch === '\r' || ch === '\n') break;
          if (ch === '"') fail(INVALID_FORMAT); // quotes in unquoted field
          index += 1;
        }
        fields.push({ quoted: false, text: text.slice(start, index) });
      }

      if (index >= length) {
        finished = true;
        break;
      }

      const ch = text[index];
      if (ch === '|') {
        index += 1; // next field of the same record
        continue;
      }

      // Record terminator: CRLF, LF or CR.
      if (ch === '\r') {
        index += 1;
        if (index < length && text[index] === '\n') index += 1;
      } else {
        index += 1;
      }
      finished = true;
    }

    records.push(fields);
    if (index >= length) break;
  }

  return records;
}

function parseRecord(rawFields) {
  const decoded = [];
  const seen = new Set();

  for (const field of rawFields) {
    const match = (field.quoted ? QUOTED_FIELD : UNQUOTED_FIELD).exec(field.text);
    if (!match) fail(INVALID_FORMAT);
    const key = match[1];
    if (seen.has(key)) fail(INVALID_FORMAT); // duplicate decoded key
    seen.add(key);
    decoded.push({ key, value: match[2].trim() });
  }

  const values = new Map();
  for (const entry of decoded) values.set(entry.key, entry.value);

  // Required canonical unsigned integer fields, in range.
  const numbers = new Map();
  for (const [name, min, max] of INTEGER_FIELDS) {
    if (!values.has(name)) fail(INVALID_VALUE);
    const raw = values.get(name);
    if (!CANONICAL_UINT.test(raw)) fail(INVALID_VALUE);
    const num = Number(raw);
    if (!Number.isSafeInteger(num) || num < min || num > max) fail(INVALID_VALUE);
    numbers.set(name, num);
  }

  // Optional FLAGS field.
  let flags = null;
  if (values.has('FLAGS')) {
    const parts = values.get('FLAGS').split(',');
    const flagSeen = new Set();
    for (const part of parts) {
      if (!FLAG_VALUES.has(part)) fail(INVALID_VALUE);
      if (flagSeen.has(part)) fail(INVALID_VALUE);
      flagSeen.add(part);
    }
    flags = parts;
  }

  // Ordinary own-key object: known fields in schema order, then decoded
  // unknown fields in original field order. defineProperty keeps keys such as
  // '__proto__' as plain data without touching the prototype.
  const result = {};
  const define = (key, value) => {
    Object.defineProperty(result, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true
    });
  };

  define('WINDOW', numbers.get('WINDOW'));
  define('RATE', numbers.get('RATE'));
  define('LIMIT', numbers.get('LIMIT'));
  if (flags !== null) define('FLAGS', flags);

  for (const entry of decoded) {
    if (KNOWN_ORDER.includes(entry.key)) continue;
    define(entry.key, entry.value);
  }

  return result;
}

function parseBundle(text) {
  if (text === '') return [];
  return splitRecords(text).map(parseRecord);
}

module.exports = { parseBundle };
