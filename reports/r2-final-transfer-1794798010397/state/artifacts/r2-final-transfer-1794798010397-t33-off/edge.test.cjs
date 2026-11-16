'use strict';
const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');

const ok = (input, expected, label) => {
  try {
    assert.deepEqual(decodeSeparated(input), expected);
  } catch (e) {
    console.error('FAIL(ok) ' + (label || JSON.stringify(input)));
    throw e;
  }
};
const bad = (input, msg, label) => {
  try {
    decodeSeparated(input);
  } catch (e) {
    assert.ok(e instanceof Error, 'not an Error');
    assert.equal(e.message, msg, 'wrong message for ' + JSON.stringify(input));
    return;
  }
  console.error('FAIL(bad, no throw) ' + (label || JSON.stringify(input)));
  throw new Error('expected throw: ' + msg);
};

// --- empty / separators ---
ok('', [], 'empty');
bad('\n\n', 'INVALID_FORMAT', 'empty records');
bad('\r\n', 'INVALID_FORMAT', 'lone terminator makes an empty record');
ok('WINDOW=1|RATE=0|LIMIT=1\n', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }], 'trailing LF');
ok('WINDOW=1|RATE=0|LIMIT=1\r\nWINDOW=2|RATE=0|LIMIT=1', [
  { WINDOW: 1, RATE: 0, LIMIT: 1 },
  { WINDOW: 2, RATE: 0, LIMIT: 1 },
], 'CRLF records');
ok('WINDOW=1|RATE=0|LIMIT=1\rWINDOW=2|RATE=0|LIMIT=1', [
  { WINDOW: 1, RATE: 0, LIMIT: 1 },
  { WINDOW: 2, RATE: 0, LIMIT: 1 },
], 'CR records');
ok('WINDOW=1|RATE=0|LIMIT=1\r\n', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }], 'trailing CRLF');

// --- ordering / optional fields ---
ok('RATE=3|LIMIT=4|WINDOW=5', [{ WINDOW: 5, RATE: 3, LIMIT: 4 }], 'schema order');
ok('DURATION=9|WINDOW=1|RATE=0|LIMIT=1', [{ WINDOW: 1, RATE: 0, LIMIT: 1, DURATION: 9 }], 'optional order');
ok('WINDOW=1|RATE=0|LIMIT=1|COLOR=red', [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'red' }], 'COLOR string');
ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS=a,b', [{ WINDOW: 1, RATE: 0, LIMIT: 1, FLAGS: ['a', 'b'] }], 'FLAGS array');
ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS=', [{ WINDOW: 1, RATE: 0, LIMIT: 1, FLAGS: [''] }], 'FLAGS single empty');

// --- unknown keys dropped ---
ok('WINDOW=1|RATE=0|LIMIT=1|ZZZ=1|AAA=2', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }], 'unknown dropped');
ok('WINDOW=1|RATE=0|LIMIT=1|__proto__=x', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }], 'proto key dropped');
const protoRec = decodeSeparated('WINDOW=1|RATE=0|LIMIT=1|__proto__=x');
assert.equal(Object.getPrototypeOf(protoRec[0]), Object.prototype, 'prototype intact');

// --- quoting ---
ok('"WINDOW=1"|RATE=0|LIMIT=1', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }], 'quoted whole field');
ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="a|b=c"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a|b=c' }], 'separators/equals in quotes');
ok('WINDOW=1|RATE=0|LIMIT=1|"COLOR=a""b"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a"b' }], 'double quote escape');
ok('"WINDOW=1|RATE=0|LIMIT=1|COLOR=x\ny"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'x\ny' }], 'quoted LF');
ok('"WINDOW=1|RATE=0|LIMIT=1|COLOR=x\r\ny"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'x\r\ny' }], 'quoted CRLF');

// --- INVALID_FORMAT ---
bad('WINDOW=1|RATE=0|LIMIT=1|COLOR="abc', 'INVALID_FORMAT', 'unterminated');
bad('WINDOW=1|RATE=0|LIMIT="1"', 'INVALID_FORMAT', 'quote in unquoted');
bad('"WINDOW=1"x|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'chars after close');
bad('window=1|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'bad key');
bad('1WINDOW=1|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'bad key digit');
bad('WINDOW=1=2|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'two equals');
bad('WINDOW|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'no equals');
bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=5|DURATION=6', 'INVALID_FORMAT', 'duplicate');
bad('"WINDOW=1"|WINDOW=1|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'duplicate via quote');
bad('WINDOW=1 |RATE=0|LIMIT=1', 'INVALID_FORMAT', 'value trailing ws');
bad('WINDOW= 1|RATE=0|LIMIT=1', 'INVALID_FORMAT', 'value leading ws');

// --- INVALID_VALUE ---
bad('WINDOW=20|RATE=0', 'INVALID_VALUE', 'missing LIMIT');
bad('WINDOW=02|RATE=0|LIMIT=1', 'INVALID_VALUE', 'leading zero');
bad('WINDOW=0|RATE=0|LIMIT=1', 'INVALID_VALUE', 'window 0');
bad('WINDOW=51|RATE=0|LIMIT=1', 'INVALID_VALUE', 'window 51');
bad('WINDOW=1|RATE=21|LIMIT=1', 'INVALID_VALUE', 'rate 21');
bad('WINDOW=1|RATE=0|LIMIT=101', 'INVALID_VALUE', 'limit 101');
bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=0', 'INVALID_VALUE', 'duration 0');
bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=121', 'INVALID_VALUE', 'duration 121');
bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=x', 'INVALID_VALUE', 'duration non-numeric');
bad('WINDOW=-1|RATE=0|LIMIT=1', 'INVALID_VALUE', 'negative window');

// --- precedence: format beats value ---
bad('WINDOW=99|RATE=0|LIMIT=1|BADKEY=1', 'INVALID_FORMAT', 'format over value');

console.log('edge PASS');
