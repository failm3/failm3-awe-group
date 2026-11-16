const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; } catch (e) { fail++; console.log('FAIL:', name, '->', e.message); }
}
const ok = (input, expected) => () => assert.deepEqual(readInput(input), expected);
const bad = (input, msg) => () => assert.throws(() => readInput(input), (e) => e.message === msg);

// --- structure / record separators ---
t('empty', ok('', []));
t('crlf', ok('WINDOW=1|RATE=0|LIMIT=1\r\nWINDOW=2|RATE=1|LIMIT=2', [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:1,LIMIT:2}]));
t('cr', ok('WINDOW=1|RATE=0|LIMIT=1\rWINDOW=2|RATE=1|LIMIT=2', [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:1,LIMIT:2}]));
t('lf', ok('WINDOW=1|RATE=0|LIMIT=1\nWINDOW=2|RATE=1|LIMIT=2', [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:1,LIMIT:2}]));
t('trailing lf ok', ok('WINDOW=1|RATE=0|LIMIT=1\n', [{WINDOW:1,RATE:0,LIMIT:1}]));
t('trailing crlf ok', ok('WINDOW=1|RATE=0|LIMIT=1\r\n', [{WINDOW:1,RATE:0,LIMIT:1}]));
t('blank line', bad('WINDOW=1|RATE=0|LIMIT=1\n\nWINDOW=1|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('all fields', ok('WINDOW=3|RATE=2|LIMIT=4|DURATION=5|COLOR=red|FLAGS=a,b', [{WINDOW:3,RATE:2,LIMIT:4,DURATION:5,COLOR:'red',FLAGS:['a','b']}]));
t('schema order', () => assert.deepEqual(Object.keys(readInput('FLAGS=a|COLOR=x|LIMIT=1|RATE=0|WINDOW=1')[0]), ['WINDOW','RATE','LIMIT','COLOR','FLAGS']));
t('unknown dropped', ok('FOO=1|WINDOW=1|RATE=0|LIMIT=1|BAR=2', [{WINDOW:1,RATE:0,LIMIT:1}]));
t('json', () => assert.equal(JSON.stringify(readInput('WINDOW=1|RATE=0|LIMIT=1')), '[{"WINDOW":1,"RATE":0,"LIMIT":1}]'));

// --- quoting (a quoted field is the WHOLE field) ---
t('whole field quoted', ok('"WINDOW=1"|RATE=0|LIMIT=1', [{WINDOW:1,RATE:0,LIMIT:1}]));
t('quoted whole field with separators+equals', ok('WINDOW=1|RATE=0|LIMIT=1|"COLOR=a|b=c"', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a|b=c'}]));
t('doubled quote decodes', ok('WINDOW=1|RATE=0|LIMIT=1|"COLOR=a""b"', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a"b'}]));
t('quoted field contains LF', ok('"WINDOW=1|RATE=0|LIMIT=1|COLOR=x\ny"', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'x\ny'}]));
t('quoted field contains CR', ok('"WINDOW=1|RATE=0|LIMIT=1|COLOR=x\ry"', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'x\ry'}]));
t('quoted field then record', ok('"WINDOW=1|RATE=0|LIMIT=1"\n"WINDOW=2|RATE=3|LIMIT=4"', [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:3,LIMIT:4}]));
t('quote starts bare field', bad('WINDOW=1|RATE=0|LIMIT=1|COLOR="x"', 'INVALID_FORMAT'));
t('chars after closing quote', bad('WINDOW=1|RATE=0|LIMIT=1|"COLOR=x"y', 'INVALID_FORMAT'));
t('unterminated quote', bad('WINDOW=1|RATE=0|LIMIT=1|"COLOR=x', 'INVALID_FORMAT'));
t('bare quote inside field', bad('WINDOW=1|RATE=0|LIMIT=1|COLOR=x"y', 'INVALID_FORMAT'));
t('quoted empty value ok', ok('"COLOR="|WINDOW=1|RATE=0|LIMIT=1', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:''}]));

