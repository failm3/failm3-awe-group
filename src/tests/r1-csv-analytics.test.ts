import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  analyzeCsvAnalytics, CSV_ANALYTICS_CONTRACT_DIGEST, renderCsvAnalyticsReport,
  type CsvAnalyticsLimits, type CsvAnalyticsResult, type CurrencyMetrics,
} from '../capabilities/csv-analytics.js';

const HEADER = 'event_id,order_id,currency,kind,amount_cents,status';
const LIMITS = { maxBytes: 100_000, maxRows: 1000 };
const row = ['e1', 'o1', 'USD', 'sale', '10', 'settled'];
const csv = (rows: string[], header = HEADER) => [header, ...rows].join('\n');
const analyze = (text: string, limits = LIMITS) => analyzeCsvAnalytics(Buffer.from(text), limits);
function pass(result: CsvAnalyticsResult) {
  assert.equal(result.status, 'PASS_DATA', JSON.stringify(result));
  if (result.status !== 'PASS_DATA') throw new Error('Expected PASS_DATA');
  assert.deepEqual(result.errors, []);
  return result.metrics;
}
function blocked(result: CsvAnalyticsResult, code: string) {
  assert.equal(result.status, 'BLOCKED_INPUT');
  assert.equal(result.errors[0]?.code, code);
  assert.equal(Object.hasOwn(result, 'metrics'), false);
  assert.doesNotMatch(JSON.stringify(result), /net_cents|settled_sales_cents|pending_sales_cents/);
  assert.doesNotMatch(renderCsvAnalyticsReport(result), /net_cents|USD=0|EUR=0/);
  return result.errors[0];
}

