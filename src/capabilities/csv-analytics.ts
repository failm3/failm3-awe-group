import { createHash } from 'node:crypto';

/** SHA-256 of research/r1-kortix/ANALYTICS-CONTRACT.md, exact UTF-8 bytes. */
export const CSV_ANALYTICS_CONTRACT_DIGEST = 'ee21de150b9c8101aa5ab8a275b80ccdf0dccfb982ecf26d61d83f217ea1ba0c';

const FIELDS = ['event_id', 'order_id', 'currency', 'kind', 'amount_cents', 'status'] as const;
type Field = typeof FIELDS[number];
type Currency = 'USD' | 'EUR';
type Bucket = 'settled_sales' | 'settled_refunds' | 'pending_sales' | 'pending_refunds';
const BUCKETS: Bucket[] = ['settled_sales', 'settled_refunds', 'pending_sales', 'pending_refunds'];
const MAX_AMOUNT = '9007199254740991';

export interface CsvAnalyticsLimits {
  /** Approved byte limit; callers must also enforce this while reading files. */
  maxBytes: number;
  /** Approved number of data records, including duplicates, excluding the header. */
  maxRows: number;
}

export interface CsvAnalyticsError {
  code: 'INVALID_LIMITS' | 'BYTE_LIMIT_EXCEEDED' | 'ROW_LIMIT_EXCEEDED'
    | 'INVALID_UTF8' | 'BOM_FORBIDDEN' | 'EMPTY_INPUT' | 'MALFORMED_CSV'
    | 'SCHEMA_MISMATCH' | 'INVALID_ID' | 'INVALID_ENUM' | 'INVALID_AMOUNT'
    | 'AMOUNT_OUT_OF_RANGE' | 'CONFLICTING_EVENT';
  message: string;
  /** One-based logical CSV record (header = 1), not physical line. */
  row?: number;
  /** A schema field name, or one-based column before the schema is known. */
  field?: Field | number;
  event_id?: string;
  conflicting_row?: number;
}

export interface CurrencyMetrics {
  settled_sales_cents: string;
  settled_refunds_cents: string;
  net_cents: string;
  pending_sales_cents: string;
  pending_refunds_cents: string;
  counts: Record<Bucket, number>;
  empty_settled_group: boolean;
  empty_pending_group: boolean;
}

export interface CsvAnalyticsMetrics {
  USD: CurrencyMetrics;
  EUR: CurrencyMetrics;
  raw_rows: number;
  unique_events: number;
  duplicate_rows: number;
  empty_input: boolean;
}

interface Envelope {
  contract_digest: string;
  input_sha256: string;
}

export type CsvAnalyticsResult =
  | (Envelope & { status: 'PASS_DATA'; errors: []; metrics: CsvAnalyticsMetrics })
  | (Envelope & { status: 'BLOCKED_INPUT'; errors: CsvAnalyticsError[]; metrics?: never });

class InputError extends Error {
  constructor(readonly diagnostic: CsvAnalyticsError) {
    super(diagnostic.message);
  }
}

function invalid(diagnostic: CsvAnalyticsError): never {
  throw new InputError(diagnostic);
}

/**
 * Strict RFC4180 field quoting, with LF and CRLF record separators. No relaxed
 * quotes, skipped empty lines, BOM stripping, trimming, or type coercion.
 * No suitable CSV package is installed in this workspace.
 */
function parseCsv(text: string, maxRows: number): string[][] {
  const records: string[][] = [];
  let fields: string[] = [];
  let value = '';
  let state: 'start' | 'unquoted' | 'quoted' | 'closed' = 'start';
  let recordStarted = false;
  const fail = (message: string): never => invalid({
    code: 'MALFORMED_CSV', message, row: records.length + 1, field: fields.length + 1,
  });
  const finishField = () => {
    fields.push(value);
    value = '';
    state = 'start';
    // Every valid record has exactly six columns. Bound delimiter-heavy input.
    if (fields.length > FIELDS.length) {
      invalid({ code: 'SCHEMA_MISMATCH', message: 'Expected exactly six columns.', row: records.length + 1, field: fields.length });
    }
  };
  const finishRecord = () => {
    finishField();
    if (records.length > maxRows) {
      invalid({ code: 'ROW_LIMIT_EXCEEDED', message: 'Approved data row limit exceeded.', row: records.length + 1 });
    }
    records.push(fields);
    fields = [];
    recordStarted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    recordStarted = true;
    if (char === '\r' && text[i + 1] !== '\n') fail('Bare CR is not an allowed line ending.');
    if (state === 'quoted') {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          state = 'closed';
        }
      } else {
        value += char;
      }
      continue;
    }
    if (char === ',') {
      finishField();
    } else if (char === '\n' || char === '\r') {
      if (char === '\r') i++;
      finishRecord();
    } else if (char === '"' && state === 'start') {
      state = 'quoted';
    } else if (char === '"' || state === 'closed') {
      fail('Unexpected character in CSV quoting.');
    } else {
      value += char;
      state = 'unquoted';
    }
  }
  if (state === 'quoted') fail('Unterminated quoted field.');
  if (recordStarted) finishRecord();
  return records;
}

