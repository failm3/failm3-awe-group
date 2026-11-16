#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import { baseMission, passedReview, passedGate } from "./helpers/r0-runtime-util.js";
import type { ManagerDeps } from "../agents/mission-manager.js";
import type { CapabilityAttempt } from "../agents/capability-plane.js";
import type { QualificationReceipt } from "../utils/qualification.js";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r2-qualified-local-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
globalThis.fetch = async () => { throw new Error("Network forbidden in qualified local capability tests"); };
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function () { throw new Error("Network forbidden in qualified local capability tests"); };
const storage = await import("../utils/storage.js");
const { shellTool } = await import("../tools/index.js");
const { runWithToolContext } = await import("../security/tool-context.js");
const { MissionManager } = await import("../agents/mission-manager.js");
const { createQualificationAuthority } = await import("../utils/qualification.js");
const { qualifyLocalTarget, qualifiedTargetCommand, listQualifiedInvocationReceipts } = await import("../utils/local-capability.js");
const { __setRecursionTestDeps, runDelegateCall } = await import("../agents/recursion.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../utils/spec-binding.js");
after(() => {
  net.Socket.prototype.connect = originalConnect;
  fs.rmSync(root, { recursive: true, force: true });
});

const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function makeMission(id: string, tools = ["shell", "save_artifact"]) {
  const objective = "Run a host-qualified local fixture and save its real output";
  const acceptance = "Deliver fixture output";
  const mission = baseMission(id, {
    title: "qualified local fixture", objective, acceptance_criteria: [acceptance],
    metadata: { specification: {
      title: "qualified local fixture", objective, scope: "local fixture only",
      acceptance_criteria: [acceptance], suggested_tools: tools,
      suggested_agents: ["executor"], estimated_complexity: "simple", risks: [],
    } },
  });
  mission.metadata.approved_spec_binding = createApprovedSpecBinding(mission);
  storage.saveMission(mission);
  return mission;
}

function makeHost(mission: ReturnType<typeof baseMission>) {
  const credential = {};
  const authority = createQualificationAuthority({
    issuers: [{ principal: "independent-reviewer", scopes: ["local-runtime"] }],
    authenticateIssuer: (value) => value === credential ? "independent-reviewer" : null,
    authorize: () => true,
  });
  const binding = {
    solverId: "local-runner", scope: "local-runtime", specHash: assertApprovedSpecBinding(mission).spec_hash,
    capabilityHash: "b".repeat(64), profileHash: "c".repeat(64),
  };
  const qualificationId = `q-${mission.id}`;
  const receipt: QualificationReceipt = {
    ...binding, qualificationId, receiptId: crypto.randomUUID(), issuer: "independent-reviewer",
    evidenceHash: "d".repeat(64), evidenceRefs: ["isolated:fixture-probe"],
    issuedAt: Date.now() - 100, expiresAt: Date.now() + 60_000,
  };
  authority.qualify(receipt, credential, 0);
  let targetAllowed = true;
  const admission = authority.admit(qualificationId, binding);
  const acquisition = (input: Parameters<typeof qualifyLocalTarget>[0]) => {
    return qualifyLocalTarget(input, {
      authority, admission,
      authorizeTarget: () => targetAllowed,
    });
  };
  return {
    authority, credential, qualificationId, acquisition,
    revoke: () => authority.revoke(qualificationId, 1, credential, "test revocation"),
    denyTarget: () => { targetAllowed = false; },
  };
}

const success = (role: string, artifact: { id: string }, extra = {}) => ({
  role, output: "real output persisted", artifacts: [artifact.id], success: true,
  tools_used: ["shell", "save_artifact"], model: "offline", ...extra,
});

interface Scenario {
  mode: "reuse" | "no-invoke" | "wrong-command" | "wrong-args" | "mutation" | "revoke" | "wrong-attempt";
  target?: string;
  output?: string;
  attempt?: CapabilityAttempt;
  probes?: string[];
  callbackInputs: number;
}

