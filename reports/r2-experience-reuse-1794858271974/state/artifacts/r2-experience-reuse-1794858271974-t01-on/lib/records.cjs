'use strict';

/**
 * Separated key/value record parser (see FORMAT.md).
 *
 * - Records end with LF, CRLF or CR; fields are separated by a literal '|'.
 * - An unquoted field is exactly KEY=VALUE with one '='.
 * - A whole field may be double quoted ("KEY=VALUE"); inside, "" decodes to '"',
 *   and '|', '=', CR and LF are literal. The decoded text splits at its first '='.
 * - Required: WINDOW, RATE, LIMIT. Only documented optional field: DURATION.
 *   Any other well-formed key is validated, then dropped.
 * - Each record is fully syntax-checked (INVALID_FORMAT) before semantic checks
 *   (INVALID_VALUE), and records are processed in order.
 */

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UNSIGNED_RE = /^(?:0|[1-9][0-9]*)$/;
const DECIMAL_INTEGER_RE = /^[+-]?[0-9]+$/;

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

/**
 * Lazily yields records as arrays of { text, quoted } fields so that each record
 * can be fully validated before later input is examined.
 */
function* readRecords(text) {
  const n = text.length;
  let i = 0;

  while (i < n) {
    const fields = [];
    let recordDone = false;

    while (!recordDone) {
      let value = '';
      let quoted = false;

      if (text[i] === '"') {
        quoted = true;
        i += 1;
        let closed = false;
        while (i < n) {
          const c = text[i];
          if (c === '"') {
            if (text[i + 1] === '"') {
              value += '"';
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          value += c;
          i += 1;
        }
        if (!closed) throw invalidFormat(); // unterminated quote
        // Only a separator, a record ending or end of input may follow.
        if (i < n && text[i] !== '|' && text[i] !== '\r' && text[i] !== '\n') {
          throw invalidFormat();
        }
      } else {
        while (i < n) {
          const c = text[i];
          if (c === '|' || c === '\r' || c === '\n') break;
          if (c === '"') throw invalidFormat(); // quote inside an unquoted field
          value += c;
          i += 1;
        }
      }

      fields.push({ text: value, quoted });

      if (i >= n) {
        recordDone = true;
      } else if (text[i] === '|') {
        i += 1; // next field (possibly empty, which fails KEY=VALUE later)
      } else {
        // record ending: CRLF, CR or LF
        i += text[i] === '\r' && text[i + 1] === '\n' ? 2 : 1;
        recordDone = true;
      }
    }

    yield fields;
  }
}

/** Syntax, whitespace and duplicate validation for one record. */
function collectFields(fields) {
  const seen = new Map();

  for (const field of fields) {
    const raw = field.text;
    const eq = raw.indexOf('=');
    if (eq === -1) throw invalidFormat(); // not KEY=VALUE
    if (!field.quoted && raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();

    const key = raw.slice(0, eq);
    const value = raw.slice(eq + 1);

    if (!KEY_RE.test(key)) throw invalidFormat();
    if (value !== value.trim()) throw invalidFormat();
    if (seen.has(key)) throw invalidFormat(); // duplicate decoded key

    seen.set(key, value);
  }

  return seen;
}

function readInteger(raw, min, max, pattern) {
  if (raw === undefined || !pattern.test(raw)) throw invalidValue();
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < min || num > max) throw invalidValue();
  return num;
}

function defineOwn(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Semantic validation and conversion; output keys follow schema order. */
function buildRecord(seen) {
  const out = {};
  defineOwn(out, 'WINDOW', readInteger(seen.get('WINDOW'), 2, 30, CANONICAL_UNSIGNED_RE));
  defineOwn(out, 'RATE', readInteger(seen.get('RATE'), 0, 20, CANONICAL_UNSIGNED_RE));
  defineOwn(out, 'LIMIT', readInteger(seen.get('LIMIT'), 1, 50, CANONICAL_UNSIGNED_RE));
  if (seen.has('DURATION')) {
    defineOwn(out, 'DURATION', readInteger(seen.get('DURATION'), 1, 60, DECIMAL_INTEGER_RE));
  }
  // All other keys are unknown and dropped.
  return out;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const result = [];
  for (const fields of readRecords(text)) {
    result.push(buildRecord(collectFields(fields)));
  }
  return result;
}

module.exports = { parseRecords };
