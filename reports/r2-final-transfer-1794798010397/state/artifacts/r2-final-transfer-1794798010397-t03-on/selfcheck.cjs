'use strict';
const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');

const F = (t) => { try { parseRecords(t); return 'OK'; } catch (e) { return e.message; } };
let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error('FAIL:', m); process.exitCode = 1; } };

// --- basics / exports ---
ok(typeof parseRecords === 'function', 'exports function');
ok(Array.isArray(parseRecords('')), 'empty -> []');
ok(parseRecords('').length === 0, 'empty -> empty');

// --- separators ---
const base = 'WINDOW=1|RATE=0|LIMIT=1';
assert.deepEqual(parseRecords(base), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]); n++;
assert.deepEqual(parseRecords(base + '\n' + base), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 1, RATE: 0, LIMIT: 1 }]); n++;
assert.deepEqual(parseRecords(base + '\r\n' + base), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 1, RATE: 0, LIMIT: 1 }]); n++;
assert.deepEqual(parseRecords(base + '\r' + base), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 1, RATE: 0, LIMIT: 1 }]); n++;
ok(F(base + '\n\n') === 'INVALID_FORMAT', 'blank record rejected');

// trailing separators do not create records
ok(parseRecords(base + '\n').length === 1, 'trailing LF');
ok(parseRecords(base + '\r\n').length === 1, 'trailing CRLF');
ok(parseRecords(base + '\r').length === 1, 'trailing CR');

// --- quoting ---
assert.deepEqual(parseRecords('"WINDOW=1"|RATE=0|LIMIT=1'), [{ WINDOW: 1, RATE: 0, LIMIT: 1 }]); n++;
assert.deepEqual(parseRecords('WINDOW=1|RATE=0|LIMIT=1|COLOR="a|b=c"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a|b=c' }]); n++;
assert.deepEqual(parseRecords('WINDOW=1|RATE=0|LIMIT=1|COLOR="say ""hi"""'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'say "hi"' }]); n++;
// quote contains CR / LF, record continues after closing quote
assert.deepEqual(parseRecords('WINDOW=1|RATE=0|LIMIT=1|COLOR="a\r\nb"'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a\r\nb' }]); n++;
assert.deepEqual(parseRecords('WINDOW=1|RATE=0|LIMIT=1|COLOR="a\nb"\nWINDOW=2|RATE=1|LIMIT=1'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'a\nb' }, { WINDOW: 2, RATE: 1, LIMIT: 1 }]); n++;
// empty quoted value
assert.deepEqual(parseRecords('WINDOW=1|RATE=0|LIMIT=1|COLOR=""'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: '' }]); n++;

// --- whitespace trim on value only ---
assert.deepEqual(parseRecords('  WINDOW=1  |RATE=0|LIMIT=1|COLOR=  hi  '),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1, COLOR: 'hi' }]); n++;

// --- duplicate keys ---
ok(F('WINDOW=1|WINDOW=1|RATE=0|LIMIT=1') === 'INVALID_FORMAT', 'dup');
ok(F('WINDOW=1|RATE=0|LIMIT=1|COLOR=a|COLOR=b') === 'INVALID_FORMAT', 'dup COLOR');
// duplicate after decode (quoted vs unquoted)
ok(F('"WINDOW=1"|WINDOW=1|RATE=0|LIMIT=1') === 'INVALID_FORMAT', 'dup decoded');

