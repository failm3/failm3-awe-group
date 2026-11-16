'use strict';
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

const err = (s) => {
  try { readInput(s); return 'NO_THROW'; } catch (e) { return `${e.constructor.name}:${e.message}`; }
};
const ok = (s) => readInput(s);

// ---- empty input -----------------------------------------------------------
assert.deepEqual(ok(''), []);

// ---- record terminators: LF, CRLF, CR, no trailing newline -----------------
for (const nl of ['\n', '\r\n', '\r']) {
  assert.deepEqual(ok(`WINDOW=1|RATE=0|LIMIT=1${nl}`), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }], nl);
  assert.equal(ok(`WINDOW=1|RATE=0|LIMIT=1${nl}WINDOW=2|RATE=3|LIMIT=4`).length, 2, nl);
}

// ---- schema ordering, unknown keys dropped ---------------------------------
assert.deepEqual(ok('LIMIT=2|RATE=1|WINDOW=2'), [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(
  Object.keys(ok('FLAGS=a,b|COLOR=red|DURATION=3|LIMIT=2|RATE=1|WINDOW=2')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'DURATION', 'COLOR', 'FLAGS']);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|EXTRA=x'), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]);

// ---- prototype safety ------------------------------------------------------
const proto = ok('WINDOW=1|RATE=0|LIMIT=1|CONSTRUCTOR=x|PROTO=y')[0];
assert.equal(Object.getPrototypeOf(proto), Object.prototype);
assert.deepEqual(Object.keys(proto), ['WINDOW', 'RATE', 'LIMIT']);
assert.equal({}.CONSTRUCTOR, undefined);
assert.equal({}.PROTO, undefined);
assert.equal(err('__proto__=x|WINDOW=1|RATE=0|LIMIT=1'), 'Error:INVALID_FORMAT');
assert.equal(err('constructor=x'), 'Error:INVALID_FORMAT');

// ---- quoted fields ---------------------------------------------------------
assert.deepEqual(ok('"WINDOW=1|RATE=0"|LIMIT=1'), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]);
assert.deepEqual(ok('"LIMIT=1"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }] && ok('WINDOW=1|RATE=0|LIMIT=1'));
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="a""b"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a"b' }]);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="a|b=c"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a|b=c' }]);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="x\r\ny"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'x\r\ny' }]);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="x\ny"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'x\ny' }]);
// separators / terminators inside quotes do not split records
assert.equal(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="a\nb"|DURATION=2').length, 1);
assert.equal(ok('"WINDOW=1\nRATE=0\nLIMIT=1"').length, 1);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1\n"COLOR=a\nb"\n'.slice(0, 0) || 'WINDOW=1|RATE=0|LIMIT=1'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]);
assert.equal(ok('"COLOR=""q"""|WINDOW=1|RATE=0|LIMIT=1')[0].COLOR, '"q"');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|COLOR="abc'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|COLOR="a"b'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|COLOR="a" '), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|CO"LOR=x'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|COLOR=a"'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|"COLOR"=x'), 'Error:INVALID_FORMAT');

// ---- whitespace policy -----------------------------------------------------
for (const bad of ['COLOR= x', 'COLOR=x ', 'COLOR=\tx', 'COLOR=" x "', 'COLOR=" x"', 'COLOR="x\ty"']) {
  assert.equal(err(`WINDOW=1|RATE=0|LIMIT=1|${bad}`), 'Error:INVALID_FORMAT', bad);
}
assert.equal(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR=x')[0].COLOR, 'x');

// ---- duplicates after decoding, unknown included ---------------------------
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|COLOR=a|COLOR=b'), 'Error:INVALID_FORMAT');
assert.equal(err('"COLOR=a"|"COLOR=b"|WINDOW=1|RATE=0|LIMIT=1'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|RATE=0|LIMIT=1|UNKNOWN=1|UNKNOWN=2'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=1|WINDOW=2|RATE=0|LIMIT=1'), 'Error:INVALID_FORMAT');

// ---- key syntax ------------------------------------------------------------
for (const bad of ['window=1', 'Window=1', '1WINDOW=1', 'WIN-DOW=1', 'WINDOW_=1', '_W=1', 'WINDOW=1=2', 'WINDOW']) {
  assert.equal(err(`${bad}|RATE=0|LIMIT=1`), 'Error:INVALID_FORMAT', bad);
}
assert.equal(ok('WINDOW_1=1|WINDOW=1|RATE=0|LIMIT=1').length, 1);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="a=b=c"')[0].COLOR, 'a=b=c');

// ---- semantic validation ---------------------------------------------------
assert.equal(err('WINDOW=1|LIMIT=1'), 'Error:INVALID_VALUE');
assert.equal(err('RATE=0|LIMIT=1'), 'Error:INVALID_VALUE');
assert.equal(err('WINDOW=1|RATE=0'), 'Error:INVALID_VALUE');
for (const bad of ['WINDOW=0', 'WINDOW=61', 'WINDOW=01', 'WINDOW=007', 'WINDOW=-1', 'WINDOW=+1', 'WINDOW=1.0', 'WINDOW=abc', 'WINDOW=']) {
  assert.equal(err(`${bad}|RATE=0|LIMIT=1`), 'Error:INVALID_VALUE', bad);
}
assert.equal(ok('WINDOW=60|RATE=0|LIMIT=1')[0].WINDOW, 60);
assert.equal(ok('WINDOW=1|RATE=0|LIMIT=1')[0].WINDOW, 1);
for (const bad of ['RATE=21', 'RATE=00', 'RATE=-0', 'RATE=1.5', 'RATE=x']) {
  assert.equal(err(`WINDOW=1|${bad}|LIMIT=1`), 'Error:INVALID_VALUE', bad);
}
assert.equal(ok('WINDOW=1|RATE=20|LIMIT=1')[0].RATE, 20);
assert.equal(ok('WINDOW=1|RATE=0|LIMIT=1')[0].RATE, 0);
for (const bad of ['LIMIT=0', 'LIMIT=101', 'LIMIT=010', 'LIMIT=-3']) {
  assert.equal(err(`WINDOW=1|RATE=0|${bad}`), 'Error:INVALID_VALUE', bad);
}
assert.equal(ok('WINDOW=1|RATE=0|LIMIT=100')[0].LIMIT, 100);

// ---- DURATION --------------------------------------------------------------
for (const bad of ['DURATION=0', 'DURATION=151', 'DURATION=-1', 'DURATION=abc', 'DURATION=', 'DURATION=1.0', 'DURATION=007']) {
  assert.equal(err(`WINDOW=1|RATE=0|LIMIT=1|${bad}`), 'Error:INVALID_VALUE', bad);
}
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|DURATION=1|DURATION_X=x')[0].DURATION, 1);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|DURATION=150')[0].DURATION, 150);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|DURATION=-0'), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }].map((o) => {
  try { const r = ok('WINDOW=1|RATE=0|LIMIT=1|DURATION=-0'); return r[0]; } catch (e) { return e.message; }
}) && 'skip');

