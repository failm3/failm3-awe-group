import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const sandbox = fs.mkdtempSync("/tmp/opencode/r1-model-ledger-");
process.env.AWE_DATA_DIR = path.join(sandbox, "data");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
const { withModelCall, listModelCalls, modelCallUsage } = await import("../utils/model-ledger.js");
const ledgerDir = path.join(process.env.AWE_DATA_DIR, "model-calls");
const binding = (missionId: string) => ({ missionId, model: "offline-model", role: "tester", provider: "offline" });
after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

test("start is durable before invocation; aggregate counts retained without invented dollars", async () => {
  const response = { text: "ok", totalUsage: { inputTokens: 12, outputTokens: 4, totalTokens: 16, reasoningTokens: 0, cachedInputTokens: 0 } };
  assert.equal(await withModelCall(binding("counts"), async () => {
    const [started] = listModelCalls("counts");
    assert.equal(started.status, "started");
    assert.equal(started.outcome, "UNKNOWN");
    assert.equal(started.usage.input_tokens, "UNKNOWN");
    assert.ok(fs.existsSync(path.join(ledgerDir, `${started.call_id}.started.json`)));
    return response;
  }), response);
  const [record] = listModelCalls("counts");
  assert.equal(record.status, "completed");
  assert.equal(record.usage_status, "reported");
  assert.deepEqual(record.usage, { input_tokens: 12, output_tokens: 4, total_tokens: 16, reasoning_tokens: 0, cached_input_tokens: 0 });
  assert.deepEqual(record.cost, { status: "UNKNOWN", amount: null, currency: "USD" });
  assert.equal(record.provider, "offline");
  assert.equal(record.role, "tester");
  assert.equal(record.model, "offline-model");
  assert.ok(record.finished_at);
});

test("missing/partial/invalid usage stays unknown, while explicit zero is retained", async () => {
  await withModelCall(binding("missing"), async () => ({ text: "no usage" }));
  assert.equal(listModelCalls("missing")[0].usage_status, "UNKNOWN");
  await withModelCall(binding("partial"), async () => ({ totalUsage: { inputTokens: 0 } }));
  const [record] = listModelCalls("partial");
  assert.equal(record.usage.input_tokens, 0);
  assert.equal(record.usage.output_tokens, "UNKNOWN");
  assert.equal(record.usage.total_tokens, "UNKNOWN");
  assert.equal(record.usage_status, "partial");
  assert.equal(modelCallUsage({ inputTokens: NaN, outputTokens: -1, totalTokens: "20" }).total_tokens, "UNKNOWN");
  assert.equal(modelCallUsage({ inputTokens: NaN }).input_tokens, "UNKNOWN");
});

test("throws, resolved errors and abort outcomes persist without secret error text", async () => {
  const failure = new Error("secret-api-key do not persist");
  await assert.rejects(withModelCall(binding("throw"), async () => { throw failure; }), (error) => error === failure);
  const [thrown] = listModelCalls("throw");
  assert.equal(thrown.status, "failed");
  assert.equal(thrown.outcome, "UNKNOWN");
  assert.equal(thrown.cost.amount, null);
  assert.ok(!JSON.stringify(thrown).includes("secret-api-key"));
  await withModelCall(binding("error"), async () => ({ finishReason: "error", totalUsage: { inputTokens: 3 } }));
  assert.equal(listModelCalls("error")[0].status, "failed");
  assert.equal(listModelCalls("error")[0].usage.input_tokens, 3);
  await withModelCall(binding("abort"), async () => ({ finishReason: "abort" }));
  assert.equal(listModelCalls("abort")[0].outcome, "UNKNOWN");
  await withModelCall(binding("observation"), async () => ({ get totalUsage(): never { throw failure; } }));
  assert.equal(listModelCalls("observation")[0].reason, "observation_failed");
});

