#!/usr/bin/env node
// observation-digest-v1
// Reads a JSON observation fixture and writes an exact operational digest
// (digest.json + digest.md) into the supplied output root.
//
// Usage: node observation_digest_v1.mjs <input.observations.json> <output-root>
//
// Deterministic by construction: no clocks, no environment reads, no network,
// no randomness. Identical input bytes always yield identical output bytes.
//
// Exit codes: 0 success, 2 usage error, 3 invalid fixture, 4 self-check failed.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const USAGE = 'usage: node observation_digest_v1.mjs <input.observations.json> <output-root>';

function fail(code, message) {
  process.stderr.write(`observation-digest-v1: ${message}\n`);
  process.exit(code);
}

const argv = process.argv.slice(2);
if (argv.length !== 2) fail(2, USAGE);

const inputPath = resolve(argv[0]);
const outputRoot = resolve(argv[1]);

// ---- load fixture -------------------------------------------------------
let doc;
try {
  doc = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (err) {
  fail(3, `cannot read/parse input ${inputPath}: ${err.message}`);
}

if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
  fail(3, 'input must be a JSON object');
}
const observations = doc.observations;
if (!Array.isArray(observations) || observations.length === 0) {
  fail(3, 'input.observations must be a non-empty array');
}

// Every row must carry a site label and three non-negative integer counters.
// Validation is strict so a malformed fixture can never silently produce a
// plausible-looking digest.
function counter(row, field, index) {
  const value = row[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(3, `observations[${index}].${field} must be a non-negative integer`);
  }
  return value;
}

// ---- exact arithmetic ---------------------------------------------------
// Reproduce 2-decimal percentages with integer math only:
//   percent = round(completed * 10000 / scheduled) / 100
// This avoids binary floating-point drift in the division step, so the same
// bytes always round the same way (half away from zero on the integer).
function completionPercent(completed, scheduled) {
  if (scheduled === 0) return 0;
  return Math.round((completed * 10000) / scheduled) / 100;
}

const totals = { row_count: 0, scheduled: 0, completed: 0, incidents: 0 };
const bySite = new Map();

observations.forEach((row, index) => {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    fail(3, `observations[${index}] must be an object`);
  }
  const site = row.site;
  if (typeof site !== 'string' || site.trim() === '') {
    fail(3, `observations[${index}].site must be a non-empty string`);
  }
  const scheduled = counter(row, 'scheduled', index);
  const completed = counter(row, 'completed', index);
  const incidents = counter(row, 'incidents', index);

  totals.row_count += 1;
  totals.scheduled += scheduled;
  totals.completed += completed;
  totals.incidents += incidents;

  const bucket = bySite.get(site) ?? { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
  bucket.rows += 1;
  bucket.scheduled += scheduled;
  bucket.completed += completed;
  bucket.incidents += incidents;
  bySite.set(site, bucket);
});

const sites = {};
for (const site of [...bySite.keys()].sort()) {
  const b = bySite.get(site);
  sites[site] = {
    rows: b.rows,
    scheduled: b.scheduled,
    completed: b.completed,
    incidents: b.incidents,
    completion_percent: completionPercent(b.completed, b.scheduled),
  };
}

const digest = {
  source: typeof doc.source === 'string' ? doc.source : null,
  period: typeof doc.period === 'string' ? doc.period : null,
  row_count: totals.row_count,
  scheduled: totals.scheduled,
  completed: totals.completed,
  incidents: totals.incidents,
  completion_percent: completionPercent(totals.completed, totals.scheduled),
  sites,
};

// ---- JSON emitter -------------------------------------------------------
// JSON has no fixed-decimal numeric type, so a percentage of exactly 100
// would otherwise serialize as the token `100` and lose the "2 decimals"
// requirement in the machine-readable file. This writer emits every
// `completion_percent` value as a JSON number token with exactly two decimal
// places (`100.00`, `86.67`, `0.00`). Trailing-zero fraction digits are valid
// JSON number syntax and parse back to the same numeric value, so the file
// stays an exact numeric document while literally carrying 2 decimals.
const FIXED2_KEYS = new Set(['completion_percent']);

