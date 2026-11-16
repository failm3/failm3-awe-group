#!/usr/bin/env npx tsx
/**
 * R0 runtime: atomic mission updates (CAS + cross-process lock), single-owner
 * lease (race, heartbeat/expiry, orphan reconcile). Offline; child processes.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { tempDir, spawnChild, baseMission, makeChecker, delay, ROOT } from "./helpers/r0-runtime-util.js";
import { pathToFileURL } from "node:url";

const { section, check, finish } = makeChecker("r0-runtime storage+lease");

const root = tempDir();
const dataDir = path.join(root, "data");
process.env.AWE_DATA_DIR = dataDir;
process.env.AWE_LEASE_TTL_MS = "30000";
const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");

const ID = "aaaaaaaa-0000-4000-8000-000000000001";

// ── Atomic update ─────────────────────────────────────────────────────────────
section("S1 — concurrent processes never lose an update");
{
  storage.saveMission(baseMission(ID) as any);
  const tags = ["a", "b", "c", "d"];
  const N = 40;
  const kids = tags.map((t) => spawnChild(root, "cas-writer", [ID, String(N), t]));
  await Promise.all(kids.map((k) => k.waitFor("READY")));
  kids.forEach((k) => k.proc.stdin.write("go"));
  const exits = await Promise.all(kids.map((k) => k.exited));
  const m = storage.loadMission(ID)!;
  const counters = (m.metadata.counters ?? {}) as Record<string, number>;
  check("all writers exited 0", exits.every((e) => e.code === 0), JSON.stringify(exits));
  check("every increment is present", tags.every((t) => counters[t] === N), JSON.stringify(counters));
  check("total equals sum", m.metadata.total === tags.length * N, String(m.metadata.total));
  check("unrelated metadata preserved", (m.metadata.preserved as any)?.nonce === "keep");
  check("revision advanced once per write", (storage.getMissionRevision(ID) ?? 0) >= tags.length * N + 1);
  const leftovers = fs.readdirSync(path.join(dataDir, "missions")).filter((f) => !f.endsWith(".json"));
  check("no leftover tmp files", leftovers.length === 0, leftovers.join(","));
}

section("S2 — compare-and-set revision");
{
  const rev = storage.getMissionRevision(ID)!;
  const ok = storage.updateMissionAtomic(ID, () => ({ title: "cas-1" }), { expectedRevision: rev });
  check("CAS with current revision applies", ok.applied && ok.mission?.title === "cas-1");
  const stale = storage.updateMissionAtomic(ID, () => ({ title: "cas-2" }), { expectedRevision: rev });
  check("CAS with stale revision conflicts", !stale.applied && stale.reason === "conflict");
  check("stale write did not land", storage.loadMission(ID)!.title === "cas-1");
  const fenced = storage.updateMissionAtomic(ID, () => ({ title: "x" }), { fence: () => false });
  check("fence rejects the write", !fenced.applied && fenced.reason === "fenced");
  const compat = storage.updateMission(ID, { description: "compat" });
  check("updateMission(id, patch) still returns the mission", compat?.description === "compat");
  check("updateMission on missing id returns null", storage.updateMission("nope-nope", { title: "x" }) === null);
}

section("S3 — legacy record without a revision keeps working");
{
  const lid = "aaaaaaaa-0000-4000-8000-000000000002";
  const legacy = baseMission(lid);
  fs.writeFileSync(path.join(dataDir, "missions", `${lid}.json`), JSON.stringify(legacy, null, 2));
  check("loads", storage.loadMission(lid)?.id === lid);
  check("legacy revision is 0", storage.getMissionRevision(lid) === 0);
  const r = storage.updateMissionAtomic(lid, () => ({ title: "after" }), { expectedRevision: 0 });
  check("CAS from revision 0", r.applied && storage.getMissionRevision(lid) === 1);
}

section("S4 — terminal status is fenced");
{
  const tid = "aaaaaaaa-0000-4000-8000-000000000003";
  storage.saveMission(baseMission(tid, { status: "running" }) as any);
  storage.updateMission(tid, { status: "cancelled" });
  const late = storage.updateMissionAtomic(tid, () => ({ status: "completed" }));
  check("late completed over cancelled refused", !late.applied && late.reason === "terminal");
  check("status stays cancelled", storage.loadMission(tid)!.status === "cancelled");
  const reopen = storage.updateMissionAtomic(tid, () => ({ status: "approved" }), { allowTerminalTransition: true });
  check("explicit terminal transition allowed", reopen.applied);
}

section("S5 — sealed/cancelled missions refuse artifacts");
{
  const sid = "aaaaaaaa-0000-4000-8000-000000000004";
  storage.saveMission(baseMission(sid, { status: "running" }) as any);
  const art = (n: string) => ({ id: `art-${n}`, mission_id: sid, name: `${n}.md`, type: "text" as const, content: "x", created_at: new Date().toISOString() });
  let ok = true;
  try { storage.saveArtifact(art("one") as any); } catch { ok = false; }
  check("artifact accepted while running", ok);
  storage.updateMission(sid, { status: "cancelled" });
  storage.sealMission(sid, "cancelled");
  let refused = false;
  try { storage.saveArtifact(art("two") as any); } catch (e) { refused = (e as Error).name === "MissionSealedError"; }
  check("artifact refused after cancel", refused);
  check("refused artifact not listed", storage.listArtifacts(sid).every((a) => a.name !== "two.md"));
  check("reconcile registers nothing when sealed", storage.reconcileArtifactFiles(sid).length === 0);

  const fencedId = "aaaaaaaa-0000-4000-8000-000000000007";
  storage.saveMission(baseMission(fencedId, { status: "running" }) as any);
  let staleFileRefused = false;
  try {
    storage.saveArtifactFile(fencedId, "stale.txt", "must not persist", "text", { fence: () => false });
  } catch (error) {
    staleFileRefused = (error as Error).name === "MissionSealedError";
  }
  check("stale owner cannot register artifact bytes", staleFileRefused && storage.listArtifacts(fencedId).length === 0);
  check("refused stale write leaves no content file", !fs.existsSync(path.join(dataDir, "artifacts", fencedId, "stale.txt")));
  let staleMetadataRefused = false;
  try {
    storage.saveArtifact({ id: "stale-metadata", mission_id: fencedId, name: "stale.md", type: "text", content: "bad", created_at: new Date().toISOString() } as any, { fence: () => false });
  } catch (error) {
    staleMetadataRefused = (error as Error).name === "MissionSealedError";
  }
  check("stale owner cannot register artifact metadata", staleMetadataRefused && storage.listArtifacts(fencedId).length === 0);
  fs.mkdirSync(path.join(dataDir, "artifacts", fencedId), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "artifacts", fencedId, "orphan.txt"), "unregistered");
  let staleReconcileRefused = false;
  try { storage.reconcileArtifactFiles(fencedId, { fence: () => false }); } catch { staleReconcileRefused = true; }
  check("stale owner cannot reconcile new evidence", staleReconcileRefused && storage.listArtifacts(fencedId).length === 0);
}

section("S5b — artifact writes reject final-component and ancestor symlinks");
{
  const id = "aaaaaaaa-0000-4000-8000-000000000008";
  storage.saveMission(baseMission(id, { status: "running" }) as any);
  const missionDir = path.join(dataDir, "artifacts", id);
  const outside = path.join(root, "outside-artifacts");
  fs.mkdirSync(missionDir, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });

  const finalTarget = path.join(outside, "final.txt");
  fs.writeFileSync(finalTarget, "original-final");
  const finalLink = path.join(missionDir, "linked.txt");
  fs.symlinkSync(finalTarget, finalLink);
  let finalRefused = false;
  try { storage.saveArtifactFile(id, "linked.txt", "outside-overwrite"); } catch { finalRefused = true; }
  check("final-component symlink is refused without changing its outside target", finalRefused && fs.readFileSync(finalTarget, "utf8") === "original-final" && fs.lstatSync(finalLink).isSymbolicLink());
  check("refused final symlink creates no artifact metadata", storage.listArtifacts(id).length === 0);

  const ancestorTarget = path.join(outside, "ancestor");
  fs.mkdirSync(ancestorTarget);
  fs.symlinkSync(ancestorTarget, path.join(missionDir, "linked-dir"));
  let ancestorRefused = false;
  try { storage.saveArtifactFile(id, "linked-dir/escaped.txt", "outside-create"); } catch { ancestorRefused = true; }
  check("ancestor symlink is refused without creating an outside file", ancestorRefused && !fs.existsSync(path.join(ancestorTarget, "escaped.txt")));
  check("refused ancestor symlink creates no artifact metadata", storage.listArtifacts(id).length === 0);

  const nested = storage.saveArtifactFile(id, "nested/result.txt", "first");
  const replaced = storage.saveArtifactFile(id, "nested/result.txt", "second");
  check("ordinary nested creation and same-name regular-file replacement still work", nested.id !== replaced.id && fs.readFileSync(replaced.path!, "utf8") === "second" && storage.listArtifacts(id).some((artifact) => artifact.id === replaced.id));
}

section("S5c — a symlinked mission root cannot escape through save or reconciliation");
{
  const id = "aaaaaaaa-0000-4000-8000-000000000009";
  storage.saveMission(baseMission(id, { status: "running" }) as any);
  const missionDir = path.join(dataDir, "artifacts", id);
  const outside = path.join(root, "outside-mission-root");
  fs.mkdirSync(outside, { recursive: true });
  const target = path.join(outside, "target.txt");
  const unregistered = path.join(outside, "unregistered.txt");
  fs.writeFileSync(target, "outside-target");
  fs.writeFileSync(unregistered, "outside-unregistered");
  fs.symlinkSync(outside, missionDir);

  let saveRefused = false;
  try { storage.saveArtifactFile(id, "target.txt", "overwritten"); } catch { saveRefused = true; }
  check("mission-root symlink write is refused without changing the outside target", saveRefused && fs.readFileSync(target, "utf8") === "outside-target" && storage.listArtifacts(id).length === 0);

  let reconcileRefused = false;
  let added: unknown[] = [];
  try { added = storage.reconcileArtifactFiles(id); } catch { reconcileRefused = true; }
  check("mission-root symlink reconciliation adopts no outside files", reconcileRefused && added.length === 0 && storage.listArtifacts(id).length === 0);
  check("refused reconciliation preserves outside bytes and does not replace the root link", fs.readFileSync(target, "utf8") === "outside-target" && fs.readFileSync(unregistered, "utf8") === "outside-unregistered" && fs.lstatSync(missionDir).isSymbolicLink());

  fs.unlinkSync(missionDir);
  fs.mkdirSync(missionDir);
  fs.writeFileSync(path.join(missionDir, "inside.txt"), "inside");
  const ordinary = storage.reconcileArtifactFiles(id);
  check("ordinary real mission-root reconciliation remains available", ordinary.length === 1 && ordinary[0].name === "inside.txt" && fs.readFileSync(ordinary[0].path!, "utf8") === "inside");
}

section("S5d — pre-import artifact-root links/non-directories cannot reach QA or completion");
for (const kind of ["symlink", "file"] as const) {
  const childRoot = path.join(root, `artifact-root-${kind}`);
  const childData = path.join(childRoot, "data");
  const outsideRoot = path.join(childRoot, "outside-artifacts-root");
  const id = `aaaaaaaa-0000-4000-8000-00000000001${kind === "symlink" ? "0" : "1"}`;
  const outsideMission = path.join(outsideRoot, id);
  fs.mkdirSync(path.join(outsideMission, "nested"), { recursive: true });
  fs.writeFileSync(path.join(outsideMission, "target.txt"), "outside-target");
  fs.writeFileSync(path.join(outsideMission, "nested", "unregistered.txt"), "outside-unregistered");
  fs.mkdirSync(childData, { recursive: true });
  const artifactRoot = path.join(childData, "artifacts");
  if (kind === "symlink") fs.symlinkSync(outsideRoot, artifactRoot);
  else fs.writeFileSync(artifactRoot, "not-a-directory");

  const storageUrl = pathToFileURL(path.join(ROOT, "src/utils/storage.ts")).href;
  const managerUrl = pathToFileURL(path.join(ROOT, "src/agents/mission-manager.ts")).href;
  const script = `
    let storage, managers, importError = "";
    try {
      storage = await import(${JSON.stringify(storageUrl)});
      managers = await import(${JSON.stringify(managerUrl)});
    } catch (error) { importError = String(error); }
    let qaCalls = 0, finalStatus = null, returnedStatus = null, runError = "";
    const id = ${JSON.stringify(id)};
    if (storage && managers) {
      const now = new Date().toISOString();
      storage.saveMission({ id, title: "artifact root confinement", description: "offline", objective: "offline",
        acceptance_criteria: ["only in-namespace evidence reaches QA"], status: "approved", priority: "normal",
        created_at: now, updated_at: now, artifacts: [], metadata: { specification: { suggested_tools: ["save_artifact"] } } });
      const manager = managers.createMissionManager(storage.loadMission(id), 30000, {
        quiesceTimeoutMs: 500, timeoutGraceMs: 100, allowedStatuses: ["approved"],
        deps: {
          resolveModelForRole: () => "offline-double",
          planMission: async () => ({ strategy: "offline", delegations: [{ agent_role: "executor", task: "make primary", context: "", tools: ["save_artifact"], expected_output: "out", parallel: false }] }),
          executeSpecialist: async (_config, missionId) => {
            const primary = storage.saveArtifactFile(missionId, "primary.txt", "primary");
            return { role: "executor", output: "done", artifacts: [primary.id], success: true, tools_used: ["save_artifact"], model: "offline-double" };
          },
          reviewMissionDetailed: async () => {
            qaCalls++;
            return {
              review: { passed: true, score: 10, criteria_results: [{ criterion: "only in-namespace evidence reaches QA", passed: true, reason: "offline control" }], defects: [], recommendations: [], verdict: "PASS" },
              gate: { passed: true, blockers: [], criterion_checks: [{ criterion: "only in-namespace evidence reaches QA", passed: true, reason: "offline control" }], llm_score: 10, llm_passed: true },
            };
          },
        },
      });
      try { returnedStatus = (await manager.run()).mission.status; } catch (error) { runError = String(error); }
      finalStatus = storage.loadMission(id)?.status ?? null;
    }
    const adoptedOutside = storage ? storage.listArtifacts(id).filter((artifact) => ["target.txt", "nested/unregistered.txt"].includes(artifact.name)) : [];
    console.log("R0_ARTIFACT_ROOT " + JSON.stringify({ importError, runError, returnedStatus, finalStatus, qaCalls, adoptedOutside: adoptedOutside.map((artifact) => artifact.name) }));
  `;
  const child = spawnSync(process.execPath, ["--import", path.join(ROOT, "node_modules/tsx/dist/loader.mjs"), "--input-type=module", "--eval", script], {
    cwd: childRoot,
    env: { PATH: process.env.PATH, HOME: childRoot, TMPDIR: childRoot, AWE_DATA_DIR: childData, AWE_OFFLINE_TEST: "1", ROUTER_CHEAP_API_KEY: "r0-offline-invalid-do-not-use", NO_COLOR: "1" },
    encoding: "utf8", timeout: 30000,
  });
  const marker = child.stdout.split("\n").find((line) => line.startsWith("R0_ARTIFACT_ROOT "));
  let observation: any = {};
  try { observation = JSON.parse(marker?.slice("R0_ARTIFACT_ROOT ".length) ?? "{}"); } catch { /* reported by checks */ }
  const rootPreserved = kind === "symlink"
    ? fs.lstatSync(artifactRoot).isSymbolicLink() && fs.readlinkSync(artifactRoot) === outsideRoot
    : fs.lstatSync(artifactRoot).isFile() && fs.readFileSync(artifactRoot, "utf8") === "not-a-directory";
  const outsidePreserved = fs.readFileSync(path.join(outsideMission, "target.txt"), "utf8") === "outside-target" &&
    fs.readFileSync(path.join(outsideMission, "nested", "unregistered.txt"), "utf8") === "outside-unregistered";
  check(`${kind} artifact root is rejected at pre-import storage initialization without changing root/outside bytes`,
    child.status === 0 && /symbolic link or non-directory/.test(observation.importError ?? "") && rootPreserved && outsidePreserved,
    `${child.stderr}${child.stdout}`);
  check(`${kind} artifact root permits no escaped registration, QA call or completed mission`,
    child.status === 0 && observation.qaCalls === 0 && observation.finalStatus !== "completed" &&
      (observation.adoptedOutside ?? []).length === 0 && fs.readdirSync(outsideRoot).every((name) => !name.endsWith(".json")),
    `${child.stderr}${child.stdout}`);
}

