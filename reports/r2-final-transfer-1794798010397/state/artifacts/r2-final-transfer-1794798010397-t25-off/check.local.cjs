const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');
const F = /INVALID_FORMAT/, V = /INVALID_VALUE/;
const ok = (s, exp) => assert.deepEqual(parseExport(s), exp, 'FAIL ok: ' + JSON.stringify(s));
const bad = (s, re) => assert.throws(() => parseExport(s), re, 'FAIL bad: ' + JSON.stringify(s));

ok("", []);
ok("WINDOW=3|RATE=1|LIMIT=2", [{WINDOW:3,RATE:1,LIMIT:2}]);
ok("WINDOW=3|RATE=1|LIMIT=2|DURATION=5", [{WINDOW:3,RATE:1,LIMIT:2,DURATION:5}]);
ok("WINDOW=3|RATE=1|LIMIT=2\r\nWINDOW=4|RATE=2|LIMIT=3", [{WINDOW:3,RATE:1,LIMIT:2},{WINDOW:4,RATE:2,LIMIT:3}]);
ok("WINDOW=3|RATE=1|LIMIT=2\rWINDOW=4|RATE=2|LIMIT=3\n", [{WINDOW:3,RATE:1,LIMIT:2},{WINDOW:4,RATE:2,LIMIT:3}]);
// whole-field quoting, quoted keys, separators/equals inside quotes
ok('"WINDOW=3"|"RATE=1"|"LIMIT=2"', [{WINDOW:3,RATE:1,LIMIT:2}]);
ok(`WINDOW=3|RATE=1|LIMIT=2|"FOO=a=b|c"`, [{WINDOW:3,RATE:1,LIMIT:2}]); bad(`"WIN=DOW=3"|RATE=1|LIMIT=2`, V);
// doubled quotes decode; quotes containing CR/LF
ok('"WINDOW=3"|"RATE=1"|"LIMIT=2"|"FOO=a""b"', [{WINDOW:3,RATE:1,LIMIT:2}]);
ok('"WINDOW=3"|"RATE=1"|"LIMIT=2"|"FOO=a\nb\r\nc"', [{WINDOW:3,RATE:1,LIMIT:2}]);
// unknown keys dropped, incl. COLOR/FLAGS/prototype-looking
ok("WINDOW=3|RATE=1|LIMIT=2|COLOR=red|FLAGS=a,b|CONSTRUCTOR=x|PROTOTYPE=y", [{WINDOW:3,RATE:1,LIMIT:2}]);
assert.equal(Object.getPrototypeOf(parseExport("WINDOW=3|RATE=1|LIMIT=2")[0]), Object.prototype);
assert.deepEqual(Object.keys(parseExport("DURATION=5|LIMIT=2|FOO=1|WINDOW=3|RATE=1")[0]), ['WINDOW','RATE','LIMIT','DURATION']);
// syntax errors
bad('WINDOW=3|RATE=1|LIMIT=2|COLOR=a"b', F);        // quote in unquoted field
bad('"WINDOW=3|RATE=1|LIMIT=2', F);                  // unterminated quote
bad('"WINDOW=3"x|RATE=1|LIMIT=2', F);                // chars after closing quote
bad('"WINDOW=3"x', F);
bad('3WINDOW=3|RATE=1|LIMIT=2', F);                  // bad key
bad('WINDOW=3|RATE=1|LIMIT=2|FOO', F);               // no equals
bad('WINDOW=3|RATE=1|LIMIT=2|FOO=a=b', F);           // two equals unquoted
bad('WINDOW=3|RATE=1|LIMIT=2|WINDOW=3', F);          // duplicate
bad('WINDOW=3|RATE=1|LIMIT=2|FOO=1|FOO=2', F);       // duplicate unknown still invalid
bad('WINDOW= 3|RATE=1|LIMIT=2', F);                  // whitespace in value
bad('WINDOW=3|RATE=1|LIMIT=2|FOO=a ', F);
bad('WINDOW=3|RATE=1|LIMIT=2|', F);                  // empty field
bad('\n', F);
// semantic errors
bad('WINDOW=1|RATE=1|LIMIT=2', V);
bad('WINDOW=21|RATE=1|LIMIT=2', V);
bad('WINDOW=03|RATE=1|LIMIT=2', V);
bad('WINDOW=3|RATE=21|LIMIT=2', V);
bad('WINDOW=3|RATE=-1|LIMIT=2', V);
bad('WINDOW=3|RATE=1|LIMIT=0', V);
bad('WINDOW=3|RATE=1|LIMIT=51', V);
bad('WINDOW=3|RATE=1', V);                            // missing required
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=0', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=31', V);
bad('WINDOW=3|RATE=1|LIMIT=2|DURATION=x', V);
ok('WINDOW=20|RATE=20|LIMIT=50|DURATION=30', [{WINDOW:20,RATE:20,LIMIT:50,DURATION:30}]);
ok('WINDOW=2|RATE=0|LIMIT=1', [{WINDOW:2,RATE:0,LIMIT:1}]);
// precedence: format/duplicate/whitespace beat semantic
bad('WINDOW=99|RATE=1|LIMIT=2|FOO', F);
bad('WINDOW=99|WINDOW=3|RATE=1|LIMIT=2', F);
console.log('edge cases PASS');
