#!/usr/bin/env npx tsx
/**
 * R0 runtime: safe recursion. Distinct children only, atomic spawn limits,
 * signal propagation, persisted tree. Fake specialist: no model calls.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { tempDir, makeChecker, delay } from "./helpers/r0-runtime-util.js";

const { section, check, finish } = makeChecker("r0-runtime recursion");

const root = tempDir();
const dataDir = path.join(root, "data");
process.env.AWE_DATA_DIR = dataDir;
const rec = await import("../agents/recursion.js");
const { RECURSION_LIMITS: L } = rec;

type Call = { role: string; task: string; depth?: number; nodeId?: string; signal?: AbortSignal; maxSteps?: number };
let calls: Call[] = [];
let behavior: (c: Call) => Promise<{ success: boolean; output: string }> = async (c) => ({ success: true, output: `out ${c.role}` });
rec.__setRecursionTestDeps({
  executeSpecialist: (async (cfg: any, _id: string, o: any) => {
    const c: Call = { role: cfg.role, task: cfg.task, depth: cfg.depth, nodeId: cfg.nodeId, signal: o?.signal, maxSteps: o?.maxSteps };
    calls.push(c);
    const r = await behavior(c);
    return { role: cfg.role, output: r.output, artifacts: [`artifact-${cfg.nodeId}`], success: r.success, tools_used: ["shell"], model: "m" };
  }) as any,
  resolveModelForRole: () => "test-model",
});
const reset = (id: string) => {
  rec.resetSession(id);
  calls = [];
  behavior = async (c) => ({ success: true, output: `out ${c.role}` });
};
const child = (role: string, task: string) => ({ role, task });

section("R1 — a legacy single request runs exactly once, even with parallel=true");
{
  const id = "rrrrrrrr-1";
  reset(id);
  const out = await rec.runDelegateCall(id, null, 0, { role: "researcher", task: "find x", parallel: true });
  check("exactly one child executed", calls.length === 1, String(calls.length));
  check("success", out.success && out.children.length === 1);
  check("parallel=true reported as ignored", (out.warnings ?? []).some((w) => /parallel/.test(w)));
  check("spawn budget charged once", rec.getSession(id).spawned === 1);
  const again = await rec.runDelegateCall(id, null, 0, { role: "researcher", task: "find x" });
  check("sequential legacy call also once", calls.length === 2 && again.success);
}

section("R2 — distinct children each run once, in parallel");
{
  const id = "rrrrrrrr-2";
  reset(id);
  let active = 0, peak = 0;
  behavior = async (c) => { active++; peak = Math.max(peak, active); await delay(80); active--; return { success: true, output: `out ${c.role}` }; };
  const out = await rec.runDelegateCall(id, null, 0, { parallel: true, children: [child("a", "t1"), child("b", "t2"), child("c", "t3")] });
  check("three distinct children ran", calls.length === 3 && new Set(calls.map((c) => c.task)).size === 3);
  check("they overlapped", peak >= 2, `peak=${peak}`);
  check("each node id is unique", new Set(calls.map((c) => c.nodeId)).size === 3);
  check("depth passed to children", calls.every((c) => c.depth === 1));
  check("maxSteps passed", calls.every((c) => c.maxSteps === L.maxChildSteps));
  const nodes = rec.getDelegationTree(id).nodes;
  check("durable intervals prove actual child overlap", nodes.every(node => node.started_at && node.finished_at) &&
    Math.max(...nodes.map(node => Date.parse(node.started_at!))) < Math.min(...nodes.map(node => Date.parse(node.finished_at!))));
  check("durable node attributes actual returned artifacts", nodes.every(node =>
    JSON.stringify(node.artifacts) === JSON.stringify([`artifact-${node.id}`])));
  check("one parallel delegate reservation binds every sibling", nodes.every(node => !!node.parallel_group_id) &&
    new Set(nodes.map(node => node.parallel_group_id)).size === 1);
  check("success only when all succeeded", out.success && out.children.length === 3);
  await rec.runDelegateCall(id, null, 0, { parallel: true, children: [child("single", "one")] });
  const single = rec.getDelegationTree(id).nodes.at(-1);
  check("single-child parallel flag cannot mint a parallel group", single?.parallel_group_id === undefined);
}

section("R3 — sequential children keep order");
{
  const id = "rrrrrrrr-3";
  reset(id);
  await rec.runDelegateCall(id, null, 0, { children: [child("a", "1"), child("b", "2"), child("c", "3")] });
  check("order preserved", calls.map((c) => c.role).join("") === "abc");
}

section("R4 — duplicates and malformed requests are refused, nothing runs");
{
  const id = "rrrrrrrr-4";
  reset(id);
  const dup = await rec.runDelegateCall(id, null, 0, { parallel: true, children: [child("a", "same"), child("a", " same ")] });
  check("duplicate children refused", !dup.success && !!dup.refused_reason && /duplicate/i.test(dup.refused_reason));
  const many = await rec.runDelegateCall(id, null, 0, { children: Array.from({ length: L.maxChildrenPerCall + 1 }, (_, i) => child("r", `t${i}`)) });
  check("over-limit refused, not truncated", !many.success && /max/.test(many.refused_reason ?? ""));
  const empty = await rec.runDelegateCall(id, null, 0, { parallel: true });
  check("no role/task/children refused", !empty.success && !!empty.refused_reason);
  const blank = await rec.runDelegateCall(id, null, 0, { children: [{ role: "a", task: "  " }] });
  check("blank task refused", !blank.success);
  check("nothing executed", calls.length === 0);
  check("no budget consumed", rec.getSession(id).spawned === 0);
  check("resolveChildRequests throws for duplicates", (() => { try { rec.resolveChildRequests({ children: [child("a", "x"), child("a", "x")] }); return false; } catch (e) { return (e as Error).name === "DelegationRequestError"; } })());
}

section("R5 — depth limit");
{
  const id = "rrrrrrrr-5";
  reset(id);
  const out = await rec.runDelegateCall(id, null, L.maxDepth, { role: "a", task: "deep" });
  check("refused beyond max depth", !out.success && /depth/.test(out.refused_reason ?? "") && calls.length === 0);
}

section("R6 — spawn budget is atomic under concurrent delegate calls");
{
  const id = "rrrrrrrr-6";
  reset(id);
  behavior = async (c) => { await delay(30); return { success: true, output: c.role }; };
  const per = 3;
  const callsN = Math.ceil(L.maxTotalAgents / per) + 4; // clearly more than the budget allows
  const outs = await Promise.all(
    Array.from({ length: callsN }, (_, k) =>
      rec.runDelegateCall(id, null, 0, { parallel: true, children: Array.from({ length: per }, (_, i) => child(`r${k}`, `task ${k}-${i}`)) })
    )
  );
  const session = rec.getSession(id);
  check("never more agents than the cap", calls.length <= L.maxTotalAgents, `${calls.length}/${L.maxTotalAgents}`);
  check("spawned counter equals executed", session.spawned === calls.length, `${session.spawned} vs ${calls.length}`);
  check("budget fully used by whole calls", calls.length === Math.floor(L.maxTotalAgents / per) * per, String(calls.length));
  check("the rest were refused explicitly", outs.filter((o) => o.refused_reason).length === callsN - Math.floor(L.maxTotalAgents / per));
}

section("R7 — abort stops children and passes the signal down");
{
  const id = "rrrrrrrr-7";
  reset(id);
  const ac = new AbortController();
  rec.setSessionSignal(id, ac.signal);
  let started = 0;
  behavior = (c) => new Promise((resolve, reject) => { started++; c.signal?.addEventListener("abort", () => reject(new Error("aborted"))); });
  const p = rec.runDelegateCall(id, null, 0, { children: [child("a", "1"), child("b", "2")] });
  await delay(50);
  check("child got a signal even though the caller passed none", calls[0]?.signal instanceof AbortSignal);
  ac.abort(new Error("cancel"));
  const out = await p;
  check("sequential: second child never started", started === 1, String(started));
  check("outcome is not success", !out.success);
  check("children report cancelled, not failed", out.children.every((c) => c.status === "cancelled"), JSON.stringify(out.children.map((c) => c.status)));
  const after = await rec.runDelegateCall(id, null, 0, { role: "z", task: "after" });
  check("new delegation refused once aborted", !after.success && /cancel/i.test(after.refused_reason ?? "") && calls.length === 1);
  rec.setSessionSignal(id, undefined);
}

section("R8 — failure of one child makes the delegation unsuccessful");
{
  const id = "rrrrrrrr-8";
  reset(id);
  behavior = async (c) => (c.role === "bad" ? { success: false, output: "no" } : { success: true, output: "ok" });
  const out = await rec.runDelegateCall(id, null, 0, { parallel: true, children: [child("good", "1"), child("bad", "2")] });
  check("overall success=false", !out.success);
  check("per-child statuses", out.children.find((c) => c.role === "good")?.status === "success" && out.children.find((c) => c.role === "bad")?.status === "failed");
  behavior = async () => { throw new Error("boom"); };
  const thrown = await rec.runDelegateCall(id, null, 0, { role: "x", task: "y" });
  check("a throwing child is a failed outcome, not an exception", !thrown.success && thrown.children[0].status === "failed");
}

section("R9 — nested tree is recorded and persisted");
{
  const id = "rrrrrrrr-9";
  reset(id);
  const top = rec.registerTopLevelNode(id, "lead", "plan");
  behavior = async (c) => {
    if (c.role === "mid") await rec.runDelegateCall(id, c.nodeId!, c.depth!, { role: "leaf", task: "leaf work" });
    return { success: true, output: "ok" };
  };
  await rec.runDelegateCall(id, top, 0, { role: "mid", task: "mid work" });
  rec.finalizeNode(id, top, "success");
  const tree = rec.getDelegationTree(id);
  const byRole = (r: string) => tree.nodes.find((n) => n.role === r)!;
  check("three nodes", tree.nodes.length === 3 && tree.total_agents === 3);
  check("parent links", byRole("mid").parent_id === top && byRole("leaf").parent_id === byRole("mid").id);
  check("depths", byRole("lead").depth === 0 && byRole("mid").depth === 1 && byRole("leaf").depth === 2 && tree.max_depth === 2);
  const file = path.join(dataDir, "delegation-trees", `${id}.json`);
  check("tree persisted to disk", fs.existsSync(file));
  const disk = JSON.parse(fs.readFileSync(file, "utf-8"));
  check("persisted tree has all nodes", disk.nodes.length === 3);
}

section("R10 — a child granted no write tool is warned before it runs");
{
  const id = "rrrrrrrr-10";
  reset(id);
  const warned = await rec.runDelegateCall(id, null, 0, { parallel: true, children: [
    { role: "reader", task: "read only", tools: ["file_read"] },
    { role: "writer", task: "writes", tools: ["file_read", "file_write"] },
  ] });
  check("read-only child is flagged before execution",
    (warned.warnings ?? []).some((w) => /children\[0\] \(reader\)/.test(w) && /file_write or save_artifact/.test(w)));
  check("writer child raises no write warning", !(warned.warnings ?? []).some((w) => /children\[1\]/.test(w)));
  check("the warning does not refuse the child", warned.children.length === 2 && calls.length === 2);
  reset(id);
  const inherited = await rec.runDelegateCall(id, null, 0, { role: "reader", task: "inherits parent grant", tools: ["file_write"] });
  check("inherited write grant raises no warning", !(inherited.warnings ?? []).some((w) => /no write tool/.test(w)));
}

section("R11 — a host-injected executor also runs nested children");
{
  const id = "rrrrrrrr-11";
  reset(id);
  rec.__setRecursionTestDeps(null);
  const seen: string[] = [];
  const hostExecutor = (async (cfg: any) => {
    seen.push(`${cfg.depth}|${cfg.nodeId}`);
    return { role: cfg.role, output: "host-observed", artifacts: [`host-${cfg.nodeId}`], success: true, tools_used: [], model: "m" };
  }) as any;
  try {
    const out = await rec.runDelegateCall(id, null, 0, { parallel: true, children: [child("a", "t1"), child("b", "t2")] },
      { executeSpecialist: hostExecutor });
    check("both children went through the injected executor", seen.length === 2 && out.success);
    check("the host executor saw every depth-1 node",
      out.children.every(c => seen.includes(`1|${c.node_id}`)), seen.join(","));
    // Without an injected executor the module default is used, so a host that
    // relies on injection must pass it down rather than silently losing sight.
    reset(id);
    const fallback = await rec.runDelegateCall(id, null, 0, child("c", "t3"));
    check("no injected executor still runs the child through the module default",
      fallback.children.length === 1 && seen.length === 2);
  } finally {
    rec.__setRecursionTestDeps({
      executeSpecialist: (async (cfg: any, _id: string, o: any) => {
        const c: Call = { role: cfg.role, task: cfg.task, depth: cfg.depth, nodeId: cfg.nodeId, signal: o?.signal, maxSteps: o?.maxSteps };
        calls.push(c);
        const r = await behavior(c);
        return { role: cfg.role, output: r.output, artifacts: [`artifact-${cfg.nodeId}`], success: r.success, tools_used: ["shell"], model: "m" };
      }) as any,
      resolveModelForRole: () => "test-model",
    });
  }
}

section("R12 — the delegation contract explicitly names one parallel reservation");
{
  const source = fs.readFileSync(path.resolve("src/agents/specialists.ts"), "utf8");
  check("multi-child contract requires one call with parallel true",
    /exactly ONE delegate call with the children array and parallel: true/.test(source) &&
    /Separate delegate calls are separate reservations/.test(source));
  check("multi-child contract is attached to the actual delegate tool description",
    source.indexOf("exactly ONE delegate call with the children array") < source.indexOf("inputSchema:"));
  const head = fs.readFileSync(path.resolve("src/agents/head-agent.ts"), "utf8");
  check("Head carries the same child-call contract", /exactly ONE delegate call containing the full/.test(head));
  check("an assigned coordinator cannot create a duplicate coordinator",
    /If the CURRENT TASK assigns you the coordinator role/.test(source) &&
    /do not delegate the coordination or synthesis role to another coordinator/.test(source) &&
    /do not add children outside the task's explicit delegation plan/.test(source));
}

rec.__setRecursionTestDeps(null);
fs.rmSync(root, { recursive: true, force: true });
finish();
