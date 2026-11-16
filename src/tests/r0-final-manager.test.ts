#!/usr/bin/env npx tsx
/**
 * R0 final manager regressions. Offline: injected plan/specialist/QA, fresh temp
 * AWE_DATA_DIR, real child processes for the crash gap. No provider, no network.
 *
 *  D3 - complete immutable artifact integrity (sha256 + size + actual bytes) for
 *       original, repair, resumed and reconciled evidence; inline-only fails closed.
 *  D8 - durable intent before execution; SIGKILL between effect and success
 *       checkpoint blocks re-execution and completion until explicit resolution.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { tempDir, baseMission, makeChecker, passedReview, passedGate } from "./helpers/r0-runtime-util.js";
import { spawnFinalChild } from "./helpers/r0-final-manager-util.js";

const { section, check, finish } = makeChecker("r0-final-manager");

const root = tempDir("r0-final-manager-");
const dataDir = path.join(root, "data");
process.env.AWE_DATA_DIR = dataDir;
process.env.ROUTER_CHEAP_API_KEY = "r0-offline-invalid-do-not-use";
const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const mgr = await import("../agents/mission-manager.js");

let n = 0;
const nextId = () => `dddddddd-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const seed = (over: Record<string, unknown> = {}) => {
  const id = nextId();
  storage.saveMission(baseMission(id, { metadata: { specification: { suggested_tools: ["save_artifact"] } }, ...over }) as any);
  return id;
};
const get = (id: string) => storage.loadMission(id)!;
const sha = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");

const del = (task: string, parallel = false) => ({ agent_role: "executor", task, context: "", tools: ["save_artifact"], expected_output: "out", parallel });
const ok = (artifacts: string[]) => ({ role: "executor", output: "done", artifacts, success: true, tools_used: ["save_artifact"], model: "m" });
const qaPass = async () => ({ review: passedReview(), gate: passedGate() }) as any;
const qaFail = () => ({
  review: { ...passedReview(), passed: false, defects: [{ issue: "repair required", severity: "major" }], verdict: "FAIL" },
  gate: { ...passedGate(), passed: false, blockers: ["repair required"] },
}) as any;
const isRepair = (cfg: any) => String(cfg.task).startsWith("Fix the following defects");

function manager(id: string, deps: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  return mgr.createMissionManager(get(id), 30_000, {
    quiesceTimeoutMs: 1500, timeoutGraceMs: 500, allowedStatuses: ["approved", "paused"], deps: { resolveModelForRole: () => "test-model", ...deps }, ...opts,
  } as any);
}
const blockersOf = (id: string): string[] => ((get(id).metadata.qa_gate as any)?.blockers ?? []) as string[];
const hasFailedOutcomeIntent = (id: string, kind: "delegation" | "repair"): boolean => (lifecycle.loadCheckpoint(id)?.in_flight ?? []).some((entry: any) =>
  entry.kind === kind && entry.ambiguous && entry.failed_outcome
);
const hasFailedRepairIntent = (id: string): boolean => hasFailedOutcomeIntent(id, "repair");
const failureIssuesOf = (id: string, kind: "delegation" | "repair" = "delegation"): string[] =>
  ((lifecycle.loadCheckpoint(id)?.in_flight ?? []) as any[]).find((entry) => entry.kind === kind)?.failed_outcome?.issues ?? [];
const registryFile = (artifactId: string) => path.join(dataDir, "artifacts", `${artifactId}.json`);
const rewriteRegistry = (artifactId: string, mutate: (rec: any) => any) => {
  const rec = JSON.parse(fs.readFileSync(registryFile(artifactId), "utf-8"));
  fs.writeFileSync(registryFile(artifactId), JSON.stringify(mutate(rec)));
};
const lineCount = (file: string, text?: string) =>
  fs.existsSync(file) ? fs.readFileSync(file, "utf-8").split("\n").filter((l) => (text ? l === text : l.length > 0)).length : 0;

/** Run one delegation whose single artifact is produced by `produce`; QA `tamper` may alter evidence before it approves. */
async function originalCase(produce: (mid: string) => string, tamper?: (mid: string) => void) {
  const id = seed();
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
    executeSpecialist: async (_c: any, mid: string) => ok([produce(mid)]),
    reviewMissionDetailed: async () => (tamper?.(id), qaPass()),
  });
  const res = await m.run();
  return { id, status: res.mission.status, blockers: blockersOf(id), delegation: (get(id).metadata.execution as any)?.delegations?.[0]?.status };
}
const rawFile = (mid: string, name: string, content: string | Buffer) => {
  const file = path.join(dataDir, "artifacts", mid, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};
const rawRecord = (mid: string, name: string, extra: Record<string, unknown>) => {
  const rec = { id: crypto.randomUUID(), mission_id: mid, type: "text", name, created_at: new Date().toISOString(), metadata: {}, ...extra };
  storage.saveArtifact(rec as any);
  return rec.id as string;
};

section("D3.1 — original evidence: only path + sha256 + size + matching bytes completes");
{
  const control = await originalCase((mid) => storage.saveArtifactFile(mid, "ok.txt", "verified bytes").id);
  check("control: complete saveArtifactFile evidence completes", control.status === "completed", control.status + control.blockers.join("|"));

  const inline = await originalCase((mid) => rawRecord(mid, "inline.md", { content: "claimed content" }));
  check("inline-only record (no path, no metadata) fails closed into original-delegation recovery", inline.status === "paused" && hasFailedOutcomeIntent(inline.id, "delegation"), `${inline.status} intent=${hasFailedOutcomeIntent(inline.id, "delegation")}`);
  check("inline-only retained failure names the recovery path", failureIssuesOf(inline.id).some((b) => /inline-only or legacy/.test(b) && /recovery path/.test(b)), failureIssuesOf(inline.id).join("|"));

  const inlineSelfHash = await originalCase((mid) => rawRecord(mid, "self.md", { content: "mutable", metadata: { size_bytes: 7, sha256: sha("mutable") } }));
  check("inline content with self-consistent metadata but no backing file is not trusted", inlineSelfHash.status === "paused" && hasFailedOutcomeIntent(inlineSelfHash.id, "delegation") && failureIssuesOf(inlineSelfHash.id).some((b) => /inline-only or legacy/.test(b)), `${inlineSelfHash.status} ${failureIssuesOf(inlineSelfHash.id).join("|")}`);

  const emptyMeta = await originalCase((mid) => rawRecord(mid, "empty.txt", { path: rawFile(mid, "empty.txt", "real bytes"), metadata: {} }));
  check("path-backed record with metadata {} fails into original-delegation recovery", emptyMeta.status === "paused" && hasFailedOutcomeIntent(emptyMeta.id, "delegation") && failureIssuesOf(emptyMeta.id).some((b) => /sha256 and size_bytes/.test(b)), `${emptyMeta.status} ${failureIssuesOf(emptyMeta.id).join("|")}`);

  const noSize = await originalCase((mid) => rawRecord(mid, "nosize.txt", { path: rawFile(mid, "nosize.txt", "abc"), metadata: { sha256: sha("abc") } }));
  check("sha256 without size_bytes fails into original-delegation recovery", noSize.status === "paused" && hasFailedOutcomeIntent(noSize.id, "delegation") && failureIssuesOf(noSize.id).some((b) => /lacks immutable integrity metadata \(size_bytes/.test(b)), `${noSize.status} ${failureIssuesOf(noSize.id).join("|")}`);

  const noHash = await originalCase((mid) => rawRecord(mid, "nohash.txt", { path: rawFile(mid, "nohash.txt", "abc"), metadata: { size_bytes: 3 } }));
  check("size_bytes without sha256 fails into original-delegation recovery", noHash.status === "paused" && hasFailedOutcomeIntent(noHash.id, "delegation") && failureIssuesOf(noHash.id).some((b) => /lacks immutable integrity metadata \(sha256/.test(b)), `${noHash.status} ${failureIssuesOf(noHash.id).join("|")}`);

  const badHash = await originalCase((mid) => rawRecord(mid, "badhash.txt", { path: rawFile(mid, "badhash.txt", "abc"), metadata: { size_bytes: 3, sha256: "not-a-hash" } }));
  check("malformed sha256 fails into original-delegation recovery", badHash.status === "paused" && hasFailedOutcomeIntent(badHash.id, "delegation") && failureIssuesOf(badHash.id).some((b) => /sha256/.test(b)), `${badHash.status} ${failureIssuesOf(badHash.id).join("|")}`);

  const sameSize = await originalCase(
    (mid) => storage.saveArtifactFile(mid, "same.txt", "AAAAAAAA").id,
    (id) => fs.writeFileSync(storage.listArtifacts(id)[0].path!, "BBBBBBBB")
  );
  check("same-size byte replacement is caught by the hash", sameSize.status === "failed" && sameSize.blockers.some((b) => /content hash changed/.test(b)), sameSize.blockers.join("|"));

  const truncated = await originalCase(
    (mid) => storage.saveArtifactFile(mid, "trunc.txt", "AAAAAAAA").id,
    (id) => fs.writeFileSync(storage.listArtifacts(id)[0].path!, "AAAA")
  );
  check("size change is caught", truncated.status === "failed" && truncated.blockers.some((b) => /size changed/.test(b)), truncated.blockers.join("|"));

  const inlineDiffers = await originalCase((mid) => {
    const a = storage.saveArtifactFile(mid, "inl.txt", "file bytes");
    rewriteRegistry(a.id, (rec) => ({ ...rec, content: "other text" }));
    return a.id;
  });
  check("inline content that differs from the verified file fails into original-delegation recovery", inlineDiffers.status === "paused" && hasFailedOutcomeIntent(inlineDiffers.id, "delegation") && failureIssuesOf(inlineDiffers.id).some((b) => /inline content differs/.test(b)), `${inlineDiffers.status} ${failureIssuesOf(inlineDiffers.id).join("|")}`);

  const symlink = await originalCase(
    (mid) => storage.saveArtifactFile(mid, "link.txt", "AAAA").id,
    (id) => {
      const file = storage.listArtifacts(id)[0].path!;
      const twin = file + ".twin";
      fs.writeFileSync(twin, "AAAA");
      fs.rmSync(file);
      fs.symlinkSync(twin, file);
    }
  );
  check("replacement by a same-bytes symlink fails closed; its refused repair write has no effect", symlink.status === "failed" && !hasFailedRepairIntent(symlink.id) && symlink.blockers.some((b) => /not a regular file/.test(b)), `${symlink.status} ${symlink.blockers.join("|")}`);

  const prose = await originalCase(() => "invented-artifact-id-from-prose");
  check("a new ID in prose cannot pass", prose.status === "failed", prose.status);
}

section("D3.2 — repair evidence uses the same complete predicate");
{
  async function repairCase(repairProduce: (mid: string) => string, tamper?: (mid: string) => void) {
    const id = seed();
    let reviews = 0;
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("make evidence")] }),
      executeSpecialist: async (cfg: any, mid: string) =>
        ok([isRepair(cfg) ? repairProduce(mid) : storage.saveArtifactFile(mid, "initial.txt", "initial evidence").id]),
      reviewMissionDetailed: async () => {
        reviews++;
        if (reviews === 1) return qaFail();
        tamper?.(id);
        return qaPass();
      },
    });
    const res = await m.run();
    return { id, status: res.mission.status, reviews, blockers: blockersOf(id) };
  }
  const control = await repairCase((mid) => storage.saveArtifactFile(mid, "repair.txt", "repair evidence").id);
  check("control: complete repair evidence completes after QA re-review", control.status === "completed" && control.reviews === 2, `${control.status} reviews=${control.reviews}`);

  const emptyMeta = await repairCase((mid) => rawRecord(mid, "repair.txt", { path: rawFile(mid, "repair.txt", "repair bytes"), metadata: {} }));
  check("repair artifact with metadata {} fails with no verified new artifact", emptyMeta.status === "paused" && hasFailedRepairIntent(emptyMeta.id) && emptyMeta.reviews === 1 && emptyMeta.blockers.some((b) => /Repair 1 produced no verified new artifact/.test(b)), `${emptyMeta.status} ${emptyMeta.blockers.join("|")}`);
  check("repair metadata-less blocker is explicit and critical", emptyMeta.blockers.some((b) => /repair\.txt.*lacks immutable integrity metadata/.test(b)), emptyMeta.blockers.join("|"));

  const noSize = await repairCase((mid) => rawRecord(mid, "repair.txt", { path: rawFile(mid, "repair.txt", "xyz"), metadata: { sha256: sha("xyz") } }));
  check("repair artifact with only sha256 fails", noSize.status === "paused" && hasFailedRepairIntent(noSize.id) && noSize.reviews === 1, `${noSize.status}`);
  const noHash = await repairCase((mid) => rawRecord(mid, "repair.txt", { path: rawFile(mid, "repair.txt", "xyz"), metadata: { size_bytes: 3 } }));
  check("repair artifact with only size_bytes fails", noHash.status === "paused" && hasFailedRepairIntent(noHash.id) && noHash.reviews === 1, `${noHash.status}`);

  const inline = await repairCase((mid) => rawRecord(mid, "repair-inline.md", { content: "fixed, trust me" }));
  check("inline-only repair evidence fails closed", inline.status === "paused" && hasFailedRepairIntent(inline.id) && inline.reviews === 1 && inline.blockers.some((b) => /inline-only or legacy/.test(b)), `${inline.status} ${inline.blockers.join("|")}`);

  const swapped = await repairCase(
    (mid) => storage.saveArtifactFile(mid, "repair.txt", "FIXED-01").id,
    (id) => fs.writeFileSync(storage.listArtifacts(id).find((a) => a.name === "repair.txt")!.path!, "FIXED-02")
  );
  check("same-size replacement of repair evidence after repair is caught before completion", swapped.status === "failed" && swapped.reviews >= 2 && swapped.blockers.some((b) => /repair\.txt.*content hash changed/.test(b)), `${swapped.status} ${swapped.blockers.join("|")}`);

  const invented = await repairCase(() => "made-up-repair-id");
  check("a new repair ID in prose cannot pass", invented.status === "failed" && invented.reviews === 1, invented.status);
}

