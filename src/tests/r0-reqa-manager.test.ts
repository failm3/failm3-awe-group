#!/usr/bin/env npx tsx
/**
 * R0 re-QA manager regressions. Offline: injected plan/specialist/QA, fresh temp
 * AWE_DATA_DIR, real child processes for kills. No provider, no network.
 *
 *  D8 - an effect-bearing FAILED or THROWN attempt keeps its durable intent until an
 *       explicit accept/retry, so a later timeout or SIGKILL cannot re-run the effect.
 *  B  - repairs reserve and register in the mission-wide agent budget before any effect.
 *  D3 - a same-name genuine repair supersedes the original artifact reference explicitly
 *       and auditably, without weakening the immutable hash/size checks.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";
import { tempDir, baseMission, makeChecker, passedReview, passedGate, delay } from "./helpers/r0-runtime-util.js";
import { spawnReqaChild } from "./helpers/r0-reqa-manager-util.js";

const { section, check, finish } = makeChecker("r0-reqa-manager");

const root = tempDir("r0-reqa-manager-");
const dataDir = path.join(root, "data");
process.env.AWE_DATA_DIR = dataDir;
process.env.ROUTER_CHEAP_API_KEY = "r0-offline-invalid-do-not-use";
const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const mgr = await import("../agents/mission-manager.js");
const processRegistry = await import("../utils/process-registry.js");

let n = 0;
const nextId = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const seed = (over: Record<string, unknown> = {}) => {
  const id = nextId();
  storage.saveMission(baseMission(id, { metadata: { specification: { suggested_tools: ["save_artifact"] } }, ...over }) as any);
  return id;
};
const get = (id: string) => storage.loadMission(id)!;
const sha = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");

const del = (task: string) => ({ agent_role: "executor", task, context: "", tools: ["save_artifact"], expected_output: "out", parallel: false });
const ok = (artifacts: string[], success = true) => ({ role: "executor", output: "done", artifacts, success, tools_used: ["save_artifact"], model: "m" });
const qaPass = async () => ({ review: passedReview(), gate: passedGate() }) as any;
const qaFail = () => ({
  review: { ...passedReview(), passed: false, defects: [{ issue: "repair required", severity: "major" }], verdict: "FAIL" },
  gate: { ...passedGate(), passed: false, blockers: ["repair required"] },
}) as any;
const isRepair = (cfg: any) => String(cfg.task).startsWith("Fix the following defects");

function manager(id: string, deps: Record<string, unknown>, timeoutMs = 30_000) {
  return mgr.createMissionManager(get(id), timeoutMs, {
    quiesceTimeoutMs: 1000, timeoutGraceMs: 300, allowedStatuses: ["approved", "paused"], deps: { resolveModelForRole: () => "test-model", ...deps },
  } as any);
}
const blockersOf = (id: string): string[] => ((get(id).metadata.qa_gate as any)?.blockers ?? []) as string[];
const lineCount = (file: string, text?: string) =>
  fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split("\n").filter((l) => (text ? l === text : l.length > 0)).length : 0;
const inflightOf = (id: string) => (lifecycle.loadCheckpoint(id)?.in_flight ?? []) as any[];
const threw = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as Error).name; } };

async function runChild(scenario: string, id: string, receipts: string, extraEnv: Record<string, string> = {}) {
  const child = spawnReqaChild(root, scenario, id, receipts, extraEnv);
  const exit = await child.exited;
  return { ...exit, out: child.stdout(), err: child.stderr() };
}
async function crashed(scenario: string) {
  const id = seed({ status: "approved" });
  const sink = path.join(root, `receipts-${id}.log`);
  const crash = await runChild(scenario, id, sink);
  return { id, sink, crash };
}
async function resumeFresh(scenario: string, id: string, tag: string) {
  const sink = path.join(root, `fresh-${tag}-${id}.log`);
  const res = await runChild(scenario, id, sink);
  return { ...res, sink };
}

// ─── D8: failed / thrown outcomes after a real effect ───────────────────────

section("D8.A — returned success:false after a local effect, SIGKILL before terminalization");
{
  const { id, sink, crash } = await crashed("fail-effect-kill");
  check("owner died by SIGKILL after the failed checkpoint", crash.signal === "SIGKILL", `${crash.signal} ${crash.err.slice(0, 300)}`);
  check("exactly one receipt was sent", lineCount(sink) === 1);
  const cp = lifecycle.loadCheckpoint(id)!;
  check("failed outcome is checkpointed", cp.completed.length === 1 && cp.completed[0].status === "failed", JSON.stringify(cp.completed.map((c) => c.status)));
  const kept = inflightOf(id);
  check("effect-marked failed attempt keeps its durable intent", kept.length === 1 && kept[0].protocol === "intent-v1" && !!kept[0].effect_marked_at, JSON.stringify(kept));
  check("retained intent records the failed outcome", kept[0]?.failed_outcome?.thrown === false && kept[0].failed_outcome.issues.length > 0, JSON.stringify(kept[0]?.failed_outcome));

  await lifecycle.reconcileOrphanedMissions();
  const r1 = await resumeFresh("resume", id, "1");
  check("fresh manager does not execute again and is paused", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && lineCount(sink) === 1, r1.out + r1.err.slice(0, 300));
  const blocked = get(id).metadata.recovery_blocked as any;
  check("mission is paused with recovery_blocked", get(id).status === "paused" && blocked?.kind === "ambiguous_delegation_outcome" && blocked.entries.length === 1, JSON.stringify(blocked));
  check("blocked reason names the recorded failure", /recorded failure/.test(blocked?.entries?.[0]?.reasons?.join(" ") ?? ""), JSON.stringify(blocked?.entries?.[0]?.reasons));
  check("QA never ran on the unresolved mission", !/QA_RAN/.test(r1.out));

  const intentId = kept[0].intent_id as string;
  const artifact = storage.listArtifacts(id)[0];
  check("accept with an invented artifact is refused", threw(() => mgr.resolveAmbiguousDelegation(id, { intent_id: intentId, decision: "accept", operator: "op", note: "n", artifacts: ["invented"] })) === "MissionStateError");
  mgr.resolveAmbiguousDelegation(id, { intent_id: intentId, decision: "accept", operator: "r0-reqa", note: "receipt and artifact verified", artifacts: [artifact.id] });
  const r2 = await resumeFresh("resume", id, "2");
  check("explicit accept preserves the verified result: completes, nothing re-executed", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 0 && lineCount(sink) === 1, r2.out + r2.err.slice(0, 300));
  check("completed mission carries the accepted artifact", get(id).status === "completed" && get(id).artifacts.includes(artifact.id));
}

section("D8.B — explicit retry is the only repeat");
{
  const { id, sink, crash } = await crashed("fail-effect-kill");
  check("setup: failed attempt, one receipt", crash.signal === "SIGKILL" && lineCount(sink) === 1);
  await lifecycle.reconcileOrphanedMissions();
  const r1 = await resumeFresh("resume", id, "1");
  check("blocked before resolution, no repeat", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0);
  mgr.resolveAmbiguousDelegation(id, { intent_id: inflightOf(id)[0].intent_id, decision: "retry", operator: "r0-reqa", note: "receipt is idempotent" });
  const r2 = await resumeFresh("resume", id, "2");
  check("after explicit retry the effect repeats exactly once and the mission completes", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 1, r2.out + r2.err.slice(0, 300));
}

section("D8.C — returned failure with an effect marker but no artifact");
{
  const { id, sink, crash } = await crashed("fail-effect-noartifact-kill");
  check("setup: killed after the failed checkpoint, one receipt", crash.signal === "SIGKILL" && lineCount(sink) === 1, crash.err.slice(0, 300));
  check("marker-only failed attempt keeps its intent", inflightOf(id).length === 1 && !!inflightOf(id)[0].failed_outcome);
  await lifecycle.reconcileOrphanedMissions();
  const r1 = await resumeFresh("resume", id, "1");
  check("no repeat; paused with recovery_blocked", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && !!(get(id).metadata.recovery_blocked as any), r1.out);
  const entry = inflightOf(id)[0];
  check("accept without evidence stays refused", threw(() => mgr.resolveAmbiguousDelegation(id, { intent_id: entry.intent_id, decision: "accept", operator: "op", note: "n" })) === "MissionStateError");
  mgr.resolveAmbiguousDelegation(id, { intent_id: entry.intent_id, decision: "retry", operator: "op", note: "safe to repeat" });
  const r2 = await resumeFresh("resume", id, "2");
  check("retry repeats once", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 1);
}

section("D8.D — thrown non-abort provider error after a local effect, SIGKILL before terminalization");
{
  const { id, sink, crash } = await crashed("throw-effect-kill");
  check("setup: killed, one receipt", crash.signal === "SIGKILL" && lineCount(sink) === 1, crash.err.slice(0, 300));
  const kept = inflightOf(id);
  check("thrown effect-marked attempt keeps its intent", kept.length === 1 && kept[0].failed_outcome?.thrown === true && /provider 500/.test(kept[0].failed_outcome.issues.join(" ")), JSON.stringify(kept));
  await lifecycle.reconcileOrphanedMissions();
  const r1 = await resumeFresh("resume", id, "1");
  check("fresh manager makes no repeat; paused with recovery_blocked", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && lineCount(sink) === 1 && !!(get(id).metadata.recovery_blocked as any), r1.out);
}

section("D8.E — non-effect definite failure keeps the old behaviour");
{
  const { id, crash } = await crashed("fail-noeffect-kill");
  check("setup: killed in QA", crash.signal === "SIGKILL", crash.err.slice(0, 300));
  check("no intent retained for a failure with no footprint", inflightOf(id).length === 0, JSON.stringify(inflightOf(id)));
  await lifecycle.reconcileOrphanedMissions();
  const r1 = await resumeFresh("resume", id, "1");
  check("fresh manager is not blocked and re-runs the delegation", /RESULT completed/.test(r1.out) && lineCount(r1.sink) === 1, r1.out + r1.err.slice(0, 300));
}

section("D8.F — in-process failed checkpoints gate before QA even without a crash");
{
  for (const mode of ["returned", "thrown"] as const) {
    const id = seed();
    let execs = 0;
    let qaCalls = 0;
    const sink = path.join(root, `ordinary-${mode}-${id}.log`);
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("send-receipt")] }),
      executeSpecialist: async (_c: any, mid: string, opts: any) => {
        execs++;
        opts.beginEffect?.("send receipt");
        fs.appendFileSync(sink, "send-receipt\n");
        if (mode === "thrown") throw new Error("provider 503 after send");
        return ok([storage.saveArtifactFile(mid, "r.txt", "receipt").id], false);
      },
      reviewMissionDetailed: (_m: any, _o: string, _c: string[], opts: { signal: AbortSignal }) => {
        qaCalls++;
        return new Promise((_res, rej) => opts.signal.addEventListener("abort", () => rej(opts.signal.reason), { once: true }));
      },
    }, 1500);
    let outcome = "";
    try { outcome = (await m.run()).mission.status; } catch (e) { outcome = `${(e as Error).name}`; }
    check(`${mode}: ordinary failed outcome pauses before QA`, get(id).status === "paused" && outcome === "paused" && qaCalls === 0, `${outcome}/${get(id).status} qa=${qaCalls}`);
    check(`${mode}: failed intent survived the timeout checkpoint`, inflightOf(id).some((e) => !!e.failed_outcome), JSON.stringify(inflightOf(id)));
    let freshExecs = 0;
    const fresh = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("send-receipt")] }),
      executeSpecialist: async () => { freshExecs++; return ok([]); },
      reviewMissionDetailed: qaPass,
    });
    const res = await fresh.run();
    check(`${mode}: fresh manager repeats nothing and pauses recovery_blocked`, freshExecs === 0 && execs === 1 && lineCount(sink) === 1 && res.mission.status === "paused" && !!(get(id).metadata.recovery_blocked as any), `${res.mission.status} fresh=${freshExecs} execs=${execs}`);
  }
}

section("D8.G — ordinary returned/thrown effect failures pause before QA and terminalization");
{
  for (const mode of ["returned", "thrown"] as const) {
    const id = seed();
    let executions = 0;
    let reviews = 0;
    let artifactId = "";
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("send-receipt")] }),
      executeSpecialist: async (_cfg: any, mid: string, opts: any) => {
        executions++;
        opts.beginEffect?.("send receipt");
        artifactId = storage.saveArtifactFile(mid, "evidence.txt", "recorded effect evidence").id;
        if (mode === "thrown") throw new Error("provider failed after the effect");
        return ok([artifactId], false);
      },
      reviewMissionDetailed: async () => { reviews++; return qaPass(); },
    });
    const first = await m.run();
    const kept = inflightOf(id);
    check(`${mode}: live ordinary failure pauses without QA and retains its intent`, first.mission.status === "paused" && executions === 1 && reviews === 0 && kept.length === 1 && !!kept[0].failed_outcome, `${first.mission.status} executions=${executions} reviews=${reviews} ${JSON.stringify(kept)}`);
    mgr.resolveAmbiguousDelegation(id, { intent_id: kept[0].intent_id, decision: "accept", operator: "r0-reqa", note: "effect evidence verified", artifacts: [artifactId] });
    let resumedExecutions = 0;
    const resumed = await manager(id, {
      planMission: async () => { throw new Error("stored plan must be reused"); },
      executeSpecialist: async () => { resumedExecutions++; return ok([]); },
      reviewMissionDetailed: qaPass,
    }).run();
    check(`${mode}: explicit accept completes without repeating the effect`, resumed.mission.status === "completed" && resumedExecutions === 0 && executions === 1, `${resumed.mission.status} resumed=${resumedExecutions}`);
  }
}

section("D8.H — failed effect-bearing repair keeps its intent");
{
  for (const mode of ["returned", "thrown"] as const) {
    const id = seed();
    const sink = path.join(root, `repair-${mode}-${id}.log`);
    let repairs = 0;
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
      executeSpecialist: async (cfg: any, mid: string, opts: any) => {
        if (!isRepair(cfg)) return ok([storage.saveArtifactFile(mid, "initial.txt", "initial").id]);
        repairs++;
        opts.beginEffect?.("repair effect");
        fs.appendFileSync(sink, "repair-effect\n");
        // The failed outcome itself must pause durably before any terminal write.
        if (mode === "thrown") throw new Error("provider 500 in repair");
        return ok([], false);
      },
      reviewMissionDetailed: async () => qaFail(),
    });
    let err = "";
    try { await m.run(); } catch (e) { err = (e as Error).name; }
    const kept = inflightOf(id).filter((e) => e.kind === "repair");
    check(`${mode}: repair ran once and the failed repair intent is still durable`, repairs === 1 && kept.length === 1 && !!kept[0].effect_marked_at, `err=${err} ${JSON.stringify(inflightOf(id))}`);
    if (mode === "returned") check("returned failure is recorded on the retained intent", !!kept[0]?.failed_outcome && kept[0].failed_outcome.thrown === false);
    let freshExecs = 0;
    const fresh = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
      executeSpecialist: async () => { freshExecs++; return ok([]); },
      reviewMissionDetailed: qaPass,
    });
    const res = await fresh.run();
    const entries = (get(id).metadata.recovery_blocked as any)?.entries ?? [];
    check(`${mode}: fresh manager executes nothing; paused, recovery_blocked for the repair`, freshExecs === 0 && lineCount(sink) === 1 && res.mission.status === "paused" && entries.some((e: any) => e.kind === "repair"), `${res.mission.status} ${JSON.stringify(entries)}`);
  }
}

section("D8.I — failed repairs quiesce real descendants before paused state");
{
  const alive = (pid: number): boolean => {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const state = stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/)[0];
      if (state === "Z") return false;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    }
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  for (const mode of ["returned", "thrown"] as const) {
    const id = seed();
    const groups: Array<ReturnType<typeof processRegistry.attachDetachedProcessGroup>> = [];
    try {
      const m = manager(id, {
        planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
        executeSpecialist: async (cfg: any, mid: string, opts: any) => {
          if (!isRepair(cfg)) return ok([storage.saveArtifactFile(mid, "initial.txt", "initial").id]);
          opts.beginEffect?.(`${mode} repair process effect`);
          const prepared = processRegistry.prepareDetachedProcessGroup(mid);
          const child = spawn(process.execPath, ["-e", `
            const fs = require('node:fs');
            const release = process.argv[1];
            const timer = setInterval(() => {
              if (fs.existsSync(release)) { clearInterval(timer); setInterval(() => {}, 1000); }
            }, 5);
          `, prepared.releasePath], { detached: true, stdio: "ignore", env: { PATH: process.env.PATH } });
          const attached = processRegistry.attachDetachedProcessGroup(prepared, child.pid);
          groups.push(attached);
          processRegistry.releaseDetachedProcessGroup(attached);
          child.unref();
          if (mode === "thrown") throw new Error("intentional thrown repair failure after process launch");
          return ok([], false);
        },
        reviewMissionDetailed: async () => qaFail(),
      });
      const result = await m.run();
      const group = groups[0];
      const kept = inflightOf(id).find((entry) => entry.kind === "repair" && entry.failed_outcome);
      check(`${mode}: repair pause follows child death, process-record cleanup and lease release`, result.mission.status === "paused" && !!group && !alive(group.pid) && !fs.existsSync(group.recordPath) && lifecycle.readMissionLease(id) === null && !!kept, `${result.mission.status} pid=${group?.pid} alive=${group ? alive(group.pid) : false} record=${group ? fs.existsSync(group.recordPath) : false} lease=${JSON.stringify(lifecycle.readMissionLease(id))}`);
      check(`${mode}: quiesced repair recovery retains its failed outcome and QA blockers`, !!kept?.ambiguous && blockersOf(id).some((blocker) => /Repair 1/.test(blocker)), JSON.stringify({ kept, blockers: blockersOf(id) }));
    } finally {
      await processRegistry.quiesceCurrentMissionProcessGroups(id, { graceMs: 20, timeoutMs: 1000 });
      const cleanupGroup = groups[0];
      if (cleanupGroup && alive(cleanupGroup.pid)) {
        try { process.kill(-cleanupGroup.pid, "SIGKILL"); } catch { /* already gone */ }
      }
    }
  }
}

