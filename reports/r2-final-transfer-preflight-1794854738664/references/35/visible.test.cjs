const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
assert.deepEqual(decodeSeparated("WINDOW=4|RATE=1|LIMIT=2|FLAGS=fast,safe"), [{"WINDOW":4,"RATE":1,"LIMIT":2,"FLAGS":["fast","safe"]}]);
assert.deepEqual(decodeSeparated("WINDOW=20|RATE=0|LIMIT=1"), [{"WINDOW":20,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
