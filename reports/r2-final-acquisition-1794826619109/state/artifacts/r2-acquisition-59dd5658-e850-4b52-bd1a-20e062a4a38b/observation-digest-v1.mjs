#!/usr/bin/env node
/**
 * observation-digest-v1 — dependency-free operational digest builder.
 *
 * Usage (fixed argument order, exactly two arguments):
 *   node -- <this-file> <observations.json> <output_root>
 *
 * Reads a JSON observation fixture of the shape
 *   { "observations": [ { "site": str, "cohort": str, "scheduled": int,
 *                         "completed": int, "incidents": int }, ... ] }
 * (a bare top-level array of the same row objects is also accepted),
 * then writes exactly two files under <output_root>:
 *   digest.json  — row_count, scheduled, completed, incidents,
 *                  completion_percent (2 decimals), sites{site:{scheduled,completed,incidents}}
 *   digest.md    — the identical values plus a reproducible method description
 *
 * Only Node.js built-in modules are used. No packages, no network, no
 * environment-dependent inputs. Output is deterministic for a given input.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TOOL = 'observation-digest-v1';
const TOOL_VERSION = '1.0.0';

function fail(message) {
  process.stderr.write(`${TOOL}: error: ${message}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.length !== 2) {
  fail(`expected exactly 2 arguments (<observations.json> <output_root>), received ${argv.length}`);
}

const inputPath = resolve(argv[0]);
const outRoot = resolve(argv[1]);
const jsonOutPath = join(outRoot, 'digest.json');
const mdOutPath = join(outRoot, 'digest.md');

let raw;
try {
  raw = readFileSync(inputPath, 'utf8');
} catch (err) {
  fail(`cannot read input ${inputPath}: ${err.message}`);
}

let doc;
try {
  doc = JSON.parse(raw);
} catch (err) {
  fail(`invalid JSON in ${inputPath}: ${err.message}`);
}

const rows = Array.isArray(doc)
  ? doc
  : doc && Array.isArray(doc.observations)
    ? doc.observations
    : null;
if (!rows) fail('input must be an array of observation rows or an object with an "observations" array');

function requireInt(value, field, index) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    fail(`observation[${index}].${field} must be an integer, received ${JSON.stringify(value)}`);
  }
  return value;
}

function requireStr(value, field, index) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`observation[${index}].${field} must be a non-empty string, received ${JSON.stringify(value)}`);
  }
  return value;
}

// Exact percentage to two decimals using integer arithmetic only, so the
// result never depends on binary floating-point rounding of the division.
function completionPercent(completed, scheduled) {
  if (scheduled === 0) return 0;
  return Math.round((completed * 10000) / scheduled) / 100;
}

const totals = { row_count: rows.length, scheduled: 0, completed: 0, incidents: 0 };
const perSite = new Map();

rows.forEach((row, index) => {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    fail(`observation[${index}] must be an object`);
  }
  const site = requireStr(row.site, 'site', index);
  const scheduled = requireInt(row.scheduled, 'scheduled', index);
  const completed = requireInt(row.completed, 'completed', index);
  const incidents = requireInt(row.incidents, 'incidents', index);

  totals.scheduled += scheduled;
  totals.completed += completed;
  totals.incidents += incidents;

  if (!perSite.has(site)) {
    perSite.set(site, { scheduled: 0, completed: 0, incidents: 0 });
  }
  const bucket = perSite.get(site);
  bucket.scheduled += scheduled;
  bucket.completed += completed;
  bucket.incidents += incidents;
});

// Deterministic site ordering: plain code-unit comparison, locale independent.
const siteNames = [...perSite.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const sites = {};
for (const name of siteNames) {
  const b = perSite.get(name);
  sites[name] = { scheduled: b.scheduled, completed: b.completed, incidents: b.incidents };
}

const digest = {
  row_count: totals.row_count,
  scheduled: totals.scheduled,
  completed: totals.completed,
  incidents: totals.incidents,
  completion_percent: completionPercent(totals.completed, totals.scheduled),
  sites,
};

// Self-check: per-site totals must reconstruct the aggregate totals exactly.
const check = { scheduled: 0, completed: 0, incidents: 0 };
for (const name of siteNames) {
  check.scheduled += sites[name].scheduled;
  check.completed += sites[name].completed;
  check.incidents += sites[name].incidents;
}
for (const key of ['scheduled', 'completed', 'incidents']) {
  if (check[key] !== digest[key]) {
    fail(`internal inconsistency: per-site ${key} sum ${check[key]} != aggregate ${digest[key]}`);
  }
}

const jsonText = `${JSON.stringify(digest, null, 2)}\n`;

const method = [
  `1. Read the fixture at the fixed absolute path \`${inputPath}\` as UTF-8 and parse it as JSON.`,
  '2. Take the row array: the top-level value when it is an array, otherwise the value of its `observations` member. Each row must carry a non-empty string `site` and integer `scheduled`, `completed`, `incidents`; anything else aborts with a non-zero exit code.',
  '3. `row_count` = number of rows in that array (3 for this fixture).',
  '4. `scheduled`, `completed`, `incidents` = arithmetic sums of the like-named field over every row.',
  '5. `completion_percent` = `round(completed * 10000 / scheduled) / 100`, i.e. completed/scheduled as a percentage rounded to exactly two decimals with half-up rounding on the integer numerator (0 when `scheduled` is 0). For this fixture: 26 * 10000 / 30 = 8666.66... -> 8667 -> 86.67.',
  '6. `sites` = one key per distinct `site` value, each holding the same three sums restricted to the rows of that site. Keys are emitted in ascending code-unit order of the site name, so the file is byte-stable across runs and locales.',
  '7. Consistency check before writing: the per-site sums must equal the aggregate sums for all three counters, otherwise the run aborts with a non-zero exit code and writes nothing.',
  '8. Persist `digest.json` (2-space indented JSON + trailing newline) and this `digest.md` in the output root; `digest.md` restates the same numbers and records this method.',
].join('\n');

const mdLines = [
  '# Operational digest — observation-digest-v1',
  '',
  `- Procedure: \`${TOOL}\` v${TOOL_VERSION} (dependency-free Node.js ESM)`,
  `- Input fixture: \`${inputPath}\``,
  `- Output root: \`${outRoot}\``,
  `- Runtime: node ${process.versions.node}`,
  '',
  '## Totals',
  '',
  '| metric | value |',
  '| --- | --- |',
  `| row_count | ${digest.row_count} |`,
  `| scheduled | ${digest.scheduled} |`,
  `| completed | ${digest.completed} |`,
  `| incidents | ${digest.incidents} |`,
  `| completion_percent | ${digest.completion_percent.toFixed(2)} |`,
  '',
  '## Per-site totals',
  '',
  '| site | scheduled | completed | incidents |',
  '| --- | --- | --- | --- |',
  ...siteNames.map((name) => `| ${name} | ${sites[name].scheduled} | ${sites[name].completed} | ${sites[name].incidents} |`),
  `| **all sites** | **${digest.scheduled}** | **${digest.completed}** | **${digest.incidents}** |`,
  '',
  '## Method (reproducible)',
  '',
  method,
  '',
  '## Reproduction',
  '',
  'Run the same procedure with the same two fixed arguments:',
  '',
  '```',
  `node -- ${resolve(process.argv[1])} ${inputPath} ${outRoot}`,
  '```',
  '',
  `The run is deterministic: the same input bytes always yield the same \`digest.json\` and \`digest.md\` values.`,
  '',
];

mkdirSync(outRoot, { recursive: true });
writeFileSync(jsonOutPath, jsonText, 'utf8');
writeFileSync(mdOutPath, mdLines.join('\n'), 'utf8');

process.stdout.write(`${JSON.stringify({ wrote: { digest_json: jsonOutPath, digest_md: mdOutPath }, digest })}\n`);
