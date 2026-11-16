#!/usr/bin/env node
'use strict';
/*
 * observation-digest-v1
 *
 * Purpose
 *   Read a JSON observation fixture, compute exact row/site totals and the
 *   completion percentage, and persist `digest.json` plus `digest.md` into the
 *   supplied artifacts root.
 *
 * Fixed invocation contract (exactly two argument slots, no placeholders):
 *   argv[2] = absolute path to the observations JSON file
 *   argv[3] = absolute path to the artifacts root (output directory)
 *
 * Determinism
 *   Output is a pure function of the input bytes: no timestamps, no clock, no
 *   randomness, no environment lookups beyond the two fixed arguments. Site
 *   keys are emitted in sorted order. Sorting is byte-order on the site name.
 *
 * Dependencies
 *   Node.js built-in modules only (fs, path, crypto). No packages, no network,
 *   no child processes, no shell, no evaluation of input data.
 *
 * Exit codes
 *   0  digest.json and digest.md written
 *   2  contract or data validation failure (nothing written)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROC = 'observation-digest-v1';
const ARG_COUNT = 2;
const METRIC_KEYS = ['scheduled', 'completed', 'incidents'];

function fail(message) {
  process.stderr.write(`${PROC}: ${message}\n`);
  process.exit(2);
}

function isCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/* completion_percent = 100 * completed / scheduled, rounded half-up to 2 dp. */
function percent(completed, scheduled) {
  if (scheduled === 0) return 0;
  const exact = (100 * completed) / scheduled;
  return Number(exact.toFixed(2));
}

function fixed2(value) {
  return Number(value).toFixed(2);
}

function emptyBucket(rowCount) {
  return { row_count: rowCount, scheduled: 0, completed: 0, incidents: 0 };
}

