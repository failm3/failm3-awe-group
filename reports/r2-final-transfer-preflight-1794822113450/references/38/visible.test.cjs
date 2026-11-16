const assert = require('node:assert/strict');
const { parseBundle } = require('./adapters/bundle.cjs');
assert.deepEqual(parseBundle("WINDOW=4;RATE=1;LIMIT=2;COLOR=white"), [{"WINDOW":4,"RATE":1,"LIMIT":2,"COLOR":"white"}]);
assert.deepEqual(parseBundle("WINDOW=50;RATE=0;LIMIT=1"), [{"WINDOW":50,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
