import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { analyzeCsvAnalytics } from '../capabilities/csv-analytics.js';
import { verifyCsvAnalytics, MAX_CSV_RESULT_BYTES } from '../capabilities/csv-verifier.js';

const HEADER = 'event_id,order_id,currency,kind,amount_cents,status';
const LIMITS = { maxBytes: 100_000, maxRows: 1000 };
const DIGEST = 'ee21de150b9c8101aa5ab8a275b80ccdf0dccfb982ecf26d61d83f217ea1ba0c';
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'));

// Public hand-calculated fixture: verifier acceptance does not depend on solver output.
function fixture() {
  const bytes = csv('a,o,USD,sale,9007199254740991,settled', 'b,o,USD,sale,9007199254740991,settled',
    'a,o,USD,sale,9007199254740991,settled', 'c,o,EUR,refund,10,settled', 'd,o,EUR,sale,7,pending');
  const result = {
    contract_digest: DIGEST, input_sha256: sha(bytes), status: 'PASS_DATA', errors: [],
    metrics: {
      USD: { settled_sales_cents: '18014398509481982', settled_refunds_cents: '0', net_cents: '18014398509481982',
        pending_sales_cents: '0', pending_refunds_cents: '0', counts: { settled_sales: 2, settled_refunds: 0, pending_sales: 0, pending_refunds: 0 },
        empty_settled_group: false, empty_pending_group: true },
      EUR: { settled_sales_cents: '0', settled_refunds_cents: '10', net_cents: '-10',
        pending_sales_cents: '7', pending_refunds_cents: '0', counts: { settled_sales: 0, settled_refunds: 1, pending_sales: 1, pending_refunds: 0 },
        empty_settled_group: false, empty_pending_group: false },
      raw_rows: 5, unique_events: 4, duplicate_rows: 1, empty_input: false,
    },
  };
  return { bytes, result };
}

test('CSV verifier independently accepts hand-calculated exact amounts and binds all receipt hashes', () => {
  const { bytes, result } = fixture();
  const json = JSON.stringify(result);
  const receipt = verifyCsvAnalytics(bytes, json, LIMITS);
  assert.equal(receipt.outcome, 'MATCH');
  assert.deepEqual(receipt.issues, []);
  assert.equal(receipt.qualification, 'NOT_ASSESSED');
  assert.equal(receipt.input_sha256, sha(bytes));
  assert.equal(receipt.result_sha256, sha(json));
  assert.equal(receipt.limits_sha256, sha('{"maxBytes":100000,"maxRows":1000}'));
  function sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sorted);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : 1).map(([key, item]) => [key, sorted(item)]));
    return value;
  }
  const { receipt_sha256, ...body } = receipt;
  assert.equal(receipt_sha256, sha(JSON.stringify(sorted(body))));
  assert.deepEqual(receipt, verifyCsvAnalytics(bytes, json, LIMITS));
  const changedLimits = verifyCsvAnalytics(bytes, json, { ...LIMITS, maxRows: 999 });
  assert.notEqual(receipt.receipt_sha256, changedLimits.receipt_sha256);
  assert.equal(receipt.expected_normalized_sha256, changedLimits.expected_normalized_sha256);
});

test('CSV verifier normalizes object order only, retaining exact scalar types and monetary spelling', () => {
  const { bytes, result } = fixture();
  const original = verifyCsvAnalytics(bytes, JSON.stringify(result), LIMITS);
  const reordered = { metrics: { ...result.metrics, USD: Object.fromEntries(Object.entries(result.metrics.USD).reverse()) },
    errors: [], status: result.status, input_sha256: result.input_sha256, contract_digest: DIGEST };
  const other = verifyCsvAnalytics(bytes, JSON.stringify(reordered, null, 2), LIMITS);
  assert.equal(other.outcome, 'MATCH');
  assert.equal(other.expected_normalized_sha256, original.expected_normalized_sha256);
  assert.notEqual(other.result_sha256, original.result_sha256);
  assert.notEqual(other.receipt_sha256, original.receipt_sha256);
  for (const value of ['018014398509481982', 18014398509481982, '+18014398509481982', '18014398509481983', null]) {
    const candidate = structuredClone(result) as any;
    candidate.metrics.USD.net_cents = value;
    assert.ok(verifyCsvAnalytics(bytes, JSON.stringify(candidate), LIMITS).issues.includes('METRICS_MISMATCH'));
  }
});