// ─── Budget: repairs are agents ─────────────────────────────────────────────

const budgetFile = (id: string) => path.join(dataDir, "delegation-budgets", `${id}.json`);
const ledgerOf = (id: string) => JSON.parse(fs.readFileSync(budgetFile(id), "utf-8")) as { total_agents: number };
const treeOf = (id: string) => get(id).metadata.delegation_tree as { total_agents: number; nodes: Array<{ id: string; role: string; status: string; depth: number }> };

section("B.1 — 12 originals + failed initial QA: repair 13 is refused before any effect");
{
  const id = seed();
  let specialistCalls = 0;
  let repairCalls = 0;
  const plan = Array.from({ length: 12 }, (_, i) => del(`unit-${i}`));
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: plan }),
    executeSpecialist: async (cfg: any, mid: string) => {
      specialistCalls++;
      if (isRepair(cfg)) { repairCalls++; return ok([storage.saveArtifactFile(mid, "repair.txt", "repair").id]); }
      return ok([storage.saveArtifactFile(mid, `${cfg.task}.txt`, `evidence ${cfg.task}`).id]);
    },
    reviewMissionDetailed: async () => qaFail(),
  });
  const res = await m.run();
  check("exactly 12 specialists executed", specialistCalls === 12 && repairCalls === 0, `calls=${specialistCalls} repairs=${repairCalls}`);
  check("mission fails and names the refused repair", res.mission.status === "failed" && blockersOf(id).some((b) => /Repair 1 refused before any effect/.test(b) && /budget exhausted/.test(b)), `${res.mission.status} ${blockersOf(id).join("|")}`);
  check("no repair artifact or intent was created", !storage.listArtifacts(id).some((a) => a.name === "repair.txt"));
  check("durable ledger and tree agree on 12", ledgerOf(id).total_agents === 12 && treeOf(id).total_agents === 12 && treeOf(id).nodes.length === 12, `${ledgerOf(id).total_agents}/${treeOf(id).total_agents}/${treeOf(id).nodes.length}`);
  check("repair iteration count was not consumed by the refusal", (get(id).metadata.execution as any)?.repair_iterations === 0, String((get(id).metadata.execution as any)?.repair_iterations));
}

