'use strict';
function parseLedgerCsv(text) {
  if (typeof text !== 'string') throw new Error('INVALID_FORMAT');
  if (text === '') return [];
  const rows = []; let row = []; let field = ''; let quoted = false; let after = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (after) {
      if (c === ',') { row.push(field); field = ''; after = false; }
      else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row = []; field = ''; after = false; if (c === '\r' && text[i + 1] === '\n') i++; }
      else throw new Error('INVALID_FORMAT');
    } else if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; after = true; } }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === '"') throw new Error('INVALID_FORMAT');
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { row.push(field); rows.push(row); row = []; field = ''; if (c === '\r' && text[i + 1] === '\n') i++; }
    else field += c;
  }
  if (quoted) throw new Error('INVALID_FORMAT');
  if (after || field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
module.exports = { parseLedgerCsv };
