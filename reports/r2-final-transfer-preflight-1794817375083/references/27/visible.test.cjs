const assert = require('node:assert/strict');
const { parseExport } = require('./src/export.cjs');
assert.deepEqual(parseExport("WINDOW=2|RATE=1|LIMIT=2|FLAGS=cold,warm"), [{"WINDOW":2,"RATE":1,"LIMIT":2,"FLAGS":["cold","warm"]}]);
assert.deepEqual(parseExport("WINDOW=40|RATE=0|LIMIT=1"), [{"WINDOW":40,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
