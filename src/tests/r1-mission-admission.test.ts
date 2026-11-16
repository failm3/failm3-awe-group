import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { Mission, MissionExecutionSummary, Specification } from "../types/index.js";
import type { ManagerDeps, MissionManagerOptions } from "../agents/mission-manager.js";
import type { MissionAdmissionPolicy, SynchronousMissionEffect } from "../utils/mission-admission.js";
import type { QualificationReceipt } from "../utils/qualification.js";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r1-mission-admission-test-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
// Exercise the production admission path even with injected model implementations.
delete process.env.AWE_OFFLINE_TEST;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network forbidden in mission admission tests"); };
const storage = await import("../utils/storage.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../utils/spec-binding.js");
const { createQualificationAuthority } = await import("../utils/qualification.js");
const { prepareMissionAdmission, MISSION_ADMISSION_KEY } = await import("../utils/mission-admission.js");
const { MissionManager } = await import("../agents/mission-manager.js");
const lifecycle = await import("../agents/lifecycle.js");
const { passedReview, passedGate } = await import("./helpers/r0-runtime-util.js");
after(() => { globalThis.fetch = originalFetch; fs.rmSync(root, { recursive: true, force: true }); });

function mission(): Mission {
  const spec: Specification = {
    title: "Offline professional work", objective: "Write an evidence artifact", scope: "Local isolated fixtures only",
    acceptance_criteria: ["Result exists"], suggested_tools: ["save_artifact"], suggested_agents: ["writer"],
    estimated_complexity: "simple", risks: [],
  };
  const m: Mission = {
    id: randomUUID(), title: spec.title, description: "An approved offline task", objective: spec.objective,
    acceptance_criteria: spec.acceptance_criteria, status: "approved", priority: "normal",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), artifacts: [], metadata: { specification: spec },
  };
  m.metadata.approved_spec_binding = createApprovedSpecBinding(m);
  storage.saveMission(m);
  return m;
}

function qualified(m: Mission) {
  const credential = {};
  const authority = createQualificationAuthority({
    issuers: [{ principal: "independent-reviewer", scopes: ["writing"] }],
    authenticateIssuer: (value) => value === credential ? "independent-reviewer" : null,
    authorize: () => true,
  });
  const binding = { solverId: "professional-writer", scope: "writing", specHash: assertApprovedSpecBinding(m).spec_hash,
    capabilityHash: "b".repeat(64), profileHash: "c".repeat(64) };
  const receipt: QualificationReceipt = {
    ...binding, qualificationId: `q-${m.id}`, receiptId: randomUUID(), issuer: "independent-reviewer",
    evidenceHash: "d".repeat(64), evidenceRefs: ["isolated:independent-review"], issuedAt: Date.now() - 100,
    expiresAt: Date.now() + 60_000,
  };
  authority.qualify(receipt, credential, 0);
  const policy: MissionAdmissionPolicy = {
    mode: "product", authority, requirements: () => [{ qualificationId: receipt.qualificationId, binding }],
    authorizeExecution: () => true,
  };
  const revoke = () => authority.revoke(receipt.qualificationId, 1, credential, "bad private control");
  return { authority, credential, binding, receipt, policy, revoke };
}

const delegation = { agent_role: "writer", task: "Write evidence", context: "", tools: ["save_artifact"], expected_output: "Artifact", parallel: false };
function deps(overrides: Partial<ManagerDeps> = {}): ManagerDeps {
  return {
    planMission: async () => ({ strategy: "local", delegations: [delegation] }),
    executeSpecialist: async (config, mid, options) => {
      const withEffect = (options as typeof options & { withEffect: SynchronousMissionEffect }).withEffect;
      options?.beginEffect?.("save_artifact");
      const artifact = withEffect(() => storage.saveArtifactFile(mid, "result.txt", "independently inspected", "text"),
        { stage: "effect", role: config.role, tools: ["save_artifact"] });
      return { role: config.role, output: "Written", artifacts: [artifact.id], success: true, tools_used: ["save_artifact"], model: "offline" };
    },
    reviewMissionDetailed: async () => ({ review: passedReview(), gate: passedGate() }),
    resolveModelForRole: () => "offline",
    ...overrides,
  };
}
function run(m: Mission, admission?: MissionAdmissionPolicy, injected = deps(), extra: Partial<MissionManagerOptions> = {}) {
  return new MissionManager(m, 10_000, { admission, deps: injected, quiesceTimeoutMs: 100, ...extra });
}

