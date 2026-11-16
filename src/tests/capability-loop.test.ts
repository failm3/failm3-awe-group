#!/usr/bin/env npx tsx
import * as path from "node:path";
import * as fs from "node:fs";
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { tempDir, baseMission, passedReview, passedGate } from "./helpers/r0-runtime-util.js";
import type { PlanMissionWithCapabilities } from "../agents/capability-plane.js";

const root = tempDir("capability-loop-");
process.env.AWE_DATA_DIR = path.join(root, "state");
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const { MissionManager } = await import("../agents/mission-manager.js");

function mission(id: string, tools = ["file_read", "save_artifact"], roles = ["researcher", "executor"]) {
  const value = baseMission(id, { metadata: { specification: {
    title: "generalization test", objective: "solve an unfamiliar task", scope: "local only",
    acceptance_criteria: ["Deliver the thing"], suggested_tools: tools, suggested_agents: roles,
    estimated_complexity: "simple", risks: [],
  } } });
  storage.saveMission(value);
}

const delegation = { agent_role: "executor", task: "deliver using the acquired capability", context: "", tools: ["save_artifact"], expected_output: "deliverable", parallel: false };
const success = (role: string, artifacts: string[]) => ({ role, output: "persisted real output", artifacts, success: true, tools_used: ["save_artifact"], model: "offline" });
const passQa = async () => ({ review: passedReview(), gate: passedGate() });

test("missing capability produces real observation, bounded acquisition, replan and verified delivery", async () => {
  const id = "capability-loop-success";
  mission(id);
  const calls: string[] = [];
  let acquired = 0;
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => {
        calls.push(options?.capabilityAttempt ? "replan" : "initial");
        if (!options?.capabilityAttempt) return { status: "acquire", capability: " unfamiliar-format-parser ", detail: "no registered parser" };
        assert.equal(options.capabilityAttempt.observation.status, "available");
        assert.ok(options.capabilityAttempt.artifact_sha256.match(/^[a-f0-9]{64}$/));
        return { strategy: "use acquired parser", delegations: [delegation] };
      },
      executeSpecialist: async (config, missionId) => {
        if (config.task.includes("Investigate and acquire")) {
          acquired++;
          assert.ok(config.tools.includes("file_read"));
          assert.ok(!config.tools.includes("shell"));
          const artifact = storage.saveArtifactFile(missionId, "capabilities/observation.json", JSON.stringify({
            capability: "unfamiliar-format-parser", status: "available", detail: "existing local parser verified", acquired: "local-runtime-parser",
          }), "json");
          const notes = storage.saveArtifactFile(missionId, "capabilities/research-notes.md", "Discovery notes before the observation", "text");
          return success(config.role, [notes.id, artifact.id]);
        }
        const artifact = storage.saveArtifactFile(missionId, "delivery/result.json", JSON.stringify({ delivered: true }), "json");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  assert.equal(result.mission.status, "completed");
  assert.deepEqual(calls, ["initial", "replan"]);
  assert.equal(acquired, 1);
  assert.equal(result.mission.metadata.execution && (result.mission.metadata.execution as any).delegations.length, 1,
    "service acquisition cannot hide a missing primary deliverable");
  const attempts = (result.mission.metadata.capability_plane as any).attempts;
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].capability, "unfamiliar-format-parser");
});

test("a genuine repair revision keeps exact acquisition lineage current", async () => {
  const id = "capability-loop-repaired-observation";
  mission(id);
  let originalId = "";
  let originalSha = "";
  let repairedId = "";
  let reviews = 0;
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: (async (_m: unknown, options: any) => options?.capabilityAttempt
        ? { strategy: "use verified capability", delegations: [delegation] }
        : { status: "acquire", capability: "renderer", detail: "verify local renderer" }) as PlanMissionWithCapabilities,
      executeSpecialist: async (config: any, missionId: string) => {
        if (config.task.includes("Investigate and acquire")) {
          const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
            capability: "renderer", status: "available", detail: "verified original observation", acquired: "local-renderer",
          }), "json");
          originalId = artifact.id;
          originalSha = String(artifact.metadata.sha256);
          return success(config.role, [artifact.id]);
        }
        if (config.task.startsWith("Fix the following defects")) {
          const repairedObservation = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
            capability: "renderer", status: "available", detail: "clarified by authorized repair", acquired: "local-renderer",
          }), "json");
          repairedId = repairedObservation.id;
          const repairReceipt = storage.saveArtifactFile(missionId, "repair.json", JSON.stringify({ repaired: true }), "json");
          return success(config.role, [repairedObservation.id, repairReceipt.id]);
        }
        const artifact = storage.saveArtifactFile(missionId, "result.json", JSON.stringify({ delivered: true }), "json");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: async () => {
        reviews++;
        if (reviews === 1) return {
          review: { ...passedReview(), passed: false, defects: [{ issue: "Clarify observation", severity: "minor" as const }], verdict: "FAIL" },
          gate: { ...passedGate(), passed: false, blockers: ["Clarify observation"] },
        };
        return passQa();
      },
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  // The bounded repair updates only the artifact, not the immutable attempt.
  assert.notEqual(repairedId, "");
  assert.notEqual(repairedId, originalId);
  assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata.qa_gate));
  assert.equal(reviews, 2);
  const attempt = (result.mission.metadata.capability_plane as any).attempts[0];
  assert.equal(attempt.artifact_id, originalId, "acquisition attempt remains immutable audit history");
  assert.equal(attempt.artifact_sha256, originalSha);
  const links = result.mission.metadata.artifact_supersessions as any[];
  assert.equal(links.length, 1);
  assert.equal(links[0].superseded_id, originalId);
  assert.equal(links[0].superseded_by, repairedId);
});

