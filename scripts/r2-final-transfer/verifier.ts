import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";
import { spawnSync } from "node:child_process";
import { hiddenCases, sha256, sourceEdgeCorpus, type HiddenCase, type TargetConfig } from "./fixtures.js";

export interface VerificationResult {
  passed: boolean; cases: number; error: string | null; artifactSha256: string | null;
  visiblePassed: boolean; visibleSha256: string | null; failureCase: string | null;
}

function executeCase(file: string, exportName: string, test: HiddenCase): string | null {
  const script = `
const assert = require('node:assert/strict');
const api = require(${JSON.stringify(file)});
if (typeof api[${JSON.stringify(exportName)}] !== 'function') throw new Error('MISSING_EXPORT');
const testCase = ${JSON.stringify(test)};
let value;
try { value = api[${JSON.stringify(exportName)}](testCase.input); }
catch (error) {
  if (!(error instanceof Error)) throw new Error('NON_ERROR_THROW');
  if (testCase.error === undefined) throw new Error('UNEXPECTED_THROW:' + error.message);
  if (error.message !== testCase.error) throw new Error('WRONG_ERROR:' + error.message);
  process.exit(0);
}
if (testCase.error !== undefined) throw new Error('EXPECTED_ERROR_NOT_THROWN');
assert.deepEqual(value, testCase.expected);
if (JSON.stringify(value) !== JSON.stringify(testCase.expected)) throw new Error('UNSTABLE_OUTPUT_OR_KEY_ORDER');
`;
  const run = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 3_000,
    env: { PATH: "/usr/bin:/bin" }, maxBuffer: 1024 * 1024 });
  return run.status === 0 && !run.error ? null : `${test.id}: ${(run.stderr || run.stdout || String(run.error || run.signal)).trim().slice(0, 1000)}`;
}

