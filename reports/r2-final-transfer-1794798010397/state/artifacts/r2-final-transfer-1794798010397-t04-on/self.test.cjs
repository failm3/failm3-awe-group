'use strict';
const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');

let n = 0;
function eq(input, expected) {
  n++;
  assert.deepEqual(parseExport(input), expected, 'input: ' + JSON.stringify(input));
}
function bad(input, msg) {
  n++;
  assert.throws(() => parseExport(input), (e) => e instanceof Error && e.message === msg,
    'input: ' + JSON.stringify(input) + ' expected ' + msg);
}

// --- baseline / required fields ---
eq('', []);
eq('WINDOW=3;RATE=1;LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq('WINDOW=60;RATE=0;LIMIT=1', [{ WINDOW: 60, RATE: 0, LIMIT: 1 }]);
eq('WINDOW=2;RATE=10;LIMIT=125', [{ WINDOW: 2, RATE: 10, LIMIT: 125 }]);
eq('LIMIT=2;RATE=1;WINDOW=3', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]); // schema order

// --- record separators ---
eq('WINDOW=3;RATE=1;LIMIT=2\nWINDOW=4;RATE=2;LIMIT=3',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
eq('WINDOW=3;RATE=1;LIMIT=2\r\nWINDOW=4;RATE=2;LIMIT=3',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
eq('WINDOW=3;RATE=1;LIMIT=2\rWINDOW=4;RATE=2;LIMIT=3',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
eq('WINDOW=3;RATE=1;LIMIT=2\n', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);   // trailing LF
eq('WINDOW=3;RATE=1;LIMIT=2\r\n', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq('WINDOW=3;RATE=1;LIMIT=2\r', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);

// --- optional known fields ---
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=red', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;FLAGS=sfo,df', [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: ['sfo', 'df'] }]);
eq('WINDOW=3;RATE=1;LIMIT=2;FLAGS=', [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: [] }]);

// --- unknown keys retained, original order, after known fields ---
eq('EXTRA=abc;WINDOW=3;RATE=1;LIMIT=2;ZZZ=9',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, EXTRA: 'abc', ZZZ: '9' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=red;FLAGS=a;N=1',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red', FLAGS: ['a'], N: '1' }]);
// unknown key with integer-looking value stays a string
eq('WINDOW=3;RATE=1;LIMIT=2;N=007', [{ WINDOW: 3, RATE: 1, LIMIT: 2, N: '007' }]);

// --- prototype-looking keys are plain data ---
{
  n++;
  const r = parseExport('WINDOW=3;RATE=1;LIMIT=2;CONSTRUCTOR=x;TOSTRING=y');
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'CONSTRUCTOR', 'TOSTRING']);
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.equal(r[0].CONSTRUCTOR, 'x');
  assert.equal(r[0].TOSTRING, 'y');
  assert.equal({}.CONSTRUCTOR === 'x', false); // prototype untouched
}

// --- quoting ---
eq('"WINDOW=3";"RATE=1";"LIMIT=2"', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq('WINDOW="3";RATE=1;LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq('"WINDOW=3";RATE=1;LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="re;d"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 're;d' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="a=b"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a=b' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="a""b"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a"b' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="a\nb"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a\nb' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR="a\r\nb"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a\r\nb' }]);
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=""', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: '' }]);
eq('"WINDOW=3";RATE=1;LIMIT=2\r\n"WINDOW=4";RATE=2;LIMIT=3',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);

// --- INVALID_FORMAT: syntax ---
bad('WINDOW=3;RATE=1', 'INVALID_FORMAT');           // zero-field record -> empty field
bad('WINDOW=3;RATE=1;LIMIT=2;', 'INVALID_FORMAT');   // trailing separator
bad(';WINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT');   // leading separator
bad('WINDOW=3;;RATE=1;LIMIT=2', 'INVALID_FORMAT');   // empty field
bad('WINDOW=3;RATE=1;LIMIT=2\n\nWINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT'); // blank line
bad('\n', 'INVALID_FORMAT');
bad('WINDOW3;RATE=1;LIMIT=2', 'INVALID_FORMAT');     // no equals
bad('WINDOW=3=4;RATE=1;LIMIT=2', 'INVALID_FORMAT');  // two equals unquoted
bad('window=3;RATE=1;LIMIT=2', 'INVALID_FORMAT');    // bad key case
bad('1WINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT');   // bad key start
bad('WIN DOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT');   // space in key
bad('=3;RATE=1;LIMIT=2', 'INVALID_FORMAT');          // empty key
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR="abc', 'INVALID_FORMAT');  // unterminated
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR=ab"c"', 'INVALID_FORMAT'); // quote in unquoted
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR="a"b', 'INVALID_FORMAT');  // chars after close
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR="a" ', 'INVALID_FORMAT');  // space after close
bad('WINDOW=3;RATE=1;WINDOW=4;LIMIT=2', 'INVALID_FORMAT');    // duplicate
bad('WINDOW=3;"WINDOW=4";RATE=1;LIMIT=2', 'INVALID_FORMAT');  // duplicate decoded
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR= red', 'INVALID_FORMAT');  // leading space
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR=red ', 'INVALID_FORMAT');  // trailing space
bad('WINDOW= 3;RATE=1;LIMIT=2', 'INVALID_FORMAT');            // value whitespace
bad('WINDOW=3;RATE=1;LIMIT=2;COLOR=" x"', 'INVALID_FORMAT');  // quoted ws too

// --- INVALID_VALUE: semantics ---
bad('RATE=1;LIMIT=2', 'INVALID_VALUE');              // missing WINDOW
bad('WINDOW=3;LIMIT=2', 'INVALID_VALUE');            // missing RATE
bad('WINDOW=3;RATE=1', 'INVALID_VALUE');             // missing LIMIT
bad('WINDOW=1;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=61;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=0;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=03;RATE=1;LIMIT=2', 'INVALID_VALUE');    // non-canonical
bad('WINDOW=-3;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=+3;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=abc;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=11;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=-1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1.5;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=0', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=126', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=2.0', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=1e2', 'INVALID_VALUE');
bad('WINDOW="";RATE=1;LIMIT=2', 'INVALID_VALUE');    // empty numeric

// --- precedence: syntax/duplicate/whitespace beat semantics ---
bad('WINDOW=999;RATE=1;LIMIT=2;BADKEY', 'INVALID_FORMAT');       // syntax beats value
bad('WINDOW=999;RATE=1;LIMIT=2;WINDOW=3', 'INVALID_FORMAT');     // dup beats value
bad('WINDOW= 999;RATE=1;LIMIT=2', 'INVALID_FORMAT');             // ws beats value
bad('WINDOW=3;RATE=99;LIMIT=2;COLOR="a', 'INVALID_FORMAT');      // unterminated beats value

// --- instance checks ---
{
  n++;
  const r = parseExport('WINDOW=3;RATE=1;LIMIT=2');
  assert.ok(Array.isArray(r));
  assert.equal(typeof r[0], 'object');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.equal(typeof r[0].WINDOW, 'number');
  assert.equal(typeof r[0].RATE, 'number');
  assert.equal(typeof r[0].LIMIT, 'number');
}

console.log('self-test PASS (' + n + ' assertions)');