test("unprovenanced replacement of acquisition evidence cannot complete", async () => {
  const id = "capability-loop-forged-observation";
  mission(id);
  let originalId = "";
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: (async (_m: unknown, options: any) => options?.capabilityAttempt
        ? { strategy: "use verified capability", delegations: [delegation] }
        : { status: "acquire", capability: "renderer", detail: "verify local renderer" }) as PlanMissionWithCapabilities,
      executeSpecialist: async (config: any, missionId: string) => {
        if (config.task.includes("Investigate and acquire")) {
          const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
            capability: "renderer", status: "available", detail: "verified original observation", acquired: "local-renderer",
          }), "json");
          originalId = artifact.id;
          return success(config.role, [artifact.id]);
        }
        const artifact = storage.saveArtifactFile(missionId, "result.json", JSON.stringify({ delivered: true }), "json");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: async () => {
        storage.saveArtifactFile(id, "capability.json", JSON.stringify({ capability: "renderer", status: "available", detail: "unprovenanced rewrite" }), "json");
        return passQa();
      },
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.notEqual(originalId, "");
  assert.equal(result.mission.status, "failed", "an ordinary rewrite cannot redirect acquisition evidence");
  assert.match(String((result.mission.metadata.qa_gate as any).blockers.join(" ")), /failed identity, authenticated lineage or current-byte validation/);
});

test("multi-hop capability evidence rejects forged, broken and damaged lineage", async () => {
  const id = "capability-loop-lineage-matrix";
  mission(id);
  const evidence = await import("../utils/artifact-evidence.js");
  const original = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ revision: 1 }), "json");
  const middle = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ revision: 2 }), "json");
  const current = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ revision: 3 }), "json");
  const link = (old: any, replacement: any, iteration: number): any => ({
    superseded_id: old.id, superseded_by: replacement.id, name: old.name,
    superseded_sha256: old.metadata.sha256, superseded_size_bytes: old.metadata.size_bytes,
    replacement_sha256: replacement.metadata.sha256, replacement_size_bytes: replacement.metadata.size_bytes,
    repair_iteration: iteration, recorded_at: new Date().toISOString(), source: "repair",
    intent_id: `intent-${iteration}`, provenance_id: `proof-${iteration}`,
  });
  const links = [link(original, middle, 1), link(middle, current, 2)];
  const provenance = links.map((entry) => ({
    provenance_id: entry.provenance_id, intent_id: entry.intent_id,
    repair_iteration: entry.repair_iteration, source: "repair" as const,
    outcome: "completed" as const, recorded_at: entry.recorded_at, supersessions: [entry],
  }));
  const records = evidence.allArtifactRecords(id);
  const visible = storage.listArtifacts(id);
  const authenticated = evidence.authenticateSupersessions({ missionId: id, links, provenance, records });
  assert.equal(authenticated.length, 2);
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256), authenticated, visible, records)?.current.id, current.id);
  assert.equal(evidence.resolveCurrentArtifact(original.id, "0".repeat(64), authenticated, visible, records), null);
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256), authenticated, visible, records)?.hops, 2);
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256), authenticated.slice(0, 1), visible, records), null, "broken chain");
  assert.equal(evidence.authenticateSupersessions({ missionId: id, links, provenance: [], records }).length, 0, "proof is mandatory");
  const wrongName = [{ ...links[0], name: "other.json" }, links[1]];
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256),
    evidence.authenticateSupersessions({ missionId: id, links: wrongName, provenance, records }), visible, records), null);
  const wrongHash = [{ ...links[0], replacement_sha256: "f".repeat(64) }, links[1]];
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256),
    evidence.authenticateSupersessions({ missionId: id, links: wrongHash, provenance, records }), visible, records), null, "wrong hashes cannot authenticate");
  const cycle = [...links, link(current, original, 3)];
  const cycleProof = [...provenance, {
    provenance_id: "proof-3", intent_id: "intent-3", repair_iteration: 3, source: "repair" as const,
    outcome: "completed" as const, recorded_at: new Date().toISOString(), supersessions: [cycle[2]],
  }];
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256),
    evidence.authenticateSupersessions({ missionId: id, links: cycle, provenance: cycleProof, records }), visible, records), null, "cycle cannot terminate");
  fs.writeFileSync(current.path!, "damaged current bytes");
  assert.equal(evidence.resolveCurrentArtifact(original.id, String(original.metadata.sha256),
    evidence.authenticateSupersessions({ missionId: id, links, provenance, records }), visible, evidence.allArtifactRecords(id)), null, "current bytes remain mandatory");
});

test("capability acquisition resumes through repaired observation without repeating work", async () => {
  const id = "capability-loop-repaired-resume";
  mission(id);
  const original = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ capability: "renderer", status: "available", detail: "original" }), "json");
  const repaired = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ capability: "renderer", status: "available", detail: "repaired" }), "json");
  const delivered = storage.saveArtifactFile(id, "result.json", JSON.stringify({ delivered: true }), "json");
  const attempt = {
    attempt_id: "repaired-resume-attempt", capability: "renderer",
    observation: { capability: "renderer", status: "available" as const, detail: "original" },
    artifact_id: original.id, artifact_sha256: String(original.metadata.sha256), created_at: new Date().toISOString(),
  };
  const supersession: any = {
    superseded_id: original.id, superseded_by: repaired.id, name: original.name,
    superseded_sha256: original.metadata.sha256, superseded_size_bytes: original.metadata.size_bytes,
    replacement_sha256: repaired.metadata.sha256, replacement_size_bytes: repaired.metadata.size_bytes,
    repair_iteration: 1, recorded_at: new Date().toISOString(), source: "repair",
    intent_id: "repair-intent", provenance_id: "repair-proof",
  };
  const proof = {
    provenance_id: "repair-proof", intent_id: "repair-intent", repair_iteration: 1,
    source: "repair" as const, outcome: "completed" as const,
    recorded_at: supersession.recorded_at, supersessions: [supersession],
  };
  const planned = { ...delegation, delegation_id: "repaired-resume-delivery",
    fingerprint: lifecycle.delegationFingerprint(delegation.agent_role, delegation.task, delegation.expected_output) };
  const unsigned = { version: 1 as const, strategy: "stored accepted plan", delegations: [planned] };
  storage.updateMissionAtomic(id, (current) => ({
    status: "paused", metadata: { ...current.metadata, artifact_supersessions: [supersession] },
  }), { allowTerminalTransition: true });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000,
    elapsed_ms: 10, in_flight: [], repair_iterations: 1, repair_provenance: [proof],
    capability_attempts: [attempt], reason: "process_exit",
    plan: { ...unsigned, plan_hash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") },
    completed: [
      { index: 0, agent_role: "researcher", task: "acquisition", status: "success", output: "observed", artifacts: [original.id], duration_ms: 1, model: "offline" },
      { index: 1, delegation_id: planned.delegation_id, fingerprint: planned.fingerprint, agent_role: planned.agent_role,
        task: planned.task, status: "success", output: "delivered", artifacts: [delivered.id], duration_ms: 1, model: "offline" },
    ],
  });
  let plans = 0;
  let executions = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"], deps: {
      planMission: async () => { plans++; throw new Error("stored plan must be reused"); },
      executeSpecialist: async () => { executions++; throw new Error("completed effects must not repeat"); },
      reviewMissionDetailed: passQa, resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata.qa_gate));
  assert.deepEqual([plans, executions], [0, 0]);
  assert.equal((result.mission.metadata.capability_plane as any).attempts[0].artifact_id, original.id);
});

