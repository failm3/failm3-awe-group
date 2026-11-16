#!/usr/bin/env node
/** Run every committed offline regression suite in a fresh process. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = path.join(root, "src/tests");
const requested = process.argv.slice(2);
const suites = requested.length > 0
  ? requested.map((name) => path.resolve(root, name))
  : fs.readdirSync(testsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
      .map((entry) => path.join(testsDir, entry.name))
      .sort();

if (suites.length === 0) {
  console.error("No offline test suites found.");
  process.exit(1);
}

// Evidence for a frozen release must not be overwritten by a later run, so the
// output directory is overridable (R1 regression runs use reports/r1-test-results).
const resultsDir = path.resolve(
  process.env.AWE_TEST_RESULTS_DIR ?? path.join(root, "reports/r0-test-results"),
);
fs.mkdirSync(resultsDir, { recursive: true });
const tsx = path.join(root, "node_modules/.bin/tsx");
const results = [];

for (const suite of suites) {
  if (!fs.existsSync(suite)) {
    console.error(`Missing test suite: ${suite}`);
    process.exitCode = 1;
    continue;
  }
  const name = path.basename(suite, ".test.ts");
  const startedAt = Date.now();
  console.log(`\n=== ${name} ===`);
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), `awe-offline-${name}-`));
  const env = {
    ...process.env,
    AWE_OFFLINE_TEST: "1",
    AWE_DATA_DIR: path.join(sandbox, "data"),
    ROUTER_CHEAP_API_KEY: "offline-test-only",
    OPENAI_API_KEY: "offline-test-only",
    TAVILY_API_KEY: "",
  };
  let run;
  try {
    run = spawnSync(tsx, [suite], {
      cwd: root,
      env,
      encoding: "utf8",
      timeout: 300_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  process.stdout.write(output);
  fs.writeFileSync(path.join(resultsDir, `${name}.log`), output);
  const passed = run.status === 0 && !run.error && !run.signal;
  results.push({
    suite: path.relative(root, suite),
    passed,
    exit_code: run.status,
    signal: run.signal,
    duration_ms: Date.now() - startedAt,
    error: run.error ? String(run.error) : undefined,
  });
  console.log(`=== ${name}: ${passed ? "PASS" : "FAIL"} ===`);
}

const summary = {
  mode: "offline_no_model_or_network_credentials",
  data_isolation: "fresh AWE_DATA_DIR per suite; sandbox removed after execution",
  per_suite_timeout_ms: 300_000,
  started_at: new Date(Date.now() - results.reduce((n, r) => n + r.duration_ms, 0)).toISOString(),
  finished_at: new Date().toISOString(),
  suites: results,
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
};
fs.writeFileSync(path.join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`\nOffline suites: ${summary.passed} passed, ${summary.failed} failed`);
if (summary.failed > 0 || results.length !== suites.length) process.exit(1);