function fixtureTarget(id: string): { target: string; output: string } {
  const work = storage.prepareMissionWorkspace(id);
  const target = path.join(work, "qualified-fixture.cjs");
  const output = path.join(work, "fixture-output.txt");
  fs.writeFileSync(target, `require('node:fs').writeFileSync(process.argv[2], 'qualified invocation\\n');\n`);
  return { target, output };
}

function depsFor(scenario: Scenario): ManagerDeps {
  return {
    planMission: async (_mission, options) => {
      if (!options?.capabilityAttempt) return { status: "acquire", capability: "fixture-runtime", detail: "local fixture required" };
      const attempt = options.capabilityAttempt;
      scenario.attempt = attempt;
      assert.ok(attempt.qualified_target);
      const exact = qualifiedTargetCommand(attempt.qualified_target);
      const delegation = (task: string) => ({
        agent_role: "executor", task, context: `Use this exact qualified invocation: ${exact}`,
        tools: ["shell", "save_artifact"], expected_output: "real fixture output",
        parallel: false, uses_capability_attempt: attempt.attempt_id,
      });
      const plan = { strategy: "use qualified fixture", delegations: [delegation("first qualified invocation")] };
      if (["reuse", "mutation", "revoke"].includes(scenario.mode)) plan.delegations.push(delegation("second qualified invocation"));
      return plan;
    },
    executeSpecialist: async (config, missionId, options) => {
      const work = storage.prepareMissionWorkspace(missionId);
      if (config.task.includes("Investigate and acquire")) {
        const probe = storage.saveArtifactFile(missionId, "probe.json", JSON.stringify({ independentlyVerified: true }), "json");
        scenario.probes = [probe.id];
        const observation = storage.saveArtifactFile(missionId, "observation.json", JSON.stringify({
          capability: "fixture-runtime", status: "available", detail: "real persisted probe",
          acquired: "candidate-fixture",
          local_target: {
            runtime: "node",
            executable_path: scenario.target!, executable_sha256: sha256(scenario.target!),
            args: [scenario.output!], probe_artifacts: [{ artifact_id: probe.id, sha256: String(probe.metadata.sha256) }],
          },
        }), "json");
        return success(config.role, observation);
      }
      if (scenario.mode === "no-invoke") {
        const artifact = storage.saveArtifactFile(missionId, `${config.task}.json`, JSON.stringify({ claimOnly: true }), "json");
        return success(config.role, artifact, { qualified_attempt_ids: [scenario.attempt!.attempt_id] });
      }
      if (scenario.mode === "wrong-attempt") {
        const artifact = storage.saveArtifactFile(missionId, "forged.json", JSON.stringify({ forged: true }), "json");
        return success(config.role, artifact, { qualified_attempt_ids: ["another-attempt"] });
      }
      if (scenario.mode === "revoke" && config.task.startsWith("second")) {
        const host = hosts.get(missionId)!;
        host.revoke();
      }
      if (scenario.mode === "mutation" && config.task.startsWith("second")) {
        fs.appendFileSync(scenario.target!, "// mutation after qualification\n");
      }
      let command = options!.localCapability!.command;
      if (scenario.mode === "wrong-command") command = `printf ordinary > '${scenario.output!}'`;
      if (scenario.mode === "wrong-args") command += " 'unexpected'";
      const shell = await runWithToolContext({
        missionId, workspaceRoot: work, allowedTools: new Set(["shell"]),
        withEffect: options!.withEffect, fence: options!.fence, signal: options!.signal,
        localCapability: options!.localCapability, qualifiedAttemptIds: options!.qualifiedAttemptIds,
      }, () => shellTool.execute!({ command, cwd: work, timeout_ms: 10_000 } as never, {} as never)) as { success: boolean; stderr: string };
      if (!shell.success) throw new Error(shell.stderr);
      const artifact = storage.saveArtifactFile(missionId, `${config.task}.txt`, fs.readFileSync(scenario.output!, "utf8"), "text");
      return success(config.role, artifact);
    },
    reviewMissionDetailed: async () => ({ review: passedReview(), gate: passedGate() }),
    resolveModelForRole: () => "offline",
  };
}