function matchesEntirely(pattern: RegExp, value: string): boolean {
  // JavaScript $ also matches before a final newline; require the entire match.
  return pattern.exec(value)?.[0] === value;
}

type Event = Record<Field, string> & { sourceRow: number };

function validateRecords(records: string[][]): Event[] {
  const header = records[0];
  if (!header) invalid({ code: 'EMPTY_INPUT', message: 'A header is required.', row: 1 });
  if (header.length !== FIELDS.length || new Set(header).size !== FIELDS.length
    || header.some(field => !FIELDS.includes(field as Field))) {
    invalid({ code: 'SCHEMA_MISMATCH', message: 'Header must contain exactly the six unique contract columns.', row: 1 });
  }
  const positions = FIELDS.map(field => header.indexOf(field));
  return records.slice(1).map((values, index) => {
    const row = index + 2;
    if (values.length !== FIELDS.length) {
      invalid({ code: 'SCHEMA_MISMATCH', message: 'Expected exactly six columns.', row });
    }
    const parsed = Object.fromEntries(FIELDS.map((field, i) => [field, values[positions[i]]])) as Record<Field, string>;
    const event: Event = { ...parsed, sourceRow: row };
    for (const field of ['event_id', 'order_id'] as const) {
      if (!matchesEntirely(/^[A-Za-z0-9_-]{1,64}$/, event[field])) {
        invalid({ code: 'INVALID_ID', message: 'ID must contain 1–64 ASCII letters, digits, underscores or hyphens.', row, field });
      }
    }
    for (const [field, allowed] of [
      ['currency', ['USD', 'EUR']], ['kind', ['sale', 'refund']], ['status', ['settled', 'pending']],
    ] as const) {
      if (!(allowed as readonly string[]).includes(event[field])) {
        invalid({ code: 'INVALID_ENUM', message: 'Value is outside the contract enum.', row, field });
      }
    }
    if (!matchesEntirely(/^(0|[1-9][0-9]*)$/, event.amount_cents)) {
      invalid({ code: 'INVALID_AMOUNT', message: 'Amount must be a canonical nonnegative decimal integer.', row, field: 'amount_cents' });
    }
    // Compare canonical decimal strings BEFORE conversion, including huge tokens.
    if (event.amount_cents.length > MAX_AMOUNT.length
      || (event.amount_cents.length === MAX_AMOUNT.length && event.amount_cents > MAX_AMOUNT)) {
      invalid({ code: 'AMOUNT_OUT_OF_RANGE', message: 'Individual amount exceeds 9007199254740991 cents.', row, field: 'amount_cents' });
    }
    return event;
  });
}