section("D3.3 — resumed (checkpointed) evidence is re-verified before completion");
{
  async function resumeCase(mutate?: (artifact: ReturnType<typeof storage.saveArtifactFile>, id: string) => string | void) {
    const id = seed({ status: "paused" });
    const a = del("task A");
    const artifact = storage.saveArtifactFile(id, "a.txt", "AAAA bytes");
    const reported = (mutate?.(artifact, id) as string | undefined) ?? artifact.id;
    lifecycle.saveCheckpoint({
      mission_id: id, version: 1, saved_at: new Date().toISOString(), timeout_ms: 1000, elapsed_ms: 0, repair_iterations: 0, reason: "manual",
      completed: [{ index: 0, agent_role: a.agent_role, task: a.task, fingerprint: lifecycle.delegationFingerprint(a.agent_role, a.task, a.expected_output), status: "success", output: "A", artifacts: [reported], duration_ms: 1, tools_used: ["save_artifact"] }],
    } as any);
    let executed = 0;
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [a] }),
      executeSpecialist: async (cfg: any) => { if (!isRepair(cfg)) executed++; return ok([]); },
      reviewMissionDetailed: qaPass,
    });
    const res = await m.run();
    return { id, status: res.mission.status, executed, blockers: blockersOf(id) };
  }
  const control = await resumeCase();
  check("control: intact checkpointed evidence completes without re-running", control.status === "completed" && control.executed === 0, `${control.status} executed=${control.executed}`);

  const tampered = await resumeCase((a) => void fs.writeFileSync(a.path!, "BBBB bytes"));
  check("same-size tamper between crash and resume fails (hash)", tampered.status === "failed" && tampered.blockers.some((b) => /content hash changed/.test(b)) && tampered.executed === 0, `${tampered.status} ${tampered.blockers.join("|")}`);

  const inline = await resumeCase((a) => void rewriteRegistry(a.id, (rec) => ({ id: rec.id, mission_id: rec.mission_id, type: "text", name: rec.name, content: "AAAA bytes", created_at: rec.created_at, metadata: {} })));
  check("legacy inline-only record in a checkpoint fails closed", inline.status === "failed" && inline.blockers.some((b) => /inline-only or legacy/.test(b)), `${inline.status} ${inline.blockers.join("|")}`);

  const stripped = await resumeCase((a) => void rewriteRegistry(a.id, (rec) => ({ ...rec, metadata: {} })));
  check("checkpointed path-backed record with stripped metadata fails closed", stripped.status === "failed" && stripped.blockers.some((b) => /sha256 and size_bytes/.test(b)), `${stripped.status} ${stripped.blockers.join("|")}`);

  const onlyHash = await resumeCase((a) => void rewriteRegistry(a.id, (rec) => ({ ...rec, metadata: { sha256: rec.metadata.sha256 } })));
  check("checkpointed record with sha256 only fails", onlyHash.status === "failed", onlyHash.status);
  const onlySize = await resumeCase((a) => void rewriteRegistry(a.id, (rec) => ({ ...rec, metadata: { size_bytes: rec.metadata.size_bytes } })));
  check("checkpointed record with size_bytes only fails", onlySize.status === "failed", onlySize.status);

  const invented = await resumeCase(() => "invented-checkpoint-artifact-id");
  check("checkpoint naming an unregistered artifact id cannot pass", invented.status === "failed" && invented.blockers.some((b) => /not registered/.test(b)), `${invented.status} ${invented.blockers.join("|")}`);
}

