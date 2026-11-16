import test from "node:test";
import assert from "node:assert/strict";

process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
const { selectModelForRole, createHostModelRouter, MODEL_CATALOG } = await import("../config/models.js");
const allowedModels = [...new Set(Object.values(MODEL_CATALOG))];

test("role routing preserves exact defaults and resolves compounds without substring collisions", () => {
  for (const [role, model] of Object.entries(MODEL_CATALOG)) assert.equal(selectModelForRole(role).modelId, model);
  const cases: Record<string, string> = {
    "senior-code-reviewer": "claude-opus-5-5", "senior code review": "claude-opus-5-5",
    "DATA_ANALYST": "deepseek-v4-flash", " researcher ": "deepseek-v4-flash",
    "metadata-writer": "claude-sonnet-5-5", "decoder": "claude-opus-5-5",
    "breakfast-writer": "claude-sonnet-5-5", "research-coder": "claude-opus-5-5",
    "coder-research": "claude-opus-5-5", "constructor": "claude-opus-5-5",
    "__proto__": "claude-opus-5-5", "toString": "claude-opus-5-5",
  };
  for (const [role, model] of Object.entries(cases)) assert.equal(selectModelForRole(role).modelId, model, role);
});

test("host agent overrides take priority and snapshots prevent cross-agent routing mutation", () => {
  const byAgent = { "node-a": "gpt-6-astra" };
  const byRole = { " DATA_ANALYST ": "claude-sonnet-5-5" };
  const allowlist = [...allowedModels];
  const route = createHostModelRouter({ allowedModels: allowlist, byAgent, byRole });
  byAgent["node-a"] = "deepseek-v4-flash";
  byRole[" DATA_ANALYST "] = "deepseek-v4-flash";
  allowlist.length = 0;
  assert.equal(route("data-analyst", "node-a").modelId, "gpt-6-astra");
  assert.equal(route("data-analyst", "node-b").modelId, "claude-sonnet-5-5");
  assert.equal(route("senior-data-analyst", "node-b").modelId, "deepseek-v4-flash");
  assert.equal(route("writer").url, "http://127.0.0.1:9/v1");
});

test("host routing rejects invalid IDs, unapproved defaults, ambiguous keys and accessor overrides", () => {
  for (const id of ["", "routercheap/gpt-6-astra", "https://other-provider", "a\nb", " model"])
    assert.throws(() => createHostModelRouter({ allowedModels: [id] }), /allowlist/);
  assert.throws(() => createHostModelRouter({ allowedModels, byRole: { analyst: "invented-model" } }), /unapproved/);
  assert.throws(() => createHostModelRouter({ allowedModels, byRole: { "DATA analyst": allowedModels[0], "data-analyst": allowedModels[0] } }), /override/);
  let accessed = false;
  assert.throws(() => createHostModelRouter({ allowedModels, byAgent: { get example() { accessed = true; return allowedModels[0]; } } }), /override/);
  assert.equal(accessed, false);
  assert.throws(() => createHostModelRouter({ allowedModels, byRole: Object.create({ analyst: allowedModels[0] }) }), /overrides/);
  const strict = createHostModelRouter({ allowedModels: ["gpt-6-astra"] });
  assert.throws(() => strict("analyst"), /allowlist/);
});

test("separate host routers stay isolated under concurrent selection", async () => {
  const a = createHostModelRouter({ allowedModels, byAgent: { node: "gpt-6-astra" } });
  const b = createHostModelRouter({ allowedModels, byAgent: { node: "deepseek-v4-flash" } });
  const values = await Promise.all(Array.from({ length: 32 }, async (_, i) => (i % 2 ? a : b)("writer", "node").modelId));
  assert.deepEqual(values, Array.from({ length: 32 }, (_, i) => i % 2 ? "gpt-6-astra" : "deepseek-v4-flash"));
});
