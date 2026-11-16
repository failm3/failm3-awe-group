'use strict';

/*
 * Separated key/value record parser.
 * Implements FORMAT.md:
 *   - records split on LF, CRLF or CR (an unquoted record boundary)
 *   - fields separated by literal '|'
 *   - field is KEY=VALUE, KEY matches [A-Z][A-Z0-9_]*, or the whole field quoted
 *   - inside quotes: "" -> ", separators / '=' / CR / LF allowed
 *   - nothing may follow a closing quote except '|' or record end
 *   - values are trimmed; keys are not
 *   - syntax/duplicate problems (INVALID_FORMAT) take precedence over
 *     semantic problems (INVALID_VALUE) within each record
 */

var INVALID_FORMAT = 'INVALID_FORMAT';
var INVALID_VALUE = 'INVALID_VALUE';

var KEY_RE = /^[A-Z][A-Z0-9_]*$/;
var CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order. FLAGS is the only documented optional field;
// every other key (including COLOR) is retained as an unknown string value.
var REQUIRED_KEYS = ['WINDOW', 'RATE', 'LIMIT'];
var OPTIONAL_KEYS = ['FLAGS'];
var KNOWN_KEYS = REQUIRED_KEYS.concat(OPTIONAL_KEYS);

var FLAG_VALUES = ['fast', 'safe'];

function fail(message) {
  throw new Error(message);
}

/**
 * Split the input text into records of raw (still undecoded at the
 * record level, but quote-decoded at the field level) field strings.
 * Throws INVALID_FORMAT for quote/structure problems.
 */
function tokenize(text) {
  var n = text.length;
  var i = 0;
  var records = [];
  var current = [];

  function readField() {
    var buf = '';
    if (text[i] === '"') {
      i += 1; // opening quote
      var closed = false;
      while (i < n) {
        var c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            buf += '"';
            i += 2;
          } else {
            i += 1; // closing quote
            closed = true;
            break;
          }
        } else {
          buf += c;
          i += 1;
        }
      }
      if (!closed) {
        fail(INVALID_FORMAT); // unterminated quote
      }
      if (i < n) {
        var after = text[i];
        if (after !== '|' && after !== '\r' && after !== '\n') {
          // characters after the closing quote
          fail(INVALID_FORMAT);
        }
      }
      return { raw: buf, quoted: true };
    }

    while (i < n) {
      var ch = text[i];
      if (ch === '|' || ch === '\r' || ch === '\n') {
        break;
      }
      if (ch === '"') {
        fail(INVALID_FORMAT); // quote inside an unquoted field
      }
      buf += ch;
      i += 1;
    }
    return { raw: buf, quoted: false };
  }

  while (true) {
    current.push(readField());

    if (i >= n) {
      records.push(current);
      break;
    }

    var sep = text[i];
    if (sep === '|') {
      i += 1;
      continue;
    }

    if (sep === '\r' || sep === '\n') {
      if (sep === '\r' && text[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      records.push(current);
      current = [];
      if (i >= n) {
        // a trailing record separator leaves an empty record, which cannot
        // satisfy "one or more fields"
        records.push(current);
        break;
      }
      continue;
    }

    // Unreachable: readField stops only at '|', CR, LF or end of input.
    fail(INVALID_FORMAT);
  }

  return records;
}

/**
 * Turn one tokenized record into an ordered map of decoded key -> raw value.
 * Enforces field structure, key syntax and duplicate-key rules.
 */
function decodeFields(fields) {
  if (fields.length === 0) {
    fail(INVALID_FORMAT); // each record needs one or more fields
  }

  var order = [];
  var values = new Map();
  var seen = new Set();

  for (var f = 0; f < fields.length; f += 1) {
    var field = fields[f];
    var raw = field.raw;
    var eq = raw.indexOf('=');
    if (eq === -1) {
      fail(INVALID_FORMAT); // no KEY=VALUE structure
    }
    if (!field.quoted && raw.indexOf('=', eq + 1) !== -1) {
      fail(INVALID_FORMAT); // unquoted field must have exactly one '='
    }

    var key = raw.slice(0, eq);
    var value = raw.slice(eq + 1);

    if (!KEY_RE.test(key)) {
      fail(INVALID_FORMAT); // bad key
    }

    if (seen.has(key)) {
      fail(INVALID_FORMAT); // duplicate decoded key
    }
    seen.add(key);

    order.push(key);
    values.set(key, value.trim());
  }

  return { order: order, values: values };
}

function parseCanonicalUint(value, min, max) {
  if (!CANONICAL_UINT_RE.test(value)) {
    fail(INVALID_VALUE);
  }
  var num = Number(value);
  if (!Number.isSafeInteger(num) || num < min || num > max) {
    fail(INVALID_VALUE);
  }
  return num;
}

function parseFlags(value) {
  if (value.length === 0) {
    fail(INVALID_VALUE); // empty FLAGS
  }
  var parts = value.split(',');
  if (parts.length === 0) {
    fail(INVALID_VALUE);
  }
  var seen = new Set();
  var out = [];
  for (var p = 0; p < parts.length; p += 1) {
    var part = parts[p];
    if (part.length === 0) {
      fail(INVALID_VALUE); // empty element
    }
    if (FLAG_VALUES.indexOf(part) === -1) {
      fail(INVALID_VALUE); // only fast and safe are allowed
    }
    if (seen.has(part)) {
      fail(INVALID_VALUE); // no repeats
    }
    seen.add(part);
    out.push(part);
  }
  return out;
}

function defineOwn(target, key, value) {
  // defineProperty keeps "__proto__"-like keys as plain own data properties
  // and never touches the result object's prototype.
  Object.defineProperty(target, key, {
    value: value,
    enumerable: true,
    writable: true,
    configurable: true
  });
}

function buildRecord(decoded) {
  var values = decoded.values;
  var result = {};

  // Known fields first, in schema order; required fields must be present.
  for (var k = 0; k < REQUIRED_KEYS.length; k += 1) {
    var name = REQUIRED_KEYS[k];
    if (!values.has(name)) {
      fail(INVALID_VALUE);
    }
  }

  defineOwn(result, 'WINDOW', parseCanonicalUint(values.get('WINDOW'), 1, 20));
  defineOwn(result, 'RATE', parseCanonicalUint(values.get('RATE'), 0, 40));
  defineOwn(result, 'LIMIT', parseCanonicalUint(values.get('LIMIT'), 1, 100));

  if (values.has('FLAGS')) {
    defineOwn(result, 'FLAGS', parseFlags(values.get('FLAGS')));
  }

  // Unknown keys retained verbatim (as trimmed strings) in field order.
  for (var o = 0; o < decoded.order.length; o += 1) {
    var key = decoded.order[o];
    if (KNOWN_KEYS.indexOf(key) !== -1) {
      continue;
    }
    defineOwn(result, key, values.get(key));
  }

  return result;
}

function decodeSeparated(text) {
  if (typeof text !== 'string') {
    fail(INVALID_FORMAT);
  }
  if (text.length === 0) {
    return [];
  }

  var records = tokenize(text);

  // Process each record in order. Within each record, all syntax/duplicate
  // checking happens in decodeFields before semantic validation in buildRecord,
  // which is what gives syntax errors precedence over semantic ones.
  var out = [];
  for (var r = 0; r < records.length; r += 1) {
    out.push(buildRecord(decodeFields(records[r])));
  }
  return out;
}

module.exports = { decodeSeparated: decodeSeparated };
