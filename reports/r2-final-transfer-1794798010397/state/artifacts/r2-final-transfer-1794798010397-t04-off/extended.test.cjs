'use strict';
const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');

const eq = (input, expected, label) => {
  let got;
  try { got = parseExport(input); } catch (e) { got = 'THREW:' + e.message; }
  assert.deepEqual(got, expected, label + ' :: ' + JSON.stringify(input));
};
const bad = (input, msg, label) => {
  let got;
  try { got = parseExport(input); got = { ok: got }; } catch (e) { got = e.message; }
  assert.equal(got, msg, label + ' :: ' + JSON.stringify(input) + ' got ' + JSON.stringify(got));
};

// basics
eq('', [], 'empty');
eq('WINDOW=3;RATE=1;LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }], 'single');
// record separators
eq('WINDOW=3;RATE=1;LIMIT=2\nWINDOW=4;RATE=2;LIMIT=3', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }], 'LF');
eq('WINDOW=3;RATE=1;LIMIT=2\r\nWINDOW=4;RATE=2;LIMIT=3', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }], 'CRLF');
eq('WINDOW=3;RATE=1;LIMIT=2\rWINDOW=4;RATE=2;LIMIT=3', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }], 'CR');
eq('WINDOW=3;RATE=1;LIMIT=2\n', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }], 'trailing LF');
eq('WINDOW=3;RATE=1;LIMIT=2\r\n', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }], 'trailing CRLF');

// quoting
eq('"WINDOW=3";"RATE=1";"LIMIT=2"', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }], 'all quoted');
eq('WINDOW=3;RATE=1;LIMIT=2;"COLOR=a b c"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a b c' }], 'whole field quoted w/ spaces');
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=a b c', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a b c' }], 'unquoted interior spaces');
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="a b c"', 'THREW:INVALID_FORMAT', 'partial quote rejected');
eq('"WINDOW=3;RATE=1;LIMIT=2"', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }], 'whole record quoted');
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="a""b"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a"b' }], 'escaped quote');
eq('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=a\r\nb"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a\r\nb' }], 'CRLF inside quotes');
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="x=y"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'x=y' }], 'equals inside quoted value');
eq('"WI""NDOW=3";RATE=1;LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }], 'quoted key with escape');

// literals as strings / arrays
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=007', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: '007' }], 'color leading zero ok');
eq('WINDOW=3;RATE=1;LIMIT=2;FLAGS=a,b', [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: ['a', 'b'] }], 'flags split');
eq('WINDOW=3;RATE=1;LIMIT=2;FLAGS=', [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: [] }], 'empty flags');

// unknown keys retained in field order, after known schema order
const unk = parseExport('Z=1;A=2;WINDOW=3;RATE=1;LIMIT=2;M=x');
assert.deepEqual(Object.keys(unk[0]), ['WINDOW', 'RATE', 'LIMIT', 'Z', 'A', 'M'], 'key order');
assert.deepEqual(unk[0], { WINDOW: 3, RATE: 1, LIMIT: 2, Z: '1', A: '2', M: 'x' }, 'unknown retained as strings');

// prototype-looking keys are data
const proto = parseExport('__proto__=x;constructor=y;WINDOW=3;RATE=1;LIMIT=2');
assert.equal(Object.getPrototypeOf(proto[0]), Object.prototype, 'ordinary prototype');
assert.equal(Object.prototype.hasOwnProperty.call(proto[0], '__proto__'), true, 'own __proto__');
assert.equal(proto[0]['__proto__'], 'x');
assert.deepEqual(Object.keys(proto[0]), ['WINDOW', 'RATE', 'LIMIT', '__proto__', 'constructor'], 'proto key order');

// semantic
eq('WINDOW=0;RATE=1;LIMIT=2', 'THREW:INVALID_VALUE', 'window 0');
eq('WINDOW=61;RATE=1;LIMIT=2', 'THREW:INVALID_VALUE', 'window 61');
eq('WINDOW=2;RATE=11;LIMIT=2', 'THREW:INVALID_VALUE', 'rate 11');
eq('WINDOW=2;RATE=1;LIMIT=0', 'THREW:INVALID_VALUE', 'limit 0');
eq('WINDOW=2;RATE=1;LIMIT=126', 'THREW:INVALID_VALUE', 'limit 126');
eq('WINDOW=03;RATE=1;LIMIT=2', 'THREW:INVALID_VALUE', 'window leading zero');
eq('WINDOW=-3;RATE=1;LIMIT=2', 'THREW:INVALID_VALUE', 'window negative');
eq('WINDOW=3.0;RATE=1;LIMIT=2', 'THREW:INVALID_VALUE', 'window float');
eq('WINDOW=3;RATE=1', 'THREW:INVALID_VALUE', 'missing limit');
eq('RATE=1;LIMIT=2', 'THREW:INVALID_VALUE', 'missing window');
// syntax takes precedence over semantics
eq('WINDOW=0;RATE=1;LIMIT=2;', 'THREW:INVALID_FORMAT', 'format beats value');
eq('WINDOW=0;RATE=1;LIMIT=2;bad=x', 'THREW:INVALID_FORMAT', 'bad key beats value');

// format errors
eq('WINDOW=3;RATE=1;LIMIT=2;WINDOW=4', 'THREW:INVALID_FORMAT', 'duplicate key');
eq('WINDOW=3;RATE=1;LIMIT=2;"WINDOW=4"', 'THREW:INVALID_FORMAT', 'duplicate decoded');
eq('"WINDOW=3"x;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'junk after close quote');
eq('"WINDOW=3;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'unterminated');
eq('WINDOW"=3";RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'quote in unquoted');
eq('window=3;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'lowercase key');
eq('1WINDOW=3;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'bad key start');
eq('WINDOW=3;RATE=1;LIMIT=2;A=b=c', 'THREW:INVALID_FORMAT', 'two equals unquoted');
eq('WINDOW= 3;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'untrimmed value');
eq('WINDOW=3 ;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'trailing space value');
eq('WINDOW=3;RATE=1;LIMIT=2;', 'THREW:INVALID_FORMAT', 'trailing separator');
eq(';WINDOW=3;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'leading separator');
eq('WINDOW=3;;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'double separator');
eq('WINDOW3;RATE=1;LIMIT=2', 'THREW:INVALID_FORMAT', 'no equals');

console.log('extended PASS');
