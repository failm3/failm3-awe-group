'use strict';

// Separated key/value record parser -- see FORMAT.md.
// Exports readInput(text) as CommonJS.

// Documented schema, in insertion order for output objects.
// FORMAT.md: "Only the documented optional field is recognized" -> DURATION.
// COLOR/FLAGS are not documented fields of this format, so they are unknown keys.
const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'DURATION'];
const KNOWN_SET = new Set(KNOWN_FIELDS);

const REQUIRED_FIELDS = ['WINDOW', 'RATE', 'LIMIT'];

// Canonical unsigned decimal integers with inclusive ranges.
const CANONICAL_RANGES = {
  WINDOW: [1, 60],
  RATE: [0, 20],
  LIMIT: [1, 100],
};

// DURATION is a plain decimal integer in 1..150.
const DURATION_RANGE = [1, 150];

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INT = /^[+-]?[0-9]+$/;

function invalidFormat() {
  throw new Error('INVALID_FORMAT');
}

function invalidValue() {
  throw new Error('INVALID_VALUE');
}

// Split the text into records of decoded field text.
// Quoting is resolved here: a whole field may be wrapped in double quotes,
// `""` inside quotes decodes to one quote, and quoted content may contain
// separators, equals signs, CR and LF.
function splitRecords(text) {
  const records = [];
  const n = text.length;

  let fields = [];
  let field = '';
  // 'start'    -> beginning of a field, unquoted, nothing buffered yet
  // 'unquoted' -> buffering an unquoted field
  // 'quoted'   -> inside double quotes
  // 'after'    -> a closing quote was just consumed
  let mode = 'start';

  for (let i = 0; i < n; i++) {
    const c = text[i];

    if (mode === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          mode = 'after';
        }
      } else {
        field += c;
      }
      continue;
    }

    if (mode === 'after') {
      // Only a separator or a record ending may follow a closing quote.
      if (c === '|') {
        fields.push(field);
        field = '';
        mode = 'start';
      } else if (c === '\n' || c === '\r') {
        fields.push(field);
        records.push(fields);
        fields = [];
        field = '';
        mode = 'start';
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else {
        invalidFormat();
      }
      continue;
    }

    if (c === '"') {
      // Quotes are only legal as the opening of a whole-field quote.
      if (mode === 'unquoted') invalidFormat();
      mode = 'quoted';
      continue;
    }

    if (c === '|') {
      if (mode === 'start') invalidFormat(); // empty field
      fields.push(field);
      field = '';
      mode = 'start';
      continue;
    }

    if (c === '\n' || c === '\r') {
      if (mode === 'start') {
        // Empty record. A record terminator at the very end of the input
        // simply terminates the previous record instead of adding one.
        if (i !== n - 1) invalidFormat();
      } else {
        fields.push(field);
        records.push(fields);
        fields = [];
        field = '';
      }
      mode = 'start';
      if (c === '\r' && text[i + 1] === '\n') i++;
      continue;
    }

    field += c;
    mode = 'unquoted';
  }

  if (mode === 'quoted') invalidFormat(); // unterminated quote

  if (mode === 'after' || mode === 'unquoted') {
    fields.push(field);
    records.push(fields);
  } else if (fields.length > 0) {
    // Text ended with a separator, i.e. a trailing empty field.
    invalidFormat();
  }

  return records;
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(fields) {
  // --- syntax, duplicate and whitespace validation (highest precedence) ---
  const entries = [];
  const seen = new Set();

  for (let f = 0; f < fields.length; f++) {
    const raw = fields[f];
    const eq = raw.indexOf('=');
    if (eq < 0) invalidFormat();
    if (raw.indexOf('=', eq + 1) !== -1) invalidFormat();

    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);

    if (!KEY_PATTERN.test(key)) invalidFormat();
    if (value !== value.trim()) invalidFormat();
    if (seen.has(key)) invalidFormat();

    seen.add(key);
    entries.push([key, value]);
  }

  const values = new Map(entries);

  // --- semantics ---
  for (let i = 0; i < REQUIRED_FIELDS.length; i++) {
    const key = REQUIRED_FIELDS[i];
    if (!values.has(key)) invalidValue();
    const raw = values.get(key);
    if (!CANONICAL_UINT.test(raw)) invalidValue();
    const num = Number(raw);
    const range = CANONICAL_RANGES[key];
    if (!(num >= range[0] && num <= range[1])) invalidValue();
  }

  if (values.has('DURATION')) {
    const raw = values.get('DURATION');
    if (!DECIMAL_INT.test(raw)) invalidValue();
    const num = Number(raw);
    if (!(num >= DURATION_RANGE[0] && num <= DURATION_RANGE[1])) invalidValue();
  }

  // --- assembly: known fields in schema order, then retained unknowns ---
  const out = {};
  for (let i = 0; i < KNOWN_FIELDS.length; i++) {
    const key = KNOWN_FIELDS[i];
    if (!values.has(key)) continue;
    defineOwn(out, key, Number(values.get(key)));
  }

  for (let i = 0; i < entries.length; i++) {
    const key = entries[i][0];
    if (KNOWN_SET.has(key)) continue;
    defineOwn(out, key, entries[i][1]);
  }

  return out;
}

function readInput(text) {
  if (typeof text !== 'string') invalidFormat();
  if (text === '') return [];

  const records = splitRecords(text);
  const result = [];
  for (let i = 0; i < records.length; i++) {
    result.push(buildRecord(records[i]));
  }
  return result;
}

module.exports = { readInput };