section("D3.4 — reconciled (unregistered file) evidence is verified too");
{
  async function reconciledCase(tamper?: (id: string) => void) {
    const id = seed();
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("write primary and a raw file")] }),
      executeSpecialist: async (_c: any, mid: string) => {
        rawFile(mid, "extra.bin", Buffer.from([1, 2, 3, 4]));
        return ok([storage.saveArtifactFile(mid, "primary.txt", "primary").id]);
      },
      reviewMissionDetailed: async () => (tamper?.(id), qaPass()),
    });
    const res = await m.run();
    return { id, status: res.mission.status, blockers: blockersOf(id) };
  }
  const control = await reconciledCase();
  const rec = storage.listArtifacts(control.id).find((a) => a.name === "extra.bin");
  check("control: reconciled file is registered with sha256+size and completes", control.status === "completed" && !!rec?.metadata?.sha256 && rec?.metadata?.size_bytes === 4, `${control.status}`);

  const tampered = await reconciledCase((id) => fs.writeFileSync(storage.listArtifacts(id).find((a) => a.name === "extra.bin")!.path!, Buffer.from([9, 9, 9, 9])));
  check("same-size replacement of a reconciled file fails", tampered.status === "failed" && tampered.blockers.some((b) => /extra\.bin.*content hash changed/.test(b)), `${tampered.status} ${tampered.blockers.join("|")}`);

  const stripped = await reconciledCase((id) => {
    const a = storage.listArtifacts(id).find((x) => x.name === "extra.bin")!;
    rewriteRegistry(a.id, (r) => ({ ...r, metadata: { reconciled: true } }));
  });
  check("reconciled record stripped of integrity metadata fails", stripped.status === "failed" && stripped.blockers.some((b) => /extra\.bin.*lacks immutable integrity metadata/.test(b)), `${stripped.status} ${stripped.blockers.join("|")}`);

  const inline = await reconciledCase((id) => {
    const a = storage.listArtifacts(id).find((x) => x.name === "extra.bin")!;
    rewriteRegistry(a.id, (r) => ({ id: r.id, mission_id: r.mission_id, type: r.type, name: r.name, content: "inline", created_at: r.created_at, metadata: {} }));
  });
  check("reconciled record downgraded to inline-only fails", inline.status === "failed" && inline.blockers.some((b) => /inline-only or legacy/.test(b)), `${inline.status}`);
}

