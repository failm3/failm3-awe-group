'use strict';

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order, with inclusive ranges.
const SCHEMA = [
  ['WINDOW', 2, 30],
  ['RATE', 0, 10],
  ['LIMIT', 1, 125],
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

// Reads one record starting at `pos`. Returns { fields, next, ended } where
// `fields` holds decoded field texts, `next` is the index after the record
// terminator, and `ended` tells whether a line ending terminated the record.
function readRecord(text, pos) {
  const fields = [];
  let i = pos;
  for (;;) {
    let field = '';
    if (text[i] === '"') {
      i++;
      let closed = false;
      while (i < text.length) {
        const ch = text[i];
        if (ch === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++;
            closed = true;
            break;
          }
        } else {
          field += ch;
          i++;
        }
      }
      if (!closed) throw formatError();
      const after = text[i];
      if (after !== undefined && after !== ';' && after !== '\n' && after !== '\r') {
        throw formatError();
      }
      fields.push({ text: field, quoted: true });
    } else {
      while (i < text.length) {
        const ch = text[i];
        if (ch === ';' || ch === '\n' || ch === '\r') break;
        if (ch === '"') throw formatError();
        field += ch;
        i++;
      }
      fields.push({ text: field, quoted: false });
    }

    if (i >= text.length) return { fields, next: i, ended: false };
    const ch = text[i];
    if (ch === ';') {
      i++;
      continue;
    }
    // Line ending: CRLF, CR, or LF.
    if (ch === '\r' && text[i + 1] === '\n') i += 2;
    else i++;
    return { fields, next: i, ended: true };
  }
}

function parseFields(fields) {
  const values = new Map();
  for (const { text, quoted } of fields) {
    const eq = text.indexOf('=');
    if (eq === -1) throw formatError();
    // Unquoted fields need exactly one equals sign; quoted fields may
    // contain further equals signs inside the value.
    if (!quoted && text.indexOf('=', eq + 1) !== -1) throw formatError();
    const key = text.slice(0, eq);
    const value = text.slice(eq + 1);
    if (!KEY_RE.test(key)) throw formatError();
    if (values.has(key)) throw formatError();
    if (value !== value.trim()) throw formatError();
    values.set(key, value);
  }
  return values;
}

function buildRecord(values) {
  const out = {};
  for (const [name, min, max] of SCHEMA) {
    if (!values.has(name)) throw valueError();
    const raw = values.get(name);
    if (!CANONICAL_UINT_RE.test(raw)) throw valueError();
    const n = Number(raw);
    if (n < min || n > max) throw valueError();
    out[name] = n;
  }
  // FORMAT.md defines no optional fields, so every other key is unknown
  // and dropped. Unknown keys never touch `out`, so no key can change
  // the result prototype.
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw formatError();
  if (text === '') return [];

  const result = [];
  let pos = 0;
  while (pos < text.length) {
    const { fields, next, ended } = readRecord(text, pos);
    // A record must hold at least one KEY=VALUE field, so an empty line
    // produces an empty field, which parseFields rejects. A single line
    // ending after the last record ends the input and adds no record.
    const values = parseFields(fields);
    result.push(buildRecord(values));
    pos = next;
    if (!ended) break;
  }
  return result;
}

module.exports = { parseBundle };
