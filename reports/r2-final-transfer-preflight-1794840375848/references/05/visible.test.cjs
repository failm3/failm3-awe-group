const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');
assert.deepEqual(parseExport("WINDOW=4|RATE=1|LIMIT=2|DURATION=5"), [{"WINDOW":4,"RATE":1,"LIMIT":2,"DURATION":5}]);
assert.deepEqual(parseExport("WINDOW=20|RATE=0|LIMIT=1"), [{"WINDOW":20,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
