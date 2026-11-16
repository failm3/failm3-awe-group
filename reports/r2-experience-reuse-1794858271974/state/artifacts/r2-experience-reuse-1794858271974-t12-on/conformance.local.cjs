const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
const F = 'INVALID_FORMAT', V = 'INVALID_VALUE';
let pass = 0, fail = 0;
function eq(label, fn, expected) {
  try { assert.deepEqual(fn(), expected); pass++; }
  catch (e) { fail++; console.log('FAIL eq', label, '=>', e.message); }
}
function thr(label, fn, msg) {
  try { fn(); fail++; console.log('FAIL thr', label, '- no throw'); }
  catch (e) {
    if (e.message === msg) pass++;
    else { fail++; console.log('FAIL thr', label, '->', JSON.stringify(e.message), 'want', msg); }
  }
}

eq('empty', () => decodeSeparated(''), []);
eq('basic', () => decodeSeparated('WINDOW=2;RATE=1;LIMIT=2'), [{WINDOW:2,RATE:1,LIMIT:2}]);
eq('lf', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1\nWINDOW=2;RATE=0;LIMIT=1'), [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:0,LIMIT:1}]);
eq('crlf', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1\r\nWINDOW=2;RATE=0;LIMIT=1'), [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:0,LIMIT:1}]);
eq('cr', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1\rWINDOW=2;RATE=0;LIMIT=1'), [{WINDOW:1,RATE:0,LIMIT:1},{WINDOW:2,RATE:0,LIMIT:1}]);
eq('trailing newline', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1\n'), [{WINDOW:1,RATE:0,LIMIT:1}]);

eq('quoted whole field', () => decodeSeparated('"WINDOW=1;RATE=0;LIMIT=1"'), [{WINDOW:1,RATE:0,LIMIT:1}]);
eq('quoted value sep', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR="a;b=c"'), [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a;b=c'}]);
eq('quote escape', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR="a""b"'), [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a"b'}]);
eq('quoted CRLF', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR="a\r\nb"'), [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a\r\nb'}]);
eq('quoted key', () => decodeSeparated('"WINDOW"=1;"RATE"=0;"LIMIT"=1'), [{WINDOW:1,RATE:0,LIMIT:1}]);
thr('unterminated', () => decodeSeparated('WINDOW=1;RATE=0;COLOR="abc'), F);
thr('after closing quote', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR="a"b'), F);
thr('quote in unquoted', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR=a"b'), F);
thr('quote then junk', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR=""x'), F);

thr('trailing semicolon', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;'), F);
thr('leading semicolon', () => decodeSeparated(';WINDOW=1;RATE=0;LIMIT=1'), F);
thr('blank line', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1\n\nWINDOW=1;RATE=0;LIMIT=1'), F);
thr('double eq unquoted', () => decodeSeparated('WINDOW=1=1;RATE=0;LIMIT=1'), F);
thr('no eq', () => decodeSeparated('WINDOW;RATE=0;LIMIT=1'), F);
eq('double eq quoted', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR="a=b"'), [{WINDOW:1,RATE:0,LIMIT:1,COLOR:'a=b'}]);

thr('bad key lower', () => decodeSeparated('window=1;RATE=0;LIMIT=1'), F);
thr('bad key digit', () => decodeSeparated('W1=1;WINDOW=1;RATE=0;LIMIT=1'), F);
thr('bad key underscore', () => decodeSeparated('_W=1;WINDOW=1;RATE=0;LIMIT=1'), F);
eq('key digits/underscore ok', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;X_9=z'), [{WINDOW:1,RATE:0,LIMIT:1,X_9:'z'}]);

thr('dup known', () => decodeSeparated('WINDOW=1;WINDOW=1;RATE=0;LIMIT=1'), F);
thr('dup unknown', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;X=a;X=b'), F);
thr('dup via quotes', () => decodeSeparated('WINDOW=1;"WINDOW"=1;RATE=0;LIMIT=1'), F);

thr('space in value', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR= a'), F);
thr('trailing space value', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR=a '), F);
thr('quoted padded value', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;COLOR=" a "'), F);
thr('space around key', () => decodeSeparated('WINDOW =1;RATE=0;LIMIT=1'), F);

thr('missing LIMIT', () => decodeSeparated('WINDOW=1;RATE=0'), V);
thr('missing WINDOW', () => decodeSeparated('RATE=0;LIMIT=1'), V);
thr('window 0', () => decodeSeparated('WINDOW=0;RATE=0;LIMIT=1'), V);
thr('window 41', () => decodeSeparated('WINDOW=41;RATE=0;LIMIT=1'), V);
thr('window lead zero', () => decodeSeparated('WINDOW=01;RATE=0;LIMIT=1'), V);
thr('rate 11', () => decodeSeparated('WINDOW=1;RATE=11;LIMIT=1'), V);
thr('rate negative', () => decodeSeparated('WINDOW=1;RATE=-1;LIMIT=1'), V);
thr('rate plus', () => decodeSeparated('WINDOW=1;RATE=+1;LIMIT=1'), V);
thr('rate non-numeric', () => decodeSeparated('WINDOW=1;RATE=x;LIMIT=1'), V);
thr('limit 0', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=0'), V);
thr('limit 26', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT=26'), V);
thr('limit empty', () => decodeSeparated('WINDOW=1;RATE=0;LIMIT='), V);
thr('window float', () => decodeSeparated('WINDOW=1.0;RATE=0;LIMIT=1'), V);
thr('window hex', () => decodeSeparated('WINDOW=0x10;RATE=0;LIMIT=1'), V);

thr('syntax before whitespace-order', () => decodeSeparated('RATE=0;LIMIT=1;COLOR= b'), F);
thr('syntax before range', () => decodeSeparated('WINDOW=99;RATE=0;LIMIT=1;COLOR= b'), F);

eq('color+flags', () => decodeSeparated('WINDOW=1;RATE=2;LIMIT=3;COLOR=red;FLAGS=a,b'), [{WINDOW:1,RATE:2,LIMIT:3,COLOR:'red',FLAGS:['a','b']}]);
eq('flags empty', () => decodeSeparated('WINDOW=1;RATE=2;LIMIT=3;FLAGS='), [{WINDOW:1,RATE:2,LIMIT:3,FLAGS:[]}]);
eq('unknown retained', () => decodeSeparated('EXTRA=hello;WINDOW=1;RATE=2;LIMIT=3;COLOR=red'), [{WINDOW:1,RATE:2,LIMIT:3,COLOR:'red',EXTRA:'hello'}]);
eq('known then unknown order', () => decodeSeparated('Z=1;COLOR=c;Y=2;WINDOW=1;RATE=2;LIMIT=3'), [{WINDOW:1,RATE:2,LIMIT:3,COLOR:'c',Z:'1',Y:'2'}]);
eq('insertion order', () => Object.keys(decodeSeparated('Z=1;COLOR=c;Y=2;WINDOW=1;RATE=2;LIMIT=3')[0]), ['WINDOW','RATE','LIMIT','COLOR','Z','Y']);
eq('plain prototype', () => Object.getPrototypeOf(decodeSeparated('WINDOW=1;RATE=0;LIMIT=1')[0]) === Object.prototype, true);
eq('own keys count', () => Object.keys(decodeSeparated('WINDOW=1;RATE=0;LIMIT=1')[0]).length, 3);

// prototype-looking unknown key must be data only
{
  const o = decodeSeparated('WINDOW=1;RATE=0;LIMIT=1;__PROTO__=x;constructor=y')[0];
  const ok = Object.getPrototypeOf(o) === Object.prototype
    && o.__PROTO__ === 'x' && o.constructor === 'y'
    && Object.keys(o).join(',') === 'WINDOW,RATE,LIMIT,__PROTO__,constructor';
  if (ok) pass++; else { fail++; console.log('FAIL proto-looking keys', JSON.stringify(Object.keys(o))); }
}

console.log(`pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);
