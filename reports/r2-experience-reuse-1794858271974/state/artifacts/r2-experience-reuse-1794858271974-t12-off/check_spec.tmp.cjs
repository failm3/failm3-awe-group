const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
const F = 'INVALID_FORMAT', V = 'INVALID_VALUE';
const ok = (inp, exp) => assert.deepEqual(decodeSeparated(inp), exp, 'in: ' + JSON.stringify(inp));
const cur = (inp) => { try { decodeSeparated(inp); return 'NO THROW'; } catch (e) { return e.message; } };
const bad = (inp, msg) => assert.equal(cur(inp), msg, 'in: ' + JSON.stringify(inp) + ' got ' + cur(inp));

// basics / empty
ok('', []);
ok('WINDOW=2;RATE=1;LIMIT=2', [{WINDOW:2,RATE:1,LIMIT:2}]);
ok('WINDOW=40;RATE=0;LIMIT=1', [{WINDOW:40,RATE:0,LIMIT:1}]);
// line endings
const body = 'WINDOW=1;RATE=1;LIMIT=1';
ok(body + '\nWINDOW=2;RATE=2;LIMIT=2', [{WINDOW:1,RATE:1,LIMIT:1},{WINDOW:2,RATE:2,LIMIT:2}]);
ok(body + '\r\nWINDOW=2;RATE=2;LIMIT=2', [{WINDOW:1,RATE:1,LIMIT:1},{WINDOW:2,RATE:2,LIMIT:2}]);
ok(body + '\rWINDOW=2;RATE=2;LIMIT=2', [{WINDOW:1,RATE:1,LIMIT:1},{WINDOW:2,RATE:2,LIMIT:2}]);
ok(body + '\n', [{WINDOW:1,RATE:1,LIMIT:1}]);
ok(body + '\r\n', [{WINDOW:1,RATE:1,LIMIT:1}]);
ok(body + '\r', [{WINDOW:1,RATE:1,LIMIT:1}]);
// unknown keys retained in field order, after known fields
const r = decodeSeparated('Z=1;WINDOW=2;A=2;RATE=1;LIMIT=3')[0];
assert.deepEqual(Object.keys(r), ['WINDOW','RATE','LIMIT','Z','A']);
assert.equal(r.Z, '1'); assert.equal(r.A, '2');
// known schema order regardless of input order
assert.deepEqual(Object.keys(decodeSeparated('LIMIT=1;RATE=0;WINDOW=1')[0]), ['WINDOW','RATE','LIMIT']);
// optional fields: COLOR string, FLAGS array, schema order
assert.deepEqual(decodeSeparated('WINDOW=1;RATE=1;LIMIT=1;COLOR=007;FLAGS=a,b'),
  [{WINDOW:1,RATE:1,LIMIT:1,COLOR:'007',FLAGS:['a','b']}]);
assert.deepEqual(Object.keys(decodeSeparated('FLAGS=a;WINDOW=1;RATE=1;LIMIT=1;COLOR=x')[0]),
  ['WINDOW','RATE','LIMIT','COLOR','FLAGS']);