section("B.2 — under-cap repair registers and finalizes in the tree");
{
  const id = seed();
  let reviews = 0;
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
    executeSpecialist: async (cfg: any, mid: string) =>
      ok([isRepair(cfg) ? storage.saveArtifactFile(mid, "fixed.txt", "fixed").id : storage.saveArtifactFile(mid, "initial.txt", "initial").id]),
    reviewMissionDetailed: async () => (++reviews === 1 ? qaFail() : qaPass()),
  });
  const res = await m.run();
  check("repaired mission completes", res.mission.status === "completed", res.mission.status + blockersOf(id).join("|"));
  const tree = treeOf(id);
  check("ledger and tree both count original + repair", ledgerOf(id).total_agents === 2 && tree.total_agents === 2 && tree.nodes.length === 2, `${ledgerOf(id).total_agents}/${tree.total_agents}/${tree.nodes.length}`);
  check("both nodes are depth 0, finalized as success", tree.nodes.every((nd) => nd.depth === 0 && nd.status === "success"), JSON.stringify(tree.nodes));
}

section("B.3 — failed repair node is finalized failed, slot stays consumed");
{
  const id = seed();
  let reviews = 0;
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
    executeSpecialist: async (cfg: any, mid: string) => (isRepair(cfg) ? ok([], false) : ok([storage.saveArtifactFile(mid, "initial.txt", "initial").id])),
    reviewMissionDetailed: async () => (++reviews === 1 ? qaFail() : qaPass()),
  });
  const res = await m.run();
  const tree = treeOf(id);
  check("mission fails on the failed repair", res.mission.status === "failed");
  check("repair node exists and is failed; ledger counts 2", tree.nodes.length === 2 && tree.nodes.filter((nd) => nd.status === "failed").length === 1 && ledgerOf(id).total_agents === 2, JSON.stringify(tree.nodes));
}

