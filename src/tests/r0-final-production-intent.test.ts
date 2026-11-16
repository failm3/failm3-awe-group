/** Production adapter coverage for durable effect intent. No provider/network calls. */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { Agent } from "@mastra/core/agent";
import { baseMission, passedReview, passedGate } from "./helpers/r0-runtime-util.js";

assert.equal(process.env.AWE_OFFLINE_TEST, "1", "Run through scripts/run-offline-tests.mjs");
assert.ok(process.env.AWE_DATA_DIR);

const specialists = await import("../agents/specialists.js");
const { artifactTool } = await import("../tools/index.js");
const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const { createMissionManager } = await import("../agents/mission-manager.js");
const { getToolContext } = await import("../security/tool-context.js");

const config = (missionId: string) => ({
  role: "writer",
  task: "save one real artifact",
  context: "",
  tools: ["save_artifact"],
  allowedTools: ["save_artifact"],
  expected_output: "saved bytes",
  missionId,
  depth: 0,
});
const delegation = {
  agent_role: "writer",
  task: "save one real artifact",
  context: "",
  tools: ["save_artifact"],
  expected_output: "saved bytes",
  parallel: false,
};
const qaPass = async () => ({ review: passedReview(), gate: passedGate() }) as any;

function stubGenerate(impl: (this: InstanceType<typeof Agent>) => Promise<any>): () => void {
  const original = Agent.prototype.generate;
  Agent.prototype.generate = impl as typeof original;
  return () => { Agent.prototype.generate = original; };
}

test("production specialist durably marks model and actual tool boundaries in order", async () => {
  const id = "production-intent-order";
  const marks: string[] = [];
  const names = ["model generate", "tool:save_artifact"];
  const restore = stubGenerate(async function () {
    assert.deepEqual(marks, names.slice(0, 1), "model marker must precede Agent.generate");
    const saved: any = await artifactTool.execute!({ mission_id: id, name: "proof.txt", content: "real bytes", type: "text" }, {} as never);
    assert.equal(saved.success, true, JSON.stringify(saved));
    assert.deepEqual(marks, names, "tool marker must precede and accompany the actual save");
    return {
      text: "saved",
      finishReason: "stop",
      toolCalls: [{ toolName: "save_artifact" }],
      toolResults: [{ toolName: "save_artifact", result: saved }],
    };
  });
  try {
    const result = await specialists.executeSpecialist(config(id), id, { beginEffect: (label) => marks.push(label ?? "") });
    assert.equal(result.success, true, result.issues?.join("; "));
    assert.equal(result.artifacts.length, 1);
    assert.equal(fs.readFileSync(storage.listArtifacts(id)[0].path!, "utf8"), "real bytes");
  } finally {
    restore();
  }
});

test("failed durable model marker prevents Agent.generate completely", async () => {
  const id = "production-intent-model-refused";
  let modelCalls = 0;
  const restore = stubGenerate(async function () {
    modelCalls++;
    return { text: "must not happen", toolCalls: [] };
  });
  try {
    await assert.rejects(
      specialists.executeSpecialist(config(id), id, { beginEffect: () => { throw new Error("checkpoint disk unavailable"); } }),
      /checkpoint disk unavailable/
    );
    assert.equal(modelCalls, 0);
    assert.equal(storage.listArtifacts(id).length, 0);
  } finally {
    restore();
  }
});

test("failed durable tool marker prevents raw artifact bytes and metadata", async () => {
  const id = "production-intent-tool-refused";
  const target = `${process.env.AWE_DATA_DIR}/artifacts/${id}/must-not-exist.txt`;
  let toolResult: any;
  const restore = stubGenerate(async function () {
    toolResult = await artifactTool.execute!({ mission_id: id, name: "must-not-exist.txt", content: "forbidden", type: "text" }, {} as never);
    return {
      text: "attempted",
      finishReason: "stop",
      toolCalls: [{ toolName: "save_artifact" }],
      toolResults: [{ toolName: "save_artifact", result: toolResult }],
    };
  });
  try {
    const result = await specialists.executeSpecialist(config(id), id, {
      beginEffect: (label) => {
        if (label?.startsWith("tool:")) throw new Error("effect checkpoint failed");
      },
    });
    assert.equal(result.success, false);
    assert.equal(toolResult.success, false);
    assert.match(toolResult.error, /effect checkpoint failed/);
    assert.equal(fs.existsSync(target), false, "a returned error is insufficient: bytes must not exist");
    assert.equal(storage.listArtifacts(id).length, 0, "metadata must not exist either");
  } finally {
    restore();
  }
});

test("real manager + production specialist + artifact tool persist intent before model execution", async () => {
  const id = "aaaaaaaa-0000-4000-8000-000000000001";
  storage.saveMission(baseMission(id, {
    status: "approved",
    metadata: { specification: { suggested_tools: ["save_artifact"] } },
  }) as any);
  let markerObserved = false;
  const restore = stubGenerate(async function () {
    const context = getToolContext();
    assert.ok(context?.beginEffect, "manager marker must reach production ToolContext");
    const inFlight = lifecycle.loadCheckpoint(id)?.in_flight as any[];
    markerObserved = inFlight?.length === 1 && inFlight[0].protocol === "intent-v1" &&
      typeof inFlight[0].effect_marked_at === "string" && inFlight[0].effect_label === "model generate";
    assert.equal(markerObserved, true, "the model starts only after the marker is durable");
    const saved: any = await artifactTool.execute!({ mission_id: id, name: "manager-proof.txt", content: "verified", type: "text" }, {} as never);
    assert.equal(saved.success, true, JSON.stringify(saved));
    return {
      text: "saved",
      finishReason: "stop",
      toolCalls: [{ toolName: "save_artifact" }],
      toolResults: [{ toolName: "save_artifact", result: saved }],
    };
  });
  try {
    const manager = createMissionManager(storage.loadMission(id)!, 30_000, {
      allowedStatuses: ["approved"],
      deps: {
        planMission: async () => ({ strategy: "offline", delegations: [delegation] }),
        executeSpecialist: specialists.executeSpecialist,
        reviewMissionDetailed: qaPass,
        resolveModelForRole: () => "offline-agent-stub",
      },
    });
    const result = await manager.run();
    assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata));
    assert.equal(markerObserved, true);
    assert.equal(storage.listArtifacts(id).length, 1);
    assert.equal(lifecycle.loadCheckpoint(id), null, "confirmed outcome clears the intent/checkpoint");
  } finally {
    restore();
  }
});