function aggregate(events: Event[]): CsvAnalyticsMetrics {
  const unique = new Map<string, Event>();
  for (const event of events) {
    const previous = unique.get(event.event_id);
    if (!previous) unique.set(event.event_id, event);
    else if (FIELDS.some(field => previous[field] !== event[field])) {
      invalid({ code: 'CONFLICTING_EVENT', message: 'Event ID has conflicting parsed fields.',
        row: event.sourceRow, field: 'event_id', event_id: event.event_id, conflicting_row: previous.sourceRow });
    }
  }
  const group = (currency: Currency): CurrencyMetrics => {
    const amounts: Record<Bucket, bigint> = { settled_sales: 0n, settled_refunds: 0n, pending_sales: 0n, pending_refunds: 0n };
    const counts: Record<Bucket, number> = { settled_sales: 0, settled_refunds: 0, pending_sales: 0, pending_refunds: 0 };
    for (const event of unique.values()) {
      if (event.currency !== currency) continue;
      const bucket = `${event.status}_${event.kind === 'sale' ? 'sales' : 'refunds'}` as Bucket;
      amounts[bucket] += BigInt(event.amount_cents);
      counts[bucket]++;
    }
    return {
      settled_sales_cents: amounts.settled_sales.toString(),
      settled_refunds_cents: amounts.settled_refunds.toString(),
      net_cents: (amounts.settled_sales - amounts.settled_refunds).toString(),
      pending_sales_cents: amounts.pending_sales.toString(),
      pending_refunds_cents: amounts.pending_refunds.toString(),
      counts,
      empty_settled_group: counts.settled_sales + counts.settled_refunds === 0,
      empty_pending_group: counts.pending_sales + counts.pending_refunds === 0,
    };
  };
  return {
    USD: group('USD'), EUR: group('EUR'), raw_rows: events.length,
    unique_events: unique.size, duplicate_rows: events.length - unique.size, empty_input: events.length === 0,
  };
}

/**
 * Pure, deterministic byte-to-result engine: no files, environment, network,
 * credentials, tool execution or floating-point money. Limits are mandatory.
 * Input bytes must already have been acquired under the approved read limit.
 * All records validate before deduplication; all conflicts resolve before sums.
 * Returns the first diagnostic; BLOCKED_INPUT never includes partial metrics.
 */
export function analyzeCsvAnalytics(input: Uint8Array, limits: CsvAnalyticsLimits): CsvAnalyticsResult {
  const envelope: Envelope = {
    contract_digest: CSV_ANALYTICS_CONTRACT_DIGEST,
    input_sha256: createHash('sha256').update(input).digest('hex'),
  };
  try {
    if (!limits || !Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 0
      || !Number.isSafeInteger(limits.maxRows) || limits.maxRows < 0) {
      invalid({ code: 'INVALID_LIMITS', message: 'Explicit nonnegative safe integer byte and row limits are required.' });
    }
    if (input.byteLength > limits.maxBytes) {
      invalid({ code: 'BYTE_LIMIT_EXCEEDED', message: 'Approved input byte limit exceeded.' });
    }
    if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
      invalid({ code: 'BOM_FORBIDDEN', message: 'UTF-8 BOM is forbidden.', row: 1, field: 1 });
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
    } catch {
      invalid({ code: 'INVALID_UTF8', message: 'Input must be valid UTF-8.' });
    }
    const events = validateRecords(parseCsv(text, limits.maxRows));
    return { ...envelope, status: 'PASS_DATA', errors: [], metrics: aggregate(events) };
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    return { ...envelope, status: 'BLOCKED_INPUT', errors: [error.diagnostic] };
  }
}

/** Human-readable text derived only from the verified result, in exact cents. */
export function renderCsvAnalyticsReport(result: CsvAnalyticsResult): string {
  const lines = [`Status: ${result.status}`, `Contract SHA-256: ${result.contract_digest}`, `Input SHA-256: ${result.input_sha256}`];
  if (result.status === 'BLOCKED_INPUT') {
    for (const error of result.errors) lines.push(`${error.code}: ${error.message}${error.row === undefined ? '' : ` (record ${error.row}${error.field === undefined ? '' : `, field ${error.field}`})`}`);
    return lines.join('\n');
  }
  lines.push('Metric: net = settled sales minus settled refunds, after exact event deduplication.',
    'Units: integer cents; USD and EUR each have currency scale 2. Currencies are separate; no FX conversion.',
    'Exclusions: pending events are excluded from settled net and reported separately.',
    'Descriptive data aggregation only; no causal inference or financial-audit claim.',
    `Rows: raw=${result.metrics.raw_rows}, unique=${result.metrics.unique_events}, duplicates=${result.metrics.duplicate_rows}; empty_input=${result.metrics.empty_input}`);
  for (const currency of ['USD', 'EUR'] as const) {
    const metrics = result.metrics[currency];
    lines.push(`${currency}: net_cents=${metrics.net_cents}; empty_settled_group=${metrics.empty_settled_group}; empty_pending_group=${metrics.empty_pending_group}`);
    for (const bucket of BUCKETS) lines.push(`  ${bucket}: cents=${metrics[`${bucket}_cents`]}, count=${metrics.counts[bucket]}`);
  }
  return lines.join('\n');
}
