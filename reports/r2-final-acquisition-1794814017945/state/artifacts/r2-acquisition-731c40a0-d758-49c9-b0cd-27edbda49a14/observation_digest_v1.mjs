#!/usr/bin/env node
// observation-digest-v1
// Deterministic operational digest generator for observation fixtures.
//
// Invocation (fixed contract):
//   node observation_digest_v1.mjs <observations.json> <output-dir>
//
// Reads the observation fixture, computes exact row/site totals and the
// completion percentage (2 decimals), and persists <output-dir>/digest.json
// and <output-dir>/digest.md. Node.js standard library only: no packages,
// no network, no environment reads, no timestamps -- byte output depends
// solely on the input fixture bytes and the two argument paths' basenames.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const USAGE = 'usage: node observation_digest_v1.mjs <observations.json> <output-dir>';

function die(msg) {
  process.stderr.write(`observation-digest-v1: ${msg}\n${USAGE}\n`);
  process.exit(2);
}

const argv = process.argv.slice(2);
if (argv.length !== 2) die(`expected exactly 2 arguments, received ${argv.length}`);
const inputPath = path.resolve(argv[0]);
const outDir = path.resolve(argv[1]);

// ---------------------------------------------------------------- exact math
// Half-up rounding of (completed / scheduled) * 100 to 2 decimals using
// integer arithmetic only, so no binary floating point drift can occur.
function pct2(completed, scheduled) {
  if (scheduled === 0) return 0;
  const numer = completed * 10000; // (completed/scheduled)*100 scaled by 100
  const q = Math.floor(numer / scheduled);
  const r = numer - q * scheduled;
  const rounded = r * 2 >= scheduled ? q + 1 : q;
  return rounded / 100;
}

function asCount(value, field, where) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    die(`${where}.${field} must be a non-negative integer, received ${JSON.stringify(value)}`);
  }
  return value;
}

// ------------------------------------------------------------------- reading
let parsed;
try {
  parsed = JSON.parse(readFileSync(inputPath, 'utf8'));
} catch (err) {
  die(`cannot read/parse ${inputPath}: ${err.message}`);
}
if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
  die('fixture root must be a JSON object');
}
const observations = parsed.observations;
if (!Array.isArray(observations) || observations.length === 0) {
  die('fixture must contain a non-empty "observations" array');
}

// ---------------------------------------------------------------- reduction
let scheduled = 0;
let completed = 0;
let incidents = 0;
const siteMap = new Map();

for (let i = 0; i < observations.length; i += 1) {
  const row = observations[i];
  const where = `observations[${i}]`;
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    die(`${where} must be an object`);
  }
  if (typeof row.site !== 'string' || row.site.trim() === '') {
    die(`${where}.site must be a non-empty string`);
  }
  const s = asCount(row.scheduled, 'scheduled', where);
  const c = asCount(row.completed, 'completed', where);
  const inc = asCount(row.incidents, 'incidents', where);
  if (c > s) die(`${where}: completed (${c}) exceeds scheduled (${s})`);

  scheduled += s;
  completed += c;
  incidents += inc;

  const key = row.site;
  const acc = siteMap.get(key) || { rows: 0, scheduled: 0, completed: 0, incidents: 0 };
  acc.rows += 1;
  acc.scheduled += s;
  acc.completed += c;
  acc.incidents += inc;
  siteMap.set(key, acc);
}

// Site keys sorted by code point -> stable, locale-independent ordering.
const siteKeys = [...siteMap.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const sites = {};
for (const key of siteKeys) {
  const acc = siteMap.get(key);
  sites[key] = {
    rows: acc.rows,
    scheduled: acc.scheduled,
    completed: acc.completed,
    incidents: acc.incidents,
    completion_percent: pct2(acc.completed, acc.scheduled),
  };
}

const digest = {
  source: typeof parsed.source === 'string' ? parsed.source : null,
  period: typeof parsed.period === 'string' ? parsed.period : null,
  row_count: observations.length,
  scheduled,
  completed,
  incidents,
  completion_percent: pct2(completed, scheduled),
  sites,
};

// ---------------------------------------------------------------- rendering
const jsonText = `${JSON.stringify(digest, null, 2)}\n`;

const md = [];
md.push('# Observation Digest', '');
md.push(`- Source: ${digest.source === null ? '(unspecified)' : digest.source}`);
md.push(`- Period: ${digest.period === null ? '(unspecified)' : digest.period}`);
md.push(`- Input rows: ${digest.row_count}`, '');
md.push('## Totals', '');
md.push('| Metric | Value |', '| --- | ---: |');
md.push(`| row_count | ${digest.row_count} |`);
md.push(`| scheduled | ${digest.scheduled} |`);
md.push(`| completed | ${digest.completed} |`);
md.push(`| incidents | ${digest.incidents} |`);
md.push(`| completion_percent | ${digest.completion_percent.toFixed(2)} |`, '');
md.push('## Per-site totals', '');
md.push('| Site | rows | scheduled | completed | incidents | completion_percent |');
md.push('| --- | ---: | ---: | ---: | ---: | ---: |');
for (const key of siteKeys) {
  const s = sites[key];
  md.push(
    `| ${key} | ${s.rows} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${s.completion_percent.toFixed(2)} |`,
  );
}
md.push('');
md.push('## Method', '');
md.push('1. Parse the input fixture as JSON and require a non-empty `observations` array.');
md.push('2. Sum the integer fields `scheduled`, `completed` and `incidents` over all rows; `row_count` is the array length.');
md.push('3. Group rows by `site`, summing the same three fields per site and sorted by site name (code point order); each site also records its `rows` count.');
md.push('4. Compute `completion_percent` as `completed * 10000 / scheduled`, rounded half-up to an integer numerator, then divided by 100, i.e. `completed / scheduled * 100` to 2 decimals. Sites with `scheduled = 0` report `0`.');
md.push('5. Emit `digest.json` (this data, keys in fixed order) and `digest.md` (this document) into the requested output directory.');
md.push('');
md.push('Reproduce with: `node observation_digest_v1.mjs <observations.json> <output-dir>`; output bytes are a pure function of the input fixture.');
md.push('');
const mdText = md.join('\n');

mkdirSync(outDir, { recursive: true });
const jsonOut = path.join(outDir, 'digest.json');
const mdOut = path.join(outDir, 'digest.md');
writeFileSync(jsonOut, jsonText, 'utf8');
writeFileSync(mdOut, mdText, 'utf8');

process.stdout.write(`wrote ${jsonOut}\nwrote ${mdOut}\n`);
