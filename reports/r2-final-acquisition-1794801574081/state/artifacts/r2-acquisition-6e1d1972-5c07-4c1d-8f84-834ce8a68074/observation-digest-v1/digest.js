'use strict';

/*
 * observation-digest-v1
 * ---------------------------------------------------------------------------
 * Dependency-free Node.js procedure (builtins only, no npm packages, no
 * network, no child processes, no writes outside the caller-supplied
 * output directory).
 *
 * CLI contract (the only supported entry point):
 *
 *     node -- <this-file> <observations.json> <output-dir>
 *
 * Reads the JSON observation fixture, computes exact row / column / per-site
 * totals and a 2-decimal completion percentage, and persists:
 *
 *     <output-dir>/digest.json   machine-readable digest
 *     <output-dir>/digest.md     same values, human-readable + method
 *
 * Determinism rules (required for independent re-derivation of the bytes):
 *   - observation rows are consumed in file order; row_count = rows.length
 *   - sums are exact integer addition over validated non-negative integers
 *   - completion_percent = Number(((completed / scheduled) * 100).toFixed(2)),
 *     a single IEEE-754 double division followed by toFixed(2)
 *   - a site with scheduled === 0 yields completion_percent 0
 *   - sites object keys are sorted ascending by code point (locale-independent)
 *   - JSON is emitted as JSON.stringify(value, null, 2) + "\n"
 *   - no timestamps, hostnames, PIDs or paths-of-the-moment appear in output
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CAPABILITY = 'observation-digest-v1';

function fail(message) {
  const err = new Error(`${CAPABILITY}: ${message}`);
  err.code = 'EOBSERVATIONDIGEST';
  throw err;
}

/** Round to exactly two decimal places using the platform's toFixed(2). */
function round2(value) {
  return Number(value.toFixed(2));
}

/** completion percentage, 2 decimals, 0 when nothing was scheduled. */
function percent(completed, scheduled) {
  if (scheduled === 0) return 0;
  return round2((completed / scheduled) * 100);
}

/** Fixed-width 2-decimal rendering used by the markdown report. */
function fixed2(value) {
  return Number(value).toFixed(2);
}

function assertCount(value, where) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    fail(`${where} must be an integer, got ${JSON.stringify(value)}`);
  }
  if (value < 0) fail(`${where} must be >= 0, got ${value}`);
  return value;
}

function assertText(value, where) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${where} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function loadObservations(inputPath) {
  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (err) {
    fail(`cannot read input ${inputPath}: ${err.message}`);
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    fail(`input is not valid JSON: ${err.message}`);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail('input root must be a JSON object');
  }
  const rows = doc.observations;
  if (!Array.isArray(rows) || rows.length === 0) {
    fail('observations must be a non-empty array');
  }
  const sha256 = crypto.createHash('sha256').update(Buffer.from(raw, 'utf8')).digest('hex');
  return { doc, rows, sha256 };
}

/** Pure computation: rows -> digest object. No I/O. */
function computeDigest(rows) {
  const totals = { row_count: 0, scheduled: 0, completed: 0, incidents: 0 };
  const perSite = new Map();

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const where = `observations[${i}]`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(`${where} must be an object`);
    }
    const site = assertText(row.site, `${where}.site`);
    const scheduled = assertCount(row.scheduled, `${where}.scheduled`);
    const completed = assertCount(row.completed, `${where}.completed`);
    const incidents = assertCount(row.incidents, `${where}.incidents`);

    totals.row_count += 1;
    totals.scheduled += scheduled;
    totals.completed += completed;
    totals.incidents += incidents;

    const bucket = perSite.get(site) || { row_count: 0, scheduled: 0, completed: 0, incidents: 0 };
    bucket.row_count += 1;
    bucket.scheduled += scheduled;
    bucket.completed += completed;
    bucket.incidents += incidents;
    perSite.set(site, bucket);
  }

  const siteNames = Array.from(perSite.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sites = {};
  for (const name of siteNames) {
    const b = perSite.get(name);
    sites[name] = {
      row_count: b.row_count,
      scheduled: b.scheduled,
      completed: b.completed,
      incidents: b.incidents,
      completion_percent: percent(b.completed, b.scheduled),
    };
  }

  return {
    row_count: totals.row_count,
    scheduled: totals.scheduled,
    completed: totals.completed,
    incidents: totals.incidents,
    completion_percent: percent(totals.completed, totals.scheduled),
    sites,
  };
}