section("D3.5 — a delegation's artifact superseded by a later same-name revision still counts");
{
  /**
   * The specialist registers `digest.json`, then the file is rewritten under the
   * same name before QA. The rewrite retires the delegation's registry id without
   * any repair provenance, so the gate must accept the id against the current
   * revision — while a deleted or altered revision still fails on its own bytes.
   *
   * The rewrite happens during execution, never inside the reviewer: mutating
   * artifacts while QA holds a frozen candidate is rejected as a stale candidate.
   * Two sequential delegations model it: the first writes digest.json, the second
   * runs after it and may rewrite or tamper.
   */
  async function revisionedCase(later: (mid: string, firstId: string) => void = () => {}) {
    const id = seed();
    let firstId = "";
    const m = manager(id, {
      planMission: async () => ({ strategy: "t", delegations: [del("write digest.json"), del("analyse and revise")] }),
      executeSpecialist: async (cfg: any, mid: string) => {
        if (cfg.task === "write digest.json") {
          firstId = storage.saveArtifactFile(mid, "digest.json", '{"step":1}').id;
          return ok([firstId]);
        }
        const own = storage.saveArtifactFile(mid, "analysis.md", "analysis").id;
        later(mid, firstId);
        return ok([own]);
      },
      reviewMissionDetailed: async () => qaPass(),
    });
    const res = await m.run();
    return { id, status: res.mission.status, blockers: blockersOf(id) };
  }

  const control = await revisionedCase();
  check("control: a delegation whose artifact is the only revision completes", control.status === "completed", `${control.status} ${control.blockers.join("|")}`);

  const revised = await revisionedCase((mid) => void storage.saveArtifactFile(mid, "digest.json", '{"step":2}'));
  check(
    "same-name rewrite retires the id but the delegation still counts",
    revised.status === "completed" && !revised.blockers.some((b) => /not registered/.test(b)),
    `${revised.status} ${revised.blockers.join("|")}`
  );

  // A later revision whose bytes are gone must fail on integrity, not pass
  // because some record with that name still exists.
  const deleted = await revisionedCase((mid) => {
    const a = storage.saveArtifactFile(mid, "digest.json", '{"step":2}');
    fs.rmSync(a.path!);
  });
  check(
    "same-name rewrite whose current bytes are missing fails closed",
    deleted.status === "failed" && deleted.blockers.some((b) => /digest\.json.*missing or unreadable/.test(b)),
    `${deleted.status} ${deleted.blockers.join("|")}`
  );

  // A later revision is accepted by name, but its bytes are still verified: a
  // revision whose content hash does not match what was registered must fail.
  const forged = await revisionedCase((mid) => {
    const later = storage.saveArtifactFile(mid, "digest.json", '{"step":2}');
    rewriteRegistry(later.id, (rec) => ({ ...rec, metadata: { ...rec.metadata, sha256: "0".repeat(64) } }));
  });
  check(
    "a later revision whose registered hash does not match its bytes fails",
    forged.status === "failed" && forged.blockers.some((b) => /digest\.json.*content hash changed/.test(b)),
    `${forged.status} ${forged.blockers.join("|")}`
  );

  // An id the mission claims was superseded must take the authenticated route:
  // a forged claim has to block, never degrade into same-name acceptance.
  const forgedClaim = await revisionedCase((mid, firstId) => {
    storage.saveArtifactFile(mid, "digest.json", '{"step":2}');
    storage.updateMissionAtomic(mid, (current) => ({
      metadata: {
        ...current.metadata,
        artifact_supersessions: [{
          superseded_id: firstId, superseded_by: "ffffffff-0000-4000-8000-000000000000", name: "digest.json",
          superseded_sha256: "0".repeat(64), superseded_size_bytes: 1, replacement_sha256: "1".repeat(64), replacement_size_bytes: 1,
        }],
      },
    }));
  });
  check(
    "a claimed but unauthenticated supersession blocks instead of falling back to same-name",
    forgedClaim.status === "failed" && forgedClaim.blockers.some((b) => /is not registered/.test(b)),
    `${forgedClaim.status} ${forgedClaim.blockers.join("|")}`
  );
}

