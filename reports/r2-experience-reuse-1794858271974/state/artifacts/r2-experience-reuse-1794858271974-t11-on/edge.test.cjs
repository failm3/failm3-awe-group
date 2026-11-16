'use strict';
// Independent edge-case suite derived from FORMAT.md (not part of the graded visible test).
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let n = 0;
function ok(label, fn) { fn(); n++; }
function eq(label, input, expected) {
  assert.deepEqual(readInput(input), expected, 'FAIL eq: ' + label);
  n++;
}
function throws(label, input, msg) {
  assert.throws(() => readInput(input), (e) => {
    assert.ok(e instanceof Error, label + ': not an Error');
    assert.equal(e.message, msg, label + ': wrong message, got ' + e.message);
    return true;
  }, 'FAIL throws: ' + label);
  n++;
}

// --- empty / basic ---
eq('empty string', '', []);
eq('required only', 'WINDOW=3|RATE=0|LIMIT=150', [{ WINDOW: 3, RATE: 0, LIMIT: 150 }]);
eq('all known fields', 'WINDOW=30|RATE=40|LIMIT=1|FLAGS=dry|COLOR=red',
  [{ WINDOW: 30, RATE: 40, LIMIT: 1, FLAGS: ['dry'], COLOR: 'red' }]);
eq('unknown keys dropped', 'WINDOW=4|RATE=1|LIMIT=2|ZZZ=1|AAA=2',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);

// --- record separators ---
eq('LF multi record', 'WINDOW=4|RATE=1|LIMIT=2\nWINDOW=5|RATE=2|LIMIT=3',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]);
eq('CRLF multi record', 'WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]);
eq('CR multi record', 'WINDOW=4|RATE=1|LIMIT=2\rWINDOW=5|RATE=2|LIMIT=3',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]);
eq('trailing LF', 'WINDOW=4|RATE=1|LIMIT=2\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
eq('trailing CRLF', 'WINDOW=4|RATE=1|LIMIT=2\r\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
eq('mixed separators', 'WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3\rWINDOW=6|RATE=3|LIMIT=4\n',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }, { WINDOW: 6, RATE: 3, LIMIT: 4 }]);

