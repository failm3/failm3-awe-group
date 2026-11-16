const assert = require('node:assert/strict');
const { parseBundle } = require('./adapters/bundle.cjs');
assert.deepEqual(parseBundle("WINDOW=3|RATE=1|LIMIT=2|FLAGS=alpha,beta"), [{"WINDOW":3,"RATE":1,"LIMIT":2,"FLAGS":["alpha","beta"]}]);
assert.deepEqual(parseBundle("WINDOW=60|RATE=0|LIMIT=1"), [{"WINDOW":60,"RATE":0,"LIMIT":1}]);
console.log('visible PASS');
