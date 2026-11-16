'use strict';

// Separated key/value record parser (see FORMAT.md).

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

// Known-field schema order (required fields first, then optional ones).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS'];
const KNOWN = new Set(SCHEMA);

const RANGES = {
  WINDOW: [2, 60],
  RATE: [0, 10],
  LIMIT: [1, 125],
};

function invalidFormat() {
  return new Error('INVALID_FORMAT');
}

function invalidValue() {
  return new Error('INVALID_VALUE');
}

// Insert an own data property. Used instead of plain assignment so that
// prototype-looking keys (e.g. "__proto__") stay ordinary own keys and never
// touch the object's prototype.
function setOwn(obj, key, value) {
  Object.defineProperty(obj, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

// Split a decoded field into KEY / VALUE and enforce the syntax rules that can
// be decided on a single field: one (unquoted) equals sign, key grammar and the
// whitespace policy for VALUE.
function splitField(raw, wasQuoted) {
  let key;
  let value;

  if (wasQuoted) {
    // Quoted field content may itself contain separators, equals signs, CR/LF.
    const eq = raw.indexOf('=');
    if (eq === -1) throw invalidFormat();
    key = raw.slice(0, eq);
    value = raw.slice(eq + 1);
  } else {
    const eq = raw.indexOf('=');
    if (eq === -1) throw invalidFormat();
    if (raw.indexOf('=', eq + 1) !== -1) throw invalidFormat();
    key = raw.slice(0, eq);
    value = raw.slice(eq + 1);
  }

  if (!KEY_RE.test(key)) throw invalidFormat();
  if (value !== value.trim()) throw invalidFormat();

  return { key, value };
}

function toInt(key, value) {
  if (!CANONICAL_UINT_RE.test(value)) throw invalidValue();
  const n = Number(value);
  const [min, max] = RANGES[key];
  if (!Number.isFinite(n) || n < min || n > max) throw invalidValue();
  return n;
}

function toFlags(value) {
  if (value === '') return [];
  return value.split(',');
}

// Turn one fully tokenised record (all syntax already validated per field) into
// the resulting plain object.
function compileRecord(fields) {
  const values = new Map();

  for (const field of fields) {
    if (values.has(field.key)) throw invalidFormat(); // duplicate decoded key
    values.set(field.key, field.value);
  }

  for (const required of ['WINDOW', 'RATE', 'LIMIT']) {
    if (!values.has(required)) throw invalidValue();
  }

  const out = {};

  setOwn(out, 'WINDOW', toInt('WINDOW', values.get('WINDOW')));
  setOwn(out, 'RATE', toInt('RATE', values.get('RATE')));
  setOwn(out, 'LIMIT', toInt('LIMIT', values.get('LIMIT')));

  if (values.has('COLOR')) {
    setOwn(out, 'COLOR', values.get('COLOR'));
  }
  if (values.has('FLAGS')) {
    setOwn(out, 'FLAGS', toFlags(values.get('FLAGS')));
  }

  // Retain unknown keys in original record field order, after known fields.
  for (const [key, value] of values) {
    if (!KNOWN.has(key)) setOwn(out, key, value);
  }

  return out;
}

function parseExport(text) {
  if (typeof text !== 'string') throw invalidFormat();
  if (text === '') return [];

  const records = [];
  let fields = [];

  let raw = '';
  let wasQuoted = false;
  let inQuote = false;
  let closingSeen = false;
  let pending = false;

  const endField = () => {
    fields.push(splitField(raw, wasQuoted));
    raw = '';
    wasQuoted = false;
    closingSeen = false;
    pending = false;
  };

  const endRecord = () => {
    endField();
    const record = fields;
    fields = [];
    records.push(compileRecord(record));
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuote) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          raw += '"';
          i++;
        } else {
          inQuote = false;
          closingSeen = true;
        }
      } else {
        // Inside quotes: separators, equals signs, CR and LF are data.
        raw += c;
      }
      continue;
    }

    if (closingSeen) {
      // Only a separator or a record ending may follow a closing quote.
      if (c === ';') {
        endField();
      } else if (c === '\n') {
        endRecord();
      } else if (c === '\r') {
        if (text[i + 1] === '\n') i++;
        endRecord();
      } else {
        throw invalidFormat();
      }
      continue;
    }

    if (c === '"') {
      // A quote may only open a field, never appear inside an unquoted field.
      if (raw !== '') throw invalidFormat();
      inQuote = true;
      wasQuoted = true;
      pending = true;
      continue;
    }

    if (c === ';') {
      endField();
      continue;
    }

    if (c === '\n') {
      endRecord();
      continue;
    }

    if (c === '\r') {
      if (text[i + 1] === '\n') i++;
      endRecord();
      continue;
    }

    raw += c;
    pending = true;
  }

  if (inQuote) throw invalidFormat(); // unterminated quote

  if (pending || closingSeen || fields.length > 0) endRecord();

  return records;
}

module.exports = { parseExport };
