'use strict';

// Roster export parser for ";"-delimited UTF-8 text, implementing FORMAT.md.
// - First row is data (no header handling); returns an array of rows of strings.
// - Empty input returns [].
// - Quoted fields may contain the delimiter, CR/LF newlines and empty text.
// - Two double quotes inside a quoted field decode to one literal double quote.
// - Unquoted fields may be empty, including trailing fields.
// - LF and CRLF record separators are accepted.
// - Unterminated quotes, characters after a closing quote, and quotes inside an
//   unquoted field throw Error('INVALID_FORMAT').

const DELIMITER = ';';
const INVALID_FORMAT = 'INVALID_FORMAT';

const FIELD_START = 0;
const UNQUOTED = 1;
const QUOTED = 2;
const QUOTE_CLOSED = 3;

function parseRosterExport(text) {
  if (typeof text !== 'string') {
    throw new Error(INVALID_FORMAT);
  }
  if (text.length === 0) {
    return [];
  }

  const rows = [];
  let row = [];
  let field = '';
  let state = FIELD_START;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
    state = FIELD_START;
  };
  const endRecord = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    if (state === QUOTED) {
      if (ch === '"') {
        state = QUOTE_CLOSED;
      } else {
        field += ch;
      }
      i += 1;
      continue;
    }

    if (state === QUOTE_CLOSED && ch === '"') {
      field += '"';
      state = QUOTED;
      i += 1;
      continue;
    }

    if (ch === DELIMITER) {
      endField();
      i += 1;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      endRecord();
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }

    if (state === FIELD_START) {
      if (ch === '"') {
        state = QUOTED;
      } else {
        field = ch;
        state = UNQUOTED;
      }
      i += 1;
      continue;
    }

    if (state === UNQUOTED && ch !== '"') {
      field += ch;
      i += 1;
      continue;
    }

    // Quote inside an unquoted field, or any character after a closing quote.
    throw new Error(INVALID_FORMAT);
  }

  if (state === QUOTED) {
    throw new Error(INVALID_FORMAT);
  }

  // A trailing record separator does not create an extra empty row.
  if (state !== FIELD_START || row.length > 0) {
    endRecord();
  }

  return rows;
}

module.exports = { parseRosterExport };
