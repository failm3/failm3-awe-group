'use strict';

/**
 * Separated key/value record parser.
 *
 * Implements FORMAT.md:
 *  - records separated by LF, CRLF or CR
 *  - fields within a record separated by ';'
 *  - unquoted field is exactly KEY=VALUE (one '='), KEY matches [A-Z][A-Z0-9_]*
 *  - a whole field may be double quoted; "" inside quotes decodes to '"';
 *    quotes may contain ';', '=', CR and LF
 *  - trailing/leading whitespace trimmed from each decoded VALUE only
 *  - required: WINDOW (3..50), RATE (0..30), LIMIT (1..75), canonical uints
 *  - optional: COLOR ("white"|"black"), FLAGS (array)
 *  - unknown keys retained as strings, in field order, after known fields
 */

var KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
var CANONICAL_UINT = /^(?:0|[1-9][0-9]*)$/;
var FLAG_TOKEN = /^[A-Za-z0-9_.-]+$/;

// Schema order used for known fields on the output object.
var KNOWN_FIELD_ORDER = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
var REQUIRED_FIELDS = ['WINDOW', 'RATE', 'LIMIT'];

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

function isKnown(key) {
  return KNOWN_FIELD_ORDER.indexOf(key) !== -1;
}

/**
 * Split the raw text into records of decoded { key, value } pairs.
 * Purely syntactic: no semantic validation happens here.
 */
function tokenizeRecords(text) {
  var n = text.length;
  var i = 0;
  var records = [];
  var current = null;

  function finishRecord() {
    records.push(current);
    current = null;
  }

  while (i < n) {
    var raw;
    var key;
    var value;

    if (text[i] === '"') {
      // Quoted field: read up to the matching closing quote.
      i += 1;
      var buffer = '';
      var closed = false;
      while (i < n) {
        var ch = text[i];
        if (ch === '"') {
          if (i + 1 < n && text[i + 1] === '"') {
            buffer += '"';
            i += 2;
            continue;
          }
          closed = true;
          i += 1;
          break;
        }
        buffer += ch;
        i += 1;
      }
      if (!closed) throw invalidFormat();

      // Only a field separator or a record ending may follow the closing quote.
      if (i < n) {
        var after = text[i];
        if (after !== ';' && after !== '\n' && after !== '\r') throw invalidFormat();
      }

      // Inside quotes only the first '=' separates key from value, so values
      // may themselves contain '=' characters.
      var quotedEq = buffer.indexOf('=');
      if (quotedEq === -1) throw invalidFormat();
      key = buffer.slice(0, quotedEq);
      value = buffer.slice(quotedEq + 1);
      raw = buffer;
    } else {
      // Unquoted field: read up to a field/record separator.
      var start = i;
      while (i < n) {
        var c = text[i];
        if (c === ';' || c === '\n' || c === '\r') break;
        if (c === '"') throw invalidFormat();
        i += 1;
      }
      raw = text.slice(start, i);

      var firstEq = raw.indexOf('=');
      if (firstEq === -1) throw invalidFormat();
      if (raw.indexOf('=', firstEq + 1) !== -1) throw invalidFormat();
      key = raw.slice(0, firstEq);
      value = raw.slice(firstEq + 1);
    }

    if (!KEY_PATTERN.test(key)) throw invalidFormat();
    value = value.trim();

    if (current === null) current = [];
    for (var f = 0; f < current.length; f += 1) {
      if (current[f].key === key) throw invalidFormat();
    }
    current.push({ key: key, value: value });

    if (i < n) {
      var sep = text[i];
      if (sep === ';') {
        i += 1;
      } else if (sep === '\n') {
        i += 1;
        finishRecord();
      } else if (sep === '\r') {
        i += 1;
        if (i < n && text[i] === '\n') i += 1;
        finishRecord();
      } else {
        // Unreachable: both branches above stop only at separators or EOF.
        throw invalidFormat();
      }
    }
  }

  if (current !== null) finishRecord();
  return records;
}

function parseCanonicalInteger(text) {
  if (!CANONICAL_UINT.test(text)) return null;
  var value = Number(text);
  if (!Number.isFinite(value)) return null;
  return value;
}

function parseFlags(value) {
  if (value === '') return [];
  var tokens = value.split(/[\s,]+/);
  var flags = [];
  for (var i = 0; i < tokens.length; i += 1) {
    var token = tokens[i];
    if (token === '') continue;
    if (!FLAG_TOKEN.test(token)) throw invalidValue();
    flags.push(token);
  }
  return flags;
}

// Assigns through defineProperty so keys such as "__proto__" stay plain data
// and never touch the object's prototype.
function setOwnKey(target, key, value) {
  Object.defineProperty(target, key, {
    value: value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}

function buildRecord(fields) {
  var values = new Map();
  for (var i = 0; i < fields.length; i += 1) {
    values.set(fields[i].key, fields[i].value);
  }

  for (var r = 0; r < REQUIRED_FIELDS.length; r += 1) {
    if (!values.has(REQUIRED_FIELDS[r])) throw invalidValue();
  }

  var window = parseCanonicalInteger(values.get('WINDOW'));
  if (window === null || window < 3 || window > 50) throw invalidValue();

  var rate = parseCanonicalInteger(values.get('RATE'));
  if (rate === null || rate < 0 || rate > 30) throw invalidValue();

  var limit = parseCanonicalInteger(values.get('LIMIT'));
  if (limit === null || limit < 1 || limit > 75) throw invalidValue();

  var color = null;
  if (values.has('COLOR')) {
    color = values.get('COLOR');
    if (color !== 'white' && color !== 'black') throw invalidValue();
  }

  var flags = null;
  if (values.has('FLAGS')) {
    flags = parseFlags(values.get('FLAGS'));
  }

  var out = {};
  setOwnKey(out, 'WINDOW', window);
  setOwnKey(out, 'RATE', rate);
  setOwnKey(out, 'LIMIT', limit);
  if (color !== null) setOwnKey(out, 'COLOR', color);
  if (flags !== null) setOwnKey(out, 'FLAGS', flags);

  for (var j = 0; j < fields.length; j += 1) {
    var key = fields[j].key;
    if (isKnown(key)) continue;
    setOwnKey(out, key, fields[j].value);
  }

  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  var records = tokenizeRecords(text);
  var out = [];
  for (var i = 0; i < records.length; i += 1) {
    out.push(buildRecord(records[i]));
  }
  return out;
}

module.exports = { parseBundle: parseBundle };
