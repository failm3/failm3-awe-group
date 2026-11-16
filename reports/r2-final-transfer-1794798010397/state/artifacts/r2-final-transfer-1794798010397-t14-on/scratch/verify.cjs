'use strict';
// Scratch verification harness (not the visible test). Run: node scratch/verify.cjs
const assert = require('node:assert/strict');
const path = require('node:path');
const { decodeSeparated: d } = require(path.join(__dirname, '..', 'core', 'decoder.cjs'));
const F = 'INVALID_FORMAT';
const V = 'INVALID_VALUE';
const ok = (t, e) => assert.deepEqual(d(t), e, JSON.stringify(t));
const bad = (t, m) => assert.throws(() => d(t), (err) => err.message === m, JSON.stringify(t) + ' -> ' + m);
let n = 0;
const count = () => { n++; };

// --- empty / basic
ok('', []); count();
ok('WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]); count();

// --- record terminators: LF, CRLF, CR, optional trailing
ok('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3\r\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]); count();

// --- value trimming only (key whitespace is a syntax error)
ok('WINDOW= 4 ;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR= teal ', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'teal' }]); count();
bad('WINDOW =4;RATE=1;LIMIT=2', F); count();
bad(' WINDOW=4;RATE=1;LIMIT=2', F); count();

// --- unknown retention and ordering
const u = d('ZED= z ;WINDOW=4;RATE=1;LIMIT=2');
assert.deepEqual(u, [{ WINDOW: 4, RATE: 1, LIMIT: 2, ZED: 'z' }]);
assert.deepEqual(Object.keys(u[0]), ['WINDOW', 'RATE', 'LIMIT', 'ZED']);
assert.deepEqual(Object.keys(d('WINDOW=4;B=1;RATE=1;A=2;LIMIT=2')[0]), ['WINDOW', 'RATE', 'LIMIT', 'B', 'A']);
count();

// --- schema order independent of input order
assert.deepEqual(Object.keys(d('LIMIT=2;COLOR=gold;RATE=1;WINDOW=4')[0]), ['WINDOW', 'RATE', 'LIMIT', 'COLOR']);
count();

// --- quoting
ok('"WINDOW=4";RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR="te""al"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'te"al' }]); count();
ok('"WINDOW=4";"RATE=1";"LIMIT=2";"X=a;b=c\r\nd"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, X: 'a;b=c\r\nd' }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2;"X=a=b"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, X: 'a=b' }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2;"A=  pad  "', [{ WINDOW: 4, RATE: 1, LIMIT: 2, A: 'pad' }]); count();
ok('"WINDOW=4";"RATE=1";"LIMIT=2"\n"WINDOW=5";"RATE=2";"LIMIT=3"', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]); count();
ok('WINDOW=4;RATE=1;LIMIT=2;"E="', [{ WINDOW: 4, RATE: 1, LIMIT: 2, E: '' }]); count();

// --- quoting errors
bad('WINDOW=4;RATE=1;LIMIT=2;"A=1', F); count();            // unterminated
bad('WINDOW=4;RATE=1;LIMIT=2;A="1"', F); count();            // quote not at field start
bad('WINDOW=4;RATE=1;LIMIT=2;"A"=1', F); count();            // chars after closing quote
bad('WINDOW=4;RATE=1;LIMIT=2;"A=1" ', F); count();           // whitespace after closing quote
bad('WINDOW=4;RATE=1;LIMIT=2;"A=1"""', F); count();          // odd trailing quote
bad('WINDOW=4;RATE=1;LIMIT=2;A=va"lue"', F); count();
bad('"WINDOW=4;RATE=1;LIMIT=2"x', F); count();

// --- duplicate keys (decoded, so quoting cannot hide them)
bad('WINDOW=4;WINDOW=5;RATE=1;LIMIT=2', F); count();
bad('"WINDOW=4";WINDOW=5;RATE=1;LIMIT=2', F); count();
bad('WINDOW=4;RATE=1;LIMIT=2;X=a;X=b', F); count();

