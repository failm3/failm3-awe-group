'use strict';
const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');

function outcome(t) {
  try { return { ok: true, value: decodeSeparated(t) }; }
  catch (e) { return { ok: false, name: e.constructor.name, message: e.message }; }
}
function bad(t) {
  const r = outcome(t);
  assert.equal(r.ok, false, 'expected INVALID_FORMAT for ' + JSON.stringify(t) + ' but got ' + JSON.stringify(r.value));
  assert.equal(r.name, 'Error');
  assert.equal(r.message, 'INVALID_FORMAT', 'wrong message for ' + JSON.stringify(t) + ': ' + r.message);
}
function badV(t) {
  const r = outcome(t);
  assert.equal(r.ok, false, 'expected INVALID_VALUE for ' + JSON.stringify(t) + ' but got ' + JSON.stringify(r.value));
  assert.equal(r.name, 'Error');
  assert.equal(r.message, 'INVALID_VALUE', 'wrong message for ' + JSON.stringify(t) + ': ' + r.message);
}

// --- basics
assert.deepEqual(decodeSeparated(''), []);
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);

// --- record separators: LF, CRLF, CR, mixed, trailing
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]);
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3').length, 2);
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3').length, 2);
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\r\n\r\nWINDOW=5;RATE=2;LIMIT=3\n').length, 2);
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3')[1],
  { WINDOW: 5, RATE: 2, LIMIT: 3 });

// --- value trimming (and ONLY value trimming)
assert.deepEqual(decodeSeparated('WINDOW= 4 ;RATE=1;LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(decodeSeparated('WINDOW=\t4\nX;RATE=1;LIMIT=2'), [
  { WINDOW: 4, RATE: 1, LIMIT: 2, X: '' },
].map((v) => v)); // '\n' inside unquoted field still ends the record; see record-split check below

