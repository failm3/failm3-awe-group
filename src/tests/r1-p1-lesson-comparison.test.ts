import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, relative, dirname } from "node:path";
import { createHash } from "node:crypto";
import { executeCsvAnalytics } from "../tools/csv-analytics.js";
import { verifyCsvAnalytics } from "../capabilities/csv-verifier.js";
import { CSV_ANALYTICS_CONTRACT_DIGEST } from "../capabilities/csv-analytics.js";
import { runWithToolContext } from "../security/tool-context.js";

const sha = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");

test("equal-budget paired CSV checks measure zero solver/selection gain from scoped lesson reuse", async () => {
  // Obtain a real persisted lesson through the existing independent QA integration.
  const child = spawnSync(process.execPath, ["--import", "tsx", "scripts/r1-analytics-mission.ts"], {
    cwd: process.cwd(), encoding: "utf8", timeout: 180_000,
    env: { PATH: process.env.PATH, AWE_OFFLINE_TEST: "1" },
  });
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  const summary = JSON.parse(child.stdout);
  const fixtureRoot = dirname(summary.dataDir);
  assert.match(relative(process.cwd(), fixtureRoot), /^\.r1-analytics-mission-[^/]+$/);
  const sandbox = mkdtempSync("/tmp/opencode/r1-p1-paired-");
  try {
    const artifacts = JSON.parse(readFileSync(join(summary.dataDir, "missions", `${summary.first.missionId}.json`), "utf8"));
    assert.equal(artifacts.status, "completed");
    // The fixture already validates hash, qualification, profile, capability and source spec.
    const lessonPath = join(dirname(summary.first.artifactPath), "scoped-lesson.json");
    const lessonBytes = readFileSync(lessonPath);
    assert.equal(sha(lessonBytes), summary.first.lessonRef.sha256);
    const lesson = JSON.parse(lessonBytes.toString("utf8"));
    assert.equal(lesson.scope, "csv-descriptive");
    assert.equal(lesson.contractDigest, CSV_ANALYTICS_CONTRACT_DIGEST);
    assert.deepEqual(summary.second.usedLessonRefs, [summary.first.lessonRef.artifactId]);
    const header = "event_id,order_id,currency,kind,amount_cents,status\n";
    const row = "x,o,USD,sale,9007199254740991,settled\n";
    const cases = [
      { name: "fresh-second-input", csv: readFileSync(summary.second.inputPath, "utf8"), status: "PASS_DATA" },
      { name: "large-integer", csv: header + row, status: "PASS_DATA" },
      { name: "exact-duplicate", csv: header + row + row, status: "PASS_DATA" },
      { name: "pending-currencies", csv: header + "p,o,EUR,sale,22,pending\nr,z,USD,refund,7,settled\n", status: "PASS_DATA" },
      { name: "conflicting-duplicate", csv: header + row + "x,o,USD,sale,1,settled\n", status: "BLOCKED_INPUT" },
      { name: "fractional-cents", csv: header + "f,o,USD,sale,1.5,settled\n", status: "BLOCKED_INPUT" },
      { name: "out-of-range-cents", csv: header + "f,o,USD,sale,9007199254740993,settled\n", status: "BLOCKED_INPUT" },
    ];
    const limits = { maxBytes: 32_768, maxRows: 100 };
    const metrics = { cases: cases.length, perArmBudget: { toolCalls: cases.length, externalVerifierCalls: cases.length, maxBytes: limits.maxBytes,
      maxRows: limits.maxRows, llmCalls: 0, networkCalls: 0 }, baselineAccepted: 0, lessonAccepted: 0,
      identicalResults: 0, baselineToolCalls: 0, lessonToolCalls: 0, lessonChecks: 0, selectionChanges: 0 };
    for (const item of cases) {
      const outputs: string[] = [];
      // Counterbalance arm execution order; bytes, grants, tool and limits identical.
      for (const arm of cases.indexOf(item) % 2 ? ["lesson", "baseline"] : ["baseline", "lesson"]) {
        const input = join(sandbox, `${item.name}-${arm}.csv`);
        writeFileSync(input, item.csv);
        const context = { missionId: `paired-${arm}`, workspaceRoot: sandbox, allowedTools: new Set(["csv_analytics"]),
          invokedTools: new Set<string>(), artifactIds: new Set<string>(), fence: () => true };
        let saves = 0;
        const output = await runWithToolContext(context, () => executeCsvAnalytics({ path: input }, {
          safePath: path => { assert.equal(dirname(resolve(path)), sandbox); return resolve(path); },
          approvedLimits: () => limits,
          save: request => { const path = join(sandbox, `${item.name}-${arm}.json`); writeFileSync(path, request.content, { flag: "wx" });
            saves++; return { path, id: `${item.name}-${arm}` }; },
        }));
        assert.equal(saves, 1);
        assert.deepEqual([...context.invokedTools], ["csv_analytics"]);
        const bundle = JSON.parse(readFileSync(output.path, "utf8"));
        const result = JSON.parse(bundle.result_json);
        assert.equal(result.status, item.status, item.name);
        assert.equal(verifyCsvAnalytics(readFileSync(input), bundle.result_json, limits).outcome, "MATCH");
        if (arm === "lesson" && result.status === "PASS_DATA") {
          for (const check of lesson.requiredChecks) {
            if (check === "deduplicate-events") assert.equal(result.metrics.raw_rows - result.metrics.unique_events, result.metrics.duplicate_rows);
            else if (check === "separate-pending") {
              for (const currency of ["USD", "EUR"]) assert.equal(BigInt(result.metrics[currency].net_cents),
                BigInt(result.metrics[currency].settled_sales_cents) - BigInt(result.metrics[currency].settled_refunds_cents));
            } else if (check === "separate-currencies") { assert.ok(result.metrics.USD); assert.ok(result.metrics.EUR); }
            else assert.fail("Unexpected scoped check");
            metrics.lessonChecks++;
          }
        }
        outputs.push(bundle.result_json);
        if (arm === "lesson") { metrics.lessonToolCalls++; metrics.lessonAccepted++; }
        else { metrics.baselineToolCalls++; metrics.baselineAccepted++; }
      }
      assert.equal(outputs[0], outputs[1]);
      metrics.identicalResults++;
    }
    assert.equal(metrics.baselineAccepted, cases.length);
    assert.equal(metrics.lessonAccepted, cases.length);
    assert.equal(metrics.lessonChecks, 12);
    assert.equal(metrics.identicalResults, cases.length);
    console.log(JSON.stringify({ comparison: "deterministic-paired-not-llm-learning", ...metrics,
      correctnessDelta: 0, toolCallDelta: 0, conclusion: "No measured solver or tool-selection improvement; lesson adds explicit QA checks only." }));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
