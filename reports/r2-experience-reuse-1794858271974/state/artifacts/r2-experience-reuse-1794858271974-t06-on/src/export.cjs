'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

const INTEGER_FIELDS = {
  WINDOW: [1, 30],
  RATE: [0, 30],
  LIMIT: [1, 25],
};
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const COLOR_VALUES = ['green', 'amber'];
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR'];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Yields records one at a time as arrays of { text, quoted } raw fields,
// so each record is fully validated before the next one is lexed.
function* lexRecords(text) {
  let i = 0;
  const n = text.length;
  while (i < n) {
    const fields = [];
    let ended = false;
    while (!ended) {
      let value = '';
      let quoted = false;
      if (text[i] === '"') {
        quoted = true;
        i++;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
            } else {
              i++;
              closed = true;
              break;
            }
          } else {
            value += c;
            i++;
          }
        }
        if (!closed) throw formatError();
        // Only a separator or record ending may follow a closing quote.
        if (i < n && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') {
          throw formatError();
        }
      } else {
        while (i < n) {
          const c = text[i];
          if (c === ';' || c === '\n' || c === '\r') break;
          if (c === '"') throw formatError();
          value += c;
          i++;
        }
      }
      fields.push({ text: value, quoted });

      if (i >= n) {
        ended = true;
      } else if (text[i] === ';') {
        i++;
      } else {
        // Record ending: LF, CRLF or CR. A final terminator does not start a new record.
        if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
        else i++;
        ended = true;
      }
    }
    yield fields;
  }
}

function splitField(field) {
  const s = field.text;
  const eq = s.indexOf('=');
  if (eq === -1) throw formatError();
  if (!field.quoted && s.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = s.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return [key, s.slice(eq + 1).trim()];
}

function parseInteger(raw, [min, max]) {
  if (!UINT_RE.test(raw)) throw valueError();
  const num = Number(raw);
  if (num < min || num > max) throw valueError();
  return num;
}

function defineData(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(fields) {
  // Syntax and duplicate checks for the whole record come first.
  const entries = new Map();
  for (const field of fields) {
    const [key, value] = splitField(field);
    if (entries.has(key)) throw formatError();
    entries.set(key, value);
  }

  // Semantic checks.
  for (const key of REQUIRED) {
    if (!entries.has(key)) throw valueError();
  }
  const known = {};
  for (const key of Object.keys(INTEGER_FIELDS)) {
    known[key] = parseInteger(entries.get(key), INTEGER_FIELDS[key]);
  }
  if (entries.has('COLOR')) {
    const color = entries.get('COLOR');
    if (!COLOR_VALUES.includes(color)) throw valueError();
    known.COLOR = color;
  }

  const record = {};
  for (const key of KNOWN_ORDER) {
    if (Object.prototype.hasOwnProperty.call(known, key)) defineData(record, key, known[key]);
  }
  for (const [key, value] of entries) {
    if (!KNOWN_ORDER.includes(key)) defineData(record, key, value);
  }
  return record;
}

function parseExport(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];
  const out = [];
  for (const fields of lexRecords(text)) {
    out.push(buildRecord(fields));
  }
  return out;
}

module.exports = { parseExport };
