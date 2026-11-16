#!/usr/bin/env npx tsx
/**
 * R0 runtime: MissionManager cancellation, timeout, double-run, fingerprints,
 * no auto-saved deliverable. Fake agents injected through `deps`: no model calls.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { tempDir, spawnChild, baseMission, makeChecker, delay, passedReview, passedGate } from "./helpers/r0-runtime-util.js";

const { section, check, finish } = makeChecker("r0-runtime manager");

const root = tempDir();
const dataDir = path.join(root, "data");
process.env.AWE_DATA_DIR = dataDir;
process.env.ROUTER_CHEAP_API_KEY = "r0-offline-invalid-do-not-use";
const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const mgr = await import("../agents/mission-manager.js");

let n = 0;
const nextId = () => `cccccccc-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const seed = (over: Record<string, unknown> = {}) => {
  const id = nextId();
  storage.saveMission(baseMission(id, over) as any);
  return id;
};
const get = (id: string) => storage.loadMission(id)!;

const del = (role: string, task: string, parallel = false) => ({
  agent_role: role,
  task,
  context: "",
  tools: [] as string[],
  expected_output: "out",
  parallel,
});
const plan = (...d: ReturnType<typeof del>[]) => async () => ({ strategy: "t", delegations: d });
const okOutcome = (role: string, tools: string[] = ["file_write"]) => ({
  role,
  output: `done ${role}`,
  artifacts: [],
  success: true,
  tools_used: tools,
  model: "m",
});
const qaPass = async () => ({ review: passedReview(), gate: passedGate() }) as any;
const model = () => "test-model";

function manager(id: string, deps: Record<string, unknown>, opts: Record<string, unknown> = {}, timeoutMs = 30_000) {
  return mgr.createMissionManager(get(id), timeoutMs, { quiesceTimeoutMs: 1500, timeoutGraceMs: 500, deps, ...opts } as any);
}
const art = (id: string, name: string) => {
  // D3 intentionally rejects inline-only evidence. Keep the fixture's stable
  // ID while backing it with the same immutable bytes/hash/size contract.
  const file = path.join(dataDir, "artifacts", id, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "c", "utf-8");
  return {
    id: `${id}-${name}`, mission_id: id, name, type: "text", path: file, content: "c",
    created_at: new Date().toISOString(),
    metadata: { size_bytes: 1, sha256: crypto.createHash("sha256").update("c", "utf-8").digest("hex") },
  } as any;
};

section("M1 — normal run completes, signal is passed to every phase, lease released");
{
  const id = seed();
  const seen: Record<string, unknown> = {};
  const m = manager(id, {
    planMission: async (_m: unknown, o: any) => ((seen.plan = o?.signal instanceof AbortSignal), { strategy: "t", delegations: [del("executor", "make it")] }),
    executeSpecialist: async (cfg: any, mid: string, o: any) => {
      seen.exec = o;
      storage.saveArtifact(art(mid, "real.md"));
      return { ...okOutcome(cfg.role), artifacts: [`${mid}-real.md`] };
    },
    reviewMissionDetailed: async (_m: unknown, _o: unknown, _a: unknown, o: any) => ((seen.qa = o?.signal instanceof AbortSignal), qaPass()),
    resolveModelForRole: model,
  });
  const res = await m.run();
  check("completed", res.mission.status === "completed", res.mission.status);
  check("planMission got a signal", seen.plan === true);
  check("reviewMissionDetailed got a signal", seen.qa === true);
  check("executeSpecialist got maxSteps + signal", (seen.exec as any)?.maxSteps === 15 && (seen.exec as any)?.signal instanceof AbortSignal);
  check("registered artifact is in the final record", get(id).artifacts.length === 1);
  check("lease released", !lifecycle.hasLiveLease(id));
  check("checkpoint cleared on terminal", lifecycle.loadCheckpoint(id) === null);
  check("manager unregistered", mgr.getActiveMissionManager(id) === undefined);
}

section("M2 — LLM text is not auto-saved as a deliverable");
{
  const id = seed();
  const m = manager(id, {
    planMission: plan(del("writer", "write report")),
    executeSpecialist: async (cfg: any) => ({ ...okOutcome(cfg.role, []), output: "A long answer that is only text" }),
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  });
  await m.run();
  check("no artifact was created from the text", storage.listArtifacts(id).length === 0);
  const d = (get(id).metadata.execution as any).delegations[0];
  check("delegation without tools/artifacts is failed, not success", d.status === "failed", d.status);
  check("mission cannot complete without a deliverable", get(id).status === "failed", get(id).status);
}

section("M3 — a failed delegation is not reported as success");
{
  const id = seed();
  const m = manager(id, {
    planMission: plan(del("coder", "build")),
    executeSpecialist: async (cfg: any) => ({ ...okOutcome(cfg.role), success: false }),
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  });
  await m.run();
  const d = (get(id).metadata.execution as any).delegations[0];
  check("status failed", d.status === "failed", d.status);
  const tree = (get(id).metadata.delegation_tree as any).nodes;
  check("tree node failed", tree[0].status === "failed", tree[0].status);
}

section("M4 — in-process double run is rejected");
{
  const id = seed();
  const slow = {
    planMission: plan(del("executor", "produce durable proof")),
    executeSpecialist: async (_cfg: any, mid: string) => {
      storage.saveArtifact(art(mid, "double-run.md"));
      return { ...okOutcome("executor"), artifacts: [`${mid}-double-run.md`] };
    },
    reviewMissionDetailed: async () => (await delay(400), qaPass()),
    resolveModelForRole: model,
  };
  const a = manager(id, slow);
  const b = manager(id, slow);
  const pa = a.run();
  let err: Error | null = null;
  try { await b.run(); } catch (e) { err = e as Error; }
  check("second run rejected with MissionLeaseError", err?.name === "MissionLeaseError", err?.name);
  const ra = await pa;
  check("first run unaffected", ra.mission.status === "completed");
  check("rejected run wrote nothing over the first", get(id).status === "completed");
}

section("M5 — cancel mid-delegation: abort, quiesce, cancelled, no late writes");
{
  const id = seed();
  let started!: () => void;
  const startedP = new Promise<void>((r) => (started = r));
  let sawAbort = false;
  let qaRan = false;
  let lateArtifactRefused = false;
  const m = manager(id, {
    planMission: plan(del("executor", "slow job")),
    executeSpecialist: async (_c: any, mid: string, o: any) =>
      new Promise((resolve) => {
        started();
        o.signal.addEventListener("abort", async () => {
          sawAbort = true;
          await delay(300); // winding down
          try { storage.saveArtifact(art(mid, "late.md")); } catch (e) { lateArtifactRefused = (e as Error).name === "MissionSealedError"; }
          resolve(okOutcome("executor"));
        });
      }),
    reviewMissionDetailed: async () => ((qaRan = true), qaPass()),
    resolveModelForRole: model,
  });
  const run = m.run();
  await startedP;
  const t0 = Date.now();
  const cancel = await m.cancel("user asked");
  const result = await run;
  check("cancel resolved cancelled", cancel.cancelled && get(id).status === "cancelled", JSON.stringify(cancel));
  check("waited for the specialist to settle (quiesced)", cancel.quiesced && Date.now() - t0 >= 250, `${Date.now() - t0}ms`);
  check("specialist observed the abort", sawAbort);
  check("run() reports cancelled, not failed", result.mission.status === "cancelled");
  check("QA never ran", !qaRan);
  check("straggler artifact refused", lateArtifactRefused);
  check("no late artifact listed", storage.listArtifacts(id).length === 0);
  check("cancellation recorded", (get(id).metadata.cancellation as any)?.reason === "user asked" && (get(id).metadata.cancellation as any)?.quiesced === true);
  const late = storage.updateMissionAtomic(id, () => ({ status: "completed" }));
  check("old run cannot overwrite terminal state", !late.applied && get(id).status === "cancelled");
  check("lease released", !lifecycle.hasLiveLease(id));
}

section("M6 — non-cooperative work keeps ownership until it really settles");
{
  const id = seed();
  let started!: () => void;
  let release!: () => void;
  const startedP = new Promise<void>((r) => (started = r));
  const releasedP = new Promise<void>((r) => (release = r));
  const m = manager(id, {
    planMission: plan(del("executor", "stuck")),
    executeSpecialist: () => (started(), releasedP),
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  }, { quiesceTimeoutMs: 300 });
  const run = m.run();
  await startedP;
  const c = await m.cancel("stop");
  await run;
  check("non-quiesced cancellation is not confirmed terminal", !c.cancelled && get(id).status === "running", JSON.stringify(c));
  check("quiesced=false and pending reported", c.quiesced === false && c.pending_operations >= 1, JSON.stringify(c));
  check("record says it was not quiesced", (get(id).metadata.cancellation as any)?.quiesced === false);
  check("owner lease is retained while work is pending", lifecycle.hasLiveLease(id));
  release();
  const deadline = Date.now() + 5000;
  while (get(id).status !== "cancelled" && Date.now() < deadline) await delay(20);
  check("late settlement completes cancellation", get(id).status === "cancelled", get(id).status);
  check("lease released only after actual quiescence", !lifecycle.hasLiveLease(id));
}

section("M7 — timeout aborts the underlying work and pauses (not failed)");
{
  const id = seed();
  let sawAbort = false;
  const m = manager(id, {
    planMission: plan(del("executor", "never ends")),
    executeSpecialist: (_c: any, _m: string, o: any) =>
      new Promise((_r, reject) => o.signal.addEventListener("abort", () => ((sawAbort = true), reject(new Error("aborted"))))),
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  }, {}, 600);
  const res = await m.run();
  check("underlying specialist was aborted", sawAbort);
  check("mission paused, not failed", res.mission.status === "paused", res.mission.status);
  check("checkpoint reason timeout", lifecycle.loadCheckpoint(id)?.reason === "timeout");
  check("lease released", !lifecycle.hasLiveLease(id));
}

section("M7b — non-cooperative timeout cannot overlap a resumed run");
{
  const id = seed();
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  const m = manager(id, {
    planMission: plan(del("executor", "stuck until released")),
    executeSpecialist: () => released,
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  }, { quiesceTimeoutMs: 100, timeoutGraceMs: 20 }, 100);
  const res = await m.run();
  check("non-quiesced timeout remains running, not resumable paused", res.mission.status === "running", res.mission.status);
  check("timeout metadata exposes pending work", (get(id).metadata.timeout_recovery as any)?.quiesced === false);
  let leaseError: Error | null = null;
  try { await manager(id, { planMission: plan(), executeSpecialist: async () => okOutcome("x"), reviewMissionDetailed: qaPass, resolveModelForRole: model }).run(); }
  catch (err) { leaseError = err as Error; }
  check("rival cannot resume over pending old work", leaseError?.name === "MissionLeaseError", leaseError?.name);
  release();
  const deadline = Date.now() + 5000;
  while (get(id).status !== "paused" && Date.now() < deadline) await delay(20);
  check("actual settlement makes timeout resumable", get(id).status === "paused", get(id).status);
  check("deferred timeout releases lease", !lifecycle.hasLiveLease(id));
}

section("M7c — an exhausted resumed budget starts no new provider or tool effect");
{
  const id = seed({ status: "paused" });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(),
    timeout_ms: 100, elapsed_ms: 100, completed: [], repair_iterations: 1, reason: "timeout",
  });
  let calls = 0;
  const resumed = await manager(id, {
    planMission: async () => { calls++; throw new Error("exhausted budget must not replan"); },
    executeSpecialist: async () => { calls++; throw new Error("exhausted budget must not execute"); },
    reviewMissionDetailed: async () => { calls++; throw new Error("exhausted budget must not review"); },
    resolveModelForRole: () => { calls++; return model(); },
  }, { allowedStatuses: ["paused"] }, 100).run();
  check("exhausted resume remains paused rather than re-running work", resumed.mission.status === "paused");
  check("Head, specialist, QA and routing are all skipped", calls === 0, String(calls));
  check("durable elapsed time still exhausts the original budget", lifecycle.loadCheckpoint(id)!.elapsed_ms >= 100);
  check("timeout recovery records elapsed and configured budget",
    (get(id).metadata.timeout_recovery as any)?.elapsed_ms >= 100 &&
    (get(id).metadata.timeout_recovery as any)?.budget_ms === 100);
  check("exhausted owner releases its lease after quiescence", !lifecycle.hasLiveLease(id));
}

section("M8 — resume reuses only fingerprint-confirmed successes");
{
  const id = seed({ status: "paused" });
  const a = del("analyst", "analyse data");
  const b = del("coder", "write code v2");
  const c = del("writer", "write docs");
  const fp = lifecycle.delegationFingerprint;
  const entry = (i: number, d: typeof a, status: string, fingerprint?: string) => ({
    index: i, agent_role: d.agent_role, task: d.task, fingerprint, status, output: `old ${d.agent_role}`, artifacts: status === "success" ? [`${id}-${d.agent_role}.md`] : [], duration_ms: 1, tools_used: ["file_write"],
  });
  lifecycle.saveCheckpoint({
    mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 1000, elapsed_ms: 5,
    completed: [
      entry(0, a, "success", fp(a.agent_role, a.task, a.expected_output)),
      entry(1, { ...b, task: "write code v1" }, "success", fp("coder", "write code v1", "out")), // task changed
    ] as any,
    in_flight: [{ fingerprint: fp(c.agent_role, c.task, c.expected_output), agent_role: "writer", task: c.task, started_at: new Date().toISOString() }],
    repair_iterations: 0, reason: "process_exit",
  } as any);
  storage.saveArtifact(art(id, "analyst.md"));
  const ran: string[] = [];
  const m = manager(id, {
    planMission: plan(a, b, c),
    executeSpecialist: async (cfg: any, mid: string) => {
      ran.push(cfg.role);
      storage.saveArtifact(art(mid, `${cfg.role}.md`));
      return { ...okOutcome(cfg.role), artifacts: [`${mid}-${cfg.role}.md`] };
    },
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  }, { allowedStatuses: ["paused"] });
  const res = await m.run();
  check("analyst (confirmed success) not re-run", !ran.includes("analyst"), ran.join(","));
  check("coder with a changed task re-runs", ran.includes("coder"));
  check("in-flight writer re-runs", ran.includes("writer"));
  check("completed", res.mission.status === "completed");
  check("matchCompletedDelegations is fingerprint-exact",
    mgr.matchCompletedDelegations([a, { ...a, task: "other" }], {
      completed: [entry(0, a, "success", fp(a.agent_role, a.task, a.expected_output))],
    } as any).size === 1);
  check("fingerprint ignores whitespace differences", fp("a", " x  y ", "") === fp("a", "x y", ""));
  check("fingerprint distinguishes tasks", fp("a", "x", "") !== fp("a", "y", ""));
}

section("M9 — terminal/pending missions cannot be started; late run cannot flip state");
{
  const id = seed();
  const res = await mgr.cancelMission(id, "before start");
  check("cancel without a runner marks cancelled", res.cancelled && get(id).status === "cancelled", JSON.stringify(res));
  let err: Error | null = null;
  try { await manager(id, { planMission: plan(), executeSpecialist: async () => okOutcome("x"), reviewMissionDetailed: qaPass, resolveModelForRole: model }).run(); } catch (e) { err = e as Error; }
  check("run() on a cancelled mission rejected", err?.name === "MissionStateError", err?.name);
  check("status still cancelled", get(id).status === "cancelled");
  const pid = seed({ status: "pending_approval" });
  let err2: Error | null = null;
  try { await manager(pid, {}).run(); } catch (e) { err2 = e as Error; }
  check("pending_approval cannot run", err2?.name === "MissionStateError" && get(pid).status === "pending_approval");
  check("failed claim released the lease", !lifecycle.hasLiveLease(pid));
}

section("M10 — withMissionTimeout stays backward compatible and aborts fn");
{
  let aborted = false;
  let hit = false;
  let thrown: Error | null = null;
  try {
    await lifecycle.withMissionTimeout("t", 200, (signal: AbortSignal) => new Promise(() => signal.addEventListener("abort", () => (aborted = true))), async () => { hit = true; }, { settleGraceMs: 100 });
  } catch (e) { thrown = e as Error; }
  check("fn received the abort", aborted);
  check("onTimeout ran and MissionTimeoutError thrown", hit && thrown?.name === "MissionTimeoutError", thrown?.name);
  const v = await lifecycle.withMissionTimeout("t", 1000, async () => 42);
  check("zero-arg fn still resolves", v === 42);
}

section("M11 — cross-process: double-run rejected, cancel forwarded to the owner");
{
  const id = seed();
  const markers = tempDir("r0-markers-");
  const child = spawnChild(root, "manager-blocking", [id, markers]);
  await child.waitFor("DELEGATION_STARTED");
  check("owner process holds a live lease", lifecycle.hasLiveLease(id));
  let err: Error | null = null;
  try { await manager(id, { planMission: plan(), executeSpecialist: async () => okOutcome("x"), reviewMissionDetailed: qaPass, resolveModelForRole: model }).run(); } catch (e) { err = e as Error; }
  check("run from another process rejected", err?.name === "MissionLeaseError", err?.name);
  check("rival did not change the status", get(id).status === "running");
  const t0 = Date.now();
  const res = await mgr.cancelMission(id, "from parent", { waitMs: 15_000 });
  check("cancel confirmed by the owner", res.cancelled && get(id).status === "cancelled", JSON.stringify(res));
  check("owner's specialist was really aborted", fs.existsSync(path.join(markers, "specialist-aborted")));
  await child.waitFor("RESULT cancelled", 10_000);
  const exit = await child.exited;
  check("owner exited cleanly with cancelled result", exit.code === 0);
  check("lease gone", !lifecycle.hasLiveLease(id));
  check("fast confirmation (heartbeat poll)", Date.now() - t0 < 10_000, `${Date.now() - t0}ms`);
  fs.rmSync(markers, { recursive: true, force: true });
}

section("M12 — cross-process race: two processes run the same mission, one wins");
{
  const id = seed();
  const kids = [spawnChild(root, "manager-try", [id]), spawnChild(root, "manager-try", [id])];
  await Promise.all(kids.map((k) => k.waitFor("READY")));
  kids.forEach((k) => k.proc.stdin.write("go"));
  await Promise.all(kids.map((k) => k.exited));
  const outs = kids.map((k) => k.stdout());
  const ok = outs.filter((o) => o.includes("RESULT completed")).length;
  const rejected = outs.filter((o) => /ERROR (MissionLeaseError|MissionStateError)/.test(o)).length;
  check("exactly one run completed, the other rejected", ok === 1 && rejected === 1, outs.join("|"));
  check("final status completed", get(id).status === "completed");
}

section("M13 — duplicate Head plans and missing artifact bytes fail closed");
{
  const duplicateId = seed();
  let duplicateEffects = 0;
  const duplicate = del("executor", "exactly one effect", true);
  const duplicateRun = manager(duplicateId, {
    planMission: plan(duplicate, duplicate),
    executeSpecialist: async () => { duplicateEffects++; return okOutcome("executor"); },
    reviewMissionDetailed: qaPass,
    resolveModelForRole: model,
  });
  const duplicateResult = await duplicateRun.run();
  check("duplicate top-level plan is refused", duplicateResult.mission.status === "failed", duplicateResult.mission.status);
  check("refused duplicate plan has zero effects", duplicateEffects === 0, String(duplicateEffects));

  const missingId = seed();
  lifecycle.saveCheckpoint({ mission_id: missingId, version: 1, saved_at: new Date().toISOString(), timeout_ms: 1000, elapsed_ms: 0, completed: [], repair_iterations: 2, reason: "manual" });
  let artifactPath = "";
  const missingRun = manager(missingId, {
    planMission: plan(del("executor", "save then lose evidence")),
    executeSpecialist: async (_cfg: any, mid: string) => {
      const artifact = storage.saveArtifactFile(mid, "required.txt", "verified bytes");
      artifactPath = artifact.path!;
      return { ...okOutcome("executor"), artifacts: [artifact.id] };
    },
    reviewMissionDetailed: async () => { fs.rmSync(artifactPath, { force: true }); return qaPass(); },
    resolveModelForRole: model,
  });
  const missingResult = await missingRun.run();
  check("deleted required artifact blocks completion despite passing QA", missingResult.mission.status === "failed", missingResult.mission.status);
  check("artifact integrity blocker is recorded", (get(missingId).metadata.qa_gate as any).blockers.some((b: string) => /missing|unreadable|size changed|hash changed/.test(b)));
}

section("M14 — repair and reconciled evidence are integrity-fenced through completion");
{
  const repairId = seed();
  lifecycle.saveCheckpoint({ mission_id: repairId, version: 1, saved_at: new Date().toISOString(), timeout_ms: 1000, elapsed_ms: 0, completed: [], repair_iterations: 1, reason: "manual" });
  let repairPath = "";
  let repairReviews = 0;
  const repairRun = manager(repairId, {
    planMission: plan(del("executor", "create evidence requiring one repair")),
    executeSpecialist: async (cfg: any, mid: string) => {
      const repair = cfg.task.startsWith("Fix the following defects");
      const artifact = storage.saveArtifactFile(mid, repair ? "repair.txt" : "initial.txt", repair ? "repair evidence" : "initial evidence");
      if (repair) repairPath = artifact.path!;
      return { ...okOutcome("executor"), artifacts: [artifact.id] };
    },
    reviewMissionDetailed: async () => {
      repairReviews++;
      if (repairReviews === 1) return {
        review: { ...passedReview(), passed: false, defects: [{ issue: "repair required", severity: "major" }], verdict: "FAIL" },
        gate: { ...passedGate(), passed: false, blockers: ["repair required"] },
      };
      fs.rmSync(repairPath, { force: true });
      return qaPass();
    },
    resolveModelForRole: model,
  });
  const repairResult = await repairRun.run();
  check("deleted repair artifact blocks completion despite later passing QA", repairResult.mission.status === "failed" && repairReviews === 2, `${repairResult.mission.status}, reviews=${repairReviews}`);
  check("repair artifact integrity blocker is recorded", (get(repairId).metadata.qa_gate as any).blockers.some((b: string) => /repair\.txt.*missing|missing.*repair\.txt/.test(b)));

  const reconciledId = seed();
  lifecycle.saveCheckpoint({ mission_id: reconciledId, version: 1, saved_at: new Date().toISOString(), timeout_ms: 1000, elapsed_ms: 0, completed: [], repair_iterations: 2, reason: "manual" });
  let reconciledPath = "";
  const reconciledRun = manager(reconciledId, {
    planMission: plan(del("executor", "register primary and binary evidence")),
    executeSpecialist: async (_cfg: any, mid: string) => {
      const artifact = storage.saveArtifactFile(mid, "primary.txt", "primary evidence");
      reconciledPath = path.join(dataDir, "artifacts", mid, "reconciled.bin");
      fs.writeFileSync(reconciledPath, Buffer.from([1, 2, 3, 4]));
      return { ...okOutcome("executor"), artifacts: [artifact.id] };
    },
    reviewMissionDetailed: async () => {
      fs.rmSync(reconciledPath, { force: true });
      return qaPass();
    },
    resolveModelForRole: model,
  });
  const reconciledResult = await reconciledRun.run();
  check("deleted reconciled artifact blocks completion despite passing QA", reconciledResult.mission.status === "failed", reconciledResult.mission.status);
  check("reconciled artifact integrity blocker is recorded", (get(reconciledId).metadata.qa_gate as any).blockers.some((b: string) => /reconciled\.bin.*missing|missing.*reconciled\.bin/.test(b)));

  const emptyRepairId = seed();
  let emptyRepairReviews = 0;
  const emptyRepairRun = manager(emptyRepairId, {
    planMission: plan(del("executor", "repair must persist new evidence")),
    executeSpecialist: async (cfg: any, mid: string) => {
      const repair = cfg.task.startsWith("Fix the following defects");
      if (repair) return { ...okOutcome("executor"), output: "claims fixed", artifacts: storage.listArtifacts(mid).map((a) => a.id) };
      const artifact = storage.saveArtifactFile(mid, "original.txt", "original evidence");
      return { ...okOutcome("executor"), artifacts: [artifact.id] };
    },
    reviewMissionDetailed: async () => {
      emptyRepairReviews++;
      return {
        review: { ...passedReview(), passed: false, defects: [{ issue: "repair required", severity: "major" }], verdict: "FAIL" },
        gate: { ...passedGate(), passed: false, blockers: ["repair required"] },
      };
    },
    resolveModelForRole: model,
  });
  const emptyRepairResult = await emptyRepairRun.run();
  check("repair prose and reused artifact IDs cannot produce success", emptyRepairResult.mission.status === "failed" && emptyRepairReviews === 1, `${emptyRepairResult.mission.status}, reviews=${emptyRepairReviews}`);
  check("empty repair blocker is recorded", (get(emptyRepairId).metadata.qa_gate as any).blockers.some((b: string) => /Repair 1 produced no verified new artifact/.test(b)));
}

fs.rmSync(root, { recursive: true, force: true });
finish();
