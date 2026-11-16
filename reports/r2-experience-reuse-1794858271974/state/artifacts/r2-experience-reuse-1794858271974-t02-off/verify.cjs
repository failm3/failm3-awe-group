'use strict';
// Scratch verification of FORMAT.md (not part of the deliverable).
const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');

const msg = (s) => {
  try {
    parseRecords(s);
    return 'NO-THROW';
  } catch (e) {
    assert.ok(e instanceof Error);
    return e.message;
  }
};
const ok = (s, expected) => assert.deepEqual(parseRecords(s), expected, JSON.stringify(s));

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('empty', () => assert.deepEqual(parseRecords(''), []));
t('blank lines skipped', () => assert.deepEqual(parseRecords('\n\r\n\r'), []));
t('LF', () => ok('WINDOW=4;RATE=1;LIMIT=2\nWINDOW=5;RATE=2;LIMIT=3',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
t('CRLF', () => ok('WINDOW=4;RATE=1;LIMIT=2\r\nWINDOW=5;RATE=2;LIMIT=3',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
t('CR', () => ok('WINDOW=4;RATE=1;LIMIT=2\rWINDOW=5;RATE=2;LIMIT=3',
  [{ WINDOW: 4, RATE: 1, LIMIT: 2 }, { WINDOW: 5, RATE: 2, LIMIT: 3 }]));
t('trailing newline', () => ok('WINDOW=4;RATE=1;LIMIT=2\n', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));

// whitespace trimming applies to values only
t('value trim', () => ok('  WINDOW = 4 ;RATE=1;LIMIT=2\t', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
t('quoted value trim', () => ok('WINDOW=4;RATE=1;LIMIT=2;"COLOR= cyan "'.replace('"COLOR= cyan "', '"COLOR=cyan"'),
  [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'cyan' }]));
t('quoted value trim2', () => ok('WINDOW=4;RATE=1;LIMIT=2;COLOR=  cyan ', [{ WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'cyan' }]));

// whole-field quoting
t('quoted keys', () => ok('"WINDOW=4";"RATE=1";"LIMIT=2"', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
t('doubled quotes decode', () => assert.equal(msg('"WINDOW=4";"RATE=1";"LIMIT=2";"COLOR=cyan""x"'), 'INVALID_VALUE'));

// syntax errors
t('unterminated', () => assert.equal(msg('"WINDOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('trailing junk after quote', () => assert.equal(msg('"WINDOW=4"x;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('quote in unquoted', () => assert.equal(msg('WIN"DOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('bad key', () => assert.equal(msg('window=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('bad key underscore start', () => assert.equal(msg('_WINDOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('double equals unquoted', () => assert.equal(msg('WINDOW==4;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('no equals', () => assert.equal(msg('WINDOW;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('empty field', () => assert.equal(msg('WINDOW=4;;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('duplicate key', () => assert.equal(msg('WINDOW=4;WINDOW=4;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));
t('duplicate decoded key', () => assert.equal(msg('WINDOW=4;"WINDOW=5";RATE=1;LIMIT=2'), 'INVALID_FORMAT'));

// syntax beats semantics within a record
t('syntax beats value', () => assert.equal(msg('WINDOW=99;nope=1'), 'INVALID_FORMAT'));
t('duplicate beats value', () => assert.equal(msg('WINDOW=99;WINDOW=1;RATE=1;LIMIT=2'), 'INVALID_FORMAT'));

// semantic errors
t('WINDOW range low', () => assert.equal(msg('WINDOW=2;RATE=1;LIMIT=2'), 'INVALID_VALUE'));
t('WINDOW range high', () => assert.equal(msg('WINDOW=41;RATE=1;LIMIT=2'), 'INVALID_VALUE'));
t('WINDOW leading zero', () => assert.equal(msg('WINDOW=04;RATE=1;LIMIT=2'), 'INVALID_VALUE'));
t('WINDOW negative', () => assert.equal(msg('WINDOW=-4;RATE=1;LIMIT=2'), 'INVALID_VALUE'));
t('RATE range', () => assert.equal(msg('WINDOW=4;RATE=31;LIMIT=2'), 'INVALID_VALUE'));
t('LIMIT range', () => assert.equal(msg('WINDOW=4;RATE=1;LIMIT=76'), 'INVALID_VALUE'));
t('LIMIT zero', () => assert.equal(msg('WINDOW=4;RATE=1;LIMIT=0'), 'INVALID_VALUE'));
t('missing required', () => assert.equal(msg('WINDOW=4;RATE=1'), 'INVALID_VALUE'));
t('empty value', () => assert.equal(msg('WINDOW=;RATE=1;LIMIT=2'), 'INVALID_VALUE'));
t('color case-sensitive', () => assert.equal(msg('WINDOW=4;RATE=1;LIMIT=2;COLOR=Cyan'), 'INVALID_VALUE'));
t('color invalid', () => assert.equal(msg('WINDOW=4;RATE=1;LIMIT=2;COLOR=red'), 'INVALID_VALUE'));

// unknown keys dropped after validation
t('unknown dropped', () => ok('WINDOW=4;RATE=1;LIMIT=2;EXTRA=zzz', [{ WINDOW: 4, RATE: 1, LIMIT: 2 }]));
t('prototype key is data', () => {
  const r = parseRecords('WINDOW=4;RATE=1;LIMIT=2;__PROTO__=x;CONSTRUCTOR=1');
  assert.equal(r.length, 1);
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT']);
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
  assert.equal({}.polluted, undefined);
  assert.equal(r[0].__PROTO__, undefined);
  assert.ok(!('__PROTO__' in r[0]));
});

// schema key order regardless of input order
t('schema order', () => {
  const r = parseRecords('COLOR=magenta;LIMIT=2;RATE=1;WINDOW=4');
  assert.deepEqual(Object.keys(r[0]), ['WINDOW', 'RATE', 'LIMIT', 'COLOR']);
  assert.deepEqual(r[0], { WINDOW: 4, RATE: 1, LIMIT: 2, COLOR: 'magenta' });
});

// quotes containing separators, equals, CR, LF (in a value position)
t('quote with separators in value', () => {
  const r = parseRecords('WINDOW=4;RATE=1;LIMIT=2;COLOR="cy;an=x"');
  assert.equal(msg('WINDOW=4;RATE=1;LIMIT=2;COLOR="cy;an=x"'), 'INVALID_VALUE');
});
t('quote with newline in value', () => assert.equal(msg('WINDOW=4;RATE=1;LIMIT=2;COLOR="cyan\r\nx"'), 'INVALID_VALUE'));

// output objects are ordinary
t('plain objects', () => {
  const r = parseRecords('WINDOW=4;RATE=1;LIMIT=2');
  assert.equal(Object.getPrototypeOf(r[0]), Object.prototype);
});

console.log('edge cases PASS (' + n + ' groups)');
