'use strict';
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

const fmt = (s) => assert.throws(() => readInput(s), (e) => e instanceof Error && e.message === 'INVALID_FORMAT', 'expected INVALID_FORMAT for: ' + JSON.stringify(s));
const val = (s) => assert.throws(() => readInput(s), (e) => e instanceof Error && e.message === 'INVALID_VALUE', 'expected INVALID_VALUE for: ' + JSON.stringify(s));

// ---- basics
assert.deepEqual(readInput(''), []);
assert.deepEqual(readInput('WINDOW=4;RATE=1;LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(readInput('WINDOW=50;RATE=0;LIMIT=1'), [{ WINDOW: 50, RATE: 0, LIMIT: 1 }]);

// ---- record separators
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3').length, 2);
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3').length, 2);
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3').length, 2);
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2\n\n').length, 1);

// ---- schema order, independent of input order
assert.deepEqual(Object.keys(readInput('LIMIT=2;WINDOW=4;RATE=1')[0]), ['WINDOW', 'RATE', 'LIMIT']);
assert.deepEqual(Object.keys(readInput('LIMIT=2;COLOR=c;WINDOW=4;FLAGS=a;RATE=1;ZZZ=1')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS']);

// ---- unknown keys dropped, prototype safe
const p = readInput('WINDOW=4;RATE=1;LIMIT=2;CONSTRUCTOR=y;TOSTRING=z')[0];
assert.deepEqual(p, { WINDOW: 4, RATE: 1, LIMIT: 2 });
assert.equal(Object.getPrototypeOf(p), Object.prototype);
assert.equal({}.x, undefined);
fmt('WINDOW=4;RATE=1;LIMIT=2;CONSTRUCTOR=y;CONSTRUCTOR=z'); // duplicate unknown key
fmt('WINDOW=4;RATE=1;LIMIT=2;__proto__=x'); // underscore-led key is not a valid KEY

// ---- optional fields
assert.deepEqual(readInput('WINDOW=4;RATE=1;LIMIT=2;COLOR="#fff"')[0],
  { WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: '#fff' });
assert.deepEqual(readInput('WINDOW=4;RATE=1;LIMIT=2;FLAGS=a,b')[0],
  { WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['a', 'b'] });
assert.deepEqual(readInput('WINDOW=4;RATE=1;LIMIT=2;FLAGS=')[0],
  { WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: [] });
assert.equal(typeof readInput('WINDOW=4;RATE=1;LIMIT=2;COLOR=7')[0].COLOR, 'string');

// ---- quoting
assert.deepEqual(readInput('"WINDOW=4";RATE=1;LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2;COLOR="a=b;c\nd"')[0].COLOR, 'a=b;c\nd');
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2;COLOR="he said ""hi"""')[0].COLOR, 'he said "hi"');
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2;COLOR=""')[0].COLOR, '');
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR="abc');      // unterminated
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR="a"b');      // chars after closing quote
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR=a"b"');      // quote in unquoted field
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR="a" "b"');   // second field not allowed

// ---- whitespace policy
fmt('WINDOW=4;RATE=1;LIMIT= 2');
fmt('WINDOW=4;RATE=1;LIMIT=2 ');
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR= a');
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR=" a "'); // trim rule applies to the decoded value too

// ---- key syntax
fmt('window=4;RATE=1;LIMIT=2');
fmt('WINDOW=4;RATE=1;LIMIT=2;=x');
fmt('WINDOW=4;RATE=1;LIMIT=2;1A=x');
fmt('WINDOW=4;RATE=1;LIMIT=2;A-B=x');
fmt('WINDOW=4;RATE=1;LIMIT');            // no equals sign
// quoted field may contain additional equals signs
assert.equal(readInput('WINDOW=4;RATE=1;LIMIT=2;"COLOR"="#a=b"')[0].COLOR, '#a=b');

// ---- duplicates
fmt('WINDOW=4;WINDOW=4;RATE=1;LIMIT=2');
fmt('WINDOW=4;RATE=1;LIMIT=2;COLOR=a;COLOR=a');
fmt('WINDOW=4;RATE=1;LIMIT=2;"WINDOW=5"');   // duplicate after decoding

// ---- semantic errors
val('WINDOW=4;RATE=1');                       // missing LIMIT
val('');
val('WINDOW=2;RATE=1;LIMIT=2');               // WINDOW below min
val('WINDOW=51;RATE=1;LIMIT=2');              // WINDOW above max
val('WINDOW=04;RATE=1;LIMIT=2');              // leading zero
val('WINDOW=4;RATE=11;LIMIT=2');              // RATE above max
val('WINDOW=4;RATE=1;LIMIT=0');               // LIMIT below min
val('WINDOW=4;RATE=1;LIMIT=76');              // LIMIT above max
val('WINDOW=4.0;RATE=1;LIMIT=2');
val('WINDOW=-4;RATE=1;LIMIT=2');
val('WINDOW=+4;RATE=1;LIMIT=2');
val('WINDOW=;RATE=1;LIMIT=2');
val('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=4;RATE=1'); // second record bad

// ---- precedence: syntax error beats semantic error
fmt('WINDOW=999;RATE=1;LIMIT=2;BADKEY=x');
fmt('WINDOW=999;RATE=1;LIMIT=2;LIMIT=2');
fmt('WINDOW=999;RATE=1;LIMIT=2;COLOR= x');
assert.deepEqual(readInput('WINDOW=3;RATE=10;LIMIT=75;COLOR=";="')[0],
  { WINDOW: 3, RATE: 10, LIMIT: 75, COLOR: ';=' });

console.log('extra PASS');
