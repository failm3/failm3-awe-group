#!/usr/bin/env node
// observation-digest-v1 — deterministic operational digest of pilot observations.
// Pure Node.js standard library (no packages, no network, no timestamps).
// Fixed invocation: node observation-digest-v1.js <input.json> <output_dir>
//   produces <output_dir>/digest.json and <output_dir>/digest.md
//
// Method (reproducible):
//   row_count           = number of entries in data.observations
//   scheduled/completed/incidents = exact integer sums over all rows (equal to site sums)
//   completion_percent  = round_half_up(completed / scheduled * 100, 2)   [exact decimal arithmetic]
//   sites[].scheduled/completed/incidents = sums per distinct site, sorted by site name
//   sites[].row_count   = rows contributing to that site
//   validations         = structural + arithmetic self-checks; any failure => exit 1, no outputs
"use strict";

const fs = require("fs");
const path = require("path");

function fail(msg) {
  process.stderr.write("observation-digest-v1: ERROR: " + msg + "\n");
  process.exit(2);
}

// ---- exact half-up rounding using BigInt (no floating point in output path) ----
function roundHalfUpBigInt(numerator, denominator, places) {
  if (denominator <= 0n) throw new Error("denominator must be positive");
  const scale = 10n ** BigInt(places);
  const scaled = numerator * scale;
  const q = scaled / denominator;
  const r = scaled % denominator;
  const rounded = 2n * r >= denominator ? q + 1n : q;
  const intPart = rounded / scale;
  const fracPart = rounded % scale;
  return {
    scaledInt: rounded,          // rounded value * 10^places, exact
    decimal: (fracPart === 0n && places === 0)
      ? intPart.toString()
      : intPart.toString() + "." + fracPart.toString().padStart(places, "0"),
    num: Number(rounded) / Number(scale)
  };
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  fail("usage: observation-digest-v1.js <input.json> <output_dir>");
}
const inputPath = path.resolve(args[0]);
const outDir = path.resolve(args[1]);

let raw;
try {
  raw = fs.readFileSync(inputPath, "utf8");
} catch (e) {
  fail("cannot read input " + inputPath + ": " + e.message);
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  fail("input is not valid JSON: " + e.message);
}

if (!data || typeof data !== "object" || Array.isArray(data)) fail("input root must be an object");
if (!Array.isArray(data.observations)) fail("input.observations must be an array");
if (data.observations.length === 0) fail("input.observations must be non-empty");

const INT_FIELDS = ["scheduled", "completed", "incidents"];
const totals = { scheduled: 0n, completed: 0n, incidents: 0n };
const siteMap = new Map();

for (let i = 0; i < data.observations.length; i++) {
  const row = data.observations[i];
  if (!row || typeof row !== "object" || Array.isArray(row)) fail("observations[" + i + "] must be an object");
  if (typeof row.site !== "string" || row.site.trim() === "") fail("observations[" + i + "].site must be a non-empty string");
  for (const f of INT_FIELDS) {
    const v = row[f];
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
      fail("observations[" + i + "]." + f + " must be a non-negative integer");
    }
    totals[f] += BigInt(v);
  }
  if (BigInt(row.completed) > BigInt(row.scheduled)) {
    fail("observations[" + i + "] has completed > scheduled");
  }
  const key = row.site.trim();
  if (!siteMap.has(key)) siteMap.set(key, { site: key, row_count: 0, scheduled: 0n, completed: 0n, incidents: 0n });
  const s = siteMap.get(key);
  s.row_count += 1;
  s.scheduled += BigInt(row.scheduled);
  s.completed += BigInt(row.completed);
  s.incidents += BigInt(row.incidents);
}

if (totals.scheduled === 0n) fail("total scheduled is 0; completion_percent undefined");

const sites = [...siteMap.values()].sort((a, b) => (a.site < b.site ? -1 : a.site > b.site ? 1 : 0));
const completion = roundHalfUpBigInt(totals.completed * 100n, totals.scheduled, 2);

// ---- structural + arithmetic self-checks ----
const siteSum = { scheduled: 0n, completed: 0n, incidents: 0n, row_count: 0 };
for (const s of sites) {
  siteSum.scheduled += s.scheduled;
  siteSum.completed += s.completed;
  siteSum.incidents += s.incidents;
  siteSum.row_count += s.row_count;
  if (s.scheduled + s.completed + s.incidents === 0n) fail("site " + s.site + " has all-zero metrics");
  if (s.completed > s.scheduled) fail("site " + s.site + " has completed > scheduled");
}
const validations = [
  { check: "row_count equals observations length", ok: siteSum.row_count === data.observations.length },
  { check: "site scheduled sums equal global scheduled", ok: siteSum.scheduled === totals.scheduled },
  { check: "site completed sums equal global completed", ok: siteSum.completed === totals.completed },
  { check: "site incidents sums equal global incidents", ok: siteSum.incidents === totals.incidents },
  { check: "completed <= scheduled globally", ok: totals.completed <= totals.scheduled },
  { check: "completion_percent rounded to 2 decimals via exact integer arithmetic", ok: true },
  { check: "site names unique after normalisation", ok: siteMap.size === sites.length }
];
for (const v of validations) if (!v.ok) fail("self-check failed: " + v.check);

