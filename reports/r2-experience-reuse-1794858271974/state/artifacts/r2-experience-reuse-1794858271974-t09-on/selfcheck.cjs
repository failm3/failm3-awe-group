'use strict';
// Independent self-check of lib/input.cjs against every clause in FORMAT.md.
const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let pass = 0;
function ok(label, fn) { fn(); pass++; }
function eq(text, expected, label) {
  assert.deepEqual(readInput(text), expected, label);
}
function fmt(text, label) {
  assert.throws(() => readInput(text), (e) => e instanceof Error && e.message === 'INVALID_FORMAT',
    label + ' -> expected INVALID_FORMAT');
}
function val(text, label) {
  assert.throws(() => readInput(text), (e) => e instanceof Error && e.message === 'INVALID_VALUE',
    label + ' -> expected INVALID_VALUE');
}

// --- basics ---
ok('empty', () => eq('', []));
ok('non-string', () => fmt(null, 'null'));
ok('non-string num', () => fmt(5, '5'));

// --- line endings ---
ok('LF', () => eq('WINDOW=1|RATE=0|LIMIT=1\nWINDOW=2|RATE=1|LIMIT=2',
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]));
ok('CRLF', () => eq('WINDOW=1|RATE=0|LIMIT=1\r\nWINDOW=2|RATE=1|LIMIT=2',
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]));
ok('CR', () => eq('WINDOW=1|RATE=0|LIMIT=1\rWINDOW=2|RATE=1|LIMIT=2',
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]));
ok('trailing LF', () => eq('WINDOW=1|RATE=0|LIMIT=1\n',
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]));
ok('trailing CRLF', () => eq('WINDOW=1|RATE=0|LIMIT=1\r\n',
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]));

