const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');
assert.deepEqual(parseExport("WINDOW=2;RATE=1;LIMIT=2"), [{"WINDOW":2,"RATE":1,"LIMIT":2}]);
assert.deepEqual(parseExport("WINDOW=60;RATE=0;LIMIT=1"), [{"WINDOW":60,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