// ─── D3: same-name genuine repair ───────────────────────────────────────────

section("D3.A — same-name repair, QA fail then pass, completes with current B");
let sameName: { id: string; a: string; b: string };
{
  const id = seed();
  let reviews = 0;
  let a = ""; let b = "";
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (cfg: any, mid: string) => {
      if (!isRepair(cfg)) { a = storage.saveArtifactFile(mid, "index.html", "<h1>A original</h1>").id; return ok([a]); }
      await delay(15);
      b = storage.saveArtifactFile(mid, "index.html", "<h1>B repaired</h1>").id;
      return ok([b]);
    },
    reviewMissionDetailed: async () => (++reviews === 1 ? qaFail() : qaPass()),
  });
  const res = await m.run();
  sameName = { id, a, b };
  check("mission completes (no false 'not registered' rejection)", res.mission.status === "completed", res.mission.status + blockersOf(id).join("|"));
  check("attached artifact is the current B only", JSON.stringify(get(id).artifacts) === JSON.stringify([b]), JSON.stringify(get(id).artifacts));
  const links = (get(id).metadata.artifact_supersessions ?? []) as any[];
  check("auditable supersession mapping A -> B is preserved", links.length === 1 && links[0].superseded_id === a && links[0].superseded_by === b && links[0].name === "index.html" && links[0].repair_iteration === 1 && links[0].source === "repair", JSON.stringify(links));
  check("mapping keeps A's recorded sha256 and size", links[0]?.superseded_sha256 === sha("<h1>A original</h1>") && links[0].superseded_size_bytes === Buffer.byteLength("<h1>A original</h1>"), JSON.stringify(links[0]));
  check("B passes the immutable check on disk", fs.readFileSync(storage.listArtifacts(id)[0].path!, "utf-8") === "<h1>B repaired</h1>");
}