test('CSV verifier catches seeded arithmetic, pending, counting, flags and cached-answer defects', () => {
  const { bytes, result } = fixture();
  const mutations: Array<(candidate: any) => void> = [
    candidate => { candidate.metrics.EUR.net_cents = '-3'; }, // incorrect pending inclusion
    candidate => { candidate.metrics.USD.net_cents = '27021597764222973'; }, // duplicate inclusion
    candidate => { candidate.metrics.USD.counts.settled_sales = 3; },
    candidate => { candidate.metrics.USD.empty_settled_group = true; },
    candidate => { candidate.metrics.duplicate_rows = 0; },
    candidate => { candidate.metrics.EUR.pending_sales_cents = '0'; },
    candidate => { candidate.metrics.EUR.pending_refunds_cents = '-1'; },
    candidate => { candidate.metrics.empty_input = true; },
    candidate => { candidate.metrics.total_cents = 'anything'; },
    candidate => { candidate.metrics.EUR.counts.pending_sales = '1'; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(result);
    mutate(candidate);
    assert.equal(verifyCsvAnalytics(bytes, JSON.stringify(candidate), LIMITS).outcome, 'MISMATCH');
  }
  const different = csv('z,o,USD,sale,1,settled');
  const stale = verifyCsvAnalytics(different, JSON.stringify(result), LIMITS);
  assert.ok(stale.issues.includes('INPUT_HASH_MISMATCH'));
  assert.ok(stale.issues.includes('METRICS_MISMATCH'));
  // Forging a fresh input hash does not rescue cached metrics.
  assert.equal(verifyCsvAnalytics(different, JSON.stringify({ ...result, input_sha256: sha(different) }), LIMITS).outcome, 'MISMATCH');
});

test('CSV verifier checks BLOCKED diagnostics and absence of totals, not unconditional PASS', () => {
  const bytes = csv('e,o,USD,sale,1,settled', 'e,o,USD,sale,2,settled');
  const correct = { contract_digest: DIGEST, input_sha256: sha(bytes), status: 'BLOCKED_INPUT',
    errors: [{ code: 'CONFLICTING_EVENT', message: 'Independently phrased error', row: 3, field: 'event_id', event_id: 'e', conflicting_row: 2 }] };
  assert.equal(verifyCsvAnalytics(bytes, JSON.stringify(correct), LIMITS).outcome, 'MATCH');
  for (const candidate of [
    { ...correct, metrics: {} }, { ...correct, metrics: null }, { ...correct, chart: [0, 0] },
    { ...correct, errors: [] }, { ...correct, errors: [{ ...correct.errors[0], row: 2 }] },
    { ...correct, errors: [{ ...correct.errors[0], code: 'INVALID_AMOUNT' }] },
    { ...correct, errors: [{ ...correct.errors[0], event_id: 'other' }] },
    { ...correct, errors: [{ ...correct.errors[0], partial_sum: '1' }] },
    { ...correct, status: 'PASS_DATA' }, { ...correct, contract_digest: 'wrong' },
  ]) assert.equal(verifyCsvAnalytics(bytes, JSON.stringify(candidate), LIMITS).outcome, 'MISMATCH');
  const valid = csv('e,o,USD,sale,1,settled');
  assert.equal(verifyCsvAnalytics(valid, JSON.stringify({ ...correct, input_sha256: sha(valid) }), LIMITS).outcome, 'MISMATCH');
});

test('CSV verifier independently agrees across quoting, boundaries and invalid-input classes', () => {
  const cases: Array<[Buffer, typeof LIMITS]> = [
    [Buffer.alloc(0), LIMITS], [Buffer.from(HEADER), { ...LIMITS, maxRows: 0 }],
    [Buffer.from(HEADER + '\r\n'), LIMITS], [csv(''), LIMITS], [Buffer.from(HEADER + '\n\n'), LIMITS],
    [Buffer.from('currency,event_id,order_id,kind,status,amount_cents\r\n"EUR","e","o","refund","pending","0"\r\n'), LIMITS],
    [csv('e,o,USD,sale,1,settled', 'e,o,USD,sale,1,settled'), { ...LIMITS, maxRows: 1 }],
    [csv('e,o,USD,sale,1,settled'), { ...LIMITS, maxBytes: 1 }],
    [Buffer.from([0xff]), LIMITS], [Buffer.concat([Buffer.from([239, 187, 191]), csv()]), LIMITS],
    [Buffer.from('event_id,order_id,currency,kind,amount_cents,event_id'), LIMITS],
  ];
  for (const value of ['', '-1', '+1', '01', '1.5', '1e2', 'NaN', ' 1', '1\n', '9007199254740992', '9'.repeat(400)]) {
    for (const status of ['settled', 'pending']) cases.push([csv(`e,o,USD,sale,"${value}",${status}`), LIMITS]);
  }
  for (const record of ['"e""1",o,USD,sale,1,settled', '"e,1",o,USD,sale,1,settled',
    '"e\r\n1",o,USD,sale,1,settled', '"e\r1",o,USD,sale,1,settled', '"e"x,o,USD,sale,1,settled',
    '"e,o,USD,sale,1,settled', 'e,o,USD,sale,1,settled,', 'e,o,USD,sale,1',
    'e,o,usd,sale,1,settled', 'e,o,USD,Sale,1,settled', 'e,o,USD,sale,1,Pending',
    'é,o,USD,sale,1,settled', 'e,,USD,sale,1,settled']) cases.push([csv(record), LIMITS]);
  cases.push([csv('z,o,USD,sale,1,settled', 'a,o,USD,sale,1,settled', 'z,o,USD,sale,2,settled', 'a,o,USD,sale,2,settled'), LIMITS]);
  cases.push([csv('e,o,USD,sale,1,settled', 'e,o,USD,sale,2,settled', 'e,o,USD,sale,,pending'), LIMITS]);
  for (const [bytes, limits] of cases) {
    const solver = analyzeCsvAnalytics(bytes, limits);
    const receipt = verifyCsvAnalytics(bytes, JSON.stringify(solver), limits);
    assert.equal(receipt.outcome, 'MATCH', `${bytes.toString()}: ${JSON.stringify(receipt)}`);
  }
});

test('CSV verifier fails malformed result envelopes and excessive result JSON closed', () => {
  const { bytes, result } = fixture();
  for (const json of ['', '{', 'null', '[]', 'true', JSON.stringify({ ...result, qualification: 'QUALIFIED' }),
    JSON.stringify({ ...result, errors: [{ code: 'something' }] }), ' '.repeat(MAX_CSV_RESULT_BYTES + 1)]) {
    assert.equal(verifyCsvAnalytics(bytes, json, LIMITS).outcome, 'MISMATCH');
  }
  assert.throws(() => verifyCsvAnalytics(bytes, JSON.stringify(result), { ...LIMITS, maxRows: NaN }), /approved valid limits/);
  // Static independence guard: type-only imports may share the output shape;
  // neither parsing nor arithmetic can delegate to the solver implementation.
  const source = readFileSync(new URL('../capabilities/csv-verifier.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /analyzeCsvAnalytics|renderCsvAnalyticsReport/);
  assert.equal(source.split('\n').filter(line => line.includes("from './csv-analytics.js'")).every(line => line.startsWith('import type ')), true);
});
