#!/usr/bin/env node
'use strict';

/*
 * observation-digest-v1
 * Self-contained, dependency-free procedure. Node standard library only.
 *
 * Fixed invocation:
 *   node -- <this-file> <input.observations.json> <output-root>
 *
 * Reads the observation fixture, computes exact row/site totals and an exact
 * completion percentage rounded half-up to 2 decimals, and persists
 * <output-root>/digest.json and <output-root>/digest.md.
 *
 * Arithmetic is integer/rational only: no floating point is used for the
 * percentage, so results are identical on any conforming host.
 */

const fs = require('fs');
const path = require('path');

const PROG = 'observation-digest-v1';

function die(msg, code) {
  process.stderr.write(PROG + ': ' + msg + '\n');
  process.exit(code || 2);
}

function isCount(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && Number.isSafeInteger(v);
}

function asCount(v, label) {
  if (!isCount(v)) die('invalid ' + label + ' (expected non-negative integer): ' + JSON.stringify(v));
  return v;
}

function asText(v, label) {
  if (typeof v !== 'string' || v.length === 0) die('invalid ' + label + ' (expected non-empty string): ' + JSON.stringify(v));
  return v;
}

/* Exact percent = numerator/denominator*100, rounded half-up, expressed in
 * hundredths using only integer arithmetic (BigInt for headroom). Returns a
 * JS number holding an exact multiple of 0.01. */
function percentHundredths(numerator, denominator) {
  if (denominator === 0) return 0; // 0/0 -> 0.00, documented in digest.md
  const n = BigInt(numerator) * 10000n;
  const d = BigInt(denominator);
  let q = n / d;
  const r = n % d;
  if (r * 2n >= d) q += 1n; // half-up
  return Number(q); // exact; magnitudes here are tiny
}

function pct(numerator, denominator) {
  return percentHundredths(numerator, denominator) / 100;
}

function fmt2(value) {
  // stable two-decimal textual rendering of a hundredths-based number
  const hundredths = Math.round(value * 100);
  const sign = hundredths < 0 ? '-' : '';
  const abs = Math.abs(hundredths);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return sign + String(whole) + '.' + (frac < 10 ? '0' + frac : String(frac));
}

