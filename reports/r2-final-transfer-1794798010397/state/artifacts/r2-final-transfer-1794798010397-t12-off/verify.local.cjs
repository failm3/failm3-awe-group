const assert = require('node:assert/strict');
const { decodeSeparated: d } = require(process.cwd() + '/core/decoder.cjs');
const F = /^INVALID_FORMAT$/, V = /^INVALID_VALUE$/;
const t = (f, re) => assert.throws(f, e => e instanceof Error && re.test(e.message));

assert.deepEqual(d(''), []);
assert.deepEqual(d('WINDOW=1;RATE=0;LIMIT=1\r\nLIMIT=25;RATE=10;WINDOW=40\rWINDOW=3;RATE=3;LIMIT=3\n'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 40, RATE: 10, LIMIT: 25 }, { WINDOW: 3, RATE: 3, LIMIT: 3 }]);
const r = d('Z=z;"LIMIT=2";"X=a;b=\r\n""q""";WINDOW=2;RATE=1');
assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'Z', 'X']);
assert.equal(r[0].X, 'a;b=\r\n"q"');
assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
assert.deepEqual(Object.keys(d('WINDOW=2;RATE=1;LIMIT=2;CONSTRUCTOR=c')[0]), ['WINDOW', 'RATE', 'LIMIT', 'CONSTRUCTOR']);
// no undocumented optional field is special-cased
assert.deepEqual(d('WINDOW=2;RATE=1;LIMIT=2;COLOR=red;FLAGS=a,b'), [{ WINDOW: 2, RATE: 1, LIMIT: 2, COLOR: 'red', FLAGS: 'a,b' }]);

t(() => d('WINDOW=2;RATE=1;LIMIT=2;"__proto__=x"'), F); // lowercase key invalid
t(() => d('"WINDOW=2;RATE=1;LIMIT=2'), F);              // unterminated quote
t(() => d('"WINDOW=2"x;RATE=1;LIMIT=2'), F);            // junk after closing quote
t(() => d('WINDOW=2";RATE=1;LIMIT=2'), F);              // quote inside unquoted field
t(() => d('WINDOW=2=3;RATE=1;LIMIT=2'), F);             // two equals in unquoted field
t(() => d('window=2;RATE=1;LIMIT=2'), F);
t(() => d('WINDOW=2;"WINDOW=2";RATE=1;LIMIT=2'), F);    // duplicate decoded key
t(() => d('WINDOW= 2;RATE=1;LIMIT=2'), F);              // untrimmed value
t(() => d('WINDOW=2;RATE=1;LIMIT=2;'), F);              // trailing separator
t(() => d('WINDOW=2;RATE=1;LIMIT=2\n\nWINDOW=2;RATE=1;LIMIT=2'), F); // empty record
t(() => d('WINDOW=0;RATE=1;LIMIT=2;X= y'), F);          // syntax beats semantic error
t(() => d('WINDOW=0;RATE=1;LIMIT=2'), V);
t(() => d('WINDOW=41;RATE=1;LIMIT=2'), V);
t(() => d('WINDOW=02;RATE=1;LIMIT=2'), V);
t(() => d('WINDOW=2;RATE=11;LIMIT=2'), V);
t(() => d('WINDOW=2;RATE=1;LIMIT=26'), V);
t(() => d('WINDOW=2;RATE=1;LIMIT=0'), V);
t(() => d('WINDOW=2;RATE=1'), V);
t(() => d('WINDOW=2;RATE=+1;LIMIT=2'), V);
t(() => d('WINDOW=2;RATE=;LIMIT=2'), V);
console.log('extra PASS');