section("S6 — lock held by a dead process is broken");
{
  const did = "aaaaaaaa-0000-4000-8000-000000000005";
  storage.saveMission(baseMission(did) as any);
  const k = spawnChild(root, "hold-mission-lock-and-die", [did]);
  const exit = await k.exited;
  check("holder died by SIGKILL", exit.signal === "SIGKILL", JSON.stringify(exit));
  const t0 = Date.now();
  const r = storage.updateMissionAtomic(did, () => ({ title: "after-crash" }));
  check("update proceeds after holder crash", r.applied, r.reason);
  check("did not wait for the 60s stale timeout", Date.now() - t0 < 10_000, `${Date.now() - t0}ms`);
}

// ── Lease ─────────────────────────────────────────────────────────────────────
section("L0 — malformed and wrong-mission lease evidence fails closed");
{
  const variants = [
    { id: "bbbbbbbb-0000-4000-8000-000000000008", text: "{not-json", label: "malformed" },
    {
      id: "bbbbbbbb-0000-4000-8000-000000000009",
      text: JSON.stringify({
        version: 1, mission_id: "bbbbbbbb-0000-4000-8000-000000000008", owner_id: "foreign-owner",
        pid: process.pid, host: (await import("node:os")).hostname(), purpose: "run", generation: 41,
        acquired_at: Date.now(), heartbeat_at: Date.now(), expires_at: Date.now() + 60_000, ttl_ms: 60_000,
      }),
      label: "wrong-mission",
    },
  ];
  fs.mkdirSync(path.join(dataDir, "leases"), { recursive: true });
  for (const variant of variants) {
    storage.saveMission(baseMission(variant.id) as any);
    const file = path.join(dataDir, "leases", `${variant.id}.json`);
    fs.writeFileSync(file, variant.text);
    const denied = (["run", "approve", "resume", "recovery", "cancel"] as const).every((purpose) => {
      const lease = lifecycle.tryAcquireMissionLease(variant.id, purpose);
      lease?.release();
      return lease === null;
    });
    check(`${variant.label} lease blocks every acquisition purpose and preserves exact evidence`, denied && fs.readFileSync(file, "utf8") === variant.text && lifecycle.readMissionLease(variant.id) === null, fs.readFileSync(file, "utf8"));
  }
}

