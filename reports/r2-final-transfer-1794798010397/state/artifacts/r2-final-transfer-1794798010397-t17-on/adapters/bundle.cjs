'use strict';

// Separated key/value record parser (see FORMAT.md).

const INVALID_FORMAT = 'INVALID_FORMAT';
const INVALID_VALUE = 'INVALID_VALUE';

// Known-field schema order (drives output key insertion order).
const SCHEMA = ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS'];
const REQUIRED = ['WINDOW', 'RATE', 'LIMIT'];
const INT_RANGES = {
  WINDOW: [3, 40],
  RATE: [0, 20],
  LIMIT: [1, 150],
  DURATION: [1, 90]
};

const KEY_RE = /^[A-Z][A-Z0-9_]*$/;
const CANONICAL_UINT_RE = /^(?:0|[1-9][0-9]*)$/;

function fail(message) {
  throw new Error(message);
}

// Splits the raw text into records of decoded fields.
// Each field is { text: <decoded characters>, quoted: <boolean> }.
function splitRecords(text) {
  const records = [];
  let fields = [];
  let buf = '';
  let started = false; // field has any content (quoted or not)
  let quoted = false;
  let closed = false; // a closing quote has been consumed
  const n = text.length;

  const pushField = () => {
    fields.push({ text: buf, quoted: started && wasQuoted });
    buf = '';
    started = false;
    wasQuoted = false;
    closed = false;
  };
  const pushRecord = () => {
    records.push(fields);
    fields = [];
  };
  const endRecord = (c, i) => {
    pushField();
    pushRecord();
    return c === '\r' && text[i + 1] === '\n' ? i + 1 : i;
  };

  let wasQuoted = false;

  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (closed) {
      if (c === '|') {
        pushField();
      } else if (c === '\n' || c === '\r') {
        i = endRecord(c, i);
      } else {
        fail(INVALID_FORMAT);
      }
    } else if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        buf += c;
      }
    } else if (c === '"') {
      if (started) fail(INVALID_FORMAT);
      started = true;
      wasQuoted = true;
      quoted = true;
    } else if (c === '|') {
      pushField();
    } else if (c === '\n' || c === '\r') {
      i = endRecord(c, i);
    } else {
      buf += c;
      started = true;
    }
  }

  if (quoted) fail(INVALID_FORMAT);
  if (closed || started || fields.length > 0) {
    pushField();
    pushRecord();
  }
  return records;
}

function parseRecord(rawFields) {
  const pairs = [];
  const seen = new Set();

  for (const field of rawFields) {
    const text = field.text;
    const eq = text.indexOf('=');
    if (eq < 0) fail(INVALID_FORMAT);
    const key = text.slice(0, eq);
    const value = text.slice(eq + 1);
    if (!KEY_RE.test(key)) fail(INVALID_FORMAT);
    if (!field.quoted && value.indexOf('=') >= 0) fail(INVALID_FORMAT);
    if (value !== value.trim()) fail(INVALID_FORMAT);
    if (seen.has(key)) fail(INVALID_FORMAT);
    seen.add(key);
    pairs.push([key, value]);
  }

  const values = new Map(pairs);
  for (const key of REQUIRED) {
    if (!values.has(key)) fail(INVALID_VALUE);
  }

  const out = {};
  for (const key of SCHEMA) {
    if (!values.has(key)) continue;
    const raw = values.get(key);
    if (key === 'COLOR') {
      out.COLOR = raw;
    } else if (key === 'FLAGS') {
      out.FLAGS = raw === '' ? [] : raw.split(',');
    } else {
      const range = INT_RANGES[key];
      if (!CANONICAL_UINT_RE.test(raw)) fail(INVALID_VALUE);
      const num = Number(raw);
      if (num < range[0] || num > range[1]) fail(INVALID_VALUE);
      out[key] = num;
    }
  }
  return out;
}

function parseBundle(text) {
  if (typeof text !== 'string') fail(INVALID_FORMAT);
  if (text === '') return [];
  return splitRecords(text).map(parseRecord);
}

module.exports = { parseBundle };
