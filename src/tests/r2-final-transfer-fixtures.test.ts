import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
// Computed dynamic imports keep the experiment harness outside the production
// tsconfig rootDir while still executing its real implementation offline.
const fixtureModule = "../../scripts/r2-final-transfer/fixtures.js";
const verifierModule = "../../scripts/r2-final-transfer/verifier.js";
const {
  ALL_TARGETS, CONTROLS, HIDDEN_CASES_PER_TARGET, SOURCE_ARTIFACT, TARGET_COUNT,
  duplicateMutant, escapeMutant, formatSpec, hiddenCases, manifest, rangeMutant, splitOnlyMutant,
  stubSource, targetSource, visibleTest,
}: any = await import(fixtureModule);
const { analyze, checkSourceText, exactTwoSidedMcNemar }: any = await import(verifierModule);
type TransferTarget = { index: number; file: string; exportName: string };
type TransferCase = { id: string; category: string };
const targets = ALL_TARGETS as TransferTarget[];
assert.equal(ALL_TARGETS.length, 40);

test("40 deterministic target pairs vary only documented grammars and keep 44 hidden cases", () => {
  assert.equal(ALL_TARGETS.length, TARGET_COUNT);
  assert.equal(JSON.stringify(manifest()), JSON.stringify(manifest()));
  const signatures = new Set(targets.map((c: TransferTarget) => JSON.stringify(c)));
  assert.equal(signatures.size, 40);
  for (const c of targets) {
    const cases = hiddenCases(c) as TransferCase[];
    assert.equal(cases.length, HIDDEN_CASES_PER_TARGET);
    assert.equal(new Set(cases.map((x: TransferCase) => x.id)).size, cases.length);
    for (const category of ["valid", "syntax-invalid", "semantic-invalid"]) assert.ok(cases.some((x: TransferCase) => x.category === category), `${c.index}:${category}`);
    const result = checkSourceText(targetSource(c), c);
    assert.equal(result.passed, true, `target ${c.index}, ${result.failureCase}: ${result.error}`);
    assert.match(formatSpec(c), /CommonJS/);
    assert.match(stubSource(c), /module\.exports/);
    assert.doesNotMatch(stubSource(c) + formatSpec(c) + visibleTest(c), /quoted-separator|window-high|escaped-quote/);
    // Hidden corpus is generated host-side, not included in solver-visible fixture material.
    const hidden = JSON.stringify(cases);
    assert.ok(hidden.length > formatSpec(c).length);
  }
  assert.deepEqual(CONTROLS, { model: "claude-fable-5-2", role: "coder",
    tools: ["file_read", "file_list", "file_write", "shell", "save_artifact"], maxSteps: 8, maxRetries: 0, wallCapMs: 240000 });
});

test("seeded parser defect families are independently rejected in every target", () => {
  for (const c of targets) {
    assert.equal(checkSourceText(splitOnlyMutant(c), c).failureCase, "ordinary");
    assert.equal(checkSourceText(escapeMutant(c), c).failureCase, "escaped-quote");
    assert.equal(checkSourceText(duplicateMutant(c), c).failureCase, "duplicate");
    assert.ok(["window-high", "duration-high"].includes(checkSourceText(rangeMutant(c), c).failureCase ?? ""));
  }
});

test("exact two-sided McNemar uses all discordant pairs and never efficiency", () => {
  assert.equal(exactTwoSidedMcNemar(0, 0), 1);
  assert.equal(exactTwoSidedMcNemar(10, 0), 2 / 1024);
  assert.ok(Math.abs(exactTwoSidedMcNemar(7, 3) - 0.34375) < 1e-14);
  assert.ok(Math.abs(exactTwoSidedMcNemar(3, 7) - 0.34375) < 1e-14);
  const arms = Array.from({ length: 40 }, (_, pair) => [
    { pair, arm: "on" as const, protocol_valid: true, passed: pair < 10 },
    { pair, arm: "off" as const, protocol_valid: true, passed: false },
  ]).flat();
  const result = analyze(arms);
  assert.deepEqual({ b: result.b, c: result.c, p: result.p, delta: result.delta, valid_pairs: result.valid_pairs },
    { b: 10, c: 0, p: 2 / 1024, delta: 0.25, valid_pairs: 40 });
});

test("runner exposes offline preflight and separate gated live flag", () => {
  const runner = fs.readFileSync(path.resolve("scripts/r2-final-transfer/runner.ts"), "utf8");
  assert.match(runner, /--preflight/);
  assert.match(runner, /--run-authorized-final-transfer/);
  assert.ok(runner.indexOf("AWE_RUNTIME_ENV_FILE") < runner.indexOf("await import(\"../../src/agents/specialists.js\")"));
  assert.match(runner, /override: true/);
  assert.match(runner, /delete process\.env\.OPENAI_API_KEY/);
  assert.doesNotMatch(runner, /dotenv\.default\.config\(\{ quiet: true \}\)/);
  assert.doesNotMatch(SOURCE_ARTIFACT, /WINDOW|RATE|LIMIT|DURATION|COLOR|FLAGS|key=value/);
});

test("committed preflight completes with no model or network", () => {
  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/r2-final-transfer/runner.ts", "--preflight"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 120_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, AWE_OFFLINE_TEST: "1", NODE_NO_WARNINGS: "1" },
  });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  const output = JSON.parse(run.stdout);
  assert.equal(output.targets, 40);
  assert.equal(output.hidden_cases, 1760);
  assert.equal(output.network_calls, 0);
  assert.equal(output.model_calls, 0);
  assert.ok(output.mutants.every((m: { all_rejected: boolean }) => m.all_rejected));
});