test("production missing host policy and missing/unknown receipts fail before Head, even with injected agents", async () => {
  let calls = 0;
  const injected = deps({ planMission: async () => { calls++; throw new Error("must not plan"); } });
  const m = mission();
  const denied = await run(m, undefined, injected).run();
  assert.equal(denied.mission.status, "paused");
  assert.match(JSON.stringify(denied.mission.metadata.qualification_blocked), /trusted host/);
  assert.equal(calls, 0);
  for (const kind of ["missing", "unknown"] as const) {
    const next = mission();
    const q = qualified(next);
    q.policy.requirements = kind === "unknown" ? () => [] : () => [{ qualificationId: "absent", binding: q.binding }];
    assert.equal((await run(next, q.policy, injected).run()).mission.status, "paused");
  }
  assert.equal(calls, 0);
});

test("qualified manager produces real artifact and immutable generation-bound provenance", async () => {
  const m = mission();
  const q = qualified(m);
  const result = await run(m, q.policy).run();
  assert.equal(result.mission.status, "completed");
  const record = result.mission.metadata[MISSION_ADMISSION_KEY] as { admissions: Array<{ generation: number }> };
  assert.equal(record.admissions[0].generation, 1);
  assert.equal(fs.readFileSync(storage.listArtifacts(m.id)[0].path!, "utf8"), "independently inspected");
  assert.equal(lifecycle.loadCheckpoint(m.id), null);
});

test("unreported first-delegation usage remains UNKNOWN", async () => {
  const m = mission();
  const q = qualified(m);
  let calls = 0;
  const result = await run(m, q.policy, deps({
    planMission: async () => ({ strategy: "local", delegations: [delegation, { ...delegation, task: "Write second evidence" }] }),
    executeSpecialist: async (config, mid, options) => {
      const call = calls++;
      const withEffect = (options as typeof options & { withEffect: SynchronousMissionEffect }).withEffect;
      options?.beginEffect?.("save_artifact");
      const artifact = withEffect(() => storage.saveArtifactFile(mid, `result-${call}.txt`, "independently inspected", "text"),
        { stage: "effect", role: config.role, tools: ["save_artifact"] });
      return { role: config.role, output: "Written", artifacts: [artifact.id], success: true,
        tools_used: ["save_artifact"], model: "offline",
        ...(call === 0 ? {} : { usage: { input_tokens: 4, output_tokens: 3, total_tokens: 7,
          reasoning_tokens: 1, cached_input_tokens: 2 } }) };
    },
  })).run();
  assert.equal(result.mission.status, "completed");
  const summary = result.mission.metadata.execution as MissionExecutionSummary;
  assert.equal(summary.delegations.length, 2);
  for (const total of Object.values(summary.totals)) assert.equal(total, "UNKNOWN");
});

test("model metadata cannot select engineering practice; host practice is bound and cannot become product on restart", async () => {
  const m = mission();
  m.metadata.execution_mode = "engineering-practice";
  storage.saveMission(m);
  assert.equal((await run(m).run()).mission.status, "paused");
  const fresh = mission();
  const practice: MissionAdmissionPolicy = { mode: "engineering-practice", missionId: fresh.id,
    specHash: assertApprovedSpecBinding(fresh).spec_hash, authorizeExecution: () => true };
  assert.throws(() => prepareMissionAdmission(m, practice, { recovering: false }), /not bound/);
  assert.equal((await run(fresh, practice).run()).mission.status, "completed");
  const q = qualified(fresh);
  assert.throws(() => prepareMissionAdmission(storage.loadMission(fresh.id)!, q.policy, { recovering: true }), /purpose/);
});

