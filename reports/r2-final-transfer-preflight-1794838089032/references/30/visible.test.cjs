const assert = require('node:assert/strict');
const { readInput } = require('./lib/input.cjs');
assert.deepEqual(readInput("WINDOW=2;RATE=1;LIMIT=2;COLOR=red"), [{"WINDOW":2,"RATE":1,"LIMIT":2,"COLOR":"red"}]);
assert.deepEqual(readInput("WINDOW=20;RATE=0;LIMIT=1"), [{"WINDOW":20,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
