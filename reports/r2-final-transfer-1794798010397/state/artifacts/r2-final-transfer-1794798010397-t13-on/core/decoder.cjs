'use strict';

/*
 * Separated key/value record decoder — implements FORMAT.md.
 *
 *   text   := record (TERM record)* TERM?
 *   TERM   := "\n" | "\r\n" | "\r"
 *   record := field ("|" field)*
 *   field  := quoted | unquoted
 *   quoted := '"' qchar* '"'   -- whole field, "" -> ", may hold | = CR LF
 *   unquoted := KEY "=" VALUE  -- exactly one "=", KEY = [A-Z][A-Z0-9_]*
 *
 * Errors are raised while each record is parsed, so a record's syntax /
 * duplicate / whitespace problems take precedence over its semantic ones,
 * and record N's problems are reported before record N+1 is looked at.
 */

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INTEGER = /^[+-]?[0-9]+$/;

const REQUIRED_FIELDS = [
  { name: 'WINDOW', min: 2, max: 50, pattern: CANONICAL_UNSIGNED },
  { name: 'RATE', min: 0, max: 20, pattern: CANONICAL_UNSIGNED },
  { name: 'LIMIT', min: 1, max: 50, pattern: CANONICAL_UNSIGNED },
];

// The only documented optional field.
const OPTIONAL_FIELDS = [
  { name: 'DURATION', min: 1, max: 120, pattern: DECIMAL_INTEGER },
];

const KNOWN_FIELDS = new Set(
  REQUIRED_FIELDS.concat(OPTIONAL_FIELDS).map((field) => field.name)
);

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

function failFormat() {
  throw new Error(INVALID_FORMAT);
}

function failValue() {
  throw new Error(INVALID_VALUE);
}

function defineOwn(target, key, value) {
  // defineProperty keeps "__proto__" and friends as plain own data properties.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Lazily splits `text` into raw records. Each yielded record is an array of
 * `{ content, quoted }` where `content` is the decoded field text.
 */
function* tokenize(text) {
  const length = text.length;
  let index = 0;

  while (index < length) {
    const fields = [];
    let finished = false;

    while (!finished) {
      if (text[index] === '"') {
        // ---- quoted field: the whole field, key and value, is inside ----
        index += 1;
        let buffer = '';
        let closed = false;

        while (index < length) {
          const ch = text[index];
          if (ch === '"') {
            if (text[index + 1] === '"') {
              buffer += '"';
              index += 2;
              continue;
            }
            index += 1;
            closed = true;
            break;
          }
          // Quotes may contain separators, equals signs, CR and LF.
          buffer += ch;
          index += 1;
        }

        if (!closed) failFormat();

        if (index >= length) {
          finished = true;
        } else if (text[index] === '|') {
          index += 1;
        } else if (text[index] === '\n') {
          index += 1;
          finished = true;
        } else if (text[index] === '\r') {
          index += 1;
          if (text[index] === '\n') index += 1;
          finished = true;
        } else {
          // No characters may follow a closing quote except separator/ending.
          failFormat();
        }

        fields.push({ content: buffer, quoted: true });
      } else {
        // ---- unquoted field ----
        let buffer = '';

        while (index < length) {
          const ch = text[index];
          if (ch === '|' || ch === '\n' || ch === '\r') break;
          if (ch === '"') failFormat(); // quotes in unquoted fields
          buffer += ch;
          index += 1;
        }

        if (index >= length) {
          finished = true;
        } else if (text[index] === '|') {
          index += 1;
        } else if (text[index] === '\n') {
          index += 1;
          finished = true;
        } else {
          index += 1;
          if (text[index] === '\n') index += 1; // CRLF
          finished = true;
        }

        fields.push({ content: buffer, quoted: false });
      }
    }

    yield fields;
  }
}

function splitField(field) {
  const { content, quoted } = field;
  const equals = content.indexOf('=');

  if (equals < 0) failFormat();

  const key = content.slice(0, equals);
  const value = content.slice(equals + 1);

  if (!KEY_PATTERN.test(key)) failFormat();
  // Unquoted fields must be exactly KEY=VALUE: one equals sign.
  if (!quoted && value.indexOf('=') !== -1) failFormat();

  return { key, value };
}

function buildRecord(fields) {
  const entries = [];
  const seen = new Set();

  // Pass 1: syntax, duplicates and whitespace (takes precedence over semantics).
  for (const field of fields) {
    const { key, value } = splitField(field);

    if (value !== value.trim()) failFormat();
    if (seen.has(key)) failFormat();
    seen.add(key);

    entries.push({ key, value });
  }

  // Pass 2: semantics. Required fields, in schema order.
  const values = new Map(entries.map((entry) => [entry.key, entry.value]));
  const record = {};

  for (const spec of REQUIRED_FIELDS) {
    const raw = values.get(spec.name);
    if (raw === undefined) failValue();
    if (!spec.pattern.test(raw)) failValue();
    const number = Number(raw);
    if (!Number.isFinite(number) || number < spec.min || number > spec.max) failValue();
    defineOwn(record, spec.name, number);
  }

  // Documented optional fields, in schema order.
  for (const spec of OPTIONAL_FIELDS) {
    const raw = values.get(spec.name);
    if (raw === undefined) continue;
    if (!spec.pattern.test(raw)) failValue();
    const number = Number(raw);
    if (!Number.isFinite(number) || number < spec.min || number > spec.max) failValue();
    defineOwn(record, spec.name, number);
  }

  // Unknown keys: decoded string values, original field order, after known ones.
  for (const entry of entries) {
    if (KNOWN_FIELDS.has(entry.key)) continue;
    defineOwn(record, entry.key, entry.value);
  }

  return record;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') failFormat();
  if (text === '') return [];

  const result = [];
  // Each record is fully parsed and validated before the next is read.
  for (const fields of tokenize(text)) {
    result.push(buildRecord(fields));
  }
  return result;
}

module.exports = { decodeSeparated };