test("bounded repair receives the immutable scope, original task location and accepted deliverables", async () => {
  const m = mission();
  const q = qualified(m);
  let reviews = 0;
  let repairTask = "";
  const injected = deps({
    executeSpecialist: async (config, mid, options) => {
      if (config.task.startsWith("Fix the following defects")) repairTask = config.task;
      const effectCallback = (options as typeof options & { withEffect: SynchronousMissionEffect }).withEffect;
      options?.beginEffect?.("save_artifact");
      const artifact = effectCallback(() => storage.saveArtifactFile(mid, repairTask ? "repair.txt" : "result.txt", "inspected bytes", "text"),
        { stage: "effect", role: config.role, tools: ["save_artifact"] });
      return { role: config.role, output: "Written", artifacts: [artifact.id], success: true, tools_used: ["save_artifact"], model: "offline" };
    },
    reviewMissionDetailed: async () => reviews++ === 0
      ? { review: { ...passedReview(), passed: false }, gate: { ...passedGate(), passed: false, blockers: ["Wrong delivery path"] } }
      : { review: passedReview(), gate: passedGate() },
  });
  const result = await run(m, q.policy, injected).run();
  assert.equal(result.mission.status, "completed");
  assert.ok(repairTask.includes(m.description));
  assert.ok(repairTask.includes((m.metadata.specification as Specification).scope));
  assert.ok(repairTask.includes(assertApprovedSpecBinding(m).spec_hash));
  assert.ok(repairTask.includes(delegation.expected_output));
  assert.ok(repairTask.includes("Do not create substitute deliverables in a different directory"));
});

test("revocation during Head prevents initial delegation and preserves checkpoint", async () => {
  const m = mission();
  const q = qualified(m);
  let effects = 0;
  const result = await run(m, q.policy, deps({
    planMission: async () => { q.revoke(); return { strategy: "local", delegations: [delegation] }; },
    executeSpecialist: async () => { effects++; throw new Error("must not execute"); },
  })).run();
  assert.equal(result.mission.status, "paused");
  assert.equal(effects, 0);
  assert.ok(lifecycle.loadCheckpoint(m.id));
});

test("revocation blocks repeated beginEffect and recursive/local effect callbacks while runtime is active", async () => {
  const m = mission();
  const q = qualified(m);
  let effects = 0;
  const result = await run(m, q.policy, deps({ executeSpecialist: async (_config, _id, options) => {
    options?.beginEffect?.("first remote dispatch intent");
    q.revoke();
    assert.equal(options?.fence?.(), false);
    assert.throws(() => options?.beginEffect?.("second remote dispatch"), /revoked/);
    const withEffect = (options as { withEffect: SynchronousMissionEffect }).withEffect;
    assert.throws(() => withEffect(() => ++effects, { stage: "effect", role: "child", tools: ["save_artifact"] }), /revoked/);
    return { role: "writer", output: "", artifacts: [], success: false, tools_used: [] };
  } })).run();
  assert.equal(result.mission.status, "paused");
  assert.equal(effects, 0);
  assert.equal(lifecycle.loadCheckpoint(m.id)?.in_flight?.length, 1);
  assert.equal(lifecycle.hasLiveLease(m.id), false);
});

