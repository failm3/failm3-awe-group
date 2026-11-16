'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const INT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields, in schema (insertion) order. Only COLOR is a recognized optional
// field; every other optional key is unknown and gets dropped.
const INTEGER_FIELDS = [
  ['WINDOW', 1, 50],
  ['RATE', 0, 30],
  ['LIMIT', 1, 25],
];
const COLOR_VALUES = ['white', 'black'];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function isRecordEnd(ch) {
  return ch === '\n' || ch === '\r';
}

// Reads one record beginning at `pos`.
// Returns { fields, next }, fields being [{ text, quoted }] in order.
function readRecord(text, pos) {
  const fields = [];
  let i = pos;

  for (;;) {
    let value = '';
    let quoted = false;

    if (text[i] === '"') {
      quoted = true;
      i += 1;
      let closed = false;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i += 1;
            closed = true;
            break;
          }
        } else {
          value += ch;
          i += 1;
        }
      }
      if (!closed) throw formatError();
      if (i < text.length && text[i] !== ';' && !isRecordEnd(text[i])) {
        throw formatError();
      }
    } else {
      while (i < text.length && text[i] !== ';' && !isRecordEnd(text[i])) {
        if (text[i] === '"') throw formatError();
        value += text[i];
        i += 1;
      }
    }

    fields.push({ text: value, quoted });

    if (i >= text.length) return { fields, next: i };
    if (text[i] === ';') {
      i += 1;
      continue;
    }
    // Record terminator: CRLF, CR, or LF.
    if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
    else i += 1;
    return { fields, next: i };
  }
}

function decodeFields(rawFields) {
  const values = new Map();
  for (const { text, quoted } of rawFields) {
    const eq = text.indexOf('=');
    if (eq === -1) throw formatError();
    // Unquoted fields are exactly KEY=VALUE with one equals sign. Inside a whole
    // quoted field the remaining text is literal, so further `=` are value data.
    if (!quoted && text.indexOf('=', eq + 1) !== -1) throw formatError();
    const key = text.slice(0, eq);
    if (!KEY_RE.test(key)) throw formatError();
    if (values.has(key)) throw formatError();
    values.set(key, text.slice(eq + 1).trim());
  }
  return values;
}

function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(values) {
  const out = {};
  for (const [key, min, max] of INTEGER_FIELDS) {
    if (!values.has(key)) throw valueError();
    const str = values.get(key);
    if (!INT_RE.test(str)) throw valueError();
    const num = Number(str);
    if (num < min || num > max) throw valueError();
    setOwn(out, key, num);
  }
  if (values.has('COLOR')) {
    const color = values.get('COLOR');
    if (!COLOR_VALUES.includes(color)) throw valueError();
    setOwn(out, 'COLOR', color);
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const result = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next } = readRecord(text, pos);
    // Syntax / duplicate / whitespace validation for the whole record comes
    // first, then value semantics.
    result.push(buildRecord(decodeFields(fields)));
    pos = next;
  }
  return result;
}

module.exports = { parseBundle };