test("candidate evidence authenticates ordinary and operator repair lineage after checkpoint cleanup", async () => {
  const id = "capability-loop-candidate-lineage-durability";
  mission(id);
  const { createCandidateEpoch, createCandidateReviewReceipt, persistCandidateEvidence } = await import("../agents/candidate.js");
  const evidence = await import("../utils/artifact-evidence.js");
  const original = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ revision: 1 }), "json");
  const repaired = storage.saveArtifactFile(id, "capability.json", JSON.stringify({ revision: 2 }), "json");
  const attempt = {
    attempt_id: "candidate-lineage-attempt", capability: "renderer",
    observation: { capability: "renderer", status: "available" as const, detail: "observed" },
    artifact_id: original.id, artifact_sha256: String(original.metadata.sha256), created_at: new Date().toISOString(),
  };
  const makeLink = (source: "repair" | "operator_accept" | "operator_retry"): any => ({
    superseded_id: original.id, superseded_by: repaired.id, name: original.name,
    superseded_sha256: original.metadata.sha256, superseded_size_bytes: original.metadata.size_bytes,
    replacement_sha256: repaired.metadata.sha256, replacement_size_bytes: repaired.metadata.size_bytes,
    repair_iteration: 1, recorded_at: new Date().toISOString(), source,
    intent_id: "durable-intent", provenance_id: `proof-${source}`,
  });
  const unsigned = { version: 1 as const, strategy: "stored plan", delegations: [] };
  const storedPlan = { ...unsigned, plan_hash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") };
  for (const source of ["repair", "operator_accept", "operator_retry"] as const) {
    const supersession = makeLink(source);
    const proof: any = {
      provenance_id: supersession.provenance_id, intent_id: supersession.intent_id, repair_iteration: 1, source,
      outcome: source === "repair" ? "completed" : source === "operator_accept" ? "operator_accepted" : "operator_retried",
      operator: source === "repair" ? undefined : "test-operator", recorded_at: supersession.recorded_at, supersessions: [supersession],
    };
    const resolutions: any[] = source === "repair" ? [] : [{
      resolution_id: `resolution-${source}`, intent_id: "durable-intent", kind: "repair",
      decision: source === "operator_accept" ? "accept" : "retry", operator: "test-operator", note: "explicit test recovery",
      artifacts: source === "operator_accept" ? [repaired.id] : [], resolved_at: new Date().toISOString(), repair_iteration: 1,
    }];
    const candidate = createCandidateEpoch(storage.loadMission(id)!, storedPlan, storage.listArtifacts(id), 1,
      { supersessions: [supersession], provenance: [proof], resolutions });
    const receipt = createCandidateReviewReceipt(candidate, "", [], passedReview(), passedGate());
    persistCandidateEvidence(candidate, receipt);
    const persisted = JSON.parse(fs.readFileSync(path.join(process.env.AWE_DATA_DIR!, "candidate-evidence", id, `${candidate.epoch_id}.json`), "utf8"));
    const authenticated = evidence.authenticateSupersessions({
      missionId: id, links: persisted.candidate.repair_supersessions,
      provenance: persisted.candidate.repair_provenance, resolutions: persisted.candidate.recovery_resolutions,
      records: evidence.allArtifactRecords(id),
    });
    assert.equal(authenticated.length, 1, `${source} survives checkpoint cleanup`);
    assert.ok(evidence.resolveCurrentArtifact(attempt.artifact_id, attempt.artifact_sha256, authenticated, storage.listArtifacts(id), evidence.allArtifactRecords(id)));
  }
});

test("capability diagnoses ignore non-executable illustrative delegations", async () => {
  const id = "capability-loop-diagnostic-proposal";
  mission(id);
  const executed: string[] = [];
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => options?.capabilityAttempt
        ? { strategy: "real accepted work", delegations: [delegation] }
        : {
            status: "acquire" as const, capability: "renderer", detail: "investigate a local renderer",
            delegations: [{ ...delegation, task: "illustrative proposal that must not execute", tools: ["unregistered-phantom-tool"] }],
          },
      executeSpecialist: async (config, missionId) => {
        executed.push(config.task);
        const artifact = config.task.includes("Investigate and acquire")
          ? storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
              capability: "renderer", status: "available", detail: "verified existing renderer", acquired: "local-renderer",
            }), "json")
          : storage.saveArtifactFile(missionId, "result.txt", "verified delivery", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata.qa_gate));
  assert.equal(executed.length, 2);
  assert.ok(!executed.some((task) => task.includes("illustrative proposal")));
});

