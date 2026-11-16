/**
 * Recursive delegation: a specialist agent may create further specialised
 * sub-agents for mission-specific needs.
 *
 * The AWE architecture requires
 *   User → Prompt Master → Head → mission manager → recursive specialised
 *   subagents → tools/LLMs → independent QA → save → user
 *
 * A fixed roster of roles is NOT the goal: the number of specialisations is
 * open. What must be bounded is the *cost* of recursion. This module owns
 * those bounds.
 *
 * Limits (hard caps, enforced in code — not by prompt):
 *   - depth        : how deep a child may itself delegate
 *   - total agents : how many descendants a single mission may spawn
 *   - parallelism  : how many children may run concurrently in one call
 *   - per-child steps / tool budget
 *
 * The module deliberately contains no static import of `specialists.ts` — it
 * is loaded dynamically inside `runDelegateCall` to avoid an import cycle.
 */

import * as path from "path";
import * as fs from "node:fs";
import { appendLog, atomicWriteJson, dataSubdir, isSafeMissionId, withMissionLock } from "../utils/storage.js";
import { anySignal } from "./r0-runtime-compat.js";
import type { ExecuteSpecialistFn, ResolveModelFn } from "./r0-runtime-compat.js";

// ─── Limits ──────────────────────────────────────────────────────────────────

export const RECURSION_LIMITS = {
  /** Maximum delegation depth. Depth 0 = top-level specialist. */
  maxDepth: 3,
  /** Maximum number of agents (top-level and descendants) a mission may spawn. */
  maxTotalAgents: 12,
  /** Maximum children executed concurrently in one delegate call. */
  maxParallelChildren: 4,
  /** Maximum children in a single delegate call, regardless of parallelism. */
  maxChildrenPerCall: 4,
  /** Maximum tool steps for a child agent. */
  maxChildSteps: 10,
} as const;

// ─── Session state ───────────────────────────────────────────────────────────

/**
 * Per-mission delegation session. Tracks the spawn budget and the tree so
 * the final mission record can show the real agent hierarchy.
 */
export interface DelegationNode {
  id: string;
  role: string;
  task: string;
  depth: number;
  parent_id: string | null;
  status: "running" | "success" | "failed";
  model?: string;
  tools_used?: string[];
  /** Actual specialist execution interval, persisted before and after the call. */
  started_at?: string;
  finished_at?: string;
  /** Real artifact registry IDs newly produced by this node. */
  artifacts?: string[];
  /** Exact parallel delegate reservation shared by all siblings from one call. */
  parallel_group_id?: string;
  duration_ms?: number;
  /** Why the node failed or never started (cancelled, refused, error text). */
  note?: string;
  children: string[];
}

export interface DelegationSession {
  mission_id: string;
  nodes: Map<string, DelegationNode>;
  /** Agents spawned (or reserved) so far; compared against the per-mission cap. */
  spawned: number;
  /** Monotonic id counter. Never decreases, so node ids are never reused. */
  seq: number;
  root_id: string | null;
  maxDepthUsed: number;
  /** Mission-level abort signal; delegate calls inherit it even if the caller passes none. */
  signal?: AbortSignal;
  /** Mission lease fence inherited by every recursive tool context. */
  fence?: () => boolean;
}

const sessions = new Map<string, DelegationSession>();

