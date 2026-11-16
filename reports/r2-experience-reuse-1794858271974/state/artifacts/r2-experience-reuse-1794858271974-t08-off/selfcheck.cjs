'use strict';
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

const ok = (input, expected) => assert.deepEqual(readInput(input), expected);
const bad = (input, msg) => assert.throws(() => readInput(input), (e) => e instanceof Error && e.message === msg);

// empty
ok('', []);

// basic + record separators
ok('WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
ok('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3\r\nWINDOW=6;RATE=3;LIMIT=4\rWINDOW=7;RATE=4;LIMIT=5', [
  { WINDOW: 4, RATE: 1, LIMIT: 2 },
  { WINDOW: 5, RATE: 2, LIMIT: 3 },
  { WINDOW: 6, RATE: 3, LIMIT: 4 },
  { WINDOW: 7, RATE: 4, LIMIT: 5 },
]);
// trailing newline tolerated
ok('WINDOW=4;RATE=1;LIMIT=2\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);

// field order within record does not matter; output order is schema order
ok('LIMIT=2;COLOR=red;WINDOW=4;RATE=1;FLAGS=a,b', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'red', FLAGS: ['a', 'b'] }]);
ok('FLAGS=x;LIMIT=2;RATE=1;WINDOW=4', [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['x'] }]);

// quoted whole field, with separators/equals/newlines inside, doubled quotes decode
ok('"WINDOW=4;RATE=1";"LIMIT=2"', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR="a;b"'.replace('COLOR="a;b"', '""COLOR=a;b""'), [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a;b' }]);
ok('"COLOR=a""b";WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a"b' }]);
// quoted field containing a newline does not end the record
ok('"COLOR=a\nb";WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\nb' }]);
ok('"COLOR=a\rb";WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\rb' }]);
// quoted field keeps inner = signs as data
ok('"COLOR=a=b";WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a=b' }]);

// bounds
ok('WINDOW=3;RATE=0;LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]);
ok('WINDOW=50;RATE=10;LIMIT=75', [{ WINDOW: 50, RATE: 10, LIMIT: 75 }]);

// unknown keys dropped, prototype-looking key is data
ok('WINDOW=4;RATE=1;LIMIT=2;EXTRA=9', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
const proto = readInput('WINDOW=4;RATE=1;LIMIT=2;__PROTO__=x');
assert.deepEqual(Object.getPrototypeOf(proto[0]), Object.prototype);
assert.equal(Object.prototype.hasOwnProperty.call(proto[0], '__PROTO__'), false);

// --- INVALID_FORMAT cases ---
bad('WINDOW=4;RATE=1;LIMIT=2;', 'INVALID_FORMAT');        // trailing separator
bad(';WINDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT');        // leading separator
bad('WINDOW=4;;RATE=1;LIMIT=2', 'INVALID_FORMAT');        // empty field
bad('WINDOW=4;RATE=1;LIMIT', 'INVALID_FORMAT');           // no equals
bad('WINDOW=4;RATE=1;LIMIT=2=3', 'INVALID_FORMAT');       // two equals unquoted
bad('window=4;RATE=1;LIMIT=2', 'INVALID_FORMAT');         // bad key
bad('W INDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT');        // space in key
bad('WINDOW=4;RATE=1;LIMIT=2;WINDOW=5', 'INVALID_FORMAT');// duplicate
bad('WINDOW=4;RATE=1;LIMIT=2;"LIMIT=3"', 'INVALID_FORMAT');// duplicate (quoted)
bad('WINDOW="4;RATE=1;LIMIT=2', 'INVALID_FORMAT');        // unterminated quote
bad('COLOR="a"b;WINDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT'); // chars after closing quote
bad('WINDOW=4;RATE=1;LIMIT=2;CO"LOR=x', 'INVALID_FORMAT'); // quote inside unquoted
bad('WINDOW= 4;RATE=1;LIMIT=2', 'INVALID_FORMAT');        // whitespace in value
bad('WINDOW=4 ;RATE=1;LIMIT=2', 'INVALID_FORMAT');
bad('WINDOW=4;RATE=1;LIMIT=2;COLOR=x ', 'INVALID_FORMAT');

// --- INVALID_VALUE cases ---
bad('RATE=1;LIMIT=2', 'INVALID_VALUE');                   // missing WINDOW
bad('WINDOW=4;LIMIT=2', 'INVALID_VALUE');                 // missing RATE
bad('WINDOW=4;RATE=1', 'INVALID_VALUE');                  // missing LIMIT
bad('WINDOW=2;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=51;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=04;RATE=1;LIMIT=2', 'INVALID_VALUE');         // leading zero
bad('WINDOW=-4;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=4.0;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=4;RATE=11;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=4;RATE=1;LIMIT=0', 'INVALID_VALUE');
bad('WINDOW=4;RATE=1;LIMIT=76', 'INVALID_VALUE');

// precedence: syntax error beats semantic error in the same record
bad('WINDOW=2;RATE=1;LIMIT=2;WINDOW=5', 'INVALID_FORMAT');
bad('WINDOW=2;RATE=1;LIMIT=2;=x', 'INVALID_FORMAT');
bad('RATE=1;LIMIT=2;WINDOW= 4', 'INVALID_FORMAT');

console.log('self-check PASS');