section("D3.B — supersession never waives integrity or accepts invented ids");
{
  // B is corrupted after the repair: the supersession must not rescue it.
  const idA = seed();
  let reviews = 0;
  const mA = manager(idA, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (cfg: any, mid: string) => {
      if (!isRepair(cfg)) return ok([storage.saveArtifactFile(mid, "index.html", "<h1>A</h1>").id]);
      await delay(15);
      return ok([storage.saveArtifactFile(mid, "index.html", "<h1>B</h1>").id]);
    },
    reviewMissionDetailed: async () => {
      if (++reviews === 1) return qaFail();
      fs.writeFileSync(storage.listArtifacts(idA)[0].path!, "<h1>TAMPERED</h1>");
      return qaPass();
    },
  });
  const rA = await mA.run();
  check("tampered B is still rejected despite the mapping", rA.mission.status === "failed" && blockersOf(idA).some((x) => /hash changed|size changed/.test(x)), rA.mission.status + blockersOf(idA).join("|"));

  // Repair writes the same name but does not report B: no new reported artifact -> no supersession.
  const idB = seed();
  let reviewsB = 0;
  const mB = manager(idB, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (cfg: any, mid: string) => {
      if (!isRepair(cfg)) return ok([storage.saveArtifactFile(mid, "index.html", "<h1>A</h1>").id]);
      await delay(15);
      storage.saveArtifactFile(mid, "index.html", "<h1>B unreported</h1>");
      return ok([]);
    },
    reviewMissionDetailed: async () => (++reviewsB === 1 ? qaFail() : qaPass()),
  });
  const rB = await mB.run();
  check("unreported replacement records no supersession and pauses for explicit recovery", rB.mission.status === "paused" && !(get(idB).metadata.artifact_supersessions as any[] | undefined)?.length && inflightOf(idB).some((entry) => entry.kind === "repair" && entry.failed_outcome), rB.mission.status);

  // An original artifact vanishing from the registry (no repair) is still rejected.
  const idC = seed();
  const mC = manager(idC, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (_c: any, mid: string) => ok([storage.saveArtifactFile(mid, "index.html", "<h1>A</h1>").id, storage.saveArtifactFile(mid, "other.txt", "x").id]),
    reviewMissionDetailed: async () => {
      const gone = storage.listArtifacts(idC).find((x) => x.name === "other.txt")!;
      fs.rmSync(path.join(dataDir, "artifacts", `${gone.id}.json`));
      return qaPass();
    },
  });
  const rC = await mC.run();
  check("deleted original record without a repair is still 'not registered'", rC.mission.status === "failed" && blockersOf(idC).some((x) => /is not registered/.test(x)), rC.mission.status + blockersOf(idC).join("|"));

  // A forged mapping for an id that never existed does not resolve. The result comes
  // from a checkpoint, the only way an unregistered id can reach the evidence gate.
  const idD = seed({ status: "paused" });
  const real = storage.saveArtifactFile(idD, "index.html", "<h1>A</h1>");
  storage.updateMissionAtomic(idD, (cur) => ({
    metadata: { ...cur.metadata, artifact_supersessions: [{ superseded_id: "invented-id", superseded_by: real.id, name: "index.html", repair_iteration: 1, recorded_at: new Date().toISOString(), source: "repair" }] },
  }));
  lifecycle.saveCheckpoint({
    mission_id: idD, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000, elapsed_ms: 0, repair_iterations: 0, reason: "manual",
    completed: [{ index: 0, agent_role: "executor", task: "make index", status: "success", output: "done", artifacts: ["invented-id"], duration_ms: 1 }],
    in_flight: [],
  } as any);
  let dExecs = 0;
  const mD = manager(idD, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (cfg: any) => { if (!isRepair(cfg)) dExecs++; return ok([]); },
    reviewMissionDetailed: qaPass,
  });
  const rD = await mD.run();
  check("forged mapping for an invented id is ignored", dExecs === 0 && rD.mission.status === "failed" && blockersOf(idD).some((x) => /'invented-id' is not registered/.test(x)), `${rD.mission.status} ${blockersOf(idD).join("|")}`);

  // A real production repair creates the predecessor, replacement and durable
  // checkpoint provenance. Writable metadata alone is not a positive control.
  const idE = seed();
  let reviewsE = 0;
  let aE = "";
  let bE = "";
  const mE = manager(idE, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (_cfg: any, mid: string) => {
      if (!isRepair(_cfg)) {
        aE = storage.saveArtifactFile(mid, "index.html", "<h1>A</h1>").id;
        return ok([aE]);
      }
      await delay(15);
      bE = storage.saveArtifactFile(mid, "index.html", "<h1>B</h1>").id;
      return ok([bE]);
    },
    reviewMissionDetailed: async () => (++reviewsE === 1 ? qaFail() : qaPass()),
  });
  const rE = await mE.run();
  const provenLinks = (get(idE).metadata.artifact_supersessions ?? []) as any[];
  check("genuine repair provenance resolves a real hidden predecessor to integrity-valid B", rE.mission.status === "completed" && aE !== bE && provenLinks.length === 1 && provenLinks[0].superseded_id === aE && provenLinks[0].superseded_by === bE && provenLinks[0].source === "repair" && !!provenLinks[0].intent_id && !!provenLinks[0].provenance_id && get(idE).artifacts.join(",") === bE, `${rE.mission.status} ${blockersOf(idE).join("|")} ${JSON.stringify(provenLinks)}`);

  // ...and the same mapping cannot launder a tampered B.
  const idF = seed({ status: "paused" });
  const aF = storage.saveArtifactFile(idF, "index.html", "<h1>A</h1>");
  await delay(15);
  const bF = storage.saveArtifactFile(idF, "index.html", "<h1>B</h1>");
  fs.writeFileSync(bF.path!, "<h1>TAMPERED</h1>");
  storage.updateMissionAtomic(idF, (cur) => ({
    metadata: { ...cur.metadata, artifact_supersessions: [{ superseded_id: aF.id, superseded_by: bF.id, name: "index.html", repair_iteration: 1, recorded_at: new Date().toISOString(), source: "repair" }] },
  }));
  lifecycle.saveCheckpoint({
    mission_id: idF, version: 1, saved_at: new Date().toISOString(), timeout_ms: 30_000, elapsed_ms: 0, repair_iterations: 1, reason: "manual",
    completed: [{ index: 0, agent_role: "executor", task: "make index", status: "success", output: "done", artifacts: [aF.id], duration_ms: 1 }],
    in_flight: [],
  } as any);
  const mF = manager(idF, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async () => ok([]),
    reviewMissionDetailed: qaPass,
  });
  const rF = await mF.run();
  check("mapping cannot launder a tampered B", rF.mission.status === "failed" && blockersOf(idF).some((x) => /hash changed|size changed/.test(x)), `${rF.mission.status} ${blockersOf(idF).join("|")}`);
}

