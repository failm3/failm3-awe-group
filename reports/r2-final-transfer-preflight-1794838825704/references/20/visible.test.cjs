const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');
assert.deepEqual(parseRecords("WINDOW=4;RATE=1;LIMIT=2"), [{"WINDOW":4,"RATE":1,"LIMIT":2}]);
assert.deepEqual(parseRecords("WINDOW=20;RATE=0;LIMIT=1"), [{"WINDOW":20,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
