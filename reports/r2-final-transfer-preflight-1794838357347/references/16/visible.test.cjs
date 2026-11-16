const assert = require('node:assert/strict');
const { parseBundle } = require('./adapters/bundle.cjs');
assert.deepEqual(parseBundle("WINDOW=3;RATE=1;LIMIT=2"), [{"WINDOW":3,"RATE":1,"LIMIT":2}]);
assert.deepEqual(parseBundle("WINDOW=30;RATE=0;LIMIT=1"), [{"WINDOW":30,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
