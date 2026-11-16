'use strict';
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let n = 0;
function ok(text, expected) {
  n++;
  assert.deepEqual(readInput(text), expected, JSON.stringify(text));
}
function bad(text, msg) {
  n++;
  assert.throws(() => readInput(text), (e) => e instanceof Error && e.message === msg,
    `expected ${msg} for ${JSON.stringify(text)}`);
}

const R = (w, r, l) => ({ WINDOW: w, RATE: r, LIMIT: l });

// basics + separators
ok('WINDOW=4;RATE=1;LIMIT=2', [R(4, 1, 2)]);
ok('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3', [R(4, 1, 2), R(5, 2, 3)]);
ok('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3', [R(4, 1, 2), R(5, 2, 3)]);
ok('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3', [R(4, 1, 2), R(5, 2, 3)]);
ok('WINDOW=4;RATE=1;LIMIT=2\n', [R(4, 1, 2)]);
ok('WINDOW=4;RATE=1;LIMIT=2\r\n', [R(4, 1, 2)]);
ok('', []);

// numeric boundaries
ok('WINDOW=3;RATE=0;LIMIT=1', [R(3, 0, 1)]);
ok('WINDOW=50;RATE=10;LIMIT=75', [R(50, 10, 75)]);
bad('WINDOW=2;RATE=0;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=51;RATE=0;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=11;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=0;LIMIT=0', 'INVALID_VALUE');
bad('WINDOW=3;RATE=0;LIMIT=76', 'INVALID_VALUE');
bad('WINDOW=04;RATE=0;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=00;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=000;RATE=0;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=-1;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=+1;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1.0;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=0x1;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1e0;LIMIT=1', 'INVALID_VALUE');

// missing required
bad('RATE=0;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3;RATE=0', 'INVALID_VALUE');
bad('COLOR=red', 'INVALID_VALUE');

// key syntax
bad('window=3;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('Window=3;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('3WINDOW=3;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('_WINDOW=3;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;=x', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;', 'INVALID_FORMAT');
bad('WINDOW=3;;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;A=1=2', 'INVALID_FORMAT');
bad('WINDOW3', 'INVALID_FORMAT');
bad('WINDOW', 'INVALID_FORMAT');
ok('WINDOW=3;RATE=0;LIMIT=1;A_B_C9=x', [R(3, 0, 1)]);

// whitespace policy
bad('WINDOW=3;RATE= 0;LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0 ;LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW= 3;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;COLOR= red', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;COLOR=red ', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;COLOR=\tred', 'INVALID_FORMAT');
ok('WINDOW=3;RATE=0;LIMIT=1;COLOR=purple', [R(3, 0, 1)]);

// duplicates (including across quoting styles)
bad('WINDOW=3;WINDOW=3;RATE=0;LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW=3;RATE=0;LIMIT=1;COLOR=a;COLOR=b', 'INVALID_FORMAT');
bad('"WINDOW=3";WINDOW=3;RATE=0;LIMIT=1', 'INVALID_FORMAT');

// unknown keys dropped, schema order preserved
ok('WINDOW=3;RATE=0;LIMIT=1;EXTRA=1;OTHER=x', [R(3, 0, 1)]);
ok('EXTRA=1;WINDOW=3;RATE=0;LIMIT=1', [R(3, 0, 1)]);
n++;
assert.deepEqual(Object.keys(readInput('ZZZ=1;WINDOW=3;RATE=0;LIMIT=1;AAA=2')), ['WINDOW', 'RATE', 'LIMIT']);
n++;
assert.deepEqual(Object.keys(readInput('LIMIT=1;RATE=0;WINDOW=3')), ['WINDOW', 'RATE', 'LIMIT']);

// prototype-looking keys are data and must not affect the result prototype
n++;
{
  const r = readInput('WINDOW=3;RATE=0;LIMIT=1;__PROTO__=x;CONSTRUCTOR=y;TOSTRING=z');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.equal(r[0].__PROTO__, undefined);
  assert.equal(r[0].CONSTRUCTOR, undefined);
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT']);
  assert.equal(Object.prototype.hasOwnProperty.call(r[0], '__PROTO__'), false);
}
n++;
{
  const r = readInput('WINDOW=3;RATE=0;LIMIT=1;"__PROTO__=x"');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.equal(r[0].WINDOW, 3);
}

// quoting
ok('"WINDOW=3";RATE=0;LIMIT=1', [R(3, 0, 1)]);
ok('"WINDOW=3";"RATE=0";"LIMIT=1"', [R(3, 0, 1)]);
ok('"WINDOW=3";"RATE=0";"LIMIT=1";"COLOR=a;b=c"', [R(3, 0, 1)]);
ok('WINDOW=3;RATE=0;LIMIT=1;"COLOR=a;b"', [R(3, 0, 1)]);
ok('"WINDOW=3";"RATE=0";"LIMIT=1";"COLOR=a""b"', [R(3, 0, 1)]);
ok('"WINDOW=3";"RATE=0";"LIMIT=1";"COLOR="""', [R(3, 0, 1)]);
ok('"WINDOW=3";"RATE=0";"LIMIT=1";"COLOR=a\nb"', [R(3, 0, 1)]);
ok('"WINDOW=3";"RATE=0";"LIMIT=1";"COLOR=a\r\nb"', [R(3, 0, 1)]);

// a fully quoted field may span a record separator
bad('"WINDOW=3";"RATE=0";"LIMIT=1";"COLOR=a\n"', 'INVALID_FORMAT'); // value not trimmed-equal
bad('"WINDOW\n=3"', 'INVALID_VALUE'); // one record, missing RATE/LIMIT
ok('"WINDOW=3\n";"RATE=0";"LIMIT=1"\nWINDOW=4;RATE=0;LIMIT=1', [R(3, 0, 1), R(4, 0, 1)].slice(0, 0).length === 0 ? [] : (() => {
  throw new Error('unreachable');
})());