function renderMarkdown(digest, doc, inputPath, inputSha256) {
  const lines = [];
  const source = typeof doc.source === 'string' ? doc.source : '(unspecified source)';
  const period = typeof doc.period === 'string' ? doc.period : '(unspecified period)';

  lines.push(`# Observation digest — ${source} (${period})`);
  lines.push('');
  lines.push(`Produced by \`${CAPABILITY}\` from \`${inputPath}\`.`);
  lines.push('');
  lines.push(`- input sha256: \`${inputSha256}\``);
  lines.push(`- observation rows: ${digest.row_count}`);
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| metric | value |');
  lines.push('| --- | --- |');
  lines.push(`| row_count | ${digest.row_count} |`);
  lines.push(`| scheduled | ${digest.scheduled} |`);
  lines.push(`| completed | ${digest.completed} |`);
  lines.push(`| incidents | ${digest.incidents} |`);
  lines.push(`| completion_percent | ${fixed2(digest.completion_percent)} |`);
  lines.push('');
  lines.push('## Per-site totals');
  lines.push('');
  lines.push('| site | row_count | scheduled | completed | incidents | completion_percent |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const name of Object.keys(digest.sites)) {
    const s = digest.sites[name];
    lines.push(
      `| ${name} | ${s.row_count} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${fixed2(
        s.completion_percent
      )} |`
    );
  }
  lines.push(
    `| **all sites** | ${digest.row_count} | ${digest.scheduled} | ${digest.completed} | ${digest.incidents} | ${fixed2(
      digest.completion_percent
    )} |`
  );
  lines.push('');
  lines.push('## Method (reproducible)');
  lines.push('');
  lines.push(`1. Read \`${inputPath}\` as UTF-8 and parse it as JSON; take the \`observations\` array in file order (${digest.row_count} rows).`);
  lines.push('2. Reject the input unless every row is an object whose `site` is a non-empty string and whose `scheduled`, `completed` and `incidents` are non-negative integers.');
  lines.push(`3. row_count = number of observation rows = ${digest.row_count}.`);
  lines.push(
    `4. scheduled = sum of row.scheduled = ${digest.scheduled}; completed = sum of row.completed = ${digest.completed}; incidents = sum of row.incidents = ${digest.incidents}.`
  );
  lines.push(
    `5. completion_percent = round((${digest.completed} / ${digest.scheduled}) * 100, 2) = ${fixed2(
      digest.completion_percent
    )} (one IEEE-754 double division, then \`Number.prototype.toFixed(2)\`).`
  );
  lines.push(`6. Group rows by \`site\`; sum the same three counters per site and apply the identical rounding rule. A site with scheduled = 0 reports completion_percent 0.`);
  lines.push('7. Emit sites as a JSON object sorted by site name in ascending code-point order, so key order is stable across runs and hosts.');
  lines.push('8. Integer sums are exact (no floating point); the only floating-point step is the percentage formula above, so the numbers can be re-derived by hand from the input file and its sha256.');
  return lines.join('\n') + '\n';
}

/**
 * Run the capability. Reads inputPath, writes digest.json and digest.md
 * into outDir (created if absent). Returns the digest object.
 */
function run(inputPath, outDir) {
  if (typeof inputPath !== 'string' || inputPath === '') fail('input path argument is required');
  if (typeof outDir !== 'string' || outDir === '') fail('output directory argument is required');

  const absInput = path.resolve(inputPath);
  const absOut = path.resolve(outDir);

  const { doc, rows, sha256 } = loadObservations(absInput);
  const digest = computeDigest(rows);

  fs.mkdirSync(absOut, { recursive: true });

  const jsonBody = JSON.stringify(
    {
      source: typeof doc.source === 'string' ? doc.source : null,
      period: typeof doc.period === 'string' ? doc.period : null,
      input_sha256: sha256,
      ...digest,
    },
    null,
    2
  ) + '\n';

  const mdBody = renderMarkdown(digest, doc, absInput, sha256);

  const jsonPath = path.join(absOut, 'digest.json');
  const mdPath = path.join(absOut, 'digest.md');
  fs.writeFileSync(jsonPath, jsonBody, 'utf8');
  fs.writeFileSync(mdPath, mdBody, 'utf8');

  return { digest, jsonPath, mdPath, inputSha256: sha256 };
}

function main(argv) {
  const inputPath = argv[0];
  const outDir = argv[1];
  if (!inputPath || !outDir) {
    process.stderr.write(
      `usage: node -- ${__filename} <observations.json> <output-dir>\n`
    );
    process.exit(2);
  }
  const result = run(inputPath, outDir);
  process.stdout.write(
    JSON.stringify({
      capability: CAPABILITY,
      input: path.resolve(inputPath),
      input_sha256: result.inputSha256,
      json: result.jsonPath,
      markdown: result.mdPath,
      row_count: result.digest.row_count,
      scheduled: result.digest.scheduled,
      completed: result.digest.completed,
      incidents: result.digest.incidents,
      completion_percent: result.digest.completion_percent,
    }) + '\n'
  );
  return result;
}

module.exports = { CAPABILITY, computeDigest, percent, round2, run };

if (require.main === module) {
  main(process.argv.slice(2));
}