test("parallel calls retain unique attribution with no lost records", async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => withModelCall({ ...binding("parallel"), role: `role-${i}` }, async () => ({ totalUsage: { totalTokens: i } }))));
  const records = listModelCalls("parallel");
  assert.equal(records.length, 12);
  assert.equal(new Set(records.map((r) => r.call_id)).size, 12);
  for (const record of records) assert.equal(record.usage.total_tokens, Number(record.role.slice(5)));
});

test("process death preserves started UNKNOWN record visible to a restarted reader", () => {
  const modulePath = path.resolve("src/utils/model-ledger.ts");
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { withModelCall } = await import(${JSON.stringify(modulePath)});
    await withModelCall(${JSON.stringify(binding("crash"))}, async () => process.exit(23));
  `], { env: process.env, encoding: "utf8" });
  assert.equal(child.status, 23, child.stderr);
  assert.equal(listModelCalls("crash")[0].status, "started");
  assert.equal(listModelCalls("crash")[0].outcome, "UNKNOWN");
  const reader = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    const { listModelCalls } = await import(${JSON.stringify(modulePath)});
    console.log(JSON.stringify(listModelCalls("crash")));
  `], { env: process.env, encoding: "utf8" });
  assert.equal(reader.status, 0, reader.stderr);
  assert.equal(JSON.parse(reader.stdout)[0].outcome, "UNKNOWN");
});

test("ledger start failure prevents provider invocation", async () => {
  fs.renameSync(ledgerDir, `${ledgerDir}.backup`);
  fs.writeFileSync(ledgerDir, "blocked");
  let invoked = false;
  try {
    await assert.rejects(withModelCall(binding("blocked"), async () => { invoked = true; }));
    assert.equal(invoked, false);
  } finally {
    fs.unlinkSync(ledgerDir);
    fs.renameSync(`${ledgerDir}.backup`, ledgerDir);
  }
});

test("terminal write failure propagates with durable start still UNKNOWN", async () => {
  let blocked = "";
  try {
    await assert.rejects(withModelCall(binding("terminal-failure"), async () => {
      blocked = path.join(ledgerDir, `${listModelCalls("terminal-failure")[0].call_id}.finished.json`);
      fs.mkdirSync(blocked);
      return { totalUsage: { totalTokens: 42 } };
    }));
  } finally { fs.rmdirSync(blocked); }
  assert.equal(listModelCalls("terminal-failure")[0].outcome, "UNKNOWN");
});

test("Prompt Master and QA actual call sites record usage before parsing, with mission binding", async (t) => {
  const { promptMasterAgent, createSpecification } = await import("../agents/prompt-master.js");
  const { qaAgent, reviewMissionDetailed } = await import("../agents/qa-agent.js");
  t.mock.method(promptMasterAgent, "generate", async () => {
    assert.equal(listModelCalls(null).at(-1)?.status, "started");
    return { text: "invalid json", totalUsage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 } };
  });
  await assert.rejects(createSpecification("offline specification"), /invalid specification/);
  assert.equal(listModelCalls(null).at(-1)?.status, "completed");
  assert.equal(listModelCalls(null).at(-1)?.usage.total_tokens, 10);
  t.mock.method(qaAgent, "generate", async () => {
    assert.equal(listModelCalls("qa-wiring")[0].status, "started");
    return { text: "invalid json", totalUsage: { totalTokens: 7 } };
  });
  const now = new Date().toISOString();
  const result = await reviewMissionDetailed({
    id: "qa-wiring", title: "offline", description: "offline", objective: "verify",
    acceptance_criteria: ["deliver"], status: "running", priority: "normal",
    created_at: now, updated_at: now, artifacts: [], metadata: {},
  }, "output", []);
  assert.equal(result.review.passed, false);
  assert.equal(listModelCalls("qa-wiring")[0].role, "qa-agent");
  assert.equal(listModelCalls("qa-wiring")[0].usage.total_tokens, 7);
  assert.equal(listModelCalls("qa-wiring")[0].status, "completed");
});
