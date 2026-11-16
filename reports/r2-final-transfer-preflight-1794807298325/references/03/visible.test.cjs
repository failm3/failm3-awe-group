const assert = require('node:assert/strict');
const { parseRecords } = require('./lib/records.cjs');
assert.deepEqual(parseRecords("WINDOW=2|RATE=1|LIMIT=2|FLAGS=read,write"), [{"WINDOW":2,"RATE":1,"LIMIT":2,"FLAGS":["read","write"]}]);
assert.deepEqual(parseRecords("WINDOW=50|RATE=0|LIMIT=1"), [{"WINDOW":50,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