test("capability attempts survive timeout without repeating acquisition", async () => {
  const id = "capability-loop-resume";
  mission(id);
  let acquisitions = 0;
  let executions = 0;
  const deps = {
    planMission: (async (_m: unknown, options: any) => options?.capabilityAttempt
      ? { strategy: "resume replanned work", delegations: [delegation] }
      : { status: "acquire", capability: "unfamiliar-format-parser", detail: "missing" }) as PlanMissionWithCapabilities,
    executeSpecialist: async (config: any, missionId: string) => {
      if (config.task.includes("Investigate and acquire")) {
        acquisitions++;
        const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({ capability: "unfamiliar-format-parser", status: "available", detail: "verified" }), "json");
        return success(config.role, [artifact.id]);
      }
      executions++;
      const artifact = storage.saveArtifactFile(missionId, "result.json", JSON.stringify({ delivered: true }), "json");
      return success(config.role, [artifact.id]);
    },
    reviewMissionDetailed: passQa,
    resolveModelForRole: () => "offline",
  };
  const observation = storage.saveArtifactFile(id, "capability.json", JSON.stringify({
    capability: "unfamiliar-format-parser", status: "available", detail: "verified",
  }), "json");
  const attempt = {
    attempt_id: "stored-attempt", capability: "unfamiliar-format-parser",
    observation: { capability: "unfamiliar-format-parser", status: "available" as const, detail: "verified" },
    artifact_id: observation.id, artifact_sha256: String(observation.metadata.sha256), created_at: new Date().toISOString(),
  };
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000,
    elapsed_ms: 10, in_flight: [], repair_iterations: 0,
    capability_attempts: [attempt], reason: "process_exit",
    completed: [{
      index: 0, agent_role: "researcher", task: "completed capability acquisition", status: "success",
      output: "stored observation", artifacts: [observation.id], duration_ms: 1, model: "offline", tools_used: ["save_artifact"],
    }],
  });
  const resumed = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, deps, allowedStatuses: ["paused"],
  }).run();
  assert.equal(resumed.mission.status, "completed");
  assert.equal(acquisitions, 0, "stored capability evidence prevents repeated real work");
  assert.equal(executions, 1);
  assert.equal((resumed.mission.metadata.capability_plane as any).attempts[0].attempt_id, "stored-attempt",
    "terminal evidence retains the resumed capability identity after checkpoint cleanup");
});

for (const status of ["missing", "failed"] as const) {
  test(`${status} capability observation is terminal without an ordinary replan`, async () => {
    const id = `capability-loop-terminal-${status}`;
    mission(id);
    let acquisitions = 0;
    let plans = 0;
    const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
      offlineFixture: true,
      deps: {
        planMission: async () => {
          plans++;
          return { status: "acquire", capability: "unavailable-capability", detail: "investigate feasibility" };
        },
        executeSpecialist: async (config: any, missionId: string) => {
          acquisitions++;
          const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
            capability: "unavailable-capability", status, detail: `verified ${status} outcome`,
          }), "json");
          return success(config.role, [artifact.id]);
        },
        reviewMissionDetailed: passQa,
        resolveModelForRole: () => "offline",
      },
    }).run();
    assert.equal(result.mission.status, "failed");
    assert.deepEqual([plans, acquisitions], [1, 1], "terminal evidence must not trigger another planner/acquisition cycle");
    const blockers = String((result.mission.metadata.qa_gate as any).blockers.join(" "));
    assert.match(blockers, new RegExp(`terminal \\(${status}\\)`));
    assert.doesNotMatch(blockers, /already investigated/);
  });
}

test("a restored terminal capability observation cannot replan or execute", async () => {
  const id = "capability-loop-restored-terminal";
  mission(id);
  const observation = storage.saveArtifactFile(id, "capability.json", JSON.stringify({
    capability: "unavailable-capability", status: "missing", detail: "verified unavailable",
  }), "json");
  const attempt = {
    attempt_id: "terminal-attempt", capability: "unavailable-capability",
    observation: { capability: "unavailable-capability", status: "missing" as const, detail: "verified unavailable" },
    artifact_id: observation.id, artifact_sha256: String(observation.metadata.sha256), created_at: new Date().toISOString(),
  };
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000,
    elapsed_ms: 10, in_flight: [], repair_iterations: 0, capability_attempts: [attempt], reason: "process_exit",
    completed: [{ index: 0, agent_role: "researcher", task: "acquisition", status: "success",
      output: "stored observation", artifacts: [observation.id], duration_ms: 1, model: "offline" }],
  });
  let plans = 0;
  let executions = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"],
    deps: {
      planMission: async () => { plans++; throw new Error("terminal observation must not reach Head"); },
      executeSpecialist: async () => { executions++; throw new Error("terminal observation must not execute"); },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "failed");
  assert.deepEqual([plans, executions], [0, 0]);
  assert.match(String((result.mission.metadata.qa_gate as any).blockers.join(" ")), /terminal \(missing\)/);
});

test("restored capability evidence is authenticated before planning or execution", async () => {
  const id = "capability-loop-tampered-observation";
  mission(id);
  const observation = storage.saveArtifactFile(id, "capability.json", JSON.stringify({
    capability: "renderer", status: "available", detail: "verified",
  }), "json");
  const attempt = {
    attempt_id: "tampered-attempt", capability: "renderer",
    observation: { capability: "renderer", status: "available" as const, detail: "verified" },
    artifact_id: observation.id, artifact_sha256: String(observation.metadata.sha256), created_at: new Date().toISOString(),
  };
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000,
    elapsed_ms: 10, in_flight: [], repair_iterations: 0, capability_attempts: [attempt], reason: "process_exit",
    completed: [{ index: 0, agent_role: "researcher", task: "acquisition", status: "success",
      output: "stored observation", artifacts: [observation.id], duration_ms: 1, model: "offline" }],
  });
  fs.writeFileSync(observation.path!, "tampered");
  let plans = 0;
  let executions = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"],
    deps: {
      planMission: async () => { plans++; return { strategy: "must not run", delegations: [delegation] }; },
      executeSpecialist: async () => { executions++; return success("executor", []); },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "paused", "damaged checkpoint evidence requires explicit recovery, not a silently terminal mission");
  assert.deepEqual([plans, executions], [0, 0]);
});