// --- format errors ---
ok(F('WINDOW=1|RATE=0|LIMIT=1|x') === 'INVALID_FORMAT', 'no equals');
ok(F('WINDOW=1|RATE=0|LIMIT=1|X=1') === 'INVALID_FORMAT', 'bad key lower');
ok(F('WINDOW=1|RATE=0|LIMIT=1|1X=1') === 'INVALID_FORMAT', 'bad key digit');
ok(F('WINDOW=1|RATE=0|LIMIT=1|_X=1') === 'INVALID_FORMAT', 'bad key underscore');
ok(F('WINDOW=1|RATE=0|LIMIT=1|X' + 'A=1') === 'OK', 'key XA ok');
ok(F('WINDOW=1|RATE=0|LIMIT=1|X-Y=1') === 'INVALID_FORMAT', 'bad key dash');
ok(F('WINDOW=1=2|RATE=0|LIMIT=1') === 'INVALID_FORMAT', 'two equals unquoted');
ok(F('WINDOW=1|RATE=0|LIMIT=1|COLOR=a"b') === 'INVALID_FORMAT', 'quote in unquoted');
ok(F('WINDOW=1|RATE=0|LIMIT=1|COLOR="abc') === 'INVALID_FORMAT', 'unterminated');
ok(F('WINDOW=1|RATE=0|LIMIT=1|COLOR="abc"x') === 'INVALID_FORMAT', 'after closing quote');
ok(F('WINDOW=1|RATE=0|LIMIT=1|COLOR="a"b=c') === 'INVALID_FORMAT', 'after closing quote 2');
ok(F('WINDOW=1|RATE=0|LIMIT=1|') === 'INVALID_FORMAT', 'trailing pipe');
ok(F('|WINDOW=1|RATE=0|LIMIT=1') === 'INVALID_FORMAT', 'leading pipe');
ok(F('WINDOW=1||RATE=0|LIMIT=1') === 'INVALID_FORMAT', 'double pipe');
ok(F('WINDOW=1|RATE=0|LIMIT=1\n\nWINDOW=1|RATE=0|LIMIT=1') === 'INVALID_FORMAT', 'blank line');
ok(F('=1') === 'INVALID_FORMAT', 'empty key');
ok(F('WINDOW=1|RATE=0|LIMIT=1|COLOR= ""') === 'INVALID_FORMAT', 'space before quote');

// --- values / ranges ---
const mk = (w, r, l) => `WINDOW=${w}|RATE=${r}|LIMIT=${l}`;
ok(F(mk(0, 0, 1)) === 'INVALID_VALUE', 'WINDOW 0');
ok(F(mk(51, 0, 1)) === 'INVALID_VALUE', 'WINDOW 51');
ok(F(mk(50, 40, 100)) === 'OK', 'max bounds');
ok(parseRecords(mk(50, 40, 100))[0].WINDOW === 50, 'WINDOW max');
ok(F(mk('01', 0, 1)) === 'INVALID_VALUE', 'leading zero');
ok(F(mk('00', 0, 1)) === 'INVALID_VALUE', 'double zero');
ok(F(mk('+1', 0, 1)) === 'INVALID_VALUE', 'plus sign');
ok(F(mk('-1', 0, 1)) === 'INVALID_VALUE', 'minus sign');
ok(F(mk('1.0', 0, 1)) === 'INVALID_VALUE', 'decimal');
ok(F(mk('1e1', 0, 1)) === 'INVALID_VALUE', 'exponent');
ok(F(mk('', 0, 1)) === 'INVALID_VALUE', 'empty');
ok(F(mk(' 1', 0, 1)) === 'OK', 'value trimmed');
ok(F(mk(1, 41, 1)) === 'INVALID_VALUE', 'RATE 41');
ok(F(mk(1, 0, 0)) === 'INVALID_VALUE', 'LIMIT 0');
ok(F(mk(1, 0, 101)) === 'INVALID_VALUE', 'LIMIT 101');
ok(F('RATE=0|LIMIT=1') === 'INVALID_VALUE', 'missing WINDOW');
ok(F('WINDOW=1|LIMIT=1') === 'INVALID_VALUE', 'missing RATE');
ok(F('WINDOW=1|RATE=0') === 'INVALID_VALUE', 'missing LIMIT');

