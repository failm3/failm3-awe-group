'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(0|[1-9][0-9]*)$/;
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS'];
const INT_RANGES = {
  WINDOW: [2, 40],
  RATE: [0, 40],
  LIMIT: [1, 50],
};
const FLAG_VALUES = new Set(['cold', 'warm']);

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function isRecordEnd(ch) {
  return ch === undefined || ch === '\r' || ch === '\n';
}

// Parses one field starting at pos. Returns { key, value, pos }.
function parseField(text, pos) {
  let content;
  let quoted = false;

  if (text[pos] === '"') {
    quoted = true;
    pos++;
    let buf = '';
    for (;;) {
      if (pos >= text.length) throw formatError(); // unterminated quote
      const ch = text[pos];
      if (ch === '"') {
        if (text[pos + 1] === '"') {
          buf += '"';
          pos += 2;
        } else {
          pos++;
          break;
        }
      } else {
        buf += ch;
        pos++;
      }
    }
    // Only a separator or record ending may follow a closing quote.
    if (!(text[pos] === '|' || isRecordEnd(text[pos]))) throw formatError();
    content = buf;
  } else {
    const start = pos;
    while (pos < text.length && text[pos] !== '|' && !isRecordEnd(text[pos])) pos++;
    content = text.slice(start, pos);
    if (content.includes('"')) throw formatError();
    // Unquoted fields must contain exactly one equals sign.
    if (content.indexOf('=') !== content.lastIndexOf('=')) throw formatError();
  }

  const eq = content.indexOf('=');
  if (eq === -1) throw formatError();
  const key = content.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  const value = content.slice(eq + 1).trim();
  return { key, value, pos, quoted };
}

function parseInteger(key, raw) {
  if (!INT_RE.test(raw)) throw valueError();
  const n = Number(raw);
  const [min, max] = INT_RANGES[key];
  if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
  return n;
}

function parseFlags(raw) {
  const items = raw.split(',');
  const seen = new Set();
  for (const item of items) {
    if (!FLAG_VALUES.has(item) || seen.has(item)) throw valueError();
    seen.add(item);
  }
  return items;
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

// Semantic validation and object construction for one syntactically valid record.
function buildRecord(fields) {
  const known = new Map();
  const unknown = [];
  for (const { key, value } of fields) {
    if (KNOWN_ORDER.includes(key)) known.set(key, value);
    else unknown.push([key, value]);
  }

  const out = {};
  for (const key of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!known.has(key)) throw valueError();
    defineOwn(out, key, parseInteger(key, known.get(key)));
  }
  if (known.has('FLAGS')) defineOwn(out, 'FLAGS', parseFlags(known.get('FLAGS')));
  for (const [key, value] of unknown) defineOwn(out, key, value);
  return out;
}

function parseExport(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const records = [];
  let pos = 0;

  while (pos < text.length) {
    // Syntax pass for this record: fields, quoting, keys, duplicates.
    const fields = [];
    const seenKeys = new Set();
    for (;;) {
      const field = parseField(text, pos);
      pos = field.pos;
      if (seenKeys.has(field.key)) throw formatError();
      seenKeys.add(field.key);
      fields.push(field);
      if (text[pos] === '|') {
        pos++;
        continue;
      }
      break;
    }

    // Consume the record ending (CRLF, CR, LF, or end of input).
    if (text[pos] === '\r') {
      pos++;
      if (text[pos] === '\n') pos++;
    } else if (text[pos] === '\n') {
      pos++;
    }

    // Semantic pass only after the whole record is syntactically valid.
    records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { parseExport };
