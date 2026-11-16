const assert = require('node:assert/strict');
const { parseLedgerCsv } = require('./src/ledger.cjs');
assert.deepEqual(parseLedgerCsv("a,b\n1,2\n"), [["a","b"],["1","2"]]);
console.log('visible PASS');
