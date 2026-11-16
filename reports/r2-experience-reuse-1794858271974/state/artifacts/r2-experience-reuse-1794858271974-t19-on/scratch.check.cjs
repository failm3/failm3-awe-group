const assert = require('node:assert/strict');
const { parseBundle } = require('./adapters/bundle.cjs');
const ok = (t, e) => assert.deepEqual(parseBundle(t), e);
const bad = (t, m) => assert.throws(() => parseBundle(t), err => err instanceof Error && err.message === m);

// separators LF, CRLF, CR
ok("WINDOW=3|RATE=1|LIMIT=2\r\nWINDOW=4|RATE=2|LIMIT=3\rWINDOW=5|RATE=3|LIMIT=4\n", [
 {WINDOW:3,RATE:1,LIMIT:2},{WINDOW:4,RATE:2,LIMIT:3},{WINDOW:5,RATE:3,LIMIT:4}]);
ok('WINDOW=3|RATE=1|LIMIT=2\r\n', [{WINDOW:3,RATE:1,LIMIT:2}]);
// empty / non-string
ok("", []); bad(null, 'INVALID_FORMAT'); bad(5, 'INVALID_FORMAT');
// trim value only
ok("WINDOW= 3 |RATE=1|LIMIT=2", [{WINDOW:3,RATE:1,LIMIT:2}]);
bad("WINDOW=3|RATE=1|LIMIT=2|FLAGS= beta , alpha ", "INVALID_VALUE");
ok("WINDOW=3|RATE=1|LIMIT=2|FLAGS= beta,alpha ", [{WINDOW:3,RATE:1,LIMIT:2,FLAGS:["beta","alpha"]}]);
// whole-field quoting
ok('"WINDOW=3"|"RATE=1"|"LIMIT=2"', [{WINDOW:3,RATE:1,LIMIT:2}]);
bad('WINDOW="3"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('"WINDOW"=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('"WI|NDOW=3"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
// doubled quote
bad('LIMIT="2""|WINDOW=3|RATE=1', 'INVALID_FORMAT');
// junk after closing quote
bad('"WINDOW=3"junk|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('"WINDOW=3" "x"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
// unterminated
bad('"WINDOW=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('WINDOW=3|"RATE=1', 'INVALID_FORMAT');
// empty field
bad('WINDOW=3|RATE=1|LIMIT=2|', 'INVALID_FORMAT');
bad('WINDOW=3||RATE=1|LIMIT=2', 'INVALID_FORMAT');
// bad keys
bad('window=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('W=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|=x', 'INVALID_FORMAT');
bad('1A=3|WINDOW=3|RATE=1|LIMIT=2', 'INVALID_FORMAT');
// duplicate decoded keys
bad('WINDOW=3|"WINDOW=4"|RATE=1|LIMIT=2', 'INVALID_FORMAT');
// two equals signs unquoted
bad('WINDOW=3=4|RATE=1|LIMIT=2', 'INVALID_FORMAT');
// and no equals at all
bad('WINDOW=3|RATE|LIMIT=2', 'INVALID_FORMAT');
// syntax/duplicate precedence over semantics inside a record
bad('WINDOW=999|RATE=1|LIMIT=2|window=1', 'INVALID_FORMAT');
// unknown keys dropped, prototype untouched
const p = parseBundle('WINDOW=3|RATE=1|LIMIT=2|__proto__=x|constructor=y');
assert.deepEqual(p, [{WINDOW:3,RATE:1,LIMIT:2}]);
assert.equal(Object.getPrototypeOf(p[0]), Object.prototype);
assert.deepEqual(Object.keys(p[0]), ['WINDOW','RATE','LIMIT']);
// schema order then unknowns; FLAGS array
const q = parseBundle('ZZZ=1|WINDOW=3|RATE=1|LIMIT=2|FLAGS=beta')[0];
assert.deepEqual(Object.keys(q), ['WINDOW','RATE','LIMIT','FLAGS']);
assert.deepEqual(q, {WINDOW:3,RATE:1,LIMIT:2,FLAGS:['beta']});
// flags validation
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=alpha,alpha', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=gamma', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=', 'INVALID_VALUE');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS=alpha,,beta', 'INVALID_VALUE');
// bounds + canonical integers
ok('WINDOW=2|RATE=40|LIMIT=50', [{WINDOW:2,RATE:40,LIMIT:50}]);
ok('WINDOW=60|RATE=0|LIMIT=1', [{WINDOW:60,RATE:0,LIMIT:1}]);
for (const t of [
  'WINDOW=1|RATE=1|LIMIT=2','WINDOW=61|RATE=1|LIMIT=2','WINDOW=03|RATE=1|LIMIT=2',
  'WINDOW=+3|RATE=1|LIMIT=2','WINDOW=3.0|RATE=1|LIMIT=2','WINDOW= |RATE=1|LIMIT=2',
  'WINDOW=3|RATE=41|LIMIT=2','WINDOW=3|RATE=1|LIMIT=0','WINDOW=3|RATE=1|LIMIT=51',
  'WINDOW=3|RATE=1','WINDOW=3|RATE=1|LIMIT='
]) bad(t, 'INVALID_VALUE');
// error thrown in a later record leaves earlier work unscored
bad('WINDOW=3|RATE=1|LIMIT=2\r\nWINDOW=3|RATE=1|LIMIT=2|c=', 'INVALID_FORMAT');
bad('WINDOW=3|RATE=1|LIMIT=2|FLAGS', 'INVALID_FORMAT');
console.log('scratch PASS');
