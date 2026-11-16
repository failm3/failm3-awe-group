import assert from "node:assert/strict";
import * as fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { ROOT, spawnWorker } from "./r0-harness.js";
import { providerCases, assertProviderOutcomes, assertChildrenPlanning, assertResumeIdentity } from "./r0-integration-expectations.js";

// Fail closed if a supposedly offline import starts an HTTP/provider connection.
globalThis.fetch = async () => { throw new Error("R0 OFFLINE: fetch prohibited"); };
net.Socket.prototype.connect = function () { throw new Error("R0 OFFLINE: socket connect prohibited"); } as typeof net.Socket.prototype.connect;

const action = process.argv[2];
const storage = await import("../../utils/storage.js");
const lifecycle = await import("../../agents/lifecycle.js");
const id = "r0-mission";
const mission = (missionId = id) => ({
  id: missionId, title: "Independent QA", description: "Offline contract probe",
  objective: "Save verified report", acceptance_criteria: ["Deliver a complete analysis report"],
  status: "running" as const, priority: "normal" as const,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  artifacts: [], metadata: { preserved: { nonce: "do-not-lose" } },
});
const managerRuntime = await import("../../agents/mission-manager.js");

function approvedMission(missionId = id) {
  return {
    ...mission(missionId),
    status: "approved" as const,
    metadata: {
      preserved: { nonce: "do-not-lose" },
      specification: { suggested_tools: ["save_artifact", "shell"] },
    },
  };
}

function passedQa() {
  return {
    review: {
      passed: true,
      score: 9,
      criteria_results: [{ criterion: "Deliver a complete analysis report", passed: true, notes: "Verified persisted evidence" }],
      defects: [], recommendations: [], verdict: "PASS",
    },
    gate: { passed: true, blockers: [], criterion_checks: [], llm_score: 9, llm_passed: true },
  };
}

function offlineDeps(tasks: string[], executeSpecialist: any, reviewMissionDetailed: any = async () => passedQa()) {
  return {
    planMission: async () => ({
      strategy: "offline controlled integration",
      delegations: tasks.map((task) => ({
        agent_role: "executor", task, context: "", tools: ["save_artifact", "shell"],
        expected_output: `${task} receipt`, parallel: false,
      })),
    }),
    executeSpecialist,
    reviewMissionDetailed,
    resolveModelForRole: () => "offline-controlled-double",
  };
}

async function successfulExecute(config: any, missionId: string) {
  const artifact = storage.saveArtifactFile(missionId, `${config.task}.txt`, `verified:${config.task}`, "text");
  return {
    role: config.role, output: `saved ${config.task}`, artifacts: [artifact.id], success: true,
    issues: [], model: "offline-controlled-double", tools_used: ["save_artifact"],
  };
}

function managerFor(missionId: string, deps: any, options: Record<string, unknown> = {}) {
  return managerRuntime.createMissionManager(storage.loadMission(missionId)!, 10_000, {
    offlineFixture: true, allowedStatuses: ["approved", "paused"], quiesceTimeoutMs: 2_000, timeoutGraceMs: 500, deps,
    ...options,
  });
}

async function waitForOutput(output: () => string, expected: string, child: { stderr?: () => string } = {}) {
  const deadline = Date.now() + 8_000;
  while (!output().includes(expected)) {
    assert.ok(Date.now() < deadline, `Timed out waiting for ${expected}: ${output()} ${child.stderr?.() ?? ""}`);
    await delay(10);
  }
}

const checkpoint = () => ({
  mission_id: id, version: 1 as const, saved_at: new Date().toISOString(),
  timeout_ms: 1000, elapsed_ms: 40, repair_iterations: 0,
  reason: "manual" as const,
  completed: [{ index: 0, agent_role: "executor", task: "effect-A", status: "success" as const,
    output: "receipt-A", duration_ms: 5 }],
});

async function executeShell(command: string, options: { cwd?: string; signal?: AbortSignal } = {}) {
  const { shellTool } = await import("../../tools/index.js");
  const { runWithToolContext } = await import("../../security/tool-context.js");
  assert.equal(typeof shellTool.execute, "function");
  return await runWithToolContext(
    { missionId: id, allowedTools: new Set(["shell"]), signal: options.signal },
    () => shellTool.execute!({ command, cwd: options.cwd ?? process.cwd(), timeout_ms: 4000 }, { abortSignal: options.signal }) as any
  );
}

