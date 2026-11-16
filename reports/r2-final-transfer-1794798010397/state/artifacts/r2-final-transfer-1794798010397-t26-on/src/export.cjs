'use strict';

/*
 * parseExport(text): parser for separated key/value records (see FORMAT.md).
 *
 *   text    := "" | record (EOL record)* EOL?
 *   EOL     := LF | CRLF | CR
 *   record  := field (";" field)*
 *   field   := plain | quoted
 *   plain   := KEY "=" VALUE              (exactly one "=", no '"')
 *   quoted  := '"' (any char but '"' | '""')* '"'   (whole field incl. key)
 *   KEY     := [A-Z][A-Z0-9_]*
 *
 * Records are parsed one at a time; within each record syntax/duplicate
 * errors (INVALID_FORMAT) are detected before semantic ones (INVALID_VALUE).
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Recognized fields. COLOR is the only documented optional field; any other
// key (including FLAGS, which FORMAT.md does not define) is unknown and dropped.
const KNOWN = new Set(['WINDOW', 'RATE', 'LIMIT', 'COLOR']);
const COLORS = new Set(['green', 'amber']);

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

/**
 * Reads one record starting at `start`. Returns { fields, next } where
 * `fields` are the decoded field texts and `next` is the index just after the
 * record terminator (or text.length).
 */
function readRecord(text, start) {
  const fields = [];
  let cur = '';
  let state = 'start'; // 'start' | 'plain' | 'quoted' | 'closed'
  let i = start;

  for (; i < text.length; i++) {
    const c = text[i];

    if (state === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          state = 'closed';
        }
      } else {
        cur += c; // ';', '=', CR and LF are literal inside quotes
      }
      continue;
    }

    if (c === ';') {
      fields.push(cur);
      cur = '';
      state = 'start';
    } else if (c === '\n' || c === '\r') {
      fields.push(cur);
      const next = c === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
      return { fields, next };
    } else if (state === 'closed') {
      throw invalidFormat(); // only a separator or record end may follow a closing quote
    } else if (c === '"') {
      if (state !== 'start') throw invalidFormat(); // quote inside an unquoted field
      state = 'quoted';
    } else {
      cur += c;
      state = 'plain';
    }
  }

  if (state === 'quoted') throw invalidFormat(); // unterminated quote
  fields.push(cur);
  return { fields, next: text.length };
}

function readUint(values, key, min, max) {
  if (!Object.prototype.hasOwnProperty.call(values, key)) throw invalidValue();
  const raw = values[key];
  if (!UINT_RE.test(raw)) throw invalidValue();
  const n = Number(raw);
  if (n < min || n > max) throw invalidValue();
  return n;
}

function buildRecord(fields) {
  // Null-prototype scratch map so keys like "CONSTRUCTOR" are plain data.
  const values = Object.create(null);
  const seen = new Set();

  // Pass 1: syntax and duplicate validation (INVALID_FORMAT).
  for (const raw of fields) {
    const eq = raw.indexOf('=');
    if (eq === -1 || raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();
    const key = raw.slice(0, eq);
    if (!KEY_RE.test(key)) throw invalidFormat();
    if (seen.has(key)) throw invalidFormat();
    seen.add(key);
    // Whitespace policy: trim the decoded VALUE only; keys are not trimmed.
    if (KNOWN.has(key)) values[key] = raw.slice(eq + 1).trim();
    // Unknown keys are dropped here, after syntax and duplicate checks.
  }

  // Pass 2: semantic validation (INVALID_VALUE).
  const window = readUint(values, 'WINDOW', 3, 30);
  const rate = readUint(values, 'RATE', 0, 30);
  const limit = readUint(values, 'LIMIT', 1, 75);
  let color;
  if ('COLOR' in values) {
    color = values.COLOR;
    if (!COLORS.has(color)) throw invalidValue();
  }

  // Ordinary object; insertion in known-field schema order.
  const record = {};
  record.WINDOW = window;
  record.RATE = rate;
  record.LIMIT = limit;
  if (color !== undefined) record.COLOR = color;
  return record;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  const out = [];
  let pos = 0;
  // A terminator after the last record does not start a new, empty record.
  while (pos < text.length) {
    const { fields, next } = readRecord(text, pos);
    out.push(buildRecord(fields));
    pos = next;
  }
  return out;
}

module.exports = { parseExport };
