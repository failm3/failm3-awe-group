#!/usr/bin/env node
'use strict';
/**
 * observation-digest-v1
 * Reads an observations JSON fixture, computes exact row/site totals plus
 * completion percentage, and persists digest.json + digest.md into an output dir.
 *
 * usage: node -- observation-digest.js <observations.json> <output-dir>
 * Runtime: Node >= 18, standard library only (node:fs, node:path, node:crypto).
 * No network, no child processes, no writes outside <output-dir>.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CAPABILITY = 'observation-digest-v1';

function die(msg) {
  process.stderr.write(CAPABILITY + ': ' + msg + '\n');
  process.exit(1);
}

function asCount(value, where) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    die(where + ' must be a non-negative integer, got ' + JSON.stringify(value));
  }
  return value;
}

// Exact half-up rounding of completed/scheduled expressed as a percentage with
// two decimals, using one division and integer rounding of the scaled rational.
function completionPercentString(completed, scheduled) {
  if (scheduled === 0) return '0.00';
  const scaled = (completed * 10000) / scheduled;
  return (Math.round(scaled) / 100).toFixed(2);
}

function readFixture(fixturePath) {
  let bytes;
  try {
    bytes = fs.readFileSync(fixturePath);
  } catch (err) {
    die('cannot read fixture ' + fixturePath + ': ' + err.message);
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  let doc;
  try {
    doc = JSON.parse(bytes.toString('utf8'));
  } catch (err) {
    die('fixture is not valid JSON: ' + err.message);
  }
  return { doc, sha256 };
}

function buildDigest(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    die('fixture root must be a JSON object');
  }
  const rows = doc.observations;
  if (!Array.isArray(rows) || rows.length === 0) {
    die('fixture.observations must be a non-empty array');
  }

  const perSite = new Map();
  let scheduled = 0;
  let completed = 0;
  let incidents = 0;

  rows.forEach(function (row, i) {
    const at = 'observations[' + i + ']';
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      die(at + ' must be an object');
    }
    if (typeof row.site !== 'string' || row.site.trim() === '') {
      die(at + '.site must be a non-empty string');
    }
    const s = asCount(row.scheduled, at + '.scheduled');
    const c = asCount(row.completed, at + '.completed');
    const n = asCount(row.incidents, at + '.incidents');
    if (c > s) die(at + '.completed (' + c + ') cannot exceed scheduled (' + s + ')');

    scheduled += s;
    completed += c;
    incidents += n;

    const site = row.site;
    const agg = perSite.get(site) || { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
    agg.rows += 1;
    agg.scheduled += s;
    agg.completed += c;
    agg.incidents += n;
    perSite.set(site, agg);
  });

  const siteNames = Array.from(perSite.keys()).sort();
  const sites = {};
  siteNames.forEach(function (name) {
    const agg = perSite.get(name);
    sites[name] = {
      rows: agg.rows,
      scheduled: agg.scheduled,
      completed: agg.completed,
      incidents: agg.incidents,
      completion_percent: Number(completionPercentString(agg.completed, agg.scheduled)),
    };
  });

  // Invariant: per-site totals must reconcile with the global totals exactly.
  let chkScheduled = 0;
  let chkCompleted = 0;
  let chkIncidents = 0;
  let chkRows = 0;
  siteNames.forEach(function (name) {
    const t = sites[name];
    chkScheduled += t.scheduled;
    chkCompleted += t.completed;
    chkIncidents += t.incidents;
    chkRows += t.rows;
  });
  if (chkScheduled !== scheduled || chkCompleted !== completed || chkIncidents !== incidents) {
    die('site totals do not reconcile with global totals');
  }
  if (chkRows !== rows.length) {
    die('site row counts do not reconcile with fixture row count');
  }

  return {
    doc: doc,
    rowCount: rows.length,
    scheduled: scheduled,
    completed: completed,
    incidents: incidents,
    completionPercent: completionPercentString(completed, scheduled),
    sites: sites,
    siteNames: siteNames,
  };
}

function renderDigestJson(d, fixtureSha) {
  const out = {
    source: typeof d.doc.source === 'string' ? d.doc.source : null,
    period: typeof d.doc.period === 'string' ? d.doc.period : null,
    row_count: d.rowCount,
    scheduled: d.scheduled,
    completed: d.completed,
    incidents: d.incidents,
    completion_percent: Number(d.completionPercent),
    sites: d.sites,
  };
  return JSON.stringify(out, null, 2) + '\n';
}

function renderDigestMd(d, fixturePath, fixtureSha, outDir) {
  const lines = [];
  lines.push('# Observation digest (observation-digest-v1)');
  lines.push('');
  lines.push('- Source: ' + (typeof d.doc.source === 'string' ? d.doc.source : '(unspecified)'));
  lines.push('- Period: ' + (typeof d.doc.period === 'string' ? d.doc.period : '(unspecified)'));
  lines.push('- Fixture: `' + fixturePath + '`');
  lines.push('- Fixture SHA-256: `' + fixtureSha + '`');
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push('| Rows | ' + d.rowCount + ' |');
  lines.push('| Scheduled | ' + d.scheduled + ' |');
  lines.push('| Completed | ' + d.completed + ' |');
  lines.push('| Incidents | ' + d.incidents + ' |');
  lines.push('| Completion percent | ' + d.completionPercent + '% |');
  lines.push('');
  lines.push('## Per site');
  lines.push('');
  lines.push('| Site | Rows | Scheduled | Completed | Incidents | Completion percent |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  d.siteNames.forEach(function (name) {
    const t = d.sites[name];
    lines.push('| ' + name + ' | ' + t.rows + ' | ' + t.scheduled + ' | ' + t.completed + ' | ' +
      t.incidents + ' | ' + completionPercentString(t.completed, t.scheduled) + '% |');
  });
  lines.push('');
  lines.push('## Method (reproducible)');
  lines.push('');
  lines.push('1. Read the fixture bytes and record their SHA-256 (above).');
  lines.push('2. Parse the JSON; `observations` is the only data array consulted.');
  lines.push('3. `row_count` = number of elements in `observations`.');
  lines.push('4. Global totals are plain sums over every row: `scheduled` = sum of `scheduled`,');
  lines.push('   `completed` = sum of `completed`, `incidents` = sum of `incidents`.');
  lines.push('5. `sites` is keyed by the exact `site` string, sorted ascending; each entry holds');
  lines.push('   that site\'s `rows`, summed `scheduled`/`completed`/`incidents`, and its own');
  lines.push('   `completion_percent`.');
  lines.push('6. `completion_percent` = completed / scheduled * 100, rounded half-up to exactly two');
  lines.push('   decimals (`round(completed * 10000 / scheduled) / 100`); 0 scheduled yields 0.00.');
  lines.push('7. Invariants enforced before writing: per-site sums equal the global totals and');
  lines.push('   per-site row counts equal `row_count`; mismatch aborts without writing output.');
  lines.push('');
  lines.push('Reproduce with:');
  lines.push('');
  lines.push('```');
  lines.push('node -- ' + path.join(__dirname, path.basename(__filename)) + ' ' + fixturePath + ' ' + outDir);
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length !== 2) die('expected exactly 2 arguments (fixture, output dir); usage: ' +
    'node -- observation-digest.js <observations.json> <output-dir>');
  const fixturePath = path.resolve(argv[0]);
  const outDir = path.resolve(argv[1]);

  const loaded = readFixture(fixturePath);
  const digest = buildDigest(loaded.doc);

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (err) {
    die('cannot create output dir ' + outDir + ': ' + err.message);
  }

  const digestJson = renderDigestJson(digest, loaded.sha256);
  const digestMd = renderDigestMd(digest, fixturePath, loaded.sha256, outDir);
  const jsonPath = path.join(outDir, 'digest.json');
  const mdPath = path.join(outDir, 'digest.md');
  fs.writeFileSync(jsonPath, digestJson);
  fs.writeFileSync(mdPath, digestMd);

  process.stdout.write(JSON.stringify({
    capability: CAPABILITY,
    fixture_sha256: loaded.sha256,
    digest_json: jsonPath,
    digest_json_sha256: crypto.createHash('sha256').update(digestJson).digest('hex'),
    digest_md: mdPath,
    digest_md_sha256: crypto.createHash('sha256').update(digestMd).digest('hex'),
    row_count: digest.rowCount,
    scheduled: digest.scheduled,
    completed: digest.completed,
    incidents: digest.incidents,
    completion_percent: Number(digest.completionPercent),
  }, null, 2) + '\n');
}

main();
