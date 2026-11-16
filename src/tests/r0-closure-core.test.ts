#!/usr/bin/env npx tsx
/**
 * R0 closure core adversarial regressions.
 *
 * Everything runs against fresh temporary storage and injected offline manager
 * functions. Receipt files are the measured effects; no provider, network,
 * browser, MCP, Postgres, deployment, or real .awe-data is involved.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const root = fs.mkdtempSync("/tmp/opencode/r0-closure-core-");
const dataDir = path.join(root, "data");
process.env.AWE_DATA_DIR = dataDir;
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
process.env.OPENAI_API_KEY = "offline-test-only";
process.env.TAVILY_API_KEY = "";

const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const manager = await import("../agents/mission-manager.js");
const qaGate = await import("../agents/qa-gate.js");
const types = await import("../types/index.js");

after(() => fs.rmSync(root, { recursive: true, force: true }));

let sequence = 0;
const id = (label: string) => `closure-${label}-${++sequence}`;
const criterion = "A verified result artifact exists";
const checkpointPath = (missionId: string) => path.join(dataDir, "checkpoints", `${missionId}.json`);
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const receiptLines = (file: string) => fs.existsSync(file)
  ? fs.readFileSync(file, "utf8").split("\n").filter(Boolean)
  : [];
const sha = (value: string | Buffer) => crypto.createHash("sha256").update(value).digest("hex");

function seed(missionId = id("mission"), status: "approved" | "paused" | "running" = "approved") {
  const now = new Date().toISOString();
  storage.saveMission({
    id: missionId,
    title: "R0 closure core",
    description: "offline adversarial regression",
    objective: "produce one durable verified result",
    acceptance_criteria: [criterion],
    status,
    priority: "normal",
    created_at: now,
    updated_at: now,
    artifacts: [],
    metadata: { specification: { suggested_tools: ["save_artifact", "file_write"] } },
  });
  return storage.loadMission(missionId)!;
}

const delegation = (expectedOutput = "receipt") => ({
  agent_role: "executor",
  task: "produce result",
  context: "",
  tools: ["save_artifact"],
  expected_output: expectedOutput,
  parallel: false,
});

function review(passed: boolean, text = criterion) {
  return {
    review: {
      passed,
      score: passed ? 10 : 3,
      criteria_results: [{ criterion: text, passed, notes: passed ? "verified" : "repair required" }],
      defects: passed ? [] : [{ issue: "repair required", severity: "major" }],
      recommendations: [],
      verdict: passed ? "PASS" : "FAIL",
    },
    gate: {
      passed,
      blockers: passed ? [] : ["repair required"],
      criterion_checks: [{ criterion: text, passed, reason: passed ? "verified" : "repair required" }],
      llm_score: passed ? 10 : 3,
      llm_passed: passed,
    },
  } as any;
}

const outcome = (cfg: any, artifacts: string[], success = true) => ({
  role: cfg.role,
  success,
  output: success ? "done" : "failed after an effect",
  artifacts,
  tools_used: [],
  model: "offline-model",
});

function managerFor(missionId: string, deps: Record<string, unknown>, timeoutMs = 5_000) {
  return manager.createMissionManager(storage.loadMission(missionId)!, timeoutMs, {
    allowedStatuses: ["approved", "paused"],
    timeoutGraceMs: 100,
    quiesceTimeoutMs: 500,
    deps: { resolveModelForRole: () => "offline-model", ...deps },
  } as any);
}

function resultWithArtifact(cfg: any, missionId: string, name: string, bytes: string) {
  const artifact = storage.saveArtifactFile(missionId, name, bytes);
  return outcome(cfg, [artifact.id]);
}

test("effect-bearing failed repairs pause durably; accept verifies attempt evidence and retry alone repeats", async () => {
  for (const [failureMode, decision] of [["returned", "accept"], ["thrown", "retry"]] as const) {
    const missionId = seed().id;
    const sink = path.join(root, `${missionId}.receipts`);
    let originalCalls = 0;
    let repairCalls = 0;
    let repairArtifact = "";
    const first = managerFor(missionId, {
      planMission: async () => ({ strategy: "accepted", delegations: [delegation()] }),
      executeSpecialist: async (cfg: any, mid: string, opts: any) => {
        if (!String(cfg.task).startsWith("Fix the following defects")) {
          originalCalls++;
          const primary = storage.saveArtifactFile(mid, "result.txt", "original");
          const preExisting = storage.saveArtifactFile(mid, "existing.txt", "pre-existing baseline");
          return outcome(cfg, [primary.id, preExisting.id]);
        }
        repairCalls++;
        opts.beginEffect("repair-receipt");
        fs.appendFileSync(sink, `${failureMode}:1\n`);
        if (failureMode === "returned") {
          await delay(15); // deterministic registry ordering for the same-name replacement
          const artifact = storage.saveArtifactFile(mid, "result.txt", "repaired bytes");
          repairArtifact = artifact.id;
          return outcome(cfg, [artifact.id], false);
        }
        throw new Error("offline repair transport failed");
      },
      reviewMissionDetailed: async () => review(false),
    });

    const ordinary = await first.run();
    assert.equal(ordinary.mission.status, "paused", `${failureMode} must not terminalize`);
    const blocked = storage.loadMission(missionId)!;
    assert.equal((blocked.metadata.recovery_blocked as any).kind, "ambiguous_delegation_outcome");
    const damagedIntent = (lifecycle.loadCheckpoint(missionId)!.in_flight as any[]).find((entry) => entry.kind === "repair");
    assert.ok(damagedIntent?.ambiguous);
    assert.ok(damagedIntent.effect_marked_at);
    assert.equal(damagedIntent.failed_outcome.thrown, failureMode === "thrown");
    assert.equal(receiptLines(sink).length, 1);
    assert.equal(originalCalls, 1);
    assert.equal(repairCalls, 1);

    let replanCalls = 0;
    let unexpectedCalls = 0;
    const blockedAgain = await managerFor(missionId, {
      planMission: async () => {
        replanCalls++;
        return { strategy: "paraphrase", delegations: [delegation("submission receipt")] };
      },
      executeSpecialist: async () => { unexpectedCalls++; throw new Error("must stay gated"); },
      reviewMissionDetailed: async () => review(true),
    }).run();
    assert.equal(blockedAgain.mission.status, "paused");
    assert.deepEqual([replanCalls, unexpectedCalls, receiptLines(sink).length], [0, 0, 1]);

    if (decision === "accept") {
      const originalArtifacts = lifecycle.loadCheckpoint(missionId)!.completed[0].artifacts!;
      const priorId = originalArtifacts.find((artifactId) =>
        storage.listArtifacts(missionId).some((artifact) => artifact.id === artifactId && artifact.name === "existing.txt")
      )!;
      const prior = storage.listArtifacts(missionId).find((artifact) => artifact.id === priorId)!;
      assert.equal(prior.name, "existing.txt");
      assert.notEqual(prior.id, repairArtifact);
      assert.throws(() => manager.resolveAmbiguousDelegation(missionId, {
        intent_id: damagedIntent.intent_id,
        decision: "accept",
        operator: "offline operator",
        note: "pre-existing output is not attempt evidence",
        artifacts: [prior.id],
      }), /did not appear during this attempt/);
      const other = seed();
      const foreign = storage.saveArtifactFile(other.id, "foreign.txt", "foreign");
      assert.throws(() => manager.resolveAmbiguousDelegation(missionId, {
        intent_id: damagedIntent.intent_id,
        decision: "accept",
        operator: "offline operator",
        note: "foreign output is not mission evidence",
        artifacts: [foreign.id],
      }), /not a currently registered artifact/);
      assert.equal(receiptLines(sink).length, 1);
      const accepted = manager.resolveAmbiguousDelegation(missionId, {
        intent_id: damagedIntent.intent_id,
        decision: "accept",
        operator: "offline operator",
        note: "verified same-mission repair bytes are present",
        artifacts: [repairArtifact],
      });
      assert.equal(accepted.remaining, 0);
      const acceptedCheckpoint = lifecycle.loadCheckpoint(missionId)!;
      assert.equal(acceptedCheckpoint.repair_iterations, 1);
      assert.ok(acceptedCheckpoint.repair_provenance?.some((proof) => proof.source === "operator_accept" && proof.intent_id === damagedIntent.intent_id));
      assert.ok(acceptedCheckpoint.recovery_resolutions?.some((entry) => entry.decision === "accept" && entry.artifacts.includes(repairArtifact)));
    } else {
      const retried = manager.resolveAmbiguousDelegation(missionId, {
        intent_id: damagedIntent.intent_id,
        decision: "retry",
        operator: "offline operator",
        note: "one explicitly authorized repeat",
      });
      assert.equal(retried.remaining, 0);
    }

    let resumedOriginals = 0;
    const resumed = await managerFor(missionId, {
      planMission: async () => {
        replanCalls++;
        return { strategy: "paraphrase", delegations: [delegation("submission receipt")] };
      },
      executeSpecialist: async (cfg: any, mid: string, opts: any) => {
        if (!String(cfg.task).startsWith("Fix the following defects")) {
          resumedOriginals++;
          throw new Error("accepted plan history must not re-execute its original");
        }
        assert.equal(decision, "retry", "only retry may repeat a repair");
        repairCalls++;
        opts.beginEffect("explicit-repair-retry");
        fs.appendFileSync(sink, `${failureMode}:2\n`);
        return resultWithArtifact(cfg, mid, "retry.txt", "explicitly retried repair");
      },
      reviewMissionDetailed: async () => review(true),
    }).run();
    assert.equal(resumed.mission.status, "completed", JSON.stringify(storage.loadMission(missionId)!.metadata.qa_gate));
    assert.equal(resumedOriginals, 0);
    assert.equal(replanCalls, 0, "stored accepted plan must bypass provider paraphrase");
    assert.equal(originalCalls, 1);
    assert.equal(repairCalls, decision === "retry" ? 2 : 1);
    assert.equal(receiptLines(sink).length, decision === "retry" ? 2 : 1);
    if (decision === "accept") {
      const links = storage.loadMission(missionId)!.metadata.artifact_supersessions as any[];
      assert.equal(links.length, 1);
      assert.equal(links[0].source, "operator_accept");
      assert.equal(links[0].superseded_by, repairArtifact);
      assert.equal(links[0].replacement_sha256, sha("repaired bytes"));
      assert.equal(links[0].replacement_size_bytes, Buffer.byteLength("repaired bytes"));
    }
  }
});

test("pre-effect failed repairs remain bounded, preserve original bytes, and seal terminal failure", async () => {
  for (const mode of ["returned", "thrown"] as const) {
    const missionId = seed().id;
    let repairs = 0;
    const run = await managerFor(missionId, {
      planMission: async () => ({ strategy: "accepted", delegations: [delegation()] }),
      executeSpecialist: async (cfg: any, mid: string) => {
        if (!String(cfg.task).startsWith("Fix the following defects")) {
          return resultWithArtifact(cfg, mid, "original.txt", "do-not-lose");
        }
        repairs++;
        if (mode === "thrown") throw new Error("failed before any effect");
        return outcome(cfg, [], false);
      },
      reviewMissionDetailed: async () => review(false),
    }).run();
    assert.equal(run.mission.status, "failed");
    assert.equal(repairs, 1);
    assert.equal(fs.readFileSync(storage.listArtifacts(missionId).find((a) => a.name === "original.txt")!.path!, "utf8"), "do-not-lose");
    assert.equal(lifecycle.loadCheckpoint(missionId), null);
    await assert.rejects(managerFor(missionId, {
      planMission: async () => { throw new Error("terminal run must not replan"); },
      executeSpecialist: async () => { repairs++; },
      reviewMissionDetailed: async () => review(true),
    }).run(), /expected one of/);
    assert.equal(repairs, 1);
    assert.throws(() => storage.saveArtifactFile(missionId, "late.txt", "late"), storage.MissionSealedError);
    assert.equal(fs.existsSync(path.join(dataDir, "artifacts", missionId, "late.txt")), false);
  }
});

async function successfulWorkThenQATimeout(label: string) {
  const missionId = seed(id(label)).id;
  const sink = path.join(root, `${missionId}.receipts`);
  let executions = 0;
  const deps = {
    planMission: async () => ({ strategy: "original-accepted-plan", delegations: [delegation("receipt")] }),
    executeSpecialist: async (cfg: any, mid: string, opts: any) => {
      executions++;
      const beforeEffect = lifecycle.loadCheckpoint(mid)!;
      assert.ok(beforeEffect.plan?.delegations[0].delegation_id, "plan identity must precede specialist effects");
      assert.equal(beforeEffect.plan?.delegations[0].expected_output, "receipt");
      opts.beginEffect("receipt");
      fs.appendFileSync(sink, `effect:${executions}\n`);
      return resultWithArtifact(cfg, mid, "result.txt", `verified:${executions}`);
    },
    reviewMissionDetailed: async (_m: any, _o: any, _a: any, opts: any) => new Promise((_resolve, reject) => {
      const signal = opts.signal as AbortSignal;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  };
  const first = await managerFor(missionId, deps, 120).run();
  assert.equal(first.mission.status, "paused");
  assert.equal(executions, 1);
  assert.deepEqual(receiptLines(sink), ["effect:1"]);
  const checkpoint = lifecycle.loadCheckpoint(missionId)!;
  assert.equal(checkpoint.completed.length, 1);
  assert.equal(checkpoint.plan?.delegations[0].expected_output, "receipt");
  assert.ok(checkpoint.plan?.delegations[0].delegation_id);
  return { missionId, sink, checkpoint, executions: () => executions };
}

test("success then QA timeout resumes the stored plan under paraphrase, concurrent rivals, and repeated terminal attempts", async () => {
  const setup = await successfulWorkThenQATimeout("stable-resume");
  const checkpointBytes = fs.readFileSync(checkpointPath(setup.missionId));
  const storedHash = setup.checkpoint.plan!.plan_hash;
  assert.equal(lifecycle.loadCheckpoint(setup.missionId)!.plan!.plan_hash, storedHash);
  assert.ok(checkpointBytes.length > 0);

  let paraphraseCalls = 0;
  let resumedEffects = 0;
  const deps = {
    planMission: async () => {
      paraphraseCalls++;
      return { strategy: "regenerated prose", delegations: [delegation("submission receipt")] };
    },
    executeSpecialist: async () => { resumedEffects++; throw new Error("confirmed work must not execute again"); },
    reviewMissionDetailed: async () => review(true),
  };
  const first = managerFor(setup.missionId, deps);
  const rival = managerFor(setup.missionId, deps);
  const settled = await Promise.allSettled([first.run(), rival.run()]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = settled.find((result) => result.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rejected.reason), /MissionLeaseError|MissionStateError/);
  assert.equal(storage.loadMission(setup.missionId)!.status, "completed");
  assert.deepEqual([paraphraseCalls, resumedEffects, receiptLines(setup.sink).length], [0, 0, 1]);
  assert.equal(lifecycle.loadCheckpoint(setup.missionId), null);
  await assert.rejects(managerFor(setup.missionId, deps).run(), /terminal|expected one of/);
  assert.deepEqual([paraphraseCalls, resumedEffects, receiptLines(setup.sink).length], [0, 0, 1]);
  assert.throws(() => storage.saveArtifactFile(setup.missionId, "late.txt", "late"), storage.MissionSealedError);
  assert.equal(fs.existsSync(path.join(dataDir, "artifacts", setup.missionId, "late.txt")), false);
});

test("operator-accepted delegation survives a paraphrased resume with stable identity and no repeated effect", async () => {
  const missionId = seed(id("accepted-delegation")).id;
  const sink = path.join(root, `${missionId}.receipts`);
  let executions = 0;
  let artifactId = "";
  const first = await managerFor(missionId, {
    planMission: async () => ({ strategy: "accepted original", delegations: [delegation("receipt")] }),
    executeSpecialist: async (cfg: any, mid: string, opts: any) => {
      executions++;
      const checkpointBeforeEffect = lifecycle.loadCheckpoint(mid)!;
      assert.ok(checkpointBeforeEffect.plan?.delegations[0].delegation_id);
      opts.beginEffect("ordinary-receipt");
      fs.appendFileSync(sink, "ordinary:1\n");
      artifactId = storage.saveArtifactFile(mid, "accepted.txt", "accepted bytes").id;
      return outcome(cfg, [artifactId], false);
    },
    reviewMissionDetailed: async (_m: any, _o: any, _a: any, opts: any) => new Promise((_resolve, reject) => {
      const signal = opts.signal as AbortSignal;
      if (signal.aborted) reject(signal.reason);
      else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  }, 120).run();
  assert.equal(first.mission.status, "paused");
  assert.deepEqual([executions, receiptLines(sink).length], [1, 1]);

  let gatedCalls = 0;
  const blocked = await managerFor(missionId, {
    planMission: async () => { gatedCalls++; return { strategy: "unused", delegations: [delegation("changed")] }; },
    executeSpecialist: async () => { gatedCalls++; },
    reviewMissionDetailed: async () => { gatedCalls++; return review(true); },
  }).run();
  assert.equal(blocked.mission.status, "paused");
  assert.equal(gatedCalls, 0);
  const intent = (lifecycle.loadCheckpoint(missionId)!.in_flight as any[]).find((entry) => entry.kind === "delegation");
  assert.ok(intent?.ambiguous && intent.failed_outcome);
  manager.resolveAmbiguousDelegation(missionId, {
    intent_id: intent.intent_id,
    decision: "accept",
    operator: "offline operator",
    note: "actual same-attempt artifact and receipt verified",
    artifacts: [artifactId],
  });
  const accepted = lifecycle.loadCheckpoint(missionId)!;
  const acceptedResult = accepted.completed.find((entry) => entry.status === "success")!;
  assert.equal(acceptedResult.delegation_id, accepted.plan!.delegations[0].delegation_id);
  assert.equal(acceptedResult.fingerprint, accepted.plan!.delegations[0].fingerprint);
  assert.deepEqual(acceptedResult.artifacts, [artifactId]);

  let replans = 0;
  let resumedExecutions = 0;
  const resumed = await managerFor(missionId, {
    planMission: async () => {
      replans++;
      return { strategy: "paraphrased", delegations: [delegation("submission receipt")] };
    },
    executeSpecialist: async () => { resumedExecutions++; throw new Error("accepted effect must not repeat"); },
    reviewMissionDetailed: async () => review(true),
  }).run();
  assert.equal(resumed.mission.status, "completed");
  assert.deepEqual([replans, resumedExecutions, executions, receiptLines(sink).length], [0, 0, 1, 1]);
  assert.deepEqual(storage.loadMission(missionId)!.artifacts, [artifactId]);
});

test("malformed, unreadable, and wrong-mission checkpoints block before planning/effects and preserve damage", async () => {
  for (const damage of ["malformed", "unreadable", "wrong_mission"] as const) {
    const setup = await successfulWorkThenQATimeout(`checkpoint-${damage}`);
    const target = checkpointPath(setup.missionId);
    let preserved: Buffer;
    if (damage === "malformed") {
      preserved = Buffer.from("{ definitely-not-json");
      fs.writeFileSync(target, preserved);
    } else if (damage === "wrong_mission") {
      const wrong = { ...JSON.parse(fs.readFileSync(target, "utf8")), mission_id: id("different-owner") };
      preserved = Buffer.from(JSON.stringify(wrong, null, 2));
      fs.writeFileSync(target, preserved);
    } else {
      fs.rmSync(target);
      fs.mkdirSync(target);
      fs.writeFileSync(path.join(target, "sentinel.bin"), "unreadable-checkpoint-sentinel");
      preserved = fs.readFileSync(path.join(target, "sentinel.bin"));
    }

    let plans = 0;
    let executions = 0;
    let reviews = 0;
    const resumed = await managerFor(setup.missionId, {
      planMission: async () => { plans++; return { strategy: "must not happen", delegations: [delegation()] }; },
      executeSpecialist: async () => { executions++; throw new Error("must not run"); },
      reviewMissionDetailed: async () => { reviews++; return review(true); },
    }).run();
    assert.equal(resumed.mission.status, "paused");
    assert.equal((resumed.mission.metadata.recovery_blocked as any).kind, "checkpoint_integrity");
    assert.equal((resumed.mission.metadata.recovery_blocked as any).code, damage);
    assert.deepEqual([plans, executions, reviews, receiptLines(setup.sink).length], [0, 0, 0, 1]);
    if (damage === "unreadable") {
      assert.equal(fs.statSync(target).isDirectory(), true);
      assert.deepEqual(fs.readFileSync(path.join(target, "sentinel.bin")), preserved);
    } else {
      assert.deepEqual(fs.readFileSync(target), preserved, `${damage} evidence changed bytes`);
    }
  }
});

test("invalid stored plan hash fails closed before Head or specialist without replacing evidence", async () => {
  const setup = await successfulWorkThenQATimeout("invalid-plan");
  const target = checkpointPath(setup.missionId);
  const parsed = JSON.parse(fs.readFileSync(target, "utf8"));
  parsed.plan.plan_hash = "0".repeat(64);
  const damaged = Buffer.from(JSON.stringify(parsed, null, 2));
  fs.writeFileSync(target, damaged);
  let calls = 0;
  const resumed = await managerFor(setup.missionId, {
    planMission: async () => { calls++; throw new Error("must not replan invalid evidence"); },
    executeSpecialist: async () => { calls++; },
    reviewMissionDetailed: async () => { calls++; return review(true); },
  }).run();
  assert.equal(resumed.mission.status, "paused");
  assert.equal((resumed.mission.metadata.recovery_blocked as any).code, "malformed");
  assert.equal(calls, 0);
  assert.deepEqual(fs.readFileSync(target), damaged);
  assert.deepEqual(receiptLines(setup.sink), ["effect:1"]);
});

test("absent checkpoint remains a legitimate fresh run", async () => {
  const missionId = seed().id;
  assert.equal(lifecycle.loadCheckpoint(missionId), null);
  let effects = 0;
  const run = await managerFor(missionId, {
    planMission: async () => ({ strategy: "fresh", delegations: [delegation()] }),
    executeSpecialist: async (cfg: any, mid: string) => {
      effects++;
      return resultWithArtifact(cfg, mid, "fresh.txt", "fresh bytes");
    },
    reviewMissionDetailed: async () => review(true),
  }).run();
  assert.equal(run.mission.status, "completed");
  assert.equal(effects, 1);
});

test("schemas and the real deterministic gate reject missing or blank acceptance evidence", () => {
  const validMission = seed();
  for (const acceptance_criteria of [[], ["   "]]) {
    assert.equal(types.MissionSchema.safeParse({ ...validMission, acceptance_criteria }).success, false);
    const specification = {
      title: "x",
      objective: "x",
      scope: "x",
      acceptance_criteria,
      suggested_tools: [],
      suggested_agents: [],
      estimated_complexity: "simple",
      risks: [],
    };
    assert.equal(types.SpecificationSchema.safeParse(specification).success, false);
    const gated = qaGate.applyQAGate({ ...validMission, acceptance_criteria } as any, review(true).review, [
      { label: "result.txt", text: "verified bytes" },
    ]);
    assert.equal(gated.passed, false);
    assert.ok(gated.blockers.some((blocker) => /at least one non-blank acceptance criterion/i.test(blocker)));
  }
  const mixed = qaGate.applyQAGate({ ...validMission, acceptance_criteria: [criterion, " "] } as any, review(true).review, []);
  assert.equal(mixed.passed, false);
  assert.ok(mixed.blockers.some((blocker) => /criterion 2 is blank/i.test(blocker)));
  assert.equal(types.MissionSchema.safeParse(validMission).success, true);
});

test("manager bypassing schemas cannot start with zero criteria or produce any execution effects", async () => {
  const valid = seed();
  const before = fs.readFileSync(path.join(dataDir, "missions", `${valid.id}.json`));
  let calls = 0;
  const invalid = { ...valid, acceptance_criteria: [] } as any;
  await assert.rejects(manager.createMissionManager(invalid, 1000, {
    deps: {
      planMission: async () => { calls++; },
      executeSpecialist: async () => { calls++; },
      reviewMissionDetailed: async () => { calls++; },
      resolveModelForRole: () => "offline",
    },
  } as any).run(), /at least one non-blank acceptance criterion/);
  assert.equal(calls, 0);
  assert.equal(storage.loadMission(valid.id)!.status, "approved");
  assert.deepEqual(fs.readFileSync(path.join(dataDir, "missions", `${valid.id}.json`)), before);
  assert.equal(lifecycle.readMissionLease(valid.id), null);
  assert.equal(lifecycle.loadCheckpoint(valid.id), null);
  assert.deepEqual(storage.listArtifacts(valid.id), []);
});

function link(old: any, replacement: any, name: string): any {
  return {
    superseded_id: old.id,
    superseded_by: replacement.id,
    name,
    superseded_sha256: old.metadata.sha256,
    superseded_size_bytes: old.metadata.size_bytes,
    replacement_sha256: replacement.metadata.sha256,
    replacement_size_bytes: replacement.metadata.size_bytes,
    repair_iteration: 1,
    recorded_at: new Date().toISOString(),
    source: "repair",
    intent_id: crypto.randomUUID(),
    provenance_id: crypto.randomUUID(),
  };
}

async function forgedLineageRun(kind: "same_name" | "cross_name_chain") {
  const missionId = seed(id(`forged-${kind}`), "paused").id;
  const a = storage.saveArtifactFile(missionId, "index.html", "A index");
  await delay(15);
  // Keep the original A hidden even in the cross-name attack. Otherwise its
  // still-visible id would pass directly without exercising the forged chain.
  storage.saveArtifactFile(missionId, "index.html", "unrelated visible index");
  await delay(15);
  let links: any[];
  if (kind === "same_name") {
    const b = storage.saveArtifactFile(missionId, "index.html", "B index");
    links = [link(a, b, "index.html")];
  } else {
    const b = storage.saveArtifactFile(missionId, "notes.txt", "B notes");
    await delay(15);
    const c = storage.saveArtifactFile(missionId, "notes.txt", "C notes");
    links = [link(a, b, "index.html"), link(b, c, "notes.txt")];
  }
  storage.updateMissionAtomic(missionId, (current) => ({
    metadata: { ...current.metadata, artifact_supersessions: links },
  }));
  lifecycle.saveCheckpoint({
    mission_id: missionId,
    version: 1,
    saved_at: new Date().toISOString(),
    timeout_ms: 1000,
    elapsed_ms: 0,
    completed: [{
      index: 0,
      agent_role: "executor",
      task: "produce result",
      fingerprint: lifecycle.delegationFingerprint("executor", "produce result", "receipt"),
      status: "success",
      output: "confirmed A",
      artifacts: [a.id],
      duration_ms: 1,
    }],
    in_flight: [],
    repair_iterations: 2,
    reason: "manual",
  });
  let executions = 0;
  const resumed = await managerFor(missionId, {
    planMission: async () => ({ strategy: "same work", delegations: [delegation()] }),
    executeSpecialist: async () => { executions++; throw new Error("no repeat expected"); },
    reviewMissionDetailed: async () => review(true),
  }).run();
  assert.equal(resumed.mission.status, "failed");
  assert.equal(executions, 0);
  assert.ok((resumed.mission.metadata.qa_gate as any).blockers.some((blocker: string) => blocker.includes(a.id) && /not registered/.test(blocker)));
  assert.deepEqual(storage.loadMission(missionId)!.metadata.artifact_supersessions, links, "forged metadata is preserved for audit, not trusted");
}

test("real endpoint ids do not authenticate manufactured same-name or A(index) to B/C(notes) lineage", async () => {
  await forgedLineageRun("same_name");
  await forgedLineageRun("cross_name_chain");
});

async function genuineSameNameRepairPaused(label: string, mutate?: (missionId: string, a: any, b: any) => void) {
  const missionId = seed(id(label)).id;
  let originalEffects = 0;
  let repairEffects = 0;
  let reviews = 0;
  let a: any;
  let b: any;
  const awaitingAbort = (opts: any) => new Promise((_resolve, reject) => {
    const signal = opts.signal as AbortSignal;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const first = await managerFor(missionId, {
    planMission: async () => ({ strategy: "accepted", delegations: [delegation()] }),
    executeSpecialist: async (cfg: any, mid: string) => {
      if (!String(cfg.task).startsWith("Fix the following defects")) {
        originalEffects++;
        a = storage.saveArtifactFile(mid, "index.html", "A original");
        return outcome(cfg, [a.id]);
      }
      repairEffects++;
      await delay(15);
      b = storage.saveArtifactFile(mid, "index.html", "B repaired");
      return outcome(cfg, [b.id]);
    },
    reviewMissionDetailed: async (_m: any, _o: any, _a: any, opts: any) => {
      reviews++;
      if (reviews === 1) return review(false);
      return awaitingAbort(opts);
    },
  }, 160).run();
  assert.equal(first.mission.status, "paused");
  assert.deepEqual([originalEffects, repairEffects, reviews], [1, 1, 2]);
  const checkpoint = lifecycle.loadCheckpoint(missionId)!;
  assert.equal(checkpoint.repair_provenance?.length, 1);
  assert.equal(checkpoint.repair_provenance[0].source, "repair");
  assert.equal(checkpoint.repair_provenance[0].supersessions[0].superseded_id, a.id);
  assert.equal(checkpoint.repair_provenance[0].supersessions[0].superseded_by, b.id);
  assert.equal(checkpoint.repair_provenance[0].supersessions[0].superseded_sha256, sha("A original"));
  assert.equal(checkpoint.repair_provenance[0].supersessions[0].replacement_sha256, sha("B repaired"));
  mutate?.(missionId, a, b);
  return { missionId, a, b, originalEffects, repairEffects };
}

test("genuine repair provenance is required and old/new hash-size-byte substitutions fail without replaying original work", async () => {
  for (const mutation of ["none", "old_hash", "new_size", "replacement_bytes"] as const) {
    const setup = await genuineSameNameRepairPaused(`provenance-${mutation}`, (missionId, a, b) => {
      if (mutation === "replacement_bytes") {
        fs.writeFileSync(b.path, "X".repeat(Buffer.byteLength("B repaired")));
        return;
      }
      if (mutation === "none") return;
      storage.updateMissionAtomic(missionId, (current) => ({
        metadata: {
          ...current.metadata,
          artifact_supersessions: (current.metadata.artifact_supersessions as any[]).map((entry) => mutation === "old_hash"
            ? { ...entry, superseded_sha256: "0".repeat(64) }
            : { ...entry, replacement_size_bytes: entry.replacement_size_bytes + 1 }),
        },
      }));
    });
    let replayedOriginals = 0;
    let boundedRepairAttempts = 0;
    const resumed = await managerFor(setup.missionId, {
      planMission: async () => { throw new Error("stored plan should be used"); },
      executeSpecialist: async (cfg: any) => {
        if (!String(cfg.task).startsWith("Fix the following defects")) replayedOriginals++;
        else boundedRepairAttempts++;
        throw new Error("negative control: fail before any new effect");
      },
      reviewMissionDetailed: async () => review(true),
    }).run();
    assert.equal(resumed.mission.status, mutation === "none" ? "completed" : "failed");
    assert.equal(replayedOriginals, 0);
    assert.equal(boundedRepairAttempts, mutation === "none" ? 0 : 1, "only the remaining bounded repair slot may run");
    assert.deepEqual([setup.originalEffects, setup.repairEffects], [1, 1]);
    if (mutation === "none") {
      assert.deepEqual(storage.loadMission(setup.missionId)!.artifacts, [setup.b.id]);
      assert.throws(() => storage.saveArtifactFile(setup.missionId, "after-complete.txt", "late"), storage.MissionSealedError);
    } else {
      const blockers = (storage.loadMission(setup.missionId)!.metadata.qa_gate as any).blockers as string[];
      assert.ok(blockers.some((blocker) => /not registered|hash changed/.test(blocker)), blockers.join("|"));
    }
  }
});

test("completed, failed, and cancelled missions reject late metadata, bytes, writes, and reconciliation", async () => {
  const completed = seed();
  const completedRun = await managerFor(completed.id, {
    planMission: async () => ({ strategy: "fresh", delegations: [delegation()] }),
    executeSpecialist: async (cfg: any, mid: string) => resultWithArtifact(cfg, mid, "result.txt", "done"),
    reviewMissionDetailed: async () => review(true),
  }).run();
  assert.equal(completedRun.mission.status, "completed");

  const failed = seed();
  const failedRun = await managerFor(failed.id, {
    planMission: async () => ({ strategy: "fresh", delegations: [delegation()] }),
    executeSpecialist: async (cfg: any) => outcome(cfg, [], false),
    reviewMissionDetailed: async () => review(false),
  }).run();
  assert.equal(failedRun.mission.status, "failed");

  const cancelled = seed();
  await manager.cancelMission(cancelled.id, "offline terminal immutability control");
  assert.equal(storage.loadMission(cancelled.id)!.status, "cancelled");

  for (const missionId of [completed.id, failed.id, cancelled.id]) {
    const beforeRecords = fs.readdirSync(path.join(dataDir, "artifacts")).filter((name) => name.endsWith(".json")).length;
    assert.throws(() => storage.saveArtifactFile(missionId, "late.txt", "late"), storage.MissionSealedError);
    assert.throws(() => storage.saveArtifact({
      id: crypto.randomUUID(), mission_id: missionId, type: "text", name: "late-meta.txt",
      content: "late", created_at: new Date().toISOString(), metadata: {},
    }), storage.MissionSealedError);
    assert.throws(() => storage.withMissionWrite(missionId, () => fs.writeFileSync(path.join(root, `${missionId}-forbidden`), "late")), storage.MissionSealedError);
    const rawDir = path.join(dataDir, "artifacts", missionId);
    fs.mkdirSync(rawDir, { recursive: true });
    fs.writeFileSync(path.join(rawDir, "late-raw.bin"), "late");
    assert.deepEqual(storage.reconcileArtifactFiles(missionId), []);
    assert.equal(fs.existsSync(path.join(root, `${missionId}-forbidden`)), false);
    assert.equal(fs.existsSync(path.join(rawDir, "late.txt")), false);
    const afterRecords = fs.readdirSync(path.join(dataDir, "artifacts")).filter((name) => name.endsWith(".json")).length;
    assert.equal(afterRecords, beforeRecords);
  }
});

test("approved-before-running orphan is paused without work, live owners are protected, then resume executes once", async () => {
  const approved = seed(id("approved-orphan"));
  let executions = 0;
  const report = await lifecycle.reconcileOrphanedMissions();
  assert.ok(report.paused.includes(approved.id));
  assert.equal(storage.loadMission(approved.id)!.status, "paused");
  assert.equal(lifecycle.loadCheckpoint(approved.id), null);
  const resumed = await managerFor(approved.id, {
    planMission: async () => ({ strategy: "recovered approved mission", delegations: [delegation()] }),
    executeSpecialist: async (cfg: any, mid: string) => {
      executions++;
      return resultWithArtifact(cfg, mid, "once.txt", "once");
    },
    reviewMissionDetailed: async () => review(true),
  }).run();
  assert.equal(resumed.mission.status, "completed");
  assert.equal(executions, 1);

  const live = seed(id("approved-live-owner"));
  const lease = lifecycle.tryAcquireMissionLease(live.id, "run");
  assert.ok(lease);
  const liveReport = await lifecycle.reconcileOrphanedMissions();
  assert.ok(liveReport.skipped_live.includes(live.id));
  assert.equal(storage.loadMission(live.id)!.status, "approved");
  lease!.release();
  const deadReport = await lifecycle.reconcileOrphanedMissions();
  assert.ok(deadReport.paused.includes(live.id));
  assert.equal(storage.loadMission(live.id)!.status, "paused");

  const active = seed(id("excluded-running"), "running");
  const excluded = await lifecycle.reconcileOrphanedMissions(new Set([active.id]));
  assert.equal(storage.loadMission(active.id)!.status, "running");
  assert.equal(excluded.paused.includes(active.id), false);
});