// ─── D8 ──────────────────────────────────────────────────────────────────────

async function runChild(scenario: string, id: string, receipts: string) {
  const child = spawnFinalChild(root, scenario, id, receipts);
  const exit = await child.exited;
  return { ...exit, out: child.stdout(), err: child.stderr() };
}
const seedApproved = () => seed({ status: "approved" });
const inflightOf = (id: string) => (lifecycle.loadCheckpoint(id)?.in_flight ?? []) as any[];

async function crashInGap(scenario: string, plan: "single" | "parallel" = "single") {
  const id = seedApproved();
  const sink = path.join(root, `receipts-${id}.log`);
  const crash = await runChild(scenario, id, sink);
  return { id, sink, crash };
}
async function recover(id: string) {
  return await lifecycle.reconcileOrphanedMissions();
}
async function resumeFresh(scenario: string, id: string, tag: string) {
  const sink = path.join(root, `fresh-${tag}-${id}.log`);
  const res = await runChild(scenario, id, sink);
  return { ...res, sink };
}

section("D8.1 — SIGKILL in the effect -> success-checkpoint gap blocks re-execution and completion");
let gap1: { id: string; sink: string };
{
  const { id, sink, crash } = await crashInGap("crash-after-effect");
  gap1 = { id, sink };
  check("owner died by SIGKILL inside the gap", crash.signal === "SIGKILL", `${crash.signal} ${crash.err.slice(0, 300)}`);
  check("exactly one receipt was appended before the crash", lineCount(sink) === 1, String(lineCount(sink)));
  check("a real artifact was saved before the crash", storage.listArtifacts(id).length === 1);
  const cp = lifecycle.loadCheckpoint(id)!;
  check("no success checkpoint exists for the delegation", cp.completed.length === 0, String(cp.completed.length));
  check("durable intent was written before execution", inflightOf(id).length === 1 && inflightOf(id)[0].protocol === "intent-v1" && !!inflightOf(id)[0].baseline);
  const orphans = await recover(id);
  check("orphan reconciliation pauses the dead owner's mission", orphans.paused.includes(id) && get(id).status === "paused", get(id).status);

  const r1 = await resumeFresh("resume", id, "1");
  check("fresh manager did NOT report completed", !/RESULT completed/.test(r1.out) && /RESULT paused/.test(r1.out), r1.out + r1.err.slice(0, 300));
  check("fresh receipt sink stayed empty (delegation not executed again)", lineCount(r1.sink) === 0);
  check("original receipt count remains exactly one", lineCount(sink) === 1);
  check("QA never ran on an unresolved mission", !/QA_RAN/.test(r1.out));
  const blocked = get(id).metadata.recovery_blocked as any;
  check("durable ambiguous / recovery-blocked state is surfaced", get(id).status === "paused" && blocked?.kind === "ambiguous_delegation_outcome" && blocked.entries.length === 1, JSON.stringify(blocked));
  check("blocked entry explains the evidence", /new artifact record/.test(blocked?.entries?.[0]?.reasons?.join(" ") ?? ""), JSON.stringify(blocked?.entries?.[0]?.reasons));
  check("ambiguity is persisted in the checkpoint", inflightOf(id).some((e) => !!e.ambiguous));
  check("lease released while blocked", !lifecycle.hasLiveLease(id));

  const r2 = await resumeFresh("resume", id, "2");
  check("a second fresh restart is still blocked and still executes nothing", /RESULT paused/.test(r2.out) && lineCount(r2.sink) === 0 && lineCount(sink) === 1, r2.out);

  // In-process: a real manager with a counting specialist is refused too.
  let inProcessExecs = 0;
  const m = manager(id, {
    planMission: async () => ({ strategy: "t", delegations: [del("send-receipt")] }),
    executeSpecialist: async () => { inProcessExecs++; return ok([]); },
    reviewMissionDetailed: qaPass,
  });
  const inProcess = await m.run();
  check("in-process fresh manager also executes nothing and does not complete", inProcessExecs === 0 && inProcess.mission.status === "paused", `${inProcess.mission.status} execs=${inProcessExecs}`);

  const intentId = inflightOf(id)[0].intent_id as string;
  const artifactId = storage.listArtifacts(id)[0].id;
  const threw = (fn: () => unknown) => { try { fn(); return null; } catch (e) { return (e as Error).name; } };
  check("resolution without operator/note is refused", threw(() => mgr.resolveAmbiguousDelegation(id, { intent_id: intentId, decision: "retry", operator: "", note: "" })) === "MissionStateError");
  check("accept without artifact evidence is refused", threw(() => mgr.resolveAmbiguousDelegation(id, { intent_id: intentId, decision: "accept", operator: "op", note: "n" })) === "MissionStateError");
  check("accept naming an invented artifact id is refused", threw(() => mgr.resolveAmbiguousDelegation(id, { intent_id: intentId, decision: "accept", operator: "op", note: "n", artifacts: ["invented"] })) === "MissionStateError");
  check("unknown intent id is refused", threw(() => mgr.resolveAmbiguousDelegation(id, { intent_id: "nope", decision: "retry", operator: "op", note: "n" })) === "MissionStateError");
  check("refused resolutions leave the mission blocked", !!(get(id).metadata.recovery_blocked as any) && inflightOf(id).some((e) => e.ambiguous));

  const resolved = mgr.resolveAmbiguousDelegation(id, { intent_id: intentId, decision: "accept", operator: "r0-test-operator", note: "receipt confirmed in the sink", artifacts: [artifactId] });
  check("explicit accept resolves the last ambiguity", resolved.remaining === 0 && get(id).status === "paused" && !("recovery_blocked" in get(id).metadata));
  check("resolution is audited in the mission record", (get(id).metadata.recovery_resolutions as any[])?.[0]?.operator === "r0-test-operator" && (get(id).metadata.recovery_resolutions as any[])[0].decision === "accept");
  const r3 = await resumeFresh("resume", id, "3");
  check("after explicit accept the mission completes without any new execution", /RESULT completed/.test(r3.out) && lineCount(r3.sink) === 0 && lineCount(sink) === 1, r3.out + r3.err.slice(0, 300));
  check("completed mission has verified artifacts and no checkpoint", get(id).status === "completed" && lifecycle.loadCheckpoint(id) === null);
}