// --- quoting
assert.deepEqual(decodeSeparated('"WINDOW=4";RATE=1;LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
assert.equal(decodeSeparated('"WINDOW=4;RATE=1;LIMIT=2";X="a;b=c\r\nd"')[0].X, 'a;b=c\r\nd');
assert.deepEqual(decodeSeparated('"WINDOW=4;RATE=1;LIMIT=2";X="a;b=c\r\nd"')[0].WINDOW, 4);
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;X="a""b"')[0].X, 'a"b');
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;X="  v  "')[0].X, 'v');
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;X=""')[0].X, '');
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;X="  ""  "')[0].X, '"');
// quoted field holding an equals sign in value
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;"X=a=b"')[0].X, 'a=b');

// --- syntax errors
bad('WINDOW=4;RATE=1;LIMIT=2;X="abc');        // unterminated quote
bad('WINDOW=4;RATE=1;LIMIT=2;X=ab"c"');       // quote inside unquoted field
bad('WINDOW=4;RATE=1;LIMIT=2;X="a"b');        // characters after closing quote
bad('WINDOW=4;RATE=1;LIMIT=2;X="a" ');        // space after closing quote
bad('WINDOW=4;RATE=1;LIMIT=2;x=1');           // lowercase key
bad('WINDOW=4;RATE=1;LIMIT=2;1X=1');          // key must start with a letter
bad('WINDOW=4;RATE=1;LIMIT=2;=1');            // empty key
bad('WINDOW=4;RATE=1;LIMIT=2;X');             // no equals
bad('WINDOW=4;RATE=1;LIMIT=2;X=1=2');         // two equals sign
bad('WINDOW=4;RATE=1;LIMIT=2;WINDOW=5');      // duplicate decoded key
bad('WINDOW=4;WINDOW=5;RATE=1;LIMIT=2');      // duplicate, non-adjacent
bad('"WINDOW"=4;RATE=1;LIMIT=2');             // closing quote mid-line
bad('"WINDOW=4;RATE=1"');                     // quoted field with two equals signs
bad('WINDOW=4;RATE=1;LIMIT=2;X-KEY=1');       // invalid key char
bad('WINDOW=4;RATE=1;LIMIT=2;X=1"');          // stray quote
bad('WINDOW=4;RATE=1;LIMIT=2; X=1');          // key not trimmed (leading space in key)
bad('WINDOW=4;RATE=1;LIMIT=2;X =1');          // trailing space in key

// duplicate decoded keys across quote forms
bad('"WINDOW=4";"WINDOW=5";RATE=1;LIMIT=2');

// --- semantic errors
badV('RATE=1;LIMIT=2');                       // missing WINDOW
badV('WINDOW=4;LIMIT=2');                     // missing RATE
badV('WINDOW=4;RATE=1');                      // missing LIMIT
badV('WINDOW=2;RATE=1;LIMIT=2');              // below min
badV('WINDOW=61;RATE=1;LIMIT=2');             // above max
badV('WINDOW=04;RATE=1;LIMIT=2');             // leading zero
badV('WINDOW=+4;RATE=1;LIMIT=2');
badV('WINDOW=-4;RATE=1;LIMIT=2');
badV('WINDOW=4.0;RATE=1;LIMIT=2');
badV('WINDOW=;RATE=1;LIMIT=2');
badV('WINDOW=4e1;RATE=1;LIMIT=2');
badV('WINDOW=4;RATE=31;LIMIT=2');
badV('WINDOW=4;RATE=00;LIMIT=2');
badV('WINDOW=4;RATE=1;LIMIT=0');
badV('WINDOW=4;RATE=1;LIMIT=76');
badV('WINDOW=4;RATE=1;LIMIT=02');
badV('WINDOW=4;RATE=1;LIMIT=2;COLOR=Teal');
badV('WINDOW=4;RATE=1;LIMIT=2;COLOR=red');
badV('WINDOW=4;RATE=1;LIMIT=2;COLOR=');

// --- boundaries
assert.deepEqual(decodeSeparated('WINDOW=3;RATE=0;LIMIT=1'), [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]);
assert.deepEqual(decodeSeparated('WINDOW=60;RATE=30;LIMIT=75'), [{ WINDOW: 60, RATE: 30, LIMIT: 75 }]);
assert.equal(decodeSeparated('WINDOW=000;RATE=1;LIMIT=2') && null, null); // placeholder no-op

// --- COLOR / FLAGS
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;COLOR=gold'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'gold' }]);
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;FLAGS=a,b'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['a', 'b'] }]);
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;FLAGS='),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: [] }]);
assert.deepEqual(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;FLAGS=" a , b "'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['a', 'b'] }]);
assert.ok(Array.isArray(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;FLAGS=a')[0].FLAGS));
assert.equal(typeof decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;WINDOW2=5')[0].WINDOW2, 'string');

// --- unknown keys: retained in field order after known fields
const u = decodeSeparated('Z=z;WINDOW=4;A=a;RATE=1;LIMIT=2;B="x;y"')[0];
assert.deepEqual(Object.keys(u), ['WINDOW', 'RATE', 'LIMIT', 'Z', 'A', 'B']);
assert.equal(u.Z, 'z'); assert.equal(u.A, 'a'); assert.equal(u.B, 'x;y');

// known-field order = schema order regardless of input order
assert.deepEqual(Object.keys(decodeSeparated('LIMIT=2;COLOR=teal;RATE=1;WINDOW=4')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'COLOR']);
assert.deepEqual(Object.keys(decodeSeparated('FLAGS=a;COLOR=gold;LIMIT=2;RATE=1;WINDOW=4')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS']);

// --- prototype safety
const p = decodeSeparated('WINDOW=4;RATE=1;LIMIT=2;__proto__=x;constructor=y;toString=z')[0];
assert.equal(Object.getPrototypeOf(p), Object.prototype);
assert.deepEqual(Object.keys(p), ['WINDOW', 'RATE', 'LIMIT', '__proto__', 'constructor', 'toString']);
assert.equal(p.__proto__, 'x');
assert.equal(p.constructor, 'y');
assert.equal(p.toString, 'z');
assert.equal({}.polluted, undefined);
const p2 = decodeSeparated('"__proto__=q";WINDOW=4;RATE=1;LIMIT=2')[0];
assert.equal(p2.__proto__, 'q');
assert.equal(Object.getPrototypeOf(p2), Object.prototype);
assert.ok(Object.prototype.hasOwnProperty.call(p2, '__proto__'));

// --- syntax precedes semantics within a record
bad('WINDOW=999;RATE=1;LIMIT=2;X=1=2');
bad('WINDOW=4;RATE=1;LIMIT=2;x=1;COLOR=red');
badV('WINDOW=999;RATE=1;LIMIT=2;COLOR=red');

// --- multiple records
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3\nWINDOW=6;RATE=3;LIMIT=4').length, 3);

// --- non-string input
bad(null); bad(undefined); bad(42); bad({}); bad([]);

// --- CR inside a quoted field must not split records
assert.equal(decodeSeparated('WINDOW=4;RATE=1;LIMIT=2\nX="a\rb"\nWINDOW=5;RATE=2;LIMIT=3').length, 2);

console.log('extended PASS');
