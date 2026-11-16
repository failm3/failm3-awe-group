'use strict';
// Scratch spec-conformance harness (not part of the mission's visible test).
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let pass = 0;
function ok(label, fn) {
  try { fn(); pass++; } catch (e) { console.error('FAIL:', label, '->', e.message); process.exitCode = 1; }
}
const eq = (a, b) => assert.deepStrictEqual(a, b);
const bad = (msg, text) => {
  let err;
  try { readInput(text); } catch (e) { err = e; }
  assert.ok(err instanceof Error, 'expected throw for ' + JSON.stringify(text));
  assert.strictEqual(err.message, msg, 'for ' + JSON.stringify(text) + ' got ' + err.message);
};

// --- basics / separators
ok('empty', () => eq(readInput(''), []));
ok('single', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('CRLF', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
ok('CR only', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2\rWINDOW=5|RATE=2|LIMIT=3').length, 2));
ok('LF only', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2\nWINDOW=5|RATE=2|LIMIT=3').length, 2));

// --- boundary integers
ok('bounds low', () => eq(readInput('WINDOW=3|RATE=0|LIMIT=1'), [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]));
ok('bounds high', () => eq(readInput('WINDOW=30|RATE=40|LIMIT=150'), [{ WINDOW: 30, RATE: 40, LIMIT: 150 }]));
ok('window 2', () => bad('INVALID_VALUE', 'WINDOW=2|RATE=1|LIMIT=2'));
ok('window 31', () => bad('INVALID_VALUE', 'WINDOW=31|RATE=1|LIMIT=2'));
ok('rate 41', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=41|LIMIT=2'));
ok('limit 0', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1|LIMIT=0'));
ok('limit 151', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1|LIMIT=151'));
ok('leading zero', () => bad('INVALID_VALUE', 'WINDOW=04|RATE=1|LIMIT=2'));
ok('plus sign', () => bad('INVALID_VALUE', 'WINDOW=+4|RATE=1|LIMIT=2'));
ok('negative', () => bad('INVALID_VALUE', 'WINDOW=-4|RATE=1|LIMIT=2'));
ok('float', () => bad('INVALID_VALUE', 'WINDOW=4.0|RATE=1|LIMIT=2'));
ok('empty value', () => bad('INVALID_VALUE', 'WINDOW=|RATE=1|LIMIT=2'));
ok('whitespace inner', () => bad('INVALID_VALUE', 'WINDOW=4 0|RATE=1|LIMIT=2'));

// --- missing required
ok('missing window', () => bad('INVALID_VALUE', 'RATE=1|LIMIT=2'));
ok('missing rate', () => bad('INVALID_VALUE', 'WINDOW=4|LIMIT=2'));
ok('missing limit', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1'));

// --- whitespace policy on value only
ok('value trimmed', () => eq(readInput('WINDOW=   4   |RATE=\t1  |LIMIT= 2 '), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('key not trimmed', () => bad('INVALID_FORMAT', ' WINDOW=4|RATE=1|LIMIT=2'));
ok('key inner space', () => bad('INVALID_FORMAT', 'WINDOW =4|RATE=1|LIMIT=2'));

// --- FLAGS
ok('flags one', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry')[0].FLAGS, ['dry']));
ok('flags both', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry,live')[0].FLAGS, ['dry', 'live']));
ok('flags repeat', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry,dry'));
ok('flags unknown', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry,test'));
ok('flags empty', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS='));
ok('flags space sep', () => bad('INVALID_VALUE', 'WINDOW=4|RATE=1|LIMIT=2|FLAGS=dry, live'));

// --- unknown keys dropped
ok('unknown dropped', () => eq(readInput('WINDOW=4|RATE=1|LIMIT=2|COLOR=red'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('unknown before', () => eq(Object.keys(readInput('COLOR=red|WINDOW=4|RATE=1|LIMIT=2')[0]), ['WINDOW', 'RATE', 'LIMIT']));
ok('unknown proto key', () => {
  const r = readInput('WINDOW=4|RATE=1|LIMIT=2|CONSTRUCTOR=x|PROTOTYPE=y');
  eq(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT']);
  eq(Object.getPrototypeOf(r[0]), Object.prototype);
  eq(Object.prototype.hasOwnProperty.call(r[0], 'CONSTRUCTOR'), false);
});
ok('underscore key invalid', () => bad('INVALID_FORMAT', 'WINDOW=4|RATE=1|LIMIT=2|__PROTO__=x'));
ok('COLOR dropped not string kept', () => eq(Object.prototype.hasOwnProperty.call(readInput('WINDOW=4|RATE=1|LIMIT=2|COLOR=  red  ')[0], 'COLOR'), false));

// --- duplicate keys
ok('dup key', () => bad('INVALID_FORMAT', 'WINDOW=4|WINDOW=5|RATE=1|LIMIT=2'));
ok('dup unknown', () => bad('INVALID_FORMAT', 'WINDOW=4|RATE=1|LIMIT=2|COLOR=a|COLOR=b'));
ok('dup after unquote', () => bad('INVALID_FORMAT', 'WINDOW=4|"WINDOW"=5|RATE=1|LIMIT=2'));

// --- syntax errors
ok('no equals', () => bad('INVALID_FORMAT', 'WINDOW=4|RATE|LIMIT=2'));
ok('two equals', () => bad('INVALID_FORMAT', 'WINDOW=4|RATE=1=2|LIMIT=2'));
ok('bad key lower', () => bad('INVALID_FORMAT', 'window=4|RATE=1|LIMIT=2'));
ok('bad key digit', () => bad('INVALID_FORMAT', '1WINDOW=4|RATE=1|LIMIT=2'));
ok('bad key empty', () => bad('INVALID_FORMAT', '=4|RATE=1|LIMIT=2'));
ok('empty field', () => bad('INVALID_FORMAT', 'WINDOW=4||RATE=1|LIMIT=2'));
ok('trailing sep', () => bad('INVALID_FORMAT', 'WINDOW=4|RATE=1|LIMIT=2|'));
ok('leading sep', () => bad('INVALID_FORMAT', '|WINDOW=4|RATE=1|LIMIT=2'));
ok('bare quote in raw', () => bad('INVALID_FORMAT', 'WINDOW="4|RATE=1|LIMIT=2'));
ok('quote in unquoted', () => bad('INVALID_FORMAT', 'WINDOW=4"|RATE=1|LIMIT=2'));
ok('unterminated', () => bad('INVALID_FORMAT', '"WINDOW=4|RATE=1|LIMIT=2'));
ok('text after quote', () => bad('INVALID_FORMAT', '"WINDOW"=4x|RATE=1|LIMIT=2'));

// --- quoted fields
ok('quoted whole field', () => eq(readInput('"WINDOW=4"|RATE=1|LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('quoted with sep', () => eq(readInput('"COLOR=a|b"|WINDOW=4|RATE=1|LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('quoted with equals', () => eq(readInput('"COLOR=a=b"|WINDOW=4|RATE=1|LIMIT=2').length, 1));
ok('quoted escaped quote', () => eq(readInput('"COLOR=say ""hi"""|WINDOW=4|RATE=1|LIMIT=2').length, 1));
ok('quoted newline value trimmed', () => eq(readInput('"WINDOW=4"|"RATE=1"|"LIMIT=2"|"COLOR=a\nb"'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('quote then sep then record', () => eq(readInput('"WINDOW=4"|"RATE=1"|"LIMIT=2"\n"WINDOW=5"|RATE=2|LIMIT=3')[1].WINDOW, 5));

// --- precedence: syntax/dup/whitespace concerns before semantic
ok('precedence dup before value', () => bad('INVALID_FORMAT', 'WINDOW=99|WINDOW=5|RATE=1|LIMIT=2'));
ok('precedence syntax before value', () => bad('INVALID_FORMAT', 'WINDOW=99|rate=1|LIMIT=2'));
ok('precedence bad value over dup? dup first', () => bad('INVALID_FORMAT', 'RATE=x|RATE=y|WINDOW=4|LIMIT=2'));
ok('order of semantic errors', () => bad('INVALID_VALUE', 'WINDOW=99|RATE=x|LIMIT=0'));

// --- multi record ordering
ok('records order', () => {
  const r = readInput('WINDOW=3|RATE=0|LIMIT=1|FLAGS=live\nWINDOW=30|RATE=40|LIMIT=150');
  eq(r, [{ WINDOW: 3, RATE: 0, LIMIT: 1, FLAGS: ['live'] }, { WINDOW: 30, RATE: 40, LIMIT: 150 }]);
});
ok('plain objects', () => {
  const r = readInput('WINDOW=4|RATE=1|LIMIT=2')[0];
  eq(Object.getPrototypeOf(r), Object.prototype);
  eq(Object.getOwnPropertyNames(r), ['WINDOW', 'RATE', 'LIMIT']);
});

if (!process.exitCode) console.log('scratch spec tests PASS (' + pass + ' groups)');