section("D8.2 — explicit retry is the only way to repeat the effect");
{
  const { id, sink, crash } = await crashInGap("crash-after-effect");
  check("setup: crash in gap", crash.signal === "SIGKILL" && lineCount(sink) === 1);
  await recover(id);
  const r1 = await resumeFresh("resume", id, "1");
  check("blocked before resolution", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0);
  mgr.resolveAmbiguousDelegation(id, { intent_id: inflightOf(id)[0].intent_id, decision: "retry", operator: "r0-test-operator", note: "effect is safe to repeat" });
  const r2 = await resumeFresh("resume", id, "2");
  check("after explicit retry the delegation runs again exactly once", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 1, r2.out + r2.err.slice(0, 300));
}

section("D8.3 — explicit evidence policy permits only the controlled pre-effect retry");
{
  const { id, sink, crash } = await crashInGap("crash-pre-effect");
  check("setup: killed before any effect", crash.signal === "SIGKILL" && lineCount(sink) === 0 && storage.listArtifacts(id).length === 0);
  check("intent was already durable", inflightOf(id).length === 1);
  await recover(id);
  const r1 = await resumeFresh("resume-evidence", id, "1");
  check("explicit evidence policy executes the known pre-effect delegation and completes", /RESULT completed/.test(r1.out) && lineCount(r1.sink) === 1, r1.out + r1.err.slice(0, 300));
}

