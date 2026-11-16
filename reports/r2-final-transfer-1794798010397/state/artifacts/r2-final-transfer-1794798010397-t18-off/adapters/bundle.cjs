'use strict';

// Separated key/value record parser -- implements FORMAT.md.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

const INTEGER_FIELDS = {
  WINDOW: { min: 1, max: 50 },
  RATE: { min: 0, max: 30 },
  LIMIT: { min: 1, max: 25 },
};

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

function isTerminator(ch) {
  return ch === '\n' || ch === '\r';
}

// Length of the terminator starting at i (CRLF counts as one record ending).
function terminatorLength(text, i) {
  if (text[i] === '\r' && text[i + 1] === '\n') return 2;
  return 1;
}

// Reads the field starting at `start`.
// Returns { key, value, end } with `end` at the following ';', terminator or EOF.
function readField(text, start) {
  const n = text.length;

  if (text[start] === '"') {
    // Whole field is double quoted; "" inside decodes to one quote.
    let j = start + 1;
    let buf = '';
    for (;;) {
      if (j >= n) throw invalidFormat(); // unterminated quote
      const ch = text[j];
      if (ch === '"') {
        if (text[j + 1] === '"') {
          buf += '"';
          j += 2;
          continue;
        }
        j += 1; // closing quote
        break;
      }
      buf += ch; // separators, '=', CR and LF are legal inside quotes
      j += 1;
    }
    // Nothing but a separator or record ending may follow the closing quote.
    if (j < n && text[j] !== ';' && !isTerminator(text[j])) throw invalidFormat();

    const eq = buf.indexOf('=');
    if (eq === -1) throw invalidFormat();
    const key = buf.slice(0, eq);
    if (!KEY_RE.test(key)) throw invalidFormat();
    return { key, value: buf.slice(eq + 1), end: j };
  }

  // Unquoted field: exactly KEY=VALUE, no quotes anywhere.
  let j = start;
  while (j < n) {
    const ch = text[j];
    if (ch === ';' || ch === '\n' || ch === '\r') break;
    if (ch === '"') throw invalidFormat();
    j += 1;
  }
  const raw = text.slice(start, j);
  const eq = raw.indexOf('=');
  if (eq === -1) throw invalidFormat();
  if (raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();
  const key = raw.slice(0, eq);
  if (!KEY_RE.test(key)) throw invalidFormat();
  return { key, value: raw.slice(eq + 1), end: j };
}

function canonicalInteger(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) throw invalidValue();
  const num = Number(value);
  if (!Number.isInteger(num) || num < min || num > max) throw invalidValue();
  return num;
}

// Own, enumerable, ordinary data property -- never touches the prototype chain.
function setOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Builds one record from its decoded key/value pairs, in record order.
function buildRecord(pairs) {
  const values = new Map();
  for (const pair of pairs) {
    // Duplicate decoded keys are a syntax problem: checked first.
    if (values.has(pair.key)) throw invalidFormat();
    // Whitespace policy: trim leading/trailing whitespace of the VALUE only.
    values.set(pair.key, pair.value.trim());
  }

  for (const required of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!values.has(required)) throw invalidValue();
  }

  const record = {};
  setOwn(record, 'WINDOW', canonicalInteger(values.get('WINDOW'), INTEGER_FIELDS.WINDOW.min, INTEGER_FIELDS.WINDOW.max));
  setOwn(record, 'RATE', canonicalInteger(values.get('RATE'), INTEGER_FIELDS.RATE.min, INTEGER_FIELDS.RATE.max));
  setOwn(record, 'LIMIT', canonicalInteger(values.get('LIMIT'), INTEGER_FIELDS.LIMIT.min, INTEGER_FIELDS.LIMIT.max));

  if (values.has('COLOR')) {
    const color = values.get('COLOR');
    if (color !== 'white' && color !== 'black') throw invalidValue();
    setOwn(record, 'COLOR', color);
  }

  if (values.has('FLAGS')) {
    const flags = values.get('FLAGS');
    setOwn(
      record,
      'FLAGS',
      flags === ''
        ? []
        : flags
            .split(',')
            .map((flag) => flag.trim())
            .filter((flag) => flag !== '')
    );
  }

  // Unknown keys are dropped after syntax and duplicate validation.
  return record;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw invalidFormat();
  const n = text.length;
  const out = [];
  let i = 0;

  while (i < n) {
    // Empty records (consecutive or trailing terminators) carry no data.
    if (isTerminator(text[i])) {
      i += terminatorLength(text, i);
      continue;
    }

    const pairs = [];
    for (;;) {
      const field = readField(text, i);
      pairs.push({ key: field.key, value: field.value });
      i = field.end;
      if (i >= n) break;
      if (text[i] === ';') {
        i += 1;
        if (i >= n) throw invalidFormat(); // dangling separator
        continue;
      }
      i += terminatorLength(text, i); // record ending
      break;
    }

    out.push(buildRecord(pairs));
  }

  return out;
}

module.exports = { parseBundle };
