import { createHash } from 'node:crypto';
import type { CsvAnalyticsLimits, CsvAnalyticsMetrics, CurrencyMetrics } from './csv-analytics.js';

// Deliberately pinned independently: no runtime import of the solver or its helpers.
const CONTRACT = 'ee21de150b9c8101aa5ab8a275b80ccdf0dccfb982ecf26d61d83f217ea1ba0c';
const COLUMNS = ['event_id', 'order_id', 'currency', 'kind', 'amount_cents', 'status'];
export const CSV_VERIFIER_VERSION = 'r1-csv-reference-v1';
export const MAX_CSV_RESULT_BYTES = 1_048_576;

type Diagnostic = { code: string; row?: number; field?: string | number; event_id?: string; conflicting_row?: number };
type Reference = { status: 'BLOCKED_INPUT'; error: Diagnostic } | { status: 'PASS_DATA'; metrics: CsvAnalyticsMetrics };
class Invalid extends Error {
  constructor(readonly detail: Diagnostic) { super(detail.code); }
}
function stop(code: string, row?: number, field?: string | number): never {
  throw new Invalid({ code, ...(row === undefined ? {} : { row }), ...(field === undefined ? {} : { field }) });
}

/** Stable JSON comparison: sort object keys, preserve arrays and exact scalar types. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
}
function sha(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Field-tokenizing parser, independent of the solver's character-state machine. */
function tokenize(text: string, maxRows: number): string[][] {
  const rows: string[][] = [];
  const token = /"((?:[^"]|"")*)"|([^",\r\n]*)/y;
  let offset = 0;
  while (offset < text.length) {
    const values: string[] = [];
    while (true) {
      const field = values.length + 1;
      token.lastIndex = offset;
      const match = token.exec(text);
      if (!match) stop('MALFORMED_CSV', rows.length + 1, field);
      const raw = match[1] ?? match[2];
      if (/\r(?!\n)/.test(raw)) stop('MALFORMED_CSV', rows.length + 1, field);
      offset = token.lastIndex;
      const separator = text[offset];
      if (separator !== undefined && separator !== ',' && separator !== '\n' && separator !== '\r') {
        stop('MALFORMED_CSV', rows.length + 1, field);
      }
      if (separator === '\r' && text[offset + 1] !== '\n') stop('MALFORMED_CSV', rows.length + 1, field);
      values.push(match[1] === undefined ? raw : raw.replace(/""/g, '"'));
      if (values.length > 6) stop('SCHEMA_MISMATCH', rows.length + 1, values.length);
      if (separator === ',') { offset++; continue; }
      offset += separator === '\r' ? 2 : separator === '\n' ? 1 : 0;
      break;
    }
    if (rows.length > maxRows) stop('ROW_LIMIT_EXCEEDED', rows.length + 1);
    rows.push(values);
  }
  return rows;
}

function calculate(input: Uint8Array, limits: CsvAnalyticsLimits): Reference {
  try {
    if (!limits || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 0
      || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 0) stop('INVALID_LIMITS');
    if (input.byteLength > limits.maxBytes) stop('BYTE_LIMIT_EXCEEDED');
    if (input[0] === 239 && input[1] === 187 && input[2] === 191) stop('BOM_FORBIDDEN', 1, 1);
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input); }
    catch { stop('INVALID_UTF8'); }
    const records = tokenize(text, limits.maxRows);
    if (!records.length) stop('EMPTY_INPUT', 1);
    const header = records.shift()!;
    if (header.length !== 6 || [...header].sort().join('\0') !== [...COLUMNS].sort().join('\0')) stop('SCHEMA_MISMATCH', 1);
    const indices = COLUMNS.map(name => header.indexOf(name));
    const events = records.map((record, index) => {
      const row = index + 2;
      if (record.length !== 6) stop('SCHEMA_MISMATCH', row);
      const fields = indices.map(i => record[i]);
      for (let i = 0; i < 2; i++) {
        if (fields[i].length < 1 || fields[i].length > 64 || /[^A-Za-z0-9_-]/.test(fields[i])) stop('INVALID_ID', row, COLUMNS[i]);
      }
      if (fields[2] !== 'USD' && fields[2] !== 'EUR') stop('INVALID_ENUM', row, 'currency');
      if (fields[3] !== 'sale' && fields[3] !== 'refund') stop('INVALID_ENUM', row, 'kind');
      if (fields[5] !== 'settled' && fields[5] !== 'pending') stop('INVALID_ENUM', row, 'status');
      const amount = fields[4];
      if (!amount.length || /[^0-9]/.test(amount) || (amount.length > 1 && amount[0] === '0')) stop('INVALID_AMOUNT', row, 'amount_cents');
      if (amount.length > 16 || (amount.length === 16 && amount > '9007199254740991')) stop('AMOUNT_OUT_OF_RANGE', row, 'amount_cents');
      return { fields, row };
    });
    // Sort/group instead of the solver's event map. Track earliest conflict in
    // source order so diagnostics remain deterministic across several bad IDs.
    events.sort((a, b) => a.fields[0] < b.fields[0] ? -1 : a.fields[0] > b.fields[0] ? 1 : a.row - b.row);
    const unique: typeof events = [];
    let conflict: Diagnostic | undefined;
    for (const event of events) {
      const first = unique[unique.length - 1];
      if (!first || first.fields[0] !== event.fields[0]) unique.push(event);
      else if (JSON.stringify(first.fields) !== JSON.stringify(event.fields)
        && (conflict?.row === undefined || event.row < conflict.row)) {
        conflict = { code: 'CONFLICTING_EVENT', row: event.row, field: 'event_id',
          event_id: event.fields[0], conflicting_row: first.row };
      }
    }
    if (conflict) throw new Invalid(conflict);
    function currency(code: string): CurrencyMetrics {
      const selected = unique.filter(event => event.fields[2] === code);
      const buckets = [
        ['settled', 'sale'], ['settled', 'refund'], ['pending', 'sale'], ['pending', 'refund'],
      ].map(([status, kind]) => selected.filter(event => event.fields[5] === status && event.fields[3] === kind));
      const sums = buckets.map(events => events.reduce((sum, event) => sum + BigInt(event.fields[4]), 0n));
      return {
        settled_sales_cents: sums[0].toString(), settled_refunds_cents: sums[1].toString(),
        pending_sales_cents: sums[2].toString(), pending_refunds_cents: sums[3].toString(),
        net_cents: (sums[0] - sums[1]).toString(),
        counts: { settled_sales: buckets[0].length, settled_refunds: buckets[1].length,
          pending_sales: buckets[2].length, pending_refunds: buckets[3].length },
        empty_settled_group: buckets[0].length + buckets[1].length === 0,
        empty_pending_group: buckets[2].length + buckets[3].length === 0,
      };
    }
    return { status: 'PASS_DATA', metrics: {
      USD: currency('USD'), EUR: currency('EUR'), raw_rows: records.length,
      unique_events: unique.length, duplicate_rows: records.length - unique.length, empty_input: records.length === 0,
    } };
  } catch (error) {
    if (!(error instanceof Invalid)) throw error;
    return { status: 'BLOCKED_INPUT', error: error.detail };
  }
}

