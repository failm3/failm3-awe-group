#!/usr/bin/env node
/**
 * observation-digest-v1
 *
 * Reads a JSON observation fixture, computes exact row/site totals and the
 * completion percentage, and persists digest.json + digest.md (+ receipt.json)
 * into the caller-supplied output directory.
 *
 * Contract:
 *   node -- <procedure-source> <fixture.json> <output-dir>
 *
 * Guarantees:
 *   - No network access, no third-party packages (node core modules only).
 *   - Writes only inside <output-dir>.
 *   - Deterministic arithmetic: integer sums only; completion percentage is
 *     completed/scheduled*100 rounded half-up to exactly 2 decimals, and is
 *     always serialized with 2 decimal places while remaining a JSON number.
 *   - Fails closed (exit 2) on malformed input rather than emitting a partial
 *     or guessed digest.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PROC = 'observation-digest-v1';

function fail(msg) {
  process.stderr.write(`${PROC}: ERROR: ${msg}\n`);
  process.exit(2);
}

function isNonNegInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

// completed/scheduled*100 rounded half-up to exactly 2 decimals, as a number.
// Evaluated in scaled integer space (/100 units of a percent) to avoid FP drift.
function completionPercent(completed, scheduled) {
  if (scheduled === 0) return 0;
  return Math.round((completed * 10000) / scheduled) / 100;
}

function fmt2(n) {
  return n.toFixed(2);
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function jstr(s) {
  return JSON.stringify(s);
}

// Deterministic serializer for the digest document. completion_percent fields
// are emitted as JSON numbers fixed to 2 decimals (e.g. 100.00), which plain
// JSON.stringify cannot express for a JS number.
function serializeDigest(src, period, fixtureSha256, d) {
  const L = [];
  L.push('{');
  L.push('  "row_count": ' + d.row_count + ',');
  L.push('  "scheduled": ' + d.scheduled + ',');
  L.push('  "completed": ' + d.completed + ',');
  L.push('  "incidents": ' + d.incidents + ',');
  L.push('  "completion_percent": ' + fmt2(d.completion_percent) + ',');
  L.push('  "sites": {');
  const keys = Object.keys(d.sites);
  keys.forEach((k, i) => {
    const s = d.sites[k];
    L.push('    ' + jstr(k) + ': {');
    L.push('      "scheduled": ' + s.scheduled + ',');
    L.push('      "completed": ' + s.completed + ',');
    L.push('      "incidents": ' + s.incidents + ',');
    L.push('      "completion_percent": ' + fmt2(s.completion_percent));
    L.push('    }' + (i === keys.length - 1 ? '' : ','));
  });
  L.push('  },');
  L.push('  "source": ' + jstr(src) + ',');
  L.push('  "period": ' + jstr(period) + ',');
  L.push('  "input_sha256": ' + jstr(fixtureSha256));
  L.push('}');
  return L.join('\n') + '\n';
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    fail(`expected exactly 2 arguments (<fixture.json> <output-dir>), got ${args.length}`);
  }

  const fixturePath = path.resolve(args[0]);
  const outDir = path.resolve(args[1]);

  let raw;
  try {
    raw = fs.readFileSync(fixturePath);
  } catch (e) {
    fail(`cannot read fixture ${fixturePath}: ${e.message}`);
  }
  const fixtureSha256 = sha256(raw);

  let doc;
  try {
    doc = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    fail(`fixture is not valid JSON: ${e.message}`);
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail('fixture root must be a JSON object');
  }
  if (!Array.isArray(doc.observations)) {
    fail('fixture.observations must be an array');
  }

  const rows = doc.observations;
  if (rows.length === 0) {
    fail('fixture.observations must contain at least one row');
  }

  const totals = { scheduled: 0, completed: 0, incidents: 0 };
  const siteMap = new Map();
  const siteRowCounts = new Map();

  rows.forEach((row, i) => {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      fail(`observations[${i}] must be an object`);
    }
    if (typeof row.site !== 'string' || row.site.length === 0) {
      fail(`observations[${i}].site must be a non-empty string`);
    }
    for (const f of ['scheduled', 'completed', 'incidents']) {
      if (!isNonNegInt(row[f])) {
        fail(`observations[${i}].${f} must be a non-negative integer`);
      }
    }

    totals.scheduled += row.scheduled;
    totals.completed += row.completed;
    totals.incidents += row.incidents;

    if (!siteMap.has(row.site)) {
      siteMap.set(row.site, { scheduled: 0, completed: 0, incidents: 0 });
      siteRowCounts.set(row.site, 0);
    }
    const s = siteMap.get(row.site);
    s.scheduled += row.scheduled;
    s.completed += row.completed;
    s.incidents += row.incidents;
    siteRowCounts.set(row.site, siteRowCounts.get(row.site) + 1);
  });

  if (totals.completed > totals.scheduled) {
    fail('completed total exceeds scheduled total; fixture is inconsistent');
  }

  const siteKeys = Array.from(siteMap.keys()).sort();
  const sites = {};
  for (const key of siteKeys) {
    const s = siteMap.get(key);
    sites[key] = {
      scheduled: s.scheduled,
      completed: s.completed,
      incidents: s.incidents,
      completion_percent: completionPercent(s.completed, s.scheduled),
    };
  }

  const totalPercent = completionPercent(totals.completed, totals.scheduled);
  const source = typeof doc.source === 'string' ? doc.source : null;
  const period = typeof doc.period === 'string' ? doc.period : null;

  const digest = {
    row_count: rows.length,
    scheduled: totals.scheduled,
    completed: totals.completed,
    incidents: totals.incidents,
    completion_percent: totalPercent,
    sites,
    source,
    period,
    input_sha256: fixtureSha256,
  };

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e) {
    fail(`cannot create output directory ${outDir}: ${e.message}`);
  }

  const digestJsonPath = path.join(outDir, 'digest.json');
  const digestMdPath = path.join(outDir, 'digest.md');
  const receiptPath = path.join(outDir, 'receipt.json');

  fs.writeFileSync(digestJsonPath, serializeDigest(source, period, fixtureSha256, digest), { encoding: 'utf8' });

  const md = [];
  md.push('# Observation digest');
  md.push('');
  md.push(`Capability: \`${PROC}\``);
  md.push('');
  md.push(`- Source: ${source === null ? '(unspecified)' : source}`);
  md.push(`- Period: ${period === null ? '(unspecified)' : period}`);
  md.push(`- Input fixture: \`${fixturePath}\``);
  md.push(`- Input fixture SHA-256: \`${fixtureSha256}\``);
  md.push('');
  md.push('## Totals');
  md.push('');
  md.push('| Metric | Value |');
  md.push('| --- | --- |');
  md.push(`| row_count | ${digest.row_count} |`);
  md.push(`| scheduled | ${digest.scheduled} |`);
  md.push(`| completed | ${digest.completed} |`);
  md.push(`| incidents | ${digest.incidents} |`);
  md.push(`| completion_percent | ${fmt2(digest.completion_percent)} |`);
  md.push('');
  md.push('## Sites');
  md.push('');
  md.push('| site | rows | scheduled | completed | incidents | completion_percent |');
  md.push('| --- | --- | --- | --- | --- | --- |');
  for (const key of siteKeys) {
    const s = sites[key];
    md.push(`| ${key} | ${siteRowCounts.get(key)} | ${s.scheduled} | ${s.completed} | ${s.incidents} | ${fmt2(s.completion_percent)} |`);
  }
  md.push('');
  md.push('## Method (reproducible)');
  md.push('');
  md.push(`1. Read the fixture \`${fixturePath}\` as UTF-8 JSON and pin its bytes by SHA-256 (\`${fixtureSha256}\`).`);
  md.push('2. Use the array at `observations`; `row_count` is its length, one row per element.');
  md.push('3. `scheduled`, `completed` and `incidents` are plain integer sums over all rows. The site table applies the identical sums partitioned by the exact `site` string, sorted by site name.');
  md.push('4. `completion_percent = round_half_up(completed / scheduled * 100, 2)`, computed in scaled integer space as `round(completed * 10000 / scheduled) / 100`; when `scheduled` is 0 the percentage is `0.00`.');
  md.push('5. Percentages are rendered to exactly 2 decimal places here and in `digest.json`; in the JSON they remain numbers, not strings.');
  md.push('6. Validation is fail-closed: a non-object root, non-array `observations`, empty row set, missing/non-integer/non-negative counter, or `completed > scheduled` aborts with exit code 2 and writes no digest.');
  md.push('');
  fs.writeFileSync(digestMdPath, md.join('\n'), { encoding: 'utf8' });

  const selfPath = path.resolve(__filename);
  const receipt = {
    procedure_id: PROC,
    argv: { fixture: fixturePath, output_dir: outDir },
    fixture_sha256: fixtureSha256,
    procedure_source: selfPath,
    procedure_sha256: sha256(fs.readFileSync(selfPath)),
    node_version: process.version,
    result: {
      row_count: digest.row_count,
      scheduled: digest.scheduled,
      completed: digest.completed,
      incidents: digest.incidents,
      completion_percent: digest.completion_percent,
    },
    outputs: [
      { name: 'digest.json', path: digestJsonPath, sha256: sha256(fs.readFileSync(digestJsonPath)) },
      { name: 'digest.md', path: digestMdPath, sha256: sha256(fs.readFileSync(digestMdPath)) },
    ],
    run_status: 'ok',
  };
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { encoding: 'utf8' });

  process.stdout.write(
    `${PROC}: row_count=${digest.row_count} scheduled=${digest.scheduled} ` +
    `completed=${digest.completed} incidents=${digest.incidents} ` +
    `completion_percent=${fmt2(digest.completion_percent)} sites=${siteKeys.length} ` +
    `out=${outDir}\n`
  );
}

main();