section("D8.4 — cooperative beginEffect marker covers effects that leave no artifact");
{
  const { id, sink, crash } = await crashInGap("crash-marker-no-artifact");
  check("setup: receipt written, no artifact, SIGKILL", crash.signal === "SIGKILL" && lineCount(sink) === 1 && storage.listArtifacts(id).length === 0);
  await recover(id);
  const r1 = await resumeFresh("resume", id, "1");
  const reasons = ((get(id).metadata.recovery_blocked as any)?.entries?.[0]?.reasons ?? []).join(" ");
  check("marked effect blocks re-execution", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && lineCount(sink) === 1 && /durably marked an external effect/.test(reasons), r1.out + reasons);
}

section("D8.5 — default strict policy blocks unmarked external effects with no local footprint");
{
  const { id, sink, crash } = await crashInGap("crash-receipt-only");
  check("setup: unmarked receipt with no artifact, SIGKILL", crash.signal === "SIGKILL" && lineCount(sink) === 1 && storage.listArtifacts(id).length === 0);
  await recover(id);
  const r1 = await resumeFresh("resume", id, "1");
  const reasons = ((get(id).metadata.recovery_blocked as any)?.entries?.[0]?.reasons ?? []).join(" ");
  check("default resume is blocked and executes nothing", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && /strict policy/.test(reasons), r1.out + reasons);
}