section("L1 — exactly one of N processes acquires the lease");
{
  const lid = "bbbbbbbb-0000-4000-8000-000000000001";
  storage.saveMission(baseMission(lid) as any);
  const kids = [0, 1, 2, 3, 4].map(() => spawnChild(root, "lease-race", [lid]));
  await Promise.all(kids.map((k) => k.waitFor("READY")));
  kids.forEach((k) => k.proc.stdin.write("go"));
  await delay(1500);
  const outs = kids.map((k) => k.stdout());
  const won = outs.filter((o) => o.includes("ACQUIRED")).length;
  const lost = outs.filter((o) => o.includes("DENIED")).length;
  check("exactly one winner", won === 1 && lost === 4, outs.join("|"));
  check("lease is live", lifecycle.hasLiveLease(lid));
  const m = storage.loadMission(lid)!;
  check("mission record names the owner", typeof (m.metadata.execution_owner as any)?.pid === "number");
  kids.forEach((k) => k.proc.stdin.end());
  await Promise.all(kids.map((k) => k.exited));
  check("lease released when the owner exits cleanly", !lifecycle.hasLiveLease(lid));
}

section("L2 — a live lease is not an orphan; a dead owner's mission is paused");
{
  const lid = "bbbbbbbb-0000-4000-8000-000000000002";
  storage.saveMission(baseMission(lid, { status: "running" }) as any);
  const holder = spawnChild(root, "lease-hold", [lid]);
  await holder.waitFor("HELD");
  const live = await lifecycle.reconcileOrphanedMissions();
  check("running mission with live lease left alone", storage.loadMission(lid)!.status === "running");
  check("report counts it as skipped_live", (live as any).skipped_live.includes(lid), JSON.stringify(live));
  const denied = lifecycle.acquireMissionLease(lid, "run");
  check("second acquirer denied while owner lives", !denied.acquired);
  holder.proc.kill("SIGKILL");
  await holder.exited;
  check("dead pid => lease not live", !lifecycle.hasLiveLease(lid));
  const after = await lifecycle.reconcileOrphanedMissions();
  check("orphan paused once the owner is dead", storage.loadMission(lid)!.status === "paused", JSON.stringify(after));
  const taken = lifecycle.acquireMissionLease(lid, "resume");
  check("lease can be taken over after owner death", taken.acquired);
  if (taken.acquired) taken.lease.release();
}

