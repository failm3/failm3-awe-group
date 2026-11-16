'use strict';

// Separate key/value records.
// Implements FORMAT.md:
//   - records separated by LF, CRLF or CR
//   - fields separated by ';', whole field optionally double quoted
//   - inside quotes "" decodes to one '"'; quotes may hold ';', '=', CR and LF
//   - unquoted field is KEY=VALUE with exactly one '=' and KEY=[A-Z][A-Z0-9_]*
//   - only VALUE is whitespace trimmed
//   - errors: INVALID_FORMAT (syntax/duplicates), INVALID_VALUE (semantics/literals)

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
const QUOTE = 0x22; // '"'

const KNOWN_FIELDS = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];

const INT_LIMITS = {
  WINDOW: [2, 20],
  RATE: [0, 30],
  LIMIT: [1, 125]
};

const COLORS = ['red', 'blue'];

function failFormat() {
  throw new Error('INVALID_FORMAT');
}

function failValue() {
  throw new Error('INVALID_VALUE');
}

// Decode the inside of a whole-field quoted token: every '""' pair becomes '"'.
function decodeQuoted(raw) {
  let out = '';
  const body = raw.slice(1, -1);
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    if (ch === '"') {
      if (body.charAt(i + 1) !== '"') failFormat();
      out += '"';
      i += 1;
    } else {
      out += ch;
    }
  }
  return out;
}

// Turn one raw (still quoted-or-not) field token into { key, value }.
function parseField(raw) {
  let decoded;
  let quoted = false;

  if (raw.charCodeAt(0) === QUOTE) {
    quoted = true;
    decoded = decodeQuoted(raw);
  } else {
    if (raw.indexOf('"') !== -1) failFormat();
    decoded = raw;
  }

  const eq = decoded.indexOf('=');
  if (eq < 0) failFormat();

  // An unquoted field must be exactly KEY=VALUE: one equals sign only.
  if (!quoted && decoded.indexOf('=', eq + 1) !== -1) failFormat();

  const key = decoded.slice(0, eq);
  if (!KEY_PATTERN.test(key)) failFormat();

  return { key, value: decoded.slice(eq + 1).trim() };
}

// Split the whole input into records of raw field tokens, honouring quoting.
function splitRecords(text) {
  const records = [];
  let fields = [];
  let raw = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  function endRecord() {
    if (fields.length === 0 && raw === '') return; // blank line: no record
    fields.push(raw);
    records.push(fields);
    fields = [];
    raw = '';
  }

  while (i < n) {
    const ch = text.charAt(i);

    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          raw += '""';
          i += 2;
          continue;
        }
        // closing quote: only a separator or the record end may follow
        inQuotes = false;
        raw += '"';
        i += 1;
        const next = i < n ? text.charAt(i) : '';
        if (next !== '' && next !== ';' && next !== '\n' && next !== '\r') failFormat();
        continue;
      }
      raw += ch; // quotes may contain ';', '=', CR and LF
      i += 1;
      continue;
    }

    if (ch === '"') {
      if (raw !== '') failFormat(); // quote inside an unquoted field
      inQuotes = true;
      raw = '"';
      i += 1;
      continue;
    }

    if (ch === ';') {
      fields.push(raw);
      raw = '';
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && text.charAt(i + 1) === '\n' ? 2 : 1;
      continue;
    }

    raw += ch;
    i += 1;
  }

  if (inQuotes) failFormat(); // unterminated quote
  if (fields.length > 0 || raw !== '') {
    fields.push(raw);
    records.push(fields);
  }

  return records;
}

function buildRecord(rawFields) {
  // 1. Syntax + duplicate validation (INVALID_FORMAT), whitespace trimmed here.
  const values = new Map();
  for (let i = 0; i < rawFields.length; i += 1) {
    const { key, value } = parseField(rawFields[i]);
    if (values.has(key)) failFormat();
    values.set(key, value);
  }

  // 2. Semantics (INVALID_VALUE).
  const numbers = Object.create(null);
  for (const name of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!values.has(name)) failValue();
    const raw = values.get(name);
    if (!CANONICAL_UINT.test(raw)) failValue();
    const value = Number(raw);
    const [min, max] = INT_LIMITS[name];
    if (value < min || value > max) failValue();
    numbers[name] = value;
  }

  let color;
  if (values.has('COLOR')) {
    color = values.get('COLOR');
    if (COLORS.indexOf(color) === -1) failValue();
  }

  let flags;
  const hasFlags = values.has('FLAGS');
  if (hasFlags) {
    const raw = values.get('FLAGS');
    flags = raw === '' ? [] : raw.split(',');
  }

  // 3. Output in known-field schema order; unknown keys are dropped.
  const record = {};
  record.WINDOW = numbers.WINDOW;
  record.RATE = numbers.RATE;
  record.LIMIT = numbers.LIMIT;
  if (color !== undefined) record.COLOR = color;
  if (hasFlags) record.FLAGS = flags;
  return record;
}

function readInput(text) {
  if (typeof text !== 'string') failFormat();
  const records = splitRecords(text);
  const out = [];
  for (let i = 0; i < records.length; i += 1) {
    out.push(buildRecord(records[i]));
  }
  return out;
}

module.exports = { readInput };
module.exports.readInput = readInput;
