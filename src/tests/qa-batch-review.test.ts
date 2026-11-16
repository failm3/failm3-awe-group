#!/usr/bin/env npx tsx
import * as path from "node:path";
import * as fs from "node:fs";
import { strict as assert } from "node:assert";
import { test, after } from "node:test";
import { tempDir, baseMission } from "./helpers/r0-runtime-util.js";

const root = tempDir("qa-batch-");
process.env.AWE_DATA_DIR = path.join(root, "state");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
globalThis.fetch = async () => { throw new Error("Network forbidden in QA batch tests"); };

const storage = await import("../utils/storage.js");
const { createApprovedSpecBinding } = await import("../utils/spec-binding.js");
const { Agent } = await import("@mastra/core/agent");
const qa = await import("../agents/qa-agent.js");

const original = Agent.prototype.generate;
after(() => { Agent.prototype.generate = original; });

const criterion = "deliverable digest is present";
function approvedMission(id: string) {
  const spec = {
    title: "batch qa", objective: "review many artifacts", scope: "local only",
    acceptance_criteria: [criterion], suggested_tools: ["save_artifact"],
    suggested_agents: ["analyst"], estimated_complexity: "simple" as const, risks: [],
  };
  const pending = baseMission(id, {
    title: spec.title, objective: spec.objective, description: spec.objective,
    acceptance_criteria: spec.acceptance_criteria, status: "pending_approval" as const,
    metadata: { specification: spec },
  });
  storage.saveMission(pending);
  const approved = { ...pending, status: "approved" as const,
    metadata: { ...pending.metadata, approved_spec_binding: createApprovedSpecBinding(pending) } };
  storage.saveMission(approved);
  return approved;
}

const review = (over: Record<string, unknown> = {}) => JSON.stringify({
  passed: over.passed ?? true,
  score: over.score ?? 9,
  criteria_results: [{ criterion, passed: over.passed ?? true, notes: "checked" }],
  defects: over.defects ?? [],
  recommendations: [],
  verdict: over.verdict ?? "PASS",
});

test("every artifact batch is reviewed and a part defect blocks the mission", async () => {
  const mission = approvedMission("qa-batch-defect");
  const prompts: string[] = [];
  Agent.prototype.generate = (async function (this: unknown, messages: Array<{ content: string }>) {
    prompts.push(messages[0].content);
    // First batch sees a real defect, the synthesis tries to pass anyway.
    if (prompts.length === 1) {
      return { text: review({ passed: false, score: 4, defects: [{ issue: "digest.json totals are wrong", severity: "major" }], verdict: "FAIL" }), usage: {} };
    }
    return { text: review(), usage: {} };
  }) as unknown as typeof original;

  const artifacts = Array.from({ length: 20 }, (_, i) => `artifact ${i + 1}: ` + "x".repeat(200));
  const { review: result, gate } = await qa.reviewMissionDetailed(mission, "execution output", artifacts, {});
  // 20 artifacts at 16 per batch → 2 part reviews + 1 synthesis.
  assert.equal(prompts.length, 3, `expected 2 batches + synthesis, got ${prompts.length}`);
  assert.match(prompts[2], /PART REVIEWS \(all 2 parts/);
  assert.equal(result.passed, false);
  assert.ok(gate.blockers.some((blocker) => blocker.includes("digest.json totals are wrong")),
    `part defect must reach the gate: ${gate.blockers.join(" | ")}`);
});

test("a single batch mission needs no synthesis call", async () => {
  const mission = approvedMission("qa-batch-single");
  let calls = 0;
  Agent.prototype.generate = (async function () {
    calls++;
    return { text: review(), usage: {} };
  }) as unknown as typeof original;
  const { review: result } = await qa.reviewMissionDetailed(mission, "execution output", ["one artifact"], {});
  assert.equal(calls, 1);
  assert.equal(result.passed, true);
});

test("synthesis cannot silently drop a part defect", async () => {
  const mission = approvedMission("qa-batch-drop");
  const prompts: string[] = [];
  Agent.prototype.generate = (async function (this: unknown, messages: Array<{ content: string }>) {
    prompts.push(messages[0].content);
    if (prompts.length === 1) {
      return { text: review({ passed: false, score: 3, defects: [{ issue: "artifact 2 is empty", severity: "critical" }], verdict: "FAIL" }), usage: {} };
    }
    if (prompts.length === 2) return { text: review(), usage: {} };
    // Synthesis claims a clean pass without mentioning the defect.
    return { text: review(), usage: {} };
  }) as unknown as typeof original;
  const artifacts = [...Array.from({ length: 20 }, () => "ok"), "x".repeat(10)];
  const { review: result } = await qa.reviewMissionDetailed(mission, "execution output", artifacts, {});
  assert.equal(result.passed, false);
  assert.ok(result.defects.some((defect) => defect.issue.includes("artifact 2 is empty")));
});

test("host receipts and the absence of receipts are both stated to the reviewer", async () => {
  const capabilityPlane = {
    outcome: "observed",
    attempts: [{
      attempt_id: "attempt-1", capability: "observation-digest-v1",
      observation: { capability: "observation-digest-v1", status: "available", detail: "qualified" },
      artifact_id: "a", artifact_sha256: "b", created_at: new Date().toISOString(),
      qualified_target: { runtime: "node", executable_path: "/tmp/proc.js", executable_sha256: "c", args: ["x"], qualification_id: "q-1" },
    }],
  };
  const mission = approvedMission("qa-capability-context");
  const withAttempts = { ...mission, metadata: { ...mission.metadata, capability_plane: capabilityPlane } };
  storage.saveMission(withAttempts);
  const prompts: string[] = [];
  Agent.prototype.generate = (async function (this: unknown, messages: Array<{ content: string }>) {
    prompts.push(messages[0].content);
    return { text: review(), usage: {} };
  }) as unknown as typeof original;

  await qa.reviewMissionDetailed(withAttempts, "execution output", ["one artifact"], {});
  assert.match(prompts[0], /HOST-RECORDED QUALIFIED CAPABILITY/);
  assert.match(prompts[0], /Invocation receipts: NONE/);

  fs.mkdirSync(path.join(root, "state", "capability-invocations"), { recursive: true });
  fs.writeFileSync(path.join(root, "state", "capability-invocations", `${withAttempts.id}.json`), JSON.stringify([{
    version: 1, receipt_id: "r-1", mission_id: withAttempts.id, delegation_id: "d-1",
    attempt_id: "attempt-1", qualification_id: "q-1", generation: 1,
    executable_path: "/tmp/proc.js", executable_sha256: "c", command_sha256: "cmd",
    created_at: new Date().toISOString(),
  }]));
  prompts.length = 0;
  await qa.reviewMissionDetailed(withAttempts, "execution output", ["one artifact"], {});
  assert.match(prompts[0], /Durable qualified invocation receipts \(1\)/);
  assert.match(prompts[0], /"command_sha256": "cmd"/);
  assert.doesNotMatch(prompts[0], /Invocation receipts: NONE/);
});