const hosts = new Map<string, ReturnType<typeof makeHost>>();

async function runScenario(id: string, mode: Scenario["mode"]) {
  const mission = makeMission(id);
  const fixture = fixtureTarget(id);
  const scenario: Scenario = { mode, ...fixture, callbackInputs: 0 };
  const host = makeHost(mission);
  hosts.set(id, host);
  const acquisition: typeof host.acquisition = (input) => { scenario.callbackInputs++; return host.acquisition(input); };
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    acquisition, deps: depsFor(scenario), quiesceTimeoutMs: 1_000,
  }).run();
  return { result, scenario, host };
}

test("independent qualification and real shell invocation produce receipts and same-mission reuse", async () => {
  const { result, scenario } = await runScenario("qualified-local-positive", "reuse");
  assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata.qualification_blocked ?? result.mission.metadata.qa_gate));
  assert.equal(scenario.callbackInputs >= 3, true, "acquisition plus each delegation requalifies through host policy");
  assert.equal(fs.readFileSync(scenario.output!, "utf8"), "qualified invocation\n");
  const receipts = listQualifiedInvocationReceipts(result.mission.id);
  assert.equal(receipts.length, 2);
  assert.equal(new Set(receipts.map((receipt) => receipt.attempt_id)).size, 1);
  assert.equal(new Set(receipts.map((receipt) => receipt.delegation_id)).size, 2);
  assert.equal(receipts.every((receipt) => receipt.executable_sha256 === sha256(scenario.target!)), true);
  assert.deepEqual((result.mission.metadata.execution as any).delegations.map((entry: any) => entry.qualified_attempt_ids),
    [[scenario.attempt!.attempt_id], [scenario.attempt!.attempt_id]]);
});

test("structured acquisition fails closed without host acquisition policy", async () => {
  const id = "qualified-local-no-policy";
  const mission = makeMission(id);
  const fixture = fixtureTarget(id);
  const scenario: Scenario = { mode: "no-invoke", ...fixture, callbackInputs: 0 };
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    deps: depsFor(scenario), quiesceTimeoutMs: 1_000,
  }).run();
  assert.equal(result.mission.status, "failed");
  assert.match(JSON.stringify(result.mission.metadata.qa_gate), /without trusted host acquisition policy/);
  assert.equal(listQualifiedInvocationReceipts(id).length, 0);
  assert.equal(fs.existsSync(scenario.output!), false);
});

test("claimed delegation cannot succeed from a forged specialist claim without an actual invocation", async () => {
  const { result } = await runScenario("qualified-local-no-invocation", "no-invoke");
  assert.notEqual(result.mission.status, "completed");
  assert.equal(listQualifiedInvocationReceipts(result.mission.id).length, 0);
  assert.equal(fs.existsSync(storage.prepareMissionWorkspace(result.mission.id) + "/fixture-output.txt"), false);
});

for (const mode of ["wrong-command", "wrong-args"] as const) {
  test(`qualified invocation rejects ${mode} without executing it`, async () => {
    const { result, scenario } = await runScenario(`qualified-local-${mode}`, mode);
    assert.notEqual(result.mission.status, "completed");
    assert.equal(listQualifiedInvocationReceipts(result.mission.id).length, 0);
    assert.equal(fs.existsSync(scenario.output!), false);
  });
}

test("same-mission reuse fails closed after executable hash mutation", async () => {
  const { result, scenario } = await runScenario("qualified-local-mutation", "mutation");
  assert.notEqual(result.mission.status, "completed");
  const receipts = listQualifiedInvocationReceipts(result.mission.id);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].executable_sha256 !== sha256(scenario.target!), true);
});

test("same-mission reuse fails closed after independent qualification revocation", async () => {
  const { result } = await runScenario("qualified-local-revocation", "revoke");
  assert.notEqual(result.mission.status, "completed");
  assert.equal(listQualifiedInvocationReceipts(result.mission.id).length, 1);
});

