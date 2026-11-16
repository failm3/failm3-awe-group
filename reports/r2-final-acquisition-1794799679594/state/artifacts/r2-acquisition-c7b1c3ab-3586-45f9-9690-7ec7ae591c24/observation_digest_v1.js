#!/usr/bin/env node
'use strict';
/*
  observation-digest-v1
  Deterministic digest generator for field-observation fixtures.

  Usage (fixed contract):
    node -- <this-script> <input_fixture.json> <output_dir>

  Reads the JSON observation fixture, validates every row, computes exact
  aggregate totals (row_count, scheduled, completed, incidents), per-site
  totals, and completion_percent (completed / scheduled * 100) rounded with
  round-half-up and formatted to exactly 2 decimal places.

  Writes:
    <output_dir>/digest.json
    <output_dir>/digest.md

  No network, no dependencies beyond the Node.js standard library.
  Exits non-zero with a diagnostic on stderr for malformed fixtures.
*/

const fs = require('fs');
const path = require('path');

function fail(msg) {
  process.stderr.write('observation-digest-v1: ' + msg + '\n');
  process.exit(2);
}

function isInt(n) {
  return typeof n === 'number' && Number.isInteger(n);
}

// Round-half-up to 2 decimals, independent of binary float tie behaviour.
function pct2(completed, scheduled) {
  if (scheduled === 0) return '0.00';
  // integer arithmetic: completed/scheduled*100 rounded half-up to 1e-2
  const scaled = (BigInt(completed) * 10000n * 2n + BigInt(scheduled)) / (2n * BigInt(scheduled));
  const s = scaled.toString().padStart(3, '0');
  const whole = s.slice(0, s.length - 2);
  const frac = s.slice(s.length - 2);
  return whole + '.' + frac;
}