section("D8.5b — default strict policy never equates missing evidence with pre-effect safety");
{
  const { id, sink, crash } = await crashInGap("crash-pre-effect");
  check("setup: no receipt, artifact or marker", crash.signal === "SIGKILL" && lineCount(sink) === 0 && storage.listArtifacts(id).length === 0);
  await recover(id);
  const r1 = await resumeFresh("resume", id, "1");
  const blocked = get(id).metadata.recovery_blocked as any;
  check("default resume blocks instead of blindly retrying", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && blocked?.entries?.[0]?.reasons?.some((r: string) => /strict policy/.test(r)), r1.out);
}

section("D8.6 — parallel batch: A's durable success is kept, only B is ambiguous");
{
  const { id, sink, crash } = await crashInGap("crash-parallel");
  check("setup: both effects once, B died in the gap", crash.signal === "SIGKILL" && lineCount(sink, "par-A") === 1 && lineCount(sink, "par-B") === 1, crash.err.slice(0, 300));
  check("A has a durable success checkpoint, B does not", lifecycle.loadCheckpoint(id)!.completed.map((c) => c.task).join() === "par-A");
  await recover(id);
  const r1 = await resumeFresh("resume-parallel", id, "1");
  const entries = (get(id).metadata.recovery_blocked as any)?.entries ?? [];
  check("resume is blocked, A is not repeated and B is not re-executed", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0, r1.out);
  check("only B is reported ambiguous", entries.length === 1 && entries[0].task === "par-B", JSON.stringify(entries.map((e: any) => e.task)));
  const b = storage.listArtifacts(id).find((a) => a.name === "par-B.txt")!;
  mgr.resolveAmbiguousDelegation(id, { intent_id: entries[0].intent_id, decision: "accept", operator: "op", note: "par-B receipt confirmed", artifacts: [b.id] });
  const r2 = await resumeFresh("resume-parallel", id, "2");
  check("after resolving B the mission completes with zero new executions", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 0 && lineCount(sink) === 2, r2.out + r2.err.slice(0, 300));
}

section("D8.7 — repair gap: SIGKILL after a repair effect blocks a second repair");
{
  const { id, sink, crash } = await crashInGap("crash-repair");
  check("setup: original and repair effects once each, repair died in the gap", crash.signal === "SIGKILL" && lineCount(sink, "send-receipt") === 1 && lineCount(sink, "repair-effect") === 1, crash.err.slice(0, 300));
  check("repair intent is durable", inflightOf(id).some((e) => e.kind === "repair"));
  await recover(id);
  const r1 = await resumeFresh("resume", id, "1");
  const entries = (get(id).metadata.recovery_blocked as any)?.entries ?? [];
  check("resume is blocked, nothing executes, not completed", /RESULT paused/.test(r1.out) && lineCount(r1.sink) === 0 && entries.length === 1 && entries[0].kind === "repair", r1.out + JSON.stringify(entries));
  const repairArtifact = storage.listArtifacts(id).find((a) => a.name === "repair-effect.txt")!;
  mgr.resolveAmbiguousDelegation(id, { intent_id: entries[0].intent_id, decision: "accept", operator: "op", note: "repair verified", artifacts: [repairArtifact.id] });
  check("accepted repair is recorded as performed", lifecycle.loadCheckpoint(id)!.repair_iterations === 1);
  const r2 = await resumeFresh("resume", id, "2");
  check("resume re-reviews and completes without repeating any effect", /RESULT completed/.test(r2.out) && lineCount(r2.sink) === 0, r2.out + r2.err.slice(0, 300));
}

fs.rmSync(root, { recursive: true, force: true });
finish();