/** The spent budget is durable mission state, not an attempt's visible tree. */
function readSpentBudget(missionId: string): { spawned: number; seq: number } {
  if (!isSafeMissionId(missionId)) throw new Error("Delegation refused: unsafe mission id");
  const budgetPath = path.join(dataSubdir("delegation-budgets"), `${missionId}.json`);
  // Upgrade existing trees conservatively; a new ledger is written on reservation.
  const file = fs.existsSync(budgetPath)
    ? budgetPath
    : path.join(dataSubdir("delegation-trees"), `${missionId}.json`);
  if (!fs.existsSync(file)) return { spawned: 0, seq: 0 };
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  if (saved.mission_id !== missionId || !Number.isSafeInteger(saved.total_agents) || saved.total_agents < 0) {
    throw new Error("Delegation refused: invalid persisted spawn budget");
  }
  const seq = saved.next_seq ?? Math.max(saved.total_agents, ...(saved.nodes ?? []).map(
    (node: DelegationNode) => Number(node.id.match(/(?:top|n)(\d+)$/)?.[1] ?? -1) + 1
  ));
  if (!Number.isSafeInteger(seq) || seq < saved.total_agents) {
    throw new Error("Delegation refused: invalid persisted spawn sequence");
  }
  return { spawned: saved.total_agents, seq };
}

/** Reserve once, before effects, under the same cross-process mission lock. */
function reserveAgents(session: DelegationSession, count: number): boolean {
  return withMissionLock(session.mission_id, () => {
    if (session.signal?.aborted) throw session.signal.reason ?? new Error("Delegation cancelled");
    if (session.fence && !session.fence()) throw new Error("Delegation refused: mission ownership lost");
    const spent = readSpentBudget(session.mission_id);
    const spawned = Math.max(session.spawned, spent.spawned);
    const seq = Math.max(session.seq, spent.seq);
    session.spawned = spawned;
    session.seq = seq;
    if (spawned + count > RECURSION_LIMITS.maxTotalAgents) return false;
    if (session.signal?.aborted) throw session.signal.reason ?? new Error("Delegation cancelled");
    if (session.fence && !session.fence()) throw new Error("Delegation refused: mission ownership lost");
    // Unlike tree observability, persistence failure must stop execution: otherwise
    // a restart could restore budget that already produced external effects.
    atomicWriteJson(path.join(dataSubdir("delegation-budgets"), `${session.mission_id}.json`), {
      mission_id: session.mission_id,
      total_agents: spawned + count,
      next_seq: seq + count,
    });
    session.spawned = spawned + count;
    return true;
  });
}

export function getSession(missionId: string): DelegationSession {
  let s = sessions.get(missionId);
  if (!s) {
    s = {
      mission_id: missionId,
      nodes: new Map(),
      ...readSpentBudget(missionId),
      root_id: null,
      maxDepthUsed: 0,
    };
    sessions.set(missionId, s);
  }
  return s;
}

export function resetSession(missionId: string): void {
  const session = getSession(missionId);
  // A manager calls this on every attempt, including resume. Clear only the
  // attempt view/bindings; consumed slots and node ids must never be recycled.
  // Keep the object itself so pending delegate calls still share its budget.
  const spent = readSpentBudget(missionId);
  session.spawned = Math.max(session.spawned, spent.spawned);
  session.seq = Math.max(session.seq, spent.seq);
  session.nodes.clear();
  session.root_id = null;
  session.maxDepthUsed = 0;
  session.signal = undefined;
  session.fence = undefined;
}

/** Bind the mission's abort signal so every delegate call under it stops when the mission is cancelled. */
export function setSessionSignal(missionId: string, signal: AbortSignal | undefined): void {
  getSession(missionId).signal = signal;
}

/** Bind the current owner fence so recursive children cannot outlive their attempt. */
export function setSessionFence(missionId: string, fence: (() => boolean) | undefined): void {
  getSession(missionId).fence = fence;
}

/**
 * Snapshot the tree to DATA_DIR/delegation-trees/<mission>.json after every
 * change, so the hierarchy survives a crash. Best effort: observability must
 * never fail a delegation.
 */
