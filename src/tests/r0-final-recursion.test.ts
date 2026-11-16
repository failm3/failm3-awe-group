/** Final R0 regression closure. Actual adapters and manager, offline executors only. */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { baseMission, passedReview, passedGate } from "./helpers/r0-runtime-util.js";

assert.equal(process.env.AWE_OFFLINE_TEST, "1", "Run through scripts/run-offline-tests.mjs");
assert.ok(process.env.AWE_DATA_DIR);
globalThis.fetch = async () => { throw new Error("Offline: fetch prohibited"); };
net.Socket.prototype.connect = function () { throw new Error("Offline: network prohibited"); };
const rec = await import("../agents/recursion.js");
const specialists = await import("../agents/specialists.js");
const { Agent } = await import("@mastra/core/agent");
const { fileWriteTool } = await import("../tools/index.js");
const storage = await import("../utils/storage.js");
const { createMissionManager } = await import("../agents/mission-manager.js");
const { getToolContext } = await import("../security/tool-context.js");
const cap = rec.RECURSION_LIMITS.maxTotalAgents;
const outcome = (role: string) => ({ role, success: true, output: "offline evidence", artifacts: [], tools_used: [], model: "offline" });
const cfg = (id: string) => ({ missionId: id, role: "executor", task: "parent", context: "", tools: ["delegate", "file_write"], expected_output: "evidence" });
const child = { role: "leaf", task: "child work" };
type DelegateTool = { execute: (input: unknown, context: unknown) => Promise<{ success: boolean }> };

