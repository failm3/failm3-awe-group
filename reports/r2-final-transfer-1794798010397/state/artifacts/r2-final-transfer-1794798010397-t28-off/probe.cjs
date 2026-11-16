const { readInput } = require('./lib/input.cjs');
let fail = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fail++; console.log('FAIL', label, 'got', a, 'want', b); }
};
const thr = (label, fn, msg) => {
  try { const v = fn(); fail++; console.log('FAIL', label, 'expected throw', msg, 'got', JSON.stringify(v)); }
  catch (e) { if (e.message !== msg || !(e instanceof Error)) { fail++; console.log('FAIL', label, 'threw', e.message, 'want', msg); } }
};
const R = (s) => () => readInput(s);
const rec = {WINDOW:3,RATE:1,LIMIT:2};

eq('empty', readInput(''), []);
eq('basic', readInput('WINDOW=3;RATE=1;LIMIT=2'), [rec]);
eq('lf/2', readInput('WINDOW=3;RATE=1;LIMIT=2\nWINDOW=4;RATE=2;LIMIT=3'), [rec,{WINDOW:4,RATE:2,LIMIT:3}]);
eq('crlf/2', readInput('WINDOW=3;RATE=1;LIMIT=2\r\nWINDOW=4;RATE=2;LIMIT=3'), [rec,{WINDOW:4,RATE:2,LIMIT:3}]);
eq('cr/2', readInput('WINDOW=3;RATE=1;LIMIT=2\rWINDOW=4;RATE=2;LIMIT=3'), [rec,{WINDOW:4,RATE:2,LIMIT:3}]);
eq('mixed eol', readInput('WINDOW=3;RATE=1;LIMIT=2\r\nWINDOW=4;RATE=2;LIMIT=3\rWINDOW=5;RATE=3;LIMIT=4\n'), [rec,{WINDOW:4,RATE:2,LIMIT:3},{WINDOW:5,RATE:3,LIMIT:4}]);
eq('trailing lf', readInput('WINDOW=3;RATE=1;LIMIT=2\n'), [rec]);
eq('no trailing eol', readInput('WINDOW=3;RATE=1;LIMIT=2'), [rec]);

// quoting
eq('quoted whole', readInput('"WINDOW=3";"RATE=1";"LIMIT=2"'), [rec]);
eq('quoted one field', readInput('"WINDOW=3";RATE=1;LIMIT=2'), [rec]);
eq('quoted key=val', readInput('"WINDOW"=3;RATE=1;LIMIT=2'), [rec]);
eq('quoted value w/ eq', readInput('WINDOW=3;RATE=1;LIMIT=2;"X=a=b"'), [{...rec, X:'a=b'}]);
eq('quoted value w/ sep+nl', readInput('WINDOW=3;RATE=1;LIMIT=2;"N=a;b\r\nc"'), [{...rec, N:'a;b\r\nc'}]);
eq('doubled quote', readInput('WINDOW=3;RATE=1;LIMIT=2;"N=a""b"'), [{...rec, N:'a"b'}]);
eq('quoted empty value', readInput('WINDOW=3;RATE=1;LIMIT=2;"X="'), [{...rec, X:''}]);
eq('quoted then eol', readInput('"WINDOW=3";RATE=1;LIMIT=2\n"WINDOW=4";RATE=2;LIMIT=3'), [rec,{WINDOW:4,RATE:2,LIMIT:3}]);
eq('quoted last at eof', readInput('WINDOW=3;RATE=1;"LIMIT=2"'), [rec]);

