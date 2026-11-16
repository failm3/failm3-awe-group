'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR (separators inside quotes are data)
 *  - fields separated by literal ';'
 *  - unquoted field: exactly KEY=VALUE with a single '='; KEY is [A-Z][A-Z0-9_]*
 *  - a whole field may be double quoted; "" inside quotes decodes to one '"'
 *  - nothing may follow a closing quote except ';', a record ending or EOF
 *  - VALUE must equal its trimmed form
 *  - duplicate decoded keys in a record are invalid
 *  - required WINDOW/RATE/LIMIT; COLOR is a string; FLAGS is an array
 *  - unknown keys are retained as strings after the known fields
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Recognized fields, in output (schema) order.
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const REQUIRED_FIELDS = ['WINDOW', 'RATE', 'LIMIT'];
const INTEGER_BOUNDS = {
  WINDOW: { min: 2, max: 50 },
  RATE: { min: 0, max: 10 },
  LIMIT: { min: 1, max: 125 },
};

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

function isKnownField(key) {
  for (let i = 0; i < KNOWN_FIELDS.length; i += 1) {
    if (KNOWN_FIELDS[i] === key) return true;
  }
  return false;
}

/**
 * Split the raw text into records of fields.
 * Quoting is resolved here: each returned field is { text, quoted } where text
 * is the decoded field content (surrounding quotes removed, "" unescaped) and
 * quoted records whether the whole-field quoted form was used.
 */
function splitRecords(text) {
  const records = [];
  let record = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (ch === '"') {
      // Whole-field quoted form.
      let decoded = '';
      let closed = false;
      i += 1; // opening quote
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            decoded += '"';
            i += 2;
            continue;
          }
          i += 1;
          closed = true;
          break;
        }
        decoded += c;
        i += 1;
      }
      if (!closed) invalidFormat(); // unterminated quote

      if (i >= n) {
        // EOF right after the closing quote ends the record.
        record.push({ text: decoded, quoted: true });
        break;
      }

      const next = text[i];
      if (next === ';') {
        record.push({ text: decoded, quoted: true });
        i += 1;
        continue;
      }
      if (next === '\r' || next === '\n') {
        record.push({ text: decoded, quoted: true });
        i += next === '\r' && text[i + 1] === '\n' ? 2 : 1;
        records.push(record);
        record = [];
        continue;
      }
      invalidFormat(); // trailing characters after a closing quote
    }

    // Unquoted field: everything up to ';' or a record ending.
    let raw = '';
    let stop = null;
    while (i < n) {
      const c = text[i];
      if (c === '"') invalidFormat(); // quotes are not allowed in unquoted fields
      if (c === ';') {
        stop = 'field';
        break;
      }
      if (c === '\r' || c === '\n') {
        stop = 'record';
        break;
      }
      raw += c;
      i += 1;
    }

    record.push({ text: raw, quoted: false });
    if (stop === 'field') {
      i += 1;
      continue;
    }
    if (stop === 'record') {
      i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
      records.push(record);
      record = [];
      continue;
    }
    break; // EOF terminates the final record
  }

  if (record.length > 0) records.push(record);
  return records;
}

/**
 * Decode a single field into { key, value }.
 * Enforces: one '=' in unquoted fields, valid key, trimmed value.
 * A quoted field may carry additional '=' inside its value.
 */
function decodeField(field) {
  const eq = field.text.indexOf('=');
  if (eq === -1) invalidFormat();
  // "one equals sign" is required of unquoted fields only; quotes may contain '='.
  if (!field.quoted && field.text.indexOf('=', eq + 1) !== -1) invalidFormat();

  const key = field.text.slice(0, eq);
  const value = field.text.slice(eq + 1);

  if (!KEY_RE.test(key)) invalidFormat(); // bad key
  if (value !== value.trim()) invalidFormat(); // untrimmed value
  return { key, value };
}

function setOwn(target, key, value) {
  // defineProperty keeps prototype-looking keys (e.g. "__proto__") as plain data.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function convertFlags(value) {
  if (value === '') return [];
  const parts = value.split(',');
  const flags = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i].trim();
    if (part !== '') flags.push(part);
  }
  return flags;
}

function readInput(text) {
  if (text === '') return [];
  const records = splitRecords(text);

  const result = [];

  for (let r = 0; r < records.length; r += 1) {
    const rawFields = records[r];
    if (rawFields.length === 0) invalidFormat(); // a record needs one or more fields

    // Phase 1 — syntax, whitespace and duplicate detection for this record.
    const pairs = [];
    const seen = Object.create(null);
    for (let f = 0; f < rawFields.length; f += 1) {
      const { key, value } = decodeField(rawFields[f]);
      if (seen[key] === true) invalidFormat(); // duplicate decoded key
      seen[key] = true;
      pairs.push({ key, value });
    }

    // Phase 2 — semantics for this record.
    const values = Object.create(null);
    for (let p = 0; p < pairs.length; p += 1) {
      values[pairs[p].key] = pairs[p].value;
    }

    for (let k = 0; k < REQUIRED_FIELDS.length; k += 1) {
      const key = REQUIRED_FIELDS[k];
      if (!(key in values)) invalidValue();
      const raw = values[key];
      if (!CANONICAL_UINT_RE.test(raw)) invalidValue();
      const num = Number(raw);
      const bounds = INTEGER_BOUNDS[key];
      if (num < bounds.min || num > bounds.max) invalidValue();
    }

    // Phase 3 — build the output object in documented order.
    const out = {};
    for (let k = 0; k < KNOWN_FIELDS.length; k += 1) {
      const key = KNOWN_FIELDS[k];
      if (!(key in values)) continue;
      const raw = values[key];
      if (key in INTEGER_BOUNDS) setOwn(out, key, Number(raw));
      else if (key === 'COLOR') setOwn(out, key, raw);
      else setOwn(out, key, convertFlags(raw)); // FLAGS
    }

    // Retained unknown fields, original record field order.
    for (let p = 0; p < pairs.length; p += 1) {
      const key = pairs[p].key;
      if (isKnownField(key)) continue;
      setOwn(out, key, pairs[p].value);
    }

    result.push(out);
  }

  return result;
}

module.exports = { readInput };
