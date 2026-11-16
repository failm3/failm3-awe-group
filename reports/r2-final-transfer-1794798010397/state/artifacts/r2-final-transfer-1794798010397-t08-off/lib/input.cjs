'use strict';

// Parser for separated key/value records as described in FORMAT.md.

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known fields in schema order, with their inclusive integer ranges.
const SCHEMA = [
  { key: 'WINDOW', min: 3, max: 50 },
  { key: 'RATE', min: 0, max: 10 },
  { key: 'LIMIT', min: 1, max: 75 },
];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

function isRecordEnd(ch) {
  return ch === '\n' || ch === '\r';
}

// Parses one record starting at `start`. Performs all syntax, whitespace and
// duplicate-key validation for the record. Returns the decoded fields (as a
// Map in field order) and the position after the record terminator.
function parseRecord(text, start) {
  const len = text.length;
  const fields = new Map();
  let pos = start;

  for (;;) {
    let key;
    let value;

    if (text[pos] === '"') {
      // Quoted field: the whole KEY=VALUE text is inside the quotes.
      pos++;
      let buf = '';
      for (;;) {
        if (pos >= len) throw formatError(); // unterminated quote
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
      // Only a separator or record ending may follow the closing quote.
      if (pos < len && text[pos] !== ';' && !isRecordEnd(text[pos])) {
        throw formatError();
      }
      const eq = buf.indexOf('=');
      if (eq < 0) throw formatError();
      key = buf.slice(0, eq);
      value = buf.slice(eq + 1);
    } else {
      // Unquoted field: runs to the next separator or record ending.
      const fieldStart = pos;
      while (pos < len && text[pos] !== ';' && !isRecordEnd(text[pos])) pos++;
      const raw = text.slice(fieldStart, pos);
      if (raw.includes('"')) throw formatError();
      const eq = raw.indexOf('=');
      if (eq < 0 || raw.indexOf('=', eq + 1) >= 0) throw formatError();
      key = raw.slice(0, eq);
      value = raw.slice(eq + 1);
    }

    if (!KEY_RE.test(key)) throw formatError();
    if (value !== value.trim()) throw formatError();
    if (fields.has(key)) throw formatError();
    fields.set(key, value);

    if (pos >= len) return { fields, next: pos, terminated: false };
    const ch = text[pos];
    if (ch === ';') {
      pos++;
      continue;
    }
    // Record ending: CRLF, LF or CR.
    if (ch === '\r' && text[pos + 1] === '\n') pos += 2;
    else pos++;
    return { fields, next: pos, terminated: true };
  }
}

function buildRecord(fields) {
  const out = {};
  for (const { key, min, max } of SCHEMA) {
    if (!fields.has(key)) throw valueError();
    const raw = fields.get(key);
    if (!CANONICAL_UINT_RE.test(raw)) throw valueError();
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw valueError();
    out[key] = n;
  }
  // Unknown keys are dropped; no optional fields are defined.
  return out;
}

function readInput(text) {
  if (typeof text !== 'string') throw formatError();
  const records = [];
  if (text === '') return records;

  let pos = 0;
  for (;;) {
    const { fields, next, terminated } = parseRecord(text, pos);
    records.push(buildRecord(fields));
    pos = next;
    // A final record ending does not start a new (empty) record.
    if (!terminated || pos >= text.length) break;
  }
  return records;
}

module.exports = { readInput };
