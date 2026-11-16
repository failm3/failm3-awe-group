'use strict';
// Independent verification of lib/roster.cjs against FORMAT.md (not a test file
// shipped with the task; visible.test.cjs is left untouched).
const assert = require('node:assert/strict');
const { parseRosterExport: p } = require('./lib/roster.cjs');

let okN = 0;
let badN = 0;
const bad = (s) => {
  assert.throws(
    () => p(s),
    (e) => e instanceof Error && e.message === 'INVALID_FORMAT',
    'should throw INVALID_FORMAT: ' + JSON.stringify(s),
  );
  badN++;
};
const ok = (s, exp) => {
  assert.deepEqual(p(s), exp, 'should parse: ' + JSON.stringify(s));
  okN++;
};

// Empty input
ok('', []);

// Basic rows, trailing separator does not create an extra row
ok('a;b\n1;2\n', [['a', 'b'], ['1', '2']]);
ok('a;b', [['a', 'b']]);
ok('a;b\n1;2', [['a', 'b'], ['1', '2']]);
ok('a;b\r\n1;2\r\n', [['a', 'b'], ['1', '2']]);

// Blank line is a record with one empty field
ok('a;b\n\n1;2\n', [['a', 'b'], [''], ['1', '2']]);

// Empty fields, including trailing
ok(';', [['', '']]);
ok('a;;c', [['a', '', 'c']]);
ok('a;b;', [['a', 'b', '']]);
ok(';a', [['', 'a']]);

// Quoted fields
ok('"";""', [['', '']]);
ok('"a;b";c', [['a;b', 'c']]);
ok('"line1\nline2";x', [['line1\nline2', 'x']]);
ok('"line1\r\nline2";x', [['line1\r\nline2', 'x']]);
ok('"say ""hi""";z', [['say "hi"', 'z']]);   // "" escape
ok('""""', [['"']]);                          // one literal quote
ok('x;"a""b"', [['x', 'a"b']]);
ok('"a"""', [['a"']]);

// UTF-8 content
ok('ünï;cødé', [['ünï', 'cødé']]);
ok('café;日本\n"x""y";z\r\n', [['café', '日本'], ['x"y', 'z']]);

// Malformed input must throw Error('INVALID_FORMAT')
bad('"abc');          // unterminated quote
bad('"abc\ndef');     // unterminated across newline
bad('"ab"c');         // characters after closing quote
bad('"ab" x');        // space after closing quote
bad('ab"cd');         // quote inside unquoted field
bad('a"b;c');         // quote inside unquoted field
bad('a;b"');          // quote inside unquoted field (last)
bad('"a"""b');        // text after closing quote

console.log(`edge cases PASS (${okN} ok / ${badN} invalid)`);