test('R1 CSV: contract digest pins exact document bytes; input hash pins original bytes', () => {
  const contract = readFileSync(new URL('../../research/r1-kortix/ANALYTICS-CONTRACT.md', import.meta.url));
  assert.equal(createHash('sha256').update(contract).digest('hex'), CSV_ANALYTICS_CONTRACT_DIGEST);
  const bytes = Buffer.from(`${HEADER}\r\n`);
  const result = analyzeCsvAnalytics(bytes, LIMITS);
  assert.equal(result.contract_digest, CSV_ANALYTICS_CONTRACT_DIGEST);
  assert.equal(result.input_sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.notEqual(result.input_sha256, analyze(`${HEADER}\n`).input_sha256);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('R1 CSV: public control has exact full metrics and separate pending totals', () => {
  const metrics = pass(analyze(csv([
    'e1,o1,USD,sale,10000,settled', 'e2,o2,USD,sale,5000,settled',
    'e2,o2,USD,sale,5000,settled', 'e3,o2,USD,refund,1000,settled',
    'e4,o3,EUR,sale,7000,settled', 'e5,o4,USD,sale,9000,pending',
  ])));
  assert.deepEqual(metrics, {
    USD: {
      settled_sales_cents: '15000', settled_refunds_cents: '1000', net_cents: '14000',
      pending_sales_cents: '9000', pending_refunds_cents: '0',
      counts: { settled_sales: 2, settled_refunds: 1, pending_sales: 1, pending_refunds: 0 },
      empty_settled_group: false, empty_pending_group: false,
    },
    EUR: {
      settled_sales_cents: '7000', settled_refunds_cents: '0', net_cents: '7000',
      pending_sales_cents: '0', pending_refunds_cents: '0',
      counts: { settled_sales: 1, settled_refunds: 0, pending_sales: 0, pending_refunds: 0 },
      empty_settled_group: false, empty_pending_group: true,
    },
    raw_rows: 6, unique_events: 5, duplicate_rows: 1, empty_input: false,
  });
});

test('R1 CSV: header-only, pending-only and zero-valued settled events have distinct emptiness', () => {
  for (const ending of ['', '\n', '\r\n']) {
    const metrics = pass(analyze(HEADER + ending, { maxBytes: 1000, maxRows: 0 }));
    assert.equal(metrics.empty_input, true);
    assert.equal(metrics.raw_rows, 0);
    assert.equal(metrics.unique_events, 0);
    assert.equal(metrics.duplicate_rows, 0);
    for (const currency of ['USD', 'EUR'] as const) {
      assert.equal(metrics[currency].net_cents, '0');
      assert.equal(metrics[currency].empty_settled_group, true);
      assert.equal(metrics[currency].empty_pending_group, true);
      assert.deepEqual(Object.values(metrics[currency].counts), [0, 0, 0, 0]);
    }
  }
  const pending = pass(analyze(csv(['p,o,EUR,sale,7,pending', 'r,o,EUR,refund,9,pending'])));
  assert.equal(pending.empty_input, false);
  assert.equal(pending.EUR.net_cents, '0');
  assert.equal(pending.USD.net_cents, '0');
  assert.equal(pending.EUR.pending_sales_cents, '7');
  assert.equal(pending.EUR.pending_refunds_cents, '9');
  assert.equal(pending.EUR.counts.pending_refunds, 1);
  assert.equal(pending.EUR.empty_settled_group, true);
  assert.equal(pending.EUR.empty_pending_group, false);
  const zero = pass(analyze(csv(['z,o,USD,sale,0,settled'])));
  assert.equal(zero.USD.net_cents, '0');
  assert.equal(zero.USD.empty_settled_group, false);
});

test('R1 CSV: exact signed integer sums can exceed the per-event safe-integer bound', () => {
  const metrics = pass(analyze(csv([
    's1,o,USD,sale,9007199254740991,settled', 's2,o,USD,sale,9007199254740991,settled',
    'r1,o,EUR,refund,9007199254740991,settled', 'r2,o,EUR,refund,9007199254740991,settled',
    'p1,o,USD,refund,9007199254740991,pending', 'p2,o,USD,refund,9007199254740991,pending',
  ])));
  assert.equal(metrics.USD.net_cents, '18014398509481982');
  assert.equal(metrics.EUR.net_cents, '-18014398509481982');
  assert.equal(metrics.USD.pending_refunds_cents, '18014398509481982');
  assert.equal(pass(analyze(csv(['r,o,USD,refund,10,settled']))).USD.net_cents, '-10');
  const cancellation = pass(analyze(csv([
    'a,o,USD,sale,9007199254740991,settled', 'b,o,USD,sale,2,settled',
    'c,o,USD,refund,9007199254740991,settled',
  ])));
  assert.equal(cancellation.USD.net_cents, '2');
});

test('R1 CSV: header order, record order, quoting and line endings do not alter metrics', () => {
  const rows = [row, ['e2', 'o1', 'EUR', 'refund', '8', 'pending'], row];
  const expected = pass(analyze(csv(rows.map(values => values.join(',')))));
  const positions = [5, 4, 3, 2, 1, 0];
  const quoted = (values: string[]) => positions.map(i => `"${values[i]}"`).join(',');
  const transformed = [quoted(HEADER.split(',')), ...rows.slice().reverse().map(quoted)].join('\r\n') + '\r\n';
  assert.deepEqual(pass(analyze(transformed)), expected);
  assert.equal(expected.duplicate_rows, 1);
  assert.equal(expected.unique_events, 2);
  // Quoted and unquoted records with the same parsed fields are duplicates.
  assert.equal(pass(analyze(csv([row.join(','), row.map(value => `"${value}"`).join(',')]))).duplicate_rows, 1);
});

test('R1 CSV: every conflicting non-ID field blocks both record orders without totals', () => {
  for (const [index, replacement] of [[1, 'o2'], [2, 'EUR'], [3, 'refund'], [4, '11'], [5, 'pending']] as const) {
    const conflict = row.slice();
    conflict[index] = replacement;
    for (const rows of [[row, conflict], [conflict, row]]) {
      const error = blocked(analyze(csv(rows.map(values => values.join(',')))), 'CONFLICTING_EVENT');
      assert.equal(error.event_id, 'e1');
      assert.equal(error.row, 3);
      assert.equal(error.conflicting_row, 2);
    }
  }
  assert.equal(pass(analyze(csv([row.join(','), ['e2', ...row.slice(1)].join(',')]))).USD.net_cents, '20');
});

test('R1 CSV: validation precedes deduplication and conflict checking across the entire input', () => {
  const invalidDuplicate = ['e1', 'o1', 'USD', 'sale', '', 'pending'].join(',');
  const error = blocked(analyze(csv([row.join(','), 'e1,o1,USD,sale,11,settled', invalidDuplicate])), 'INVALID_AMOUNT');
  assert.equal(error.row, 4);
  assert.equal(error.field, 'amount_cents');
});

test('R1 CSV: IDs and enums remain exact, mandatory, ASCII and case-sensitive', () => {
  for (const field of [0, 1]) {
    for (const value of ['', ' ', ' x', 'x ', 'é', '=SUM(1)', '@x', 'x.y', 'a'.repeat(65), 'x\n']) {
      const values = row.slice();
      values[field] = `"${value}"`;
      const error = blocked(analyze(csv([values.join(',')])), 'INVALID_ID');
      assert.equal(error.field, field === 0 ? 'event_id' : 'order_id');
    }
  }
  pass(analyze(csv([`${'a'.repeat(64)},A_0-z,USD,sale,1,settled`])));
  for (const [field, values] of [[2, ['GBP', 'usd', ' USD', '']], [3, ['Sale', 'REFUND', 'sale ', '']], [5, ['SETTLED', 'pending ', 'null', '']]] as const) {
    for (const value of values) {
      const values = row.slice();
      values[field] = value;
      blocked(analyze(csv([values.join(',')])), 'INVALID_ENUM');
    }
  }
});

test('R1 CSV: amount grammar and range are enforced equally for settled and pending', () => {
  for (const status of ['settled', 'pending']) {
    for (const amount of ['', '-1', '+1', '01', '00', '1.5', '.5', '1e3', 'NaN', 'null', 'Infinity', ' 1', '1 ', '١', '1\n', '=1+1']) {
      blocked(analyze(csv([`e,o,USD,sale,"${amount}",${status}`])), 'INVALID_AMOUNT');
    }
    for (const amount of ['9007199254740992', '9999999999999999', '1'.repeat(4000)]) {
      blocked(analyze(csv([`e,o,USD,sale,${amount},${status}`])), 'AMOUNT_OUT_OF_RANGE');
    }
    for (const amount of ['0', '1', '9007199254740990', '9007199254740991']) {
      pass(analyze(csv([`e,o,USD,sale,${amount},${status}`])));
    }
  }
});

test('R1 CSV: missing, repeated, unknown and extra columns block the entire dataset', () => {
  blocked(analyze(''), 'EMPTY_INPUT');
  for (const header of ['', 'event_id', `${HEADER},extra`, HEADER.replace('order_id', 'event_id'), HEADER.replace('order_id', 'extra'), HEADER.toUpperCase(), ` ${HEADER}`]) {
    blocked(analyze(`${header}\n${row.join(',')}`), 'SCHEMA_MISMATCH');
  }
  for (const values of [row.slice(1).join(','), `${row.join(',')},`, '', ',,,,,']) {
    const expected = values === ',,,,,' ? 'INVALID_ID' : 'SCHEMA_MISMATCH';
    blocked(analyze(`${HEADER}\n${values}\n`), expected);
  }
  for (const text of [`${HEADER}\n\n`, `${HEADER}\n\n${row.join(',')}`, `\n${HEADER}`, `${HEADER}\r\n\r\n`]) {
    blocked(analyze(text), 'SCHEMA_MISMATCH');
  }
});

test('R1 CSV: strict RFC quoting supports escaped content but never repairs malformed CSV', () => {
  for (const text of [
    `${HEADER}\ne"1,o,USD,sale,1,settled`, `${HEADER}\n"e1"x,o,USD,sale,1,settled`,
    `${HEADER}\n"e1" ,o,USD,sale,1,settled`, `${HEADER}\n"e1,o,USD,sale,1,settled`,
    `${HEADER}\re1,o,USD,sale,1,settled`, `${HEADER}\n"e\r1",o,USD,sale,1,settled`,
  ]) blocked(analyze(text), 'MALFORMED_CSV');
  // These are valid CSV fields but invalid schema values, not CSV parse errors.
  for (const value of ['"e,1"', '"e""1"', '"e\n1"', '"e\r\n1"']) {
    blocked(analyze(csv([`${value},o,USD,sale,1,settled`])), 'INVALID_ID');
  }
});

test('R1 CSV: strict UTF-8 rejects BOM, malformed and overlong encodings', () => {
  const data = Buffer.from(csv([row.join(',')]));
  blocked(analyzeCsvAnalytics(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), data]), LIMITS), 'BOM_FORBIDDEN');
  for (const bytes of [[0xff], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f]]) {
    blocked(analyzeCsvAnalytics(Buffer.concat([data, Buffer.from(bytes)]), LIMITS), 'INVALID_UTF8');
  }
  blocked(analyze(`${HEADER}\n\ufeff${row.join(',')}`), 'INVALID_ID');
});