/** Strict hidden verification uses a fresh Node process for every case. */
export function verifyTarget(workspace: string, config: TargetConfig, expectedVisibleHash?: string): VerificationResult {
  const file = path.join(workspace, ...config.file.split("/"));
  const visible = path.join(workspace, "visible.test.cjs");
  const base = { passed: false, cases: hiddenCases(config).length, artifactSha256: fs.existsSync(file) ? sha256(fs.readFileSync(file)) : null,
    visibleSha256: fs.existsSync(visible) ? sha256(fs.readFileSync(visible)) : null };
  if (!fs.existsSync(file) || !fs.existsSync(visible)) return { ...base, error: "Missing assigned parser or visible test", visiblePassed: false, failureCase: null };
  if (expectedVisibleHash !== undefined && base.visibleSha256 !== expectedVisibleHash) {
    return { ...base, error: "Visible test was modified", visiblePassed: false, failureCase: null };
  }
  const before = fs.readFileSync(file);
  const visibleRun = spawnSync(process.execPath, [visible], { cwd: workspace, encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
  if (visibleRun.status !== 0 || visibleRun.error) return { ...base, error: `Visible test failed: ${visibleRun.stderr || visibleRun.stdout}`, visiblePassed: false, failureCase: null };
  for (const test of hiddenCases(config)) {
    const error = executeCase(file, config.exportName, test);
    if (error) return { ...base, error, visiblePassed: true, failureCase: test.id };
  }
  if (!before.equals(fs.readFileSync(file)) || sha256(fs.readFileSync(visible)) !== base.visibleSha256) {
    return { ...base, error: "Artifact or visible test changed during verification", visiblePassed: true, failureCase: null };
  }
  return { ...base, error: null, visiblePassed: true, failureCase: null, passed: true };
}

export function verifySource(workspace: string): VerificationResult {
  const file = path.join(workspace, "src/ledger.cjs");
  const visible = path.join(workspace, "visible.test.cjs");
  const artifactSha256 = sha256(fs.readFileSync(file));
  const visibleRun = spawnSync(process.execPath, [visible], { cwd: workspace, encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
  if (visibleRun.status !== 0 || visibleRun.error) return { passed: false, cases: sourceEdgeCorpus().length, error: "Source visible test failed", artifactSha256, visiblePassed: false, visibleSha256: sha256(fs.readFileSync(visible)), failureCase: null };
  const script = `const assert=require('node:assert/strict'); const {parseLedgerCsv}=require(${JSON.stringify(file)});
for(const c of ${JSON.stringify(sourceEdgeCorpus())}) { if(c.error){assert.throws(()=>parseLedgerCsv(c.input),e=>e instanceof Error&&e.message===c.error);}else{assert.deepEqual(parseLedgerCsv(c.input),c.expected);} }`;
  const edge = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
  return { passed: edge.status === 0 && !edge.error, cases: sourceEdgeCorpus().length, error: edge.status === 0 && !edge.error ? null : (edge.stderr || String(edge.error)),
    artifactSha256, visiblePassed: true, visibleSha256: sha256(fs.readFileSync(visible)), failureCase: null };
}

/** Offline preflight helper; not used by the live hidden verifier. */
export function checkSourceText(source: string, config: TargetConfig, expectedFailures = false): { passed: boolean; error: string | null; failureCase: string | null } {
  const context = vm.createContext({ module: { exports: {} }, exports: {}, Error });
  try { new vm.Script(source, { filename: "candidate.cjs" }).runInContext(context, { timeout: 1000 }); }
  catch (error) { return { passed: false, error: String(error), failureCase: "load" }; }
  const api = (context.module as { exports: Record<string, unknown> }).exports;
  const parse = api[config.exportName];
  if (typeof parse !== "function") return { passed: false, error: "Missing export", failureCase: "load" };
  for (const test of hiddenCases(config)) {
    try {
      const value = (parse as (input: string) => unknown)(test.input);
      if (test.error) return { passed: false, error: `Expected ${test.error}`, failureCase: test.id };
      // VM objects have another realm's prototypes, so compare stable JSON plus own-key order.
      if (JSON.stringify(value) !== JSON.stringify(test.expected)) return { passed: false, error: "Output mismatch", failureCase: test.id };
    } catch (error) {
      if (!(error instanceof Error) || !test.error || error.message !== test.error) return { passed: false, error: String(error), failureCase: test.id };
    }
  }
  return { passed: true, error: null, failureCase: null };
}

export function exactTwoSidedMcNemar(b: number, c: number): number {
  if (!Number.isSafeInteger(b) || !Number.isSafeInteger(c) || b < 0 || c < 0 || b + c > 128) throw new Error("Invalid discordant counts");
  const n = b + c;
  if (!n) return 1;
  // Integer binomial coefficients avoid log/rounding drift at the preregistered
  // n<=40 (and retain an exact rational numerator through the asserted n<=128).
  const coefficients = Array<bigint>(n + 1).fill(0n);
  coefficients[0] = 1n;
  for (let row = 1; row <= n; row++) for (let k = row; k >= 1; k--) coefficients[k] += coefficients[k - 1];
  let tail = 0n;
  for (let k = 0; k <= Math.min(b, c); k++) tail += coefficients[k];
  const p = Number(2n * tail) / Number(2n ** BigInt(n));
  return Math.min(1, p);
}

export function analyze(arms: Array<{ pair: number; arm: "on" | "off"; protocol_valid: boolean; passed: boolean }>) {
  const pairs = [];
  for (let pair = 0; pair < 40; pair++) {
    const on = arms.find(x => x.pair === pair && x.arm === "on");
    const off = arms.find(x => x.pair === pair && x.arm === "off");
    if (on?.protocol_valid && off?.protocol_valid) pairs.push({ pair, on: on.passed, off: off.passed });
  }
  const b = pairs.filter(x => x.on && !x.off).length;
  const c = pairs.filter(x => !x.on && x.off).length;
  const onPassed = pairs.filter(x => x.on).length;
  const offPassed = pairs.filter(x => x.off).length;
  return { valid_pairs: pairs.length, on_passed: onPassed, off_passed: offPassed,
    on_rate: pairs.length ? onPassed / pairs.length : null, off_rate: pairs.length ? offPassed / pairs.length : null,
    delta: pairs.length ? (onPassed - offPassed) / pairs.length : null, b, c, p: exactTwoSidedMcNemar(b, c), pairs };
}
