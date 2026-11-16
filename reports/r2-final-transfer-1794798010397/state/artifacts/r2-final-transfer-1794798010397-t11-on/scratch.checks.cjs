'use strict';
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let pass = 0;
function eq(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  pass++;
}
function throws(fn, msg, label) {
  assert.throws(fn, (e) => e instanceof Error && e.message === msg, label + ' (msg mismatch: ' + msg + ')');
  pass++;
}

// ---- basics / separators ----
eq(readInput(''), [], 'empty');
eq(readInput('WINDOW=4|RATE=1|LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'single');
eq(readInput('WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'crlf');
eq(readInput('WINDOW=4|RATE=1|LIMIT=2\nWINDOW=5|RATE=2|LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'lf');
eq(readInput('WINDOW=4|RATE=1|LIMIT=2\rWINDOW=5|RATE=2|LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'cr');
eq(readInput('WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3\r'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'crlf then cr');

// ---- boundaries / canonical integers ----
eq(readInput('WINDOW=3|RATE=0|LIMIT=1'), [{ WINDOW: 3, RATE: 0, LIMIT: 1 }], 'mins');
eq(readInput('WINDOW=30|RATE=40|LIMIT=150'), [{ WINDOW: 30, RATE: 40, LIMIT: 150 }], 'maxs');
throws(() => readInput('WINDOW=2|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'window low');
throws(() => readInput('WINDOW=31|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'window high');
throws(() => readInput('WINDOW=4|RATE=41|LIMIT=1'), 'INVALID_VALUE', 'rate high');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=0'), 'INVALID_VALUE', 'limit low');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=151'), 'INVALID_VALUE', 'limit high');
throws(() => readInput('WINDOW=04|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'leading zero');
throws(() => readInput('WINDOW=+4|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'plus sign');
throws(() => readInput('WINDOW=-4|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'negative');
throws(() => readInput('WINDOW=4.0|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'float');
throws(() => readInput('WINDOW=|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'empty int');
throws(() => readInput('WINDOW=0|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'window zero');
throws(() => readInput('WINDOW=0x10|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'hex');
throws(() => readInput('WINDOW=1e1|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'exponent');

// ---- required fields ----
throws(() => readInput('RATE=0|LIMIT=1'), 'INVALID_VALUE', 'missing window');
throws(() => readInput('WINDOW=4|LIMIT=1'), 'INVALID_VALUE', 'missing rate');
throws(() => readInput('WINDOW=4|RATE=0'), 'INVALID_VALUE', 'missing limit');

// ---- trimming: value only ----
eq(readInput('WINDOW=  4  |RATE= 0 |LIMIT=1'), [{ WINDOW: 4, RATE: 0, LIMIT: 1 }], 'value trim');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR=  red  '),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'red' }], 'color trim');
throws(() => readInput(' WINDOW=4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'key leading space');
throws(() => readInput('WINDOW =4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'key trailing space');
throws(() => readInput('window=4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'lowercase key');
throws(() => readInput('1WINDOW=4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'digit-first key');

// ---- FLAGS/COLOR ----
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=dry'), [{ WINDOW: 4, RATE: 0, LIMIT: 1, FLAGS: ['dry'] }], 'flags one');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=live,dry'), [{ WINDOW: 4, RATE: 0, LIMIT: 1, FLAGS: ['live', 'dry'] }], 'flags two');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=dry,dry'), 'INVALID_VALUE', 'flags repeat');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS='), 'INVALID_VALUE', 'flags empty');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=dry,'), 'INVALID_VALUE', 'flags trailing comma');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=bogus'), 'INVALID_VALUE', 'flags unknown');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=  dry '), [{ WINDOW: 4, RATE: 0, LIMIT: 1, FLAGS: ['dry'] }], 'flags trim');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|FLAGS=dry, live'), 'INVALID_VALUE', 'flags inner space');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR=blue'),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'blue' }], 'color');

// ---- ordering ----
eq(readInput('COLOR=x|FLAGS=dry|LIMIT=1|RATE=0|WINDOW=4'),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, FLAGS: ['dry'], COLOR: 'x' }], 'schema order');
eq(Object.keys(readInput('COLOR=x|FLAGS=dry|LIMIT=1|RATE=0|WINDOW=4')[0]),
   ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR'], 'schema key order');
eq(Object.keys(readInput('WINDOW=4|RATE=0|LIMIT=1|ZZ=1|AA=2')[0]),
   ['WINDOW', 'RATE', 'LIMIT'], 'unknown dropped');

// ---- quoting ----
eq(readInput('"WINDOW=4"|RATE=0|LIMIT=1'), [{ WINDOW: 4, RATE: 0, LIMIT: 1 }], 'quoted field');
eq(readInput('"WINDOW=4"|"RATE=0"|"LIMIT=1"'), [{ WINDOW: 4, RATE: 0, LIMIT: 1 }], 'all quoted');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR="a=b|c"'), [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'a=b|c' }], 'quoted value');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR="say ""hi"""'),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'say "hi"' }], 'escaped quotes');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR=""'), [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: '' }], 'empty quoted');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR="  hi  "'),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'hi' }], 'quoted then trimmed');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR="a\r\nb"'),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'a\r\nb' }], 'quoted crlf');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR="a\nb"'),
   [{ WINDOW: 4, RATE: 0, LIMIT: 1, COLOR: 'a\nb' }], 'quoted lf');
throws(() => readInput('"WINDOW=4"x|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'chars after close');
throws(() => readInput('"WINDOW=4" |RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'space after close');
throws(() => readInput('"WINDOW=4'), 'INVALID_FORMAT', 'unterminated');
throws(() => readInput('WINDOW="4"'), 'INVALID_FORMAT', 'quote in unquoted');
throws(() => readInput('WINDOW=4"|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'trailing quote unquoted');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|COLOR="a"b'), 'INVALID_FORMAT', 'quote mid unquoted');

// ---- structure ----
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1|'), 'INVALID_FORMAT', 'trailing pipe');
throws(() => readInput('|WINDOW=4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'leading pipe');
throws(() => readInput('WINDOW=4||RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'double pipe');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1\n\nWINDOW=4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'blank line');
throws(() => readInput('WINDOW=4=5|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'two equals');
throws(() => readInput('WINDOW|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'no equals');
throws(() => readInput('=4|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'empty key');
throws(() => readInput('WINDOW=4|WINDOW=5|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'dup key');
throws(() => readInput('"WINDOW=4"|WINDOW=5|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'dup after decode');
throws(() => readInput('"WI""NDOW=4"|RATE=0|LIMIT=1'), 'INVALID_FORMAT', 'decoded bad key');

// ---- precedence ----
throws(() => readInput('WINDOW=4|WINDOW=5|RATE=99|LIMIT=1'), 'INVALID_FORMAT', 'dup beats value');
throws(() => readInput('WINDOW=99|RATE=0|LIMIT=1|X=1|X=2'), 'INVALID_FORMAT', 'syntax beats value');
throws(() => readInput('WINDOW=99|RATE=0|LIMIT=1|bad'), 'INVALID_FORMAT', 'syntax beats value 2');
throws(() => readInput('WINDOW=4|RATE=0|LIMIT=1\nWINDOW=99|RATE=0|LIMIT=1'), 'INVALID_VALUE', 'record 2 invalid');

// ---- prototype safety ----
const proto = readInput('WINDOW=4|RATE=0|LIMIT=1|__PROTO__=x|constructor=y');
eq(Object.getPrototypeOf(proto[0]), Object.prototype, 'proto intact');
eq(proto[0].WINDOW, 4, 'proto window');
eq(Object.prototype.hasOwnProperty.call(proto[0], '__PROTO__'), false, 'unknown dropped');
eq({}.polluted, undefined, 'no pollution');

// ---- misc ----
throws(() => readInput(null), 'INVALID_FORMAT', 'null input');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1\n'), [{ WINDOW: 4, RATE: 0, LIMIT: 1 }], 'trailing lf');
eq(readInput('WINDOW=4|RATE=0|LIMIT=1\r\n\r\n'.slice(0, 21)), [{ WINDOW: 4, RATE: 0, LIMIT: 1 }], 'trailing crlf');

console.log('scratch PASS', pass, 'checks');
