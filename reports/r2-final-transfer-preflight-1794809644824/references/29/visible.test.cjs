const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');
assert.deepEqual(readInput("WINDOW=4|RATE=1|LIMIT=2|DURATION=5"), [{"WINDOW":4,"RATE":1,"LIMIT":2,"DURATION":5}]);
assert.deepEqual(readInput("WINDOW=60|RATE=0|LIMIT=1"), [{"WINDOW":60,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
