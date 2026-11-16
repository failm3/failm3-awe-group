'use strict';

/*
 * Separated key/value record parser.
 * See FORMAT.md for the complete grammar and semantics.
 */

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (also the insertion order of the result objects).
const KNOWN_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'];
const FLAG_VALUES = ['fast', 'safe'];

function fail(message) {
  throw new Error(message);
}

function invalidFormat() {
  fail('INVALID_FORMAT');
}

function invalidValue() {
  fail('INVALID_VALUE');
}

/**
 * Read one field starting at `start`.
 * Returns { raw, quoted, next, terminator } where terminator is one of
 * 'field' ('|'), 'record' (newline sequence) or 'end' (end of input).
 */
function readField(text, start, end) {
  let i = start;

  if (i < end && text[i] === '"') {
    // Whole-field quoted value. Content is the raw key/value text.
    i += 1;
    let decoded = '';
    let closed = false;

    while (i < end) {
      const ch = text[i];
      if (ch === '"') {
        if (i + 1 < end && text[i + 1] === '"') {
          decoded += '"';
          i += 2;
          continue;
        }
        i += 1;
        closed = true;
        break;
      }
      decoded += ch;
      i += 1;
    }

    if (!closed) invalidFormat();

    if (i >= end) {
      return { raw: decoded, quoted: true, next: i, terminator: 'end' };
    }

    const ch = text[i];
    if (ch === '|') {
      return { raw: decoded, quoted: true, next: i + 1, terminator: 'field' };
    }
    if (ch === '\n') {
      return { raw: decoded, quoted: true, next: i + 1, terminator: 'record' };
    }
    if (ch === '\r') {
      const next = i + 1 < end && text[i + 1] === '\n' ? i + 2 : i + 1;
      return { raw: decoded, quoted: true, next, terminator: 'record' };
    }
    // Anything else after a closing quote is illegal.
    invalidFormat();
  }

  // Unquoted field: runs until a separator, a record ending, or end of input.
  while (i < end) {
    const ch = text[i];
    if (ch === '"') invalidFormat();
    if (ch === '|') {
      return { raw: text.slice(start, i), quoted: false, next: i + 1, terminator: 'field' };
    }
    if (ch === '\n') {
      return { raw: text.slice(start, i), quoted: false, next: i + 1, terminator: 'record' };
    }
    if (ch === '\r') {
      const next = i + 1 < end && text[i + 1] === '\n' ? i + 2 : i + 1;
      return { raw: text.slice(start, i), quoted: false, next, terminator: 'record' };
    }
    i += 1;
  }

  return { raw: text.slice(start, end), quoted: false, next: end, terminator: 'end' };
}

/**
 * Turn a raw field into { key, value }.
 * Unquoted fields must be exactly KEY=VALUE (one equals sign);
 * quoted fields may contain additional equals signs (value takes the rest).
 */
function decodeEntry(field) {
  const raw = field.raw;
  const eq = raw.indexOf('=');
  if (eq === -1) invalidFormat();

  const key = raw.slice(0, eq);
  if (!KEY_PATTERN.test(key)) invalidFormat();

  if (!field.quoted && raw.indexOf('=', eq + 1) !== -1) invalidFormat();

  return { key, value: raw.slice(eq + 1).trim() };
}

function readUnsigned(value, min, max) {
  if (!CANONICAL_UNSIGNED.test(value)) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < min || number > max) return null;
  return number;
}

function readFlags(value) {
  const parts = value.split(',');
  const seen = new Set();
  for (const part of parts) {
    if (FLAG_VALUES.indexOf(part) === -1) invalidValue();
    if (seen.has(part)) invalidValue();
    seen.add(part);
  }
  return parts;
}

function buildRecord(found) {
  const out = {};
  const assign = (key, value) => {
    Object.defineProperty(out, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  for (const key of KNOWN_ORDER) {
    if (!found.has(key)) {
      if (key === 'WINDOW' || key === 'RATE' || key === 'LIMIT') invalidValue();
      continue;
    }
    const value = found.get(key);

    if (key === 'WINDOW') {
      const window = readUnsigned(value, 3, 20);
      if (window === null) invalidValue();
      assign('WINDOW', window);
    } else if (key === 'RATE') {
      const rate = readUnsigned(value, 0, 40);
      if (rate === null) invalidValue();
      assign('RATE', rate);
    } else if (key === 'LIMIT') {
      const limit = readUnsigned(value, 1, 150);
      if (limit === null) invalidValue();
      assign('LIMIT', limit);
    } else if (key === 'FLAGS') {
      assign('FLAGS', readFlags(value));
    } else {
      assign('COLOR', value);
    }
  }

  return out;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') invalidFormat();

  const end = text.length;
  const records = [];
  let i = 0;

  while (i < end) {
    const entries = [];
    const keys = new Set();
    let finished = false;

    while (!finished) {
      const field = readField(text, i, end);
      const entry = decodeEntry(field);
      if (keys.has(entry.key)) invalidFormat();
      keys.add(entry.key);
      entries.push(entry);
      i = field.next;
      if (field.terminator !== 'field') finished = true;
    }

    const found = new Map();
    for (const entry of entries) found.set(entry.key, entry.value);
    records.push(buildRecord(found));
  }

  return records;
}

module.exports = { decodeSeparated };
