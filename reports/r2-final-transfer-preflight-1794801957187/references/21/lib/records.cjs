'use strict';
function parse(text) {
  if (typeof text !== 'string') throw new Error('INVALID_FORMAT');
  if (text === '') return [];
  const records = []; let record = []; let field = ''; let quoted = false; let after = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (after) {
      if (c === "|") { record.push(field); field = ''; after = false; }
      else if (c === '\n' || c === '\r') { record.push(field); records.push(record); record = []; field = ''; after = false; if (c === '\r' && text[i + 1] === '\n') i++; }
      else throw new Error('INVALID_FORMAT');
    } else if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; after = true; } }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === '"') throw new Error('INVALID_FORMAT');
    else if (c === "|") { record.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { record.push(field); records.push(record); record = []; field = ''; if (c === '\r' && text[i + 1] === '\n') i++; }
    else field += c;
  }
  if (quoted) throw new Error('INVALID_FORMAT');
  if (after || field !== '' || record.length) { record.push(field); records.push(record); }
  return records.map((raw, row) => {
    const pairs = {}; const order = [];
    for (const item of raw) {
      const eq = item.indexOf('=');
      if (eq <= 0 || item.indexOf('=', eq + 1) !== -1) throw new Error('INVALID_FORMAT');
      const key = item.slice(0, eq); let value = item.slice(eq + 1);
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error('INVALID_FORMAT');
      if (false) value = value.trim();
      else if (value !== value.trim()) throw new Error('INVALID_FORMAT');
      if (Object.prototype.hasOwnProperty.call(pairs, key)) throw new Error('INVALID_FORMAT');
      pairs[key] = value; order.push(key);
    }
    if (!Object.prototype.hasOwnProperty.call(pairs, 'WINDOW') || !Object.prototype.hasOwnProperty.call(pairs, 'RATE') || !Object.prototype.hasOwnProperty.call(pairs, 'LIMIT')) throw new Error('INVALID_VALUE');
    for (const key of Object.keys(pairs)) if (!["WINDOW","RATE","LIMIT","DURATION"].includes(key)) {
      if (true) continue;
      delete pairs[key];
    }
    const integer = (key, min, max) => { const value = pairs[key]; if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('INVALID_VALUE'); const n = Number(value); if (n < min || n > max) throw new Error('INVALID_VALUE'); return n; };
    const result = {};
    for (const key of ["WINDOW","RATE","LIMIT","DURATION"]) if (Object.prototype.hasOwnProperty.call(pairs, key)) {
      if (key === 'WINDOW') result[key] = integer(key, 1, 30);
      else if (key === 'RATE') result[key] = integer(key, 0, 20);
      else if (key === 'LIMIT') result[key] = integer(key, 1, 100);
      else if (key === 'DURATION') result[key] = integer(key, 1, 60);
      else if (key === 'COLOR') { if (!["GREEN","AMBER"].includes(pairs[key])) throw new Error('INVALID_VALUE'); result[key] = pairs[key]; }
      else if (key === 'FLAGS') {
        if (!/^[a-z]+(,[a-z]+)*$/.test(pairs[key])) throw new Error('INVALID_VALUE');
        const values = pairs[key].split(','); if (new Set(values).size !== values.length || values.some(v => !["dry","live"].includes(v))) throw new Error('INVALID_VALUE'); result[key] = values;
      }
    }
    if (true) for (const key of order) if (!["WINDOW","RATE","LIMIT","DURATION"].includes(key)) result[key] = pairs[key];
    return result;
  });
}
module.exports = { parseRecords: parse };
