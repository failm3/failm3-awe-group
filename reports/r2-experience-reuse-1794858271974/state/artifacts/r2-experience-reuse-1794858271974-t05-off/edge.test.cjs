'use strict';
const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');

const cases = [
  ['', []],
  ['WINDOW=3|RATE=0|LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]],
  [
    'WINDOW=3|RATE=0|LIMIT=1\r\nWINDOW=4|RATE=1|LIMIT=2\rWINDOW=5|RATE=2|LIMIT=3',
    [
      { WINDOW: 3, RATE: 0, LIMIT: 1 },
      { WINDOW: 4, RATE: 1, LIMIT: 2 },
      { WINDOW: 5, RATE: 2, LIMIT: 3 },
    ],
  ],
  ['"WINDOW=3"|"RATE=0"|"LIMIT=1"', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]],
  ['WINDOW=3|RATE=0|LIMIT=1|COLOR=blue', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'blue' }]],
  ['ODD=x|WINDOW=3|RATE=0|LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1, ODD: 'x' }]],
  [
    'WINDOW=3|RATE=0|LIMIT=1|DURATION=5|FLAGS=a,b',
    [{ WINDOW: 3, RATE: 0, LIMIT: 1, DURATION: 5, FLAGS: 'a,b' }],
  ],
  ['WINDOW=3|RATE=0|LIMIT=1|DURATION=30', [{ WINDOW: 3, RATE: 0, LIMIT: 1, DURATION: 30 }]],
  // a whole quoted field may hold separators, equals signs, CR/LF, doubled quotes
  [
    '"COLOR=a=b|c\nd"|"WINDOW=3"|RATE=0|LIMIT=1',
    [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'a=b|c\nd' }],
  ],
  [
    '"COLOR=say ""hi""\r\nnext"|WINDOW=3|RATE=0|LIMIT=1',
    [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'say "hi"\r\nnext' }],
  ],
  // UTF-8 values survive intact
  ['WINDOW=3|RATE=0|LIMIT=1|COLOR=caf\u00e9 \u4e2d\u6587', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'caf\u00e9 \u4e2d\u6587' }]],
];

for (const [input, expected] of cases) {
  assert.deepEqual(parseExport(input), expected, 'deepEqual for ' + JSON.stringify(input));
}

// errors: syntax/duplicate/whitespace -> INVALID_FORMAT, semantics -> INVALID_VALUE
const errors = [
  ['"WINDOW=3"x|RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT=1|COLOR="b"', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT=1|WINDOW=4', 'INVALID_FORMAT'],
  ['window=3|RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['WINDOW= 3|RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['WINDOW=3 |RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['WINDOW =3|RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT=1|', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT', 'INVALID_FORMAT'],
  ['WINDOW=3=4|RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['"WINDOW=3', 'INVALID_FORMAT'],
  ['"COLOR"="a=b|c"|RATE=0|LIMIT=1', 'INVALID_FORMAT'],
  ['"WINDOW=3"="4"', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT=1|DURATION=5|DURATION=6', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT=1|COLOR=b lue', 'INVALID_FORMAT'],
  ['WINDOW=3|RATE=0|LIMIT=1|DURATION=31', 'INVALID_VALUE'],
  ['WINDOW=3|RATE=0|LIMIT=1|DURATION=0', 'INVALID_VALUE'],
  ['WINDOW=3|RATE=0|LIMIT=1|DURATION=+5', 'INVALID_VALUE'],
  ['WINDOW=03|RATE=0|LIMIT=1', 'INVALID_VALUE'],
  ['WINDOW=2|RATE=0|LIMIT=1', 'INVALID_VALUE'],
  ['WINDOW=21|RATE=0|LIMIT=1', 'INVALID_VALUE'],
  ['WINDOW=3|RATE=21|LIMIT=1', 'INVALID_VALUE'],
  ['WINDOW=3|RATE=0|LIMIT=151', 'INVALID_VALUE'],
  ['WINDOW=3|RATE=0|LIMIT=0', 'INVALID_VALUE'],
  ['WINDOW=3|RATE=0', 'INVALID_VALUE'],
];
for (const [input, expected] of errors) {
  let got = null;
  try {
    parseExport(input);
  } catch (e) {
    got = e.message;
  }
  assert.equal(got, expected, 'error for ' + JSON.stringify(input));
}

// prototype-looking keys: kept as own data, prototype untouched
const p = parseExport('WINDOW=3|RATE=0|LIMIT=1|__PROTO__=x|constructor=y|TOSTRING=z');
assert.equal(Object.getPrototypeOf(p[0]), Object.prototype);
assert.deepEqual(Object.keys(p[0]), ['WINDOW', 'RATE', 'LIMIT', '__PROTO__', 'constructor', 'TOSTRING']);
assert.equal(Object.getOwnPropertyDescriptor(p[0], '__PROTO__').value, 'x');
assert.equal({}.x, undefined);

// unknown key ordering follows record order; multi-record independence
const multi = parseExport('B=1|WINDOW=3|RATE=0|LIMIT=1|A=2\n"WINDOW=4"|RATE=1|LIMIT=2');
assert.deepEqual(Object.keys(multi[0]), ['WINDOW', 'RATE', 'LIMIT', 'B', 'A']);
assert.deepEqual(Object.keys(multi[1]), ['WINDOW', 'RATE', 'LIMIT']);

console.log('edge PASS');
