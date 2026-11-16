const assert=require('node:assert/strict');const {parseLedgerCsv}=require('./src/ledger.cjs');
assert.deepEqual(parseLedgerCsv('name,team\nAda,Core\n'),[['name','team'],['Ada','Core']]);
assert.deepEqual(parseLedgerCsv('id,count\nx,2'),[['id','count'],['x','2']]);console.log('visible PASS');
