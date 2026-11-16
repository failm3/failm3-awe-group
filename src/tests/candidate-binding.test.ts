#!/usr/bin/env npx tsx
import * as fs from "node:fs";
import * as path from "node:path";
import { tempDir, baseMission, makeChecker, passedReview, passedGate } from "./helpers/r0-runtime-util.js";

const { section, check, finish } = makeChecker("candidate-binding");
const root = tempDir("candidate-binding-");
process.env.AWE_DATA_DIR = path.join(root, "data");
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
const storage = await import("../utils/storage.js");
const managerModule = await import("../agents/mission-manager.js");

const missionId = "candidate-binding-1";
storage.saveMission(baseMission(missionId));
const delegation = { agent_role: "executor", task: "produce evidence", context: "", tools: ["save_artifact"], expected_output: "artifact", parallel: false };
const review = async (_m: unknown, _output: string, _contents: string[], options: any) => {
  if (process.env.MUTATE_DURING_QA === "1") {
    storage.saveArtifactFile(missionId, "nested/result.txt", "late replacement");
  }
  check("QA receives the host candidate identity", /^[a-f0-9]{64}$/.test(options.candidate?.candidate_sha256 ?? ""));
  return { review: passedReview(), gate: passedGate() };
};
const manager = managerModule.createMissionManager(storage.loadMission(missionId)!, 30_000, {
  allowedStatuses: ["approved"],
  offlineFixture: true,
  deps: {
    planMission: async () => ({ strategy: "test", delegations: [delegation] }),
    executeSpecialist: async (_cfg: unknown, id: string) => ({
      role: "executor", output: "done", artifacts: [storage.saveArtifactFile(id, "nested/result.txt", "original").id],
      success: true, tools_used: ["save_artifact"], model: "test-model",
    }),
    reviewMissionDetailed: review,
    resolveModelForRole: () => "test-model",
  },
} as any);

section("Immutable reviewed candidate is bound to terminalization");
const result = await manager.run();
const candidate = (storage.loadMission(missionId)!.metadata.candidate as any);
check("terminal mission stores candidate hash", /^[a-f0-9]{64}$/.test(candidate?.candidate_sha256 ?? ""));
const evidence = JSON.parse(fs.readFileSync(path.join(process.env.AWE_DATA_DIR!, "candidate-evidence", missionId, `${candidate.epoch_id}.json`), "utf-8"));
check("durable receipt binds review, evidence and candidate", evidence.receipt.candidate_sha256 === candidate.candidate_sha256 && /^[a-f0-9]{64}$/.test(evidence.receipt.evidence_sha256));
check("mutation during QA cannot produce completed", process.env.MUTATE_DURING_QA === "1" ? result.mission.status === "failed" : result.mission.status === "completed", result.mission.status);
finish();
