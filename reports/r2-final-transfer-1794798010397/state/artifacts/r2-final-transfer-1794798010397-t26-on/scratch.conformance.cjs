'use strict';
// Scratch conformance checks derived from FORMAT.md (does not touch visible.test.cjs)
const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');

let failures = 0;

function show(input) {
  try { return JSON.stringify(parseExport(input)); } catch (e) { return 'threw ' + e.message; }
}

function ok(input, expected, label) {
  try {
    assert.deepEqual(parseExport(input), expected);
  } catch (e) {
    failures++;
    console.error('FAIL ok  [' + label + '] ' + JSON.stringify(input) + '\n   got:  ' + show(input) + '\n   want: ' + JSON.stringify(expected));
  }
}

function bad(input, message, label) {
  try {
    parseExport(input);
  } catch (e) {
    if (!(e instanceof Error) || e.constructor !== Error || e.message !== message) {
      failures++;
      console.error('FAIL bad [' + label + '] ' + JSON.stringify(input) + ' -> threw ' + e.constructor.name + '(' + e.message + '), want Error(' + message + ')');
    }
    return;
  }
  failures++;
  console.error('FAIL bad [' + label + '] ' + JSON.stringify(input) + ' -> did not throw, want ' + message);
}

// ---- empty / basic
ok('', [], 'empty string');
ok('WINDOW=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'minimal');
ok('WINDOW=30;RATE=0;LIMIT=1', [{ WINDOW: 30, RATE: 0, LIMIT: 1 }], 'visible case 2');

// ---- record separators
ok('WINDOW=4;RATE=1;LIMIT=2\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'trailing LF');
ok('WINDOW=4;RATE=1;LIMIT=2\r\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'trailing CRLF');
ok('WINDOW=4;RATE=1;LIMIT=2\r', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'trailing CR');
ok('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'LF multi');
ok('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3\r\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'CRLF multi');
ok('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3\r', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'CR multi');
ok('WINDOW=4;RATE=1;LIMIT=2\n\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'double trailing LF');
ok('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'LF final');

// ---- whitespace policy: trim VALUE only
ok('WINDOW= 4 ;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'trim numeric value');
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR= green ', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'green' }], 'trim color value');
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR=\tgreen\t', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'green' }], 'trim tabs');
bad('WINDOW =4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'key not trimmed');
bad('WINDOW=4;RATE=1;LIMIT=2;COLOR=Green', 'INVALID_VALUE', 'color case-sensitive');

// ---- ranges and canonical integers
ok('WINDOW=3;RATE=0;LIMIT=1', [{ WINDOW: 3, RATE: 0, LIMIT: 1 }], 'lower bounds');
ok('WINDOW=30;RATE=30;LIMIT=75', [{ WINDOW: 30, RATE: 30, LIMIT: 75 }], 'upper bounds');
bad('WINDOW=2;RATE=1;LIMIT=1', 'INVALID_VALUE', 'window too low');
bad('WINDOW=31;RATE=1;LIMIT=1', 'INVALID_VALUE', 'window too high');
bad('WINDOW=4;RATE=31;LIMIT=1', 'INVALID_VALUE', 'rate too high');
bad('WINDOW=4;RATE=1;LIMIT=0', 'INVALID_VALUE', 'limit too low');
bad('WINDOW=4;RATE=1;LIMIT=76', 'INVALID_VALUE', 'limit too high');
bad('WINDOW=04;RATE=1;LIMIT=1', 'INVALID_VALUE', 'leading zero');
bad('WINDOW=00;RATE=01;LIMIT=1', 'INVALID_VALUE', 'leading zeros again');
bad('WINDOW=+4;RATE=1;LIMIT=1', 'INVALID_VALUE', 'plus sign');
bad('WINDOW=-4;RATE=1;LIMIT=1', 'INVALID_VALUE', 'minus sign');
bad('WINDOW=4.0;RATE=1;LIMIT=1', 'INVALID_VALUE', 'decimal');
bad('WINDOW=1e1;RATE=1;LIMIT=1', 'INVALID_VALUE', 'exponent');
bad('WINDOW=0x10;RATE=1;LIMIT=1', 'INVALID_VALUE', 'hex');
bad('WINDOW=;RATE=1;LIMIT=1', 'INVALID_VALUE', 'empty value');
bad('RATE=1;LIMIT=1', 'INVALID_VALUE', 'missing WINDOW');
bad('WINDOW=4;LIMIT=1', 'INVALID_VALUE', 'missing RATE');
bad('WINDOW=4;RATE=1', 'INVALID_VALUE', 'missing LIMIT');
bad('WINDOW=4;RATE=1;LIMIT=1;COLOR=blue', 'INVALID_VALUE', 'bad enum');

// ---- quoting
ok('"WINDOW=4";"RATE=1";"LIMIT=2"', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'all fields quoted');
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR="green"', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'green' }], 'quoted value');
ok('"WINDOW"=4;RATE=1;LIMIT=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'quoted key only');
ok('"WINDOW=4";RATE=1;LIMIT=2\n"WINDOW=5";RATE=2;LIMIT=3', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }], 'quoted newline-split');
bad('WINDOW="4"x;RATE=1;LIMIT=1', 'INVALID_FORMAT', 'chars after closing quote');
bad('WINDOW="4"";RATE=1;LIMIT=1', 'INVALID_FORMAT', 'trailing junk after quote');
bad('WINDOW="4;RATE=1;LIMIT=1', 'INVALID_FORMAT', 'unterminated quote');
bad('"WINDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'unterminated whole-record quote');
bad('WIN"DOW=4;RATE=1;LIMIT=1', 'INVALID_FORMAT', 'quote start mid field');
bad('WINDOW=4"5;RATE=1;LIMIT=1', 'INVALID_FORMAT', 'quote inside value');
bad('WINDOW=4"";RATE=1;LIMIT=1', 'INVALID_FORMAT', 'empty quoted then junk');
bad('WINDOW="4\r\n";RATE=1;LIMIT=1', 'INVALID_VALUE', 'CRLF inside quotes -> trimmed value invalid');
// quoted field spanning a record boundary: the newline is data, so this is one record
bad('WINDOW=4;RATE=1;LIMIT=2;"COLOR=gr\n""een"', 'INVALID_VALUE', 'LF+quotes inside quoted field');
bad('"COLOR=gr""een";WINDOW=4;RATE=1;LIMIT=2', 'INVALID_VALUE', 'decoded quote breaks enum');

// ---- syntax errors
bad('WINDOW=4;RATE=1;LIMIT=2;', 'INVALID_FORMAT', 'trailing separator');
bad('WINDOW=4;;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'empty field');
bad('WINDOW=4;RATE=1=2;LIMIT=2', 'INVALID_FORMAT', 'two equals');
bad('window=4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'lowercase key');
bad('1WINDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'key starts with digit');
bad('_WINDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'key starts with underscore');
bad('WINDOW=4;RATE=1;LIMIT=2;WINDOW=5', 'INVALID_FORMAT', 'duplicate key');
bad('WINDOW=4;RATE=1;LIMIT=2;"WINDOW=5"', 'INVALID_FORMAT', 'duplicate via quoted field');
bad('WINDOW=4;NOEQUALS;LIMIT=2', 'INVALID_FORMAT', 'field without equals');
bad('\nWINDOW=4;RATE=1;LIMIT=2', 'INVALID_FORMAT', 'leading newline -> empty record');
bad('WINDOW=4;RATE=1;LIMIT=2\n\nWINDOW=5;RATE=2;LIMIT=3', 'INVALID_FORMAT', 'blank line mid-text');

// ---- unknown keys and prototype safety
ok('WINDOW=4;RATE=1;LIMIT=2;EXTRA=1', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'unknown dropped');
ok('WINDOW=4;RATE=1;LIMIT=2;__proto__=x;constructor=y;toString=z', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'proto-looking keys dropped');
ok('WINDOW=4;RATE=1;LIMIT=2;COLOR=amber', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'amber' }], 'amber accepted');
ok('COLOR=green;LIMIT=2;RATE=1;WINDOW=4', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'green' }], 'schema insertion order');
ok('WINDOW=4;RATE=1;LIMIT=2;AA=1;BB=2', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }], 'multiple unknowns dropped');
{
  const r = parseExport('WINDOW=4;RATE=1;LIMIT=2;__proto__=polluted');
  try {
    assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
    assert.equal({}.polluted, undefined);
    assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT']);
  } catch (e) {
    failures++;
    console.error('FAIL prototype safety:', e.message);
  }
}

// ---- precedence within a record
bad('WINDOW=99;RATE=1;BADKEY=1', 'INVALID_FORMAT', 'syntax before value error');
bad('WINDOW=99;RATE=1;LIMIT=1;WINDOW=1', 'INVALID_FORMAT', 'duplicate before value error');
bad('WINDOW=abc;RATE=1;LIMIT=1', 'INVALID_VALUE', 'non-numeric value');
bad('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=99;RATE=1;LIMIT=1', 'INVALID_VALUE', 'second record invalid');

// ---- input type guard
bad(null, 'INVALID_FORMAT', 'null input');
bad(undefined, 'INVALID_FORMAT', 'undefined input');
bad(42, 'INVALID_FORMAT', 'number input');

console.log(failures === 0 ? 'scratch PASS' : 'scratch FAIL (' + failures + ')');
process.exitCode = failures === 0 ? 0 : 1;