test("revocation monitor aborts idle active runtime and retains ownership until pending effects settle", async () => {
  const m = mission();
  const q = qualified(m);
  let resolveWork!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  const pending = new Promise<void>((resolve) => { resolveWork = resolve; });
  const manager = run(m, q.policy, deps({ executeSpecialist: async (_config, _id, options) => {
    options?.beginEffect?.("unsettled external dispatch");
    started();
    await pending; // Deliberately uncooperative: abort cannot establish quiescence.
    return { role: "writer", output: "", artifacts: [], success: false, tools_used: [] };
  } }));
  const running = manager.run();
  await ready;
  q.revoke();
  const result = await running;
  assert.equal(manager.signal.aborted, true);
  assert.equal(result.mission.status, "running");
  assert.equal(lifecycle.hasLiveLease(m.id), true);
  resolveWork();
  for (let i = 0; i < 100 && lifecycle.hasLiveLease(m.id); i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(lifecycle.hasLiveLease(m.id), false);
  assert.equal(storage.loadMission(m.id)?.status, "paused");
  assert.equal(lifecycle.loadCheckpoint(m.id)?.in_flight?.length, 1);
});

test("QA-triggered repair preserves the host experience policy and dispatch fence", async () => {
  const m = mission();
  const q = qualified(m);
  const base = deps();
  const experience: NonNullable<MissionManagerOptions["experience"]> = {
    selection: { scope: "writing", capabilityHash: "b".repeat(64), profileHash: "c".repeat(64) },
    authority: q.authority,
    authorizeTarget: () => true,
  };
  const seen: Array<MissionManagerOptions["experience"] | undefined> = [];
  let reviews = 0;
  const result = await run(m, q.policy, deps({
    executeSpecialist: async (config, mid, options) => {
      seen.push(options?.experience);
      if (seen.length === 1) return base.executeSpecialist(config, mid, options);
      const withEffect = (options as typeof options & { withEffect: SynchronousMissionEffect }).withEffect;
      const artifact = withEffect(() => storage.saveArtifactFile(mid, "repaired.txt", "independently reinspected", "text"),
        { stage: "effect", role: config.role, tools: ["save_artifact"] });
      return { role: config.role, output: "Repaired", artifacts: [artifact.id], success: true, tools_used: ["save_artifact"], model: "offline" };
    },
    reviewMissionDetailed: async () => reviews++ === 0
      ? { review: { ...passedReview(), passed: false, defects: [{ issue: "Correction required", severity: "major" }] }, gate: passedGate() }
      : { review: passedReview(), gate: passedGate() },
  }), { experience }).run();
  assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata.execution));
  assert.equal(seen.length, 2);
  assert.equal(seen[0], experience);
  assert.equal(seen[1], experience, "repair and its recursive descendants retain trusted host experience composition");
});

test("revocation during independent QA blocks final acceptance and repair", async () => {
  for (const passed of [true, false]) {
    const m = mission();
    const q = qualified(m);
    let executions = 0;
    const base = deps();
    const result = await run(m, q.policy, deps({
      executeSpecialist: async (...args) => { executions++; return base.executeSpecialist(...args); },
      reviewMissionDetailed: async () => { q.revoke(); return { review: { ...passedReview(), passed }, gate: passedGate() }; },
    })).run();
    assert.equal(result.mission.status, "paused");
    assert.equal(executions, 1);
    assert.ok(lifecycle.loadCheckpoint(m.id));
  }
});

test("host scope policy separately rejects unknown roles, repair, and final acceptance", async () => {
  for (const stage of ["delegation", "repair", "acceptance"] as const) {
    const m = mission();
    const q = qualified(m);
    q.policy.authorizeExecution = (_mission, target) => target.stage !== stage;
    let executions = 0;
    const base = deps();
    const result = await run(m, q.policy, deps({
      executeSpecialist: async (...args) => { executions++; return base.executeSpecialist(...args); },
      reviewMissionDetailed: async () => ({ review: { ...passedReview(), passed: stage !== "repair" }, gate: passedGate() }),
    })).run();
    assert.equal(result.mission.status, "paused");
    assert.equal(executions, stage === "delegation" ? 0 : 1);
  }
});