test("an accepted replacement failure cannot unlock another adaptation on resume", async () => {
  const id = "capability-loop-resumed-second-failure";
  mission(id);
  const old = { ...delegation, delegation_id: "original-id", fingerprint: lifecycle.delegationFingerprint(delegation.agent_role, delegation.task, delegation.expected_output) };
  const replacement = { ...delegation, task: "replacement task", delegation_id: "replacement-id",
    fingerprint: lifecycle.delegationFingerprint(delegation.agent_role, "replacement task", delegation.expected_output) };
  const unsigned = { version: 1 as const, strategy: "initial -> replacement", delegations: [old, replacement] };
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000,
    elapsed_ms: 10, in_flight: [], repair_iterations: 0, execution_adaptations: 1,
    execution_superseded: [old.delegation_id],
    plan: { ...unsigned, plan_hash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") },
    reason: "process_exit",
    completed: [old, replacement].map((entry, index) => ({
      index, delegation_id: entry.delegation_id, agent_role: entry.agent_role, task: entry.task,
      fingerprint: entry.fingerprint, status: "failed" as const, output: "definite pre-effect failure",
      artifacts: [], duration_ms: 1, model: "offline",
    })),
  });
  let plans = 0;
  let executions = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"],
    deps: {
      planMission: async () => { plans++; throw new Error("a second adaptation is forbidden"); },
      executeSpecialist: async () => { executions++; throw new Error("failed attempts must not repeat"); },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "failed");
  assert.deepEqual([plans, executions], [0, 0]);
  assert.equal(result.mission.metadata.execution_adaptations, 1);
});

test("unapproved acquisition fails closed before execution", async () => {
  const deniedId = "capability-loop-denied";
  mission(deniedId, ["web_search"], ["executor"]);
  let effects = 0;
  const denied = await new MissionManager(storage.loadMission(deniedId)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ status: "acquire", capability: "parser", detail: "missing" }),
      executeSpecialist: async () => { effects++; return success("executor", []); },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(denied.mission.status, "failed");
  assert.equal(effects, 0, "no approved artifact channel means no acquisition delegation");
  assert.match(String((denied.mission.metadata.qa_gate as any).blockers.join(" ")), /approved registered tools/);
});

test("blank acquired is normalized away for a terminal missing observation", async () => {
  const id = "capability-loop-blank-acquired";
  mission(id, ["file_read", "save_artifact", "capability_library"], ["researcher"]);
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ status: "acquire", capability: "renderer", detail: "missing" }),
      executeSpecialist: async (config: any, missionId: string) => {
        const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
          capability: "renderer", status: "missing", detail: "catalogue metadata is not a local renderer", acquired: "   ",
        }), "json");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "failed");
  const attempt = (result.mission.metadata.capability_plane as any).attempts[0];
  assert.equal(attempt.observation.status, "missing");
  assert.ok(!Object.hasOwn(attempt.observation, "acquired"));
});

test("catalogue access alone does not make acquisition actionable", async () => {
  const id = "capability-loop-catalogue-only-denied";
  mission(id, ["save_artifact", "capability_library"], ["researcher"]);
  let effects = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ status: "acquire", capability: "parser", detail: "missing" }),
      executeSpecialist: async () => { effects++; return success("researcher", []); },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "failed");
  assert.equal(effects, 0, "advisory lookup cannot satisfy the investigation-tools gate");
  assert.match(String((result.mission.metadata.qa_gate as any).blockers.join(" ")), /approved registered tools/);
});

test("catalogue is offered only within approved acquisition grants", async () => {
  const id = "capability-loop-catalogue-wired";
  mission(id, ["file_read", "save_artifact", "capability_library"], ["researcher"]);
  let observedTools: string[] = [];
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: (async (_m: unknown, options: any) => options?.capabilityAttempt
        ? { strategy: "verified candidate", delegations: [delegation] }
        : { status: "acquire", capability: "unfamiliar-format-parser", detail: "missing" }) as PlanMissionWithCapabilities,
      executeSpecialist: async (config: any, missionId: string) => {
        if (config.task.includes("Investigate and acquire")) {
          observedTools = config.tools;
          assert.match(config.task, /consult it first/);
          const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
            capability: "unfamiliar-format-parser", status: "available", detail: "candidate verified", acquired: "local-parser",
          }), "json");
          return success(config.role, [artifact.id]);
        }
        const artifact = storage.saveArtifactFile(missionId, "result.json", "delivered", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "completed");
  assert.ok(observedTools.includes("capability_library"));
  assert.ok(observedTools.includes("file_read"));
});

test("one ordinary execution failure adapts, acquires within grants and appends verified work", async () => {
  const id = "capability-loop-execution-adaptation";
  mission(id, ["file_read", "shell", "save_artifact"], ["executor", "researcher"]);
  const planning: string[] = [];
  let primary = 0;
  let acquisition = 0;
  let repair = 0;
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => {
        if (options?.executionFailure) planning.push(options.capabilityAttempt ? "failure-replan" : "failure");
        else planning.push(options?.capabilityAttempt ? "capability-replan" : "initial");
        if (options?.capabilityAttempt) return { strategy: "render through an existing procedure", delegations: [{
          agent_role: "executor", task: "complete rendering", context: "", tools: ["save_artifact"],
          expected_output: "rendered result", parallel: false,
        }] };
        if (options?.executionFailure) return { status: "acquire", capability: "dashboard-renderer", detail: "existing renderer was not discovered" };
        return { strategy: "initial", delegations: [delegation] };
      },
      executeSpecialist: async (config, missionId) => {
        if (config.task.includes("Investigate and acquire")) {
          acquisition++;
          const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
            capability: "dashboard-renderer", status: "available", detail: "existing browser procedure verified", acquired: "existing-local-browser",
          }), "json");
          return success(config.role, [artifact.id]);
        }
        if (config.task === delegation.task) {
          primary++;
          return { ...success(config.role, []), success: false, issues: ["renderer command unavailable before any effect"] };
        }
        repair++;
        const artifact = storage.saveArtifactFile(missionId, "rendered.txt", "real replacement output", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  assert.equal(result.mission.status, "completed", JSON.stringify({ planning, recovery: result.mission.metadata.recovery_blocked, gate: result.mission.metadata.qa_gate }));
  assert.deepEqual(planning, ["initial", "failure", "failure-replan"]);
  assert.deepEqual([primary, acquisition, repair], [1, 1, 1]);
  assert.equal(result.mission.metadata.execution_adaptations, 1);
  assert.deepEqual((result.mission.metadata.execution as any).delegations.map((entry: any) => entry.status), ["failed", "success"]);
  assert.equal(lifecycle.loadCheckpoint(id), null);
});