// --- quoted fields ---
ok('quoted whole field', () => eq('"WINDOW=1"|RATE=0|LIMIT=1', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]));
ok('quoted field keeps separator as one field -> 2 equals', () => fmt('"WINDOW=1|RATE=0|LIMIT=1"', 'quoted spanning'));
ok('doubled quote decode', () => eq('WINDOW=1|RATE=0|LIMIT=1|NOTE="a""b"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, NOTE: 'a"b' }]));
ok('quoted LF', () => eq('WINDOW=1|RATE=0|LIMIT=1|NOTE="a\nb"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, NOTE: 'a\nb' }]));
ok('quoted CRLF', () => eq('WINDOW=1|RATE=0|LIMIT=1|NOTE="a\r\nb"', [{ WINDOW: 1, RATE: 0, LIMIT: 1, NOTE: 'a\r\nb' }]));
ok('quoted empty value', () => eq('WINDOW=1|RATE=0|LIMIT=1|NOTE=', [{ WINDOW: 1, RATE: 0, LIMIT: 1, NOTE: '' }]));
ok('quoted single field missing required', () => val('"RATE=0"', 'quoted single'));
// quoted record ending a record, then next record
ok('quoted then newline', () => eq('"WINDOW=1|RATE=0|LIMIT=1"\nWINDOW=2|RATE=1|LIMIT=2',
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]));

// --- invalid quoting ---
ok('unterminated quote', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOTE="abc', 'unterminated'));
ok('quote in unquoted field', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOT"E=x', 'quote mid unquoted'));
ok('chars after closing quote', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOTE="a"b', 'after close'));
ok('quote after unquoted start', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOTE=a"', 'partial'));

// --- bad keys / equals ---
ok('bad key lowercase', () => fmt('window=1|RATE=0|LIMIT=1', 'lowercase key'));
ok('bad key leading digit', () => fmt('1WINDOW=1|RATE=0|LIMIT=1', 'digit key'));
ok('bad key empty', () => fmt('=1|RATE=0|LIMIT=1', 'empty key'));
ok('no equals', () => fmt('WINDOW|RATE=0|LIMIT=1', 'no equals'));
ok('two equals', () => fmt('WINDOW=1=1|RATE=0|LIMIT=1', 'two equals'));
ok('empty field', () => fmt('WINDOW=1||LIMIT=1', 'empty field'));
ok('trailing separator', () => fmt('WINDOW=1|RATE=0|LIMIT=1|', 'trailing sep'));
ok('leading separator', () => fmt('|WINDOW=1|RATE=0|LIMIT=1', 'leading sep'));
ok('blank line', () => fmt('WINDOW=1|RATE=0|LIMIT=1\n\nWINDOW=2|RATE=1|LIMIT=2', 'blank line'));

// --- duplicates ---
ok('dup key', () => fmt('WINDOW=1|WINDOW=2|RATE=0|LIMIT=1', 'dup'));
ok('dup quoted/unquoted', () => fmt('"WINDOW=1"|WINDOW=2|RATE=0|LIMIT=1', 'dup mixed'));
ok('dup unknown', () => fmt('WINDOW=1|RATE=0|LIMIT=1|X=1|X=2', 'dup unknown'));
ok('dup decoded key', () => fmt('WINDOW=1|RATE=0|LIMIT=1|"NOTE=1"|NOTE=2', 'dup decoded'));

// --- whitespace ---
ok('leading space value', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOTE= a', 'ws lead'));
ok('trailing space value', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOTE=a ', 'ws trail'));
ok('tab value', () => fmt('WINDOW=1|RATE=0|LIMIT=1|NOTE=a\t', 'tab trail'));
ok('space in key', () => fmt('WINDOW=1|RATE=0|LIMIT=1| NO=a', 'space key'));
ok('ws before eq', () => fmt('WINDOW =1|RATE=0|LIMIT=1', 'ws key'));
ok('quoted ws kept', () => eq('WINDOW=1|RATE=0|LIMIT=1|NOTE=" a "', [{ WINDOW: 1, RATE: 0, LIMIT: 1, NOTE: ' a ' }]));

// --- unknown keys ---
ok('unknown dropped', () => eq('WINDOW=1|RATE=0|LIMIT=1|X=1|Y=2', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]));
ok('proto key', () => {
  const r = readInput('WINDOW=1|RATE=0|LIMIT=1|__proto__=x|constructor=y');
  assert.deepEqual(r, [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]);
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
});
ok('unknown syntax still validated', () => fmt('WINDOW=1|RATE=0|LIMIT=1|X= a', 'unknown ws'));

// --- required / semantics ---
ok('missing WINDOW', () => val('RATE=0|LIMIT=1', 'missing WINDOW'));
ok('missing RATE', () => val('WINDOW=1|LIMIT=1', 'missing RATE'));
ok('missing LIMIT', () => val('WINDOW=1|RATE=0', 'missing LIMIT'));
ok('window 0', () => val('WINDOW=0|RATE=0|LIMIT=1', 'window 0'));
ok('window 61', () => val('WINDOW=61|RATE=0|LIMIT=1', 'window 61'));
ok('window leading zero', () => val('WINDOW=01|RATE=0|LIMIT=1', 'window 01'));
ok('window negative', () => val('WINDOW=-1|RATE=0|LIMIT=1', 'window -1'));
ok('window plus', () => val('WINDOW=+1|RATE=0|LIMIT=1', 'window +1'));
ok('rate 21', () => val('WINDOW=1|RATE=21|LIMIT=1', 'rate 21'));
ok('rate empty', () => val('WINDOW=1|RATE=|LIMIT=1', 'rate empty'));
ok('limit 0', () => val('WINDOW=1|RATE=0|LIMIT=0', 'limit 0'));
ok('limit 101', () => val('WINDOW=1|RATE=0|LIMIT=101', 'limit 101'));
ok('float', () => val('WINDOW=1.5|RATE=0|LIMIT=1', 'float'));
ok('hex', () => val('WINDOW=0x1|RATE=0|LIMIT=1', 'hex'));
ok('exp', () => val('WINDOW=1e1|RATE=0|LIMIT=1', 'exp'));
ok('value space inside', () => val('WINDOW=1 2|RATE=0|LIMIT=1', 'inner space'));

// --- syntax precedence over semantics ---
ok('precedence: bad syntax in record with bad value', () => fmt('WINDOW=999|BAD KEY=1|RATE=0|LIMIT=1', 'precedence fmt over value'));
ok('precedence: dup with bad value', () => fmt('WINDOW=999|WINDOW=1|RATE=0|LIMIT=1', 'precedence dup over value'));

// --- optionals ---
ok('DURATION', () => eq('WINDOW=1|RATE=0|LIMIT=1|DURATION=150', [{ WINDOW: 1, RATE: 0, LIMIT: 1, DURATION: 150 }]));
ok('DURATION 0', () => val('WINDOW=1|RATE=0|LIMIT=1|DURATION=0', 'dur 0'));
ok('DURATION 151', () => val('WINDOW=1|RATE=0|LIMIT=1|DURATION=151', 'dur 151'));
ok('DURATION negative', () => val('WINDOW=1|RATE=0|LIMIT=1|DURATION=-5', 'dur -5'));
ok('DURATION leading zero ok', () => eq('WINDOW=1|RATE=0|LIMIT=1|DURATION=05', [{ WINDOW: 1, RATE: 0, LIMIT: 1, DURATION: 5 }]));
ok('DURATION alpha', () => val('WINDOW=1|RATE=0|LIMIT=1|DURATION=x', 'dur x'));

ok('COLOR dropped (undocumented)', () => eq('WINDOW=1|RATE=0|LIMIT=1|COLOR=red', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]));
ok('FLAGS dropped (undocumented)', () => eq('WINDOW=1|RATE=0|LIMIT=1|FLAGS=a,b', [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]));

// --- key insertion order: schema order then unknown order ---
ok('schema order', () => {
  const r = readInput('LIMIT=1|RATE=0|WINDOW=1');
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT']);
});
ok('schema+unknown order', () => {
  const r = readInput('Z=1|LIMIT=1|A=2|DURATION=2|RATE=0|WINDOW=1');
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'DURATION']);
});

// --- records preserve order ---
ok('record order', () => {
  const r = readInput('WINDOW=3|RATE=0|LIMIT=1\nWINDOW=1|RATE=0|LIMIT=1');
  assert.deepEqual(r.map(x => x.WINDOW), [3, 1]);
});

// --- plain own-key objects ---
ok('plain objects', () => {
  const r = readInput('WINDOW=1|RATE=0|LIMIT=1');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.deepEqual(Object.keys(r[0]).sort(), ['LIMIT', 'RATE', 'WINDOW']);
});

// --- single-field record validity ---
ok('one field record w/ required missing -> value', () => val('WINDOW=1', 'single field'));

// --- empty quoted record field is a record with 1 field -> missing required
ok('quoted empty then rest', () => fmt('""|WINDOW=1', 'quoted empty field no equals'));

console.log('conformance PASS (' + pass + ' checks)');