test("restart in a separate process rejects revoked and requalified old admissions without replacing evidence", async () => {
  const m = mission();
  const q = qualified(m);
  await run(m, q.policy, deps({ planMission: async () => { q.revoke(); return { strategy: "local", delegations: [delegation] }; } })).run();
  const checkpointBefore = fs.readFileSync(path.join(process.env.AWE_DATA_DIR!, "checkpoints", `${m.id}.json`), "utf8");
  const recordBefore = JSON.stringify(storage.loadMission(m.id)!.metadata[MISSION_ADMISSION_KEY]);
  for (const requalified of [false, true]) {
    if (requalified) q.authority.qualify({ ...q.receipt, receiptId: randomUUID(), issuedAt: Date.now() }, q.credential, 2);
    const script = `
      import assert from 'node:assert/strict';
      const {loadMission} = await import('./src/utils/storage.ts');
      const {MissionManager} = await import('./src/agents/mission-manager.ts');
      const {createQualificationAuthority} = await import('./src/utils/qualification.ts');
      const authority = createQualificationAuthority({issuers:[{principal:'independent-reviewer',scopes:['writing']}],authenticateIssuer:()=>null,authorize:()=>true});
      const admission = {mode:'product',authority,requirements:()=>${JSON.stringify([{ qualificationId: q.receipt.qualificationId, binding: q.binding }])},authorizeExecution:()=>true};
      const fail = async()=>{throw new Error('restart must not dispatch')};
      const deps = {planMission:fail,executeSpecialist:fail,reviewMissionDetailed:fail,resolveModelForRole:()=> 'offline'};
      const result = await new MissionManager(loadMission('${m.id}'),1000,{admission,deps}).run();
      assert.equal(result.mission.status,'paused');
      assert.match(JSON.stringify(result.mission.metadata.qualification_blocked),/${requalified ? "stale" : "revoked"}/);
    `;
    const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
      cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 15_000,
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.stringify(storage.loadMission(m.id)!.metadata[MISSION_ADMISSION_KEY]), recordBefore);
    assert.equal(fs.readFileSync(path.join(process.env.AWE_DATA_DIR!, "checkpoints", `${m.id}.json`), "utf8"), checkpointBefore);
    assert.equal(q.authority.inspect(q.receipt.qualificationId)?.admissions.length, 1);
  }
});

test("legacy checkpoint remains inspectable and byte-preserved, never retroactively qualified", async () => {
  const m = mission();
  const q = qualified(m);
  lifecycle.saveCheckpoint({ mission_id: m.id, approved_spec_hash: q.binding.specHash, version: 1,
    saved_at: new Date().toISOString(), timeout_ms: 1000, elapsed_ms: 10, completed: [], repair_iterations: 0, reason: "manual" });
  const filename = path.join(process.env.AWE_DATA_DIR!, "checkpoints", `${m.id}.json`);
  const bytes = fs.readFileSync(filename, "utf8");
  const result = await run(m, q.policy).run();
  assert.equal(result.mission.status, "paused");
  assert.match(JSON.stringify(result.mission.metadata.qualification_blocked), /legacy execution/);
  assert.equal(fs.readFileSync(filename, "utf8"), bytes);
  assert.equal(q.authority.inspect(q.receipt.qualificationId)?.admissions.length, 0);
});

test("async effect callbacks are refused before execution and explicit full offline fixtures remain available", async () => {
  const m = mission();
  const q = qualified(m);
  const prepared = prepareMissionAdmission(m, q.policy, { recovering: false });
  let calls = 0;
  assert.throws(() => prepared.withEffect((async () => { calls++; }) as never), /synchronous/);
  assert.equal(calls, 0);
  const offline = mission();
  assert.equal((await run(offline, undefined, deps(), { offlineFixture: true }).run()).mission.status, "completed");
});

