#!/usr/bin/env node
/**
 * observation-digest-v1
 *
 * Reads a JSON observation fixture and persists an exact operational digest.
 *
 * Usage: node -- observation-digest-v1.js <input.json> <output-dir>
 *
 * Input : JSON object with an "observations" array. Each element is expected to
 *         carry string "site", plus integer "scheduled", "completed", "incidents".
 * Output: <output-dir>/digest.json  and  <output-dir>/digest.md
 *
 * Arithmetic contract (deterministic, integer-exact):
 *   row_count         = number of observation rows
 *   scheduled         = sum of row.scheduled
 *   completed         = sum of row.completed
 *   incidents         = sum of row.incidents
 *   completion_percent= completed / scheduled * 100, rounded half-up
 *                       (round-half-away-from-zero) to exactly 2 decimals.
 *   completion_percent is serialised as a JSON *number* carrying exactly two
 *   decimal places.
 *   sites             = object keyed by site name (ascending), each with
 *                       rows, scheduled, completed, incidents,
 *                       completion_percent (same rounding rule).
 *
 * Rounding note: percentage uses exact integer arithmetic
 *   pct2 = round(completed * 10000 / scheduled)  in hundredths of a percent
 * computed with BigInt, so no binary floating point drift can occur.
 *
 * No network, no dependencies, no writes outside <output-dir>.
 */

'use strict';

const fs = require('fs');
const path = require('path');

function fail(message) {
  process.stderr.write('observation-digest-v1: ' + message + '\n');
  process.exit(2);
}

// Round a rational num/den (BigInt, den > 0) half-up to an integer.
function roundHalfUpDiv(num, den) {
  // den > 0. half-up (away from zero) for the non-negative domain used here.
  return (2n * num + den) / (2n * den);
}

function toHundredths(completed, scheduled) {
  if (!Number.isInteger(completed) || !Number.isInteger(scheduled)) {
    fail('completed and scheduled must be integers');
  }
  if (scheduled < 0) fail('scheduled must be non-negative');
  if (scheduled === 0) {
    // Convention: no scheduled rows => 0.00 completion.
    return 0n;
  }
  const num = BigInt(completed) * 10000n; // *100 (percent) *100 (hundredths)
  const den = BigInt(scheduled);
  return roundHalfUpDiv(num, den);
}