section("L3 — heartbeat extends a lease; expiry alone never permits live-owner takeover");
{
  const lid = "bbbbbbbb-0000-4000-8000-000000000003";
  storage.saveMission(baseMission(lid) as any);
  const a = lifecycle.tryAcquireMissionLease(lid, "run", { ttlMs: 400 })!;
  check("acquired", !!a && a.isHeld());
  await delay(250);
  a.heartbeat();
  await delay(250);
  check("heartbeat kept it live past the original ttl", lifecycle.hasLiveLease(lid) && a.isHeld());
  a.release();

  const expiredId = "bbbbbbbb-0000-4000-8000-000000000006";
  storage.saveMission(baseMission(expiredId, { status: "running" }) as any);
  const holder = spawnChild(root, "lease-hold", [expiredId, "150", "no-heartbeat"]);
  await holder.waitFor("HELD");
  const original = lifecycle.readMissionLease(expiredId)!;
  await delay(300);
  check("expired lease is not live", !lifecycle.hasLiveLease(expiredId));
  const denied = lifecycle.tryAcquireMissionLease(expiredId, "resume");
  check("expired lease with a live owner process still denies takeover", denied === null, JSON.stringify({ before: original, after: lifecycle.readMissionLease(expiredId), exit: holder.proc.exitCode, signal: holder.proc.signalCode, stdout: holder.stdout(), stderr: holder.stderr() }));
  const orphan = await lifecycle.reconcileOrphanedMissions();
  check("expired live owner is not falsely paused", storage.loadMission(expiredId)!.status === "running" && orphan.skipped_live.includes(expiredId));
  const cancelled = await (await import("../agents/mission-manager.js")).cancelMission(expiredId, "must not steal expired live ownership", { waitMs: 250 });
  check("cancel cannot falsely confirm an expired live owner stopped", !cancelled.cancelled && !cancelled.quiesced && storage.loadMission(expiredId)!.status === "running", JSON.stringify(cancelled));

  holder.proc.kill("SIGKILL");
  await holder.exited;
  const recovered = await lifecycle.reconcileOrphanedMissions();
  check("confirmed owner death enables orphan pause", storage.loadMission(expiredId)!.status === "paused" && recovered.paused.includes(expiredId));
  const taken = lifecycle.tryAcquireMissionLease(expiredId, "resume")!;
  check("confirmed owner death enables generation-fenced takeover", taken.generation > original.generation && taken.isHeld(), JSON.stringify({ original, current: lifecycle.readMissionLease(expiredId), generation: taken.generation, held: taken.isHeld() }));
  taken.release();
}