// --- FLAGS ---
const fl = (v) => F('WINDOW=1|RATE=0|LIMIT=1|FLAGS=' + v);
ok(fl('read') === 'OK', 'flags single');
ok(fl('write,read') === 'OK', 'flags order');
ok(fl('read,write') === 'OK', 'flags both');
assert.deepEqual(parseRecords('WINDOW=1|RATE=0|LIMIT=1|FLAGS=write,read')[0].FLAGS, ['write', 'read']); n++;
ok(fl('read,read') === 'INVALID_VALUE', 'flags repeat');
ok(fl('read, write') === 'INVALID_VALUE', 'flags space');
ok(fl('read,,write') === 'INVALID_VALUE', 'flags empty elem');
ok(fl('') === 'INVALID_VALUE', 'flags empty');
ok(fl('read,write,read') === 'INVALID_VALUE', 'flags repeat 2');
ok(fl('other') === 'INVALID_VALUE', 'flags other');

// --- known field ordering, unknown dropped ---
const multi = parseRecords('COLOR=red|FLAGS=read|LIMIT=1|RATE=0|WINDOW=3|ZZZ=9|AAA=1')[0];
assert.deepEqual(Object.keys(multi), ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'COLOR']); n++;
ok(deepEqualJson(multi, { WINDOW: 3, RATE: 0, LIMIT: 1, FLAGS: ['read'], COLOR: 'red' }), 'unknowns dropped');

// only recognized keys present; no unknown retained
ok(Object.keys(parseRecords('WINDOW=1|RATE=0|LIMIT=1|FOO=bar')[0]).join(',') === 'WINDOW,RATE,LIMIT', 'unknown dropped');

// --- prototype safety (ordinary own-key objects) ---
const p = parseRecords('WINDOW=1|RATE=0|LIMIT=1|CONSTRUCTOR=x|PROTOTYPE=y')[0];
ok(Object.getPrototypeOf(p) === Object.prototype, 'plain prototype');
ok(Object.keys(p).join(',') === 'WINDOW,RATE,LIMIT', 'proto-looking keys dropped');
ok(!('CONSTRUCTOR' in p), 'no CONSTRUCTOR');
ok(Array.isArray(parseRecords('WINDOW=1|RATE=0|LIMIT=1')), 'array output');

// --- precedence: syntax over semantics ---
ok(F('WINDOW=999|RATE=0|LIMIT=1|BAD-KEY=1') === 'INVALID_FORMAT', 'syntax wins');
ok(F('WINDOW=999|RATE=0|LIMIT=1|COLOR="x') === 'INVALID_FORMAT', 'unterminated wins');
ok(F('WINDOW=999|RATE=0|LIMIT=1|COLOR=a"b') === 'INVALID_FORMAT', 'mid-quote wins');
ok(F('WINDOW=abc|RATE=abc|LIMIT=abc') === 'INVALID_VALUE', 'semantic');

// --- multi-record order ---
const mr = parseRecords('WINDOW=1|RATE=0|LIMIT=1\nWINDOW=2|RATE=1|LIMIT=2\r\nWINDOW=3|RATE=2|LIMIT=3\rWINDOW=4|RATE=3|LIMIT=4');
assert.deepEqual(mr.map(r => r.WINDOW), [1, 2, 3, 4]); n++;

// --- numbers are real numbers ---
ok(typeof parseRecords('WINDOW=1|RATE=0|LIMIT=1')[0].WINDOW === 'number', 'number type');

// --- visible test content ---
assert.deepEqual(parseRecords("WINDOW=2|RATE=1|LIMIT=2|FLAGS=read,write"), [{ WINDOW: 2, RATE: 1, LIMIT: 2, FLAGS: ['read', 'write'] }]); n++;
assert.deepEqual(parseRecords("WINDOW=50|RATE=0|LIMIT=1"), [{ WINDOW: 50, RATE: 0, LIMIT: 1 }]); n++;

function deepEqualJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

if (process.exitCode) { console.error(`${n} checks, FAILURES above`); } else { console.log(`selfcheck PASS (${n} checks)`); }