// --- structural format errors
bad(';', F); count();
bad('WINDOW=4;RATE=1;LIMIT=2\n\nWINDOW=5;RATE=2;LIMIT=3', F); count();
bad('WINDOW=4;RATE=1;LIMIT=2\n\n', F); count();
bad('WINDOW=4;RATE=1;LIMIT=2;', F); count();
bad('WINDOW=4;RATE=1;LIMIT=2;X', F); count();               // no equals
bad('WINDOW=4;RATE=1;LIMIT=2;X=a=b', F); count();           // two equals unquoted
bad('WINDOW=4;RATE=1;LIMIT=2;x=1', F); count();             // bad key case
bad('WINDOW=4;RATE=1;LIMIT=2;1X=1', F); count();            // bad key start
bad('WINDOW=4;RATE=1;LIMIT=2;=1', F); count();              // empty key
bad('WINDOW=4;RATE=1;LIMIT=2;A-B=1', F); count();           // bad key char

// --- precedence: syntax/duplicate/whitespace before semantics
bad('WINDOW=999;WINDOW=4;RATE=1;LIMIT=2', F); count();
bad('WINDOW=999;RATE=1;LIMIT=2;A-B=1', F); count();
bad('WINDOW=999;RATE=1;LIMIT=2;X=a"b"', F); count();

// --- required fields
bad('RATE=1;LIMIT=2', V); count();
bad('WINDOW=4;LIMIT=2', V); count();
bad('WINDOW=4;RATE=1', V); count();

// --- WINDOW 3..60 canonical
for (const w of [3, 30, 60]) ok(`WINDOW=${w};RATE=1;LIMIT=2`, [{ WINDOW: Number(w), RATE: 1, LIMIT: 2 }]); count();
for (const w of ['2', '61', '04', '', '4.0', '-4', '+4', ' 4x', '0x10']) bad(`"X=y";WINDOW=${w};RATE=1;LIMIT=2\n`.replace('"\nX=y"', '"X=y"'), F.matches === undefined ? V : V); count();

// --- RATE 0..30
for (const r of [0, 30]) ok(`WINDOW=4;RATE=${r};LIMIT=2`, [{ WINDOW: 4, RATE: Number(r), LIMIT: 2 }]); count();
for (const r of ['31', '00', '01', '-1', '1.5', '2a']) bad(`WINDOW=4;RATE=${r};LIMIT=2`, V); count();

// --- LIMIT 1..75
for (const l of [1, 75]) ok(`WINDOW=4;RATE=1;LIMIT=${l}`, [{ WINDOW: 4, RATE: 1, LIMIT: Number(l) }]); count();
for (const l of ['0', '76', '007', '', '3 3']) bad(`WINDOW=4;RATE=1;LIMIT=${l}`, V); count();

// --- COLOR strict enum
for (const c of ['teal', 'gold']) ok(`WINDOW=4;RATE=1;LIMIT=2;COLOR=${c}`, [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: c }]); count();
for (const c of ['Teal', 'TEAL', 'blue', '']) bad(`WINDOW=4;RATE=1;LIMIT=2;COLOR=${c}`, V); count();

// --- prototype-looking keys are data
const p = d('WINDOW=4;RATE=1;LIMIT=2;__proto__=x;constructor=y;toString=z');
assert.equal(Object.getPrototypeOf(p[0]), Object.prototype);
assert.equal(p[0].__proto__, 'x');
assert.equal(p[0].constructor, 'y');
assert.equal(p[0].toString, 'z');
assert.deepEqual(Object.keys(p[0]), ['WINDOW', 'RATE', 'LIMIT', '__proto__', 'constructor', 'toString']);
assert.equal(Object.prototype.hasOwnProperty.call(p[0], '__proto__'), true);
count();

// --- non-string / non-empty guard
bad(null, F); count();
bad(undefined, F); count();
bad(42, F); count();

// --- multi-record independence
const many = d('WINDOW=3;RATE=0;LIMIT=1\nWINDOW=60;RATE=30;LIMIT=75;COLOR=gold;NOTE=hi');
assert.deepEqual(many, [
  { WINDOW: 3, RATE: 0, LIMIT: 1 },
  { WINDOW: 60, RATE: 30, LIMIT: 75, COLOR: 'gold', NOTE: 'hi' },
]);
count();

console.log(`scratch verify PASS (${n} checks)`);
