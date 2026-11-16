'use strict';
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

const fmt = (s) => { try { readInput(s); } catch (e) { return e.message; } return 'NO_THROW'; };

// --- basics
assert.deepEqual(readInput(''), []);
assert.deepEqual(readInput('WINDOW=3;RATE=1;LIMIT=2;COLOR=red'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }]);

// --- record separators: LF, CRLF, CR, trailing newline ignored
const one = [{ WINDOW: 20, RATE: 0, LIMIT: 1 }];
assert.deepEqual(readInput('WINDOW=20;RATE=0;LIMIT=1\n'), one);
assert.deepEqual(readInput('WINDOW=20;RATE=0;LIMIT=1\r\n'), one);
assert.deepEqual(readInput('WINDOW=20;RATE=0;LIMIT=1\r'), one);
assert.deepEqual(readInput('WINDOW=20;RATE=0;LIMIT=1\nWINDOW=2;RATE=30;LIMIT=125'),
  [{ WINDOW: 20, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 30, LIMIT: 125 }]);
assert.deepEqual(readInput('WINDOW=20;RATE=0;LIMIT=1\r\nWINDOW=2;RATE=30;LIMIT=125\r\n'),
  [{ WINDOW: 20, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 30, LIMIT: 125 }]);

// --- whitespace trimmed from decoded VALUE only
assert.deepEqual(readInput('WINDOW = 3 ; RATE=1;LIMIT=2'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(readInput('WINDOW=3;RATE=1;LIMIT=2;COLOR= red   '),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }]);
assert.deepEqual(readInput('"WINDOW=3";RATE=1;LIMIT=2'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(readInput('"WINDOW=  3  ";RATE=1;LIMIT=2'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);

// --- key whitespace is NOT trimmed (bad key)
assert.equal(fmt(' WINDOW=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2 '), 'INVALID_FORMAT');

// --- quoting: doubled quotes, separators/newlines inside quotes
assert.deepEqual(readInput('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=""red"""'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }]);
assert.deepEqual(readInput('"WINDOW=3";"RATE=1";"LIMIT=2"\n"WINDOW=4";"RATE=2";"LIMIT=3"'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
// CR/LF and ';' and '=' inside quoted VALUE (still one equals in field text)
assert.equal(fmt('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=re\nd"'), 'INVALID_VALUE');
assert.equal(fmt('"WINDOW=3;RATE=1";LIMIT=2'), 'INVALID_FORMAT'); // two equals in decoded field

// --- syntax errors
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2;COLOR="red"'), 'INVALID_FORMAT'); // quote in unquoted
assert.equal(fmt('"WINDOW=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');            // unterminated
assert.equal(fmt('"WINDOW=3"x;RATE=1;LIMIT=2'), 'INVALID_FORMAT');          // junk after close
assert.equal(fmt('WINDOW3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');              // no equals
assert.equal(fmt('window=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');             // bad key case
assert.equal(fmt('_W=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');                 // bad key start
assert.equal(fmt('W-B=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');                // bad key char
assert.equal(fmt('WINDOW=3;;RATE=1;LIMIT=2'), 'INVALID_FORMAT');            // empty field
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2;'), 'INVALID_FORMAT');            // dangling ';'
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2==3'), 'INVALID_FORMAT');          // two equals
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2;COLOR=red;COLOR=blue'), 'INVALID_FORMAT'); // duplicate

// --- duplicates detected on decoded keys (quoted vs unquoted)
assert.equal(fmt('WINDOW=3;"WINDOW"=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
// --- unknown duplicates also rejected, before being dropped
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2;X=1;X=2'), 'INVALID_FORMAT');
// --- unknown duplicates: quoted-key spelling counts too
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=2;"FOO"=1;FOO=2'), 'INVALID_FORMAT');

// --- unknown keys dropped; prototype keys are plain data
assert.deepEqual(readInput('WINDOW=3;RATE=1;LIMIT=2;EXTRA=zzz'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
const proto = readInput('WINDOW=3;RATE=1;LIMIT=2;__PROTO__=x;CONSTRUCTOR=y;TOSTRING=z');
assert.deepEqual(proto, [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
assert.equal(Object.getPrototypeOf(proto[0]), Object.prototype);
assert.deepEqual(Object.keys(proto[0]), ['WINDOW', 'RATE', 'LIMIT']);
assert.equal({}.x, undefined);

// --- required / range / canonical integer checks
assert.equal(fmt('RATE=1;LIMIT=2'), 'INVALID_VALUE');            // missing WINDOW
assert.equal(fmt('WINDOW=3;RATE=1'), 'INVALID_VALUE');           // missing LIMIT
assert.equal(fmt('WINDOW=1;RATE=1;LIMIT=2'), 'INVALID_VALUE');   // WINDOW < 2
assert.equal(fmt('WINDOW=21;RATE=1;LIMIT=2'), 'INVALID_VALUE');  // WINDOW > 20
assert.equal(fmt('WINDOW=3;RATE=31;LIMIT=2'), 'INVALID_VALUE');  // RATE > 30
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=0'), 'INVALID_VALUE');   // LIMIT < 1
assert.equal(fmt('WINDOW=3;RATE=1;LIMIT=126'), 'INVALID_VALUE'); // LIMIT > 125
assert.equal(fmt('WINDOW=03;RATE=1;LIMIT=2'), 'INVALID_VALUE');  // leading zero
assert.equal(fmt('WINDOW=+3;RATE=1;LIMIT=2'), 'INVALID_VALUE');  // signed
assert.equal(fmt('WINDOW=-3;RATE=1;LIMIT=2'), 'INVALID_VALUE');
assert.equal(fmt('WINDOW=3.0;RATE=1;LIMIT=2'), 'INVALID_VALUE');
assert.equal(fmt('WINDOW=0x3;RATE=1;LIMIT=2'), 'INVALID_VALUE');
assert.equal(fmt('WINDOW=;RATE=1;LIMIT=2'), 'INVALID_VALUE');
assert.equal(fmt('WINDOW=0;RATE=1;LIMIT=2'), 'INVALID_VALUE'); // WINDOW 0 below min
assert.equal(fmt('WINDOW=2;RATE=30;LIMIT=125'), 'NO_THROW');
console.log('extra checks PASS');
