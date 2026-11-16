'use strict';
// Scratch spec-conformance checks (verification harness, not a deliverable).
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let n = 0;
function eq(input, expected, label) {
  const got = readInput(input);
  assert.deepEqual(got, expected, `${label}: ${JSON.stringify(input)} -> ${JSON.stringify(got)}`);
  n += 1;
}
function throws(input, msg, label) {
  assert.throws(() => readInput(input), (e) => e.message === msg,
    `${label}: ${JSON.stringify(input)} should throw ${msg}`);
  n += 1;
}

// --- basics / visible cases ---
eq('', [], 'empty');
eq('\n\r\n\r', [], 'blank lines only');
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=red', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }], 'visible 1');
eq('WINDOW=20;RATE=0;LIMIT=1', [{ WINDOW: 20, RATE: 0, LIMIT: 1 }], 'visible 2');

// --- record separators ---
const R = { WINDOW: 3, RATE: 1, LIMIT: 2 };
eq('WINDOW=3;RATE=1;LIMIT=2\nWINDOW=3;RATE=1;LIMIT=2', [R, R], 'LF');
eq('WINDOW=3;RATE=1;LIMIT=2\r\nWINDOW=3;RATE=1;LIMIT=2', [R, R], 'CRLF');
eq('WINDOW=3;RATE=1;LIMIT=2\rWINDOW=3;RATE=1;LIMIT=2', [R, R], 'CR');
eq('WINDOW=3;RATE=1;LIMIT=2\r\n', [R], 'trailing CRLF');
eq('WINDOW=3;RATE=1;LIMIT=2\n\n\nWINDOW=3;RATE=1;LIMIT=2', [R, R], 'blank lines between');

// --- whitespace: only VALUE is trimmed ---
eq('WINDOW= 3 ;RATE= 1;LIMIT=2 ', [R], 'value trim');
eq('"WINDOW= 3 ";RATE=1;LIMIT=2', [R], 'quoted value trim');