function main(argv) {
  const inputPath = argv[2];
  const outRoot = argv[3];
  if (!inputPath || !outRoot) {
    die('usage: node -- <this-file> <input.observations.json> <output-root>');
  }

  const inAbs = path.resolve(inputPath);
  const outAbs = path.resolve(outRoot);

  let raw;
  try {
    raw = fs.readFileSync(inAbs, 'utf8');
  } catch (e) {
    die('cannot read input ' + inAbs + ': ' + e.message);
  }

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    die('input is not valid JSON: ' + e.message);
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) die('input root must be a JSON object');
  if (!Array.isArray(doc.observations)) die('input.observations must be an array');

  const rows = doc.observations;
  const siteTotals = new Map();
  let scheduled = 0;
  let completed = 0;
  let incidents = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row === null || typeof row !== 'object' || Array.isArray(row)) die('observations[' + i + '] must be an object');
    const site = asText(row.site, 'observations[' + i + '].site');
    const s = asCount(row.scheduled, 'observations[' + i + '].scheduled');
    const c = asCount(row.completed, 'observations[' + i + '].completed');
    const n = asCount(row.incidents, 'observations[' + i + '].incidents');

    scheduled += s;
    completed += c;
    incidents += n;

    const acc = siteTotals.get(site) || { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
    acc.rows += 1;
    acc.scheduled += s;
    acc.completed += c;
    acc.incidents += n;
    siteTotals.set(site, acc);
  }

  const siteNames = Array.from(siteTotals.keys()).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
  const sites = {};
  for (const name of siteNames) {
    const t = siteTotals.get(name);
    sites[name] = {
      rows: t.rows,
      scheduled: t.scheduled,
      completed: t.completed,
      incidents: t.incidents,
      completion_percent: pct(t.completed, t.scheduled),
    };
  }

  const totalPercentHundredths = percentHundredths(completed, scheduled);

  const digest = {
    source: typeof doc.source === 'string' ? doc.source : null,
    period: typeof doc.period === 'string' ? doc.period : null,
    row_count: rows.length,
    scheduled: scheduled,
    completed: completed,
    incidents: incidents,
    completion_percent: totalPercentHundredths / 100,
    sites: sites,
  };
  if (digest.source === null) delete digest.source;
  if (digest.period === null) delete digest.period;

  const jsonText = JSON.stringify(digest, null, 2) + '\n';

  const lines = [];
  lines.push('# Operational digest');
  lines.push('');
  if (digest.source) lines.push('- Source: ' + digest.source);
  if (digest.period) lines.push('- Period: ' + digest.period);
  lines.push('- Input: `' + inAbs + '`');
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push('| Rows | ' + String(digest.row_count) + ' |');
  lines.push('| Scheduled | ' + String(digest.scheduled) + ' |');
  lines.push('| Completed | ' + String(digest.completed) + ' |');
  lines.push('| Incidents | ' + String(digest.incidents) + ' |');
  lines.push('| Completion percent | ' + fmt2(digest.completion_percent) + ' |');
  lines.push('');
  lines.push('## By site');
  lines.push('');
  lines.push('| Site | Rows | Scheduled | Completed | Incidents | Completion percent |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const name of siteNames) {
    const s = sites[name];
    lines.push('| ' + name + ' | ' + String(s.rows) + ' | ' + String(s.scheduled) + ' | ' + String(s.completed) + ' | ' + String(s.incidents) + ' | ' + fmt2(s.completion_percent) + ' |');
  }
  lines.push('| **All sites** | **' + String(digest.row_count) + '** | **' + String(digest.scheduled) + '** | **' + String(digest.completed) + '** | **' + String(digest.incidents) + '** | **' + fmt2(digest.completion_percent) + '** |');
  lines.push('');
  lines.push('## Method (reproducible)');
  lines.push('');
  lines.push('1. Read the single JSON fixture at the path given as argument 1 (UTF-8, `JSON.parse`).');
  lines.push('2. Take the `observations` array as the row set; each row contributes its `site` string and its `scheduled`, `completed`, `incidents` integers. Non-negative integers are enforced; any other value aborts with exit code 2.');
  lines.push('3. `row_count` = number of elements of `observations`.');
  lines.push('4. `scheduled`, `completed`, `incidents` = exact integer sums over all rows (also reported per site).');
  lines.push('5. `completion_percent` = `completed / scheduled * 100`, computed in exact integer arithmetic as hundredths: `q = (completed * 10000) / scheduled` with remainder `r`; if `r * 2 >= scheduled` then `q = q + 1` (round half up); result = `q / 100`. Division by zero yields `0.00`. No floating-point rounding is involved, so the value is host-independent.');
  lines.push('6. `sites` = object keyed by every distinct `site`, keys sorted by Unicode code point (ascending); each entry carries `rows`, `scheduled`, `completed`, `incidents` and its own `completion_percent` computed by step 5.');
  lines.push('7. Write `digest.json` (2-space indented JSON, trailing newline) and `digest.md` (this file) into the output root given as argument 2.');
  lines.push('');
  lines.push('Verification example: `' + String(digest.completed) + ' / ' + String(digest.scheduled) + ' * 100` = ' + fmt2(100 * digest.completed / digest.scheduled) + ' → rounded half up to 2 decimals = ' + fmt2(digest.completion_percent) + '.');
  lines.push('');

  const mdText = lines.join('\n');

  try {
    fs.mkdirSync(outAbs, { recursive: true });
    fs.writeFileSync(path.join(outAbs, 'digest.json'), jsonText, 'utf8');
    fs.writeFileSync(path.join(outAbs, 'digest.md'), mdText, 'utf8');
  } catch (e) {
    die('cannot write outputs under ' + outAbs + ': ' + e.message);
  }

  const receipt = {
    procedure: path.resolve(__filename),
    arguments: [inAbs, outAbs],
    input_sha256: require('crypto').createHash('sha256').update(fs.readFileSync(inAbs)).digest('hex'),
    row_count: digest.row_count,
    scheduled: digest.scheduled,
    completed: digest.completed,
    incidents: digest.incidents,
    completion_percent: digest.completion_percent,
    outputs: ['digest.json', 'digest.md'],
  };
  process.stdout.write(JSON.stringify(receipt) + '\n');
  return 0;
}

process.exitCode = 0;
try {
  main(process.argv);
} catch (e) {
  die('unexpected failure: ' + (e && e.stack ? e.stack : String(e)), 1);
}
