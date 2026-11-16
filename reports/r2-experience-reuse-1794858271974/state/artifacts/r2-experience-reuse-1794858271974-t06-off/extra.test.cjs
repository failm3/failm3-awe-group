'use strict';
const assert = require('node:assert/strict');
const { parseExport: p } = require('./src/export.cjs');
const F = { message: 'INVALID_FORMAT' };
const V = { message: 'INVALID_VALUE' };

assert.deepEqual(p(''), []);
assert.deepEqual(
  p('WINDOW=1;RATE=0;LIMIT=1\r\nLIMIT=25;RATE=30;WINDOW=30\rWINDOW=2;RATE=2;LIMIT=2\n'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 30, RATE: 30, LIMIT: 25 }, { WINDOW: 2, RATE: 2, LIMIT: 2 }]
);

const r = p('ZED= z ;"COLOR=amber";WINDOW= 3 ;RATE=1;LIMIT=1;"NOTE=a;b=c\r\n""q"""');
assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'ZED', 'NOTE']);
assert.deepEqual(r[0], { WINDOW: 3, RATE: 1, LIMIT: 1, COLOR: 'amber', ZED: 'z', NOTE: 'a;b=c\r\n"q"' });

const pr = p('WINDOW=1;RATE=1;LIMIT=1;PROTO__=x');
assert.equal(Object.getPrototypeOf(pr[0]), Object.prototype);
assert.deepEqual(p('WINDOW=1;RATE=1;LIMIT=1;FLAGS=a,b'), [{ WINDOW: 1, RATE: 1, LIMIT: 1, FLAGS: 'a,b' }]);

for (const s of [
  'WINDOW=1;RATE=1;LIMIT=1;',
  'WINDOW=1;RATE=1;LIMIT=1\n\nWINDOW=1;RATE=1;LIMIT=1',
  '"WINDOW=1;RATE=1;LIMIT=1',
  '"WINDOW=1"x;RATE=1;LIMIT=1',
  'WINDOW="1";RATE=1;LIMIT=1',
  'WINDOW=1=2;RATE=1;LIMIT=1',
  ' WINDOW=1;RATE=1;LIMIT=1',
  'window=1;RATE=1;LIMIT=1',
  'WINDOW=1;WINDOW=2;RATE=1;LIMIT=1',
  'WINDOW=1;"WINDOW=1";RATE=1;LIMIT=1',
  'WINDOW=99;RATE=1;BAD KEY=1',
  'WINDOW;RATE=1;LIMIT=1',
  '1A=1;WINDOW=1;RATE=1;LIMIT=1',
]) assert.throws(() => p(s), F, s);

for (const s of [
  'WINDOW=0;RATE=1;LIMIT=1',
  'WINDOW=31;RATE=1;LIMIT=1',
  'WINDOW=01;RATE=1;LIMIT=1',
  'WINDOW=1;RATE=31;LIMIT=1',
  'WINDOW=1;RATE=1;LIMIT=26',
  'WINDOW=1;RATE=1;LIMIT=0',
  'WINDOW=1;RATE=1',
  'WINDOW=1;RATE=-1;LIMIT=1',
  'WINDOW=1;RATE=+1;LIMIT=1',
  'WINDOW=1.0;RATE=1;LIMIT=1',
  'WINDOW=;RATE=1;LIMIT=1',
  'WINDOW=1;RATE=1;LIMIT=1;COLOR=Green',
  'WINDOW=1;RATE=1;LIMIT=1;COLOR=',
  'WINDOW=1;RATE=1 2;LIMIT=1',
]) assert.throws(() => p(s), V, s);

// Semantic error in an earlier record wins over a syntax error in a later one.
assert.throws(() => p('WINDOW=0;RATE=1;LIMIT=1\n"bad'), V);

console.log('extra PASS');