// --- syntax errors ---
t('bad key lower', bad('window=1|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('bad key leading digit', bad('1WINDOW=1|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('bad key leading underscore', bad('_X=1|WINDOW=1|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('dup key', bad('WINDOW=1|WINDOW=1|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('dup across quoted', bad('"WINDOW=1"|WINDOW=2|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('two equals', bad('WINDOW=1=2|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('no equals', bad('WINDOW|RATE=0|LIMIT=1', 'INVALID_FORMAT'));
t('empty trailing field', bad('WINDOW=1|RATE=0|LIMIT=1|', 'INVALID_FORMAT'));
t('empty middle field', bad('WINDOW=1||RATE=0|LIMIT=1', 'INVALID_FORMAT'));

// --- whitespace policy ---
t('leading space value', bad('WINDOW=1|RATE=0|LIMIT=1|COLOR= x', 'INVALID_FORMAT'));
t('trailing space value', bad('WINDOW=1|RATE=0|LIMIT=1|COLOR=x ', 'INVALID_FORMAT'));
t('space around equals', bad('WINDOW =1|RATE=0|LIMIT=1', 'INVALID_FORMAT'));

// --- precedence: syntax/duplicate/whitespace beat semantics ---
t('syntax before sem', bad('WINDOW=99|RATE=0|LIMIT=1|COLOR=x ', 'INVALID_FORMAT'));
t('dup before sem', bad('WINDOW=1|WINDOW=2|RATE=99|LIMIT=1', 'INVALID_FORMAT'));

// --- value ranges ---
t('missing required', bad('WINDOW=1|RATE=0', 'INVALID_VALUE'));
t('window leading zero', bad('WINDOW=01|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('window 0', bad('WINDOW=0|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('window 61', bad('WINDOW=61|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('window 60 ok', ok('WINDOW=60|RATE=0|LIMIT=1', [{WINDOW:60,RATE:0,LIMIT:1}]));
t('rate 21', bad('WINDOW=1|RATE=21|LIMIT=1', 'INVALID_VALUE'));
t('rate 20 ok', ok('WINDOW=1|RATE=20|LIMIT=1', [{WINDOW:1,RATE:20,LIMIT:1}]));
t('limit 0', bad('WINDOW=1|RATE=0|LIMIT=0', 'INVALID_VALUE'));
t('limit 101', bad('WINDOW=1|RATE=0|LIMIT=1|'.slice(0,0)+'WINDOW=1|RATE=0|LIMIT=101', 'INVALID_VALUE'));
t('limit 100 ok', ok('WINDOW=1|RATE=0|LIMIT=100', [{WINDOW:1,RATE:0,LIMIT:100}]));
t('window empty', bad('WINDOW=|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('window negative', bad('WINDOW=-1|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('window non-numeric', bad('WINDOW=a|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('window plus prefix', bad('WINDOW=+1|RATE=0|LIMIT=1', 'INVALID_VALUE'));
t('duration negative', bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=-3', 'INVALID_VALUE'));
t('duration 0', bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=0', 'INVALID_VALUE'));
t('duration 151', bad('WINDOW=1|RATE=0|LIMIT=1|DURATION=151', 'INVALID_VALUE'));
t('duration 150 ok', ok('WINDOW=1|RATE=0|LIMIT=1|DURATION=150', [{WINDOW:1,RATE:0,LIMIT:1,DURATION:150}]));
t('duration leading zero ok', ok('WINDOW=1|RATE=0|LIMIT=1|DURATION=05', [{WINDOW:1,RATE:0,LIMIT:1,DURATION:5}]));

// --- prototype safety ---
t('proto-looking key is data', () => {
  const r = readInput('CONSTRUCTOR=y|WINDOW=1|RATE=0|LIMIT=1|PROTOTYPE=z');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.deepEqual(JSON.parse(JSON.stringify(r[0])), {WINDOW:1,RATE:0,LIMIT:1});
  assert.ok(Object.prototype.hasOwnProperty.call(r[0], 'WINDOW'));
});

// --- misc value typing ---
t('color stays string', ok('WINDOW=1|RATE=0|LIMIT=1|COLOR=007', [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'007'}]));
t('flags single', ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS=x', [{WINDOW:1,RATE:0,LIMIT:1,FLAGS:['x']}]));
t('flags empty -> []', ok('WINDOW=1|RATE=0|LIMIT=1|FLAGS=', [{WINDOW:1,RATE:0,LIMIT:1,FLAGS:[]}]));

console.log(`local checks: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
