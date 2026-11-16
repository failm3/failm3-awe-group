'use strict';

const DELIM = ';';

function invalid() {
  return new Error('INVALID_FORMAT');
}

function parseRosterExport(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const n = text.length;
  const rows = [];
  let row = [];
  let i = 0;

  // True when position k holds a field separator: delimiter, LF, or CRLF.
  const atSeparator = (k) =>
    text[k] === DELIM || text[k] === '\n' || (text[k] === '\r' && text[k + 1] === '\n');

  while (true) {
    let field = '';
    if (text[i] === '"') {
      i++;
      let closed = false;
      while (i < n) {
        const c = text[i];
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        field += c;
        i++;
      }
      // Unterminated quote, or anything but a separator/end after the closing quote.
      if (!closed || (i < n && !atSeparator(i))) throw invalid();
    } else {
      while (i < n && !atSeparator(i)) {
        if (text[i] === '"') throw invalid();
        field += text[i];
        i++;
      }
    }

    row.push(field);

    if (i >= n) {
      rows.push(row);
      return rows;
    }
    if (text[i] === DELIM) {
      i++;
      continue;
    }
    // Record separator (LF or CRLF).
    i += text[i] === '\r' ? 2 : 1;
    rows.push(row);
    row = [];
    if (i >= n) return rows; // a trailing record separator does not add an empty row
  }
}

module.exports = { parseRosterExport };
