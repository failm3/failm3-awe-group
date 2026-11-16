'use strict';
// Independent spec checks for adapters/bundle.cjs (not part of the graded visible test).
const assert = require('node:assert/strict');
const { parseBundle } = require('./adapters/bundle.cjs');
const F = { message: 'INVALID_FORMAT' }, V = { message: 'INVALID_VALUE' };
const b = 'WINDOW=4|RATE=1|LIMIT=2';
assert.deepEqual(parseBundle(''), []);
assert.deepEqual(parseBundle(b + '\r\n' + b + '\r' + b + '\n'), [{WINDOW:4,RATE:1,LIMIT:2},{WINDOW:4,RATE:1,LIMIT:2},{WINDOW:4,RATE:1,LIMIT:2}]);
assert.deepEqual(parseBundle('"WINDOW=4"|RATE=1|LIMIT=2|"X=a|b=c\r\n""q"""'), [{WINDOW:4,RATE:1,LIMIT:2}]);
assert.deepEqual(Object.keys(parseBundle('DURATION=05|LIMIT=2|RATE=1|WINDOW=4|COLOR=red|FLAGS=a')[0]), ['WINDOW','RATE','LIMIT','DURATION']);
assert.equal(parseBundle('DURATION=05|' + b)[0].DURATION, 5);
for (const s of ['"WINDOW=4', '"WINDOW=4"x|RATE=1|LIMIT=2', 'WIN"DOW=4|RATE=1|LIMIT=2', 'window=4|RATE=1|LIMIT=2',
  'WINDOW=4=|RATE=1|LIMIT=2', 'WINDOW=4|RATE=1|LIMIT=2|RATE=1', 'WINDOW= 4|RATE=1|LIMIT=2', b + '|', b + '\n\n' + b,
  'WINDOW|RATE=1|LIMIT=2', '__proto__=1|' + b, 'WINDOW=4|RATE=1|LIMIT=2|X=1|"X=2"', 'WINDOW=99|RATE=1|LIMIT=2|X= y'])
  assert.throws(() => parseBundle(s), F, s);
for (const s of ['WINDOW=04|RATE=1|LIMIT=2', 'WINDOW=2|RATE=1|LIMIT=2', 'WINDOW=41|RATE=1|LIMIT=2', 'WINDOW=4|RATE=21|LIMIT=2',
  'WINDOW=4|RATE=1|LIMIT=0', 'WINDOW=4|RATE=1|LIMIT=151', 'WINDOW=4|RATE=1', b + '|DURATION=0', b + '|DURATION=91', b + '|DURATION=1.5', 'WINDOW=|RATE=1|LIMIT=2'])
  assert.throws(() => parseBundle(s), V, s);
assert.deepEqual(parseBundle('WINDOW=3|RATE=20|LIMIT=150|DURATION=90'), [{WINDOW:3,RATE:20,LIMIT:150,DURATION:90}]);
assert.equal(Object.getPrototypeOf(parseBundle('CONSTRUCTOR=1|' + b)[0]), Object.prototype);
console.log('spec checks PASS');