test('R1 CSV: explicit raw-byte and raw-record limits include duplicate records', () => {
  const text = csv([row.join(','), row.join(',')]);
  const bytes = Buffer.byteLength(text);
  pass(analyze(text, { maxBytes: bytes, maxRows: 2 }));
  blocked(analyze(text, { maxBytes: bytes - 1, maxRows: 2 }), 'BYTE_LIMIT_EXCEEDED');
  const error = blocked(analyze(text, { maxBytes: bytes, maxRows: 1 }), 'ROW_LIMIT_EXCEEDED');
  assert.equal(error.row, 3);
  blocked(analyze(csv([row.join(',')]), { maxBytes: bytes, maxRows: 0 }), 'ROW_LIMIT_EXCEEDED');
  // Bounds are checked before UTF-8 decoding or value validation.
  blocked(analyzeCsvAnalytics(Buffer.from([0xff]), { maxBytes: 0, maxRows: 0 }), 'BYTE_LIMIT_EXCEEDED');
  const unicode = csv(['é,o,USD,sale,1,settled']);
  blocked(analyze(unicode, { maxBytes: unicode.length, maxRows: 1 }), 'BYTE_LIMIT_EXCEEDED');
  for (const limits of [undefined, {}, { maxBytes: Infinity, maxRows: 1 }, { maxBytes: 1, maxRows: -1 },
    { maxBytes: -1, maxRows: 1 }, { maxBytes: 1.5, maxRows: 1 }, { maxBytes: 10, maxRows: NaN },
    { maxBytes: 1000, maxRows: Number.MAX_SAFE_INTEGER + 1 }, { maxBytes: '1000', maxRows: 1 }]) {
    blocked(analyzeCsvAnalytics(Buffer.from(HEADER), limits as CsvAnalyticsLimits), 'INVALID_LIMITS');
  }
});

