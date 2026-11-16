const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
assert.deepEqual(decodeSeparated("WINDOW=4;RATE=1;LIMIT=2;COLOR=teal"), [{"WINDOW":4,"RATE":1,"LIMIT":2,"COLOR":"teal"}]);
assert.deepEqual(decodeSeparated("WINDOW=60;RATE=0;LIMIT=1"), [{"WINDOW":60,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