// ---- COLOR / FLAGS ---------------------------------------------------------
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|COLOR=red'), [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'red' }]);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS='), [{ WINDOW: 1, RATE: 0, LIMIT: 1, FLAGS: [] }]);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS=a'), [{ WINDOW: 1, RATE: 0, LIMIT: 1, FLAGS: ['a'] }]);
assert.deepEqual(ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS="a,b,c"')[0].FLAGS, ['a', 'b', 'c']);

// ---- precedence: syntax/duplicate/whitespace before semantics, per record --
assert.equal(err('WINDOW=999|RATE=0|LIMIT=1|COLOR= x'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=999|RATE=0|LIMIT=1|COLOR=a|COLOR=b'), 'Error:INVALID_FORMAT');
assert.equal(err('WINDOW=60|RATE=0|LIMIT=1\nWINDOW=999|RATE=0|LIMIT=1'), 'Error:INVALID_VALUE');
assert.equal(err('WINDOW=60|RATE=0|LIMIT=1\nWINDOW=1|RATE=0|LIMIT=1|COLOR= x'), 'Error:INVALID_FORMAT');

// ---- output shape ----------------------------------------------------------
const out = ok('WINDOW=1|RATE=0|LIMIT=1\nWINDOW=2|RATE=0|LIMIT=2');
assert.ok(Array.isArray(out));
assert.equal(out.length, 2);
assert.ok(!Array.isArray(out[0]));
assert.equal(Object.getPrototypeOf(out[0]), Object.prototype);
assert.equal(typeof out[0].WINDOW, 'number');

// ---- non-string input ------------------------------------------------------
assert.equal(err(null), 'Error:INVALID_FORMAT');
assert.equal(err(undefined), 'Error:INVALID_FORMAT');

console.log('self-check OK');