test("actual production file and artifact tools enforce the propagated admission fence", async () => {
  const m = mission();
  const q = qualified(m);
  let secondAttemptDenied = false;
  const result = await run(m, q.policy, deps({
    executeSpecialist: async (_config, mid, options) => {
      const { allTools } = await import("../tools/index.js");
      const { runWithToolContext, getToolContext } = await import("../security/tool-context.js");
      const execute = (tool: { execute?: any }, input: unknown) =>
        Promise.resolve(tool.execute?.(input, {})) as Promise<{ success: boolean }>;
      const grant = storage.prepareMissionWorkspace(mid);
      return runWithToolContext({
        missionId: mid, workspaceRoot: grant, allowedTools: new Set(["file_write", "save_artifact"]),
        signal: options?.signal, fence: options?.fence,
        withEffect: (options as { withEffect?: SynchronousMissionEffect }).withEffect,
      }, async () => {
        const first = await execute(allTools.file_write, { path: path.join(grant, "owned.txt"), content: "first" });
        assert.equal(first.success, true, JSON.stringify(first));
        q.revoke();
        assert.equal(getToolContext()?.fence?.(), false);
        const denied = await execute(allTools.file_write, { path: path.join(grant, "denied.txt"), content: "late" });
        const artifact = await execute(allTools.save_artifact, { mission_id: mid, name: "denied.txt", content: "late" });
        assert.equal(denied.success, false); assert.equal(artifact.success, false);
        assert.equal(fs.existsSync(path.join(grant, "denied.txt")), false);
        assert.equal(storage.listArtifacts(mid).length, 0);
        secondAttemptDenied = true;
        return { role: "writer", output: "", artifacts: [], success: false, tools_used: ["file_write"] };
      });
    },
  })).run();
  assert.equal(secondAttemptDenied, true);
  assert.equal(result.mission.status, "paused");
});

test("real recursive adapter authorizes every child role/tool across durable reservation", async () => {
  const m = mission();
  const q = qualified(m);
  let denied = true;
  const seen: Array<{ role?: string; tools?: readonly string[]; stage: string; label?: string }> = [];
  q.policy.authorizeExecution = (_mission, target) => {
    seen.push({ role: target.role, tools: target.tools, stage: target.stage, label: target.label });
    return !denied || target.role !== "unprofiled-child";
  };
  const admission = prepareMissionAdmission(m, q.policy, { recovering: false });
  const recursion = await import("../agents/recursion.js");
  let calls = 0;
  recursion.__setRecursionTestDeps({
    resolveModelForRole: () => "offline",
    executeSpecialist: async (config, _mid, options) => {
      calls++;
      options?.withEffect?.(() => undefined, {
        stage: "delegation", role: config.role, tools: config.tools, label: "model generate",
      });
      return { role: config.role, output: "offline", artifacts: [], success: true, tools_used: config.tools, model: "offline" };
    },
  });
  try {
    const request = { children: [
      { role: "writer", task: "allowed child", tools: ["save_artifact"] },
      { role: "unprofiled-child", task: "denied child", tools: ["save_artifact"] },
    ] };
    await assert.rejects(recursion.runDelegateCall(m.id, null, 0, request, {
      allowedTools: new Set(["delegate", "save_artifact"]), withEffect: admission.withEffect,
    }), /host execution scope policy/);
    assert.equal(calls, 0);
    assert.equal(fs.existsSync(path.join(storage.DATA_DIR, "delegation-budgets", `${m.id}.json`)), false,
      "a denied child must not persist a partial budget reservation");
    denied = false;
    const accepted = await recursion.runDelegateCall(m.id, null, 0, request, {
      allowedTools: new Set(["delegate", "save_artifact"]), withEffect: admission.withEffect,
    });
    assert.equal(accepted.success, true);
    assert.equal(calls, 2, "same-mission synchronous nested targets must not deadlock");
    assert.ok(seen.some(target => target.stage === "delegation" && target.role === "unprofiled-child" &&
      target.tools?.includes("save_artifact") && target.label !== "model generate"));
    assert.ok(seen.some(target => target.role === "writer" && target.label === "model generate"));
  } finally { recursion.__setRecursionTestDeps(null); }
});