test("adaptation preserves a successful parallel result and never repeats the failed attempt", async () => {
  const id = "capability-loop-parallel-adaptation";
  mission(id);
  const successful = { agent_role: "executor", task: "independent successful work", context: "", tools: ["save_artifact"], expected_output: "kept artifact", parallel: true };
  const failing = { ...delegation, parallel: true };
  let failedRuns = 0;
  let successRuns = 0;
  let replacements = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: (async (_m: unknown, options: any) => options?.executionFailure
        ? { strategy: "replacement", delegations: [{ ...delegation, task: "replacement task" }] }
        : { strategy: "parallel initial", delegations: [failing, successful] }) as PlanMissionWithCapabilities,
      executeSpecialist: async (config: any, missionId: string) => {
        if (config.task === failing.task) {
          failedRuns++;
          return { ...success(config.role, []), success: false, issues: ["definite pre-effect failure"] };
        }
        if (config.task === successful.task) successRuns++;
        else replacements++;
        const artifact = storage.saveArtifactFile(missionId, `${config.task === successful.task ? "kept" : "replacement"}.txt`, "verified", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "completed");
  assert.deepEqual([failedRuns, successRuns, replacements], [1, 1, 1]);
  assert.equal(lifecycle.loadCheckpoint(id), null);
});

test("real post-acquisition checkpoints resume service history without repeating it", async () => {
  const id = "capability-loop-real-acquisition-resume";
  mission(id);
  let acquisitions = 0;
  let executions = 0;
  let plans = 0;
  const deps = {
    planMission: (async (_m: unknown, options: any) => {
      plans++;
      if (options?.capabilityAttempt) throw new Error("interrupt after durable acquisition");
      return { status: "acquire", capability: "unfamiliar-format-parser", detail: "missing" };
    }) as PlanMissionWithCapabilities,
    executeSpecialist: async (config: any, missionId: string) => {
      if (config.task.includes("Investigate and acquire")) {
        acquisitions++;
        const artifact = storage.saveArtifactFile(missionId, "capability.json", JSON.stringify({
          capability: "unfamiliar-format-parser", status: "available", detail: "verified", acquired: "local-runtime",
        }), "json");
        return success(config.role, [artifact.id]);
      }
      executions++;
      const artifact = storage.saveArtifactFile(missionId, "result.json", JSON.stringify({ delivered: true }), "json");
      return success(config.role, [artifact.id]);
    },
    reviewMissionDetailed: passQa,
    resolveModelForRole: () => "offline",
  };
  const paused = await new MissionManager(storage.loadMission(id)!, 30_000, { offlineFixture: true, deps }).run();
  assert.equal(paused.mission.status, "failed");
  assert.deepEqual([plans, acquisitions, executions], [2, 1, 0]);
  const checkpoint = lifecycle.loadCheckpoint(id)!;
  storage.unsealMission(id);
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  assert.equal(checkpoint.completed.length, 1);
  assert.equal(checkpoint.capability_attempts?.length, 1);
  assert.equal(checkpoint.plan, undefined);
  const resumed = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"], deps: {
      ...deps,
      planMission: (async (_m: unknown, options: any) => {
        assert.ok(options?.capabilityAttempt);
        return { strategy: "use acquired parser", delegations: [delegation] };
      }) as PlanMissionWithCapabilities,
    },
  }).run();
  assert.equal(resumed.mission.status, "completed");
  assert.deepEqual([acquisitions, executions], [1, 1]);
  assert.equal((resumed.mission.metadata.execution as any).delegations.length, 1);
});

test("interrupted adaptation resumes Head once and appends work without re-executing failure", async () => {
  const id = "capability-loop-interrupted-adaptation";
  mission(id);
  let primary = 0;
  let replacements = 0;
  const deps = {
    planMission: (async (_m: unknown, options: any) => options?.executionFailure
      ? { strategy: "replacement", delegations: [{ ...delegation, task: "replacement task" }] }
      : { strategy: "initial", delegations: [delegation] }) as PlanMissionWithCapabilities,
    executeSpecialist: async (config: any, missionId: string) => {
      if (config.task === delegation.task) {
        primary++;
        return { ...success(config.role, []), success: false, issues: ["pre-effect failure"] };
      }
      replacements++;
      const artifact = storage.saveArtifactFile(missionId, "replacement.txt", "verified", "text");
      return success(config.role, [artifact.id]);
    },
    reviewMissionDetailed: passQa,
    resolveModelForRole: () => "offline",
  };
  const first = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      ...deps,
      planMission: (async (_m: unknown, options: any) => {
        if (options?.executionFailure) throw new Error("crash after adaptation counter was persisted");
        return { strategy: "initial", delegations: [delegation] };
      }) as PlanMissionWithCapabilities,
    },
  }).run();
  assert.equal(first.mission.status, "failed");
  assert.equal(primary, 1);
  const checkpoint = lifecycle.loadCheckpoint(id)!;
  assert.equal(checkpoint.execution_adaptations, 1);
  assert.equal(checkpoint.completed.filter((entry) => entry.status === "failed").length, 1);
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  const resumed = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"], deps,
  }).run();
  assert.equal(resumed.mission.status, "completed", JSON.stringify(resumed.mission.metadata.qa_gate));
  assert.deepEqual([primary, replacements], [1, 1]);
  assert.equal(resumed.mission.metadata.execution_adaptations, 1);
});