test('R1 CSV: deterministic varied fixture preserves exact aggregates under permutation and duplication', () => {
  // Hand-derived sums: 1+...+20=210 per category; large base amplifies rounding errors.
  const records: string[] = [];
  for (const currency of ['USD', 'EUR']) {
    for (const status of ['settled', 'pending']) {
      for (const kind of ['sale', 'refund']) {
        for (let i = 1; i <= 20; i++) {
          const amount = (9007199254740000n + BigInt(i) * (kind === 'sale' ? 2n : 1n)).toString();
          records.push(`${currency}_${status}_${kind}_${i},shared,${currency},${kind},${amount},${status}`);
        }
      }
    }
  }
  const baseline = pass(analyze(csv(records)));
  const permuted = [...records.filter((_, i) => i % 2), ...records.filter((_, i) => !(i % 2))].reverse();
  assert.deepEqual(pass(analyze(csv(permuted))), baseline);
  const duplicated = pass(analyze(csv([...permuted, ...records, ...records])));
  assert.equal(duplicated.raw_rows, 480);
  assert.equal(duplicated.duplicate_rows, 320);
  for (const currency of ['USD', 'EUR'] as const) {
    assert.deepEqual(duplicated[currency], baseline[currency]);
    const expected: CurrencyMetrics = {
      settled_sales_cents: '180143985094800420', settled_refunds_cents: '180143985094800210', net_cents: '210',
      pending_sales_cents: '180143985094800420', pending_refunds_cents: '180143985094800210',
      counts: { settled_sales: 20, settled_refunds: 20, pending_sales: 20, pending_refunds: 20 },
      empty_settled_group: false, empty_pending_group: false,
    };
    assert.deepEqual(baseline[currency], expected);
  }
});

test('R1 CSV: human report declares exact units, exclusions and claim boundaries', () => {
  const result = analyze(csv(['r,o,USD,refund,10,settled', 'p,o,EUR,sale,7,pending']));
  const report = renderCsvAnalyticsReport(result);
  for (const expected of ['net = settled sales minus settled refunds', 'integer cents', 'currency scale 2',
    'no FX conversion', 'pending events are excluded', 'no causal inference or financial-audit claim',
    'USD: net_cents=-10', 'EUR: net_cents=0', 'pending_sales: cents=7, count=1']) {
    assert.ok(report.includes(expected), expected);
  }
  assert.deepEqual(analyze(csv([row.join(',')])), analyze(csv([row.join(',')])));
});