section("D3.C — different-name repair control stays green");
{
  const id = seed();
  let reviews = 0;
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: [del("make index")] }),
    executeSpecialist: async (cfg: any, mid: string) =>
      ok([isRepair(cfg) ? storage.saveArtifactFile(mid, "fixed.html", "fixed").id : storage.saveArtifactFile(mid, "index.html", "orig").id]),
    reviewMissionDetailed: async () => (++reviews === 1 ? qaFail() : qaPass()),
  });
  const res = await m.run();
  check("completes with no supersession recorded", res.mission.status === "completed" && !(get(id).metadata.artifact_supersessions as any[] | undefined)?.length, res.mission.status + blockersOf(id).join("|"));
  check("both artifacts attached", get(id).artifacts.length === 2);
}

section("D3.D — crash during a same-name repair: explicit accept applies equivalent supersession");
{
  const { id, sink, crash } = await crashed("samename-crash");
  check("setup: original and repair effect once each; repair died", crash.signal === "SIGKILL" && lineCount(sink, "make-index") === 1 && lineCount(sink, "repair-effect") === 1, crash.err.slice(0, 300));
  const original = JSON.parse(fs.readFileSync(path.join(dataDir, "checkpoints", `${id}.json`), "utf-8")).completed[0].artifacts[0] as string;
  await lifecycle.reconcileOrphanedMissions();
  const r1 = await resumeFresh("resume-samename", id, "1");
  const entries = (get(id).metadata.recovery_blocked as any)?.entries ?? [];
  check("resume blocked on the repair, nothing executed", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && entries.length === 1 && entries[0].kind === "repair", r1.out + JSON.stringify(entries));
  const b = storage.listArtifacts(id).find((x) => x.name === "index.html")!;
  check("setup: listArtifacts shows B, original record A is hidden", b.id !== original && !storage.listArtifacts(id).some((x) => x.id === original));
  mgr.resolveAmbiguousDelegation(id, { intent_id: entries[0].intent_id, decision: "accept", operator: "r0-reqa", note: "repair verified", artifacts: [b.id] });
  const cp = lifecycle.loadCheckpoint(id)!;
  check("checkpoint now references B, no stale A", JSON.stringify(cp.completed[0].artifacts) === JSON.stringify([b.id]), JSON.stringify(cp.completed[0].artifacts));
  const links = (get(id).metadata.artifact_supersessions ?? []) as any[];
  check("supersession mapping recorded with operator_accept source", links.length === 1 && links[0].superseded_id === original && links[0].superseded_by === b.id && links[0].source === "operator_accept", JSON.stringify(links));
  const r2 = await resumeFresh("resume-samename", id, "2");
  check("resume completes without repeating any effect", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 0, r2.out + r2.err.slice(0, 300));
  check("terminal record holds only B", JSON.stringify(get(id).artifacts) === JSON.stringify([b.id]), JSON.stringify(get(id).artifacts));
}