export interface CsvVerificationReceipt {
  verifier_version: typeof CSV_VERIFIER_VERSION;
  contract_digest: string;
  input_sha256: string;
  /** Exact UTF-8 bytes of the supplied result JSON, not canonicalized JSON. */
  result_sha256: string;
  limits: CsvAnalyticsLimits;
  limits_sha256: string;
  expected_status: 'PASS_DATA' | 'BLOCKED_INPUT';
  expected_normalized_sha256: string;
  outcome: 'MATCH' | 'MISMATCH';
  issues: string[];
  qualification: 'NOT_ASSESSED';
  /** Hash of canonical JSON of all preceding fields (excluding this field). */
  receipt_sha256: string;
}

/**
 * Recompute from raw bytes using an independent implementation. Result JSON is
 * untrusted. Object key order is immaterial; all amounts/types/counts/flags must
 * match exactly. Error prose is excluded, but codes and locations must match.
 * This comparison receipt is neither a signature nor QA qualification.
 */
export function verifyCsvAnalytics(input: Uint8Array, resultJson: string, limits: CsvAnalyticsLimits): CsvVerificationReceipt {
  // Verifier invocation itself requires approved bounds. Invalid-limit outputs
  // are not an executable mission case and cannot produce a trustworthy receipt.
  if (!limits || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 0
    || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 0) throw new Error('Verifier requires approved valid limits');
  const expected = calculate(input, limits);
  const inputHash = sha(input);
  const issues: string[] = [];
  let candidate: unknown;
  if (Buffer.byteLength(resultJson, 'utf8') > MAX_CSV_RESULT_BYTES) issues.push('RESULT_SIZE_EXCEEDED');
  else {
    try { candidate = JSON.parse(resultJson); }
    catch { issues.push('RESULT_INVALID_JSON'); }
  }
  if (!issues.length) {
    if (!object(candidate)) issues.push('RESULT_INVALID_ENVELOPE');
    else {
      const allowed = expected.status === 'PASS_DATA'
        ? ['contract_digest', 'input_sha256', 'status', 'errors', 'metrics']
        : ['contract_digest', 'input_sha256', 'status', 'errors'];
      if (canonical(Object.keys(candidate).sort()) !== canonical(allowed.sort())) issues.push('RESULT_INVALID_ENVELOPE');
      if (candidate.contract_digest !== CONTRACT) issues.push('CONTRACT_DIGEST_MISMATCH');
      if (candidate.input_sha256 !== inputHash) issues.push('INPUT_HASH_MISMATCH');
      if (candidate.status !== expected.status) issues.push('STATUS_MISMATCH');
      if (expected.status === 'PASS_DATA') {
        if (!Array.isArray(candidate.errors) || candidate.errors.length) issues.push('PASS_HAS_ERRORS');
        if (canonical(candidate.metrics ?? null) !== canonical(expected.metrics)) issues.push('METRICS_MISMATCH');
      } else {
        if (Object.hasOwn(candidate, 'metrics')) issues.push('BLOCKED_HAS_METRICS');
        const errors = candidate.errors;
        if (!Array.isArray(errors) || errors.length !== 1 || !object(errors[0])) issues.push('BLOCKED_INVALID_ERRORS');
        else {
          const { message, ...diagnostic } = errors[0];
          if (typeof message !== 'string' || !message.length || canonical(diagnostic) !== canonical(expected.error)) issues.push('DIAGNOSTIC_MISMATCH');
        }
      }
    }
  }
  const approved = { maxBytes: limits.maxBytes, maxRows: limits.maxRows };
  const body: Omit<CsvVerificationReceipt, 'receipt_sha256'> = {
    verifier_version: CSV_VERIFIER_VERSION, contract_digest: CONTRACT, input_sha256: inputHash,
    result_sha256: sha(resultJson), limits: approved, limits_sha256: sha(canonical(approved)),
    expected_status: expected.status, expected_normalized_sha256: sha(canonical(expected)),
    outcome: issues.length ? 'MISMATCH' : 'MATCH', issues, qualification: 'NOT_ASSESSED',
  };
  return { ...body, receipt_sha256: sha(canonical(body)) };
}
