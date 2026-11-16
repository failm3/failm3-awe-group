const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');
assert.deepEqual(parseRecords("WINDOW=3;RATE=1;LIMIT=2;COLOR=cyan"), [{"WINDOW":3,"RATE":1,"LIMIT":2,"COLOR":"cyan"}]);
assert.deepEqual(parseRecords("WINDOW=40;RATE=0;LIMIT=1"), [{"WINDOW":40,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