section("D3.E — accept of a different-name repair records no supersession");
{
  // Control through the existing child scenario shape: reuse the same-name child but accept an unrelated registered artifact.
  const { id, crash } = await crashed("samename-crash");
  check("setup", crash.signal === "SIGKILL");
  await lifecycle.reconcileOrphanedMissions();
  await resumeFresh("resume-samename", id, "1");
  const entries = (get(id).metadata.recovery_blocked as any)?.entries ?? [];
  const extra = storage.saveArtifactFile(id, "notes.txt", "extra evidence");
  mgr.resolveAmbiguousDelegation(id, { intent_id: entries[0].intent_id, decision: "accept", operator: "op", note: "only the notes file", artifacts: [extra.id] });
  const links = (get(id).metadata.artifact_supersessions ?? []) as any[];
  check("a new artifact of a different name supersedes nothing", links.length === 0, JSON.stringify(links));
}

section("D3.F — explicit same-name repair retry executes once and preserves A→B→C");
{
  const { id, sink, crash } = await crashed("samename-retry");
  const cp = lifecycle.loadCheckpoint(id)!;
  const original = cp.completed[0].artifacts?.[0];
  const ambiguous = inflightOf(id).find((entry) => entry.kind === "repair")!;
  const b = storage.listArtifacts(id).find((artifact) => artifact.name === "index.html")!;
  check("setup pauses after exactly one effect-marked failed repair", crash.code === 0 && /RESULT paused/.test(crash.out) && lineCount(sink, "repair-effect") === 1 && cp.repair_iterations === 0, crash.out + crash.err.slice(0, 300));
  mgr.resolveAmbiguousDelegation(id, { intent_id: ambiguous.intent_id, decision: "retry", operator: "r0-reqa", note: "authorize exactly one same-name retry" });
  const acceptedProof = lifecycle.loadCheckpoint(id)!.repair_provenance?.find((proof) => proof.outcome === "operator_retried");
  check("retry retains checkpoint-backed original A to ambiguous B lineage without accepting quality", acceptedProof?.supersessions[0]?.superseded_id === original && acceptedProof?.supersessions[0]?.superseded_by === b.id && acceptedProof?.source === "operator_retry", JSON.stringify(acceptedProof));
  const resumed = await resumeFresh("samename-retry", id, "retry");
  const links = (get(id).metadata.artifact_supersessions ?? []) as any[];
  const c = storage.listArtifacts(id).find((artifact) => artifact.name === "index.html")!;
  check("one explicit retry causes exactly one additional repair and completes", /RESULT completed/.test(resumed.out) && lineCount(sink, "make-index") === 1 && lineCount(resumed.sink, "make-index") === 0 && lineCount(sink, "repair-effect") === 1 && lineCount(resumed.sink, "repair-effect") === 1, resumed.out + resumed.err.slice(0, 300) + fs.readFileSync(sink, "utf-8") + fs.readFileSync(resumed.sink, "utf-8"));
  check("A→B retry lineage and B→C repair lineage are both durable", links.length === 2 && links.some((link) => link.superseded_id === original && link.superseded_by === b.id && link.source === "operator_retry") && links.some((link) => link.superseded_id === b.id && link.superseded_by === c.id && link.source === "repair"), JSON.stringify(links));
  check("terminal mission contains only current C", JSON.stringify(get(id).artifacts) === JSON.stringify([c.id]), JSON.stringify(get(id).artifacts));
}

