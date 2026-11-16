import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolveConfiguredMissionAdmission } from "../config/mission-policy.js";
import type { Mission } from "../types/index.js";

const mission: Mission = {
  id: randomUUID(), title: "Host policy composition", description: "offline", objective: "Resolve host policy",
  acceptance_criteria: ["Fail closed"], status: "approved", priority: "normal", artifacts: [],
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: {},
};

test("normal host composition requires explicit policy and cannot imply qualification", async () => {
  const old = process.env.AWE_MISSION_ADMISSION_MODULE;
  delete process.env.AWE_MISSION_ADMISSION_MODULE;
  try {
    assert.equal(await resolveConfiguredMissionAdmission(mission), undefined);
    const expected = { mode: "engineering-practice" as const, missionId: mission.id,
      specHash: "a".repeat(64), authorizeExecution: () => true };
    let seen: unknown;
    assert.equal(await resolveConfiguredMissionAdmission(mission, (received) => {
      seen = received;
      assert.equal(received.metadata, mission.metadata);
      return expected;
    }), expected);
    assert.equal(seen, mission, "the host resolver sees the exact approved mission");
    await assert.rejects(async () => resolveConfiguredMissionAdmission(mission,
      () => ({ mode: "product", authorizeExecution: () => true } as never)), /incomplete product policy/);
    await assert.rejects(async () => resolveConfiguredMissionAdmission(mission,
      () => ({ ...expected, missionId: "another-mission" })), /unbound practice policy/);
    assert.equal(await resolveConfiguredMissionAdmission(mission, () => undefined), undefined,
      "an explicit host resolver may still decline authorization");
    process.env.AWE_MISSION_ADMISSION_MODULE = "relative-policy.mjs";
    await assert.rejects(async () => resolveConfiguredMissionAdmission(mission), /absolute host-selected module path/);
  } finally {
    if (old === undefined) delete process.env.AWE_MISSION_ADMISSION_MODULE;
    else process.env.AWE_MISSION_ADMISSION_MODULE = old;
  }
});
