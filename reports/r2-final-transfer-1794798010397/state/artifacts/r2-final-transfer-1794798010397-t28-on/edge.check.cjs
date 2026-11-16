const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

const ok = (t, v) => assert.deepEqual(readInput(t), v, JSON.stringify(t));
const bad = (t, code) => assert.throws(() => readInput(t), (e) => e instanceof Error && e.message === code, JSON.stringify(t));
const B = 'WINDOW=3;RATE=1;LIMIT=2';
const base = { WINDOW: 3, RATE: 1, LIMIT: 2 };

ok('', []);
ok(B + '\n', [base]);
ok(B + '\r\n' + B + '\r' + B + '\n' + B, [base, base, base, base]);
ok('LIMIT=2;ZED=a;RATE=1;ALPHA=b;WINDOW=3', [{ ...base, ZED: 'a', ALPHA: 'b' }]);
assert.deepEqual(Object.keys(readInput('LIMIT=2;ZED=a;RATE=1;ALPHA=b;WINDOW=3')[0]), ['WINDOW', 'RATE', 'LIMIT', 'ZED', 'ALPHA']);
ok('"WINDOW=3";RATE=1;"LIMIT=2"', [base]);
ok(B + ';"X=a;b=c\r\nd""e"', [{ ...base, X: 'a;b=c\r\nd"e' }]);
ok(B + ';X=', [{ ...base, X: '' }]);
ok(B + ';COLOR=red;FLAGS=a,b', [{ ...base, COLOR: 'red', FLAGS: 'a,b' }]);
ok('WINDOW=2;RATE=0;LIMIT=1', [{ WINDOW: 2, RATE: 0, LIMIT: 1 }]);
ok('WINDOW=50;RATE=10;LIMIT=125', [{ WINDOW: 50, RATE: 10, LIMIT: 125 }]);

// syntax
bad(B + ';"X=a"b', 'INVALID_FORMAT');
bad(B + ';"X=a', 'INVALID_FORMAT');
bad(B + ';X=a"b', 'INVALID_FORMAT');
bad(B + ';x=1', 'INVALID_FORMAT');
bad(B + ';_X=1', 'INVALID_FORMAT');
bad(B + ';X', 'INVALID_FORMAT');
bad(B + ';X=1=2', 'INVALID_FORMAT');
bad(B + ';', 'INVALID_FORMAT');
bad(B + '\n\n' + B, 'INVALID_FORMAT');
bad(B + ';RATE=1', 'INVALID_FORMAT');
bad(B + ';"RATE=1"', 'INVALID_FORMAT');
bad(B + ';X= a', 'INVALID_FORMAT');
bad('WINDOW=3 ;RATE=1;LIMIT=2', 'INVALID_FORMAT');
bad(' WINDOW=3;RATE=1;LIMIT=2', 'INVALID_FORMAT');
bad('WINDOW=99;RATE=1;LIMIT=2;x=1', 'INVALID_FORMAT'); // syntax precedes semantic
bad(null, 'INVALID_FORMAT');

// semantic
bad('WINDOW=3;RATE=1', 'INVALID_VALUE');
bad('WINDOW=1;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=51;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=03;RATE=1;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=11;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=-0;LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=0', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=126', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=1.0', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=1e2', 'INVALID_VALUE');
bad('WINDOW=3;RATE=1;LIMIT=٣', 'INVALID_VALUE');

// prototype-looking keys are invalid keys under [A-Z][A-Z0-9_]*; verify safety anyway
bad(B + ';__proto__=x', 'INVALID_FORMAT');
const r = readInput(B + ';CONSTRUCTOR=x;PROTOTYPE=y')[0];
assert.equal(Object.getPrototypeOf(r), Object.prototype);
assert.equal(r.CONSTRUCTOR, 'x');

console.log('edge PASS');
