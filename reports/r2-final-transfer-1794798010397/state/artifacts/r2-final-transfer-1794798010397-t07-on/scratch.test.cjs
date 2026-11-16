'use strict';
const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');

const F = 'INVALID_FORMAT';
const V = 'INVALID_VALUE';
const eq = (a, b) => assert.deepEqual(a, b);
const throws = (fn, msg) => assert.throws(fn, (e) => e instanceof Error && e.message === msg);

// --- basics / record separators
eq(parseExport(''), []);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2\nWINDOW=4|RATE=2|LIMIT=5'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 5 }]);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2\r\nWINDOW=4|RATE=2|LIMIT=5'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 5 }]);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2\rWINDOW=4|RATE=2|LIMIT=5'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2 }, { WINDOW: 4, RATE: 2, LIMIT: 5 }]);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2\n'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2\r\n'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2\n\n'), F);

// --- optional known fields
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|COLOR= red |FLAGS=warm,cold'),
  [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'red', FLAGS: ['warm', 'cold'] }]);

// --- ordering: known schema order then unknown in field order
const ordered = parseExport('ZED=z|FLAGS=cold|LIMIT=2|ALPHA=a|WINDOW=3|RATE=1');
eq(Object.keys(ordered[0]), ['WINDOW', 'RATE', 'LIMIT', 'FLAGS', 'ZED', 'ALPHA']);

// --- unknown keys retain decoded strings
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|EXTRA= 42 ').at(0).EXTRA, '42');
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|EXTRA=abc').at(0).EXTRA, 'abc');

// --- prototype-looking keys stay data
const proto = parseExport('WINDOW=3|RATE=1|LIMIT=2|__PROTO__=bad|CONSTRUCTOR=x').at(0);
eq(Object.getPrototypeOf(proto), Object.prototype);
eq(Object.prototype.hasOwnProperty.call(proto, '__PROTO__'), true);
eq(proto.__PROTO__, 'bad');
eq(proto.CONSTRUCTOR, 'x');
eq(Object.keys(proto), ['WINDOW', 'RATE', 'LIMIT', '__PROTO__', 'CONSTRUCTOR']);
eq({}.bad, undefined);

// --- quoting
eq(parseExport('"WINDOW=3"|"RATE=1"|"LIMIT=2"'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq(parseExport('"COLOR=a=b"|WINDOW=3|RATE=1|LIMIT=2').at(0).COLOR, 'a=b');
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|"COLOR=a|b"').at(0).COLOR, 'a|b');
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|"COLOR=x""y"').at(0).COLOR, 'x"y');
eq(parseExport('"WINDOW=3|RATE=1|LIMIT=2"'), [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
eq(parseExport('"COLOR=a\nb"|WINDOW=3|RATE=1|LIMIT=2').at(0).COLOR, 'a\nb');
eq(parseExport('"COLOR=a\rb"|WINDOW=3|RATE=1|LIMIT=2').at(0).COLOR, 'a\rb');
eq(parseExport('"COLOR=  pad  "|WINDOW=3|RATE=1|LIMIT=2').at(0).COLOR, 'pad');
eq(parseExport('"COLOR="|WINDOW=3|RATE=1|LIMIT=2').at(0).COLOR, '');

// --- syntax failures
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|COLOR="x'), F);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|COLOR=x"y'), F);
throws(() => parseExport('"WINDOW=3"x|RATE=1|LIMIT=2'), F);
throws(() => parseExport('"WINDOW=3""|RATE=1|LIMIT=2'), F);
throws(() => parseExport('window=3|RATE=1|LIMIT=2'), F);
throws(() => parseExport('_WINDOW=3|RATE=1|LIMIT=2'), F);
throws(() => parseExport('WINDOW|RATE=1|LIMIT=2'), F);
throws(() => parseExport('WINDOW=3=4|RATE=1|LIMIT=2'), F);
throws(() => parseExport('WINDOW=3|WINDOW=3|RATE=1|LIMIT=2'), F);
throws(() => parseExport('"WINDOW=3"|WINDOW=4|RATE=1|LIMIT=2'), F);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|'), F);
throws(() => parseExport('WINDOW=3||LIMIT=2'), F);

// --- syntax precedence over semantics
throws(() => parseExport('WINDOW=999|RATE=1|LIMIT=2|BAD'), F);
throws(() => parseExport('WINDOW=999|RATE=1|LIMIT=2|WINDOW=1'), F);

// --- WINDOW bounds 2..40, canonical
eq(parseExport('WINDOW=2|RATE=0|LIMIT=1')[0].WINDOW, 2);
eq(parseExport('WINDOW=40|RATE=40|LIMIT=50'), [{ WINDOW: 40, RATE: 40, LIMIT: 50 }]);
throws(() => parseExport('WINDOW=1|RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=41|RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=03|RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=-3|RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=+3|RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=3.0|RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=|RATE=1|LIMIT=2'), V);
throws(() => parseExport('RATE=1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=3|LIMIT=2'), V);
throws(() => parseExport('WINDOW=3|RATE=1'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|LIMIT=2'), F);

// --- RATE 0..40, LIMIT 1..50
eq(parseExport('WINDOW=3|RATE=0|LIMIT=1')[0].RATE, 0);
throws(() => parseExport('WINDOW=3|RATE=-1|LIMIT=2'), V);
throws(() => parseExport('WINDOW=3|RATE=41|LIMIT=2'), V);
throws(() => parseExport('WINDOW=3|RATE=00|LIMIT=2'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=0'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=51'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=007'), V);

// --- FLAGS
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS=cold')[0].FLAGS, ['cold']);
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS= warm , cold ')[0].FLAGS, ['warm', 'cold']);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS=cold,cold'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS=hot'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS='), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS=cold,'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|FLAGS=COLD'), V);
throws(() => parseExport('WINDOW=3|RATE=1|LIMIT=2|"FLAGS=cold, warm"')[0].FLAGS === undefined, V);

// --- COLOR stays string
eq(parseExport('WINDOW=3|RATE=1|LIMIT=2|COLOR=5').at(0).COLOR, '5');

// --- non-string input
throws(() => parseExport(null), F);
throws(() => parseExport(undefined), F);
throws(() => parseExport(42), F);

console.log('scratch PASS');