assert.deepEqual(decodeSeparated('WINDOW=1;RATE=1;LIMIT=1;FLAGS=')[0].FLAGS, []);
assert.deepEqual(decodeSeparated('WINDOW=1;RATE=1;LIMIT=1;COLOR=')[0].COLOR, '');
// whole-field quoting
ok('"WINDOW=1";"RATE=1";"LIMIT=1"', [{WINDOW:1,RATE:1,LIMIT:1}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"COLOR=a b"', [{WINDOW:1,RATE:1,LIMIT:1,COLOR:'a b'}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"NOTE=a;b=c"', [{WINDOW:1,RATE:1,LIMIT:1,NOTE:'a;b=c'}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"NOTE=say ""hi"""', [{WINDOW:1,RATE:1,LIMIT:1,NOTE:'say "hi"'}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"NOTE=a\nb"', [{WINDOW:1,RATE:1,LIMIT:1,NOTE:'a\nb'}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"NOTE=a\r\nb"', [{WINDOW:1,RATE:1,LIMIT:1,NOTE:'a\r\nb'}]);
ok('"COLOR=zzz";WINDOW=1;RATE=1;LIMIT=1', [{WINDOW:1,RATE:1,LIMIT:1,COLOR:'zzz'}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"COLOR="', [{WINDOW:1,RATE:1,LIMIT:1,COLOR:''}]);
ok('WINDOW=1;RATE=1;LIMIT=1;"FLAGS=a,b"', [{WINDOW:1,RATE:1,LIMIT:1,FLAGS:['a','b']}]);
// record ending right after a closing quote
ok('WINDOW=1;RATE=1;"LIMIT=1"\nWINDOW=2;RATE=2;LIMIT=2',
  [{WINDOW:1,RATE:1,LIMIT:1},{WINDOW:2,RATE:2,LIMIT:2}]);
// prototype-looking keys stay data
const p = decodeSeparated('__proto__=x;WINDOW=1;RATE=1;LIMIT=1')[0];
assert.equal(Object.getPrototypeOf(p), Object.prototype);
assert.equal(Object.prototype.x, undefined);
assert.ok(Object.prototype.hasOwnProperty.call(p, '__proto__'));
assert.equal(p.__proto__, 'x');
const c = decodeSeparated('constructor=bad;WINDOW=1;RATE=1;LIMIT=1')[0];
assert.equal(c.constructor, 'bad');
assert.equal(Object.keys(c).join(), 'WINDOW,RATE,LIMIT,constructor');
const t = decodeSeparated('toString=a;WINDOW=1;RATE=1;LIMIT=1')[0];
assert.equal(t.toString, 'a');

// ---- INVALID_FORMAT cases ----
bad('window=1;RATE=1;LIMIT=1', F);
bad('1W=1;WINDOW=1;RATE=1;LIMIT=1', F);
bad('BAD KEY=2;WINDOW=1;RATE=1;LIMIT=1', F);
bad('=1;WINDOW=1;RATE=1;LIMIT=1', F);
bad('WINDOW=1;RATE=1;LIMIT=1;A=1=2', F);
bad('WINDOW=1;RATE=1;LIMIT=1;A', F);
bad('WINDOW=1;RATE=1;LIMIT=1;A=', V);            // empty value ok syntactically -> LIMIT etc fine? see below
bad('WINDOW=1;RATE=1;LIMIT=1;LIMIT=2', F);       // duplicate decoded key
bad('WINDOW=1;RATE=1;LIMIT=1;"LIMIT=2"', F);     // duplicate across quoting styles
bad("WINDOW=1;RATE=1;LIMIT=1;'LIMIT'=2", F);
bad('WINDOW=1;RATE=1;LIMIT=1;', F);              // empty field
bad('WINDOW=1;RATE=1;LIMIT=1;;', F);
bad('WINDOW=1;RATE=1;LIMIT=1\n\n' + body + '\n;', F);
bad('WINDOW= 1;RATE=1;LIMIT=1', F);              // untrimmed value
bad('WINDOW=1 ;RATE=1;LIMIT=1', F);
bad('WINDOW=1\t;RATE=1;LIMIT=1', F);
bad('WINDOW=1;RATE=1;LIMIT=1;COLOR=a "b"', F);   // quote in unquoted field
bad('WINDOW=1;RATE=1;LIMIT=1;COLOR="abc', F);    // unterminated
bad('WINDOW=1;RATE=1;LIMIT=1;"COLOR=ab"c', F);   // junk after closing quote
bad('WINDOW=1;RATE=1;LIMIT=1;"COLOR=ab" x', F);
// precedence: syntax/dup/whitespace beat semantic
bad('WINDOW=99;RATE=1;LIMIT=1;BAD=1=2', F);
bad('WINDOW=99;RATE=1;LIMIT=1;B=1;B=2', F);
bad('WINDOW=99;RATE=1;LIMIT=1;COLOR= x', F);
bad('RATE=1;LIMIT=1;BAD=1=2', F);

// ---- INVALID_VALUE cases ----
for (const w of ['0','41','-1','01','1.0','1e1',' 1','1 ','','abc','0x2','1_0','1\n','+1','٣'])
  bad('WINDOW=' + w + ';RATE=1;LIMIT=1', V);
for (const x of ['11','-0','01','2.5','','+0'])
  bad('WINDOW=1;RATE=' + x + ';LIMIT=1', V);
for (const x of ['0','26','01','','25.0'])
  bad('WINDOW=1;RATE=1;LIMIT=' + x, V);
bad('RATE=1;LIMIT=1', V);
bad('WINDOW=1;LIMIT=1', V);
bad('WINDOW=1;RATE=1', V);
bad('COLOR=red', V);
bad('WINDOW=999999999999999999999999;RATE=1;LIMIT=1', V);
bad('"WINDOW=1;RATE=1;LIMIT=1"', V);   // one quoted field, messy value

// boundaries
ok('WINDOW=1;RATE=10;LIMIT=25', [{WINDOW:1,RATE:10,LIMIT:25}]);
ok('"WINDOW=40";"RATE=0";"LIMIT=1"', [{WINDOW:40,RATE:0,LIMIT:1}]);
// per-record unknown retention
assert.deepEqual(decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;X=a\r\nWINDOW=2;RATE=0;LIMIT=2;Y=b'),
  [{WINDOW:1,RATE:0,LIMIT:1,X:'a'},{WINDOW:2,RATE:0,LIMIT:2,Y:'b'}]);
console.log('spec checks PASS');