function persistSession(session: DelegationSession): void {
  if (!isSafeMissionId(session.mission_id)) return;
  try {
    atomicWriteJson(path.join(dataSubdir("delegation-trees"), `${session.mission_id}.json`), {
      mission_id: session.mission_id,
      saved_at: new Date().toISOString(),
      total_agents: session.spawned,
      max_depth: session.maxDepthUsed,
      nodes: Array.from(session.nodes.values()),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Register a top-level (depth 0) delegation as a node in the delegation tree.
 *
 * Without this, only recursively spawned children would appear in the tree and
 * the mission record would not show the real agent hierarchy.
 *
 * Returns the node id so the caller can finalise it once the agent finishes.
 */
export function registerTopLevelNode(
  missionId: string,
  role: string,
  task: string
): string {
  const session = getSession(missionId);
  if (!reserveAgents(session, 1)) {
    throw new DelegationRequestError(`Delegation refused: mission spawn budget exhausted (${session.spawned}/${RECURSION_LIMITS.maxTotalAgents} agents already used).`);
  }
  const id = `${missionId}:top${session.seq++}`;
  const node: DelegationNode = {
    id,
    role,
    started_at: new Date().toISOString(),
    task,
    depth: 0,
    parent_id: null,
    status: "running",
    children: [],
  };
  session.nodes.set(id, node);
  session.maxDepthUsed = Math.max(session.maxDepthUsed, 0);
  if (!session.root_id) session.root_id = id;
  persistSession(session);
  return id;
}

/** Finalise a previously registered delegation node. */
export function finalizeNode(
  missionId: string,
  nodeId: string,
  status: "running" | "success" | "failed",
  extra?: { model?: string; tools_used?: string[]; artifacts?: string[]; duration_ms?: number; note?: string }
): void {
  const session = getSession(missionId);
  const node = session.nodes.get(nodeId);
  if (!node) return;
  node.status = status;
  if (extra?.model) node.model = extra.model;
  if (extra?.tools_used) node.tools_used = extra.tools_used;
  if (extra?.artifacts) node.artifacts = [...extra.artifacts];
  if (extra?.duration_ms !== undefined) node.duration_ms = extra.duration_ms;
  node.finished_at = new Date().toISOString();
  if (extra?.note) node.note = extra.note;
  persistSession(session);
}

/** Snapshot of the delegation tree for persistence in the mission record. */
export function getDelegationTree(missionId: string): {
  nodes: DelegationNode[];
  total_agents: number;
  max_depth: number;
} {
  const s = getSession(missionId);
  const nodes = Array.from(s.nodes.values()).map((n) => ({ ...n, children: [...n.children] }));
  return { nodes, total_agents: s.spawned, max_depth: s.maxDepthUsed };
}

// ─── Role synthesis ──────────────────────────────────────────────────────────

/**
 * Keyword hints used to synthesise instructions for roles that are not in the
 * built-in roster. This is what makes specialisation open-ended rather than a
 * fixed list: the Head Agent can invent a role and the specialist still gets
 * a coherent brief.
 */
const ROLE_KEYWORD_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /frontend|ui|web|вёрст|интерфейс|дизайн/i, hint: "Focus on frontend implementation, responsive layout, and UI correctness." },
  { pattern: /backend|api|server|бэкенд/i, hint: "Focus on API design, data flow, and error handling." },
  { pattern: /qa|test|верификац|проверк|контроль/i, hint: "Focus on verification: reproduce, observe, and report real evidence." },
  { pattern: /research|исслед|анализ/i, hint: "Focus on sourced findings with verifiable references." },
  { pattern: /design|дизайн|ux/i, hint: "Focus on visual concept, information architecture, and a coherent design system." },
  { pattern: /content|копирайт|текст|writer/i, hint: "Focus on clear, audience-appropriate written output." },
  { pattern: /data|данн|аналитик/i, hint: "Focus on reproducible data processing and explicit conclusions." },
  { pattern: /devops|infra|операцион/i, hint: "Focus on environment inspection and reproducible shell commands." },
  { pattern: /prompt|llm|agent|агент/i, hint: "Focus on agent/LLM behaviour, prompt structure, and tool use." },
  { pattern: /doc|документ/i, hint: "Focus on accurate, self-contained documentation." },
];

/**
 * Synthesise instructions for an arbitrary role. Built-in roles keep their
 * curated brief; unknown roles get a composed brief from keyword hints.
 */
export function synthesizeRoleInstructions(role: string): string {
  const hits = ROLE_KEYWORD_HINTS.filter((h) => h.pattern.test(role));
  const hints = hits.map((h) => `- ${h.hint}`).join("\n");
  return [
    `You are a mission-specific specialist working as "${role}".`,
    "Your role was created dynamically for this mission because the built-in",
    "roster did not cover the required specialisation. Infer the concrete",
    "skills needed from the task description and deliver real, verifiable output.",
    hints ? `\nDomain guidance:\n${hints}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// ─── Delegation execution ────────────────────────────────────────────────────

export interface DelegateChild {
  role: string;
  task: string;
  context?: string;
  expected_output?: string;
  tools?: string[];
}

export interface DelegateRequest {
  /** Legacy single-child form. Ignored when `children` is a non-empty array. */
  task?: string;
  role?: string;
  expected_output?: string;
  context?: string;
  tools?: string[];
  /**
   * Distinct children to run. With `parallel` they run concurrently; otherwise
   * in order. Each entry is its own agent with its own task.
   */
  children?: DelegateChild[];
  /**
   * Run `children` concurrently. It never clones a request: a legacy single
   * request always spawns exactly one child, whatever this flag says.
   */
  parallel?: boolean;
}

export interface DelegateOptions {
  /** Cancellation for this call (combined with the mission-level signal). */
  signal?: AbortSignal;
  /** Capability ceiling inherited from the parent specialist. */
  allowedTools?: ReadonlySet<string>;
  /** Current mission-owner fence inherited from the parent/manager. */
  fence?: () => boolean;
  /** The owning delegation's durable marker, shared by every nested child. */
  beginEffect?: (label?: string) => void;
  withEffect?: import("../utils/mission-admission.js").SynchronousMissionEffect;
  modelRoute?: import("./specialists.js").SpecialistRunOptions["modelRoute"];
  /** Host-selected policy; retrieval revalidates every child's role and target. */
  experience?: import("./specialists.js").SpecialistRunOptions["experience"];
  localCapability?: import("./specialists.js").SpecialistRunOptions["localCapability"];
  qualifiedAttemptIds?: Map<string, string>;
  /**
   * The host's specialist executor, inherited from the parent run. Without it a
   * nested child runs outside whatever the host injected into MissionManager.
   */
  executeSpecialist?: import("./r0-runtime-compat.js").ExecuteSpecialistFn;
}

export interface DelegateOutcome {
  success: boolean;
  output: string;
  children: Array<{
    role: string;
    status: string;
    output: string;
    model?: string;
    tools_used?: string[];
    duration_ms: number;
    node_id?: string;
  }>;
  errors: string[];
  /** Set when the call was refused because a limit was hit or the request was invalid. */
  refused_reason?: string;
  /** Non-fatal adjustments made to the request (e.g. parallel ignored for a single child). */
  warnings?: string[];
}

interface RecursionDeps {
  executeSpecialist: ExecuteSpecialistFn;
  resolveModelForRole: ResolveModelFn;
}

let testDeps: RecursionDeps | null = null;

/** Test seam: replace the specialist executor so recursion can be exercised without model calls. */
export function __setRecursionTestDeps(deps: RecursionDeps | null): void {
  testDeps = deps;
}

const DEFAULT_CHILD_TOOLS: string[] = [];

function refuse(missionId: string, reason: string): DelegateOutcome {
  appendLog(missionId, `recursion: ${reason}`);
  return { success: false, output: reason, children: [], errors: [reason], refused_reason: reason };
}

function childKey(c: DelegateChild): string {
  return JSON.stringify([c.role.trim(), c.task.trim(), (c.expected_output ?? "").trim()]);
}

/** Turn a request into the exact list of children to spawn, or a refusal reason. */
function resolveChildren(request: DelegateRequest): { children: DelegateChild[]; warnings: string[] } | { error: string } {
  const warnings: string[] = [];
  const nonBlank = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

  if (Array.isArray(request.children) && request.children.length > 0) {
    if (request.children.length > RECURSION_LIMITS.maxChildrenPerCall) {
      return {
        error: `Delegation refused: ${request.children.length} children requested, max ${RECURSION_LIMITS.maxChildrenPerCall} per call.`,
      };
    }
    const children: DelegateChild[] = [];
    for (const [i, c] of request.children.entries()) {
      if (!c || !nonBlank(c.role) || !nonBlank(c.task)) {
        return { error: `Delegation refused: children[${i}] needs a non-empty role and task.` };
      }
      children.push({
        role: c.role,
        task: c.task,
        context: c.context ?? request.context,
        expected_output: c.expected_output ?? request.expected_output,
        tools: c.tools !== undefined ? c.tools : request.tools,
      });
    }
    const seen = new Set<string>();
    for (const c of children) {
      const key = childKey(c);
      if (seen.has(key)) {
        return {
          error:
            `Delegation refused: duplicate child (role "${c.role}", same task). ` +
            `Children must be distinct; one request is never cloned into several agents.`,
        };
      }
      seen.add(key);
    }
    return { children, warnings };
  }

  if (!nonBlank(request.role) || !nonBlank(request.task)) {
    return { error: "Delegation refused: provide `children` (distinct entries) or a role and task." };
  }
  if (request.parallel) {
    warnings.push(
      "parallel=true ignored: a single request spawns exactly one child. Pass `children` with distinct entries to fan out."
    );
  }
  return {
    children: [
      {
        role: request.role,
        task: request.task,
        context: request.context,
        expected_output: request.expected_output,
        tools: request.tools,
      },
    ],
    warnings,
  };
}

export class DelegationRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegationRequestError";
  }
}

/**
 * Pure planner: the exact, distinct children a request would spawn. A legacy
 * single request yields one child whatever `parallel` says; `children` yields
 * those entries in order. Throws DelegationRequestError for an invalid or
 * duplicate-bearing request.
 */
export function resolveChildRequests(request: DelegateRequest): DelegateChild[] {
  const resolved = resolveChildren(request);
  if ("error" in resolved) throw new DelegationRequestError(resolved.error);
  return resolved.children;
}

/**
 * Execute a delegate call from inside a running agent.
 *
 * Enforces the caps before doing any work. A refusal is a normal, explicit
 * outcome — never a silent truncation. The depth/count/budget checks and the
 * reservation of spawn slots happen in one synchronous block (no await in
 * between), so concurrent delegate calls cannot jointly exceed the budget.
 */
export async function runDelegateCall(
  missionId: string,
  parentNodeId: string | null,
  parentDepth: number,
  request: DelegateRequest,
  options: DelegateOptions = {}
): Promise<DelegateOutcome> {
  const session = getSession(missionId);
  const errors: string[] = [];
  const signal = anySignal([options.signal, session.signal]);
  const fence = options.fence ?? session.fence;

  if (signal?.aborted) return refuse(missionId, "Delegation refused: the mission is being cancelled.");
  if (fence && !fence()) return refuse(missionId, "Delegation refused: mission ownership lost.");

  // ── Cap: depth ────────────────────────────────────────────────────────────
  const childDepth = parentDepth + 1;
  if (childDepth > RECURSION_LIMITS.maxDepth) {
    return refuse(missionId, `Delegation refused: max depth ${RECURSION_LIMITS.maxDepth} reached (current depth ${parentDepth}).`);
  }

  // ── Request shape: distinct children only ─────────────────────────────────
  const resolved = resolveChildren(request);
  if ("error" in resolved) return refuse(missionId, resolved.error);
  const { warnings } = resolved;
  const parentGrants = options.allowedTools;
  const children = resolved.children.map((child) => ({
    ...child,
    tools: child.tools !== undefined
      ? child.tools
      : parentGrants
        ? [...parentGrants].filter((tool) => tool !== "delegate")
        : [],
  }));
  if (parentGrants) {
    const escalation = children.flatMap((child) => (child.tools ?? []).filter((tool) => !parentGrants.has(tool)));
    if (escalation.length > 0) {
      return refuse(missionId, `Delegation refused: child tool grant exceeds parent grant (${[...new Set(escalation)].join(", ")}).`);
    }
  }
  // A child is accepted only when it registers a new artifact, which requires a
  // write grant. Warn rather than refuse: the child still runs, but the caller
  // must know in advance that text-only output cannot satisfy the gate.
  const WRITE_TOOLS = new Set(["file_write", "save_artifact", "shell", "csv_analytics"]);
  for (const [i, child] of children.entries()) {
    if (!(child.tools ?? []).some((tool) => WRITE_TOOLS.has(tool))) {
      warnings.push(
        `children[${i}] (${child.role}) has no write tool (${(child.tools ?? []).join(", ") || "none"}); ` +
          `it cannot register an artifact and will be evaluated as failed unless you grant file_write or save_artifact.`
      );
    }
  }

  // ── Cap: total agents per mission, then reserve — all before any await ────
  // Each child gets its own role/tool authorization, while all admission locks
  // remain held through the synchronous durable reservation and node write.
  // No await/provider execution is permitted inside this critical section.
  let nodes: DelegationNode[] = [];
  const reserve = (): boolean => {
    if (!reserveAgents(session, children.length)) return false;
    const parallelGroupId = children.length > 1 && request.parallel
      ? `${missionId}:pg${session.seq}-${children.length}`
      : undefined;
    nodes = children.map((child) => {
      const node: DelegationNode = {
        id: `${missionId}:d${childDepth}n${session.seq++}`,
        role: child.role, task: child.task, depth: childDepth, parent_id: parentNodeId,
        status: "running", started_at: new Date().toISOString(), parallel_group_id: parallelGroupId, children: [],
      };
      session.nodes.set(node.id, node);
      if (parentNodeId) session.nodes.get(parentNodeId)?.children.push(node.id);
      else if (!session.root_id) session.root_id = node.id;
      return node;
    });
    session.maxDepthUsed = Math.max(session.maxDepthUsed, childDepth);
    persistSession(session);
    return true;
  };
  const authorizeAndReserve = children.reduceRight<() => boolean>((next, child) => () =>
    options.withEffect ? options.withEffect(next, {
      stage: "delegation", role: child.role, tools: child.tools ?? [], label: "recursive delegation reservation",
    }) : next(), reserve);
  if (!authorizeAndReserve()) return refuse(missionId,
    `Delegation refused: mission spawn budget exhausted (${session.spawned}/${RECURSION_LIMITS.maxTotalAgents} agents already used).`);

  const cancelledChild = (idx: number): DelegateOutcome["children"][number] => {
    const node = nodes[idx];
    node.status = "failed";
    node.finished_at = new Date().toISOString();
    node.note = "cancelled before start";
    persistSession(session);
    return { role: children[idx].role, status: "cancelled", output: "", duration_ms: 0, node_id: node.id };
  };

  let deps: RecursionDeps;
  try {
    if (testDeps) {
      deps = testDeps;
    } else if (options.executeSpecialist) {
      // A host-injected executor keeps nested children inside the same
      // observation, accounting and bounding boundary as depth 0.
      deps = {
        executeSpecialist: options.executeSpecialist,
        resolveModelForRole: (await import("./specialists.js")).resolveModelForRole as ResolveModelFn,
      };
    } else {
      // Dynamic import avoids a static import cycle specialists ↔ tools.
      const mod = await import("./specialists.js");
      deps = {
        executeSpecialist: mod.executeSpecialist as ExecuteSpecialistFn,
        resolveModelForRole: mod.resolveModelForRole as ResolveModelFn,
      };
    }
  } catch (err) {
    for (const n of nodes) {
      n.status = "failed";
      n.note = "specialist runtime unavailable";
    }
    persistSession(session);
    const msg = `Delegation failed: ${String(err)}`;
    appendLog(missionId, `recursion: ${msg}`);
    return { success: false, output: msg, children: [], errors: [msg], warnings };
  }

  const runChild = async (idx: number): Promise<DelegateOutcome["children"][number]> => {
    if (signal?.aborted) return cancelledChild(idx);
    const child = children[idx];
    const node = nodes[idx];
    const role = child.role;
    const start = Date.now();
    try {
      const res = await deps.executeSpecialist(
        {
          role,
          task: child.task,
          context: child.context ?? "",
          tools: child.tools ?? DEFAULT_CHILD_TOOLS,
          allowedTools: child.tools ?? DEFAULT_CHILD_TOOLS,
          expected_output: child.expected_output ?? "A concrete, verifiable result",
          missionId,
          depth: childDepth,
          nodeId: node.id,
        },
        missionId,
        { maxSteps: RECURSION_LIMITS.maxChildSteps, signal, fence, beginEffect: options.beginEffect,
          withEffect: options.withEffect, modelRoute: options.modelRoute, experience: options.experience,
          localCapability: options.localCapability, qualifiedAttemptIds: options.qualifiedAttemptIds,
          executeSpecialist: deps.executeSpecialist }
      );
      node.status = res.success ? "success" : "failed";
      node.model = res.model ?? deps.resolveModelForRole(role);
      node.tools_used = res.tools_used;
      node.artifacts = [...res.artifacts];
      node.finished_at = new Date().toISOString();
      node.duration_ms = Date.now() - start;
      persistSession(session);
      return {
        role,
        status: res.success ? "success" : "failed",
        output: res.output ?? "",
        model: node.model,
        tools_used: res.tools_used,
        duration_ms: node.duration_ms,
        node_id: node.id,
      };
    } catch (err) {
      const cancelled = !!signal?.aborted;
      node.status = "failed";
      node.note = cancelled ? "cancelled" : String(err).slice(0, 300);
      node.finished_at = new Date().toISOString();
      node.duration_ms = Date.now() - start;
      persistSession(session);
      return {
        role,
        status: cancelled ? "cancelled" : "failed",
        output: cancelled ? "" : `Sub-agent error: ${String(err).slice(0, 500)}`,
        duration_ms: node.duration_ms,
        node_id: node.id,
      };
    }
  };

  const results: DelegateOutcome["children"] = [];
  if (request.children && children.length > 1 && request.parallel) {
    const settled = await Promise.allSettled(children.map((_, i) => runChild(i)));
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else errors.push(String(s.reason));
    }
  } else {
    for (let i = 0; i < children.length; i++) {
      try {
        results.push(await runChild(i));
      } catch (err) {
        errors.push(String(err));
      }
    }
  }

  // A delegation only succeeds when every child it spawned succeeded.
  const success =
    results.length === children.length && errors.length === 0 && results.every((r) => r.status === "success");
  const output = results
    .map((r) => `--- sub-agent: ${r.role} (${r.status}) ---\n${r.output}`)
    .join("\n\n");

  appendLog(
    missionId,
    `recursion: depth=${childDepth} spawned=${results.length} agents ` +
      `(total=${session.spawned}/${RECURSION_LIMITS.maxTotalAgents}) success=${success}`
  );

  return { success, output, children: results, errors, ...(warnings.length ? { warnings } : {}) };
}

/** Test seam: allow tests to inspect the browser tool registry availability. */
export async function playwrightToolNames(): Promise<string[]> {
  const { getPlaywrightTools } = await import("../config/mcp.js");
  const tools = await getPlaywrightTools();
  return Object.keys(tools);
}
