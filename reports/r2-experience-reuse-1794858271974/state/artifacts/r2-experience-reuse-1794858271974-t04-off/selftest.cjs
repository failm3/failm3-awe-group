'use strict';
const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');

const eq = (a, b) => assert.deepEqual(a, b);
const fmt = (s) => assert.throws(() => parseExport(s), (e) => e instanceof Error && e.message === 'INVALID_FORMAT');
const val = (s) => assert.throws(() => parseExport(s), (e) => e instanceof Error && e.message === 'INVALID_VALUE');

// empty
eq(parseExport(''), []);
eq(parseExport('\n'), []);

// record terminators
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2\r\nWINDOW=4;RATE=2;LIMIT=3'), [
  { WINDOW: 3, RATE: 1, LIMIT: 2 },
  { WINDOW: 4, RATE: 2, LIMIT: 3 },
]);
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2\rWINDOW=4;RATE=2;LIMIT=3'), [
  { WINDOW: 3, RATE: 1, LIMIT: 2 },
  { WINDOW: 4, RATE: 2, LIMIT: 3 },
]);
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2\n\nWINDOW=4;RATE=2;LIMIT=3'.replace('\n\n', '\r\n\r\n')), [
  { WINDOW: 3, RATE: 1, LIMIT: 2 },
  { WINDOW: 4, RATE: 2, LIMIT: 3 },
]);

// quoting
eq(parseExport('"WINDOW=3";RATE=1;LIMIT=2'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq(parseExport('WINDOW=3;"RATE=1";LIMIT=2'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2;NOTE="a;b=c"'), [{ WINDOW: 3, RATE: 1, LIMIT: 2, NOTE: 'a;b=c' }]);
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2;NOTE="say ""hi"""'), [{ WINDOW: 3, RATE: 1, LIMIT: 2, NOTE: 'say "hi"' }]);
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2;NOTE="line\r\nbreak"'), [{ WINDOW: 3, RATE: 1, LIMIT: 2, NOTE: 'line\r\nbreak' }]);
eq(parseExport('WINDOW=3;RATE=1;LIMIT=2;NOTE="=x="'), [{ WINDOW: 3, RATE: 1, LIMIT: 2, NOTE: '=x=' }]);
eq(parseExport('"WINDOW=3";RATE=1;LIMIT=2;X="a=b"'), [{ WINDOW: 3, RATE: 1, LIMIT: 2, X: 'a=b' }]);

// quote syntax failures
fmt('WINDOW=3;RATE=1;LIMIT=2;NOTE="abc');
fmt('WINDOW=3;RATE=1;LIMIT=2;NOTE="abc"x');
fmt('WINDOW=3;RATE=1;LIMIT=2;N"OTE=1');
fmt('WINDOW=3;RATE=1;LIMIT=2;NOTE=ab"c');
fmt('"WINDOW=3;RATE=1;LIMIT=2');

// unquoted syntax failures
fmt('WINDOW');
fmt('WINDOW=3;RATE=1;LIMIT=2=3');

// bad keys
fmt('window=3;RATE=1;LIMIT=2');
fmt('3WINDOW=3;RATE=1;LIMIT=2');
fmt('WINDOW-A=3;RATE=1;LIMIT=2');
fmt('"=3";RATE=1;LIMIT=2');
fmt('');

// duplicates
fmt('WINDOW=3;RATE=1;LIMIT=2;WINDOW=4');
fmt('WINDOW=3;RATE=1;LIMIT=2;"WINDOW"=4');

// whitespace
fmt('WINDOW=3;RATE=1;LIMIT=2;X= a');
fmt('WINDOW=3;RATE=1;LIMIT=2;X=a ');
fmt('WINDOW=3;RATE=1;LIMIT=2;X=" a"');
fmt('WINDOW=3;RATE=1;LIMIT=2; WINDOW2=1'.replace(' WINDOW2', 'X '));
fmt('WINDOW =3;RATE=1;LIMIT=2');

// precedence: syntax beats semantic
fmt('WINDOW=999;RATE=1;LIMIT=2;X= y');
fmt('WINDOW=999;RATE=1;LIMIT=2;X="a');

// semantics
val('WINDOW=1;RATE=1;LIMIT=2');
val('WINDOW=61;RATE=1;LIMIT=2');
val('WINDOW=03;RATE=1;LIMIT=2');
val('WINDOW=3;RATE=11;LIMIT=2');
val('WINDOW=3;RATE=01;LIMIT=2');
val('WINDOW=3;RATE=1;LIMIT=0');
val('WINDOW=3;RATE=1;LIMIT=126');
val('WINDOW=3;RATE=1;LIMIT=02');
val('RATE=1;LIMIT=2');
val('WINDOW=3;LIMIT=2');
val('WINDOW=3;RATE=1');
val('WINDOW=013;RATE=1;LIMIT=2');
eq(parseExport('WINDOW=2;RATE=0;LIMIT=1'), [{ WINDOW: 2, RATE: 0, LIMIT: 1 }]);
eq(parseExport('WINDOW=60;RATE=10;LIMIT=125'), [{ WINDOW: 60, RATE: 10, LIMIT: 125 }]);
val('WINDOW=0;RATE=0;LIMIT=1');
val('WINDOW=3;RATE=1;LIMIT=2;WINDOW=3');
