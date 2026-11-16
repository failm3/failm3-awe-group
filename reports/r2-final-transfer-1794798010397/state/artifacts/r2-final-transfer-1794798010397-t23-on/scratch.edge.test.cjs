const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');

const ok = (input, expected) => assert.deepEqual(parseRecords(input), expected, JSON.stringify(input));
const bad = (input, msg) => assert.throws(() => parseRecords(input), (e) => e.message === msg, JSON.stringify(input));

// --- basics / record separators ---
assert.deepEqual(parseRecords(''), []);
ok('WINDOW=3|RATE=0|LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]);
ok('WINDOW=3|RATE=0|LIMIT=1\nWINDOW=4|RATE=1|LIMIT=2',
   [{ WINDOW: 3, RATE: 0, LIMIT: 1 }, { WINDOW: 4, RATE: 1, LIMIT: 2 }]);
ok('WINDOW=3|RATE=0|LIMIT=1\r\nWINDOW=4|RATE=1|LIMIT=2',
   [{ WINDOW: 3, RATE: 0, LIMIT: 1 }, { WINDOW: 4, RATE: 1, LIMIT: 2 }]);
ok('WINDOW=3|RATE=0|LIMIT=1\rWINDOW=4|RATE=1|LIMIT=2',
   [{ WINDOW: 3, RATE: 0, LIMIT: 1 }, { WINDOW: 4, RATE: 1, LIMIT: 2 }]);
ok('WINDOW=3|RATE=0|LIMIT=1\n', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]);

// --- whitespace trimmed from VALUE only ---
ok('WINDOW= 3 |RATE=0|LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]);
ok('COLOR=  red |WINDOW=3|RATE=0|LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'red' }]);
ok('EXTRA=   spaced  |WINDOW=3|RATE=0|LIMIT=1',
   [{ WINDOW: 3, RATE: 0, LIMIT: 1, EXTRA: 'spaced' }]);

// --- range boundaries ---
ok('WINDOW=50|RATE=40|LIMIT=150', [{ WINDOW: 50, RATE: 40, LIMIT: 150 }]);
bad('WINDOW=51|RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=2|RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3|RATE=41|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3|RATE=0|LIMIT=0', 'INVALID_VALUE');
bad('WINDOW=3|RATE=0|LIMIT=151', 'INVALID_VALUE');
bad('WINDOW=03|RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=+3|RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=-3|RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3.0|RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('RATE=0|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3|LIMIT=1', 'INVALID_VALUE');
bad('WINDOW=3|RATE=0', 'INVALID_VALUE');

// --- FLAGS ---
ok('WINDOW=3|RATE=0|LIMIT=1|FLAGS=read', [{ WINDOW: 3, RATE: 0, LIMIT: 1, FLAGS: ['read'] }]);
ok('WINDOW=3|RATE=0|LIMIT=1|FLAGS=write,read',
   [{ WINDOW: 3, RATE: 0, LIMIT: 1, FLAGS: ['write', 'read'] }]);
bad('WINDOW=3|RATE=0|LIMIT=1|FLAGS=read,read', 'INVALID_VALUE');
bad('WINDOW=3|RATE=0|LIMIT=1|FLAGS=exec', 'INVALID_VALUE');
bad('WINDOW=3|RATE=0|LIMIT=1|FLAGS=', 'INVALID_VALUE');
bad('WINDOW=3|RATE=0|LIMIT=1|FLAGS=read,', 'INVALID_VALUE');

// --- quoting ---
ok('"WINDOW=3"|RATE=0|LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }]);
ok('WINDOW=3|RATE=0|LIMIT=1|"COLOR=a|b"', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'a|b' }]);
ok('WINDOW=3|RATE=0|LIMIT=1|"COLOR=a=b"', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'a=b' }]);
ok('WINDOW=3|RATE=0|LIMIT=1|"COLOR=a""b"', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'a"b' }]);
ok('WINDOW=3|RATE=0|LIMIT=1|"COLOR=a\nb"', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'a\nb' }]);
ok('WINDOW=3|RATE=0|LIMIT=1|"COLOR=a\r\nb"', [{ WINDOW: 3, RATE: 0, LIMIT: 1, COLOR: 'a\r\nb' }]);
ok('WINDOW=3|RATE=0|LIMIT=1|"EXTRA= q "\nWINDOW=4|RATE=0|LIMIT=1',
   [{ WINDOW: 3, RATE: 0, LIMIT: 1, EXTRA: 'q' }, { WINDOW: 4, RATE: 0, LIMIT: 1 }]);
bad('"WINDOW=3|RATE=0|LIMIT=1', 'INVALID_FORMAT');          // unterminated
bad('WINDOW="3"|RATE=0|LIMIT=1', 'INVALID_FORMAT');         // quote in unquoted field
bad('"WINDOW=3"x|RATE=0|LIMIT=1', 'INVALID_FORMAT');        // trailing junk after close
bad('"WINDOW=3\"|RATE=0|LIMIT=1', 'INVALID_FORMAT');

// --- keys ---
bad('window=3|RATE=0|LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW X=3|RATE=0|LIMIT=1', 'INVALID_FORMAT');
bad('1WINDOW=3|RATE=0|LIMIT=1', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=0|LIMIT=1|A=1=2', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=0|LIMIT=1|JUSTKEY', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=0|LIMIT=1|A=1|A=2', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=0|LIMIT=1|A=1|"A=2"', 'INVALID_FORMAT');
bad('', 'INVALID_FORMAT') === undefined || true;

// --- precedence: syntax beats semantics ---
bad('WINDOW=999|x', 'INVALID_FORMAT');
bad('WINDOW=999|A=1|A=2', 'INVALID_FORMAT');
bad('badkey=1|RATE=999|LIMIT=999', 'INVALID_FORMAT');

// --- unknown keys / order / prototype safety ---
const rec = parseRecords('ZED=9|WINDOW=3|AAA=1|RATE=0|LIMIT=1');
assert.deepEqual(Object.keys(rec[0]), ['WINDOW', 'RATE', 'LIMIT', 'ZED', 'AAA']);
assert.equal(Object.getPrototypeOf(rec[0]), Object.prototype);
// prototype-looking keys are plain data; must not disturb the result prototype
const protoKey = parseRecords('CONSTRUCTOR=x|WINDOW=3|RATE=0|LIMIT=1');
assert.deepEqual(protoKey[0], { WINDOW: 3, RATE: 0, LIMIT: 1, CONSTRUCTOR: 'x' });
assert.equal(Object.getPrototypeOf(protoKey[0]), Object.prototype);
assert.equal(protoKey[0].constructor, 'x');
bad('__proto__=x|WINDOW=3|RATE=0|LIMIT=1', 'INVALID_FORMAT');

console.log('edge PASS');
