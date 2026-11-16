'use strict';

/**
 * Parser for separated key/value records (see FORMAT.md).
 *
 *   text      := record (EOL record)* EOL?
 *   EOL       := LF | CRLF | CR
 *   record    := field ('|' field)+             (one or more fields)
 *   field     := quoted | unquoted
 *   quoted    := '"' (char | '""')* '"'         ('""' decodes to one '"'; may
 *                                                hold '|', '=', CR and LF).
 *                                                Only '|', an EOL or the end
 *                                                of input may follow.
 *   unquoted  := KEY '=' VALUE                  (exactly one '=', no '"')
 *   KEY       := [A-Z][A-Z0-9_]*
 *
 * A quoted field is decoded and then validated with exactly the same
 * KEY '=' VALUE rules as an unquoted field.
 * VALUE must already equal its trimmed form.
 * Inside one record, syntax / duplicate / whitespace problems (INVALID_FORMAT)
 * are checked for every field before any semantic check (INVALID_VALUE).
 */

var KEY_RE = /^[A-Z][A-Z0-9_]*$/;
var CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;
var DECIMAL_INT_RE = /^[+-]?[0-9]+$/;

// Known fields, in schema order. Only DURATION is a documented optional field;
// every other key is unknown and dropped after validation.
var SCHEMA = [
  { key: 'WINDOW', re: CANONICAL_UINT_RE, min: 3, max: 40, required: true },
  { key: 'RATE', re: CANONICAL_UINT_RE, min: 0, max: 20, required: true },
  { key: 'LIMIT', re: CANONICAL_UINT_RE, min: 1, max: 150, required: true },
  { key: 'DURATION', re: DECIMAL_INT_RE, min: 1, max: 90, required: false }
];

function fail(message) {
  throw new Error(message);
}

function isEol(ch) {
  return ch === '\n' || ch === '\r';
}

/**
 * Read exactly one record starting at `start`.
 * Returns { fields: string[], next: number }; `next === n` means the input is
 * exhausted. Throws INVALID_FORMAT on structural / quoting problems.
 */
function readRecord(text, start, n) {
  var fields = [];
  var i = start;

  for (;;) {
    var buf = '';

    if (text[i] === '"') {
      // ---- quoted field ----
      i++;
      var closed = false;
      while (i < n) {
        var c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            buf += '"';           // "" decodes to a single quote
            i += 2;
            continue;
          }
          closed = true;
          i++;
          break;
        }
        buf += c;                 // separators, '=', CR and LF are data here
        i++;
      }
      if (!closed) fail('INVALID_FORMAT');                       // unterminated
      if (i < n && text[i] !== '|' && !isEol(text[i])) {
        fail('INVALID_FORMAT');   // characters after the closing quote
      }
    } else {
      // ---- unquoted field ----
      while (i < n && text[i] !== '|' && !isEol(text[i])) {
        if (text[i] === '"') fail('INVALID_FORMAT');             // stray quote
        buf += text[i];
        i++;
      }
    }

    fields.push(buf);

    if (i >= n) return { fields: fields, next: n };
    if (text[i] === '|') {
      i++;                        // another field follows
      continue;
    }
    // ---- record ending ----
    i += (text[i] === '\r' && text[i + 1] === '\n') ? 2 : 1;
    return { fields: fields, next: i };
  }
}

function setOwn(target, key, value) {
  // defineProperty keeps prototype-looking keys plain data, so a key such as
  // __proto__ can never alter the result's prototype.
  Object.defineProperty(target, key, {
    value: value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

/** Validate one record's decoded field texts and build its plain object. */
function buildRecord(fieldTexts) {
  // Pass 1 - syntax, whitespace and duplicate checks for the whole record.
  var values = new Map();
  for (var f = 0; f < fieldTexts.length; f++) {
    var content = fieldTexts[f];
    var eq = content.indexOf('=');
    if (eq < 0) fail('INVALID_FORMAT');                          // no '='
    if (content.indexOf('=', eq + 1) !== -1) fail('INVALID_FORMAT');
    var key = content.slice(0, eq);
    var value = content.slice(eq + 1);
    if (!KEY_RE.test(key)) fail('INVALID_FORMAT');
    if (value !== value.trim()) fail('INVALID_FORMAT');
    if (values.has(key)) fail('INVALID_FORMAT');                 // duplicate
    values.set(key, value);
  }

  // Pass 2 - semantics. Unknown keys are dropped; known ones are emitted in
  // schema order.
  var record = {};
  for (var s = 0; s < SCHEMA.length; s++) {
    var spec = SCHEMA[s];
    if (!values.has(spec.key)) {
      if (spec.required) fail('INVALID_VALUE');
      continue;
    }
    var raw = values.get(spec.key);
    if (!spec.re.test(raw)) fail('INVALID_VALUE');
    var num = Number(raw);
    if (!(num >= spec.min && num <= spec.max)) fail('INVALID_VALUE');
    setOwn(record, spec.key, num);
  }
  return record;
}

function parseBundle(text) {
  if (typeof text !== 'string') fail('INVALID_FORMAT');
  if (text.length === 0) return [];

  var n = text.length;
  var i = 0;
  var out = [];

  for (;;) {
    var record = readRecord(text, i, n);
    out.push(buildRecord(record.fields));   // per-record error precedence
    i = record.next;
    if (i >= n) break;                      // single trailing EOL tolerated
  }
  return out;
}

module.exports = { parseBundle: parseBundle };