async function toolsFor(requested: string[], allowed?: string[]): Promise<string[]> {
  const { createSpecialist } = await import("../../agents/specialists.js");
  const config = {
    role: "r0-auditor", task: "No execution", context: "Offline introspection only",
    tools: requested, expected_output: "none", depth: 999,
    ...(allowed === undefined ? {} : { allowedTools: allowed }),
  };
  const agent = await createSpecialist(config);
  const observable = agent as any;
  // Use actual Agent introspection, not a source regex or guessed resolver result.
  let tools = typeof observable.listTools === "function" ? await observable.listTools() :
    typeof observable.getTools === "function" ? await observable.getTools() :
      observable.tools ?? observable.config?.tools;
  assert.ok(tools && typeof tools === "object", "FAIL: Agent tool introspection unavailable; integration adapter required");
  return Object.keys(tools).sort();
}

async function denied(operation: () => unknown | Promise<unknown>) {
  try {
    const result = await operation();
    assert.ok(result && typeof result === "object" && (result as any).success === false,
      "Operation must reject or return explicit success:false");
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
  }
}

async function runUpdateWorkers(shared: boolean) {
  const fields = ["title", "description", "objective", "head_agent_id"];
  for (let i = 0; i < fields.length; i++) storage.saveMission(mission(shared ? id : `${id}-${i}`));
  const children = fields.map((field, i) => spawnWorker(process.cwd(), "patch-writer", [shared ? id : `${id}-${i}`, field]));
  const outputs = children.map(() => ({ stdout: "", stderr: "" }));
  const exits = children.map((child, i) => {
    child.stdout.on("data", (chunk) => { outputs[i].stdout += chunk; });
    child.stderr.on("data", (chunk) => { if (outputs[i].stderr.length < 2500) outputs[i].stderr += chunk; });
    return once(child, "close");
  });
  try {
    const deadline = Date.now() + 10000;
    while (!outputs.every((output) => output.stdout.includes("READY"))) {
      assert.ok(Date.now() < deadline, JSON.stringify(outputs));
      await delay(10);
    }
    children.forEach((child) => child.stdin.end("GO\n"));
    const statuses = await Promise.all(exits);
    for (let i = 0; i < statuses.length; i++) {
      assert.equal(statuses[i][0], 0, `Writer ${fields[i]} failed: ${JSON.stringify(outputs[i])}`);
      const stored = storage.loadMission(shared ? id : `${id}-${i}`)!;
      assert.equal((stored as any)[fields[i]], `${fields[i]}-299`, "Disjoint patch was lost");
      assert.deepEqual(stored.metadata, mission().metadata, "Unrelated metadata lost");
    }
  } finally {
    children.forEach((child) => { if (child.exitCode === null) child.kill("SIGKILL"); });
  }
}

