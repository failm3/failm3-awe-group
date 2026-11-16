const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');
assert.deepEqual(parseRecords("WINDOW=3|RATE=1|LIMIT=2|DURATION=5"), [{"WINDOW":3,"RATE":1,"LIMIT":2,"DURATION":5}]);
assert.deepEqual(parseRecords("WINDOW=30|RATE=0|LIMIT=1"), [{"WINDOW":30,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
