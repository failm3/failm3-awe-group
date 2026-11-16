#!/usr/bin/env npx tsx
/**
 * Two independent missions execute through the real MissionManager concurrently.
 * Planning, specialists, and QA are deterministic injected dependencies; artifact
 * bytes and all mission persistence are real. No provider or network is used.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { tempDir, baseMission, passedReview, passedGate } from "./helpers/r0-runtime-util.js";

test("concurrent missions overlap and finalize with independent artifact sets", async () => {
  const root = tempDir("r2-concurrent-missions-");
  const previousData = process.env.AWE_DATA_DIR;
  const previousOffline = process.env.AWE_OFFLINE_TEST;
  process.env.AWE_DATA_DIR = path.join(root, "data");
  process.env.AWE_OFFLINE_TEST = "1";

  try {
    const storage = await import("../utils/storage.js");
    const lifecycle = await import("../agents/lifecycle.js");
    const managerModule = await import("../agents/mission-manager.js");
    const { createApprovedSpecBinding } = await import("../utils/spec-binding.js");

    const missions = [
      { id: "eeeeeeee-0000-4000-8000-000000000001", role: "writer", content: "writer deliverable\n" },
      { id: "eeeeeeee-0000-4000-8000-000000000002", role: "analyst", content: "analyst deliverable\n" },
    ];
    for (const fixture of missions) {
      const pending = baseMission(fixture.id, {
        title: `${fixture.role} concurrent mission`,
        objective: `Produce the ${fixture.role} deliverable`,
        acceptance_criteria: [`Persist the ${fixture.role} deliverable`],
        status: "pending_approval",
        metadata: { specification: {
          title: `${fixture.role} concurrent mission`,
          objective: `Produce the ${fixture.role} deliverable`,
          scope: "Isolated offline concurrent lifecycle fixture",
          acceptance_criteria: [`Persist the ${fixture.role} deliverable`],
          suggested_tools: ["save_artifact"], suggested_agents: [fixture.role],
          estimated_complexity: "simple", risks: [],
        } },
      });
      storage.saveMission(pending as any);
      storage.saveMission({ ...pending, status: "approved", metadata: {
        ...pending.metadata, approved_spec_binding: createApprovedSpecBinding(pending as any),
      } } as any);
    }

    const started = new Set<string>();
    const active = new Set<string>();
    let maximumActive = 0;
    let releaseSpecialists!: () => void;
    const bothStarted = new Promise<void>((resolve) => {
      releaseSpecialists = resolve;
    });
    const calls = {
      plans: [] as string[],
      specialists: [] as string[],
      reviews: [] as string[],
    };

    const makeManager = (fixture: typeof missions[number]) => managerModule.createMissionManager(
      storage.loadMission(fixture.id)!,
      30_000,
      {
        offlineFixture: true,
        quiesceTimeoutMs: 1_500,
        timeoutGraceMs: 500,
        deps: {
          planMission: async (mission: { id: string }) => {
            calls.plans.push(mission.id);
            return {
              strategy: `single ${fixture.role}`,
              delegations: [{
                agent_role: fixture.role,
                task: `Write the ${fixture.role} deliverable`,
                context: "",
                tools: ["save_artifact"],
                expected_output: "A persisted deliverable",
                parallel: false,
              }],
            };
          },
          executeSpecialist: async (cfg: { role: string }, missionId: string, options) => {
            assert.equal(missionId, fixture.id);
            assert.equal(cfg.role, fixture.role);
            assert.equal(options?.signal?.aborted, false);
            calls.specialists.push(missionId);
            started.add(missionId);
            active.add(missionId);
            maximumActive = Math.max(maximumActive, active.size);
            if (started.size === missions.length) releaseSpecialists();
            await bothStarted;
            try {
              // Deliberately use the same filename: content, registry records, and
              // paths must remain attributed to this mission alone.
              const artifact = storage.saveArtifactFile(missionId, "deliverable.txt", fixture.content);
              return {
                role: fixture.role,
                output: `${fixture.role} saved`,
                artifacts: [artifact.id],
                success: true,
                tools_used: ["save_artifact"],
                model: "offline-deterministic-model",
              };
            } finally {
              active.delete(missionId);
            }
          },
          reviewMissionDetailed: async (mission: { id: string }) => {
            calls.reviews.push(mission.id);
            assert.equal(mission.id, fixture.id);
            return { review: passedReview(), gate: passedGate() } as any;
          },
          resolveModelForRole: () => "offline-deterministic-model",
        },
      },
    );

    const managers = missions.map(makeManager);
    const results = await Promise.all(managers.map((manager) => manager.run()));

    assert.equal(maximumActive, 2, "both real manager executions must be in their specialist phase simultaneously");
    assert.deepEqual(calls.plans.sort(), missions.map((mission) => mission.id).sort());
    assert.deepEqual(calls.specialists.sort(), missions.map((mission) => mission.id).sort());
    assert.deepEqual(calls.reviews.sort(), missions.map((mission) => mission.id).sort());

    const artifactIds = new Set<string>();
    for (const [index, fixture] of missions.entries()) {
      const result = results[index];
      assert.equal(result.mission.id, fixture.id);
      assert.equal(result.mission.status, "completed");
      const persisted = storage.loadMission(fixture.id)!;
      assert.equal(persisted.status, "completed");
      const artifacts = storage.listArtifacts(fixture.id);
      assert.equal(artifacts.length, 1);
      assert.equal(artifacts[0].name, "deliverable.txt");
      assert.equal(artifacts[0].mission_id, fixture.id);
      assert.equal(fs.readFileSync(artifacts[0].path!, "utf8"), fixture.content);
      assert.deepEqual(persisted.artifacts, [artifacts[0].id]);
      assert.equal(artifactIds.has(artifacts[0].id), false, "artifact IDs must not be shared between missions");
      artifactIds.add(artifacts[0].id);
      assert.equal(lifecycle.loadCheckpoint(fixture.id), null);
      assert.equal(lifecycle.hasLiveLease(fixture.id), false);
      assert.equal(managerModule.getActiveMissionManager(fixture.id), undefined);
    }

    const paths = missions.map((fixture) => storage.listArtifacts(fixture.id)[0].path!);
    assert.notEqual(paths[0], paths[1]);
    assert.equal(new Set(artifactIds).size, missions.length);
  } finally {
    if (previousData === undefined) delete process.env.AWE_DATA_DIR;
    else process.env.AWE_DATA_DIR = previousData;
    if (previousOffline === undefined) delete process.env.AWE_OFFLINE_TEST;
    else process.env.AWE_OFFLINE_TEST = previousOffline;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
