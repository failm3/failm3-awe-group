const assert = require('node:assert/strict');
const path = require('node:path');
const { parseRecords } = require(path.join(__dirname, '..', 'lib', 'records.cjs'));
const F = 'INVALID_FORMAT', V = 'INVALID_VALUE';
function err(fn, msg, label) {
  try { fn(); } catch (e) { assert.ok(e instanceof Error, label); assert.equal(e.message, msg, label + ' -> ' + e.message); return; }
  throw new Error('no throw: ' + label);
}
function eq(actual, expected, label) {
  try { assert.deepEqual(actual, expected); } catch (e) { throw new Error(label + ': ' + e.message); }
}
eq(parseRecords(''), [], 'empty');
eq(parseRecords('WINDOW=3;RATE=10;LIMIT=75'), [{WINDOW:3,RATE:10,LIMIT:75}], 'bounds ok');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3\rWINDOW=6;RATE=3;LIMIT=4\n'),
  [{WINDOW:4,RATE:1,LIMIT:2},{WINDOW:5,RATE:2,LIMIT:3},{WINDOW:6,RATE:3,LIMIT:4}], 'line endings');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2\n'), [{WINDOW:4,RATE:1,LIMIT:2}], 'trailing LF');
eq(Object.keys(parseRecords('LIMIT=2;RATE=1;WINDOW=4;ZZZ=9;COLOR=red')[0]),
   ['WINDOW','RATE','LIMIT','COLOR','ZZZ'], 'schema order');
eq(parseRecords('"WINDOW=4";"RATE=1";"LIMIT=2"'), [{WINDOW:4,RATE:1,LIMIT:2}], 'fully quoted');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="a,b"')[0].COLOR, 'a,b', 'quoted comma');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;"COLOR=x;y"')[0].COLOR, 'x;y', 'quoted semi');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;"COLOR=a=b"')[0].COLOR, 'a=b', 'quoted equals');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;"COLOR=a""b"')[0].COLOR, 'a"b', 'doubled quote');
eq(parseRecords('"COLOR=a\r\nb";WINDOW=4;RATE=1;LIMIT=2')[0].COLOR, 'a\r\nb', 'quoted CRLF');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR=""')[0].COLOR, '', 'empty quoted');
eq(parseRecords('"COLOR=;";WINDOW=4;RATE=1;LIMIT=2')[0].COLOR, ';', 'quoted only semi');
const p = parseRecords('WINDOW=4;RATE=1;LIMIT=2;__proto__=x;constructor=y');
assert.equal(Object.getPrototypeOf(p[0]), Object.prototype, 'proto');
eq(Object.keys(p[0]), ['WINDOW','RATE','LIMIT','__proto__','constructor'], 'proto keys');
assert.equal(Object.getOwnPropertyDescriptor(p[0], '__proto__').value, 'x', 'proto is own data');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;FOO=bar;BAZ=qux')[0],
   {WINDOW:4,RATE:1,LIMIT:2,FOO:'bar',BAZ:'qux'}, 'unknowns');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;FLAGS=a,b')[0].FLAGS, ['a','b'], 'flags');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;FLAGS=""')[0].FLAGS, [], 'flags empty');
eq(parseRecords('WINDOW=4;RATE=1;LIMIT=2;E=')[0].E, '', 'empty value');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;BAD'), F, 'no equals');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;=x'), F, 'empty key');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;lower=x'), F, 'lower key');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;A B=x'), F, 'space key');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR=a=b'), F, 'two equals');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR=a"b"'), F, 'quote unquoted');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="a"b'), F, 'after close');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="a'), F, 'unterminated');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR=a '), F, 'trailing ws');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR= a'), F, 'leading ws');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2;WINDOW=5'), F, 'dup');
err(() => parseRecords('"WINDOW=4";WINDOW=4;RATE=1;LIMIT=2'), F, 'dup quoted');
err(() => parseRecords('WINDOW=4;RATE=1'), V, 'missing LIMIT');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=0'), V, 'limit low');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=76'), V, 'limit high');
err(() => parseRecords('WINDOW=2;RATE=1;LIMIT=2'), V, 'window low');
err(() => parseRecords('WINDOW=21;RATE=1;LIMIT=2'), V, 'window high');
err(() => parseRecords('WINDOW=04;RATE=1;LIMIT=2'), V, 'leading zero');
err(() => parseRecords('WINDOW=4;RATE=11;LIMIT=2'), V, 'rate high');
err(() => parseRecords('WINDOW=4;RATE=-1;LIMIT=2'), V, 'negative');
err(() => parseRecords('WINDOW=;RATE=1;LIMIT=2'), V, 'empty window');
err(() => parseRecords('WINDOW=x;RATE=1;LIMIT=2'), V, 'non numeric');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=2\n\nWINDOW=4;RATE=1;LIMIT=2'), F, 'blank record');
err(() => parseRecords('WINDOW=4;RATE=1;LIMIT=9;Q=2\nBAD=1;Q=3'), F, 'syntax before semantics');
console.log('edge PASS');
