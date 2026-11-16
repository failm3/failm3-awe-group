'use strict';
const assert = require('node:assert/strict');
const { decodeSeparated } = require('../core/decoder.cjs');

const F = 'INVALID_FORMAT';
const V = 'INVALID_VALUE';
const bad = (input, msg) => assert.throws(
  () => decodeSeparated(input),
  (e) => e instanceof Error && e.constructor === Error && e.message === msg,
  `expected ${msg} for ${JSON.stringify(input)}`
);
const ok = (input, expected) => assert.deepEqual(decodeSeparated(input), expected, JSON.stringify(input));

// empty / terminators
ok('', []);
ok('WINDOW=3|RATE=1|LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
for (const sep of ['\n', '\r\n', '\r']) {
  ok(`WINDOW=3|RATE=1|LIMIT=2${sep}WINDOW=4|RATE=2|LIMIT=3`,
    [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
}
ok('WINDOW=3|RATE=1|LIMIT=2\r\n', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);

// schema insertion order regardless of field order
assert.deepEqual(Object.keys(decodeSeparated('LIMIT=2|Z=9|RATE=1|WINDOW=3|A=8')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'Z', 'A']);
ok('LIMIT=2|WINDOW=3|RATE=1', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);

// bounds
ok('WINDOW=2|RATE=0|LIMIT=1|DURATION=120', [{ WINDOW: 2, RATE: 0, LIMIT: 1, DURATION: 120 }]);
ok('WINDOW=50|RATE=20|LIMIT=50|DURATION=1', [{ WINDOW: 50, RATE: 20, LIMIT: 50, DURATION: 1 }]);
ok('WINDOW=5|RATE=1|LIMIT=2|DURATION=005', [{ WINDOW: 5, RATE: 1, LIMIT: 2, DURATION: 5 }]);
bad('WINDOW=1|RATE=1|LIMIT=2', V);
bad('WINDOW=51|RATE=1|LIMIT=2', V);
bad('WINDOW=05|RATE=1|LIMIT=2', V);
bad('WINDOW=-5|RATE=1|LIMIT=2', V);
bad('WINDOW=3|RATE=21|LIMIT=2', V);
bad('WINDOW=3|RATE=01|LIMIT=2', V);
bad('WINDOW=3|RATE=1|LIMIT=0', V);
bad('WINDOW=3|RATE=1', V);
bad('WINDOW=3|LIMIT=2', V);
bad('RATE=1|LIMIT=2', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=0', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=121', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=1.5', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=abc', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=', V);

// quoting: whole field quoted, key and value inside quotes
ok('"WINDOW=3"|RATE=1|LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
ok('WINDOW=3|RATE=1|LIMIT=2|"EXTRA=a|b=c"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, EXTRA: 'a|b=c' }]);
ok('WINDOW=3|RATE=1|LIMIT=2|"EXTRA=he said ""hi"""', [{ WINDOW: 3, RATE: 1, LIMIT: 2, EXTRA: 'he said "hi"' }]);
ok('WINDOW=3|RATE=1|LIMIT=2|"EXTRA=line\nbreak"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, EXTRA: 'line\nbreak' }]);
ok('WINDOW=3|RATE=1|LIMIT=2|"EXTRA=cr\rhere"\nWINDOW=4|RATE=2|LIMIT=3',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, EXTRA: 'cr\rhere' }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
ok('"WINDOW=3"|"RATE=1"|"LIMIT=2"', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
// quotes are literal text when they are not a whole-field delimiters
bad('WINDOW=3|RATE=1|LIMIT=2|EXTRA="a|b=c"', F);
bad('WINDOW=3|RATE=1|LIMIT=2|"EXTRA=open', F);
bad('WINDOW=3|RATE=1|LIMIT=2|"EXTRA=a"b', F);
bad('WINDOW=3|RATE=1|"LIMIT=2"x', F);
bad('WINDOW=3|RATE=1|LIMIT=2|EXTRA=a"b', F);
bad('WINDOW=3|RATE=1|"EXTRA=a', F);

// keys
bad('window=3|RATE=1|LIMIT=2', F);
bad('1WINDOW=3|RATE=1|LIMIT=2', F);
bad('WIN DOW=3|RATE=1|LIMIT=2', F);
bad('WINDOW==3|RATE=1|LIMIT=2', F);
bad('WINDOW|RATE=1|LIMIT=2', F);
bad('WINDOW=|RATE=1|LIMIT=2', V);
bad('WINDOW=3|RATE=1|LIMIT=2|WINDOW=4', F);
bad('WINDOW=3|RATE=1|LIMIT=2|"WINDOW=4"', F);
ok('WINDOW=3|RATE=1|LIMIT=2|A_B9=s', [{ WINDOW: 3, RATE: 1, LIMIT: 2, A_B9: 's' }]);

// whitespace policy
bad('WINDOW= 3|RATE=1|LIMIT=2', F);
bad('WINDOW=3 |RATE=1|LIMIT=2', F);
bad('WINDOW=3|RATE=1|LIMIT=2|X= a', F);
bad('WINDOW=3|RATE=1|LIMIT=2|"X= a"', F);
ok('WINDOW=3|RATE=1|LIMIT=2|"X=a b"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, X: 'a b' }]);

// syntax precedence over semantics within a record
bad('WINDOW=1|RATE=1|LIMIT=2|bad=3', F);
bad('WINDOW=3|RATE=1|LIMIT=2|X= 1|bad', F);
bad('WINDOW=1|RATE=1|LIMIT=2|WINDOW=2', F);
// earlier record's error reported first
bad('WINDOW=3|RATE=1|LIMIT=2\nWINDOW=1|RATE=1|LIMIT=2', V);

// unknown keys: strings, field order, prototype safety
const proto = decodeSeparated('WINDOW=3|RATE=1|LIMIT=2|__proto__=x|constructor=y')[0];
assert.equal(Object.getPrototypeOf(proto), Object.prototype);
assert.equal(Object.prototype.x, undefined);
assert.equal(Object.prototype.hasOwnProperty('x'), false);
assert.equal(proto.__proto__, 'x');
assert.equal(proto.constructor, 'y');
assert.deepEqual(Object.keys(proto), ['WINDOW', 'RATE', 'LIMIT', '__proto__', 'constructor']);
assert.equal(JSON.parse(JSON.stringify(proto)).__proto__, 'x');

const u = decodeSeparated('WINDOW=3|RATE=1|LIMIT=2|B=2|A=1')[0];
assert.deepEqual(Object.keys(u), ['WINDOW', 'RATE', 'LIMIT', 'B', 'A']);
assert.deepEqual(u, { WINDOW: 3, RATE: 1, LIMIT: 2, B: '2', A: '1' });
assert.equal(typeof u.B, 'string');

// known conversions: DURATION -> number, unknown strings untouched
const c = decodeSeparated('WINDOW=3|RATE=1|LIMIT=2|DURATION=7|COLOR=red')[0];
assert.equal(typeof c.DURATION, 'number');
assert.equal(typeof c.WINDOW, 'number');
assert.equal(c.COLOR, 'red');
assert.deepEqual(Object.keys(c), ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR']);

// multiple records, plain objects
const rs = decodeSeparated('WINDOW=3|RATE=1|LIMIT=2\nWINDOW=4|RATE=2|LIMIT=3|DURATION=9');
assert.equal(rs.length, 2);
assert.ok(Array.isArray(rs));
assert.ok(rs.every((o) => Object.getPrototypeOf(o) === Object.prototype && !Array.isArray(o)));
assert.deepEqual(rs[1], { WINDOW: 4, RATE: 2, LIMIT: 3, DURATION: 9 });

console.log('extra PASS');
