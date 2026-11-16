const assert = require('node:assert/strict');
const path = require('node:path');
const { readInput } = require(path.join(__dirname, '..', 'lib', 'input.cjs'));

const F = 'INVALID_FORMAT';
const V = 'INVALID_VALUE';
const ok = (t, e) => assert.deepEqual(readInput(t), e);
const bad = (t, want) => assert.throws(
  () => readInput(t),
  (x) => x instanceof Error && x.message === want && x.message === want,
  'expected ' + want + ' for ' + JSON.stringify(t)
);

ok('', []);
ok('WINDOW=1|RATE=0|LIMIT=1\r\nLIMIT=100|RATE=20|WINDOW=60\rWINDOW=3|RATE=3|LIMIT=3\n', [
  { WINDOW: 1, RATE: 0, LIMIT: 1 },
  { WINDOW: 60, RATE: 20, LIMIT: 100 },
  { WINDOW: 3, RATE: 3, LIMIT: 3 },
]);

// insertion order = known-field schema order
assert.deepEqual(Object.keys(readInput('DURATION=150|LIMIT=2|RATE=1|WINDOW=2')[0]),
  ['WINDOW', 'RATE', 'LIMIT', 'DURATION']);

// quoted fields: quotes may hold separators, '=' and CR/LF; "" -> "
ok('"WINDOW=2"|"RATE=1"|LIMIT=2|"X=a|b""c\r\nd"', [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);
ok('"WIN\r\nDOW=2"|"RATE=1"|"LIMIT=2"', [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);

// unknown keys dropped (incl. prototype-looking), plain-object prototype
const r = readInput('WINDOW=2|RATE=1|LIMIT=2|COLOR=red|FLAGS=a,b|PROTO=x|CONSTRUCTOR=y');
assert.deepEqual(r, [{ WINDOW: 2, RATE: 1, LIMIT: 2 }]);
assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);

// DURATION is a decimal integer, not canonical
ok('WINDOW=2|RATE=1|LIMIT=2|DURATION=007', [{ WINDOW: 2, RATE: 1, LIMIT: 2, DURATION: 7 }]);
ok('WINDOW=2|RATE=1|LIMIT=2|DURATION=-0', [{ WINDOW: 2, RATE: 1, LIMIT: 2, DURATION: -0 }]);

// syntax problems
for (const t of [
  'WINDOW=2|RATE=1|LIMIT',
  'WINDOW=2|RATE=1|LIMIT=2=3',
  'WINDOW=2||RATE=1|LIMIT=2',
  'WINDOW=2|RATE=1|LIMIT=2|RATE=1',
  'WINDOW=2|"RATE=1"|RATE=1|LIMIT=2',
  '"WINDOW=2|RATE=1|LIMIT=2',
  '"WINDOW=2"x|RATE=1|LIMIT=2',
  'WINDOW=2|RA"TE=1|LIMIT=2',
  'window=2|RATE=1|LIMIT=2',
  '1W=2|RATE=1|LIMIT=2',
  'WINDOW= 2|RATE=1|LIMIT=2',
  'WINDOW=2|RATE=1|LIMIT=2 ',
  'WINDOW=2|RATE=1|LIMIT=2|X=1 ',
  'WINDOW=2|RATE=1|LIMIT=2\n\nWINDOW=2|RATE=1|LIMIT=2',
  '\n',
  'WINDOW=99|RATE=1|LIMIT=2|BAD KEY=1',
  'RATE=1|X= y',
]) bad(t, F);

// semantic problems
for (const t of [
  'WINDOW=0|RATE=1|LIMIT=2',
  'WINDOW=61|RATE=1|LIMIT=2',
  'WINDOW=02|RATE=1|LIMIT=2',
  'WINDOW=2|RATE=21|LIMIT=2',
  'WINDOW=2|RATE=+1|LIMIT=2',
  'WINDOW=2|RATE=1|LIMIT=101',
  'WINDOW=2|RATE=1|LIMIT=0',
  'WINDOW=2|RATE=1',
  'WINDOW=2|RATE=1|LIMIT=',
  'WINDOW=2|RATE=1|LIMIT=2|DURATION=0',
  'WINDOW=2|RATE=1|LIMIT=2|DURATION=151',
  'WINDOW=2|RATE=1|LIMIT=2|DURATION=1.5',
  'WINDOW=2|RATE=1|LIMIT=2|DURATION=x',
  'WINDOW=2|RATE=1|LIMIT=2|DURATION= 5',
  'WINDOW=1e1|RATE=1|LIMIT=2',
]) bad(t, V);

// syntax in a later record outranks nothing earlier; a clean first record is
// still parsed, and the offending record reports its own error type.
assert.throws(() => readInput('WINDOW=2|RATE=1|LIMIT=2\nBAD'), (x) => x.message === F);
assert.throws(() => readInput('WINDOW=2|RATE=1|LIMIT=2\nWINDOW=99|RATE=1|LIMIT=2'), (x) => x.message === V);
// syntax in the same record wins over INVALID_VALUE
assert.throws(() => readInput('WINDOW=99|RATE=1|LIMIT=2|BAD KEY=1'), (x) => x.message === F);
assert.throws(() => readInput('WINDOW=99|RATE=1|LIMIT=2|RATE=1'), (x) => x.message === F);

console.log('extra PASS');
