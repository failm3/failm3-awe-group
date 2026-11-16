'use strict';
// observation-digest-v1: reads an observation JSON fixture and writes digest.json and digest.md.
// usage: node -- observation-digest-v1.js <input.json> <output-dir>
// No network, no packages: Node built-ins only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('usage: observation-digest-v1.js <input.json> <output-dir>');
  process.exit(2);
}
const inputPath = args[0];
const outDir = args[1];

function count(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('invalid ' + label + ': expected a non-negative integer, got ' + JSON.stringify(value));
  }
  return value;
}

// Integer arithmetic, half-up rounding to 2 decimals (no floating-point division).
function percent(completed, scheduled) {
  if (scheduled === 0) return 0;
  return Math.floor((completed * 20000 + scheduled) / (2 * scheduled)) / 100;
}

try {
  const raw = fs.readFileSync(inputPath);
  const inputSha = crypto.createHash('sha256').update(raw).digest('hex');
  const doc = JSON.parse(raw.toString('utf8'));
  if (!doc || !Array.isArray(doc.observations)) {
    throw new Error('input must contain an observations array');
  }

  const total = { scheduled: 0, completed: 0, incidents: 0 };
  const siteAcc = {};
  doc.observations.forEach(function (row, i) {
    if (!row || typeof row.site !== 'string' || row.site === '') {
      throw new Error('row ' + i + ': missing site');
    }
    const scheduled = count(row.scheduled, 'row ' + i + ' scheduled');
    const completed = count(row.completed, 'row ' + i + ' completed');
    const incidents = count(row.incidents, 'row ' + i + ' incidents');
    if (completed > scheduled) {
      throw new Error('row ' + i + ': completed exceeds scheduled');
    }
    total.scheduled += scheduled;
    total.completed += completed;
    total.incidents += incidents;
    if (!Object.prototype.hasOwnProperty.call(siteAcc, row.site)) {
      siteAcc[row.site] = { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
    }
    const s = siteAcc[row.site];
    s.rows += 1;
    s.scheduled += scheduled;
    s.completed += completed;
    s.incidents += incidents;
  });

  const sites = {};
  Object.keys(siteAcc).sort().forEach(function (name) {
    const s = siteAcc[name];
    sites[name] = {
      rows: s.rows,
      scheduled: s.scheduled,
      completed: s.completed,
      incidents: s.incidents,
      completion_percent: percent(s.completed, s.scheduled)
    };
  });

  const digest = {
    row_count: doc.observations.length,
    scheduled: total.scheduled,
    completed: total.completed,
    incidents: total.incidents,
    completion_percent: percent(total.completed, total.scheduled),
    sites: sites
  };

  const md = [
    '# Observation digest',
    '',
    '- Source: ' + (typeof doc.source === 'string' ? doc.source : 'unknown'),
    '- Period: ' + (typeof doc.period === 'string' ? doc.period : 'unknown'),
    '- Input SHA-256: ' + inputSha,
    '',
    '## Totals',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    '| row_count | ' + digest.row_count + ' |',
    '| scheduled | ' + digest.scheduled + ' |',
    '| completed | ' + digest.completed + ' |',
    '| incidents | ' + digest.incidents + ' |',
    '| completion_percent | ' + digest.completion_percent.toFixed(2) + ' |',
    '',
    '## Sites',
    '',
    '| Site | Rows | Scheduled | Completed | Incidents | Completion % |',
    '| --- | --- | --- | --- | --- | --- |'
  ];
  Object.keys(sites).forEach(function (name) {
    const s = sites[name];
    md.push('| ' + name + ' | ' + s.rows + ' | ' + s.scheduled + ' | ' + s.completed + ' | ' + s.incidents + ' | ' + s.completion_percent.toFixed(2) + ' |');
  });
  md.push('');
  md.push('## Method');
  md.push('');
  md.push('1. Read the input JSON and count every entry of the observations array as one row (row_count).');
  md.push('2. Sum scheduled, completed and incidents across all rows, and separately per site.');
  md.push('3. completion_percent = completed / scheduled * 100, rounded half-up to 2 decimals using integer arithmetic.');
  md.push('4. Re-run: node -- observation-digest-v1.js <input.json> <output-dir>; the output is deterministic for identical input bytes.');
  md.push('');

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'digest.json'), JSON.stringify(digest, null, 2) + '\n');
  fs.writeFileSync(path.join(outDir, 'digest.md'), md.join('\n'));
  console.log('observation-digest-v1: wrote digest.json and digest.md to ' + outDir);
} catch (err) {
  console.error('observation-digest-v1 failed: ' + err.message);
  process.exit(1);
}
