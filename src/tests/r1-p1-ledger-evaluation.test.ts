import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const sandbox = mkdtempSync("/tmp/opencode/r1-p1-ledger-");
process.env.AWE_DATA_DIR = join(sandbox, "data");
const { modelCallUsage, withModelCall, listModelCalls } = await import("../utils/model-ledger.js");
after(() => rmSync(sandbox, { recursive: true, force: true }));

test("ledger supports aggregate SDK usage and explicitly reported raw provider detail fields", () => {
  const sdk = modelCallUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15,
    inputTokenDetails: { cacheReadTokens: 4 }, outputTokenDetails: { reasoningTokens: 2 } });
  assert.deepEqual(sdk, { input_tokens: 10, output_tokens: 5, total_tokens: 15, cached_input_tokens: 4, reasoning_tokens: 2 });
  const raw = modelCallUsage({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15,
    prompt_tokens_details: { cached_tokens: 4 }, completion_tokens_details: { reasoning_tokens: 2 } });
  assert.equal(raw.total_tokens, 15);
  assert.equal(raw.cached_input_tokens, 4);
  assert.equal(raw.reasoning_tokens, 2);
});

test("one SDK invocation is not a per-step invoice; empty aggregate uses the invocation fallback", async () => {
  await withModelCall({ missionId: "ledger-limit", role: "analyst", model: "offline" }, async () => ({
    totalUsage: {}, usage: { totalTokens: 7 }, steps: [{ usage: { totalTokens: 7 } }, { usage: { totalTokens: 3 } }],
  }));
  const records = listModelCalls("ledger-limit");
  assert.equal(records.length, 1);
  assert.equal(records[0].usage.total_tokens, 7);
  assert.equal(records[0].provider, "UNKNOWN");
  assert.deepEqual(records[0].cost, { status: "UNKNOWN", amount: null, currency: "USD" });
});

test("safe integer counts are validated and contradictory arithmetic is not reported as fully reconciled", async () => {
  assert.equal(modelCallUsage({ totalTokens: Number.MAX_SAFE_INTEGER + 1 }).total_tokens, "UNKNOWN");
  // Current limitation: contradictory provider totals are preserved as reported.
  assert.equal(modelCallUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 1 }).total_tokens, 1);
  await withModelCall({ missionId: "ledger-mismatch", role: "qa", model: "offline" }, async () => ({
    totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 1 },
  }));
  assert.equal(listModelCalls("ledger-mismatch")[0].usage_status, "partial");
  assert.equal(listModelCalls("ledger-mismatch")[0].reason, "usage_mismatch");
});