// Format hundredths BigInt as a JSON number literal with exactly 2 decimals.
function hundredthsToNumberLiteral(h2) {
  const neg = h2 < 0n;
  const abs = neg ? -h2 : h2;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const fracStr = frac.toString().padStart(2, '0');
  return (neg ? '-' : '') + whole.toString() + '.' + fracStr;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function main(argv) {
  if (argv.length !== 2) {
    fail('expected exactly 2 arguments: <input.json> <output-dir>');
  }
  const inputPath = path.resolve(argv[0]);
  const outDir = path.resolve(argv[1]);

  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf8');
  } catch (e) {
    fail('cannot read input file ' + inputPath + ': ' + e.message);
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    fail('input is not valid JSON: ' + e.message);
  }
  if (!isPlainObject(doc)) fail('input root must be a JSON object');
  if (!Array.isArray(doc.observations)) fail('input must contain an "observations" array');

  const rows = doc.observations;
  const totals = { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
  const sites = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!isPlainObject(row)) fail('observation[' + i + '] must be an object');
    if (typeof row.site !== 'string' || row.site.length === 0) {
      fail('observation[' + i + '].site must be a non-empty string');
    }
    for (const k of ['scheduled', 'completed', 'incidents']) {
      if (!Number.isInteger(row[k])) {
        fail('observation[' + i + '].' + k + ' must be an integer');
      }
      if (row[k] < 0) fail('observation[' + i + '].' + k + ' must be non-negative');
    }

    totals.rows += 1;
    totals.scheduled += row.scheduled;
    totals.completed += row.completed;
    totals.incidents += row.incidents;

    const key = row.site;
    if (!sites.has(key)) {
      sites.set(key, { site: key, rows: 0, scheduled: 0, completed: 0, incidents: 0 });
    }
    const s = sites.get(key);
    s.rows += 1;
    s.scheduled += row.scheduled;
    s.completed += row.completed;
    s.incidents += row.incidents;
  }

  const siteNames = Array.from(sites.keys()).sort(function (a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const totalH2 = toHundredths(totals.completed, totals.scheduled);
  const totalPctLiteral = hundredthsToNumberLiteral(totalH2);
  const totalPctLabel = totalPctLiteral + '%';

  const siteH2 = new Map();
  for (const name of siteNames) {
    siteH2.set(name, toHundredths(sites.get(name).completed, sites.get(name).scheduled));
  }

  // ---- digest.json -------------------------------------------------------
  // Built by hand so completion_percent is emitted with exactly 2 decimals.
  const jsonLines = [];
  jsonLines.push('{');
  jsonLines.push('  "source": ' + JSON.stringify(typeof doc.source === 'string' ? doc.source : null) + ',');
  jsonLines.push('  "period": ' + JSON.stringify(typeof doc.period === 'string' ? doc.period : null) + ',');
  jsonLines.push('  "row_count": ' + totals.rows + ',');
  jsonLines.push('  "scheduled": ' + totals.scheduled + ',');
  jsonLines.push('  "completed": ' + totals.completed + ',');
  jsonLines.push('  "incidents": ' + totals.incidents + ',');
  jsonLines.push('  "completion_percent": ' + totalPctLiteral + ',');
  jsonLines.push('  "sites": {');
  for (let i = 0; i < siteNames.length; i++) {
    const name = siteNames[i];
    const s = sites.get(name);
    const comma = i === siteNames.length - 1 ? '' : ',';
    jsonLines.push('    ' + JSON.stringify(name) + ': {');
    jsonLines.push('      "rows": ' + s.rows + ',');
    jsonLines.push('      "scheduled": ' + s.scheduled + ',');
    jsonLines.push('      "completed": ' + s.completed + ',');
    jsonLines.push('      "incidents": ' + s.incidents + ',');
    jsonLines.push('      "completion_percent": ' + hundredthsToNumberLiteral(siteH2.get(name)));
    jsonLines.push('    }' + comma);
  }
  jsonLines.push('  }');
  jsonLines.push('}');
  const digestJson = jsonLines.join('\n') + '\n';

  // ---- digest.md ---------------------------------------------------------
  const md = [];
  md.push('# Observation digest');
  md.push('');
  md.push('Source: ' + (typeof doc.source === 'string' ? doc.source : '(unspecified)'));
  md.push('');
  md.push('Period: ' + (typeof doc.period === 'string' ? doc.period : '(unspecified)'));
  md.push('');
  md.push('## Totals');
  md.push('');
  md.push('| metric | value |');
  md.push('| --- | --- |');
  md.push('| row_count | ' + totals.rows + ' |');
  md.push('| scheduled | ' + totals.scheduled + ' |');
  md.push('| completed | ' + totals.completed + ' |');
  md.push('| incidents | ' + totals.incidents + ' |');
  md.push('| completion_percent | ' + totalPctLiteral + ' |');
  md.push('');
  md.push('## Sites');
  md.push('');
  md.push('| site | rows | scheduled | completed | incidents | completion_percent |');
  md.push('| --- | --- | --- | --- | --- | --- |');
  for (const name of siteNames) {
    const s = sites.get(name);
    md.push(
      '| ' + name + ' | ' + s.rows + ' | ' + s.scheduled + ' | ' + s.completed + ' | ' +
      s.incidents + ' | ' + hundredthsToNumberLiteral(siteH2.get(name)) + ' |'
    );
  }
  md.push('');
  md.push('## Method');
  md.push('');
  md.push('1. Read the JSON fixture and take `observations` as the row list; `row_count` is its length.');
  md.push('2. `scheduled`, `completed` and `incidents` are integer sums over all rows.');
  md.push('3. `completion_percent = completed / scheduled * 100`, rounded half-up');
  md.push('   (round-half-away-from-zero) to exactly 2 decimals, computed in exact integer');
  md.push('   arithmetic (`round(completed * 10000 / scheduled)` hundredths of a percent)');
  md.push('   so no binary floating point drift can occur.');
  md.push('4. The `sites` object groups rows by `site`, sorted by site name ascending, and');
  md.push('   applies the same sums and the same percentage rule within each site.');
  md.push('5. Totals are computed from the row list directly and are independent of the');
  md.push('   per-site breakdown; `sum(sites.scheduled) == scheduled` and');
  md.push('   `sum(sites.completed) == completed` hold by construction.');
  md.push('');
  md.push('Reproduce: `node -- observation-digest-v1.js <input.json> <output-dir>`');
  md.push('');
  const digestMd = md.join('\n');

  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'digest.json'), digestJson, 'utf8');
    fs.writeFileSync(path.join(outDir, 'digest.md'), digestMd, 'utf8');
  } catch (e) {
    fail('cannot write outputs to ' + outDir + ': ' + e.message);
  }

  process.stdout.write(
    JSON.stringify({
      wrote: ['digest.json', 'digest.md'],
      output_dir: outDir,
      row_count: totals.rows,
      scheduled: totals.scheduled,
      completed: totals.completed,
      incidents: totals.incidents,
      completion_percent: totalPctLiteral,
    }) + '\n'
  );
}

main(process.argv.slice(2));
