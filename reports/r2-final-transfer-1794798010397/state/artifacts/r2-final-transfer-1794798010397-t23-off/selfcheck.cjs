'use strict';
// Self-check for lib/records.cjs against the full FORMAT.md specification.
// This file is a support artifact; it does not modify visible.test.cjs.
const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');

let pass = 0;
const ok = (label, fn) => { try { fn(); pass++; } catch (e) { console.error('FAIL: ' + label + '\n  ' + e.message); process.exitCode = 1; } };

ok('empty string', () => assert.deepEqual(parseRecords(''), []));
ok('only newlines', () => assert.deepEqual(parseRecords('\n\r\n\r'), []));
ok('trailing LF', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\n'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('trailing CRLF', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\r\n'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('trailing CR', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\r'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('CRLF records', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3\r\n'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
ok('CR records', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\rWINDOW=5|RATE=2|LIMIT=3'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
ok('LF records', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\nWINDOW=5|RATE=2|LIMIT=3'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
ok('mixed terminators', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2\r\nWINDOW=5|RATE=2|LIMIT=3\rWINDOW=6|RATE=3|LIMIT=4\n'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }, { WINDOW: 6, RATE: 3, LIMIT: 4 }]));

// quoting
ok('whole field quoted', () => assert.deepEqual(parseRecords('"WINDOW=4"|RATE=1|LIMIT=2'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('quoted separators and equals', () => assert.deepEqual(parseRecords('"WINDOW=4"|RATE=1|LIMIT=2|"COLOR=a|b=c"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a|b=c' }]));
ok('doubled quote decodes', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|"COLOR=a""b"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a"b' }]));
ok('quoted LF inside', () => assert.deepEqual(parseRecords('"WINDOW=4|RATE=1|LIMIT=2|COLOR=a\nb"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\nb' }]));
ok('quoted CRLF inside', () => assert.deepEqual(parseRecords('"WINDOW=4|RATE=1|LIMIT=2|COLOR=a\r\nb"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\r\nb' }]));
ok('quoted CR inside', () => assert.deepEqual(parseRecords('"WINDOW=4|RATE=1|LIMIT=2|COLOR=a\rb"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\rb' }]));
ok('quoted equals in key text', () => assert.deepEqual(parseRecords('"WINDOW=4"|RATE=1|LIMIT=2|"CO=LOR"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'LOR' }]));
ok('quoted empty value', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|"COLOR="'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: '' }]));
ok('quoted unknown numeric stays string', () => assert.strictEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|"COLOR=12"')[0].COLOR, '12'));

// whitespace policy: values only
ok('trim unquoted value', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|COLOR=  x  '),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'x' }]));
ok('trim quoted value', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|"COLOR=  y  "'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'y' }]));
ok('trim around numeric', () => assert.deepEqual(parseRecords('WINDOW= 4 |RATE= 1\t|LIMIT=\t2'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
ok('inner spaces preserved', () => assert.strictEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|COLOR=dark red')[0].COLOR, 'dark red'));

// unknown keys
ok('unknowns in field order after known', () => assert.deepEqual(parseRecords('Z=1|WINDOW=4|A=2|RATE=1|LIMIT=2'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, Z: '1', A: '2' }]));
ok('unknown after known field order', () => { const r = parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=read|AAA=1|BBB=2');
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'AAA', 'BBB']); });
ok('proto-looking key is own data', () => {
  const r = parseRecords('WINDOW=4|RATE=1|LIMIT=2|__PROTO__=x')[0];
  assert.equal(Object.getPrototypeOf(r), Object.prototype);
  assert.ok(Object.prototype.hasOwnProperty.call(r, '__PROTO__'));
  assert.strictEqual(r.__PROTO__, 'x');
  assert.strictEqual(JSON.parse(JSON.stringify(r)).__PROTO__, 'x');
});
ok('proto-looking value is string', () => assert.strictEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|X=__proto__')[0].X, '__proto__'));
ok('CONSTRUCTOR unknown kept', () => assert.strictEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|CONSTRUCTOR=5')[0].CONSTRUCTOR, '5'));
ok('output is plain object', () => assert.equal(Object.getPrototypeOf(parseRecords('WINDOW=4|RATE=1|LIMIT=2')[0]), Object.prototype));
ok('unknown numeric-looking stays string', () => assert.strictEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|COLOR=07')[0].COLOR, '07'));

// FORMAT errors
const F = { message: 'INVALID_FORMAT' };
ok('unterminated quote', () => assert.throws(() => parseRecords('"WINDOW=4|RATE=1|LIMIT=2'), F));
ok('unterminated quote empty', () => assert.throws(() => parseRecords('"'), F));
ok('chars after closing quote', () => assert.throws(() => parseRecords('"WINDOW=4"X|RATE=1|LIMIT=2'), F));
ok('space after closing quote', () => assert.throws(() => parseRecords('"WINDOW=4" |RATE=1|LIMIT=2'), F));
ok('quote inside unquoted', () => assert.throws(() => parseRecords('WINDOW="4|RATE=1|LIMIT=2'), F));
ok('quote mid unquoted', () => assert.throws(() => parseRecords('WI"NDOW=4|RATE=1|LIMIT=2'), F));
ok('doubled quote unquoted', () => assert.throws(() => parseRecords('WINDOW=4""|RATE=1|LIMIT=2'), F));
ok('lowercase key', () => assert.throws(() => parseRecords('window=4|RATE=1|LIMIT=2'), F));
ok('digit-first key', () => assert.throws(() => parseRecords('1WINDOW=4|RATE=1|LIMIT=2'), F));
ok('hyphen key', () => assert.throws(() => parseRecords('WI-NDOW=4|RATE=1|LIMIT=2'), F));
ok('space in key', () => assert.throws(() => parseRecords('WIND OW=4|RATE=1|LIMIT=2'), F));
ok('missing equals', () => assert.throws(() => parseRecords('WINDOW|RATE=1|LIMIT=2'), F));
ok('two equals', () => assert.throws(() => parseRecords('WINDOW=4=5|RATE=1|LIMIT=2'), F));
ok('duplicate key', () => assert.throws(() => parseRecords('WINDOW=4|WINDOW=5|RATE=1|LIMIT=2'), F));
ok('duplicate quoted key', () => assert.throws(() => parseRecords('"WINDOW=4"|"WINDOW=5"|RATE=1|LIMIT=2'), F));
ok('duplicate unknown key', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|A=1|A=2'), F));
ok('empty field', () => assert.throws(() => parseRecords('WINDOW=4||RATE=1|LIMIT=2'), F));
ok('leading separator', () => assert.throws(() => parseRecords('|WINDOW=4|RATE=1|LIMIT=2'), F));
ok('trailing separator', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|'), F));
ok('empty record', () => assert.throws(() => parseRecords('\n\nWINDOW=4|RATE=1|LIMIT=2'), F));
ok('empty field quoted', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|""'), F));
ok('quoted bad key', () => assert.throws(() => parseRecords('"window=4"|RATE=1|LIMIT=2'), F));
ok('quoted two equals', () => assert.throws(() => parseRecords('"WINDOW=4=5"|RATE=1|LIMIT=2'), F));
ok('format beats value', () => assert.throws(() => parseRecords('WINDOW=abc|RATE=1=LIMIT=2'), F));

// value errors
const V = { message: 'INVALID_VALUE' };
ok('missing WINDOW', () => assert.throws(() => parseRecords('RATE=1|LIMIT=2'), V));
ok('missing RATE', () => assert.throws(() => parseRecords('WINDOW=4|LIMIT=2'), V));
ok('missing LIMIT', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1'), V));
ok('WINDOW 2', () => assert.throws(() => parseRecords('WINDOW=2|RATE=1|LIMIT=2'), V));
ok('WINDOW 51', () => assert.throws(() => parseRecords('WINDOW=51|RATE=1|LIMIT=2'), V));
ok('WINDOW leading zero', () => assert.throws(() => parseRecords('WINDOW=04|RATE=1|LIMIT=2'), V));
ok('WINDOW negative', () => assert.throws(() => parseRecords('WINDOW=-4|RATE=1|LIMIT=2'), V));
ok('WINDOW plus', () => assert.throws(() => parseRecords('WINDOW=+4|RATE=1|LIMIT=2'), V));
ok('WINDOW decimal', () => assert.throws(() => parseRecords('WINDOW=4.0|RATE=1|LIMIT=2'), V));
ok('WINDOW empty', () => assert.throws(() => parseRecords('WINDOW=|RATE=1|LIMIT=2'), V));
ok('WINDOW hex', () => assert.throws(() => parseRecords('WINDOW=0x4|RATE=1|LIMIT=2'), V));
ok('WINDOW text', () => assert.throws(() => parseRecords('WINDOW=four|RATE=1|LIMIT=2'), V));
ok('RATE 41', () => assert.throws(() => parseRecords('WINDOW=4|RATE=41|LIMIT=2'), V));
ok('RATE negative', () => assert.throws(() => parseRecords('WINDOW=4|RATE=-1|LIMIT=2'), V));
ok('RATE leading zero', () => assert.throws(() => parseRecords('WINDOW=4|RATE=01|LIMIT=2'), V));
ok('LIMIT 0', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=0'), V));
ok('LIMIT 151', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=151'), V));
ok('LIMIT empty', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT='), V));
ok('FLAGS bad value', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=read,exec'), V));
ok('FLAGS repeat', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=read,read'), V));
ok('FLAGS empty', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS='), V));
ok('FLAGS trailing comma', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=read,'), V));
ok('FLAGS leading comma', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=,read'), V));
ok('FLAGS space', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=read, write'), V));

// boundaries and conversions
ok('lower bounds', () => assert.deepEqual(parseRecords('WINDOW=3|RATE=0|LIMIT=1'), [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]));
ok('upper bounds', () => assert.deepEqual(parseRecords('WINDOW=50|RATE=40|LIMIT=150'), [{ WINDOW: 50, RATE: 40, LIMIT: 150 }]));
ok('single flag', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=write')[0].FLAGS, ['write']));
ok('flag order preserved', () => assert.deepEqual(parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=write,read')[0].FLAGS, ['write', 'read']));
ok('field order irrelevant', () => assert.deepEqual(parseRecords('LIMIT=2|FLAGS=read,write|RATE=1|WINDOW=4'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, FLAGS: ['read', 'write'] }]));
ok('field then value error order', () => assert.throws(() => parseRecords('WINDOW=4|RATE=1|LIMIT=2|FLAGS=read|x-y=1'), F));

console.log('self-check ' + (process.exitCode ? 'FAIL' : 'PASS') + ' (' + pass + ' cases)');
