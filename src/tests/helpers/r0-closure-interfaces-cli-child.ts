import { runEntryPoint } from "../../index.js";
import type { CliDependencies } from "../../index.js";

// This file deliberately has no static storage/lifecycle/memory import. The only
// runtime import is the entry point, whose production env bootstrap precedes all of them.
let specificationCalls = 0;
let managerFactoryCalls = 0;
let managerRunCalls = 0;
let recoveryCalls = 0;
let admissionPolicyCalls = 0;
let experiencePolicyCalls = 0;
const experienceMissionIds: string[] = [];
const experienceOptions: unknown[] = [];
const admissionMissionIds: string[] = [];
const recoveryDecisions: Array<{ decision: string; artifacts?: string[] }> = [];
const allowedStatuses: string[][] = [];

const deps: CliDependencies = {
  isInteractive: () => process.env.R0_TEST_INTERACTIVE === "1",
  confirm: async () => process.env.R0_TEST_ANSWER ?? "n",
  createSpecification: async () => {
    specificationCalls++;
    return {
      title: "offline closure interface fixture",
      objective: "exercise approval without a provider",
      scope: "isolated local fixture",
      acceptance_criteria: ["Persist the correct approval state"],
      suggested_tools: [],
      suggested_agents: [],
      estimated_complexity: "trivial",
      risks: [],
    };
  },
  createMissionManager: (mission, _timeout, options) => {
    managerFactoryCalls++;
    allowedStatuses.push([...(options?.allowedStatuses ?? [])]);
    experienceOptions.push(options?.experience);
    return {
      run: async () => {
        managerRunCalls++;
        return {
          mission,
          review: {
            passed: true,
            score: 10,
            criteria_results: [{ criterion: mission.acceptance_criteria[0], passed: true, notes: "injected" }],
            defects: [],
            recommendations: [],
            verdict: "PASS",
          },
        };
      },
    };
  },
  resolveMissionAdmission: (mission) => {
    admissionPolicyCalls++;
    admissionMissionIds.push(mission.id);
    return {
      mode: "engineering-practice", missionId: mission.id, specHash: "a".repeat(64),
      authorizeExecution: () => true,
    };
  },
  resolveMissionExperience: (mission) => {
    experiencePolicyCalls++;
    experienceMissionIds.push(mission.id);
    if (process.env.R0_TEST_EXPERIENCE !== "1") return undefined;
    return {
      selection: { scope: "host-selected", capabilityHash: "b".repeat(64), profileHash: "c".repeat(64) },
      authority: { inspect: () => null, admit: () => { throw new Error("not executed by interface test"); } } as never,
      authorizeTarget: () => true,
    };
  },
  resolveAmbiguousDelegation: (missionId, resolution) => {
    recoveryCalls++;
    recoveryDecisions.push({ decision: resolution.decision, artifacts: resolution.artifacts });
    const now = new Date().toISOString();
    return {
      remaining: 0,
      mission: {
        id: missionId,
        title: "recovery seam",
        description: "offline",
        objective: "offline",
        acceptance_criteria: ["resolve explicitly"],
        status: "paused",
        priority: "normal",
        created_at: now,
        updated_at: now,
        artifacts: [],
        metadata: {},
      },
    };
  },
  installTerminationHandlers: () => () => undefined,
};

const args = process.argv.slice(2);
const exitCode = await runEntryPoint(["node", "awe-group", ...args], deps);

const storage = await import("../../utils/storage.js");
const lifecycle = await import("../../agents/lifecycle.js");
const memory = await import("../../memory/index.js");
const checkpointFile = lifecycle.saveCheckpoint({
  mission_id: "r0-env-lifecycle-probe",
  version: 1,
  saved_at: new Date().toISOString(),
  timeout_ms: 1000,
  elapsed_ms: 0,
  completed: [],
  in_flight: [],
  repair_iterations: 0,
  reason: "manual",
});
const missions = storage.listMissions();
const credential = process.env.ROUTER_CHEAP_API_KEY;

console.log("R0_CLOSURE_INTERFACES_RESULT " + JSON.stringify({
  exitCode,
  specificationCalls,
  managerFactoryCalls,
  managerRunCalls,
  admissionPolicyCalls,
  admissionMissionIds,
  experiencePolicyCalls,
  experienceMissionIds,
  experienceOptions: experienceOptions.map(value => value ? { scope: (value as { selection: { scope: string } }).selection.scope } : null),
  recoveryCalls,
  recoveryDecisions,
  allowedStatuses,
  missions: missions.map((mission) => ({ id: mission.id, status: mission.status })),
  dataDir: storage.DATA_DIR,
  memoryDbPath: memory.MEMORY_DB_PATH,
  checkpointFile,
  cwd: process.cwd(),
  // Report only the source, never a credential value.
  credentialSource: credential === "nox-runtime-marker" ? "dedicated-runtime" : credential ? "other" : "absent",
}));
process.exitCode = exitCode;