test("superseded adaptation failure without a replacement result still executes accepted work", async () => {
  const id = "capability-loop-adaptation-missing-replacement";
  mission(id);
  let replacements = 0;
  const initial = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => {
        if (options?.executionFailure) throw new Error("interrupt after the adaptation epoch was committed");
        return { strategy: "initial", delegations: [delegation] };
      },
      executeSpecialist: async (config) => ({ ...success(config.role, []), success: false, issues: ["pre-effect failure"] }),
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(initial.mission.status, "failed");
  const checkpoint = lifecycle.loadCheckpoint(id)!;
  const old = checkpoint.plan!.delegations[0];
  const replacementTask = "accepted replacement task";
  const replacement = {
    ...delegation, task: replacementTask, delegation_id: "accepted-replacement-id",
    fingerprint: lifecycle.delegationFingerprint(delegation.agent_role, replacementTask, delegation.expected_output),
  };
  const unsigned = {
    version: 1 as const, strategy: `${checkpoint.plan!.strategy} -> replacement`,
    delegations: [old, replacement],
  };
  lifecycle.saveCheckpoint({
    ...checkpoint, in_flight: [], execution_superseded: [old.delegation_id],
    plan: { ...unsigned, plan_hash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") },
    reason: "manual",
  });
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  const resumed = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true, allowedStatuses: ["paused"],
    deps: {
      planMission: async () => { throw new Error("stored adapted plan must be reused"); },
      executeSpecialist: async (config, missionId) => {
        assert.equal(config.task, replacementTask);
        replacements++;
        const artifact = storage.saveArtifactFile(missionId, "replacement.txt", "verified replacement", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(replacements, 1);
  assert.equal(resumed.mission.status, "completed", JSON.stringify(resumed.mission.metadata.qa_gate));
  assert.equal(resumed.mission.metadata.execution_adaptations, 1);
});

test("a second ordinary execution failure is terminal without another replan", async () => {
  const id = "capability-loop-adaptation-limit";
  mission(id);
  let plans = 0;
  let executions = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => {
        if (options?.executionFailure) {
          plans++;
          return { strategy: "replacement", delegations: [{ ...delegation, task: "replacement task" }] };
        }
        return { strategy: "initial", delegations: [delegation] };
      },
      executeSpecialist: async (config) => {
        executions++;
        return { ...success(config.role, []), success: false, issues: ["definite pre-effect failure"] };
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "failed");
  assert.deepEqual([plans, executions], [1, 2]);
  assert.equal((result.mission.metadata.execution as any).delegations.length, 2);
  assert.equal(result.mission.metadata.execution_adaptations, 1);
});

test("QA receives trailing artifact evidence beyond the legacy 15000-character slice", async () => {
  const id = "capability-loop-full-qa-content";
  mission(id);
  const trailingEvidence = "TRAILING-EVIDENCE-AFTER-15000";
  const content = `${"x".repeat(16000)}${trailingEvidence}${"y".repeat(2000)}`;
  let reviewed: string[] = [];
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ strategy: "single delivery", delegations: [delegation] }),
      executeSpecialist: async (config, missionId) => {
        const artifact = storage.saveArtifactFile(missionId, "large-evidence.txt", content, "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: async (_m, _output, artifacts) => {
        reviewed = artifacts;
        return { review: passedReview(), gate: passedGate() };
      },
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "completed");
  assert.equal(reviewed.length, 1);
  assert.ok(reviewed[0].includes(trailingEvidence));
  assert.ok(reviewed[0].endsWith("y".repeat(2000)), "the reviewer, not artifact loading, owns prompt truncation");
});

test("QA artifact loading remains bounded while preserving the truncation signal", async () => {
  const id = "capability-loop-bounded-qa-content";
  mission(id);
  let reviewed: string[] = [];
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ strategy: "single delivery", delegations: [delegation] }),
      executeSpecialist: async (config, missionId) => {
        const artifact = storage.saveArtifactFile(missionId, "oversized-evidence.txt", "z".repeat(2_000_000), "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: async (_m, _output, artifacts) => {
        reviewed = artifacts;
        return { review: passedReview(), gate: passedGate() };
      },
      resolveModelForRole: () => "offline",
    },
  }).run();
  assert.equal(result.mission.status, "completed");
  assert.equal(reviewed.length, 1);
  assert.ok(reviewed[0].length > 24_000, "the reviewer must still see that the evidence exceeds its window");
  assert.ok(reviewed[0].length < 100_000, "artifact loading must not materialize the full two-million-character file");
});

test("a blocked failure adaptation is terminal, durable and independently reviewable", async () => {
  const id = "capability-loop-blocked-adaptation";
  mission(id);
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => options?.executionFailure
        ? { status: "blocked", detail: "no approved alternative remains" }
        : { strategy: "initial", delegations: [delegation] },
      executeSpecialist: async (config) => ({ ...success(config.role, []), success: false, issues: ["pre-effect failure"] }),
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  assert.equal(result.mission.status, "failed");
  assert.equal((result.mission.metadata.execution as any).delegations.length, 1);
  assert.match(String((result.mission.metadata.qa_gate as any).blockers.join(" ")), /no approved alternative remains/);
  assert.equal(lifecycle.loadCheckpoint(id), null);
});

