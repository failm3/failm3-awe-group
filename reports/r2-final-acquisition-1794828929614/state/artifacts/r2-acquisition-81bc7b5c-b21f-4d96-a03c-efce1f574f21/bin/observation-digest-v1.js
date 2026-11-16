#!/usr/bin/env node
/*
 * observation-digest-v1  --  capability implementation
 *
 * Fixed contract (positional args, no flags, no placeholders):
 *   argv[2] = absolute path to the JSON observation fixture
 *   argv[3] = absolute path to the output directory
 *
 * Behaviour:
 *   - reads the fixture independently (no cached values, no hardcoded numbers)
 *   - validates the fixture shape strictly and fails loudly on bad input
 *   - computes exact integer row/site totals and the completion percentage
 *     using integer-only arithmetic with explicit half-up rounding to 2 dp
 *   - persists <out>/digest.json and <out>/digest.md
 *   - re-reads both written files, recomputes from bytes, and cross-checks
 *     per-site sums against the grand totals; exits non-zero on any mismatch
 *
 * Dependencies: Node.js standard library only (fs, path, crypto).
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REQUIRED_FIELDS = ['scheduled', 'completed', 'incidents'];

function fail(msg) {
  const err = new Error(msg);
  err.code = 'DIGEST_INPUT_INVALID';
  throw err;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireNonNegativeInt(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * Exact percent with 2 decimal places, half-up, integer-only arithmetic.
 * Returns hundredths of a percent (an integer) so no float drift is possible.
 */
function percentHundredths(numerator, denominator) {
  if (denominator === 0) return 0;
  const scaled = numerator * 10000; // percent * 100, scaled by 100
  let q = Math.floor(scaled / denominator);
  const r = scaled - q * denominator;
  if (2 * r >= denominator) q += 1; // half-up on the exact remainder
  return q;
}

function hundredthsToNumber(h) {
  return Number((h / 100).toFixed(2));
}

function hundredthsToFixed(h) {
  return (h / 100).toFixed(2);
}