test("wrong attempt identity cannot be satisfied by specialist output", async () => {
  const { result } = await runScenario("qualified-local-wrong-attempt", "wrong-attempt");
  assert.notEqual(result.mission.status, "completed");
  assert.equal(listQualifiedInvocationReceipts(result.mission.id).length, 0);
});

test("trusted gate and shared receipt identity reach recursive specialists", async () => {
  const id = "qualified-local-recursive-gate";
  makeMission(id);
  const gate = { attemptId: "qualified-attempt", command: "node -- '/qualified.cjs'", authorizeAndRelease: () => undefined };
  const qualifiedAttemptIds = new Map<string, string>();
  try {
    __setRecursionTestDeps({
      resolveModelForRole: () => "offline",
      executeSpecialist: async (_config, _missionId, options) => {
        assert.equal(options?.localCapability, gate);
        assert.equal(options?.qualifiedAttemptIds, qualifiedAttemptIds);
        return { role: "child", output: "propagated", artifacts: [], success: true, tools_used: [], qualified_attempt_ids: [] };
      },
    });
    const result = await runDelegateCall(id, null, 0,
      { role: "child", task: "Exercise trusted recursive propagation", tools: [] },
      { allowedTools: new Set(), localCapability: gate, qualifiedAttemptIds });
    assert.equal(result.success, true, result.errors.join("; "));
  } finally {
    __setRecursionTestDeps(null);
  }
});

test("ordinary shell behavior remains unchanged when no target is claimed", async () => {
  const id = "qualified-local-ordinary-shell";
  const work = storage.prepareMissionWorkspace(id);
  const result = await runWithToolContext({ missionId: id, workspaceRoot: work, allowedTools: new Set(["shell"]) },
    () => shellTool.execute!({ command: "printf ordinary > ordinary.txt", cwd: work, timeout_ms: 10_000 } as never, {} as never)) as { success: boolean; stderr: string };
  assert.equal(result.success, true, result.stderr);
  assert.equal(fs.readFileSync(path.join(work, "ordinary.txt"), "utf8"), "ordinary");
  assert.equal(listQualifiedInvocationReceipts(id).length, 0);
});

test("qualified executable is immutable to file_write and shell, and mutation is detected", async () => {
  const { fileWriteTool } = await import("../tools/index.js");
  const { registerQualifiedExecutables, qualifiedExecutableDefects } = await import("../utils/local-capability.js");
  const id = "qualified-local-immutable";
  const { target } = fixtureTarget(id);
  const original = fs.readFileSync(target);
  const work = path.dirname(target);
  registerQualifiedExecutables(id, [fs.realpathSync(target)]);
  const context = { missionId: id, workspaceRoot: work, allowedTools: new Set(["shell", "file_write"]) };

  const write = await runWithToolContext(context, () =>
    fileWriteTool.execute!({ path: target, content: "tampered" } as never, {} as never)) as { success?: boolean; error?: string };
  assert.notEqual(write.success, true, "file_write to a qualified executable must be refused");

  const shell = await runWithToolContext(context, () =>
    shellTool.execute!({ command: `printf tampered > '${fs.realpathSync(target)}'`, cwd: work, timeout_ms: 10_000 } as never, {} as never)) as { success: boolean };
  assert.equal(shell.success, false, "shell naming a qualified executable must be refused");
  assert.deepEqual(fs.readFileSync(target), original);

  const unrelated = await runWithToolContext(context, () =>
    fileWriteTool.execute!({ path: path.join(work, "deliverable.txt"), content: "ok" } as never, {} as never)) as { success?: boolean };
  assert.notEqual(unrelated.success, false, "ordinary deliverables stay writable");

  const attempt = { qualified_target: { executable_path: fs.realpathSync(target), executable_sha256: sha256(target) } } as unknown as CapabilityAttempt;
  assert.deepEqual(qualifiedExecutableDefects([attempt]), []);
  fs.writeFileSync(target, "out-of-band mutation");
  assert.equal(qualifiedExecutableDefects([attempt]).length, 1);
  registerQualifiedExecutables(id, []);
});