// errors
thr('unterminated', R('WINDOW=3;RATE=1;LIMIT=2;"X'), 'INVALID_FORMAT');
thr('unterminated in record', R('"WINDOW=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
thr('quote in unquoted', R('WINDOW=3;RATE=1;LIMIT=2;X=a"b"'), 'INVALID_FORMAT');
thr('trailing after close', R('WINDOW=3;RATE=1;LIMIT=2;"X"a'), 'INVALID_FORMAT');
thr('two equals unquoted', R('WINDOW=3;RATE=1;LIMIT=2;X=a=b'), 'INVALID_FORMAT');
thr('no equals', R('WINDOW=3;RATE=1;LIMIT=2;X'), 'INVALID_FORMAT');
thr('bad key lower', R('window=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
thr('bad key digit lead', R('1W=3;WINDOW=3;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
thr('empty field', R('WINDOW=3;;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
thr('dup', R('WINDOW=3;WINDOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
thr('dup quoted vs not', R('WINDOW=3;"WINDOW"=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT');
thr('untrimmed value', R('WINDOW=3;RATE=1;LIMIT=2;X= a'), 'INVALID_FORMAT');
thr('trailing space value', R('WINDOW=3;RATE=1;LIMIT=2;X=a '), 'INVALID_FORMAT');
thr('space around eq', R('WINDOW=3;RATE=1;LIMIT=2;X =a'), 'INVALID_FORMAT');
thr('syntax beats semantic', R('WINDOW=99;RATE=1;LIMIT=2;X=a"b'), 'INVALID_FORMAT');
thr('missing WINDOW', R('RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('missing RATE', R('WINDOW=3;LIMIT=2'), 'INVALID_VALUE');
thr('missing LIMIT', R('WINDOW=3;RATE=1'), 'INVALID_VALUE');
thr('window leading zero', R('WINDOW=03;RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('window 1', R('WINDOW=1;RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('window 51', R('WINDOW=51;RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('window nonnumeric', R('WINDOW=x;RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('window empty', R('WINDOW=;RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('window quoted bad', R('"WINDOW=9";RATE=1;LIMIT=2'), 'INVALID_VALUE');
thr('rate 11', R('WINDOW=3;RATE=11;LIMIT=2'), 'INVALID_VALUE');
thr('rate leading zero', R('WINDOW=3;RATE=01;LIMIT=2'), 'INVALID_VALUE');
thr('limit 0', R('WINDOW=3;RATE=1;LIMIT=0'), 'INVALID_VALUE');
thr('limit 126', R('WINDOW=3;RATE=1;LIMIT=126'), 'INVALID_VALUE');
thr('error is Error', R('WINDOW=3;RATE=1;LIMIT=126'), 'INVALID_VALUE');

// bounds accepted
eq('bounds min', readInput('WINDOW=2;RATE=0;LIMIT=1'), [{WINDOW:2,RATE:0,LIMIT:1}]);
eq('bounds max', readInput('WINDOW=50;RATE=10;LIMIT=125'), [{WINDOW:50,RATE:10,LIMIT:125}]);

// unknown retention order + known order
eq('unknown order', readInput('Z_1=hi;WINDOW=3;B_2=x;RATE=1;A_3=y;LIMIT=2'), [{WINDOW:3,RATE:1,LIMIT:2,Z_1:'hi',B_2:'x',A_3:'y'}]);
eq('known order fixed', readInput('LIMIT=2;FLAGS=f;COLOR=c;RATE=1;WINDOW=3'), [{WINDOW:3,RATE:1,LIMIT:2,COLOR:'c',FLAGS:['f']}]);
eq('keys order check', Object.keys(readInput('Z=1;LIMIT=2;RATE=1;WINDOW=3;Y=2')[0]), ['WINDOW','RATE','LIMIT','Z','Y']);

// prototype safety
(() => {
  const o = readInput('__proto__=x;constructor=y;WINDOW=3;RATE=1;LIMIT=2')[0];
  eq('proto is data', [Object.getPrototypeOf(o) === Object.prototype, Object.getOwnPropertyDescriptor(o,'__proto__').value, o.constructor], [true,'x','y']);
  eq('proto keys order', Object.keys(o), ['WINDOW','RATE','LIMIT','__proto__','constructor']);
  eq('proto no pollution', ({}).x, undefined);
})();

console.log(fail === 0 ? 'ALL PROBES PASS' : fail + ' FAILURES');
