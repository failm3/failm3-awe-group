#!/usr/bin/env node
/**
 * observation-digest-v1
 * ---------------------------------------------------------------------------
 * Self-contained, dependency-free local procedure.
 *
 * Reads a JSON observation fixture of the shape
 *   { "source": str, "period": str, "observations": [ {site, cohort,
 *     scheduled:int, completed:int, incidents:int}, ... ] }
 * and persists two files into the given output directory:
 *   digest.json  - exact numeric totals + per-site totals + 2-decimal percent
 *   digest.md    - the same values rendered with a reproducible method section
 *
 * Invocation (runtime supplied by the trusted gate, "node --"):
 *   node -- <this-file> <fixture.json> <output-dir>
 *
 * No network, no child processes, no third-party modules: only node's own
 * fs, path and crypto built-ins. Deterministic: identical input bytes always
 * produce byte-identical outputs (site keys sorted, fixed key order, LF).
 *
 * Exit codes: 0 success; 2 usage/IO error; 3 invalid fixture.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const EXIT_OK = 0;
const EXIT_USAGE = 2;
const EXIT_BAD_INPUT = 3;

function fail(code, msg) {
  process.stderr.write('observation-digest-v1: ' + msg + '\n');
  process.exit(code);
}

// --- arguments ------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.length !== 2) {
  fail(EXIT_USAGE, 'expected exactly 2 arguments: <fixture.json> <output-dir>; got ' + argv.length);
}
const FIXTURE = path.resolve(argv[0]);
const OUTDIR = path.resolve(argv[1]);

// --- read fixture ---------------------------------------------------------
let rawBytes;
try {
  rawBytes = fs.readFileSync(FIXTURE);
} catch (err) {
  fail(EXIT_USAGE, 'cannot read fixture ' + FIXTURE + ': ' + err.message);
}
const fixtureSha256 = crypto.createHash('sha256').update(rawBytes).digest('hex');

let doc;
try {
  doc = JSON.parse(rawBytes.toString('utf8'));
} catch (err) {
  fail(EXIT_BAD_INPUT, 'fixture is not valid JSON: ' + err.message);
}
if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
  fail(EXIT_BAD_INPUT, 'fixture root must be a JSON object');
}
if (!Array.isArray(doc.observations)) {
  fail(EXIT_BAD_INPUT, 'fixture.observations must be an array');
}

// --- validation -----------------------------------------------------------
const METRICS = ['scheduled', 'completed', 'incidents'];

function requireCount(obj, key, where) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    fail(EXIT_BAD_INPUT, where + ' is missing required field "' + key + '"');
  }
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    fail(EXIT_BAD_INPUT, where + '.' + key + ' must be a finite number, got ' + JSON.stringify(v));
  }
  if (!Number.isInteger(v)) {
    fail(EXIT_BAD_INPUT, where + '.' + key + ' must be an integer, got ' + JSON.stringify(v));
  }
  if (v < 0) {
    fail(EXIT_BAD_INPUT, where + '.' + key + ' must be >= 0, got ' + v);
  }
  return v;
}

function requireSite(row, where) {
  if (typeof row !== 'object' || row === null || Array.isArray(row)) {
    fail(EXIT_BAD_INPUT, where + ' must be an object');
  }
  if (typeof row.site !== 'string' || row.site.trim() === '') {
    fail(EXIT_BAD_INPUT, where + '.site must be a non-empty string');
  }
  return row.site;
}

// --- exact integer aggregation -------------------------------------------
const totals = { scheduled: 0, completed: 0, incidents: 0 };
const perSite = new Map(); // site -> { rows, scheduled, completed, incidents }

doc.observations.forEach(function (row, i) {
  const where = 'observations[' + i + ']';
  const site = requireSite(row, where);
  const values = {};
  METRICS.forEach(function (k) {
    values[k] = requireCount(row, k, where);
  });

  let siteAgg = perSite.get(site);
  if (!siteAgg) {
    siteAgg = { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
    perSite.set(site, siteAgg);
  }
  siteAgg.rows += 1;
  METRICS.forEach(function (k) {
    siteAgg[k] += values[k];
    totals[k] += values[k];
  });
});

const rowCount = doc.observations.length;

// --- percentage -----------------------------------------------------------
// Exact rational n/d rounded half-up to 2 decimals, computed without binary
// floating point drift:  round(10000 * n / d) / 100  done in integer space.
function percent2(numerator, denominator) {
  if (denominator === 0) return null;
  const scaled = Math.round((10000 * numerator) / denominator); // basis points
  return scaled; // basis points; rendered as bp/100 with 2 decimals
}

function renderPercent(bp) {
  // bp is an integer count of 1/100 percent units -> "86.67"
  if (bp === null) return 'null';
  const neg = bp < 0;
  const abs = Math.abs(bp);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return (neg ? '-' : '') + String(whole) + '.' + String(frac).padStart(2, '0');
}

const totalBp = percent2(totals.completed, totals.scheduled);

// --- deterministic JSON emission -----------------------------------------
function jstr(s) {
  return JSON.stringify(String(s));
}

const siteNames = Array.from(perSite.keys()).sort(function (a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
});

const jsonLines = [];
jsonLines.push('{');
jsonLines.push('  "source": ' + (doc.source === undefined ? 'null' : jstr(doc.source)) + ',');
jsonLines.push('  "period": ' + (doc.period === undefined ? 'null' : jstr(doc.period)) + ',');
jsonLines.push('  "fixture": ' + jstr(FIXTURE) + ',');
jsonLines.push('  "fixture_sha256": ' + jstr(fixtureSha256) + ',');
jsonLines.push('  "row_count": ' + rowCount + ',');
jsonLines.push('  "scheduled": ' + totals.scheduled + ',');
jsonLines.push('  "completed": ' + totals.completed + ',');
jsonLines.push('  "incidents": ' + totals.incidents + ',');
jsonLines.push('  "completion_percent": ' + renderPercent(totalBp) + ',');
jsonLines.push('  "site_count": ' + siteNames.length + ',');
jsonLines.push('  "sites": {');
siteNames.forEach(function (name, idx) {
  const agg = perSite.get(name);
  const bp = percent2(agg.completed, agg.scheduled);
  jsonLines.push('    ' + jstr(name) + ': {');
  jsonLines.push('      "rows": ' + agg.rows + ',');
  jsonLines.push('      "scheduled": ' + agg.scheduled + ',');
  jsonLines.push('      "completed": ' + agg.completed + ',');
  jsonLines.push('      "incidents": ' + agg.incidents + ',');
  jsonLines.push('      "completion_percent": ' + renderPercent(bp));
  jsonLines.push('    }' + (idx === siteNames.length - 1 ? '' : ','));
});
jsonLines.push('  }');
jsonLines.push('}');
const digestJson = jsonLines.join('\n') + '\n';

// --- markdown -------------------------------------------------------------
const mdLines = [];
mdLines.push('# Observation Digest');
mdLines.push('');
mdLines.push('- Source: ' + (doc.source === undefined ? '(none)' : doc.source));
mdLines.push('- Period: ' + (doc.period === undefined ? '(none)' : doc.period));
mdLines.push('- Fixture: `' + FIXTURE + '`');
mdLines.push('- Fixture SHA-256: `' + fixtureSha256 + '`');
mdLines.push('- Row count: ' + rowCount);
mdLines.push('');
mdLines.push('## Totals');
mdLines.push('');
mdLines.push('| Metric | Value |');
mdLines.push('| --- | ---: |');
mdLines.push('| row_count | ' + rowCount + ' |');
mdLines.push('| scheduled | ' + totals.scheduled + ' |');
mdLines.push('| completed | ' + totals.completed + ' |');
mdLines.push('| incidents | ' + totals.incidents + ' |');
mdLines.push('| completion_percent | ' + renderPercent(totalBp) + ' |');
mdLines.push('');
mdLines.push('## Totals by site');
mdLines.push('');
mdLines.push('| Site | rows | scheduled | completed | incidents | completion_percent |');
mdLines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
siteNames.forEach(function (name) {
  const agg = perSite.get(name);
  mdLines.push(
    '| ' + name + ' | ' + agg.rows + ' | ' + agg.scheduled + ' | ' +
    agg.completed + ' | ' + agg.incidents + ' | ' +
    renderPercent(percent2(agg.completed, agg.scheduled)) + ' |'
  );
});
mdLines.push('');
mdLines.push('## Method (reproducible)');
mdLines.push('');
mdLines.push('1. Read the fixture once as bytes and record its SHA-256 (`sha256sum` of the same file must match the value above).');
mdLines.push('2. Parse the JSON; require a root object whose `observations` member is an array.');
mdLines.push('3. Require every observation to carry a non-empty string `site` plus integer `scheduled`, `completed` and `incidents`, each `>= 0`; otherwise exit non-zero without writing output.');
mdLines.push('4. `row_count` = number of elements in `observations`.');
mdLines.push('5. Each of `scheduled`, `completed`, `incidents` is summed across all rows (exact integer addition; no floating point).');
mdLines.push('6. The `sites` object groups rows by their exact `site` string; each entry repeats the same integer sums plus its own `rows` count. Site keys are emitted in sorted order.');
mdLines.push('7. `completion_percent` = `completed / scheduled * 100`, rounded half-up to 2 decimals. It is computed in integer space as basis points: `round(10000 * completed / scheduled)`, then rendered as `bp / 100` with two decimals. A site with `scheduled = 0` reports `null` instead of dividing by zero.');
mdLines.push('8. Verify by hand: `completed * 10000 / scheduled` rounded, then divide by 100.');
mdLines.push('');
const digestMd = mdLines.join('\n');

// --- persist --------------------------------------------------------------
try {
  fs.mkdirSync(OUTDIR, { recursive: true });
  fs.writeFileSync(path.join(OUTDIR, 'digest.json'), digestJson, 'utf8');
  fs.writeFileSync(path.join(OUTDIR, 'digest.md'), digestMd, 'utf8');
} catch (err) {
  fail(EXIT_USAGE, 'cannot write outputs to ' + OUTDIR + ': ' + err.message);
}

process.stdout.write(
  'observation-digest-v1: wrote digest.json + digest.md to ' + OUTDIR +
  ' (rows=' + rowCount + ', sites=' + siteNames.length +
  ', completed/scheduled=' + totals.completed + '/' + totals.scheduled +
  ', completion_percent=' + renderPercent(totalBp) + ')\n'
);

process.exit(EXIT_OK);
