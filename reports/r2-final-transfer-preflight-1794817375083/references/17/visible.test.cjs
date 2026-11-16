const assert = require('node:assert/strict');
const { parseBundle } = require('./adapters/bundle.cjs');
assert.deepEqual(parseBundle("WINDOW=4|RATE=1|LIMIT=2|DURATION=5"), [{"WINDOW":4,"RATE":1,"LIMIT":2,"DURATION":5}]);
assert.deepEqual(parseBundle("WINDOW=40|RATE=0|LIMIT=1"), [{"WINDOW":40,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