function num2(n) {
  return (Number(n) / 100).toFixed(2);
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 2) fail('expected exactly 2 args: <input_fixture.json> <output_dir>');
  const inputPath = path.resolve(argv[0]);
  const outDir = path.resolve(argv[1]);

  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (e) {
    fail('cannot read input fixture ' + inputPath + ': ' + e.message);
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    fail('input fixture is not valid JSON: ' + e.message);
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) fail('fixture root must be a JSON object');
  if (!Array.isArray(doc.observations)) fail('fixture must contain an "observations" array');
  if (doc.observations.length === 0) fail('"observations" array must not be empty');

  let scheduled = 0;
  let completed = 0;
  let incidents = 0;
  const sites = Object.create(null);
  const siteOrder = [];

  for (let i = 0; i < doc.observations.length; i++) {
    const o = doc.observations[i];
    const where = 'observations[' + i + ']';
    if (o === null || typeof o !== 'object' || Array.isArray(o)) fail(where + ' must be an object');
    if (typeof o.site !== 'string' || o.site.length === 0) fail(where + '.site must be a non-empty string');
    if (!isInt(o.scheduled)) fail(where + '.scheduled must be an integer');
    if (!isInt(o.completed)) fail(where + '.completed must be an integer');
    if (!isInt(o.incidents)) fail(where + '.incidents must be an integer');
    if (o.scheduled < 0) fail(where + '.scheduled must be >= 0');
    if (o.completed < 0) fail(where + '.completed must be >= 0');
    if (o.incidents < 0) fail(where + '.incidents must be >= 0');
    if (o.completed > o.scheduled) fail(where + '.completed must not exceed .scheduled');

    if (!(o.site in sites)) {
      sites[o.site] = { site: o.site, rows: 0, scheduled: 0, completed: 0, incidents: 0 };
      siteOrder.push(o.site);
    }
    const s = sites[o.site];
    s.rows += 1;
    s.scheduled += o.scheduled;
    s.completed += o.completed;
    s.incidents += o.incidents;

    scheduled += o.scheduled;
    completed += o.completed;
    incidents += o.incidents;
  }

  // Guard: per-site sums must reconcile with the global sums.
  let schedCheck = 0;
  let compCheck = 0;
  let incCheck = 0;
  for (const k of siteOrder) {
    schedCheck += sites[k].scheduled;
    compCheck += sites[k].completed;
    incCheck += sites[k].incidents;
  }
  if (schedCheck !== scheduled || compCheck !== completed || incCheck !== incidents) {
    fail('internal reconciliation failure between row totals and site totals');
  }

  const siteNames = siteOrder.slice().sort(); // deterministic alphabetical key order
  const sitesOut = {};
  let siteSched = 0;
  let siteComp = 0;
  let siteInc = 0;
  for (const name of siteNames) {
    const s = sites[name];
    sitesOut[name] = {
      rows: s.rows,
      scheduled: s.scheduled,
      completed: s.completed,
      incidents: s.incidents,
      completion_percent: pct2(s.completed, s.scheduled),
      completion_ratio: num2(pct2(s.completed, s.scheduled)),
    };
    siteSched += s.scheduled;
    siteComp += s.completed;
    siteInc += s.incidents;
  }

  const completionPercent = pct2(completed, scheduled);

  const digest = {
    capability: 'observation-digest-v1',
    source: typeof doc.source === 'string' ? doc.source : null,
    period: typeof doc.period === 'string' ? doc.period : null,
    row_count: doc.observations.length,
    scheduled: scheduled,
    completed: completed,
    incidents: incidents,
    completion_percent: completionPercent,
    completion_percent_value: Number(completionPercent),
    site_count: siteNames.length,
    sites: sitesOut,
    totals_reconciliation: {
      sites_scheduled_sum: siteSched,
      sites_completed_sum: siteComp,
      sites_incidents_sum: siteInc,
      matches_global: siteSched === scheduled && siteComp === completed && siteInc === incidents,
    },
    method: {
      completion_percent: 'completed / scheduled * 100, rounded half-up to 2 decimal places (integer arithmetic), rendered as a fixed 2-decimal string',
      row_count: 'number of elements in observations[]',
      site_totals: 'sum of scheduled/completed/incidents grouped by site over all rows; rows = number of contributing rows',
      sites_key_order: 'alphabetical by site name',
      validation: 'integer, non-negative, completed <= scheduled, non-empty observations, site totals reconcile with global totals'
    },
    inputs: {
      fixture_path: inputPath,
      fixture_sha256: require('crypto').createHash('sha256').update(raw, 'utf8').digest('hex'),
      fixture_bytes: raw.length
    }
  };

  // Markdown rendering uses only the values already computed above.
  const lines = [];
  lines.push('# Observation Digest');
  lines.push('');
  if (digest.source) lines.push('- Source: ' + digest.source);
  if (digest.period) lines.push('- Period: ' + digest.period);
  lines.push('- Capability: observation-digest-v1');
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push('| row_count | ' + digest.row_count + ' |');
  lines.push('| scheduled | ' + digest.scheduled + ' |');
  lines.push('| completed | ' + digest.completed + ' |');
  lines.push('| incidents | ' + digest.incidents + ' |');
  lines.push('| completion_percent | ' + digest.completion_percent + ' |');
  lines.push('');
  lines.push('## Per-site totals');
  lines.push('');
  lines.push('| Site | Rows | Scheduled | Completed | Incidents | Completion % |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const name of siteNames) {
    const s = sitesOut[name];
    lines.push('| ' + name + ' | ' + s.rows + ' | ' + s.scheduled + ' | ' + s.completed + ' | ' + s.incidents + ' | ' + s.completion_percent + ' |');
  }
  lines.push('| **All sites** | ' + digest.row_count + ' | ' + digest.scheduled + ' | ' + digest.completed + ' | ' + digest.incidents + ' | ' + digest.completion_percent + ' |');
  lines.push('');
  lines.push('## Method (reproducible)');
  lines.push('');
  lines.push('1. Parse the JSON fixture and take the `observations` array.');
  lines.push('2. Validate each row: `site` non-empty string; `scheduled`, `completed`, `incidents` integers >= 0; `completed` <= `scheduled`.');
  lines.push('3. `row_count` = number of rows.');
  lines.push('4. Global `scheduled`, `completed`, `incidents` = column sums over all rows.');
  lines.push('5. Per-site totals = column sums grouped by `site`; `rows` counts contributing rows. Sites are listed alphabetically.');
  lines.push('6. `completion_percent` = `completed / scheduled * 100`, rounded half-up to 2 decimals using integer arithmetic `floor((completed*10000*2 + scheduled) / (2*scheduled)) / 100`, rendered with exactly 2 decimal places. Same formula is applied per site.');
  lines.push('7. Site totals are summed again and must equal the global totals; the digest records this reconciliation.');
  lines.push('');
  lines.push('## Reconciliation');
  lines.push('');
  lines.push('- Sum of per-site scheduled: ' + siteSched + ' (global ' + digest.scheduled + ')');
  lines.push('- Sum of per-site completed: ' + siteComp + ' (global ' + digest.completed + ')');
  lines.push('- Sum of per-site incidents: ' + siteInc + ' (global ' + digest.incidents + ')');
  lines.push('- Matches global: ' + (digest.totals_reconciliation.matches_global ? 'yes' : 'no'));
  lines.push('');
  lines.push('## Input fingerprint');
  lines.push('');
  lines.push('- Fixture: `' + inputPath + '`');
  lines.push('- SHA-256: `' + digest.inputs.fixture_sha256 + '`');
  lines.push('- Bytes: ' + digest.inputs.fixture_bytes);
  lines.push('');

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'digest.json');
  const mdPath = path.join(outDir, 'digest.md');
  fs.writeFileSync(jsonPath, JSON.stringify(digest, null, 2) + '\n', 'utf8');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');

  process.stdout.write(JSON.stringify({
    ok: true,
    wrote: [jsonPath, mdPath],
    row_count: digest.row_count,
    scheduled: digest.scheduled,
    completed: digest.completed,
    incidents: digest.incidents,
    completion_percent: digest.completion_percent
  }) + '\n');
}

main();