// --- whitespace policy: value only ---
eq('trim value spaces', 'WINDOW=  4 |RATE=1|LIMIT=2\t', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
eq('trim COLOR', 'WINDOW=4|RATE=1|LIMIT=2|COLOR=  blue  ', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'blue' }]);
throws('key not trimmed', 'WINDOW =4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('leading space key', ' WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');

// --- quoted fields ---
eq('quoted field', '"WINDOW=4"|"RATE=1"|"LIMIT=2"', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]);
eq('quoted whole field with separator', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=a|b"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a|b' }]);
eq('quoted whole field with equals', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=a=b=c"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a=b=c' }]);
eq('doubled quote decodes', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=a""b"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a"b' }]);
eq('quoted field CRLF kept', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=a\r\nb"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\r\nb' }]);
eq('quoted field newline kept', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=a\nb"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\nb' }]);
eq('quoted field cross-record continuation', '"WINDOW=4"|"RATE=1"|"LIMIT=2"\n"WINDOW=5"|"RATE=2"|"LIMIT=3"', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]);
throws('quote inside unquoted value', 'WINDOW=4|RATE=1|LIMIT=2|COLOR="a|b"', 'INVALID_FORMAT');
eq('quoted FLAGS', '"WINDOW=4"|"RATE=1"|"LIMIT=2"|"FLAGS=dry,live"',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['dry', 'live'] }]);
eq('quoted field value trimmed', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=  pad  "', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'pad' }]);
throws('unterminated quote', 'WINDOW=4|RATE=1|LIMIT=2|"COLOR=abc', 'INVALID_FORMAT');
throws('char after closing quote', '"WINDOW=4"x|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('quote inside unquoted field', 'WINDOW="4"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('quote in middle of unquoted', 'WINDOW=4"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('empty quoted field', '""|WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('quoted field no equals', '"WINDOW4"|WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');

// --- key syntax ---
throws('empty key', '=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('lowercase key', 'window=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('digit-first key', '1WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('dashed key', 'WIN-DOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('underscore-first key', '_X=4|WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('no equals', 'WINDOW4|WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('two equals unquoted', 'WINDOW=4=5|RATE=1|LIMIT=2', 'INVALID_FORMAT');

// --- duplicates (decoded) ---
throws('duplicate key', 'WINDOW=4|WINDOW=5|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('duplicate quoted/unquoted mix', 'WINDOW=4|"WINDOW=5"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
throws('duplicate unknown key', 'WINDOW=4|RATE=1|LIMIT=2|ZZ=1|ZZ=2', 'INVALID_FORMAT');
throws('duplicate beats bad value', 'WINDOW=99|RATE=1|LIMIT=2|WINDOW=4', 'INVALID_FORMAT');
throws('syntax beats bad value', 'WINDOW=99|RATE=1|LIMIT=2|BAD', 'INVALID_FORMAT');

// --- required fields ---
throws('missing WINDOW', 'RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('missing RATE', 'WINDOW=4|LIMIT=2', 'INVALID_VALUE');
throws('missing LIMIT', 'WINDOW=4|RATE=1', 'INVALID_VALUE');
throws('missing all', 'COLOR=red', 'INVALID_VALUE');

// --- WINDOW canonical 3..30 ---
eq('WINDOW 3', 'WINDOW=3|RATE=1|LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq('WINDOW 30', 'WINDOW=30|RATE=1|LIMIT=2', [{ WINDOW: 30, RATE: 1, LIMIT: 2 }]);
throws('WINDOW 2', 'WINDOW=2|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW 31', 'WINDOW=31|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW leading zero', 'WINDOW=04|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW empty', 'WINDOW=|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW negative', 'WINDOW=-4|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW plus', 'WINDOW=+4|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW float', 'WINDOW=4.0|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW text', 'WINDOW=four|RATE=1|LIMIT=2', 'INVALID_VALUE');
throws('WINDOW spaced digits', 'WINDOW=4 0|RATE=1|LIMIT=2', 'INVALID_VALUE');

// --- RATE canonical 0..40 ---
eq('RATE 0', 'WINDOW=4|RATE=0|LIMIT=2', [{ WINDOW: 4, RATE: 0, LIMIT: 2 }]);
eq('RATE 40', 'WINDOW=4|RATE=40|LIMIT=2', [{ WINDOW: 4, RATE: 40, LIMIT: 2 }]);
throws('RATE 41', 'WINDOW=4|RATE=41|LIMIT=2', 'INVALID_VALUE');
throws('RATE leading zero', 'WINDOW=4|RATE=01|LIMIT=2', 'INVALID_VALUE');
throws('RATE negative', 'WINDOW=4|RATE=-1|LIMIT=2', 'INVALID_VALUE');
throws('RATE empty', 'WINDOW=4|RATE=|LIMIT=2', 'INVALID_VALUE');

// --- LIMIT canonical 1..150 ---
eq('LIMIT 1', 'WINDOW=4|RATE=1|LIMIT=1', [{ WINDOW: 4, RATE: 1, LIMIT: 1 }]);
eq('LIMIT 150', 'WINDOW=4|RATE=1|LIMIT=150', [{ WINDOW: 4, RATE: 1, LIMIT: 150 }]);
throws('LIMIT 0', 'WINDOW=4|RATE=1|LIMIT=0', 'INVALID_VALUE');
throws('LIMIT 151', 'WINDOW=4|RATE=1|LIMIT=151', 'INVALID_VALUE');
throws('LIMIT leading zero', 'WINDOW=4|RATE=1|LIMIT=010', 'INVALID_VALUE');

// --- FLAGS ---
eq('FLAGS one', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=live', [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['live'] }]);
eq('FLAGS both', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry,live', [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['dry', 'live'] }]);
eq('FLAGS reversed', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=live,dry', [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['live', 'dry'] }]);
throws('FLAGS repeat', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry,dry', 'INVALID_VALUE');
throws('FLAGS unknown value', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=wet', 'INVALID_VALUE');
throws('FLAGS empty', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=', 'INVALID_VALUE');
throws('FLAGS trailing comma', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry,', 'INVALID_VALUE');
throws('FLAGS inner space not trimmed', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry, live', 'INVALID_VALUE');

// --- COLOR is a string, any content ---
eq('COLOR empty', 'WINDOW=4|RATE=1|LIMIT=2|COLOR=', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: '' }]);
eq('COLOR numeric stays string', 'WINDOW=4|RATE=1|LIMIT=2|COLOR=42', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: '42' }]);

// --- prototype safety ---
(() => {
  const r = readInput('WINDOW=4|RATE=1|LIMIT=2|CONSTRUCTOR=x|PROTO=y');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT']);
  n++;
})();
throws('prototype-looking key invalid syntax', '__PROTO__=x|WINDOW=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');

// --- output shape ---
(() => {
  const r = readInput('WINDOW=4|RATE=1|LIMIT=2\nWINDOW=5|RATE=2|LIMIT=3');
  assert.ok(Array.isArray(r));
  assert.equal(typeof r[0].WINDOW, 'number');
  assert.ok(Array.isArray(r[0].FLAGS || []) || r[0].FLAGS === undefined);
  n++;
})();
throws('non-string input', null, 'INVALID_FORMAT');
throws('blank record line', 'WINDOW=4|RATE=1|LIMIT=2\n\nWINDOW=5|RATE=2|LIMIT=3', 'INVALID_FORMAT');
throws('trailing separator', 'WINDOW=4|RATE=1|LIMIT=2|', 'INVALID_FORMAT');

console.log('edge cases PASS (' + n + ' assertions)');
