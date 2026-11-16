const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
const ok = (t, e) => assert.deepEqual(decodeSeparated(t), e, 'input: ' + JSON.stringify(t));
const bad = (t, m) => assert.throws(() => decodeSeparated(t), (err) => err instanceof Error && err.message === m, 'input: ' + JSON.stringify(t));

// empty / record separators
ok("", []);
ok("WINDOW=1|RATE=0|LIMIT=1\r\nWINDOW=2|RATE=1|LIMIT=2", [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:1,LIMIT:2}]);
ok("WINDOW=1|RATE=0|LIMIT=1\rWINDOW=2|RATE=1|LIMIT=2", [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:1,LIMIT:2}]);
bad("WINDOW=1|RATE=0|LIMIT=1\n", "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1|", "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1\n\n", "INVALID_FORMAT");

// whitespace: values only
ok("WINDOW= 2 |RATE= 1|LIMIT= 3 ", [{WINDOW:2,RATE:1,LIMIT:3}]);
ok("WINDOW=\t2\t|RATE=1|LIMIT=3", [{WINDOW:2,RATE:1,LIMIT:3}]);
bad(" WINDO W=1|RATE=0|LIMIT=1", "INVALID_FORMAT");

// canonical ints
bad("WINDOW=02|RATE=0|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=0|RATE=0|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=21|RATE=0|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=1|RATE=41|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=1|RATE=0|LIMIT=101", "INVALID_VALUE");
bad("WINDOW=+1|RATE=0|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=-1|RATE=0|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=|RATE=0|LIMIT=1", "INVALID_VALUE");
bad("RATE=0|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=1|LIMIT=1", "INVALID_VALUE");
bad("WINDOW=1|RATE=0", "INVALID_VALUE");
bad("WINDOW=1.0|RATE=0|LIMIT=1", "INVALID_VALUE");
ok("WINDOW=20|RATE=40|LIMIT=100", [{WINDOW:20,RATE:40,LIMIT:100}]);
ok("WINDOW=1|RATE=0|LIMIT=1", [{WINDOW:1,RATE:0,LIMIT:1}]);

// flags
ok("WINDOW=1|RATE=0|LIMIT=1|FLAGS=safe", [{WINDOW:1,RATE:0,LIMIT:1,FLAGS:["safe"]}]);
ok("WINDOW=1|RATE=0|LIMIT=1|FLAGS=safe,fast", [{WINDOW:1,RATE:0,LIMIT:1,FLAGS:["safe","fast"]}]);
ok("WINDOW=1|RATE=0|LIMIT=1|FLAGS= fast,safe ", [{WINDOW:1,RATE:0,LIMIT:1,FLAGS:["fast","safe"]}]);
bad("WINDOW=1|RATE=0|LIMIT=1|FLAGS=fast,fast", "INVALID_VALUE");
bad("WINDOW=1|RATE=0|LIMIT=1|FLAGS=", "INVALID_VALUE");
bad("WINDOW=1|RATE=0|LIMIT=1|FLAGS=fast,", "INVALID_VALUE");
bad("WINDOW=1|RATE=0|LIMIT=1|FLAGS=slow", "INVALID_VALUE");
bad("WINDOW=1|RATE=0|LIMIT=1|FLAGS=FAST", "INVALID_VALUE");

// unknown keys: order, COLOR string, prototype safety
ok("WINDOW=1|RATE=0|LIMIT=1|COLOR= red |Z=9|A=1", [{WINDOW:1,RATE:0,LIMIT:1,COLOR:"red",Z:"9",A:"1"}]);
ok("WINDOW=1|RATE=0|LIMIT=1|X=", [{WINDOW:1,RATE:0,LIMIT:1,X:""}]);
const p = decodeSeparated("WINDOW=1|RATE=0|LIMIT=1|__proto__=x|constructor=y")[0];
assert.equal(Object.getPrototypeOf(p), Object.prototype);
assert.equal(p.__proto__, "x");
assert.equal(p.constructor, "y");
assert.deepEqual(Object.keys(p), ["WINDOW","RATE","LIMIT","__proto__","constructor"]);
assert.equal(({}).x, undefined);
assert.equal(Object.prototype.x, undefined);
// schema order even when fields are out of order in the record
ok("COLOR=c|Z=z|LIMIT=3|RATE=2|WINDOW=1",
   [Object.fromEntries([["WINDOW",1],["RATE",2],["LIMIT",3],["COLOR","c"],["Z","z"]])]);

// quoted fields
ok('"WINDOW=1"|RATE=0|LIMIT=1', [{WINDOW:1,RATE:0,LIMIT:1}]);
ok('"WINDOW=1|RATE=0|LIMIT=1|COLOR=a|b=c"', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:"a|b=c"}]);
ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="  x  "', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:"x"}]);
ok('WINDOW=1|RATE=0|LIMIT=1|COLOR="a""b"', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a"b'}]);
ok('"WINDOW=1\n|RATE=0|LIMIT=1"', [{WINDOW:1,RATE:0,LIMIT:1}]);
ok('"WINDOW=1\r\n|RATE=0|LIMIT=1"', [{WINDOW:1,RATE:0,LIMIT:1}]);
ok('"WINDOW=1"|"RATE=0"|"LIMIT=1"', [{WINDOW:1,RATE:0,LIMIT:1}]);
ok('"WINDOW=1|RATE=0|LIMIT=1"\r\n"WINDOW=2|RATE=0|LIMIT=1"', [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:0,LIMIT:1}]);
ok('WINDOW=1|RATE=0|LIMIT=1|COLOR=""', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:""}]);
bad('WINDOW=1|RATE=0|LIMIT=1|"COLOR=a"x', "INVALID_FORMAT");
bad('WINDOW=1|RATE=0|LIMIT=1|"COLOR=a', "INVALID_FORMAT");
bad('WINDOW=1|RATE=0|LIMIT=1|COLOR=a"b', "INVALID_FORMAT");
bad('WINDOW=1|RATE=0|LIMIT=1|""', "INVALID_FORMAT");
bad('WINDOW=1|RATE=0|LIMIT=1|"COLOR=a" ', "INVALID_FORMAT");

// key syntax / duplicates / structure
bad("window=1|RATE=0|LIMIT=1", "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1|1A=x", "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1|X-Y=z", "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1|_X=1", "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1|WINDOW=2", "INVALID_FORMAT");
bad('WINDOW=1|RATE=0|LIMIT=1|"WINDOW=2"', "INVALID_FORMAT");
bad("WINDOW=1|RATE=0|LIMIT=1|NOVALUE", "INVALID_FORMAT");
bad("WINDOW=0=1|RATE=0|LIMIT=1", "INVALID_FORMAT");

// precedence: syntax/duplicate before semantic within a record
bad("WINDOW=99|BAD", "INVALID_FORMAT");
bad("WINDOW=99|RATE=0|LIMIT=1|WINDOW=1", "INVALID_FORMAT");
bad("WINDOW=99|RATE=0", "INVALID_VALUE");

// multiple records, order preserved
ok("WINDOW=1|RATE=0|LIMIT=1|COLOR=a\nWINDOW=2|RATE=1|LIMIT=2|COLOR=b",
   [{WINDOW:1,RATE:0,LIMIT:1,COLOR:"a"},{WINDOW:2,RATE:1,LIMIT:2,COLOR:"b"}]);
console.log('selfcheck PASS');