function loadFixture(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    fail(`cannot read fixture at ${filePath}: ${e.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    fail(`fixture is not valid JSON: ${e.message}`);
  }
  if (!isPlainObject(doc)) fail('fixture root must be a JSON object');

  const rows = doc.observations;
  if (!Array.isArray(rows) || rows.length === 0) {
    fail('fixture.observations must be a non-empty array');
  }

  const observations = rows.map((row, i) => {
    if (!isPlainObject(row)) fail(`observations[${i}] must be an object`);
    const site = requireNonEmptyString(row.site, `observations[${i}].site`);
    const out = { site };
    for (const field of REQUIRED_FIELDS) {
      if (!(field in row)) fail(`observations[${i}] missing required field "${field}"`);
      out[field] = requireNonNegativeInt(row[field], `observations[${i}].${field}`);
    }
    return out;
  });

  return { doc, observations, raw };
}

function aggregate(observations) {
  const sites = new Map();
  let scheduled = 0;
  let completed = 0;
  let incidents = 0;

  for (const row of observations) {
    scheduled += row.scheduled;
    completed += row.completed;
    incidents += row.incidents;

    let s = sites.get(row.site);
    if (!s) {
      s = { site: row.site, row_count: 0, scheduled: 0, completed: 0, incidents: 0 };
      sites.set(row.site, s);
    }
    s.row_count += 1;
    s.scheduled += row.scheduled;
    s.completed += row.completed;
    s.incidents += row.incidents;
  }

  const siteKeys = [...sites.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const siteObject = {};
  for (const key of siteKeys) {
    const s = sites.get(key);
    const h = percentHundredths(s.completed, s.scheduled);
    siteObject[key] = {
      row_count: s.row_count,
      scheduled: s.scheduled,
      completed: s.completed,
      incidents: s.incidents,
      completion_percent: hundredthsToNumber(h),
    };
  }

  const totalHundredths = percentHundredths(completed, scheduled);

  return {
    row_count: observations.length,
    scheduled,
    completed,
    incidents,
    completion_percent: hundredthsToNumber(totalHundredths),
    completion_percent_fixed: hundredthsToFixed(totalHundredths),
    sites: siteObject,
    siteOrder: siteKeys,
  };
}

function buildJson(doc, agg) {
  const out = {
    source: typeof doc.source === 'string' ? doc.source : null,
    period: typeof doc.period === 'string' ? doc.period : null,
    row_count: agg.row_count,
    scheduled: agg.scheduled,
    completed: agg.completed,
    incidents: agg.incidents,
    completion_percent: agg.completion_percent,
    sites: agg.sites,
  };
  return out;
}

function buildMarkdown(json, agg) {
  const lines = [];
  lines.push('# Observation digest (observation-digest-v1)');
  lines.push('');
  lines.push(`- Source: ${json.source === null ? '(unspecified)' : json.source}`);
  lines.push(`- Period: ${json.period === null ? '(unspecified)' : json.period}`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | ---: |');
  lines.push(`| row_count | ${json.row_count} |`);
  lines.push(`| scheduled | ${json.scheduled} |`);
  lines.push(`| completed | ${json.completed} |`);
  lines.push(`| incidents | ${json.incidents} |`);
  lines.push(`| completion_percent | ${agg.completion_percent_fixed} |`);
  lines.push('');
  lines.push('## Sites');
  lines.push('');
  lines.push('| Site | row_count | scheduled | completed | incidents | completion_percent |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const key of agg.siteOrder) {
    const s = agg.sites[key];
    const fixed = (s.completion_percent).toFixed(2);
    lines.push(`| ${key} | ${s.row_count} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${fixed} |`);
  }
  lines.push('');
  lines.push('## Method (reproducible)');
  lines.push('');
  lines.push('1. Read the fixture JSON and require `observations` to be a non-empty array.');
  lines.push('2. Require every row to carry non-empty `site` and non-negative integers for');
  lines.push('   `scheduled`, `completed` and `incidents`; abort on any violation.');
  lines.push('3. `row_count` is the number of observation rows.');
  lines.push('4. `scheduled`, `completed` and `incidents` are exact integer sums over all rows.');
  lines.push('5. Per site, the same three sums are taken over rows whose `site` matches, in');
  lines.push('   ascending key order.');
  lines.push('6. `completion_percent = completed / scheduled * 100`, evaluated in integer');
  lines.push('   arithmetic as `round_half_up(completed * 10000 / scheduled) / 100` and');
  lines.push('   rendered with exactly 2 decimal places. When `scheduled` is 0 the value is');
  lines.push('   0.00 by definition.');
  lines.push('7. Cross-checks performed before the run is accepted: the per-site sums must');
  lines.push('   reproduce the grand totals, and the written files are re-parsed and');
  lines.push('   re-aggregated independently.');
  lines.push('');
  lines.push(`Cross-check: sum(site.scheduled) = ${json.scheduled}, sum(site.completed) = ${json.completed}, ` +
    `sum(site.incidents) = ${json.incidents}, sum(site.row_count) = ${json.row_count} — all equal the totals above.`);
  lines.push('');
  return lines.join('\n');
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function verifySitesAgainstTotals(sites, totals) {
  const sums = { row_count: 0, scheduled: 0, completed: 0, incidents: 0 };
  for (const key of Object.keys(sites)) {
    for (const f of Object.keys(sums)) sums[f] += sites[key][f];
  }
  for (const f of Object.keys(sums)) {
    if (sums[f] !== totals[f]) {
      fail(`internal inconsistency: sum of site.${f} (${sums[f]}) != total ${f} (${totals[f]})`);
    }
  }
}

function verifyWritten(jsonPath, mdPath, agg) {
  const onDisk = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  verifySitesAgainstTotals(onDisk.sites, onDisk);
  if (onDisk.row_count !== agg.row_count ||
      onDisk.scheduled !== agg.scheduled ||
      onDisk.completed !== agg.completed ||
      onDisk.incidents !== agg.incidents ||
      onDisk.completion_percent !== agg.completion_percent) {
    fail('internal inconsistency: re-read digest.json does not match computed totals');
  }
  const md = fs.readFileSync(mdPath, 'utf8');
  const required = [
    `| row_count | ${onDisk.row_count} |`,
    `| scheduled | ${onDisk.scheduled} |`,
    `| completed | ${onDisk.completed} |`,
    `| incidents | ${onDisk.incidents} |`,
    `| completion_percent | ${agg.completion_percent_fixed} |`,
  ];
  for (const needle of required) {
    if (!md.includes(needle)) fail(`internal inconsistency: digest.md missing "${needle}"`);
  }
  for (const key of Object.keys(onDisk.sites)) {
    const s = onDisk.sites[key];
    const needle = `| ${key} | ${s.row_count} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${s.completion_percent.toFixed(2)} |`;
    if (!md.includes(needle)) fail(`internal inconsistency: digest.md missing site row "${needle}"`);
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length !== 2) {
    process.stderr.write('usage: observation-digest-v1.js <observations.json> <output-dir>\n');
    return 2;
  }
  const [inputPath, outDir] = args;
  if (!path.isAbsolute(inputPath)) fail(`fixture path must be absolute: ${inputPath}`);
  if (!path.isAbsolute(outDir)) fail(`output directory must be absolute: ${outDir}`);

  const { doc, observations } = loadFixture(inputPath);
  const agg = aggregate(observations);
  const json = buildJson(doc, agg);
  verifySitesAgainstTotals(json.sites, json);

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'digest.json');
  const mdPath = path.join(outDir, 'digest.md');
  fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  fs.writeFileSync(mdPath, buildMarkdown(json, agg), 'utf8');

  verifyWritten(jsonPath, mdPath, agg);

  process.stdout.write(JSON.stringify({
    procedure: 'observation-digest-v1',
    node: process.version,
    args: [inputPath, outDir],
    outputs: {
      digest_json: jsonPath,
      digest_md: mdPath,
      digest_json_sha256: sha256File(jsonPath),
      digest_md_sha256: sha256File(mdPath),
    },
    computed: {
      row_count: json.row_count,
      scheduled: json.scheduled,
      completed: json.completed,
      incidents: json.incidents,
      completion_percent: json.completion_percent,
      sites: Object.keys(json.sites),
    },
    checks: ['input_validation', 'site_totals_reconcile', 'files_reread_and_reverified'],
  }, null, 2) + '\n');
  return 0;
}

try {
  process.exitCode = main(process.argv);
} catch (e) {
  process.stderr.write(`observation-digest-v1 failed: ${e.code || 'ERROR'}: ${e.message}\n`);
  process.exitCode = 1;
}