function emit(value, depth, key) {
  const pad = '  '.repeat(depth);
  const inner = '  '.repeat(depth + 1);

  if (value === null) return 'null';

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(4, `refusing to serialize non-finite number at ${key}`);
    if (FIXED2_KEYS.has(key)) return value.toFixed(2);
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }

  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${inner}${emit(v, depth + 1, null)}`).join(',\n')}\n${pad}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const body = keys
      .map((k) => `${inner}${JSON.stringify(k)}: ${emit(value[k], depth + 1, k)}`)
      .join(',\n');
    return `{\n${body}\n${pad}}`;
  }

  fail(4, `refusing to serialize value of type ${typeof value} at ${key}`);
}

const digestJson = `${emit(digest, 0, null)}\n`;

// Self-check: the emitted text must parse back to numerically identical
// values, and every percentage token must carry exactly two decimals.
// A broken emitter therefore cannot silently ship.
{
  const reparsed = JSON.parse(digestJson);
  if (reparsed.scheduled !== digest.scheduled || reparsed.completed !== digest.completed) {
    fail(4, 'digest.json round-trip self-check failed on integer totals');
  }
  if (reparsed.completion_percent !== digest.completion_percent) {
    fail(4, 'digest.json round-trip self-check failed on completion_percent');
  }
  for (const site of Object.keys(digest.sites)) {
    if (reparsed.sites[site].completion_percent !== digest.sites[site].completion_percent) {
      fail(4, `digest.json round-trip self-check failed on sites.${site}.completion_percent`);
    }
  }
  const tokens = digestJson.match(/"completion_percent": ([0-9]+\.[0-9]+)/g) ?? [];
  const expectedTokens = 1 + Object.keys(digest.sites).length;
  if (tokens.length !== expectedTokens) {
    fail(4, `expected ${expectedTokens} two-decimal percentage tokens, found ${tokens.length}`);
  }
  for (const token of tokens) {
    const frac = token.split('.')[1];
    if (frac.length !== 2) fail(4, `percentage token lacks exactly two decimals: ${token}`);
  }
}

// ---- render -------------------------------------------------------------
const pct = (n) => n.toFixed(2);

const md = [];
md.push(`# Observation digest${digest.source ? ` — ${digest.source}` : ''}${digest.period ? ` (${digest.period})` : ''}`);
md.push('');
md.push('## Totals');
md.push('');
md.push('| Metric | Value |');
md.push('| --- | --- |');
md.push(`| Rows | ${digest.row_count} |`);
md.push(`| Scheduled | ${digest.scheduled} |`);
md.push(`| Completed | ${digest.completed} |`);
md.push(`| Incidents | ${digest.incidents} |`);
md.push(`| Completion % | ${pct(digest.completion_percent)} |`);
md.push('');
md.push('## By site');
md.push('');
md.push('| Site | Rows | Scheduled | Completed | Incidents | Completion % |');
md.push('| --- | --- | --- | --- | --- | --- |');
for (const [site, s] of Object.entries(sites)) {
  md.push(
    `| ${site} | ${s.rows} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${pct(s.completion_percent)} |`,
  );
}
md.push('');
md.push('## Method');
md.push('');
md.push('Reproducible and arithmetic-checkable:');
md.push('');
md.push('1. Read every element of `observations` in the source fixture, in file order.');
md.push('2. `row_count` is the length of that array.');
md.push('3. `scheduled`, `completed` and `incidents` are plain sums of the like-named integer field over all rows.');
md.push('4. `completion_percent = round(completed * 10000 / scheduled) / 100`, i.e. completed/scheduled as a percentage rounded to exactly two decimals using integer arithmetic (no floating-point drift, ties rounded away from zero). A site with zero scheduled rows reports 0.00.');
md.push('5. The `sites` object groups rows by the `site` field, sorted by site name; each site carries its own `rows`, `scheduled`, `completed`, `incidents` and two-decimal `completion_percent` computed by the same rule. Site totals are independent sums, not apportioned from the grand total.');
md.push('6. Percentages are rendered with `toFixed(2)` in this document and emitted as JSON number tokens with exactly two decimal places (`100.00`, not `100`) in `digest.json`; trailing-zero fraction digits are valid JSON number syntax and parse to the same value, so both files carry the 2 decimals literally.');
md.push('');
md.push('Cross-check: the sum of per-site `scheduled`/`completed`/`incidents` equals the grand totals, because both are sums over the same rows.');
md.push('');

// ---- persist ------------------------------------------------------------
mkdirSync(outputRoot, { recursive: true });
writeFileSync(join(outputRoot, 'digest.json'), digestJson, 'utf8');
writeFileSync(join(outputRoot, 'digest.md'), md.join('\n'), 'utf8');

process.stdout.write(
  `observation-digest-v1: wrote ${join(outputRoot, 'digest.json')} and ${join(outputRoot, 'digest.md')} ` +
    `(rows=${digest.row_count} scheduled=${digest.scheduled} completed=${digest.completed} ` +
    `incidents=${digest.incidents} completion_percent=${pct(digest.completion_percent)})\n`,
);