async function worker(action: string, id: string): Promise<string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const processChild = spawn(process.execPath, ["--import", path.join(root, "node_modules/tsx/dist/loader.mjs"),
    path.join(root, "src/tests/r0-final-recursion-worker.ts"), action, id], {
    cwd: root,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, AWE_DATA_DIR: process.env.AWE_DATA_DIR,
      ROUTER_CHEAP_API_KEY: "offline-test-only" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  processChild.stdout.on("data", (data) => { output += data; });
  processChild.stderr.on("data", (data) => { output += data; });
  const code = await new Promise((resolve, reject) => {
    processChild.on("error", reject);
    processChild.on("close", resolve);
  });
  assert.equal(code, 0, output);
  assert.match(output, /ASSERTIONS_COMPLETED/);
  return output;
}

test("D7 production standalone executeSpecialist delegate carries call AND session cancellation", async () => {
  const original = Agent.prototype.generate;
  try {
    for (const abortSource of ["standalone", "call", "session"] as const) {
      const id = `final-cancel-${abortSource}`;
      const call = new AbortController();
      const session = new AbortController();
      if (abortSource !== "standalone") rec.setSessionSignal(id, session.signal);
      let received: AbortSignal | undefined;
      let executions = 0;
      rec.__setRecursionTestDeps({
        resolveModelForRole: () => "offline",
        executeSpecialist: async (_config, _id, options) => {
          executions++;
          received = options?.signal;
          assert.ok(received, "real delegate adapter must pass standalone signal");
          const aborted = new Promise<never>((_resolve, reject) => {
            received!.addEventListener("abort", () => reject(received!.reason), { once: true });
          });
          (abortSource === "session" ? session : call).abort(new Error(`abort-${abortSource}`));
          return aborted;
        },
      });
      Agent.prototype.generate = async function (this: InstanceType<typeof Agent>) {
        assert.equal(getToolContext()?.signal, call.signal);
        const tools = await this.listTools();
        const result = await (tools.delegate as DelegateTool).execute({ ...child, tools: [], children: [child, { role: "second", task: "never starts" }] }, {});
        assert.equal(result.success, false);
        return { text: "cancelled", toolCalls: [] } as any;
      } as typeof original;
      if (abortSource === "session") {
        await specialists.executeSpecialist(cfg(id), id, { signal: call.signal });
        assert.equal(call.signal.aborted, false);
      } else {
        await assert.rejects(specialists.executeSpecialist(cfg(id), id, { signal: call.signal }), new RegExp(`abort-${abortSource}`));
      }
      assert.equal(received?.aborted, true);
      assert.equal(executions, 1, "queued sibling must not start after cancellation");
    }
  } finally {
    Agent.prototype.generate = original;
    rec.__setRecursionTestDeps(null);
  }
});

test("host experience policy reaches real recursive children without model-authored selection", async () => {
  const original = Agent.prototype.generate;
  const id = "trusted-recursive-experience";
  const pending = baseMission(id, {
    title: "Recursive experience fixture", objective: "Forward the host policy to a child",
    acceptance_criteria: ["The host policy reaches the child"],
    status: "pending_approval", metadata: { specification: {
    title: "Recursive experience fixture", objective: "Forward the host policy to a child", scope: "Offline wiring only",
    acceptance_criteria: ["The host policy reaches the child"], suggested_tools: ["delegate", "file_write"],
    suggested_agents: ["executor", "coder"], estimated_complexity: "simple", risks: [],
  } } });
  storage.saveMission(pending as any);
  const { createApprovedSpecBinding } = await import("../utils/spec-binding.js");
  storage.saveMission({ ...pending, status: "approved", metadata: {
    ...pending.metadata, approved_spec_binding: createApprovedSpecBinding(pending as any),
  } } as any);
  const experience = {
    selection: { scope: "host-memory", capabilityHash: "a".repeat(64), profileHash: "b".repeat(64) },
    authority: { inspect: () => null, admit: () => { throw new Error("not admitted in this wiring fixture"); } },
    authorizeTarget: () => true,
  } as never;
  try {
    rec.__setRecursionTestDeps({
      resolveModelForRole: () => "offline",
      executeSpecialist: async (_config, _id, options) => {
        assert.equal(options?.experience, experience);
        return outcome("coder");
      },
    });
    Agent.prototype.generate = async function (this: InstanceType<typeof Agent>) {
      const tools = await this.listTools();
      const delegated = await (tools.delegate as DelegateTool).execute({ ...child, role: "coder", tools: [] }, {});
      assert.equal(delegated.success, true);
      return { text: "delegated", toolCalls: [] } as any;
    } as typeof original;
    await specialists.executeSpecialist(cfg(id), id, { experience });
  } finally {
    Agent.prototype.generate = original;
    rec.__setRecursionTestDeps(null);
  }
});

test("D9 omitted tools inherit; explicit [] denies all in legacy, children and request defaults", async () => {
  const cases = [
    { request: { ...child, tools: [] }, expected: [] },
    { request: { ...child }, expected: ["file_write"] },
    { request: { ...child, tools: ["file_write"] }, expected: ["file_write"] },
    { request: { tools: ["file_write"], children: [{ ...child, tools: [] }] }, expected: [] },
    { request: { tools: ["file_write"], children: [child] }, expected: ["file_write"] },
    { request: { tools: [], children: [child] }, expected: [] },
    { request: { children: [{ ...child, tools: [] }] }, expected: [] },
    { request: { children: [child] }, expected: ["file_write"] },
  ];
  try {
    for (const [i, { request, expected }] of cases.entries()) {
      let calls = 0;
      rec.__setRecursionTestDeps({
        resolveModelForRole: () => "offline",
        executeSpecialist: async (config) => {
          calls++;
          assert.deepEqual(config.tools, expected);
          assert.deepEqual(config.allowedTools, expected);
          const actualAgent = await specialists.createSpecialist(config);
          assert.deepEqual(Object.keys(await actualAgent.listTools()), expected);
          return outcome(config.role);
        },
      });
      const result = await rec.runDelegateCall(`final-tools-${i}`, null, 0, request,
        { allowedTools: new Set(["delegate", "file_write"]) });
      assert.equal(result.success, true, result.output);
      assert.equal(calls, 1);
    }
  } finally { rec.__setRecursionTestDeps(null); }
});

test("D9 production child with explicit [] cannot invoke an ambient write", async () => {
  const original = Agent.prototype.generate;
  const id = "final-no-capability";
  const marker = path.join(process.env.AWE_DATA_DIR!, "must-not-exist.txt");
  let children = 0;
  try {
    Agent.prototype.generate = async function (this: InstanceType<typeof Agent>) {
      const tools = await this.listTools();
      if (tools.delegate) {
        await (tools.delegate as DelegateTool).execute({ ...child, tools: ["file_write"], children: [{ ...child, tools: [] }] }, {});
      } else {
        children++;
        assert.deepEqual(Object.keys(tools), []);
        assert.equal(getToolContext()?.allowedTools.size, 0);
        await assert.rejects(async () => fileWriteTool.execute!({ path: marker, content: "forbidden" }, {} as never), /not granted/);
      }
      return { text: "offline", toolCalls: [] } as any;
    } as typeof original;
    await specialists.executeSpecialist(cfg(id), id);
    assert.equal(children, 1);
    assert.equal(fs.existsSync(marker), false);
  } finally { Agent.prototype.generate = original; }
});

test("trusted node-aware model choice reaches a real recursive child and its ledger/model admission target", async () => {
  const original = Agent.prototype.generate;
  const id = "trusted-recursive-route";
  const { createHostModelRouter } = await import("../config/models.js");
  const { listModelCalls } = await import("../utils/model-ledger.js");
  const modelRoute = createHostModelRouter({
    allowedModels: ["gpt-6-astra", "deepseek-v4-flash", "claude-sonnet-5-5"],
    byAgent: { "host-parent": "gpt-6-astra" }, byRole: { analyst: "deepseek-v4-flash" },
  });
  const targets: Array<{ role?: string; stage: string; label?: string }> = [];
  try {
    Agent.prototype.generate = async function (this: InstanceType<typeof Agent>) {
      const tools = await this.listTools();
      if (tools.delegate) {
        await (tools.delegate as DelegateTool).execute({ role: "analyst", task: "nested routing", tools: [] }, {});
      }
      return { text: "routing exercised", finishReason: "stop", toolCalls: [], toolResults: [],
        totalUsage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } } as any;
    } as typeof original;
    await specialists.executeSpecialist({ ...cfg(id), role: "writer", nodeId: "host-parent" }, id, {
      modelRoute,
      withEffect: (effect, target) => {
        targets.push({ role: target?.role, stage: target?.stage ?? "effect", label: target?.label });
        return effect();
      },
    });
    const records = listModelCalls(id);
    assert.equal(records.length, 2);
    assert.equal(records.find(record => record.role === "writer")?.model, "gpt-6-astra");
    assert.equal(records.find(record => record.role === "analyst")?.model, "deepseek-v4-flash");
    assert.ok(targets.some(target => target.stage === "delegation" && target.role === "analyst" &&
      target.label !== "model generate"), "recursive reservation must have role-specific authorization");
    assert.ok(targets.some(target => target.stage === "delegation" && target.role === "analyst" &&
      target.label === "model generate"), "recursive model intent must retain the same role");
    assert.ok(rec.getDelegationTree(id).nodes.find(node => node.role === "analyst")?.id.endsWith("n0"));
  } finally { Agent.prototype.generate = original; rec.__setRecursionTestDeps(null); }
});