section("D3.G — crash after repair provenance commit restores A→B metadata on resume");
{
  const { id, sink, crash } = await crashed("samename-commit-crash");
  check("real child died at the committed-checkpoint fault schedule", crash.signal === "SIGKILL" && fs.existsSync(`${sink}.committed.json`), `${crash.signal} ${crash.err.slice(0, 300)}`);
  const cp = lifecycle.loadCheckpoint(id)!;
  const proof = cp.repair_provenance?.find((candidate) => candidate.outcome === "completed");
  const original = cp.completed[0].artifacts?.[0];
  const replacement = proof?.supersessions[0]?.superseded_by;
  const before = get(id);
  check("setup has committed A→B provenance but no repair intent or metadata index", cp.repair_iterations === 1 && !!replacement && inflightOf(id).every((entry) => entry.kind !== "repair") && (before.metadata.artifact_supersessions as unknown[] | undefined)?.length === undefined, JSON.stringify({ proof, metadata: before.metadata.artifact_supersessions }));
  await lifecycle.reconcileOrphanedMissions();
  const resumed = await resumeFresh("resume-samename", id, "commit-window");
  const links = (get(id).metadata.artifact_supersessions ?? []) as any[];
  check("resume restores the checkpoint-authenticated metadata and performs no new effects", /RESULT completed/.test(resumed.out) && lineCount(resumed.sink) === 0 && links.length === 1 && links[0].superseded_id === original && links[0].superseded_by === replacement, resumed.out + resumed.err.slice(0, 300) + JSON.stringify(links));
  check("terminal mission contains committed B only", JSON.stringify(get(id).artifacts) === JSON.stringify([replacement]), JSON.stringify(get(id).artifacts));
}

section("D3.H — two committed same-name repairs survive two post-checkpoint crashes");
{
  const id = seed({ status: "approved" });
  const sink = path.join(root, `multi-lineage-${id}.log`);
  const first = await runChild("samename-multi-crash", id, sink, { R0_CRASH_AT_REPAIR: "1" });
  const cp1 = lifecycle.loadCheckpoint(id)!;
  const proof1 = (cp1.repair_provenance ?? []).find((proof) => proof.outcome === "completed");
  const a = cp1.completed[0].artifacts?.[0];
  const b = proof1?.supersessions[0]?.superseded_by;
  check("first real crash commits A→B before its metadata write", first.signal === "SIGKILL" && fs.existsSync(`${sink}.committed-1.json`) && cp1.repair_iterations === 1 && !!a && !!b && inflightOf(id).every((entry) => entry.kind !== "repair") && (get(id).metadata.artifact_supersessions as unknown[] | undefined) === undefined, `${first.signal} ${first.err.slice(0, 300)}`);
  const recovered1 = await lifecycle.reconcileOrphanedMissions();
  check("first committed-chain owner is reconciled without new work", recovered1.paused.includes(id) && get(id).status === "paused", JSON.stringify(recovered1));

  const second = await runChild("samename-multi-crash", id, sink, { R0_CRASH_AT_REPAIR: "2", R0_QA_ALWAYS_FAIL: "1" });
  const cp2 = lifecycle.loadCheckpoint(id)!;
  const completedProofs = (cp2.repair_provenance ?? []).filter((proof) => proof.outcome === "completed");
  const proof2 = completedProofs[1];
  const c = proof2?.supersessions[0]?.superseded_by;
  check("second real crash preserves A→B→C with no repair intent in flight", second.signal === "SIGKILL" && fs.existsSync(`${sink}.committed-2.json`) && cp2.repair_iterations === 2 && completedProofs.length === 2 && cp2.completed[0].artifacts?.[0] === a && proof1?.supersessions[0]?.superseded_id === a && proof2?.supersessions[0]?.superseded_id === b && !!c && inflightOf(id).every((entry) => entry.kind !== "repair"), `${second.signal} ${second.err.slice(0, 300)} ${JSON.stringify(cp2.repair_provenance)}`);
  check("only the first metadata link existed before final recovery", (get(id).metadata.artifact_supersessions as any[]).length === 1 && (get(id).metadata.artifact_supersessions as any[])[0].superseded_by === b, JSON.stringify(get(id).metadata.artifact_supersessions));

  const registryB = JSON.parse(fs.readFileSync(path.join(dataDir, "artifacts", `${b}.json`), "utf8"));
  const registryC = JSON.parse(fs.readFileSync(path.join(dataDir, "artifacts", `${c}.json`), "utf8"));
  check("B and C share a path but retain distinct authenticated hashes; current C is intact", registryB.path === registryC.path && registryB.metadata.sha256 !== registryC.metadata.sha256 && sha(fs.readFileSync(registryC.path)) === registryC.metadata.sha256 && fs.statSync(registryC.path).size === registryC.metadata.size_bytes, JSON.stringify({ b: registryB.metadata, c: registryC.metadata, path: registryC.path }));
  const recovered2 = await lifecycle.reconcileOrphanedMissions();
  check("second committed-chain owner is reconciled", recovered2.paused.includes(id) && get(id).status === "paused", JSON.stringify(recovered2));

  const resumed = await resumeFresh("resume-samename", id, "multi-final");
  const links = (get(id).metadata.artifact_supersessions ?? []) as any[];
  check("final recovery restores both proofs and performs no new plan or effects", /RESULT completed/.test(resumed.out) && lineCount(resumed.sink) === 0 && links.length === 2 && links[0].superseded_id === a && links[0].superseded_by === b && links[1].superseded_id === b && links[1].superseded_by === c, `${resumed.out} ${resumed.err.slice(0, 300)} ${JSON.stringify(links)}`);
  check("two-link recovery delivers only intact current C", get(id).status === "completed" && JSON.stringify(get(id).artifacts) === JSON.stringify([c]) && sha(fs.readFileSync(registryC.path)) === registryC.metadata.sha256, JSON.stringify({ status: get(id).status, artifacts: get(id).artifacts, blockers: blockersOf(id) }));
}

check("same-name fixture ids are distinct", sameName.a !== "" && sameName.b !== "" && sameName.a !== sameName.b);

fs.rmSync(root, { recursive: true, force: true });
finish();
