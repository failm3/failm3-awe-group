'use strict';

/*
 * readInput(text) -> array of plain objects, one per separated record.
 * Implements FORMAT.md exactly.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
const FLAG_VALUES = ['dry', 'live'];

// Known-field schema order (documents required fields plus the single
// documented optional field). Anything else is an unknown key and is dropped
// after syntax and duplicate validation.
const SCHEMA_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS'];

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

/* ------------------------------------------------------------------ *
 * Lexing: records, fields, quoted fields
 * ------------------------------------------------------------------ */

function isRecordEnd(ch) {
  return ch === '\n' || ch === '\r';
}

function skipRecordSeparator(text, i) {
  if (text[i] === '\r' && text[i + 1] === '\n') return i + 2;
  return i + 1;
}

// Reads a single field starting at text[i]; returns { content, quoted } and
// advances i past the field (stopping on |, CR, LF or EOF).
function readField(text, state) {
  const n = text.length;
  const start = state.i;

  if (text[state.i] === '"') {
    state.i += 1;
    let content = '';
    let closed = false;
    while (state.i < n) {
      const ch = text[state.i];
      if (ch === '"') {
        if (text[state.i + 1] === '"') {
          content += '"';
          state.i += 2;
          continue;
        }
        state.i += 1;
        closed = true;
        break;
      }
      content += ch;
      state.i += 1;
    }
    if (!closed) throw formatError();
    // Nothing may follow a closing quote except a separator or record ending.
    if (state.i < n) {
      const next = text[state.i];
      if (next !== '|' && !isRecordEnd(next)) throw formatError();
    }
    return { content, quoted: true };
  }

  // Unquoted field: may not contain any quote character.
  while (state.i < n) {
    const ch = text[state.i];
    if (ch === '|' || isRecordEnd(ch)) break;
    if (ch === '"') throw formatError();
    state.i += 1;
  }
  return { content: text.slice(start, state.i), quoted: false };
}

function* tokenize(text) {
  const n = text.length;
  let fields = [];
  const state = { i: 0 };

  while (state.i < n) {
    const ch = text[state.i];

    if (isRecordEnd(ch)) {
      state.i = skipRecordSeparator(text, state.i);
      if (fields.length > 0) {
        const record = fields;
        fields = [];
        yield record; // consumed (and validated) before the next record is lexed
      }
      continue;
    }

    if (ch === '|') {
      // A leading separator would make the first field empty.
      throw formatError();
    }

    fields.push(readField(text, state));

    if (state.i < n) {
      const sep = text[state.i];
      if (sep === '|') {
        state.i += 1;
        if (state.i >= n) throw formatError(); // trailing separator => empty field
        continue;
      }
      if (isRecordEnd(sep)) {
        state.i = skipRecordSeparator(text, state.i);
        const record = fields;
        fields = [];
        yield record;
        continue;
      }
      // readField already rejects other trailing characters.
      throw formatError();
    }
  }

  if (fields.length > 0) yield fields;
}

/* ------------------------------------------------------------------ *
 * Field decoding: KEY=VALUE
 * ------------------------------------------------------------------ */

function decodeField(field) {
  const content = field.content;
  const eq = content.indexOf('=');
  if (eq < 0) throw formatError();

  const key = content.slice(0, eq);
  const value = content.slice(eq + 1);
  // Unquoted fields must be exactly KEY=VALUE with one equals sign; quoting is
  // the documented way to embed further "=" characters, so only enforce the
  // single-equals rule for unquoted fields.
  if (!field.quoted && value.indexOf('=') !== -1) throw formatError();
  if (!KEY_RE.test(key)) throw formatError();

  return { key, value };
}

/* ------------------------------------------------------------------ *
 * Semantics
 * ------------------------------------------------------------------ */

function parseCanonicalInt(raw, min, max) {
  if (!CANONICAL_UINT_RE.test(raw)) throw valueError();
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < min || num > max) throw valueError();
  return num;
}

function parseFlags(raw) {
  if (raw === '') throw valueError();
  const parts = raw.split(',');
  const seen = new Set();
  for (const part of parts) {
    if (FLAG_VALUES.indexOf(part) === -1) throw valueError();
    if (seen.has(part)) throw valueError();
    seen.add(part);
  }
  return parts;
}

function defineOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

function buildRecord(rawFields) {
  // Pass 1: syntax (keys, separators, quotes) and duplicate decoded keys.
  const decoded = new Map();
  for (const raw of rawFields) {
    const { key, value } = decodeField(raw);
    if (decoded.has(key)) throw formatError();
    // Trim leading/trailing whitespace of the decoded VALUE only.
    decoded.set(key, value.trim());
  }

  // Pass 2: semantics, after the whole record is syntactically valid.
  const window = parseCanonicalInt(decoded.get('WINDOW'), 3, 30);
  const rate = parseCanonicalInt(decoded.get('RATE'), 0, 40);
  const limit = parseCanonicalInt(decoded.get('LIMIT'), 1, 150);
  const flags = decoded.has('FLAGS') ? parseFlags(decoded.get('FLAGS')) : undefined;

  // Pass 3: assemble in schema order; unknown keys were already dropped.
  const semantic = { WINDOW: window, RATE: rate, LIMIT: limit, FLAGS: flags };
  const record = {};
  for (const key of SCHEMA_ORDER) {
    if (!decoded.has(key)) continue;
    defineOwn(record, key, semantic[key]);
  }
  return record;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

function readInput(text) {
  if (typeof text !== 'string') throw new TypeError('readInput expects a string');
  if (text.length === 0) return [];

  // Records are validated one at a time, in order: syntax/duplicate/whitespace
  // problems in a record are reported before any later record is examined.
  const out = [];
  for (const fields of tokenize(text)) out.push(buildRecord(fields));
  return out;
}

module.exports = { readInput };