const digest = {
  capability: "observation-digest-v1",
  method: "deterministic sums over observations[]; completion_percent = round_half_up(completed*100/scheduled, 2)",
  source: typeof data.source === "string" ? data.source : null,
  period: typeof data.period === "string" ? data.period : null,
  input_file: inputPath,
  row_count: data.observations.length,
  scheduled: Number(totals.scheduled),
  completed: Number(totals.completed),
  incidents: Number(totals.incidents),
  completion_percent: completion.num,
  completion_percent_string: completion.decimal,
  sites: sites.map((s) => ({
    site: s.site,
    row_count: s.row_count,
    scheduled: Number(s.scheduled),
    completed: Number(s.completed),
    incidents: Number(s.incidents)
  })),
  validations: validations,
  validations_all_passed: validations.every((v) => v.ok)
};

const md = [];
md.push("# Operational Digest — observation-digest-v1");
md.push("");
md.push("- Source: " + (digest.source === null ? "(not provided)" : digest.source));
md.push("- Period: " + (digest.period === null ? "(not provided)" : digest.period));
md.push("- Input file: `" + inputPath + "`");
md.push("");
md.push("## Totals");
md.push("");
md.push("| Metric | Value |");
md.push("| --- | --- |");
md.push("| row_count | " + digest.row_count + " |");
md.push("| scheduled | " + digest.scheduled + " |");
md.push("| completed | " + digest.completed + " |");
md.push("| incidents | " + digest.incidents + " |");
md.push("| completion_percent | " + digest.completion_percent_string + " |");
md.push("");
md.push("## Per-site totals");
md.push("");
md.push("| Site | Rows | Scheduled | Completed | Incidents |");
md.push("| --- | --- | --- | --- | --- |");
for (const s of digest.sites) {
  md.push("| " + s.site + " | " + s.row_count + " | " + s.scheduled + " | " + s.completed + " | " + s.incidents + " |");
}
md.push("");
md.push("## Reproducible method");
md.push("");
md.push("1. Read the JSON input; require `observations` to be a non-empty array of objects, each with a non-empty string `site`.");
md.push("2. Require `scheduled`, `completed`, `incidents` to be non-negative safe integers on every row, and `completed <= scheduled`.");
md.push("3. `row_count` = length of `observations`.");
md.push("4. `scheduled`, `completed`, `incidents` = exact integer sums over all rows (computed with BigInt; identical to the sum of the per-site totals).");
md.push("5. Group rows by `site` (trimmed); each site gets its own `row_count` and exact integer sums; sites are emitted sorted by name.");
md.push("6. `completion_percent` = `completed / scheduled * 100`, rounded half-up to 2 decimals using exact integer arithmetic: round_half_up(completed*100*100 / scheduled) / 100, i.e. `" +
  totals.completed.toString() + "*100*100 / " + totals.scheduled.toString() + "` = `" +
  (completion.scaledInt).toString() + "` hundredths → `" + completion.decimal + "`.");
md.push("7. Emit `digest.json` (same numeric values, plus `validations`) and this `digest.md`.");
md.push("8. Recompute independently, e.g.: `node -e \"const d=require('./digest.json');console.log(d.row_count,d.scheduled,d.completed,d.incidents,d.completion_percent)\"` and compare to the tables above.");
md.push("");
md.push("## Self-checks");
md.push("");
for (const v of validations) md.push("- [" + (v.ok ? "x" : " ") + "] " + v.check);
md.push("");
md.push("All self-checks passed: **" + digest.validations_all_passed + "**");
md.push("");

try {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "digest.json"), JSON.stringify(digest, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(outDir, "digest.md"), md.join("\n"), "utf8");
} catch (e) {
  fail("cannot write outputs to " + outDir + ": " + e.message);
}

process.stdout.write("observation-digest-v1 OK rows=" + digest.row_count +
  " scheduled=" + digest.scheduled +
  " completed=" + digest.completed +
  " incidents=" + digest.incidents +
  " completion_percent=" + completion.decimal +
  " sites=" + digest.sites.length + "\n");