section("L3.R — confirmed-dead recovery owner no longer permanently blocks reconciliation");
{
  const lid = "bbbbbbbb-0000-4000-8000-000000000007";
  storage.saveMission(baseMission(lid, { status: "running" }) as any);
  const holder = spawnChild(root, "recovery-hold", [lid, "100", "no-heartbeat"]);
  await holder.waitFor("HELD");
  await delay(250);
  const original = lifecycle.readMissionLease(lid)!;
  check("expired but live recovery owner remains a hard acquisition barrier", lifecycle.tryAcquireMissionLease(lid, "recovery") === null && storage.loadMission(lid)!.status === "running");
  holder.proc.kill("SIGKILL");
  const exit = await holder.exited;
  check("fixture owner really died", exit.signal === "SIGKILL" && !lifecycle.isLeaseOwnerPotentiallyActive(original));
  const recovered = await lifecycle.reconcileOrphanedMissions();
  check("reconciliation replaces only the confirmed-dead recovery owner and pauses the orphan", recovered.paused.includes(lid) && storage.loadMission(lid)!.status === "paused" && lifecycle.readMissionLease(lid) === null, JSON.stringify(recovered));
  for (const purpose of ["run", "resume", "cancel", "recovery"] as const) {
    const taken = lifecycle.tryAcquireMissionLease(lid, purpose);
    check(`confirmed-dead recovery lease permits a new ${purpose} owner`, !!taken && taken.generation > original.generation, JSON.stringify(lifecycle.readMissionLease(lid)));
    taken?.release();
  }
}

