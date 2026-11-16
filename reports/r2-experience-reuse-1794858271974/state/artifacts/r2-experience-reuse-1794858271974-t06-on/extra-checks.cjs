'use strict';
const assert = require('node:assert/strict');
const { parseExport: p } = require('./src/export.cjs');
const err = (s) => { try { p(s); return 'no-throw'; } catch (e) { return e.constructor.name + '/' + e.message; } };

assert.deepEqual(p(''), []);
assert.equal(err('  \n'), 'Error/INVALID_FORMAT');

// LF, CRLF, CR record endings, plus a terminating final newline
assert.deepEqual(
  p('WINDOW=2;RATE=1;LIMIT=2\r\nWINDOW=3;RATE=2;LIMIT=3\rWINDOW=4;RATE=3;LIMIT=4\nWINDOW=5;RATE=4;LIMIT=5\n'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2 }, { WINDOW: 3, RATE: 2, LIMIT: 3 },
   { WINDOW: 4, RATE: 3, LIMIT: 4 }, { WINDOW: 5, RATE: 4, LIMIT: 5 }]);

// whitespace trimmed only from decoded VALUE
assert.deepEqual(p('WINDOW= 2 ;RATE=\t1;LIMIT=2'), [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(p('WINDOW=2;RATE=1;LIMIT=2;COLOR="  amber  "'), [{ WINDOW: 2, RATE: 1, LIMIT: 2, COLOR: 'amber' }]);

// whole-field quoting: separators, equals, CR/LF and "" inside quotes
assert.deepEqual(
  p('"NOTE=a;b=c\r\n""q""";WINDOW=1;RATE=0;LIMIT=25'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 25, NOTE: 'a;b=c\r\n"q"' }]);
assert.equal(err('"WINDOW=1;RATE=0;LIMIT=1"'), 'Error/INVALID_VALUE');
assert.deepEqual(p('"WINDOW=1";"RATE=0";"LIMIT=1";"X=a=b"'), [{ WINDOW: 1, RATE: 0, LIMIT: 1, X: 'a=b' }]);

// unknown keys: retained in field order after known fields; prototype-safe
const r = p('ZED=1;COLOR=green;__proto__=x;LIMIT=1;RATE=0;WINDOW=1;ALPHA=2');
assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'ZED', '__proto__', 'ALPHA']);
assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
assert.equal(Object.prototype.hasOwnProperty.call(r[0], '__proto__'), true);
assert.equal(r[0].__proto__, 'x');
assert.equal(r[0].constructor, Object);
// COLOR keeps document order among known fields even when written late
assert.deepEqual(Object.keys(p('WINDOW=1;RATE=0;LIMIT=1;COLOR=amber;CUSTOM=v')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'CUSTOM']);

// syntax / duplicate / whitespace errors take precedence: INVALID_FORMAT
const formatCases = [
  '"WINDOW=1',                                  // unterminated quote
  'WINDOW=1;RATE=0;LIMIT=1;X=a"b',              // quote inside unquoted field
  '"WINDOW=1"x;RATE=0;LIMIT=1',                 // text after closing quote
  'WINDOW=1;RATE=0;LIMIT=1;X=a=b',              // two equals in unquoted field
  'WINDOW=1;RATE=0;LIMIT=1;bad=1',              // bad key
  ' WINDOW=1;RATE=0;LIMIT=1',                   // untrimmed key
  'WINDOW=1;RATE=0;LIMIT=1;"WINDOW=2"',         // duplicate decoded key
  'WINDOW=1;RATE=0;LIMIT=1;NOEQ',               // missing equals
  'WINDOW=1;RATE=0;LIMIT=1;;X=1',               // empty field
  'WINDOW=1;RATE=0;LIMIT=1\n\nWINDOW=1;RATE=0;LIMIT=1', // blank record
  'WINDOW=99;WINDOW=1;RATE=0;LIMIT=1',          // dup beats bad value
  'WINDOW=1;RATE=0;LIMIT=1;=1',                 // empty key
  'WINDOW=1;RATE=0;LIMIT=1;X=1;',               // trailing separator
];
for (const s of formatCases) assert.equal(err(s), 'Error/INVALID_FORMAT', JSON.stringify(s));

// semantic errors: INVALID_VALUE
const valueCases = [
  'WINDOW=0;RATE=0;LIMIT=1', 'WINDOW=31;RATE=0;LIMIT=1', 'WINDOW=01;RATE=0;LIMIT=1',
  'WINDOW=1;RATE=31;LIMIT=1', 'WINDOW=1;RATE=-0;LIMIT=1', 'WINDOW=1;RATE=0;LIMIT=26',
  'WINDOW=1;RATE=0;LIMIT=0', 'WINDOW=1;RATE=0', 'WINDOW=1;RATE=0;LIMIT=',
  'WINDOW=1;RATE=0;LIMIT=1;COLOR=Green', 'WINDOW=1.0;RATE=0;LIMIT=1',
  'WINDOW=+1;RATE=0;LIMIT=1', 'WINDOW=1;RATE=0;LIMIT=1;COLOR=red',
  'WINDOW=1e1;RATE=0;LIMIT=1', 'WINDOW=0x2;RATE=0;LIMIT=1',
];
for (const s of valueCases) assert.equal(err(s), 'Error/INVALID_VALUE', JSON.stringify(s));

// boundaries accepted
assert.deepEqual(p('WINDOW=1;RATE=0;LIMIT=1'), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]);
assert.deepEqual(p('WINDOW=30;RATE=30;LIMIT=25;COLOR=amber'), [{ WINDOW: 30, RATE: 30, LIMIT: 25, COLOR: 'amber' }]);

// non-string input
assert.equal(err(undefined), 'Error/INVALID_FORMAT');
assert.equal(err(42), 'Error/INVALID_FORMAT');

console.log('extra checks PASS');