test("an acquisition that omits the protocol observation gets exactly one corrective write", async () => {
  const id = "capability-loop-missing-observation";
  mission(id);
  const calls: string[] = [];
  let investigations = 0;
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => {
        calls.push(options?.capabilityAttempt ? "replan" : "initial");
        if (!options?.capabilityAttempt) return { status: "acquire", capability: "unfamiliar-format-parser", detail: "no registered parser" };
        return { strategy: "use acquired parser", delegations: [delegation] };
      },
      executeSpecialist: async (config, missionId) => {
        if (config.task.includes("Write the single required capability observation")) {
          // The correction sees the persisted evidence and writes only the
          // protocol object, exactly as the task demands.
          assert.match(config.context, /artifact_id [0-9a-f]{8}-/);
          const artifact = storage.saveArtifactFile(missionId, "capabilities/observation.json", JSON.stringify({
            capability: "unfamiliar-format-parser", status: "available", detail: "existing local parser verified by probe", acquired: "local-runtime-parser",
          }), "json");
          return success(config.role, [artifact.id]);
        }
        if (config.task.includes("Investigate and acquire")) {
          investigations++;
          // Real work, but no object with only the protocol keys.
          const evidence = storage.saveArtifactFile(missionId, "capabilities/evidence.json", JSON.stringify({
            procedure_id: "local-parser", probe_run: { exit_code: 0 }, verification_result: "pass",
          }), "json");
          return success(config.role, [evidence.id]);
        }
        const artifact = storage.saveArtifactFile(missionId, "delivery/result.json", JSON.stringify({ delivered: true }), "json");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  assert.equal(result.mission.status, "completed");
  assert.equal(investigations, 1, "the investigation must not be repeated");
  assert.deepEqual(calls, ["initial", "replan"]);
  const attempts = (result.mission.metadata.capability_plane as any).attempts;
  assert.equal(attempts.length, 1);
  assert.equal(attempts[0].observation.detail, "existing local parser verified by probe");
});

test("a second failed corrective write blocks instead of looping", async () => {
  const id = "capability-loop-observation-still-missing";
  mission(id);
  let investigations = 0;
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ status: "acquire", capability: "unfamiliar-format-parser", detail: "no registered parser" }),
      executeSpecialist: async (config, missionId) => {
        investigations++;
        const junk = storage.saveArtifactFile(missionId, `capabilities/evidence-${investigations}.json`, JSON.stringify({ probe_run: { exit_code: 0 } }), "json");
        return success(config.role, [junk.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  assert.equal(result.mission.status, "failed");
  assert.equal(investigations, 2, "one investigation plus exactly one correction");
  assert.match(String((result.mission.metadata.qa_gate as any).blockers.join(" ")), /0 matching observations|exactly one is required/);
});

test("an available observation that names nothing gets one correction, then blocks", async () => {
  const id = "capability-loop-unresolvable-available";
  mission(id);
  const tasks: string[] = [];
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async (_m, options) => options?.capabilityAttempt
        ? { strategy: "unreachable", delegations: [delegation] }
        : { status: "acquire", capability: "unfamiliar-format-parser", detail: "no registered parser" },
      executeSpecialist: async (config, missionId) => {
        tasks.push(config.task.includes("Write the single required") ? "correction" : "investigation");
        const artifact = storage.saveArtifactFile(missionId, `capabilities/observation-${tasks.length}.json`, JSON.stringify({
          capability: "unfamiliar-format-parser", status: "available", detail: "parser exists and was verified",
        }), "json");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  const result = await manager.run();
  assert.deepEqual(tasks, ["investigation", "correction"]);
  assert.equal(result.mission.status, "failed");
  assert.match(String((result.mission.metadata.qa_gate as any).blockers.join(" ")),
    /reported availability without naming what was acquired/);
});

test("the corrective observation task carries the host rule that local_target needs acquired", async () => {
  // Run 1794844229723: the correction wrote a local_target without acquired,
  // as its task allowed ("either acquired or local_target"); the host policy
  // refuses such an observation, so a correct proposal paused the mission.
  const id = "capability-loop-correction-acquired-rule";
  mission(id);
  const tasks: Record<string, string> = {};
  const manager = new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ status: "acquire", capability: "unfamiliar-format-parser", detail: "no registered parser" }),
      executeSpecialist: async (config, missionId) => {
        const kind = config.task.includes("Write the single required") ? "correction" : "investigation";
        tasks[kind] = config.task;
        const junk = storage.saveArtifactFile(missionId, `capabilities/evidence-${kind}.json`, JSON.stringify({ probe_run: { exit_code: 0 } }), "json");
        return success(config.role, [junk.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  });
  await manager.run();
  const rule = /local_target, also set acquired to one short string/;
  assert.match(tasks.investigation ?? "", rule, "the investigation protocol states the rule");
  assert.match(tasks.correction ?? "", rule, "the correction must state the same rule");
});

test("a failure after only a model call is retried, not escalated to operator recovery", async () => {
  const id = "capability-loop-model-only-effect";
  mission(id);
  let execs = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ strategy: "run", delegations: [delegation] }),
      executeSpecialist: async (config: any, missionId: string, options: any) => {
        execs++;
        options.beginEffect?.("model generate");
        if (execs === 1) throw new Error("provider returned an empty completion");
        const artifact = storage.saveArtifactFile(missionId, "deliverable.txt", "real bytes", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  // A paid model call cannot be replayed into a duplicated effect, so the
  // bounded re-run is legal. Escalating paused the run for an operator and
  // burned the whole execution budget in r2-final-acquisition-1794819588442.
  assert.equal(execs, 2, "the pre-effect model failure must be retried once");
  assert.notEqual(result.mission.status, "paused");
  assert.equal((result.mission.metadata.recovery_blocked as any)?.entries?.length ?? 0, 0);
});

test("a failure whose marks are read-only is retried instead of pausing", async () => {
  const id = "capability-loop-read-only-effect";
  mission(id);
  let execs = 0;
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    offlineFixture: true,
    deps: {
      planMission: async () => ({ strategy: "run", delegations: [delegation] }),
      executeSpecialist: async (config: any, missionId: string, options: any) => {
        execs++;
        options.beginEffect?.("model generate");
        options.beginEffect?.("tool:file_read");
        options.beginEffect?.("tool:file_list");
        if (execs === 1) throw new Error("analyst produced no artifact");
        const artifact = storage.saveArtifactFile(missionId, "deliverable.txt", "real bytes", "text");
        return success(config.role, [artifact.id]);
      },
      reviewMissionDetailed: passQa,
      resolveModelForRole: () => "offline",
    },
  }).run();
  // Reading cannot change state outside the mission, so a failed analyst whose
  // marks are model + reads is retryable (run 1794822546080 paused here).
  assert.equal(execs, 2, "a read-only failure must be re-run");
  assert.notEqual(result.mission.status, "paused");
});