test("top-level cap is charged exactly once and reset/resume never replenishes it", async () => {
  const id = "final-top-cap";
  const ids = new Set<string>();
  let effects = 0;
  for (let i = 0; i < cap; i++) {
    const node = rec.registerTopLevelNode(id, "worker", `task ${i}`);
    ids.add(node);
    effects++;
    rec.finalizeNode(id, node, "success");
    rec.finalizeNode(id, node, "success");
    assert.equal(rec.getSession(id).spawned, effects);
  }
  assert.throws(() => { rec.registerTopLevelNode(id, "worker", "effect 13"); effects++; }, /spawn budget exhausted/);
  assert.equal(effects, cap);
  assert.equal(ids.size, cap);
  rec.resetSession(id);
  rec.resetSession(id);
  assert.equal(rec.getDelegationTree(id).nodes.length, 0, "preserve existing reset tree contract");
  assert.equal(rec.getSession(id).spawned, cap);
  assert.throws(() => rec.registerTopLevelNode(id, "worker", "retry"), /spawn budget exhausted/);
  const separate = "final-separate";
  rec.resetSession(separate);
  rec.registerTopLevelNode(separate, "worker", "independent");
  assert.equal(rec.getSession(separate).spawned, 1);
  await worker("resume", id);
});

test("concurrent nested and top-level work share atomic cap without double counting", async () => {
  const id = "final-nested-cap";
  let effects = 0;
  const seen = new Set<string>();
  rec.__setRecursionTestDeps({
    resolveModelForRole: () => "offline",
    executeSpecialist: async (config) => {
      assert.ok(config.nodeId);
      assert.equal(seen.has(config.nodeId), false);
      seen.add(config.nodeId);
      effects++;
      if (config.depth! < rec.RECURSION_LIMITS.maxDepth) {
        await rec.runDelegateCall(id, config.nodeId!, config.depth!, {
          parallel: true, children: [{ role: "a", task: `nested ${config.nodeId}` }, { role: "b", task: `nested ${config.nodeId}` }],
        });
      }
      return outcome(config.role);
    },
  });
  try {
    const roots = Array.from({ length: 2 }, (_, i) => {
      const node = rec.registerTopLevelNode(id, "root", `root ${i}`);
      seen.add(node); effects++;
      return node;
    });
    await Promise.all(roots.map((node) => rec.runDelegateCall(id, node, 0, { ...child })));
    assert.equal(effects, cap);
    assert.equal(rec.getSession(id).spawned, cap);
    assert.equal(rec.getDelegationTree(id).nodes.length, cap);
    assert.equal(seen.size, cap);
    assert.throws(() => rec.registerTopLevelNode(id, "root", "overflow"), /spawn budget exhausted/);
  } finally { rec.__setRecursionTestDeps(null); }
});

