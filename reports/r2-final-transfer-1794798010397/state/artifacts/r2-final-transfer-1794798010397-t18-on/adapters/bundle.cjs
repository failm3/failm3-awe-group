'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(0|[1-9][0-9]*)$/;

function formatError() { return new Error('INVALID_FORMAT'); }
function valueError() { return new Error('INVALID_VALUE'); }

function uintInRange(value, min, max) {
  if (!UINT_RE.test(value)) throw valueError();
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
  return n;
}

// Known fields in schema order. Output keys are inserted in this order.
const SCHEMA = [
  { key: 'WINDOW', required: true, convert: v => uintInRange(v, 1, 50) },
  { key: 'RATE', required: true, convert: v => uintInRange(v, 0, 30) },
  { key: 'LIMIT', required: true, convert: v => uintInRange(v, 1, 25) },
  {
    key: 'COLOR',
    required: false,
    convert: v => {
      if (v !== 'white' && v !== 'black') throw valueError();
      return v;
    },
  },
];

// Splits decoded field text into [key, trimmedValue]; throws INVALID_FORMAT on bad syntax.
function splitField(content, quoted) {
  const eq = content.indexOf('=');
  if (eq === -1) throw formatError();
  if (!quoted && content.indexOf('=', eq + 1) !== -1) throw formatError();
  const key = content.slice(0, eq);
  if (!KEY_RE.test(key)) throw formatError();
  return [key, content.slice(eq + 1).trim()];
}

// Semantic validation of one syntactically valid record.
function buildRecord(fields) {
  const out = {};
  for (const { key, required, convert } of SCHEMA) {
    if (!fields.has(key)) {
      if (required) throw valueError();
      continue;
    }
    out[key] = convert(fields.get(key));
  }
  // Unknown keys are dropped after syntax and duplicate validation.
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const records = [];
  const len = text.length;
  let i = 0;

  while (i < len) {
    // Parse one record: fields separated by ';', ended by LF, CRLF, CR or end of input.
    const fields = new Map();
    let recordDone = false;

    while (!recordDone) {
      let content = '';
      let quoted = false;

      if (text[i] === '"') {
        quoted = true;
        i++;
        let closed = false;
        while (i < len) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') { content += '"'; i += 2; continue; }
            i++;
            closed = true;
            break;
          }
          content += c;
          i++;
        }
        if (!closed) throw formatError();
        // Only a separator, a record ending, or end of input may follow a closing quote.
        if (i < len && text[i] !== ';' && text[i] !== '\n' && text[i] !== '\r') throw formatError();
      } else {
        while (i < len) {
          const c = text[i];
          if (c === ';' || c === '\n' || c === '\r') break;
          if (c === '"') throw formatError();
          content += c;
          i++;
        }
      }

      const [key, value] = splitField(content, quoted);
      if (fields.has(key)) throw formatError();
      fields.set(key, value);

      if (i >= len) {
        recordDone = true;
      } else if (text[i] === ';') {
        i++; // another field must follow (an empty field fails splitField)
      } else {
        // Record ending: CRLF, LF or CR.
        if (text[i] === '\r' && text[i + 1] === '\n') i += 2;
        else i++;
        recordDone = true;
      }
    }

    records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { parseBundle };