if (action === "provider") {
  const { evaluateProviderOutcome } = await import("../../agents/specialists.js");
  await assertProviderOutcomes(async (fixture) => evaluateProviderOutcome({
    response: fixture.response as any,
    artifactIdsBefore: [...fixture.before],
    artifactIdsAfter: [...fixture.after],
  }));
  console.log("provider outcome matrix passed");
} else if (action === "children") {
  const { resolveChildRequests } = await import("../../agents/recursion.js");
  await assertChildrenPlanning((request) => resolveChildRequests(request));
  console.log("distinct children planning passed");
} else if (action === "resume") {
  const { successfulDelegationIndices } = await import("../../agents/mission-manager.js");
  assertResumeIdentity(successfulDelegationIndices);
  console.log("resume task identity passed");
} else if (action === "lease") {
  const first = spawnWorker(process.cwd(), "lease-holder", [id]);
  const leaseMission = mission();
  storage.saveMission({ ...leaseMission, status: "paused" });
  await once(first, "spawn");
  let output = "";
  first.stdout.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 10000;
  while (!output.includes("LEASE_HELD") && Date.now() < deadline) await delay(20);
  assert.match(output, /LEASE_HELD/, "holder must acquire the durable lease");
  const lease = await lifecycle.acquireMissionLease(id);
  assert.equal(lease.acquired, false, "a live foreign owner must exclude double-run");
  const report = await lifecycle.reconcileOrphanedMissions();
  assert.equal(storage.loadMission(id)?.status, "paused", "live foreign lease must not be reconciled as orphan");
  assert.equal(storage.loadMission(id)?.metadata?.execution_owner !== undefined, true, "foreign lease metadata preserved");
  first.kill("SIGTERM");
  const [code] = await once(first, "close");
  assert.equal(code, 0, `holder cleanup failed: ${output}`);
  const acquired = await lifecycle.acquireMissionLease(id);
  assert.equal(acquired.acquired, true, "lease must be acquirable after release");
  if (acquired.acquired) await lifecycle.releaseMissionLease(acquired.handle);
  console.log("cross-process lease exclusion passed");
} else if (action === "lease-holder") {
  const holder = await lifecycle.acquireMissionLease(process.argv[3] ?? id);
  assert.equal(holder.acquired, true);
  console.log("LEASE_HELD");
  if (holder.acquired) {
    process.on("SIGTERM", () => {
      lifecycle.releaseMissionLease(holder.handle);
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  }
} else if (action === "manager") {
  // Success: production manager, real durable artifact, controlled planning/QA doubles.
  const successId = "manager-success";
  storage.saveMission(approvedMission(successId));
  let receivedConfig: any;
  const success = managerFor(successId, offlineDeps(["effect-success"], async (config: any, missionId: string) => {
    receivedConfig = config;
    return successfulExecute(config, missionId);
  }));
  const completed = await success.run();
  assert.equal(completed.mission.status, "completed");
  assert.equal(storage.listArtifacts(successId).length, 1);
  assert.equal(fs.readFileSync(storage.listArtifacts(successId)[0].path!, "utf8"), "verified:effect-success");
  assert.deepEqual(receivedConfig.tools, ["save_artifact", "shell"]);
  assert.deepEqual(receivedConfig.allowedTools, ["save_artifact", "shell"]);
  assert.equal(managerRuntime.getActiveMissionManager(successId), undefined);

  // Approved-spec ceiling: Head cannot expand beyond user-approved grants.
  const deniedId = "manager-grants";
  const deniedMission = approvedMission(deniedId);
  deniedMission.metadata.specification.suggested_tools = ["save_artifact"];
  storage.saveMission(deniedMission);
  let deniedConfig: any;
  const deniedRun = managerFor(deniedId, offlineDeps(["effect-grants"], async (config: any, missionId: string) => {
    deniedConfig = config;
    return successfulExecute(config, missionId);
  }));
  assert.equal((await deniedRun.run()).mission.status, "completed");
  assert.deepEqual(deniedConfig.tools, ["save_artifact"]);
  assert.deepEqual(deniedConfig.allowedTools, ["save_artifact"]);

  // A textual claim and a trusting QA double cannot manufacture completion.
  storage.saveMission(approvedMission("manager-false-success"));
  const falseSuccess = managerFor("manager-false-success", offlineDeps(["effect-missing"], async () => ({
    role: "executor", output: "Done, artifact saved", artifacts: [], success: true,
    issues: [], model: "offline-controlled-double", tools_used: [],
  })));
  const failed = await falseSuccess.run();
  assert.equal(failed.mission.status, "failed");
  assert.equal(failed.review?.passed, false);
  assert.equal(storage.listArtifacts("manager-false-success").length, 0);
  assert.equal((failed.mission.metadata.execution as any).delegations[0].status, "failed");

  // Model-call double: a real pending provider-shaped await, released only by abort.
  storage.saveMission(approvedMission("manager-model-cancel"));
  let modelStarted!: () => void;
  const modelStartedPromise = new Promise<void>((resolve) => { modelStarted = resolve; });
  let modelAbortObserved = false;
  let modelSettled = false;
  let qaCalled = false;
  const modelManager = managerFor("manager-model-cancel", offlineDeps(["effect-model"], async (_config: any, _missionId: string, options: any) => {
    return await new Promise((_resolve, reject) => {
      modelStarted();
      options.signal.addEventListener("abort", () => {
        modelAbortObserved = true;
        fs.writeFileSync("model-aborted", "yes");
        reject(options.signal.reason);
      }, { once: true });
    }).finally(() => {
      modelSettled = true;
      fs.writeFileSync("model-settled", "yes");
    });
  }, async () => { qaCalled = true; return passedQa(); }));
  const modelRun = modelManager.run();
  await modelStartedPromise;
  const modelCancel = await modelManager.cancel("independent model cancellation");
  const modelResult = await modelRun;
  assert.equal(modelCancel.cancelled, true);
  assert.equal(modelCancel.quiesced, true);
  assert.equal(modelResult.mission.status, "cancelled");
  assert.equal(modelAbortObserved, true);
  assert.equal(modelSettled, true);
  assert.equal(qaCalled, false);
  assert.equal(managerRuntime.getActiveMissionManager("manager-model-cancel"), undefined);
  await denied(() => storage.saveArtifactFile("manager-model-cancel", "late.txt", "forbidden"));
  console.log("manager success/false-success/model-cancel contracts passed");
} else if (action === "manager-tool-cancel") {
  storage.saveMission(approvedMission(id));
  let qaCalled = false;
  const manager = managerFor(id, offlineDeps(["effect-tool"], async (_config: any, _missionId: string, options: any) => {
    const outcome = await executeShell(
      "printf started > tool-started; sleep 1.2; printf forbidden > tool-late",
      { signal: options.signal }
    );
    options.signal.throwIfAborted();
    return { role: "executor", output: JSON.stringify(outcome), artifacts: [], success: outcome.success, tools_used: ["shell"] };
  }, async () => { qaCalled = true; return passedQa(); }));
  const running = manager.run();
  await waitForOutput(() => fs.existsSync("tool-started") ? "TOOL_STARTED" : "", "TOOL_STARTED");
  const cancelled = await manager.cancel("independent tool cancellation");
  const result = await running;
  await delay(1400);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.quiesced, true);
  assert.equal(result.mission.status, "cancelled");
  assert.equal(fs.existsSync("tool-late"), false, "real shell descendant wrote after confirmed cancellation");
  assert.equal(qaCalled, false);
  console.log("manager real-tool cancellation passed");
} else if (action === "manager-double-run") {
  storage.saveMission(approvedMission(id));
  const owner = spawnWorker(process.cwd(), "manager-block-holder");
  let stdout = "", stderr = "";
  owner.stdout.on("data", (chunk) => { stdout += chunk; });
  owner.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitForOutput(() => stdout, "MODEL_STARTED", { stderr: () => stderr });
    const rival = managerFor(id, offlineDeps(["rival-must-not-run"], successfulExecute));
    await assert.rejects(rival.run(), (error: any) => error?.name === "MissionLeaseError" || error?.name === "MissionStateError");
    assert.equal(storage.loadMission(id)?.status, "running");
    assert.equal(storage.listArtifacts(id).length, 0);
    const ownerExited = once(owner, "close");
    const cancelled = await managerRuntime.cancelMission(id, "stop foreign owner", { waitMs: 8_000 });
    assert.equal(cancelled.cancelled, true, JSON.stringify(cancelled));
    const [code] = await ownerExited;
    assert.equal(code, 0, stderr);
    assert.match(stdout, /OWNER_CANCELLED/);
    assert.equal(storage.listArtifacts(id).length, 0);
  } finally {
    if (owner.exitCode === null) owner.kill("SIGKILL");
  }
  console.log("manager cross-process double-run exclusion passed");
} else if (action === "manager-block-holder") {
  const manager = managerFor(id, offlineDeps(["blocking-owner"], async (_config: any, _missionId: string, options: any) => {
    return await new Promise((_resolve, reject) => {
      console.log("MODEL_STARTED");
      options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
    });
  }));
  const result = await manager.run();
  assert.equal(result.mission.status, "cancelled");
  console.log("OWNER_CANCELLED");
} else if (action === "manager-crash-resume") {
  storage.saveMission(approvedMission(id));
  const owner = spawnWorker(process.cwd(), "manager-crash-after-effect");
  let stdout = "", stderr = "";
  owner.stdout.on("data", (chunk) => { stdout += chunk; });
  owner.stderr.on("data", (chunk) => { stderr += chunk; });
  try {
    await waitForOutput(() => stdout, "SECOND_STARTED", { stderr: () => stderr });
    owner.kill("SIGKILL");
    assert.equal((await once(owner, "close"))[1], "SIGKILL");
  } finally {
    if (owner.exitCode === null) owner.kill("SIGKILL");
  }
  const recovered = await lifecycle.reconcileOrphanedMissions();
  assert.deepEqual(recovered.paused, [id]);
  assert.equal(storage.loadMission(id)?.status, "paused");
  assert.equal(lifecycle.loadCheckpoint(id)?.completed.length, 1);
  assert.equal(storage.listArtifacts(id).length, 1);
  const beforeResume = fs.existsSync("crash-effects.log") ? fs.readFileSync("crash-effects.log", "utf8") : "";
  assert.equal(beforeResume.split("\n").filter((line) => line === "effect-A").length, 1);
  assert.equal(beforeResume.split("\n").filter((line) => line === "effect-B").length, 0, "this controlled fixture kills B before its effect");
  const resumed = managerFor(id, offlineDeps(["effect-A", "effect-B"], async (config: any, missionId: string) => {
    fs.appendFileSync("resume-effects.log", `${config.task}\n`);
    return successfulExecute(config, missionId);
  }), {
    // Only this independently proven pre-effect-B fixture opts out of the
    // production default strict policy. A must still come from its checkpoint.
    unresolvedIntentPolicy: "evidence",
  });
  const result = await resumed.run();
  assert.equal(result.mission.status, "completed", JSON.stringify(result.review));
  const allEffects = `${fs.existsSync("crash-effects.log") ? fs.readFileSync("crash-effects.log", "utf8") : ""}${fs.existsSync("resume-effects.log") ? fs.readFileSync("resume-effects.log", "utf8") : ""}`;
  assert.equal(allEffects.split("\n").filter((line) => line === "effect-A").length, 1, "durable effect-A repeated after crash");
  assert.equal(allEffects.split("\n").filter((line) => line === "effect-B").length, 1);
  assert.deepEqual(storage.listArtifacts(id).map((artifact) => artifact.name).sort(), ["effect-A.txt", "effect-B.txt"]);
  assert.equal(lifecycle.loadCheckpoint(id), null);
  console.log("manager crash-after-effect and no-repeat resume passed");
} else if (action === "manager-crash-after-effect") {
  const manager = managerFor(id, offlineDeps(["effect-A", "effect-B"], async (config: any, missionId: string, options: any) => {
    if (config.task === "effect-B") {
      console.log("SECOND_STARTED");
      return await new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
    }
    fs.appendFileSync("crash-effects.log", `${config.task}\n`);
    return successfulExecute(config, missionId);
  }));
  await manager.run();
} else
switch (action) {
  case "storage-roundtrip": {
    storage.saveMission(mission());
    const bytes = "independent evidence\nUnicode: Привет\n";
    const artifact = storage.saveArtifactFile(id, "report.md", bytes, "text");
    assert.equal(fs.readFileSync(artifact.path!, "utf8"), bytes);
    assert.equal(storage.listArtifacts(id).length, 1);
    assert.equal(storage.listArtifacts(id)[0].id, artifact.id);
    storage.updateMission(id, { title: "Changed" });
    assert.deepEqual(storage.loadMission(id)?.metadata, mission().metadata);
    assert.equal(storage.loadMission(id)?.objective, mission().objective);
    assert.equal(storage.loadMission("absent"), null);
    break;
  }
  case "cancelled-artifact": {
    storage.saveMission(mission());
    const kept = storage.saveArtifactFile(id, "kept.txt", "before cancellation");
    storage.updateMission(id, { status: "cancelled" });
    await denied(() => storage.saveArtifactFile(id, "late.txt", "forbidden"));
    assert.equal(storage.listArtifacts(id).length, 1);
    assert.equal(fs.existsSync(path.join(storage.DATA_DIR, "artifacts", id, "late.txt")), false);
    assert.equal(fs.readFileSync(kept.path!, "utf8"), "before cancellation");
    break;
  }
  case "cancelled-update":
  case "cancelled-running": {
    storage.saveMission(mission());
    storage.updateMission(id, { status: "cancelled" });
    try { storage.updateMission(id, { status: action === "cancelled-update" ? "completed" : "running" }); } catch {}
    assert.equal(storage.loadMission(id)?.status, "cancelled", "Terminal cancellation lost to a late writer");
    assert.deepEqual(storage.loadMission(id)?.metadata, mission().metadata);
    break;
  }
  case "patch-writer": {
    const [target, field] = process.argv.slice(3);
    console.log("READY");
    await once(process.stdin, "data");
    let errors = 0;
    for (let i = 0; i < 300; i++) {
      try { assert.ok(storage.updateMission(target, { [field]: `${field}-${i}` })); }
      catch (error) { errors++; if (errors <= 2) console.error(String(error)); }
    }
    assert.equal(errors, 0, "Cross-process update write collisions/data corruption");
    break;
  }
  case "cross-process": await runUpdateWorkers(true); break;
  case "parallel-missions": await runUpdateWorkers(false); break;
  case "empty-tools": assert.deepEqual(await toolsFor([]), []); break;
  case "unknown-tools": assert.deepEqual(await toolsFor(["r0-does-not-exist"]), []); break;
  case "mixed-tools": assert.deepEqual(await toolsFor(["file_read", "r0-does-not-exist"]), ["file_read"]); break;
  case "allowed-tools": assert.deepEqual(await toolsFor(["shell", "file_read"], ["file_read"]), ["file_read"]); break;
  case "empty-allowlist": assert.deepEqual(await toolsFor(["shell", "file_read"], []), []); break;
  case "shell-success": {
    const out = await executeShell("printf r0-output; printf r0-stderr >&2");
    assert.equal(out.success, true);
    assert.equal(out.stdout, "r0-output");
    assert.equal(out.stderr, "r0-stderr");
    assert.equal(out.exit_code, 0);
    break;
  }
  case "shell-failure": {
    const out = await executeShell("printf broken >&2; exit 7");
    assert.equal(out.success, false);
    assert.equal(out.exit_code, 7);
    assert.match(out.stderr, /broken/);
    break;
  }
  case "shell-cwd": {
    // The sibling is outside this worker's workspace but still inside its disposable temp parent.
    const inner = path.join(process.cwd(), "inner");
    const outside = path.join(process.cwd(), "outside");
    fs.mkdirSync(inner); fs.mkdirSync(outside);
    process.chdir(inner); // tools module has not been imported; captures inner as workspace root
    await denied(() => executeShell("printf forbidden > outside-marker", { cwd: outside }));
    assert.equal(fs.existsSync(path.join(outside, "outside-marker")), false);
    break;
  }
  case "shell-abort": {
    const controller = new AbortController();
    const marker = path.join(process.cwd(), "late-marker");
    const running = executeShell("printf started > started; sleep 1.2; printf forbidden > late-marker", { signal: controller.signal });
    const deadline = Date.now() + 5000;
    while (!fs.existsSync("started")) {
      assert.ok(Date.now() < deadline, "Shell never started"); await delay(10);
    }
    const startedAbort = Date.now();
    controller.abort();
    let result: any;
    try { result = await running; } catch { result = { success: false }; }
    const elapsed = Date.now() - startedAbort;
    // Wait past child's scheduled side effect even if the outer promise rejects promptly.
    await delay(1400);
    assert.equal(fs.existsSync(marker), false, "Aborted shell/descendant continued and created late marker");
    assert.ok(elapsed < 1000, `Abort did not settle promptly: ${elapsed}ms`);
    assert.equal(result.success, false);
    break;
  }
  case "shell-preabort": {
    const controller = new AbortController(); controller.abort();
    await denied(() => executeShell("printf forbidden > preabort-marker", { signal: controller.signal }));
    assert.equal(fs.existsSync("preabort-marker"), false);
    break;
  }
  case "recursion-depth":
  case "recursion-budget": {
    const recursion = await import("../../agents/recursion.js");
    if (action === "recursion-budget") recursion.getSession(id).spawned = recursion.RECURSION_LIMITS.maxTotalAgents;
    const before = recursion.getDelegationTree(id);
    const result = await recursion.runDelegateCall(id, null,
      action === "recursion-depth" ? recursion.RECURSION_LIMITS.maxDepth : 0,
      { role: "writer", task: "must not execute", parallel: true });
    assert.equal(result.success, false);
    assert.deepEqual(result.children, []);
    assert.ok(result.refused_reason);
    assert.ok(result.errors.length > 0);
    assert.deepEqual(recursion.getDelegationTree(id), before);
    break;
  }
  case "recursion-isolation": {
    const recursion = await import("../../agents/recursion.js");
    const node = recursion.registerTopLevelNode(id, "executor", "A");
    recursion.registerTopLevelNode("other", "executor", "B");
    recursion.finalizeNode(id, node, "failed", { tools_used: ["file_read"] });
    assert.equal(recursion.getDelegationTree("other").nodes[0].status, "running");
    recursion.resetSession(id);
    assert.equal(recursion.getDelegationTree(id).nodes.length, 0);
    assert.equal(recursion.getDelegationTree("other").nodes.length, 1);
    break;
  }
  case "timeout-success": {
    const value = { receipt: "exact object" }; let callbacks = 0;
    assert.equal(await lifecycle.withMissionTimeout(id, 500, async () => value, () => { callbacks++; }), value);
    assert.equal(callbacks, 0); break;
  }
  case "timeout-failure": {
    const error = new Error("tool failed"); let callbacks = 0;
    await assert.rejects(lifecycle.withMissionTimeout(id, 500, async () => { throw error; }, () => { callbacks++; }),
      (actual) => actual === error);
    assert.equal(callbacks, 0); break;
  }
  case "timeout-expiry": {
    let callbacks = 0;
    await assert.rejects(lifecycle.withMissionTimeout(id, 30, () => new Promise(() => {}), (error) => {
      callbacks++; assert.equal(error.missionId, id);
    }), lifecycle.MissionTimeoutError);
    assert.equal(callbacks, 1); break;
  }
  case "reconcile-exclusion": {
    storage.saveMission(mission()); storage.saveMission(mission("orphan"));
    const report = await lifecycle.reconcileOrphanedMissions(new Set([id]));
    assert.deepEqual(report.paused, ["orphan"]);
    assert.equal(storage.loadMission(id)?.status, "running");
    assert.equal(storage.loadMission("orphan")?.status, "paused");
    assert.deepEqual((await lifecycle.reconcileOrphanedMissions(new Set([id]))).paused, []);
    break;
  }
  case "crash-owner": {
    storage.saveMission(mission());
    storage.saveArtifactFile(id, "effect-receipt.txt", "performed exactly once");
    lifecycle.saveCheckpoint(checkpoint());
    console.log("DURABLE_READY");
    setInterval(() => {}, 1000);
    await new Promise(() => {});
    break;
  }
  case "crash-recovery": {
    const owner = spawnWorker(process.cwd(), "crash-owner");
    const exited = once(owner, "close");
    let stdout = ""; let stderr = "";
    owner.stdout.on("data", (chunk) => { stdout += chunk; });
    owner.stderr.on("data", (chunk) => { stderr += chunk; });
    try {
      const deadline = Date.now() + 8000;
      while (!stdout.includes("DURABLE_READY")) {
        assert.ok(Date.now() < deadline, `Crash worker not ready: ${stderr}`); await delay(10);
      }
      owner.kill("SIGKILL");
      assert.equal((await exited)[1], "SIGKILL");
      const report = await lifecycle.reconcileOrphanedMissions();
      assert.deepEqual(report.paused, [id]);
      assert.deepEqual(report.resumable, [id]);
      assert.equal(storage.loadMission(id)?.status, "paused");
      assert.deepEqual(lifecycle.loadCheckpoint(id), checkpointWithPersistedTime());
      const artifacts = storage.listArtifacts(id);
      assert.equal(artifacts.length, 1);
      assert.equal(fs.readFileSync(artifacts[0].path!, "utf8"), "performed exactly once");
      assert.deepEqual((await lifecycle.reconcileOrphanedMissions()).paused, []);
    } finally { if (owner.exitCode === null) owner.kill("SIGKILL"); }
    break;
  }
  case "qa-empty-criterion": {
    const { matchCriteria } = await import("../../agents/qa-gate.js");
    const result = matchCriteria(["Deliver a complete analysis report"], [{ criterion: "", passed: true, notes: "Trust me" }]);
    assert.equal(result[0].result, null, "Blank review criterion must not match any real requirement");
    break;
  }
  case "qa-unique-criteria": {
    const { matchCriteria } = await import("../../agents/qa-gate.js");
    const result = matchCriteria(["Deliver analysis report", "Deliver analysis report"],
      [{ criterion: "Deliver analysis report", passed: true, notes: "" }]);
    assert.equal(result.filter((entry) => entry.result !== null).length, 1);
    break;
  }
  default: throw new Error(`Unknown R0 scenario ${action} in ${ROOT}`);
}

function checkpointWithPersistedTime() {
  const persisted = lifecycle.loadCheckpoint(id)!;
  return { ...checkpoint(), saved_at: persisted.saved_at };
}
console.log("R0_ASSERTIONS_COMPLETED");
