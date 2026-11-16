'use strict';
// observation-digest-v1
// Usage: node -- observation-digest-v1.js <observations.json> <output-dir>
// Reads the observation fixture and writes digest.json and digest.md to <output-dir>.
// No network, no dependencies. All arithmetic is on integers; the percentage is
// rounded half-up to 2 decimals using integer math.

const fs = require('node:fs');
const path = require('node:path');

function fail(msg) {
  process.stderr.write('observation-digest-v1: ' + msg + '\n');
  process.exit(1);
}

function nonNegInt(v, label) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    fail(label + ' must be a non-negative integer, got ' + JSON.stringify(v));
  }
  return v;
}

// completed/scheduled*100 rounded half-up to 2 decimals, returned as text.
function percentText(completed, scheduled) {
  if (scheduled === 0) return '0.00';
  const cents = Math.floor((completed * 20000 + scheduled) / (2 * scheduled));
  const whole = Math.floor(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return whole + '.' + frac;
}

const args = process.argv.slice(2);
if (args.length !== 2) fail('expected exactly 2 arguments: <observations.json> <output-dir>');
const inputPath = path.resolve(args[0]);
const outDir = path.resolve(args[1]);

let doc;
try {
  doc = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
} catch (e) {
  fail('cannot read/parse input: ' + e.message);
}
if (!doc || !Array.isArray(doc.observations)) fail('input.observations must be an array');

const sites = new Map();
let scheduled = 0;
let completed = 0;
let incidents = 0;

doc.observations.forEach((row, i) => {
  if (!row || typeof row !== 'object') fail('observations[' + i + '] must be an object');
  if (typeof row.site !== 'string' || row.site === '') fail('observations[' + i + '].site must be a non-empty string');
  const s = nonNegInt(row.scheduled, 'observations[' + i + '].scheduled');
  const c = nonNegInt(row.completed, 'observations[' + i + '].completed');
  const n = nonNegInt(row.incidents, 'observations[' + i + '].incidents');
  if (c > s) fail('observations[' + i + '] completed exceeds scheduled');
  scheduled += s;
  completed += c;
  incidents += n;
  const t = sites.get(row.site) || { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
  t.rows += 1;
  t.scheduled += s;
  t.completed += c;
  t.incidents += n;
  sites.set(row.site, t);
});

const rowCount = doc.observations.length;
const pct = percentText(completed, scheduled);
const names = Array.from(sites.keys()).sort();

// Build JSON by hand so completion_percent keeps exactly 2 decimals as a number.
const q = (s) => JSON.stringify(s);
const siteLines = names.map((name) => {
  const t = sites.get(name);
  return '    ' + q(name) + ': { "rows": ' + t.rows + ', "scheduled": ' + t.scheduled +
    ', "completed": ' + t.completed + ', "incidents": ' + t.incidents +
    ', "completion_percent": ' + percentText(t.completed, t.scheduled) + ' }';
});
const json = '{\n' +
  '  "row_count": ' + rowCount + ',\n' +
  '  "scheduled": ' + scheduled + ',\n' +
  '  "completed": ' + completed + ',\n' +
  '  "incidents": ' + incidents + ',\n' +
  '  "completion_percent": ' + pct + ',\n' +
  '  "sites": {\n' + siteLines.join(',\n') + '\n  }\n' +
  '}\n';

const md = [
  '# Observation digest',
  '',
  'Source: ' + path.basename(inputPath) + (typeof doc.source === 'string' ? ' (' + doc.source + ')' : '') +
    (typeof doc.period === 'string' ? ', period ' + doc.period : ''),
  '',
  '| Metric | Value |',
  '| --- | --- |',
  '| row_count | ' + rowCount + ' |',
  '| scheduled | ' + scheduled + ' |',
  '| completed | ' + completed + ' |',
  '| incidents | ' + incidents + ' |',
  '| completion_percent | ' + pct + ' |',
  '',
  '## Sites',
  '',
  '| Site | Rows | Scheduled | Completed | Incidents | Completion % |',
  '| --- | --- | --- | --- | --- | --- |',
].concat(names.map((name) => {
  const t = sites.get(name);
  return '| ' + name.replace(/\|/g, '\\|') + ' | ' + t.rows + ' | ' + t.scheduled + ' | ' + t.completed +
    ' | ' + t.incidents + ' | ' + percentText(t.completed, t.scheduled) + ' |';
})).concat([
  '',
  '## Method',
  '',
  '1. Parse the input JSON and take every element of `observations` as one row.',
  '2. `row_count` is the number of rows. `scheduled`, `completed` and `incidents` are integer sums over all rows.',
  '3. `completion_percent` = completed / scheduled x 100, rounded half-up to 2 decimals using integer arithmetic.',
  '4. Each site total sums the rows with that exact `site` value. Site percentages use the same formula.',
  '',
]).join('\n');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'digest.json'), json);
fs.writeFileSync(path.join(outDir, 'digest.md'), md);
