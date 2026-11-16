'use strict';
const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');

function throwsCode(fn, code, label) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof Error, label + ': not an Error');
    assert.equal(e.message, code, label + ': got ' + JSON.stringify(e.message));
    return;
  }
  throw new Error(label + ': did not throw');
}

// empty / line endings
assert.deepEqual(decodeSeparated(''), []);
assert.deepEqual(decodeSeparated('WINDOW=1|RATE=0|LIMIT=1\nWINDOW=2|RATE=1|LIMIT=2'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(decodeSeparated('WINDOW=1|RATE=0|LIMIT=1\r\nWINDOW=2|RATE=1|LIMIT=2\r\n'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(decodeSeparated('WINDOW=1|RATE=0|LIMIT=1\rWINDOW=2|RATE=1|LIMIT=2'),
  [{ WINDOW: 1, RATE: 0, LIMIT: 1 }, { WINDOW: 2, RATE: 1, LIMIT: 2 }]);

// trailing newline allowed
assert.deepEqual(decodeSeparated('WINDOW=2|RATE=1|LIMIT=2\n'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);

// whitespace trimmed from values only
assert.deepEqual(decodeSeparated('WINDOW= 2 |RATE=\t1|LIMIT=2'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(decodeSeparated('WINDOW=2|RATE=1|LIMIT=2|COLOR=  red  '),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2, COLOR: 'red' }]);

// quoting
assert.deepEqual(decodeSeparated('"WINDOW=2"|"RATE=1"|"LIMIT=2"'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.deepEqual(decodeSeparated('WINDOW=2|RATE=1|LIMIT=2|COLOR="a|b=c\r\nd""e"'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2, COLOR: 'a|b=c\r\nd"e' }]);

// unknown keys: strings, original order, after known fields
const proto = decodeSeparated('Z=1|WINDOW=2|A=2|RATE=1|LIMIT=2');
assert.deepEqual(proto, { WINDOW: 2, RATE: 1, LIMIT: 2, Z: '1', A: '2' });
assert.deepEqual(Object.keys(proto).sort(), ['A', 'LIMIT', 'RATE', 'WINDOW', 'Z']);
assert.equal(Object.getPrototypeOf(proto), Object.prototype);

// prototype-looking keys stay data
const p2 = decodeSeparated('CONSTRUCTOR=x|WINDOW=1|RATE=0|LIMIT=1');
assert.equal(p2.CONSTRUCTOR, 'x');
assert.equal(Object.getPrototypeOf(p2), Object.prototype);
assert.equal(typeof p2.constructor, 'string');

// FLAGS / COLOR typing
assert.deepEqual(decodeSeparated('WINDOW=2|RATE=1|LIMIT=2|FLAGS=fast'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2, FLAGS: ['fast'] }]);
assert.deepEqual(decodeSeparated('WINDOW=2|RATE=1|LIMIT=2|FLAGS=safe,fast|COLOR=x'),
  [{ WINDOW: 2, RATE: 1, LIMIT: 2, FLAGS: ['safe', 'fast'], COLOR: 'x' }]);

// bounds
assert.deepEqual(decodeSeparated('WINDOW=20|RATE=40|LIMIT=100'),
  [{ WINDOW: 20, RATE: 40, LIMIT: 100 }]);
for (const bad of ['WINDOW=0|RATE=1|LIMIT=2', 'WINDOW=21|RATE=1|LIMIT=2',
  'WINDOW=02|RATE=1|LIMIT=2', 'WINDOW=-1|RATE=1|LIMIT=2', 'WINDOW=2|RATE=41|LIMIT=2',
  'WINDOW=2|RATE=1|LIMIT=0', 'WINDOW=2|RATE=1|LIMIT=101', 'WINDOW=2|RATE=1|LIMIT=2|FLAGS=fast,fast',
  'WINDOW=2|RATE=1|LIMIT=2|FLAGS=slow', 'WINDOW=2|RATE=1|LIMIT=2|FLAGS=',
  'WINDOW=2|RATE=1', 'WINDOW=2|RATE=1|LIMIT=2|WINDOW=3', 'WINDOW=2|RATE=1|LIMIT=2|LIMIT=3',
  'WINDOW=2.0|RATE=1|LIMIT=2', 'WINDOW= 2|RATE=1|LIMIT=2|COLOR']) {
  throwsCode(() => decodeSeparated(bad), 'INVALID_VALUE', bad);
}

// syntax errors
for (const bad of ['WINDOW=2|RATE=1|LIMIT=2|', '|WINDOW=2', 'WINDOW=2|RATE=1|LIMIT=2\n\n',
  'WINDOW=2\nRATE=1|LIMIT=2|X', 'window=2|RATE=1|LIMIT=2', 'WINDOW=2|RATE=1|LIMIT=2|BAD-KEY=1',
  'WINDOW=2|RATE=1|LIMIT=2|X', 'WINDOW=2|RATE=1|LIMIT=2|X=1=2', 'WINDOW=2|RATE=1|LIMIT=2|X"=1',
  'WINDOW=2|RATE=1|LIMIT=2|"X=1"z', 'WINDOW=2|RATE=1|LIMIT=2|"X=1',
  'WINDOW=2|RATE=1|LIMIT=2|"X=1" "Y=2"', 'WINDOW =2|RATE=1|LIMIT=2',
  'WINDOW=2|RATE=1|LIMIT=2|""', 'WINDOW=2|RATE=1|LIMIT=2|"WINDOW=3"'] {
  throwsCode(() => decodeSeparated(bad), 'INVALID_FORMAT', JSON.stringify(bad));
}

// syntax beats semantics within a record
throwsCode(() => decodeSeparated('WINDOW=99|RATE=1|LIMIT=2|A'), 'INVALID_FORMAT', 'syntax precedence');
throwsCode(() => decodeSeparated('WINDOW=99|RATE=1|LIMIT=2|WINDOW=1'), 'INVALID_FORMAT', 'dup precedence');

// semantic error in a later record still throws
throwsCode(() => decodeSeparated('WINDOW=1|RATE=0|LIMIT=1\nWINDOW=0'), 'INVALID_VALUE', 'later record');

console.log('edge PASS');