// --- quoted fields ---
eq('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=red"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }], 'all quoted');
eq('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=""red"""', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }], 'escaped quotes decode');
throws('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=re;d"', 'INVALID_VALUE', 'semicolon inside quotes is data');
throws('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=re=d"', 'INVALID_VALUE', 'equals inside quoted value is data');
throws('"WINDOW=3";"RATE=1";"LIMIT=2";"COLOR=a\nb"', 'INVALID_VALUE', 'newline inside quotes stays in one field');
throws('"WINDOW=3"x;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'characters after closing quote');
throws('"WINDOW=3" WINDOW=3', 'INVALID_FORMAT', 'space after closing quote');
throws('"WINDOW=3', 'INVALID_FORMAT', 'unterminated quote');
throws('WINDOW=3;RATE=1;LIMIT=2;"COLOR=red', 'INVALID_FORMAT', 'unterminated quote last field');
throws('WINDOW=3";RATE=1;LIMIT=2', 'INVALID_FORMAT', 'quote in unquoted value');
throws('WIN"DOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'quote in unquoted key');
throws('"";WINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'empty quoted field');

// --- bad keys / equals count ---
throws('window=3;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'lowercase key');
throws('WINDOW=3;RATE=1;LIMIT=2;=x', 'INVALID_FORMAT', 'empty key');
throws('1WINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'digit-first key');
throws('WINDOW=3;RATE=1;LIMIT=2;X-Y=1', 'INVALID_FORMAT', 'dash in key');
throws('WINDOW=3;RATE=1;LIMIT=2;X Y=1', 'INVALID_FORMAT', 'space in key');
throws('WINDOW=3=4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'two equals unquoted');
throws('WINDOW;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'no equals');
throws('WINDOW=;RATE=1;LIMIT=2', 'INVALID_VALUE', 'empty value for required int');

// --- duplicates (including decoded) ---
throws('WINDOW=3;WINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'duplicate key');
throws('"WINDOW=3";"WINDOW=3";RATE=1;LIMIT=2', 'INVALID_FORMAT', 'duplicate quoted key');
throws('WINDOW=3;RATE=1;LIMIT=2;ZZ=1;ZZ=2', 'INVALID_FORMAT', 'duplicate unknown key');
throws('"WINDOW=3";"WINDOW=""3"""', 'INVALID_FORMAT', 'duplicate after quote decoding');

// --- unknown keys dropped; prototype safety ---
eq('WINDOW=3;RATE=1;LIMIT=2;ZZ=9', [R], 'unknown dropped');
eq('WINDOW=3;RATE=1;LIMIT=2;__proto__=x', [R], 'proto key dropped');
{
  const r = readInput('WINDOW=3;RATE=1;LIMIT=2;__proto__={"a":1}')[0];
  assert.equal(Object.getPrototypeOf(r), Object.prototype, 'prototype untouched');
  assert.deepEqual(Object.keys(r), ['WINDOW', 'RATE', 'LIMIT'], 'own keys only');
  n += 1;
}
eq('WINDOW=3;RATE=1;LIMIT=2;constructor=1;toString=1;hasOwnProperty=2', [R], 'proto-ish keys dropped');

// --- required fields ---
throws('RATE=1;LIMIT=2', 'INVALID_VALUE', 'missing WINDOW');
throws('WINDOW=3;LIMIT=2', 'INVALID_VALUE', 'missing RATE');
throws('WINDOW=3;RATE=1', 'INVALID_VALUE', 'missing LIMIT');
throws('', 'INVALID_VALUE', 'empty-expecting []');
n -= 1; // '' returns [], asserted above; drop this line's count

// --- WINDOW 2..20 canonical ---
const w = (v) => `WINDOW=${v};RATE=0;LIMIT=1`;
eq(w(2), [{ WINDOW: 2, RATE: 0, LIMIT: 1 }], 'WINDOW min');
eq(w(20), [{ WINDOW: 20, RATE: 0, LIMIT: 1 }], 'WINDOW max');
throws(w(1), 'INVALID_VALUE', 'WINDOW below min');
throws(w(21), 'INVALID_VALUE', 'WINDOW above max');
throws(w('03'), 'INVALID_VALUE', 'WINDOW leading zero');
throws(w('-3'), 'INVALID_VALUE', 'WINDOW negative');
throws(w('+3'), 'INVALID_VALUE', 'WINDOW plus sign');
throws(w('3.0'), 'INVALID_VALUE', 'WINDOW decimal');
throws(w('3e0'), 'INVALID_VALUE', 'WINDOW exponent');
throws(w('abc'), 'INVALID_VALUE', 'WINDOW alpha');
throws(w(''), 'INVALID_VALUE', 'WINDOW empty');

// --- RATE 0..30 ---
const r = (v) => `WINDOW=3;RATE=${v};LIMIT=1`;
eq(r(0), [{ WINDOW: 3, RATE: 0, LIMIT: 1 }], 'RATE min');
eq(r(30), [{ WINDOW: 3, RATE: 30, LIMIT: 1 }], 'RATE max');
throws(r(31), 'INVALID_VALUE', 'RATE above max');
throws(r('00'), 'INVALID_VALUE', 'RATE leading zero');
throws(r('-1'), 'INVALID_VALUE', 'RATE negative');

// --- LIMIT 1..125 ---
const l = (v) => `WINDOW=3;RATE=1;LIMIT=${v}`;
eq(l(1), [{ WINDOW: 3, RATE: 1, LIMIT: 1 }], 'LIMIT min');
eq(l(125), [{ WINDOW: 3, RATE: 1, LIMIT: 125 }], 'LIMIT max');
throws(l(0), 'INVALID_VALUE', 'LIMIT below min');
throws(l(126), 'INVALID_VALUE', 'LIMIT above max');
throws(l('0125'), 'INVALID_VALUE', 'LIMIT leading zero');

// --- COLOR ---
eq('WINDOW=3;RATE=1;LIMIT=2;COLOR=blue', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'blue' }], 'COLOR blue');
throws('WINDOW=3;RATE=1;LIMIT=2;COLOR=Red', 'INVALID_VALUE', 'COLOR case-sensitive');
throws('WINDOW=3;RATE=1;LIMIT=2;COLOR=green', 'INVALID_VALUE', 'COLOR not in enum');
throws('WINDOW=3;RATE=1;LIMIT=2;COLOR=', 'INVALID_VALUE', 'COLOR empty');

// --- FLAGS array ---
eq('WINDOW=3;RATE=1;LIMIT=2;FLAGS=a,b',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: ['a', 'b'] }], 'FLAGS list');
eq('WINDOW=3;RATE=1;LIMIT=2;FLAGS=',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: [] }], 'FLAGS empty');

// --- key ordering: known schema order regardless of input order ---
eq('LIMIT=2;RATE=1;WINDOW=3', [R], 'schema order');
eq('COLOR=red;LIMIT=2;WINDOW=3;RATE=1',
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red' }], 'schema order with COLOR');
{
  const o = readInput('FLAGS=a;COLOR=red;LIMIT=2;RATE=1;WINDOW=3')[0];
  assert.deepEqual(Object.keys(o), ['WINDOW', 'RATE', 'LIMIT', 'COLOR', 'FLAGS']);
  n += 1;
}

// --- precedence: syntax/duplicate before semantics ---
throws('WINDOW=99;WINDOW=99;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'dup before value');
throws('WINDOW=99;RATE=1;LIMIT=2;bad key=1', 'INVALID_FORMAT', 'syntax before value');
throws('WINDOW=99;RATE=1;LIMIT=2;"OPEN', 'INVALID_FORMAT', 'unterminated before value');
throws('RATE=1;LIMIT=2;WINDOW=abc;WINDOW=1', 'INVALID_FORMAT', 'dup wins over bad int');
throws('BAD=1', 'INVALID_FORMAT', 'unknown-only record');
throws('WINDOW=3;RATE=1;LIMIT=2\nWINDOW=99;RATE=1;LIMIT=2', 'INVALID_VALUE', 'second record bad');

// --- order / object shape / types ---
{
  const out = readInput('WINDOW=3;RATE=1;LIMIT=2\nWINDOW=4;RATE=2;LIMIT=3');
  assert.deepEqual(out, [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 3 }]);
  assert.ok(out.every((o) => Object.getPrototypeOf(o) === Object.prototype));
  n += 1;
}
{
  const o = readInput('WINDOW=3;RATE=1;LIMIT=2')[0];
  assert.equal(typeof o.WINDOW, 'number');
  assert.equal(typeof o.RATE, 'number');
  assert.equal(typeof o.LIMIT, 'number');
  n += 1;
}
{
  const o = readInput('WINDOW=3;RATE=1;LIMIT=2;COLOR=red')[0];
  assert.equal(typeof o.COLOR, 'string');
  n += 1;
}

// --- non-string input ---
throws(null, 'INVALID_FORMAT', 'null');
throws(undefined, 'INVALID_FORMAT', 'undefined');

console.log(`spec checks PASS (${n} assertions)`);
