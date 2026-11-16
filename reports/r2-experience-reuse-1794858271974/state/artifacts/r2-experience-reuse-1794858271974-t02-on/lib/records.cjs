'use strict';

/**
 * Separated key/value records -- see FORMAT.md.
 *
 * Grammar summary:
 *   text    := record ( TERM record )* TERM?
 *   TERM    := LF | CRLF | CR
 *   record  := field ( ';' field )*
 *   field   := quoted | unquoted
 *   quoted  := '"' ( any-char | '""' )* '"'      -- whole field, decoded, must be KEY=VALUE
 *   unquoted:= ( any-char except ';' , TERM , '"' )+   -- exactly one '=' , KEY=VALUE
 *   KEY     := [A-Z][A-Z0-9_]*
 */

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const UINT_PATTERN = /^(?:0|[1-9][0-9]*)$/;

function formatError() {
  return new Error('INVALID_FORMAT');
}

function valueError() {
  return new Error('INVALID_VALUE');
}

/**
 * Split the *decoded* text of a single field into key and raw (still
 * untrimmed) value.
 *
 * Unquoted fields must contain exactly one '='; quoted fields are split on the
 * first '=' so that separators and further equals signs may live in the value.
 */
function splitField(decoded, wasQuoted) {
  const eq = decoded.indexOf('=');
  if (eq === -1) throw formatError();
  if (!wasQuoted && decoded.indexOf('=', eq + 1) !== -1) throw formatError();

  const key = decoded.slice(0, eq);
  if (!KEY_PATTERN.test(key)) throw formatError();

  // Whitespace policy: only the decoded VALUE is trimmed.
  return { key, value: decoded.slice(eq + 1).trim() };
}

/** Canonical unsigned decimal integer -> Number, else null. */
function canonicalUint(raw) {
  return UINT_PATTERN.test(raw) ? Number(raw) : null;
}

/** Validate one record's parsed fields and build the output object. */
function buildRecord(fields) {
  const byKey = new Map();
  for (const field of fields) byKey.set(field.key, field.value);

  const target = {};
  const put = (key, value) => {
    Object.defineProperty(target, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  };

  // Required integer fields, emitted in known-field schema order.
  const window = canonicalUint(byKey.get('WINDOW') ?? '');
  if (window === null || window < 3 || window > 40) throw valueError();
  put('WINDOW', window);

  const rate = canonicalUint(byKey.get('RATE') ?? '');
  if (rate === null || rate > 30) throw valueError();
  put('RATE', rate);

  const limit = canonicalUint(byKey.get('LIMIT') ?? '');
  if (limit === null || limit < 1 || limit > 75) throw valueError();
  put('LIMIT', limit);

  // The one documented optional field. Unknown fields were dropped already.
  if (byKey.has('COLOR')) {
    const color = byKey.get('COLOR');
    if (color !== 'cyan' && color !== 'magenta') throw valueError();
    put('COLOR', color);
  }

  return target;
}

function parseRecords(text) {
  if (typeof text !== 'string') throw formatError();

  const length = text.length;
  const records = [];
  if (length === 0) return records;

  let i = 0;
  while (i < length) {
    // ---- parse one record ----
    const fields = [];
    const seen = new Set();

    for (;;) {
      let decoded;
      let wasQuoted;

      if (text.charAt(i) === '"') {
        // Whole-field quoted form.
        wasQuoted = true;
        i += 1;
        let buffer = '';
        let closed = false;
        while (i < length) {
          const c = text.charAt(i);
          if (c === '"') {
            if (text.charAt(i + 1) === '"') {
              buffer += '"';
              i += 2;
              continue;
            }
            i += 1;
            closed = true;
            break;
          }
          buffer += c;
          i += 1;
        }
        if (!closed) throw formatError(); // unterminated quote
        decoded = buffer;
        if (i < length) {
          const c = text.charAt(i);
          if (c !== ';' && c !== '\n' && c !== '\r') throw formatError();
        }
      } else {
        // Unquoted form: runs until a separator or a record terminator.
        wasQuoted = false;
        let buffer = '';
        while (i < length) {
          const c = text.charAt(i);
          if (c === ';' || c === '\n' || c === '\r') break;
          if (c === '"') throw formatError(); // quote inside unquoted field
          buffer += c;
          i += 1;
        }
        decoded = buffer;
      }

      const field = splitField(decoded, wasQuoted);
      if (seen.has(field.key)) throw formatError(); // duplicate decoded key
      seen.add(field.key);
      fields.push(field);

      if (i >= length) break;

      const c = text.charAt(i);
      if (c === ';') {
        i += 1;
        continue; // another field of the same record
      }

      // Record terminator: LF, CRLF or CR.
      if (c === '\r') {
        i += 1;
        if (text.charAt(i) === '\n') i += 1;
      } else {
        i += 1; // '\n'
      }
      break;
    }

    records.push(buildRecord(fields));
  }

  return records;
}

module.exports = { parseRecords };
