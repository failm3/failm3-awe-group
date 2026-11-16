'use strict';
const { parseBundle } = require('./adapters/bundle.cjs');
const t = (label, fn) => { try { console.log(label, '=>', JSON.stringify(fn())); } catch (e) { console.log(label, '=> THROW', e.message); } };

// --- structural / record separation
t('empty', () => parseBundle(''));
t('single', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;COLOR=white'));
t('lf', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\nWINDOW=3;RATE=0;LIMIT=1'));
t('crlf', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\r\nWINDOW=3;RATE=0;LIMIT=1'));
t('cr', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\rWINDOW=3;RATE=0;LIMIT=1'));
t('no-final-eol', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\nWINDOW=3;RATE=1;LIMIT=2'));
t('trailing-eol', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\n'));
t('trailing-crlf', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\r\n'));
t('blank-record-lf', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\n\nWINDOW=4;RATE=2;LIMIT=3'));
t('blank-record-trail', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2\n\n'));
t('non-string', () => parseBundle(undefined));

// --- quoting
t('quoted-whole-field', () => parseBundle('"WINDOW=2";"RATE=1";"LIMIT=2"'));
t('quoted-field-space-only', () => parseBundle('"LIMIT=2";"RATE=1";"WINDOW=7";COLOR=black'));
t('quoted-escaped-quote', () => parseBundle('"COLOR=a""b";WINDOW=2;RATE=1;LIMIT=2'));
t('quoted-sep-inside', () => parseBundle('"WINDOW=2;RATE=1;LIMIT=2"'));
t('quoted-crlf-inside', () => parseBundle('"COLOR= white \r\n ";WINDOW=2;RATE=1;LIMIT=2'));
t('quoted-crlf-between-records', () => parseBundle('"LIMIT=2";"RATE=1";"WINDOW=2"\r\nWINDOW=5;RATE=3;LIMIT=4'));
t('quoted-eq-inside', () => parseBundle('"WINDOW=2=3";RATE=1;LIMIT=2'));
t('quoted-empty-value', () => parseBundle('"COLOR="";WINDOW=2;RATE=1;LIMIT=2'));
t('unterminated', () => parseBundle('"WINDOW=2'));
t('after-close-quote', () => parseBundle('"WINDOW=2"x;RATE=1;LIMIT=2'));
t('quote-in-unquoted', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;COLOR=wh"ite'));
t('quote-mid-field', () => parseBundle('WIN"DOW=2;RATE=1;LIMIT=2'));

// --- field syntax
t('two-equals', () => parseBundle('WINDOW=2=3;RATE=1;LIMIT=2'));
t('no-equals', () => parseBundle('WINDOW2;RATE=1;LIMIT=2'));
t('empty-field-mid', () => parseBundle('WINDOW=2;;RATE=1;LIMIT=2'));
t('dangling-semicolon', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;'));
t('bad-key-lower', () => parseBundle('window=2;RATE=1;LIMIT=2'));
t('bad-key-digit-first', () => parseBundle('1WINDOW=2;RATE=1;LIMIT=2'));
t('bad-key-hyphen', () => parseBundle('WIN-DOW=2;RATE=1;LIMIT=2'));
t('bad-key-space', () => parseBundle(' WINDOW=2;RATE=1;LIMIT=2'));

// --- whitespace policy (VALUE only)
t('value-trim', () => parseBundle('WINDOW=  2  ;RATE= 1 ;LIMIT=2'));
t('key-not-trimmed', () => parseBundle('" WINDOW=2";RATE=1;LIMIT=2'));
t('value-inner-space', () => parseBundle('WINDOW=2 0;RATE=1;LIMIT=2'));

// --- duplicates
t('dup-known', () => parseBundle('WINDOW=2;WINDOW=2;RATE=1;LIMIT=2'));
t('dup-after-trim', () => parseBundle('"WINDOW = 2";WINDOW=2;RATE=1;LIMIT=2'));
t('dup-unknown', () => parseBundle('ZZ=1;ZZ=2;WINDOW=2;RATE=1;LIMIT=2'));

// --- unknown keys / prototype safety
t('unknown-dropped', () => parseBundle('WINDOW=2;ZZ=9;RATE=1;LIMIT=2;COLOR=black'));
t('proto-key', () => { const r = parseBundle('PROTOTYPE=x;CONSTRUCTOR=1;WINDOW=2;RATE=1;LIMIT=2'); return [r, Object.getPrototypeOf(r[0]) === Object.prototype, Object.keys(r[0])]; });
t('proto-key-invalid-value-still-dropped', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;TOSTRING=not-an-int'));

// --- integer grammar
t('bounds-ok', () => parseBundle('WINDOW=1;RATE=30;LIMIT=25'));
t('bounds-ok-upper-window', () => parseBundle('WINDOW=50;RATE=0;LIMIT=1'));
t('window-too-big', () => parseBundle('WINDOW=51;RATE=1;LIMIT=2'));
t('window-zero', () => parseBundle('WINDOW=0;RATE=1;LIMIT=2'));
t('rate-too-big', () => parseBundle('WINDOW=2;RATE=31;LIMIT=2'));
t('limit-zero', () => parseBundle('WINDOW=2;RATE=1;LIMIT=0'));
t('limit-too-big', () => parseBundle('WINDOW=2;RATE=1;LIMIT=26'));
t('leading-zero', () => parseBundle('WINDOW=02;RATE=1;LIMIT=2'));
t('negative', () => parseBundle('WINDOW=-2;RATE=1;LIMIT=2'));
t('plus-sign', () => parseBundle('WINDOW=+2;RATE=1;LIMIT=2'));
t('hex', () => parseBundle('WINDOW=0x10;RATE=1;LIMIT=2'));
t('empty-value', () => parseBundle('WINDOW=;RATE=1;LIMIT=2'));
t('space-only-value', () => parseBundle('"WINDOW=  ";RATE=1;LIMIT=2'));

// --- COLOR
t('color-black', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;COLOR=black'));
t('color-case-sensitive', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;COLOR=White'));
t('color-numeric', () => parseBundle('WINDOW=2;RATE=1;LIMIT=2;COLOR=1'));
t('color-empty', () => parseBundle('"WINDOW=2";"RATE=1";"LIMIT=2";"COLOR="'));

// --- required fields / precedence
t('missing-limit', () => parseBundle('WINDOW=2;RATE=1'));
t('missing-all', () => parseBundle('COLOR=white'));
t('format-before-semantic', () => parseBundle('WINDOW=999;COLOR=bad'));
t('syntax-beats-semantic', () => parseBundle('WINDOW=999;BAD'));
t('semantic-order-window-first', () => parseBundle('RATE=99;WINDOW=999;LIMIT=0'));
