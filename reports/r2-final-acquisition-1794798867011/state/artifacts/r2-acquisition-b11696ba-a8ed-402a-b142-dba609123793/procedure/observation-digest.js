#!/usr/bin/env node
'use strict';
/*
 * observation-digest-v1
 * Independently reads a JSON observation fixture and writes an exact
 * operational digest (digest.json + digest.md) covering row/site totals,
 * scheduled/completed/incidents sums and completion percentage to 2 decimals.
 *
 * Fixed CLI contract:
 *   node observation-digest.js <fixture.json> <out-dir>
 * Nothing else is read or written. No network. No packages. No randomness.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function die(msg) {
  process.stderr.write('observation-digest-v1: ' + msg + '\n');
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.length !== 2) die('usage: observation-digest.js <fixture.json> <out-dir>');
const fixturePath = path.resolve(argv[0]);
const outDir = path.resolve(argv[1]);

let raw;
try {
  raw = fs.readFileSync(fixturePath, 'utf8');
} catch (e) {
  die('cannot read fixture: ' + fixturePath);
}
const fixtureSha256 = crypto.createHash('sha256').update(raw, 'utf8').digest('hex');

let doc;
try {
  doc = JSON.parse(raw);
} catch (e) {
  die('fixture is not valid JSON: ' + e.message);
}
if (!doc || typeof doc !== 'object' || !Array.isArray(doc.observations)) {
  die('fixture must be an object with an "observations" array');
}

const rows = doc.observations;
const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const seen = new Set();

let scheduled = 0, completed = 0, incidents = 0;
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r || typeof r !== 'object' || Array.isArray(r)) die('observation[' + i + '] is not an object');
  if (typeof r.site !== 'string' || r.site.length === 0) die('observation[' + i + '].site must be a non-empty string');
  for (const k of ['scheduled', 'completed', 'incidents']) {
    if (!isInt(r[k])) die('observation[' + i + '].' + k + ' must be an integer');
    if (r[k] < 0) die('observation[' + i + '].' + k + ' must be >= 0');
  }
  if (r.completed > r.scheduled) die('observation[' + i + '].completed exceeds scheduled');
  const key = i;
  seen.add(key);
  scheduled += r.scheduled;
  completed += r.completed;
  incidents += r.incidents;
}

// Site totals: one entry per distinct site, ascending by site name (byte order).
const bySite = new Map();
for (const r of rows) {
  const s = bySite.get(r.site) || { site: r.site, rows: 0, scheduled: 0, completed: 0, incidents: 0 };
  s.rows += 1;
  s.scheduled += r.scheduled;
  s.completed += r.completed;
  s.incidents += r.incidents;
  bySite.set(r.site, s);
}
const sites = Array.from(bySite.values())
  .map((s) => ({
    site: s.site,
    rows: s.rows,
    scheduled: s.scheduled,
    completed: s.completed,
    incidents: s.incidents,
    completion_percent: Number(((s.completed / s.scheduled) * 100).toFixed(2)),
  }))
  .sort((a, b) => (a.site < b.site ? -1 : a.site > b.site ? 1 : 0));

if (scheduled <= 0) die('total scheduled must be > 0 to compute completion_percent');
const completionPercent = Number(((completed / scheduled) * 100).toFixed(2));

const digest = {
  capability: undefined, // never emitted; see guard below
};

const out = {
  title: 'operational digest',
  source: typeof doc.source === 'string' ? doc.source : null,
  period: typeof doc.period === 'string' ? doc.period : null,
  row_count: rows.length,
  scheduled: scheduled,
  completed: completed,
  incidents: incidents,
  completion_percent: completionPercent,
  site_count: sites.length,
  sites: sites,
  method: {
    formula: 'completion_percent = round(completed / scheduled * 100, 2) using IEEE-754 double then toFixed(2)',
    row_count: 'length of fixture.observations',
    site_totals: 'sum of int fields grouped by distinct site value, sites sorted ascending by site name',
    integers_only: true,
  },
  inputs: {
    fixture_path: fixturePath,
    fixture_sha256: fixtureSha256,
    fixture_bytes: Buffer.byteLength(raw, 'utf8'),
  },
  generator: {
    name: 'observation-digest-v1',
    runtime: process.execPath,
    runtime_version: process.version,
    script_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
  },
};

/* Guard: the digest must never be mistakable for a capability observation. */
for (const forbidden of ['capability', 'status', 'detail', 'local_target', 'acquired']) {
  if (Object.prototype.hasOwnProperty.call(out, forbidden)) die('refusing to emit reserved field: ' + forbidden);
}

const md = [
  '# Operational digest',
  '',
  '- Source: ' + (out.source === null ? '(none)' : out.source),
  '- Period: ' + (out.period === null ? '(none)' : out.period),
  '- Fixture: `' + fixturePath + '`',
  '- Fixture SHA-256: `' + fixtureSha256 + '`',
  '',
  '## Totals',
  '',
  '| Metric | Value |',
  '| --- | ---: |',
  '| Rows (observations) | ' + out.row_count + ' |',
  '| Sites (distinct) | ' + out.site_count + ' |',
  '| Scheduled | ' + out.scheduled + ' |',
  '| Completed | ' + out.completed + ' |',
  '| Incidents | ' + out.incidents + ' |',
  '| Completion % | ' + completionPercent.toFixed(2) + ' |',
  '',
  '## Per-site totals',
  '',
  '| Site | Rows | Scheduled | Completed | Incidents | Completion % |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
].concat(
  sites.map(
    (s) =>
      '| ' + s.site + ' | ' + s.rows + ' | ' + s.scheduled + ' | ' + s.completed + ' | ' +
      s.incidents + ' | ' + s.completion_percent.toFixed(2) + ' |'
  )
).concat([
  '| **Total** | **' + out.row_count + '** | **' + scheduled + '** | **' + completed + '** | **' +
    incidents + '** | **' + completionPercent.toFixed(2) + '** |',
  '',
  '## Reproducible method',
  '',
  '1. Parse the fixture as JSON; `row_count` = length of `observations`.',
  '2. Sum integer fields `scheduled`, `completed`, `incidents` across all rows.',
  '3. `scheduled`, `completed`, `incidents` are exact integer sums (no floating point).',
  '4. `completion_percent = round(completed / scheduled * 100, 2)` (two decimal places).',
  '5. Per-site totals group rows by the `site` string; `sites` is sorted ascending by site name.',
  '6. Regenerate with the exact command below; output is byte-for-byte deterministic.',
  '',
  '```',
  '/usr/bin/node procedure/observation-digest.js input/pilot.observations.json out',
  '```',
  '',
  'Generator script SHA-256: `' + out.generator.script_sha256 + '`',
  'Runtime: `' + out.generator.runtime + '` (' + out.generator.runtime_version + ')',
  '',
]).join('\n');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'digest.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(outDir, 'digest.md'), md, 'utf8');

process.stdout.write(JSON.stringify({
  wrote: ['digest.json', 'digest.md'],
  out_dir: outDir,
  row_count: out.row_count,
  site_count: out.site_count,
  scheduled: out.scheduled,
  completed: out.completed,
  incidents: out.incidents,
  completion_percent: out.completion_percent,
}) + '\n');