test("cross-process top-level reservations cannot jointly exceed mission budget", async () => {
  const id = "final-process-cap";
  const results = await Promise.all([worker("race", id), worker("race", id)]);
  assert.equal(results.reduce((n, output) => n + Number(output.match(/RESERVED (\d+)/)![1]), 0), cap);
  await worker("resume", id);
});

test("real manager Head plan refuses top-level effect 13 before executing it", async () => {
  const id = "final-manager-cap";
  storage.saveMission(baseMission(id));
  let effects = 0;
  const manager = createMissionManager(storage.loadMission(id)!, 10000, { deps: {
    planMission: async () => ({ strategy: "offline", delegations: Array.from({ length: cap + 1 }, (_, i) => ({
      agent_role: "executor", task: `effect ${i}`, context: "", tools: [], expected_output: "artifact", parallel: false,
    })) }),
    executeSpecialist: async (config, mid) => {
      effects++;
      const artifact = { id: `${mid}-${effects}`, mission_id: mid, name: `effect-${effects}.md`, type: "text" as const,
        content: "verified offline effect", created_at: new Date().toISOString(), metadata: {} };
      storage.saveArtifact(artifact);
      return { ...outcome(config.role), artifacts: [artifact.id] };
    },
    resolveModelForRole: () => "offline",
    reviewMissionDetailed: async () => ({ review: passedReview(), gate: passedGate() }) as any,
  } });
  const result = await manager.run();
  assert.equal(effects, cap);
  assert.equal(result.mission.status, "failed");
  assert.equal(rec.getSession(id).spawned, cap);
});

test("second real manager attempt after timeout cannot replenish reserved slots", async () => {
  const id = "final-manager-resume";
  storage.saveMission(baseMission(id));
  let effects = 0;
  const first = createMissionManager(storage.loadMission(id)!, 1200, { deps: {
    planMission: async () => ({ strategy: "offline", delegations: Array.from({ length: cap }, (_, i) => ({
      agent_role: "executor", task: `work ${i}`, context: "", tools: [], expected_output: "artifact", parallel: true,
    })) }),
    executeSpecialist: async (_config, _mid, options) => {
      effects++;
      return new Promise((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), { once: true });
      });
    },
    resolveModelForRole: () => "offline",
    reviewMissionDetailed: async () => ({ review: passedReview(), gate: passedGate() }) as any,
  } });
  await first.run();
  assert.equal(storage.loadMission(id)!.status, "paused");
  assert.equal(effects, cap);
  const second = createMissionManager(storage.loadMission(id)!, 10000, { deps: {
    planMission: async () => ({ strategy: "resume", delegations: [{ agent_role: "executor", task: "new work", context: "",
      tools: [], expected_output: "artifact", parallel: false }] }),
    executeSpecialist: async (config) => { effects++; return outcome(config.role); },
    resolveModelForRole: () => "offline",
    reviewMissionDetailed: async () => ({ review: passedReview(), gate: passedGate() }) as any,
  } });
  await second.run();
  assert.equal(effects, cap, "resume must refuse before another executor effect");
  assert.equal(rec.getSession(id).spawned, cap);
});
