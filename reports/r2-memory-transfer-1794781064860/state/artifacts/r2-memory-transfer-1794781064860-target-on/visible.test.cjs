const assert = require('node:assert/strict');
const { parseRosterExport } = require('./lib/roster.cjs');
assert.deepEqual(parseRosterExport("a;b\n1;2\n"), [["a","b"],["1","2"]]);
console.log('visible PASS');
