const assert = require('node:assert/strict');
const { decodeSeparated } = require('./core/decoder.cjs');
assert.deepEqual(decodeSeparated("WINDOW=3|RATE=1|LIMIT=2|DURATION=5"), [{"WINDOW":3,"RATE":1,"LIMIT":2,"DURATION":5}]);
assert.deepEqual(decodeSeparated("WINDOW=50|RATE=0|LIMIT=1"), [{"WINDOW":50,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
