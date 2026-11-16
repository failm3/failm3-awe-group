'use strict';

/**
 * Ledger parser for ","-delimited UTF-8 text, implementing FORMAT.md.
 *
 * Documented behaviour:
 *  - First row is data; no header treatment.
 *  - Returns an array of rows, each an array of field strings; "" -> [].
 *  - Quoted fields start and end with '"', may contain the delimiter,
 *    CR/LF newlines and empty text.
 *  - "" inside a quoted field decodes to one literal '"'.
 *  - Unquoted fields may be empty, including trailing fields.
 *  - LF and CRLF record separators are both accepted.
 *  - Unterminated quotes, characters after a closing quote, and quotes
 *    inside an unquoted field throw Error('INVALID_FORMAT').
 */

const DELIMITER = ',';
const INVALID_FORMAT = 'INVALID_FORMAT';

// Parser states.
const FIELD_START = 0; // at the beginning of a field (nothing buffered yet)
const UNQUOTED = 1; // inside a bare (unquoted) field
const QUOTED = 2; // inside a quoted field
const QUOTE_CLOSED = 3; // just saw the closing '"' of a quoted field

function parseLedgerCsv(text) {
  if (typeof text !== 'string') {
    throw new Error(INVALID_FORMAT);
  }

  // Empty input yields no rows.
  if (text.length === 0) {
    return [];
  }

  const rows = [];
  let row = [];
  let field = '';
  let state = FIELD_START;
  let i = 0;

  // Records the current field and starts a new one.
  const endField = () => {
    row.push(field);
    field = '';
    state = FIELD_START;
  };

  // Records the current field and the current row.
  const endRecord = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];

    switch (state) {
      case FIELD_START: {
        if (ch === '"') {
          // Quoted field begins; quotes themselves are not part of the value.
          state = QUOTED;
          i += 1;
          break;
        }
        if (ch === DELIMITER) {
          // Empty unquoted field.
          row.push('');
          i += 1;
          break;
        }
        if (ch === '\n' || ch === '\r') {
          // Empty unquoted field terminating a record.
          endRecord();
          i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
          break;
        }
        // First character of an unquoted field.
        field = ch;
        state = UNQUOTED;
        i += 1;
        break;
      }

      case UNQUOTED: {
        if (ch === DELIMITER) {
          endField();
          i += 1;
          break;
        }
        if (ch === '\n' || ch === '\r') {
          endRecord();
          i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
          break;
        }
        if (ch === '"') {
          // Quotes are not allowed inside an unquoted field.
          throw new Error(INVALID_FORMAT);
        }
        field += ch;
        i += 1;
        break;
      }

      case QUOTED: {
        if (ch === '"') {
          state = QUOTE_CLOSED;
          i += 1;
          break;
        }
        // Delimiters, CR/LF newlines and empty text are all literal content.
        field += ch;
        i += 1;
        break;
      }

      case QUOTE_CLOSED: {
        if (ch === '"') {
          // Escaped double quote: "" decodes to a single '"'.
          field += '"';
          state = QUOTED;
          i += 1;
          break;
        }
        if (ch === DELIMITER) {
          endField();
          i += 1;
          break;
        }
        if (ch === '\n' || ch === '\r') {
          endRecord();
          i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
          break;
        }
        // Any other character after a closing quote is malformed.
        throw new Error(INVALID_FORMAT);
      }

      default:
        throw new Error(INVALID_FORMAT);
    }
  }

  // Unterminated quote at end of input.
  if (state === QUOTED) {
    throw new Error(INVALID_FORMAT);
  }

  // Flush the final record unless the input ended exactly on a record
  // separator (a trailing terminator does not create an extra empty row).
  if (state !== FIELD_START || row.length > 0) {
    endRecord();
  }

  return rows;
}

module.exports = { parseLedgerCsv };
