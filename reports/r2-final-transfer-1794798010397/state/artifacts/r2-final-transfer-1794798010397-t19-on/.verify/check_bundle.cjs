const assert = require('node:assert/strict');
const { parseBundle } = require('../adapters/bundle.cjs');

const ok = (s, exp) => assert.deepEqual(parseBundle(s), exp, 'input: ' + JSON.stringify(s));
const bad = (s, msg) => assert.throws(() => parseBundle(s), e => e instanceof Error && e.message === msg, 'input: ' + JSON.stringify(s));

// empty
ok('', []);
// required only
ok('WINDOW=2|RATE=40|LIMIT=50', [{ WINDOW: 2, RATE: 40, LIMIT: 50 }]);
// CR / CRLF
ok('WINDOW=2|RATE=0|LIMIT=1\rWINDOW=3|RATE=0|LIMIT=1', [{ WINDOW: 2, RATE: 0, LIMIT: 1 }, { WINDOW: 3, RATE: 0, LIMIT: 1 }]);
ok('WINDOW=2|RATE=0|LIMIT=1\r\nWINDOW=3|RATE=0|LIMIT=1\r\n', [{ WINDOW: 2, RATE: 0, LIMIT: 1 }, { WINDOW: 3, RATE: 0, LIMIT: 1 }]);
// whitespace trimmed from values only
ok('WINDOW= 3 |RATE=\t1|LIMIT=2 ', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
bad('  WINDOW=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
// whole field quoted
ok('"WINDOW=3"|RATE=1|LIMIT=2', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
// quoted content may hold separators, equals, newlines
ok('WINDOW=3|RATE=1|LIMIT=2|"COLOR=a|b=c"\r\n', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'a|b=c' }]);
ok('WINDOW=3|RATE=1|LIMIT=2|"COLOR=x\ny"', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'x\ny' }]);
// doubled quotes decode to one quote
ok('WINDOW=3|RATE=1|LIMIT=2|"COLOR=say ""hi"""', [{ WINDOW: 3, RATE: 1, LIMIT: 2, COLOR: 'say "hi"' }]);
// unknown keys dropped; insertion order = schema then retained unknowns
const r = parseBundle('COLOR=red|ZZZ=1|LIMIT=2|AAA=2|RATE=1|WINDOW=3');
assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'COLOR']);
// prototype-looking keys stay data
const p = parseBundle('WINDOW=3|RATE=1|LIMIT=2|__proto__=7|constructor=8');
assert.deepEqual(Object.keys(p[0]), ['WINDOW', 'RATE', 'LIMIT', '__proto__', 'constructor']);
assert.equal(Object.getPrototypeOf(p[0]), Object.prototype);
assert.equal(p[0].__proto__, 7);
assert.equal(p[0].constructor, '8');
// FLAGS
ok('WINDOW=3|RATE=1|LIMIT=2|FLAGS=beta', [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: ['beta'] }]);
ok('WINDOW=3|RATE=1|LIMIT=2|FLAGS=beta,alpha', [{ WINDOW: 3, RATE: 1, LIMIT: 2, FLAGS: ['beta', 'alpha'] }]);
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=alpha,alpha', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=gamma', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=alpha,,beta', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=alpha, beta', 'INVALID_VALUE');
// semantic errors
bad('WINDOW=1|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=61|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=02|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=+3|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=-3|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3.0|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=|RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3|RATE=41|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=0', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=51', 'INVALID_VALUE');
bad('RATE=1|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3|LIMIT=2', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1', 'INVALID_VALUE');
bad('WINDOW=999999999999999999999|RATE=1|LIMIT=2', 'INVALID_VALUE');
// unquoted extra '=' is a syntax error even for unknown keys
bad('WINDOW=3|RATE=1|LIMIT=2|ZZZ=a=b', 'INVALID_FORMAT');
// syntax errors
bad('WINDOW=3|RATE=1|LIMIT=2|', 'INVALID_FORMAT');
bad('|WINDOW=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('\n', 'INVALID_FORMAT');
bad('\r\n\r\n', 'INVALID_FORMAT');
bad('WINDOW|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('window=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('1WINDOW=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|A B=1', 'INVALID_FORMAT');
bad('WINDOW=3|WINDOW=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|"COLOR=x', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|COLOR=x"', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|"COLOR=x"y', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|"COLOR=x" y', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|CO"LOR=x', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|ZZZ=1|ZZZ=2', 'INVALID_FORMAT');
// syntax beats semantics within a record
bad('WINDOW=99|RATE=1|LIMIT=2|BAD', 'INVALID_FORMAT');
bad('RATE=1|LIMIT=2|WINDOW=99|A=1|a=2', 'INVALID_FORMAT');
// quoted unknown value may contain '='
ok('WINDOW=3|RATE=1|LIMIT=2|"ZZZ=a=b"', [{ WINDOW: 3, RATE: 1, LIMIT: 2 }]);
// boundary values
ok('WINDOW=2|RATE=0|LIMIT=50', [{ WINDOW: 2, RATE: 0, LIMIT: 50 }]);
ok('WINDOW=60|RATE=0|LIMIT=50', [{ WINDOW: 60, RATE: 0, LIMIT: 50 }]);
console.log('extended PASS');
