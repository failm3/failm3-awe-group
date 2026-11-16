#!/usr/bin/env node
// observation-digest-v1 — local, dependency-free observation digest procedure.
//
// Invocation (fixed, both args required, no placeholders):
//   node -- <this-file> <input-observations.json> <output-root-dir>
//
// Reads the JSON observation fixture, computes exact totals with integer
// arithmetic (no floating point drift in counts), and persists:
//   <output-root>/digest.json  — machine-readable digest
//   <output-root>/digest.md    — human-readable digest with the same values
//   <output-root>/receipt.json — invocation receipt (not part of the digest)
//
// Determinism: stable key order, LF line endings, trailing newline, no
// timestamps or environment data in digest.json / digest.md.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const COUNT_KEYS = ['scheduled', 'completed', 'incidents'];

function fail(msg) {
  process.stderr.write(`observation-digest-v1: ${msg}\n`);
  process.exit(1);
}

const [inputPath, outRoot] = process.argv.slice(2);
if (!inputPath || !outRoot) {
  fail('usage: node -- observation-digest-v1.mjs <input.json> <output-root-dir>');
}
if (process.argv.length > 4) {
  fail('unexpected extra arguments');
}

const inAbs = resolve(inputPath);
const outAbs = resolve(outRoot);

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

// ---- read + validate -------------------------------------------------------
const rawBytes = readFileSync(inAbs);
let doc;
try {
  doc = JSON.parse(rawBytes.toString('utf8'));
} catch (e) {
  fail(`input is not valid JSON: ${e.message}`);
}

const rows = doc.observations;
if (!Array.isArray(rows) || rows.length === 0) {
  fail('input.observations must be a non-empty array');
}

const counts = { scheduled: 0, completed: 0, incidents: 0 };
const sites = new Map();

rows.forEach((row, idx) => {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    fail(`observation[${idx}] must be an object`);
  }
  if (typeof row.site !== 'string' || row.site.length === 0) {
    fail(`observation[${idx}].site must be a non-empty string`);
  }
  for (const key of COUNT_KEYS) {
    const v = row[key];
    if (!Number.isInteger(v) || v < 0) {
      fail(`observation[${idx}].${key} must be a non-negative integer`);
    }
    counts[key] += v;
  }
  if (row.completed > row.scheduled) {
    fail(`observation[${idx}] completed exceeds scheduled`);
  }
  if (!sites.has(row.site)) {
    sites.set(row.site, { scheduled: 0, completed: 0, incidents: 0 });
  }
  const t = sites.get(row.site);
  for (const key of COUNT_KEYS) t[key] += row[key];
});

// ---- exact arithmetic ------------------------------------------------------
// completion_percent, 2 decimals, round-half-up, computed in integers:
//   basis points = round(completed * 10000 / scheduled), then /100.
const scheduled = counts.scheduled;
const completed = counts.completed;
if (scheduled <= 0) {
  fail('total scheduled must be greater than zero');
}
const basisPoints = Math.floor((completed * 10000 * 2 + scheduled) / (2 * scheduled));
const completionPercent = basisPoints / 100;

