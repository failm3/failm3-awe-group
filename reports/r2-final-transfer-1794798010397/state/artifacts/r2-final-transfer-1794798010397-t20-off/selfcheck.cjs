'use strict';
// Extended self-check of lib/records.cjs against FORMAT.md. Not a shipped test.
const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');

const eq = (a, b, label) => assert.deepEqual(a, b, label);
const throws = (fn, msg, label) => assert.throws(fn, (e) => e instanceof Error && e.message === msg, label);

// --- empty / line-ending handling ---
eq(parseRecords(''), [], 'empty');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'CRLF');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'CR');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2\n\nWINDOW=5;RATE=2;LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'blank line');

// --- key schema / ordering ---
eq(parseRecords('LIMIT=2;RATE=1;WINDOW=4'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'schema order');
eq(Object.keys(parseRecords('LIMIT=2;RATE=1;WINDOW=4')[0]), ['WINDOW', 'RATE', 'LIMIT'], 'key order');

// --- ranges / canonical integers ---
eq(parseRecords('WINDOW=3;RATE=10;LIMIT=75'), [{ WINDOW: 3, RATE: 10, LIMIT: 75 }], 'bounds');
throws(() => parseRecords('WINDOW=2;RATE=1;LIMIT=2'), 'INVALID_VALUE', 'WINDOW low');
throws(() => parseRecords('WINDOW=21;RATE=1;LIMIT=2'), 'INVALID_VALUE', 'WINDOW high');
throws(() => parseRecords('WINDOW=04;RATE=1;LIMIT=2'), 'INVALID_VALUE', 'leading zero');
throws(() => parseRecords('WINDOW=-4;RATE=1;LIMIT=2'), 'INVALID_VALUE', 'negative');
throws(() => parseRecords('WINDOW=4;RATE=11;LIMIT=2'), 'INVALID_VALUE', 'RATE high');
throws(() => parseRecords('WINDOW=4;RATE=1;LIMIT=0'), 'INVALID_VALUE', 'LIMIT low');
throws(() => parseRecords('WINDOW=4;RATE=1;LIMIT=76'), 'INVALID_VALUE', 'LIMIT high');
throws(() => parseRecords('RATE=1;LIMIT=2'), 'INVALID_VALUE', 'missing WINDOW');
throws(() => parseRecords('WINDOW=4;LIMIT=2'), 'INVALID_VALUE', 'missing RATE');
throws(() => parseRecords('WINDOW=4;RATE=1'), 'INVALID_VALUE', 'missing LIMIT');
throws(() => parseRecords('WINDOW=4.0;RATE=1;LIMIT=2'), 'INVALID_VALUE', 'non-integer');
throws(() => parseRecords('WINDOW=;RATE=1;LIMIT=2'), 'INVALID_VALUE', 'empty WINDOW');

// --- syntax errors ---
throws(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;'), 'INVALID_FORMAT', 'trailing separator');
throws(() => parseRecords('WINDOW=4;;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'empty field');
throws(() => parseRecords('window=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'bad key');
throws(() => parseRecords('WINDOW=4=5;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'two equals');
throws(() => parseRecords('WINDOW;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'no equals');
throws(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;WINDOW=5'), 'INVALID_FORMAT', 'duplicate');
throws(() => parseRecords('WINDOW=4;RATE "q"=1;LIMIT=2'), 'INVALID_FORMAT', 'quote unquoted');
throws(() => parseRecords('"WINDOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'unterminated');
throws(() => parseRecords('"WINDOW=4"x;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'trailing after quote');

// --- whitespace policy ---
throws(() => parseRecords('WINDOW=4;RATE=1;LIMIT= 2'), 'INVALID_FORMAT', 'leading space');
throws(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2 '), 'INVALID_FORMAT', 'trailing space');
throws(() => parseRecords('"COLOR= red ";WINDOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT', 'quoted untrimmed');

// --- quoting ---
eq(parseRecords('"WINDOW=4";"RATE=1";"LIMIT=2"'), [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'whole fields quoted');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;"COLOR=x"'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'x' }], 'quoted simple');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="a;b=c"'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a;b=c' }], 'quoted separators/equals');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="say ""hi"""'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'say "hi"' }], 'doubled quotes');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="a\nb"'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'a\nb' }], 'newline in quotes');
eq(parseRecords('"WINDOW=4";RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'quoted then record end');

// --- color / flags / unknown ---
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR=red;FLAGS=a,b,c'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'red', FLAGS: ['a', 'b', 'c'] }], 'known optionals');
eq(parseRecords('ZZZ=1;WINDOW=4;AAA=2;RATE=1;LIMIT=2'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, ZZZ: '1', AAA: '2' }], 'unknowns in field order');
eq(Object.keys(parseRecords('ZZZ=1;WINDOW=4;AAA=2;RATE=1;LIMIT=2')[0]),
   ['WINDOW', 'RATE', 'LIMIT', 'ZZZ', 'AAA'], 'unknown key order');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;EXTRA="0"'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, EXTRA: '0' }], 'unknown stays string');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR=red;A=1;FLAGS=x'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'red', FLAGS: ['x'], A: '1' }], 'known before unknown');

// --- prototype safety ---
const proto = parseRecords('__proto__=x;WINDOW=4;RATE=1;LIMIT=2')[0];
eq(Object.getPrototypeOf(proto), Object.prototype, 'no proto pollution');
eq(Object.getOwnPropertyNames(proto).includes('__proto__'), true, 'own __proto__ key');
eq(proto.__proto__, 'x', 'proto value');
eq({}.polluted, undefined, 'global untouched');
const ctor = parseRecords('constructor=y;WINDOW=4;RATE=1;LIMIT=2')[0];
eq(ctor.constructor, 'y', 'constructor as data');

// --- syntax precedence over semantics ---
throws(() => parseRecords('WINDOW=99;RATE=1;LIMIT=2;BAD'), 'INVALID_FORMAT', 'format wins');

// --- multiple records ---
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=3;RATE=10;LIMIT=75;COLOR=z'),
   [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 3, RATE: 10, LIMIT: 75, COLOR: 'z' }], 'two records');

console.log('extended PASS');
