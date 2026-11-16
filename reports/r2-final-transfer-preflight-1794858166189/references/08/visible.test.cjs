const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');
assert.deepEqual(readInput("WINDOW=4;RATE=1;LIMIT=2"), [{"WINDOW":4,"RATE":1,"LIMIT":2}]);
assert.deepEqual(readInput("WINDOW=50;RATE=0;LIMIT=1"), [{"WINDOW":50,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
