const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
assert.deepEqual(decodeSeparated("WINDOW=2;RATE=1;LIMIT=2"), [{"WINDOW":2,"RATE":1,"LIMIT":2}]);
assert.deepEqual(decodeSeparated("WINDOW=40;RATE=0;LIMIT=1"), [{"WINDOW":40,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