function main(argv) {
  const args = argv.slice(2);
  if (args.length !== ARG_COUNT) {
    fail(`expected exactly ${ARG_COUNT} arguments (observations.json, artifacts-root), received ${args.length}`);
  }
  const inputPath = args[0];
  const artifactsRoot = args[1];

  if (!path.isAbsolute(inputPath)) fail(`argument 1 must be an absolute path, received ${JSON.stringify(inputPath)}`);
  if (!path.isAbsolute(artifactsRoot)) fail(`argument 2 must be an absolute path, received ${JSON.stringify(artifactsRoot)}`);

  let inputBytes;
  try {
    inputBytes = fs.readFileSync(inputPath);
  } catch (error) {
    fail(`cannot read observations fixture ${inputPath}: ${error.message}`);
  }
  const inputSha256 = crypto.createHash('sha256').update(inputBytes).digest('hex');
  const procPath = path.resolve(argv[1]);

  let document;
  try {
    document = JSON.parse(inputBytes.toString('utf8'));
  } catch (error) {
    fail(`observations fixture is not valid JSON: ${error.message}`);
  }

  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    fail('observations fixture must be a JSON object with an "observations" array');
  }
  const rows = document.observations;
  if (!Array.isArray(rows) || rows.length === 0) {
    fail('"observations" must be a non-empty array');
  }

  const totals = emptyBucket(0);
  const sites = new Map();

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const where = `observations[${index}]`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) fail(`${where} must be an object`);
    if (typeof row.site !== 'string' || row.site.length === 0) fail(`${where}.site must be a non-empty string`);
    for (const key of METRIC_KEYS) {
      if (!isCount(row[key])) fail(`${where}.${key} must be a non-negative integer`);
    }

    totals.row_count += 1;
    totals.scheduled += row.scheduled;
    totals.completed += row.completed;
    totals.incidents += row.incidents;

    if (!sites.has(row.site)) sites.set(row.site, emptyBucket(0));
    const bucket = sites.get(row.site);
    bucket.row_count += 1;
    bucket.scheduled += row.scheduled;
    bucket.completed += row.completed;
    bucket.incidents += row.incidents;
  }

  const siteNames = Array.from(sites.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const siteTotals = {};
  for (const name of siteNames) {
    const bucket = sites.get(name);
    siteTotals[name] = {
      row_count: bucket.row_count,
      scheduled: bucket.scheduled,
      completed: bucket.completed,
      incidents: bucket.incidents,
      completion_percent: percent(bucket.completed, bucket.scheduled),
    };
  }

  const digest = {
    source: typeof document.source === 'string' ? document.source : null,
    period: typeof document.period === 'string' ? document.period : null,
    input_sha256: inputSha256,
    row_count: totals.row_count,
    scheduled: totals.scheduled,
    completed: totals.completed,
    incidents: totals.incidents,
    completion_percent: percent(totals.completed, totals.scheduled),
    sites: siteTotals,
  };

  const title = `${digest.source === null ? 'Observations' : digest.source}${digest.period === null ? '' : ` (${digest.period})`}`;
  const lines = [];
  lines.push(`# Observation Digest - ${title}`);
  lines.push('');
  lines.push('## Method');
  lines.push('');
  lines.push('Produced by the local procedure `observation-digest-v1` (Node.js built-ins only).');
  lines.push('');
  lines.push(`- Input fixture: \`${inputPath}\``);
  lines.push(`- Input SHA-256: \`${inputSha256}\``);
  lines.push(`- row_count: number of entries in the \`observations\` array.`);
  lines.push('- scheduled, completed, incidents: plain integer sums over all entries.');
  lines.push('- completion_percent: `100 * completed / scheduled`, rounded half-up to 2 decimals; `0` when scheduled is `0`.');
  lines.push('- Site totals: the same four sums plus row_count, grouped by the exact `site` string, sorted by site name.');
  lines.push(`- Reproduce exactly: \`node ${procPath} ${inputPath} ${artifactsRoot}\``);
  lines.push('');
  lines.push('## Overall totals');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  lines.push(`| row_count | ${digest.row_count} |`);
  lines.push(`| scheduled | ${digest.scheduled} |`);
  lines.push(`| completed | ${digest.completed} |`);
  lines.push(`| incidents | ${digest.incidents} |`);
  lines.push(`| completion_percent | ${fixed2(digest.completion_percent)} |`);
  lines.push('');
  lines.push('## Site totals');
  lines.push('');
  lines.push('| site | row_count | scheduled | completed | incidents | completion_percent |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const name of siteNames) {
    const s = siteTotals[name];
    lines.push(`| ${name} | ${s.row_count} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${fixed2(s.completion_percent)} |`);
  }
  lines.push(`| **TOTAL** | ${digest.row_count} | ${digest.scheduled} | ${digest.completed} | ${digest.incidents} | ${fixed2(digest.completion_percent)} |`);
  lines.push('');
  lines.push('Row sums reconcile with the TOTAL row above; the TOTAL row is the sum of the site rows.');
  lines.push('');

  const digestJsonText = `${JSON.stringify(digest, null, 2)}\n`;
  const digestMdText = `${lines.join('\n')}`;

  try {
    fs.mkdirSync(artifactsRoot, { recursive: true });
  } catch (error) {
    fail(`cannot create artifacts root ${artifactsRoot}: ${error.message}`);
  }

  const jsonPath = path.join(artifactsRoot, 'digest.json');
  const mdPath = path.join(artifactsRoot, 'digest.md');
  fs.writeFileSync(jsonPath, digestJsonText, 'utf8');
  fs.writeFileSync(mdPath, digestMdText, 'utf8');

  const receipt = {
    procedure: PROC,
    input: inputPath,
    input_sha256: inputSha256,
    outputs: [
      { path: jsonPath, bytes: Buffer.byteLength(digestJsonText, 'utf8'), sha256: crypto.createHash('sha256').update(digestJsonText, 'utf8').digest('hex') },
      { path: mdPath, bytes: Buffer.byteLength(digestMdText, 'utf8'), sha256: crypto.createHash('sha256').update(digestMdText, 'utf8').digest('hex') },
    ],
    row_count: digest.row_count,
    completion_percent: digest.completion_percent,
  };
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

main(process.argv);
