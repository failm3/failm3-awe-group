#!/usr/bin/env npx tsx
import * as path from "node:path";
import { strict as assert } from "node:assert";
import { test, after } from "node:test";
import { tempDir, baseMission } from "./helpers/r0-runtime-util.js";

const root = tempDir("head-plan-parse-");
process.env.AWE_DATA_DIR = path.join(root, "state");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
globalThis.fetch = async () => { throw new Error("Network forbidden in head plan parse tests"); };
const storage = await import("../utils/storage.js");
const { createApprovedSpecBinding } = await import("../utils/spec-binding.js");
const { Agent } = await import("@mastra/core/agent");
const { planMission } = await import("../agents/head-agent.js");
const { extractJson } = await import("../utils/json-extract.js");

const original = Agent.prototype.generate;
after(() => { Agent.prototype.generate = original; });

function approvedMission(id: string) {
  const spec = {
    title: "parse test", objective: "produce a digest", scope: "local only",
    acceptance_criteria: ["digest exists"], suggested_tools: ["file_read", "save_artifact"],
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

const plan = { strategy: "two step", delegations: [
  { agent_role: "analyst", task: "compute {totals}", context: "brace } inside string", tools: ["file_read", "save_artifact"], expected_output: "digest", parallel: false },
] };

function respond(...texts: string[]) {
  const calls: string[] = [];
  Agent.prototype.generate = (async function (this: unknown, messages: Array<{ content: string }>) {
    calls.push(messages[0].content);
    return { text: texts[Math.min(calls.length - 1, texts.length - 1)], usage: {} };
  }) as unknown as typeof original;
  return calls;
}

test("extractJson ignores braces in strings and surrounding prose", () => {
  const text = `Here is the plan:\n${JSON.stringify(plan)}\nLet me know {if} you need more.`;
  assert.deepEqual(JSON.parse(extractJson(text)), plan);
  assert.deepEqual(JSON.parse(extractJson("```json\n" + JSON.stringify(plan) + "\n```\nDone.")), plan);
});

test("Head plan wrapped in prose is parsed, not replaced by direct execution", async () => {
  const mission = approvedMission("head-parse-prose");
  const calls = respond(`I analyzed the mission.\n\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n\nThis plan meets the criteria.`);
  const result = await planMission(mission);
  assert.equal(calls.length, 1);
  assert.ok("delegations" in result);
  assert.equal(result.strategy, "two step");
});

test("malformed initial plan gets exactly one corrective retry", async () => {
  const mission = approvedMission("head-parse-retry");
  const calls = respond("I cannot format this right now.", JSON.stringify(plan));
  const result = await planMission(mission);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /YOUR PREVIOUS RESPONSE WAS NOT VALID/);
  assert.ok("delegations" in result && result.strategy === "two step");
});

test("two malformed responses fall back to direct execution after one retry", async () => {
  const mission = approvedMission("head-parse-fallback");
  const calls = respond("nope", "still nope");
  const result = await planMission(mission);
  assert.equal(calls.length, 2);
  assert.ok("delegations" in result && result.strategy === "Direct execution");
});

test("malformed adaptation plan stays fail-closed without retry", async () => {
  const mission = approvedMission("head-parse-adapt");
  const calls = respond("not json");
  await assert.rejects(planMission(mission, { executionFailure: "tool crashed" }));
  assert.equal(calls.length, 1);
});

test("an acquire without a capability name is retried, not passed to the manager", async () => {
  const mission = approvedMission("head-parse-unnamed-acquire");
  const calls = respond(
    JSON.stringify({ status: "acquire", detail: "need a parser" }),
    JSON.stringify({ status: "acquire", capability: "observation-digest-v1", detail: "need a parser" }),
  );
  const result = await planMission(mission);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /not valid/i);
  assert.deepEqual(result, { status: "acquire", capability: "observation-digest-v1", detail: "need a parser" });
});