section("L4 — a stale owner cannot release the replacement lease");
{
  const lid = "bbbbbbbb-0000-4000-8000-000000000004";
  storage.saveMission(baseMission(lid) as any);
  const holder = spawnChild(root, "lease-hold", [lid, "150", "no-heartbeat"]);
  await holder.waitFor("HELD");
  const oldRecord = lifecycle.readMissionLease(lid)!;
  await delay(300);
  check("live old process blocks takeover even after expiry", lifecycle.tryAcquireMissionLease(lid, "run") === null);
  holder.proc.kill("SIGKILL");
  await holder.exited;
  const b = lifecycle.tryAcquireMissionLease(lid, "run")!;
  const stale = new lifecycle.MissionLease(oldRecord);
  stale.release();
  check("stale owner's release does not drop the new lease", lifecycle.hasLiveLease(lid) && b.isHeld());
  check("replacement generation is newer", b.generation === oldRecord.generation + 1);
  b.release();
  check("owner release frees it", !lifecycle.hasLiveLease(lid));
}

section("L5 — cancel request file round trip");
{
  const lid = "bbbbbbbb-0000-4000-8000-000000000005";
  lifecycle.requestMissionCancel(lid, "because");
  check("request readable", lifecycle.readCancelRequest(lid)?.reason === "because");
  lifecycle.clearCancelRequest(lid);
  check("request cleared", lifecycle.readCancelRequest(lid) === null);
}

fs.rmSync(root, { recursive: true, force: true });
finish();