// Cross-check: site totals must reconcile with the overall totals.
const siteNames = [...sites.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
let siteSum = { scheduled: 0, completed: 0, incidents: 0 };
const sitesOut = {};
for (const name of siteNames) {
  const t = sites.get(name);
  sitesOut[name] = {
    scheduled: t.scheduled,
    completed: t.completed,
    incidents: t.incidents,
  };
  for (const key of COUNT_KEYS) siteSum[key] += t[key];
}
for (const key of COUNT_KEYS) {
  if (siteSum[key] !== counts[key]) {
    fail(`site totals for ${key} do not reconcile with overall total`);
  }
}

// ---- digest.json -----------------------------------------------------------
const digest = {
  source: typeof doc.source === 'string' ? doc.source : null,
  period: typeof doc.period === 'string' ? doc.period : null,
  row_count: rows.length,
  scheduled,
  completed,
  incidents: counts.incidents,
  completion_percent: completionPercent,
  sites: sitesOut,
};

// Nulls are only used when the fixture genuinely lacks source/period; drop them.
if (digest.source === null) delete digest.source;
if (digest.period === null) delete digest.period;

const digestJson = JSON.stringify(digest, null, 2) + '\n';

// ---- digest.md -------------------------------------------------------------
const pctLiteral = completionPercent.toFixed(2);

function row(label, s, c, i) {
  return `| ${label} | ${s} | ${c} | ${i} |`;
}

const mdLines = [
  '# Observation digest (observation-digest-v1)',
  '',
  `- Source: ${digest.source ?? '(unspecified)'}`,
  `- Period: ${digest.period ?? '(unspecified)'}`,
  `- Rows: ${digest.row_count}`,
  '',
  '## Totals',
  '',
  '| Measure | Value |',
  '| --- | --- |',
  `| row_count | ${digest.row_count} |`,
  `| scheduled | ${scheduled} |`,
  `| completed | ${completed} |`,
  `| incidents | ${digest.incidents} |`,
  `| completion_percent | ${pctLiteral} |`,
  '',
  '## By site',
  '',
  '| Site | scheduled | completed | incidents |',
  '| --- | --- | --- | --- |',
  ...siteNames.map((n) => row(n, sitesOut[n].scheduled, sitesOut[n].completed, sitesOut[n].incidents)),
  row('**total**', scheduled, completed, digest.incidents),
  '',
  '## Method (reproducible)',
  '',
  '1. Parse the input JSON fixture and take the `observations` array.',
  `2. \`row_count\` is the number of observation rows (${digest.row_count}).`,
  '3. `scheduled`, `completed` and `incidents` are exact integer sums over all rows.',
  '4. Site totals are exact integer sums per `site` value; the per-site columns',
  '   reconcile to the overall totals (checked at runtime).',
  '5. `completion_percent = completed / scheduled * 100`, rounded half-up to 2',
  `   decimals using integer arithmetic on basis points:`,
  `   floor((completed*10000*2 + scheduled) / (2*scheduled)) / 100`,
  `   = floor((${completed}*10000*2 + ${scheduled}) / (2*${scheduled})) / 100`,
  `   = ${basisPoints} / 100 = ${pctLiteral}.`,
  '6. The same procedure writes this file and `digest.json` from the same',
  '   computed values, so both carry identical figures.',
  '',
];

const digestMd = mdLines.join('\n');

// ---- persist ---------------------------------------------------------------
mkdirSync(outAbs, { recursive: true });
const jsonPath = join(outAbs, 'digest.json');
const mdPath = join(outAbs, 'digest.md');
writeFileSync(jsonPath, digestJson, 'utf8');
writeFileSync(mdPath, digestMd, 'utf8');

const outJsonBytes = readFileSync(jsonPath);
const outMdBytes = readFileSync(mdPath);

// ---- invocation receipt ----------------------------------------------------
const selfBytes = readFileSync(new URL(import.meta.url));
const receipt = {
  procedure: 'observation-digest-v1',
  procedure_path: resolve(new URL(import.meta.url).pathname),
  procedure_sha256: sha256(selfBytes),
  node_version: process.version,
  argv: [inAbs, outAbs],
  input: { path: inAbs, bytes: rawBytes.length, sha256: sha256(rawBytes) },
  outputs: [
    { name: 'digest.json', bytes: outJsonBytes.length, sha256: sha256(outJsonBytes) },
    { name: 'digest.md', bytes: outMdBytes.length, sha256: sha256(outMdBytes) },
  ],
  totals: {
    row_count: digest.row_count,
    scheduled,
    completed,
    incidents: digest.incidents,
    completion_percent: pctLiteral,
  },
};
const receiptPath = join(outAbs, 'receipt.json');
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');

process.stdout.write(
  `observation-digest-v1: ${digest.row_count} rows, scheduled=${scheduled}, ` +
    `completed=${completed}, incidents=${digest.incidents}, ` +
    `completion_percent=${pctLiteral}\n`,
);
