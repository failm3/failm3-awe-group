import type { Mission, MissionStatus, AgentResult, QAReview, MissionExecutionSummary, Artifact } from "../types/index.js";
import { ArtifactSchema } from "../types/index.js";
import type { DelegationPlan, DelegationPlanItem } from "./head-agent.js";
import {
  getDelegationTree,
  registerTopLevelNode,
  finalizeNode,
  resetSession,
  setSessionSignal,
  setSessionFence,
  DelegationRequestError,
} from "./recursion.js";
import {
  updateMissionAtomic,
  appendLog,
  listArtifacts,
  loadMission,
  reconcileArtifactFiles,
  isTerminalStatus,
  sealMission,
  unsealMission,
  missionSealReason,
  DATA_DIR,
  dataSubdir,
} from "../utils/storage.js";
import {
  saveCheckpoint,
  loadCheckpoint,
  clearCheckpoint,
  withMissionTimeout,
  MissionTimeoutError,
  MissionFencedError,
  MissionLeaseError,
  CheckpointIntegrityError,
  DEFAULT_MISSION_TIMEOUT_MS,
  delegationFingerprint,
  tryAcquireMissionLease,
  readMissionLease,
  isLeaseLive,
  requestMissionCancel,
  readCancelRequest,
  clearCancelRequest,
} from "../agents/lifecycle.js";
import type {
  MissionCheckpoint,
  MissionLease,
  InFlightDelegation,
  StoredMissionPlan,
  StoredDelegationPlanItem,
  ArtifactSupersession,
  RepairProvenance,
  DurableRecoveryResolution,
} from "../agents/lifecycle.js";
export type { ArtifactSupersession } from "../agents/lifecycle.js";
import type { PlanMissionFn, ReviewMissionFn, ExecuteSpecialistFn, ResolveModelFn } from "./r0-runtime-compat.js";
import * as fs from "fs";
import { assertApprovedSpecBinding, formatApprovedSpecContext } from "../utils/spec-binding.js";
import * as path from "path";
import * as crypto from "crypto";
import { quiesceCurrentMissionProcessGroups, reapOrphanedMissionProcessGroups } from "../utils/process-registry.js";
import { MISSION_ADMISSION_KEY, prepareMissionAdmission } from "../utils/mission-admission.js";
import type { MissionAdmissionPolicy, MissionExecutionTarget, SynchronousMissionEffect } from "../utils/mission-admission.js";
import { QualificationDeniedError } from "../utils/qualification.js";
import { createCandidateEpoch, createCandidateReviewReceipt, persistCandidateEvidence, assertCandidateCurrent } from "./candidate.js";
import type { CandidateEpoch } from "./candidate.js";
import { saveArtifactFile } from "../utils/storage.js";
import { ordinaryPlan, validateCapabilityDecision } from "./capability-plane.js";
import type { CapabilityAttempt, CapabilityDecision, CapabilityObservation } from "./capability-plane.js";
import { createLocalCapabilityGate, listQualifiedInvocationReceipts, persistedQualifiedTarget, qualifiedExecutableDefects, qualifiedExecutablePaths, registerQualifiedExecutables, resolveQualifiedTarget } from "../utils/local-capability.js";
import type { LocalCapabilityAcquisitionPolicy, QualifiedInvocationReceipt } from "../utils/local-capability.js";
import { allArtifactRecords, artifactIntegrityDefect, authenticateSupersessions, resolveCurrentArtifact } from "../utils/artifact-evidence.js";
import { READ_ONLY_TOOLS } from "../security/read-only-tools.js";

const MAX_REPAIR_ITERATIONS = 2;
// Keep loading bounded while retaining enough UTF-8 bytes for the reviewer to
// detect every artifact that exceeds its 24,000-character evidence window.
const QA_ARTIFACT_REVIEW_CHARS = 24_000;
const QA_ARTIFACT_READ_BYTES = (QA_ARTIFACT_REVIEW_CHARS + 1) * 4;

/** Default time to wait for in-flight work to stop after an abort. */
const DEFAULT_QUIESCE_TIMEOUT_MS = 15_000;

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Abort reason used for an explicit cancel. A cancelled mission is never reported as failed. */
export class MissionCancelledError extends Error {
  constructor(public missionId: string, public reason: string) {
    super(`Mission ${missionId} cancelled: ${reason}`);
    this.name = "MissionCancelledError";
  }
}

/** Internal nonterminal outcome: an effect-bearing failure needs explicit recovery. */
class MissionRecoveryRequiredError extends Error {
  constructor(
    public missionId: string,
    public failedReview?: { review: QAReview; gate: import("./qa-gate.js").QAGateResult }
  ) {
    super(`Mission ${missionId} has an effect-bearing failed outcome requiring explicit recovery`);
    this.name = "MissionRecoveryRequiredError";
  }
}

/** The mission is not in a state this operation may start from. */
export class MissionStateError extends Error {
  constructor(public missionId: string, message: string) {
    super(message);
    this.name = "MissionStateError";
  }
}

// ─── Injectable dependencies (test seam; defaults are the real agents) ───────

export interface ManagerDeps {
  planMission: PlanMissionFn;
  executeSpecialist: ExecuteSpecialistFn;
  reviewMissionDetailed: ReviewMissionFn;
  resolveModelForRole: ResolveModelFn;
}

/**
 * The real agents are imported lazily, only when a run actually needs them.
 * Importing this module is therefore free of side effects (no model clients,
 * no memory database), and a run with injected `deps` never loads them.
 */
async function loadDefaultDeps(missing: Array<keyof ManagerDeps>): Promise<Partial<ManagerDeps>> {
  const out: Partial<ManagerDeps> = {};
  if (missing.includes("planMission")) {
    out.planMission = (await import("./head-agent.js")).planMission as PlanMissionFn;
  }
  if (missing.includes("executeSpecialist") || missing.includes("resolveModelForRole")) {
    const mod = await import("./specialists.js");
    out.executeSpecialist = mod.executeSpecialist as ExecuteSpecialistFn;
    out.resolveModelForRole = mod.resolveModelForRole as ResolveModelFn;
  }
  if (missing.includes("reviewMissionDetailed")) {
    out.reviewMissionDetailed = (await import("./qa-agent.js")).reviewMissionDetailed as ReviewMissionFn;
  }
  return out;
}

export interface MissionManagerOptions {
  /** Host-only professional qualification policy. Never accepted from model/request metadata. */
  admission?: MissionAdmissionPolicy;
  /** Host-only local executable qualification callback; structured acquisition fails closed without it. */
  acquisition?: LocalCapabilityAcquisitionPolicy;
  /** Explicit offline fixture seam; requires all four agent dependencies injected. */
  offlineFixture?: boolean;
  /** A lease the caller already acquired (e.g. /approve). The manager takes ownership and releases it. */
  lease?: MissionLease;
  /** Statuses the mission may be claimed from. Default: approved, paused, running (orphaned). */
  allowedStatuses?: MissionStatus[];
  /** How long cancel/timeout wait for in-flight work to stop. */
  quiesceTimeoutMs?: number;
  /** Grace after a timeout abort before the manager stops waiting for the aborted work. */
  timeoutGraceMs?: number;
  /**
   * How a delegation that was started but never recorded as finished (crash,
   * SIGKILL, timeout) is treated on resume.
   *  - "strict" (default): always block until an operator resolves it. Absence
   *    of a local footprint is NOT proof that an external effect did not occur.
   *  - "evidence": an explicit opt-in for controlled side-effect-free work;
   *    block on a durable footprint, otherwise permit a pre-effect retry.
   */
  unresolvedIntentPolicy?: "evidence" | "strict";
  deps?: Partial<ManagerDeps>;
  /** Trusted per-node model choice shared with all descendant specialists. */
  modelRoute?: SpecialistRunOptions["modelRoute"];
  /** Host-selected verified experience; no model-authored memory or grants. */
  experience?: SpecialistRunOptions["experience"];
}

export interface CancelResult {
  /** The mission is now `cancelled`. */
  cancelled: boolean;
  /** All in-flight work had stopped when the mission was marked cancelled. */
  quiesced: boolean;
  status: MissionStatus | "not_found";
  /** Operations still unsettled after the quiescence wait. */
  pending_operations: number;
  /** The request was forwarded to another process that owns the lease. */
  forwarded?: boolean;
  /** Why cancellation could not be confirmed, when applicable. */
  error?: string;
}

type TrackedResult = AgentResult & {
  qualified_attempt_ids?: string[];
  fingerprint?: string;
  delegationId?: string;
  task?: string;
  intentKey?: string;
};

// ─── Durable delegation intents (ambiguous-outcome protocol) ─────────────────

const INTENT_PROTOCOL = "intent-v1";

interface EffectBaseline {
  artifact_ids: string[];
  artifact_fs_digest: string;
  tree_node_ids: string[];
}

/**
 * A checkpoint `in_flight` record written BEFORE a delegation (or repair) runs.
 * It is removed only in the same checkpoint write that records the outcome, so
 * an intent that survives a crash means "the effect may have happened, the
 * outcome was never recorded".
 */
type IntentEntry = InFlightDelegation & {
  protocol?: typeof INTENT_PROTOCOL;
  intent_id?: string;
  kind?: "delegation" | "repair";
  node_id?: string;
  repair_iteration?: number;
  baseline?: EffectBaseline;
  effect_marked_at?: string;
  effect_label?: string;
  /**
   * Every distinct effect label marked during the attempt. `effect_marked_at`
   * and `effect_label` record the first one for compatibility; this keeps the
   * full set so that a later real effect is not hidden by an earlier model call.
   */
  effect_labels?: string[];
  ambiguous?: { detected_at: string; reasons: string[] };
  /**
   * Set when the attempt ended in a definite failure (returned `success:false`,
   * no verified artifact, or a thrown error) AFTER an external effect began. The
   * failure does not prove the effect did not happen, so the intent is retained.
   */
  failed_outcome?: { recorded_at: string; thrown: boolean; issues: string[] };
};

/** Options handed to the specialist. `beginEffect` is an optional cooperative durable marker. */
type SpecialistRunOptions = NonNullable<Parameters<ExecuteSpecialistFn>[2]> & {
  beginEffect?: (label?: string) => void;
  withEffect?: SynchronousMissionEffect;
  localCapability?: import("../utils/local-capability.js").LocalCapabilityGate;
  qualifiedAttemptIds?: Map<string, string>;
};

export interface AmbiguousResolution {
  intent_id: string;
  /** retry: operator accepts that the effect may repeat. accept: operator vouches the effect happened and names its artifacts. */
  decision: "retry" | "accept";
  operator: string;
  note: string;
  /** Required for "accept": registered, integrity-verified artifact ids that evidence the effect. */
  artifacts?: string[];
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function artifactFsDigest(missionId: string): string {
  const root = path.join(DATA_DIR, "artifacts", missionId);
  const lines: string[] = [];
  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      try {
        const st = fs.lstatSync(full);
        lines.push(`${path.relative(root, full)}\u0000${st.size}\u0000${st.mtimeMs}`);
      } catch {
        lines.push(`${path.relative(root, full)}\u0000unreadable`);
      }
    }
  };
  walk(root);
  return sha256Hex(lines.sort().join("\n"));
}

function captureBaseline(missionId: string): EffectBaseline {
  return {
    artifact_ids: listArtifacts(missionId).map((artifact) => artifact.id).sort(),
    artifact_fs_digest: artifactFsDigest(missionId),
    tree_node_ids: getDelegationTree(missionId).nodes.map((node) => node.id),
  };
}

/** Child nodes the persisted delegation tree gained since the baseline (below `nodeId` when known). */
function newTreeChildren(missionId: string, baseline: EffectBaseline, nodeId?: string): string[] {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataSubdir("delegation-trees"), `${missionId}.json`), "utf-8")) as {
      nodes?: Array<{ id: string; parent_id: string | null }>;
    };
    const nodes = raw.nodes ?? [];
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const known = new Set(baseline.tree_node_ids);
    const below = (node: { id: string; parent_id: string | null }): boolean => {
      if (!nodeId) return true;
      for (let cur: typeof node | undefined = node, hops = 0; cur && hops < 64; cur = cur.parent_id ? byId.get(cur.parent_id) : undefined, hops++) {
        if (cur.id === nodeId) return true;
      }
      return false;
    };
    return nodes.filter((node) => node.parent_id !== null && !known.has(node.id) && below(node)).map((node) => node.id);
  } catch {
    return [];
  }
}

/** Durable footprints an unresolved attempt left behind. Empty means none are observable, not that none exist. */
/**
 * Effect labels that consume provider budget or only read, leaving no footprint
 * the mission could duplicate. A failed attempt whose marks are all of these is
 * retryable: a repeated model call costs tokens, it cannot double-write or
 * double-send.
 */
const COST_ONLY_EFFECTS = new Set(["model generate"]);

function costOnlyLabel(label: string): boolean {
  if (COST_ONLY_EFFECTS.has(label)) return true;
  return label.startsWith("tool:") && READ_ONLY_TOOLS.has(label.slice("tool:".length));
}

function costOnlyEffects(entry: IntentEntry): boolean {
  const labels = entry.effect_labels ?? (entry.effect_label ? [entry.effect_label] : []);
  return labels.length > 0 && labels.every(costOnlyLabel);
}

/**
 * Reasons the attempt may already have changed the outside world. A cost-only
 * marker is not evidence of that by itself; real artifacts, filesystem changes
 * and child agents are, and so is any non-cost label.
 */
function intentEvidence(missionId: string, entry: IntentEntry, policy: "evidence" | "strict"): string[] {
  const reasons: string[] = [];
  if (policy === "strict") reasons.push("strict policy: an unresolved attempt is never presumed to have had no effect");
  const costOnly = costOnlyEffects(entry);
  if (entry.effect_marked_at && !costOnly) {
    reasons.push(`the attempt durably marked an external effect as started at ${entry.effect_marked_at}${entry.effect_label ? ` (${entry.effect_label})` : ""}`);
  }
  if (entry.failed_outcome && !costOnly) {
    reasons.push(
      `the attempt ended in a recorded ${entry.failed_outcome.thrown ? "error" : "failure"} at ${entry.failed_outcome.recorded_at} after an external effect may have begun; a failed outcome does not prove the effect did not happen`
    );
  }
  const baseline = entry.baseline;
  if (!baseline) {
    reasons.push("the intent record has no baseline, so absence of an effect cannot be shown");
    return reasons;
  }
  const baselineIds = new Set(baseline.artifact_ids);
  const added = listArtifacts(missionId).filter((artifact) => !baselineIds.has(artifact.id));
  if (added.length > 0) reasons.push(`new artifact record(s) appeared after the attempt began: ${added.map((a) => a.name).join(", ")}`);
  if (artifactFsDigest(missionId) !== baseline.artifact_fs_digest) reasons.push("files under the mission artifact directory changed after the attempt began");
  const children = newTreeChildren(missionId, baseline, entry.node_id);
  if (children.length > 0) reasons.push(`the attempt spawned ${children.length} child agent(s)`);
  return reasons;
}


/** Registry of managers running in this process (the durable lease is the real guard). */
const activeManagers = new Map<string, MissionManager>();

export function getActiveMissionManager(missionId: string): MissionManager | undefined {
  return activeManagers.get(missionId);
}

export function listActiveMissionIds(): string[] {
  return [...activeManagers.keys()];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reasonOf(signal: AbortSignal): Error {
  const r = signal.reason;
  return r instanceof Error ? r : new Error(String(r ?? "aborted"));
}

/** Truncate a prior agent output for inclusion in a downstream prompt. */
function excerpt(text: string, maxChars = 4000): string {
  if (!text) return "";
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…[truncated ${text.length - maxChars} chars]`;
}

/**
 * Split a delegation list into execution batches.
 * Consecutive delegations with parallel=true form one concurrent group;
 * sequential (parallel=false) delegations form single-item groups.
 * This preserves ordering constraints while maximising concurrency.
 * Items carry their index in the plan.
 */
function buildExecutionBatches(
  delegations: DelegationPlanItem[]
): Array<Array<{ del: DelegationPlanItem; index: number }>> {
  const batches: Array<Array<{ del: DelegationPlanItem; index: number }>> = [];
  let i = 0;
  while (i < delegations.length) {
    if (delegations[i].parallel) {
      const group: Array<{ del: DelegationPlanItem; index: number }> = [];
      while (i < delegations.length && delegations[i].parallel) {
        group.push({ del: delegations[i], index: i });
        i++;
      }
      batches.push(group);
    } else {
      batches.push([{ del: delegations[i], index: i }]);
      i++;
    }
  }
  return batches;
}

function planFingerprint(d: DelegationPlanItem): string {
  return delegationFingerprint(d.agent_role, d.task, d.expected_output ?? "");
}

function storedPlanHash(plan: Omit<StoredMissionPlan, "plan_hash">): string {
  return sha256Hex(JSON.stringify(plan));
}

/** Freeze the accepted plan and assign durable identities before any specialist runs. */
function freezeAcceptedPlan(plan: DelegationPlan): StoredMissionPlan {
  const unsigned: Omit<StoredMissionPlan, "plan_hash"> = {
    version: 1,
    strategy: plan.strategy,
    delegations: plan.delegations.map((delegation) => ({
      ...delegation,
      parallel: delegation.parallel === true,
      delegation_id: crypto.randomUUID(),
      fingerprint: planFingerprint(delegation),
    })),
  };
  return { ...unsigned, plan_hash: storedPlanHash(unsigned) };
}

/** Authenticate stored plan structure and hashes before using it as recovery history. */
function validatedStoredPlan(
  missionId: string,
  stored: StoredMissionPlan | undefined,
  supersededIds: ReadonlySet<string> = new Set<string>()
): StoredMissionPlan | null {
  if (stored === undefined) return null;
  const invalid = (detail: string): never => {
    throw new CheckpointIntegrityError(missionId, "malformed", `stored plan ${detail}`, `${missionId}.json`);
  };
  if (stored.version !== 1 || typeof stored.plan_hash !== "string" || !SHA256_HEX.test(stored.plan_hash)) {
    invalid("has an invalid version or hash");
  }
  if (typeof stored.strategy !== "string" || !Array.isArray(stored.delegations)) invalid("has invalid strategy/delegations");
  const { plan_hash: _hash, ...unsigned } = stored;
  if (storedPlanHash(unsigned) !== stored.plan_hash) invalid("hash does not match its contents");
  const ids = new Set<string>();
  const fingerprints = new Set<string>();
  for (const delegation of stored.delegations) {
    if (
      !delegation ||
      typeof delegation.delegation_id !== "string" || delegation.delegation_id.trim().length === 0 ||
      typeof delegation.fingerprint !== "string" || !SHA256_HEX.test(delegation.fingerprint) ||
      typeof delegation.agent_role !== "string" || delegation.agent_role.trim().length === 0 ||
      typeof delegation.task !== "string" || delegation.task.trim().length === 0 ||
      typeof delegation.context !== "string" || typeof delegation.expected_output !== "string" ||
      !Array.isArray(delegation.tools) || delegation.tools.some((tool) => typeof tool !== "string") ||
      typeof delegation.parallel !== "boolean" ||
      (delegation.uses_capability_attempt !== undefined &&
        (typeof delegation.uses_capability_attempt !== "string" || delegation.uses_capability_attempt.length === 0))
    ) {
      invalid("contains an invalid delegation");
    }
    if (delegation.fingerprint !== planFingerprint(delegation)) invalid("contains a delegation fingerprint mismatch");
    if (ids.has(delegation.delegation_id)) invalid("contains duplicate delegation identities");
    if (fingerprints.has(delegation.fingerprint)) {
      const activeDuplicates = stored.delegations.filter((candidate) =>
        candidate.fingerprint === delegation.fingerprint && !supersededIds.has(candidate.delegation_id)
      );
      if (activeDuplicates.length !== 1) invalid("contains duplicate delegation fingerprints");
    }
    ids.add(delegation.delegation_id);
    fingerprints.add(delegation.fingerprint);
  }
  return stored;
}

/**
 * Match successful checkpoint entries to a freshly generated plan.
 *
 * Entries that carry a fingerprint (role + task + expected_output) only match
 * a delegation with the same fingerprint, so a changed task is re-run.
 * Legacy entries without one fall back to role + task (role only when the
 * old checkpoint recorded no task). The Head Agent
 * may reorder delegations on resume, so position is never used. Failed and
 * partial entries never match, and neither does anything that was still
 * in flight: those delegations are re-run.
 *
 * Returns plan index -> checkpoint entry index.
 */
export function matchCompletedDelegations(
  delegations: DelegationPlanItem[],
  checkpoint: MissionCheckpoint | null
): Map<number, number> {
  const matched = new Map<number, number>();
  if (!checkpoint) return matched;

  const used = new Set<number>();
  delegations.forEach((delegation, planIndex) => {
    const fp = planFingerprint(delegation);
    let found = checkpoint.completed.findIndex(
      (entry, i) => !used.has(i) && entry.status === "success" && entry.fingerprint === fp
    );
    if (found < 0) {
      // Legacy entry (no fingerprint): role + task when the task was recorded,
      // role alone only for very old checkpoints that stored no task.
      const norm = (t: string) => t.trim().replace(/\s+/g, " ");
      found = checkpoint.completed.findIndex(
        (entry, i) =>
          !used.has(i) &&
          entry.status === "success" &&
          !entry.fingerprint &&
          entry.agent_role === delegation.agent_role &&
          (!entry.task || norm(entry.task) === norm(delegation.task))
      );
    }
    if (found >= 0) {
      used.add(found);
      matched.set(planIndex, found);
    }
  });
  return matched;
}

/** Plan indices whose delegation already succeeded in the checkpoint (see `matchCompletedDelegations`). */
export function successfulDelegationIndices(
  delegations: DelegationPlanItem[],
  checkpoint: MissionCheckpoint | null
): Set<number> {
  return new Set(matchCompletedDelegations(delegations, checkpoint).keys());
}

function resultFromCheckpointEntry(entry: MissionCheckpoint["completed"][number]): TrackedResult {
  return {
    agent_role: entry.agent_role,
    status: entry.status,
    output: entry.output,
    artifacts: entry.artifacts ?? [],
    issues: entry.status === "failed" ? ["Failed in a previous attempt; scheduled for retry"] : [],
    duration_ms: entry.duration_ms,
    model: entry.model,
    tools_used: entry.tools_used ?? [],
    qualified_attempt_ids: entry.qualified_attempt_ids ?? [],
    usage: entry.usage,
    fingerprint: entry.fingerprint,
    delegationId: entry.delegation_id,
    task: entry.task,
  };
}

/** Only capabilities present in the user-approved specification may execute. */
function approvedToolGrants(mission: Mission): Set<string> {
  const specification = mission.metadata?.specification as { suggested_tools?: unknown } | undefined;
  if (!Array.isArray(specification?.suggested_tools)) return new Set();
  return new Set(specification.suggested_tools.filter((tool): tool is string => typeof tool === "string"));
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Audit record that a genuine repair replaced an earlier artifact under the SAME
 * name. `listArtifacts` shows only the newest record per name, so an original
 * result that still references the replaced id would look unregistered. The
 * mapping is evidence, not a waiver: the replacement must itself be present and
 * pass the full integrity check wherever the old id is resolved.
 */
const SUPERSESSIONS_KEY = "artifact_supersessions";

/** Every registry record for the mission, including records `listArtifacts` hides by name. */
function readSupersessions(mission: Mission | null | undefined): ArtifactSupersession[] {
  const raw = (mission?.metadata as Record<string, unknown> | undefined)?.[SUPERSESSIONS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is ArtifactSupersession => {
    const e = entry as Partial<ArtifactSupersession> | null;
    return !!e && typeof e.superseded_id === "string" && typeof e.superseded_by === "string" && typeof e.name === "string";
  });
}

/**
 * Supersessions a same-name replacement makes necessary. `replacements` are the
 * NEW, reported, integrity-valid artifacts; `visibleBefore` are the ids that were
 * visible before the repair began. Only a previously visible record of the same
 * mission and name, now hidden behind the replacement, is superseded.
 */
function deriveSupersessions(
  missionId: string,
  replacements: Artifact[],
  visibleBefore: ReadonlySet<string>,
  repairIteration: number,
  source: ArtifactSupersession["source"],
  provenance: { intentId: string; provenanceId: string }
): ArtifactSupersession[] {
  if (replacements.length === 0) return [];
  const records = allArtifactRecords(missionId);
  const visibleNow = new Set(listArtifacts(missionId).map((artifact) => artifact.id));
  const out: ArtifactSupersession[] = [];
  for (const replacement of replacements) {
    if (visibleBefore.has(replacement.id) || !visibleNow.has(replacement.id)) continue;
    if (artifactIntegrityDefect(replacement) !== null) continue;
    const replacementHash = replacement.metadata?.sha256;
    const replacementSize = replacement.metadata?.size_bytes;
    if (typeof replacementHash !== "string" || !SHA256_HEX.test(replacementHash) ||
        typeof replacementSize !== "number" || !Number.isSafeInteger(replacementSize) || replacementSize < 0) continue;
    for (const old of records) {
      if (old.id === replacement.id || old.name !== replacement.name) continue;
      if (!visibleBefore.has(old.id) || visibleNow.has(old.id)) continue;
      const oldHash = old.metadata?.sha256;
      const oldSize = old.metadata?.size_bytes;
      if (typeof oldHash !== "string" || !SHA256_HEX.test(oldHash) ||
          typeof oldSize !== "number" || !Number.isSafeInteger(oldSize) || oldSize < 0) continue;
      out.push({
        superseded_id: old.id,
        superseded_by: replacement.id,
        name: old.name,
        // The old backing path may intentionally have been overwritten; retain
        // its authenticated registry claims and bind the replacement's live bytes.
        superseded_sha256: oldHash,
        superseded_size_bytes: oldSize,
        replacement_sha256: replacementHash,
        replacement_size_bytes: replacementSize,
        repair_iteration: repairIteration,
        recorded_at: new Date().toISOString(),
        source,
        intent_id: provenance.intentId,
        provenance_id: provenance.provenanceId,
      });
    }
  }
  return out;
}

function sameSupersession(a: ArtifactSupersession, b: ArtifactSupersession): boolean {
  return a.superseded_id === b.superseded_id && a.superseded_by === b.superseded_by &&
    a.name === b.name && a.superseded_sha256 === b.superseded_sha256 &&
    a.superseded_size_bytes === b.superseded_size_bytes &&
    a.replacement_sha256 === b.replacement_sha256 &&
    a.replacement_size_bytes === b.replacement_size_bytes &&
    a.repair_iteration === b.repair_iteration && a.source === b.source &&
    a.intent_id === b.intent_id && a.provenance_id === b.provenance_id;
}

/**
 * Metadata is only a pointer to checkpoint-backed repair/operator provenance.
 * Both endpoint records, their names, and expected hashes/sizes must agree.
 * Chain terminals must also have intact live bytes. An intermediate's backing
 * path may legitimately contain its same-name successor, so its historical hash
 * is authenticated by the registry + proof rather than by the overwritten path.
 * Unprovenanced real-id links therefore never resolve.
 */
function verifiedSupersessions(missionId: string, links: ArtifactSupersession[]): ArtifactSupersession[] {
  const checkpoint = loadCheckpoint(missionId);
  return authenticateSupersessions({
    missionId, links,
    provenance: checkpoint?.repair_provenance ?? [],
    resolutions: checkpoint?.recovery_resolutions ?? [],
  });
}

/** Append supersessions to a metadata object, dropping duplicates by superseded id. */
function mergeSupersessions(metadata: Record<string, unknown>, additions: ArtifactSupersession[]): Record<string, unknown> {
  const existing = readSupersessions({ metadata } as unknown as Mission);
  const known = new Set(existing.map((entry) => entry.superseded_id));
  const fresh = additions.filter((entry) => !known.has(entry.superseded_id));
  if (fresh.length === 0) return metadata;
  return { ...metadata, [SUPERSESSIONS_KEY]: [...existing, ...fresh] };
}

/**
 * Follow superseded_id -> superseded_by (transitively, cycle-safe) until an id
 * that is registered now. Returns null when the chain does not end in a
 * registered artifact of the recorded name.
 */
function resolveSuperseded(
  artifactId: string,
  supersessions: ReadonlyMap<string, ArtifactSupersession>,
  current: ReadonlyMap<string, Artifact>,
  originalName?: string
): Artifact | null {
  const seen = new Set<string>();
  let id = artifactId;
  const expectedName = originalName ?? supersessions.get(artifactId)?.name;
  if (!expectedName) return null;
  for (let hops = 0; hops < 32 && !seen.has(id); hops++) {
    seen.add(id);
    const link = supersessions.get(id);
    if (!link || link.name !== expectedName) return null;
    const next = current.get(link.superseded_by);
    if (next) return next.name === expectedName ? next : null;
    id = link.superseded_by;
  }
  return null;
}

/**
 * An ordinary same-name rewrite retires the earlier registry id without any
 * repair provenance, yet that delegation did produce the output. Accept the id
 * when the registry holds it and a strictly later revision of the same name is
 * current. The bytes of the current revision are verified separately for every
 * artifact, so a deleted or altered file still fails the gate.
 *
 * An id the mission *claims* was superseded takes the authenticated route only:
 * a claim that failed authentication must block, never fall back to same-name
 * matching, or forging `artifacts_supersessions` would substitute a cheap way out.
 */
function laterSameNameRevision(
  artifactId: string,
  records: Artifact[],
  current: ReadonlyMap<string, Artifact>,
  claimed: ReadonlySet<string>
): Artifact | null {
  if (claimed.has(artifactId)) return null;
  const original = records.find((record) => record.id === artifactId);
  if (!original) return null;
  // Legacy records carry no revision and therefore count as revision 0.
  const revisionOf = (artifact: Artifact): number =>
    typeof artifact.metadata?.revision === "number" ? artifact.metadata.revision : 0;
  let best: Artifact | null = null;
  for (const candidate of current.values()) {
    if (candidate.name !== original.name || revisionOf(candidate) <= revisionOf(original)) continue;
    if (!best || revisionOf(candidate) > revisionOf(best)) best = candidate;
  }
  return best;
}

/** Bind mission completion to successful delegations and intact artifacts, not only QA prose. */
function applyExecutionEvidenceGate(
  results: TrackedResult[],
  expectedDelegations: number,
  artifacts: ReturnType<typeof listArtifacts>,
  review: QAReview,
  gate: import("./qa-gate.js").QAGateResult,
  additionalBlockers: string[] = [],
  supersessions: ArtifactSupersession[] = []
): { review: QAReview; gate: import("./qa-gate.js").QAGateResult } {
  const blockers: string[] = [...additionalBlockers];
  if (expectedDelegations === 0) blockers.push("Execution plan contains no delegations");
  if (results.length !== expectedDelegations) blockers.push(`Only ${results.length}/${expectedDelegations} delegation results are available`);
  const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const registryMissionId = artifacts[0]?.mission_id;
  const records = registryMissionId ? allArtifactRecords(registryMissionId) : [];
  // Every claimed supersession blocks the same-name fallback, authenticated or not.
  const claimedSuperseded = new Set(
    (registryMissionId ? readSupersessions(loadMission(registryMissionId)) : []).map((entry) => entry.superseded_id)
  );
  const originalNames = new Map(records.map((artifact) => [artifact.id, artifact.name]));
  const supersededBy = new Map(supersessions.map((entry) => [entry.superseded_id, entry]));
  for (const result of results) {
    if (result.status !== "success") blockers.push(`Delegation '${result.agent_role}' is ${result.status}`);
    if (result.artifacts.length === 0) blockers.push(`Delegation '${result.agent_role}' has no verified new artifact`);
    for (const artifactId of result.artifacts) {
      const artifact = artifactsById.get(artifactId) ?? resolveSuperseded(
        artifactId,
        supersededBy,
        artifactsById,
        originalNames.get(artifactId)
      ) ?? laterSameNameRevision(artifactId, records, artifactsById, claimedSuperseded);
      if (!artifact) blockers.push(`Delegation '${result.agent_role}' artifact '${artifactId}' is not registered`);
    }
  }
  // Every artifact exposed to QA or attached to the terminal record must still
  // have intact bytes, including repair output and files found by reconciliation.
  for (const artifact of artifacts) {
    const defect = artifactIntegrityDefect(artifact);
    if (defect) blockers.push(defect);
  }
  if (artifacts.length === 0) blockers.push("Mission has no persisted artifacts");
  if (blockers.length === 0) return { review, gate };
  return {
    review: {
      ...review,
      passed: false,
      defects: [...review.defects, ...blockers.map((issue) => ({ issue, severity: "critical" as const }))],
      verdict: `FAIL: ${blockers.join(" | ")}`,
    },
    gate: { ...gate, passed: false, blockers: [...gate.blockers, ...blockers] },
  };
}

function sortJsonFirst<T extends { name?: string }>(artifacts: T[]): T[] {
  return [...artifacts].sort((a, b) => {
    const aJson = (a.name ?? "").endsWith(".json") ? 0 : 1;
    const bJson = (b.name ?? "").endsWith(".json") ? 0 : 1;
    return aJson - bJson;
  });
}

function artifactContentFor(a: ReturnType<typeof listArtifacts>[number]): string {
  let content = a.content ?? "";
  if (!content && a.path && fs.existsSync(a.path) && a.type !== "image") {
    // Do not hide the reviewer's >24,000-character coverage defect behind an
    // earlier short slice, but never materialize an unbounded artifact either.
    // Four bytes per character is the UTF-8 maximum; the extra character also
    // accounts for the artifact header included in the review-window check.
    const fd = fs.openSync(a.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (!fs.fstatSync(fd).isFile()) throw new Error("Artifact backing path is not a regular file");
      const buffer = Buffer.alloc(Math.min(fs.fstatSync(fd).size, QA_ARTIFACT_READ_BYTES));
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      content = buffer.subarray(0, bytesRead).toString("utf-8");
    } finally {
      fs.closeSync(fd);
    }
  } else if (a.type === "image" && a.path) {
    content = `[Binary screenshot: ${a.path}]`;
  }
  return `Artifact: ${a.name} (${a.type})\n${content}`;
}

/**
 * Cancel a mission that no manager in THIS process is running.
 *
 *  - owned by a live lease elsewhere: forward a cancel request and wait for the
 *    owner to stop and mark the mission cancelled;
 *  - not owned: take the lease (fencing out any runner that starts meanwhile),
 *    mark it cancelled and seal artifact registration.
 */
type DirectCancellationTarget = "cancelled" | "completed" | "failed";

/**
 * A blocked direct cancellation retains a real, heartbeating owner. The map is
 * only an in-process handle to the durable lease; the lease file is the fence.
 */
const pendingCancellationLeases = new Map<string, {
  lease: MissionLease;
  targetStatus: DirectCancellationTarget;
}>();

async function settleAvailableProcessGroups(missionId: string) {
  // Stop groups owned by this process first, then groups whose former owner
  // is confirmed dead. The final orphan scan accounts for every remaining
  // record, including malformed, foreign-live and surviving-group evidence.
  await quiesceCurrentMissionProcessGroups(missionId).catch(() => {});
  return reapOrphanedMissionProcessGroups(missionId).catch((error) => ({
    quiesced: false,
    reclaimed: [],
    blocked: [{ launch_id: null, reason: String(error) }],
  }));
}

function cancellationTarget(mission: Mission | null): DirectCancellationTarget {
  const recorded = (mission?.metadata?.cancellation as { recovery_terminal_status?: unknown } | undefined)?.recovery_terminal_status;
  if (recorded === "cancelled" || recorded === "completed" || recorded === "failed") return recorded;
  return mission?.status === "completed" || mission?.status === "failed" ? mission.status : "cancelled";
}

/** Settle one direct-cancellation attempt. The caller retains the lease on false. */
async function settleDirectCancellation(
  missionId: string,
  reason: string,
  lease: MissionLease,
  targetStatus: DirectCancellationTarget,
  forwarded = false,
): Promise<{ result: CancelResult; settled: boolean }> {
  const settlement = await settleAvailableProcessGroups(missionId);
  const blockedReason = settlement.blocked.map((entry) => entry.reason).join("; ");
  if (!settlement.quiesced) {
    const pending = Math.max(1, settlement.blocked.length);
    const res = updateMissionAtomic(
      missionId,
      (cur) => ({
        // A terminal status plus live process evidence is not terminal in
        // reality. Reopen only under this explicitly owned recovery operation
        // and remember the status to restore after actual quiescence.
        status: isTerminalStatus(cur.status) ? "running" : cur.status,
        metadata: {
          ...cur.metadata,
          recovery_blocked: {
            kind: "process_quiescence",
            detected_at: new Date().toISOString(),
            reasons: settlement.blocked.map((entry) => entry.reason),
          },
          cancellation: {
            reason,
            requested_at: new Date().toISOString(),
            quiesced: false,
            pending_operations: pending,
            blocked_process_groups: settlement.blocked,
            recovery_terminal_status: targetStatus,
          },
        },
      }),
      { fence: () => lease.isHeld(), allowTerminalTransition: true },
    );
    const status = (res.mission?.status ?? "not_found") as CancelResult["status"];
    appendLog(missionId, `Cancellation blocked with ownership retained: ${settlement.blocked.length} process-group record(s) are not settled`);
    return {
      settled: false,
      result: {
        cancelled: false,
        quiesced: false,
        status,
        pending_operations: pending,
        forwarded,
        error: `Process quiescence was not established (${blockedReason})`,
      },
    };
  }

  const res = updateMissionAtomic(
    missionId,
    (cur) => {
      const recovery = cur.metadata?.recovery_blocked as { kind?: unknown } | undefined;
      return {
        status: targetStatus,
        metadata: {
          ...cur.metadata,
          // Preserve unrelated integrity evidence (notably a damaged checkpoint).
          recovery_blocked: recovery?.kind === "checkpoint_integrity" ? recovery : undefined,
          cancellation: {
            reason,
            requested_at: new Date().toISOString(),
            confirmed_at: new Date().toISOString(),
            quiesced: true,
            pending_operations: 0,
            recovery_terminal_status: targetStatus,
          },
        },
      };
    },
    { fence: () => lease.isHeld() },
  );
  if (res.applied) {
    if (targetStatus === "cancelled") sealMission(missionId, "cancelled");
    clearCancelRequest(missionId);
    appendLog(missionId, `Mission cancellation/recovery settled after all registered process groups stopped: ${reason}`);
  }
  const latest = loadMission(missionId);
  const status = (latest?.status ?? res.mission?.status ?? "not_found") as CancelResult["status"];
  return {
    settled: status === targetStatus,
    result: { cancelled: status === "cancelled", quiesced: true, status, pending_operations: 0, forwarded },
  };
}

export async function cancelMission(
  missionId: string,
  reason = "cancelled by request",
  options: { waitMs?: number } = {}
): Promise<CancelResult> {
  const waitMs = options.waitMs ?? 20_000;
  const initial = loadMission(missionId);
  if (!initial) return { cancelled: false, quiesced: true, status: "not_found", pending_operations: 0 };

  const deadline = Date.now() + waitMs;
  let forwarded = false;
  for (;;) {
    const pending = pendingCancellationLeases.get(missionId);
    if (pending && !pending.lease.isHeld()) {
      pendingCancellationLeases.delete(missionId);
      pending.lease.release();
    }
    const retained = pendingCancellationLeases.get(missionId);
    const lease = retained?.lease ?? tryAcquireMissionLease(missionId, "cancel");
    if (lease) {
      const targetStatus = retained?.targetStatus ?? cancellationTarget(loadMission(missionId));
      const attempt = await settleDirectCancellation(missionId, reason, lease, targetStatus, forwarded);
      if (attempt.settled) {
        if (pendingCancellationLeases.get(missionId)?.lease === lease) pendingCancellationLeases.delete(missionId);
        lease.stopHeartbeat();
        lease.release();
      } else {
        pendingCancellationLeases.set(missionId, { lease, targetStatus });
        lease.startHeartbeat({
          onCancelRequest: (requestedReason) => {
            const current = pendingCancellationLeases.get(missionId);
            if (!current || current.lease !== lease || !lease.isHeld()) return;
            void settleDirectCancellation(missionId, requestedReason, lease, current.targetStatus).then((retry) => {
              if (retry.settled && pendingCancellationLeases.get(missionId)?.lease === lease) {
                pendingCancellationLeases.delete(missionId);
                lease.stopHeartbeat();
                lease.release();
              }
            });
          },
        });
      }
      return attempt.result;
    }

    if (!forwarded) {
      requestMissionCancel(missionId, reason);
      forwarded = true;
      appendLog(missionId, `Cancel requested; forwarded to lease owner pid ${readMissionLease(missionId)?.pid ?? "?"}`);
    }
    const now = loadMission(missionId);
    if (Date.now() >= deadline) {
      return {
        cancelled: now?.status === "cancelled",
        quiesced: false,
        status: (now?.status ?? "not_found") as CancelResult["status"],
        pending_operations: 0,
        forwarded,
      };
    }
    await delay(100);
  }
}

/**
 * Dynamic Mission Manager: coordinates execution of a single mission.
 * Created dynamically by the Head Agent for each approved mission.
 *
 * Ownership: run() takes the mission's single-owner lease before doing
 * anything and releases it when it returns. Every write the manager makes is
 * fenced on that lease and refused once the mission is terminal, so a stale or
 * cancelled run can never overwrite a newer state or register new artifacts.
 *
 * Cancellation: cancel() aborts the AbortSignal handed to every phase and
 * every specialist, waits for the in-flight work to stop, and only then marks
 * the mission `cancelled`.
 */
export class MissionManager {
  private approvedSpecHash: string | undefined;
  private admission: ReturnType<typeof prepareMissionAdmission> | undefined;
  private recovering = false;
  private qualificationMonitor: ReturnType<typeof setInterval> | undefined;
  private synchronousAdmissionDepth = 0;
  private get offlineFixture(): boolean {
    const deps = this.options.deps;
    return !this.options.admission &&
      (this.options.offlineFixture === true || process.env.AWE_OFFLINE_TEST === "1") &&
      !!deps?.planMission && !!deps.executeSpecialist && !!deps.reviewMissionDetailed && !!deps.resolveModelForRole;
  }
  /**
   * Results of the delegations completed so far. Kept on the instance so the
   * timeout handler can checkpoint real progress instead of an empty list.
   */
  private lastResults: TrackedResult[] = [];

  /** Wall-clock time spent on this mission across all attempts. */
  private elapsed_ms = 0;

  /** Start of the current attempt; included in every durable checkpoint. */
  private attemptStartedAt = 0;

  /** True while a termination attempt is running; failed attempts may be retried. */
  private exitAttemptActive = false;
  private exitHandled = false;
  private exitPromise: Promise<boolean> | null = null;
  private exitSettlement: Promise<void> | null = null;
  private confirmExitSettlement: (() => void) | null = null;

  private readonly controller = new AbortController();
  private lease: MissionLease | null = null;
  private readonly executionFence = () => {
    if (!this.lease?.isHeld()) return false;
    if (this.approvedSpecHash) {
      try { assertApprovedSpecBinding(loadMission(this.mission.id)!, this.approvedSpecHash); }
      catch { return false; }
    }
    try { this.checkAdmission(); } catch { return false; }
    return true;
  };
  /** Callback propagated to tools/children: only synchronous local effects or durable dispatch intents. */
  private readonly withEffect: SynchronousMissionEffect = (effect, target = { stage: "effect" }) => {
    const owned = () => {
      if (this.controller.signal.aborted) throw reasonOf(this.controller.signal);
      if (!this.lease?.isHeld()) throw new MissionFencedError(this.mission.id, "lease lost");
      const current = loadMission(this.mission.id)!;
      if (this.approvedSpecHash) assertApprovedSpecBinding(current, this.approvedSpecHash);
      if (this.admission && JSON.stringify(current.metadata?.[MISSION_ADMISSION_KEY]) !== JSON.stringify(this.admission.record)) {
        throw new QualificationDeniedError("persisted mission admission changed");
      }
      this.synchronousAdmissionDepth++;
      try { return effect(); } finally { this.synchronousAdmissionDepth--; }
    };
    if (this.offlineFixture) return owned();
    if (!this.admission) throw new QualificationDeniedError("mission has no admission");
    return this.admission.withEffect(owned, target);
  };

  private checkAdmission(target: MissionExecutionTarget = { stage: "effect" }): void {
    // Existing recursive/storage boolean fences can run inside our synchronous
    // critical section. The outer callback already owns the qualification locks.
    if (this.synchronousAdmissionDepth > 0) return;
    this.withEffect(() => undefined, target);
  }
  private runPromise: Promise<{ mission: Mission; review: QAReview | null }> | null = null;
  private cancelInfo: { reason: string; requested_at: number } | null = null;
  private quiesceResult: { quiesced: boolean; pending: number } | null = null;
  private completionContinuation: Promise<void> | null = null;
  private deferredSettlement: (() => Promise<boolean>) | null = null;
  private readonly inflight = new Set<Promise<unknown>>();
  private readonly inFlightDelegations = new Map<string, IntentEntry>();
  /** Unresolved-outcome intents found on resume; they stay in every checkpoint until an operator resolves them. */
  private readonly carriedAmbiguous = new Map<string, IntentEntry>();
  /** Completed results as they should appear in the next durable checkpoint. */
  private completedProvider: () => TrackedResult[] = () => this.lastResults;
  private currentRepair = 0;
  private acceptedPlan: StoredMissionPlan | null = null;
  private capabilityAttempts: CapabilityAttempt[] = [];
  private capabilityResults: TrackedResult[] = [];
  private executionAdaptations = 0;
  private executionSuperseded = new Set<string>();
  private executionTerminalBlocker: string | undefined;
  private repairProvenance: RepairProvenance[] = [];
  private recoveryResolutions: DurableRecoveryResolution[] = [];
  private deps!: ManagerDeps;

  constructor(
    public mission: Mission,
    /** Wall-clock budget for the whole mission. */
    public timeoutMs: number = DEFAULT_MISSION_TIMEOUT_MS,
    private readonly options: MissionManagerOptions = {}
  ) {
    this.lease = options.lease ?? null;
  }

  /** Aborted when the mission is cancelled, times out, or the lease is lost. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get cancelRequested(): boolean {
    return this.cancelInfo !== null;
  }

  // ─── Guards ────────────────────────────────────────────────────────────────

  private abortWith(reason: Error): void {
    if (!this.controller.signal.aborted) this.controller.abort(reason);
  }

  /** Throw if the mission was aborted or this manager no longer owns the lease. */
  private assertActive(signal: AbortSignal = this.controller.signal): void {
    if (signal.aborted) throw reasonOf(signal);
    if (this.lease && !this.lease.isHeld()) {
      throw new MissionFencedError(this.mission.id, "lease lost");
    }
    if (this.approvedSpecHash) assertApprovedSpecBinding(loadMission(this.mission.id)!, this.approvedSpecHash);
    this.checkAdmission();
  }

  /**
   * Track an operation for quiescence and stop waiting for it as soon as the
   * signal aborts. The operation itself is also handed the signal; if it
   * ignores it, it keeps running unobserved, and quiescence reports it.
   */
  private guard<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
    const settled = operation.then(
      () => undefined,
      () => undefined
    );
    this.inflight.add(settled);
    void settled.then(() => this.inflight.delete(settled));

    return new Promise<T>((resolve, reject) => {
      if (signal.aborted) {
        reject(reasonOf(signal));
        return;
      }
      const onAbort = () => reject(reasonOf(signal));
      signal.addEventListener("abort", onAbort, { once: true });
      operation.then(
        (v) => {
          signal.removeEventListener("abort", onAbort);
          resolve(v);
        },
        (e) => {
          signal.removeEventListener("abort", onAbort);
          reject(e);
        }
      );
    });
  }

  /** Wait until all tracked operations settled, up to `timeoutMs`. */
  private async quiesce(timeoutMs: number): Promise<{ quiesced: boolean; pending: number }> {
    const deadline = Date.now() + timeoutMs;
    while (this.inflight.size > 0 && Date.now() < deadline) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        Promise.allSettled([...this.inflight]),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, Math.max(1, deadline - Date.now()));
        }),
      ]);
      if (timer) clearTimeout(timer);
    }
    // An abort settles the JS wrapper before all OS descendants necessarily
    // stop. Reap the mission's own registered groups before claiming quiescence.
    const processes = await quiesceCurrentMissionProcessGroups(this.mission.id, {
      timeoutMs: Math.max(1, deadline - Date.now()),
    }).catch((error) => ({
      quiesced: false,
      reclaimed: [],
      blocked: [{ launch_id: null, reason: String(error) }],
    }));
    const pending = this.inflight.size + processes.blocked.length;
    if (processes.blocked.length > 0) {
      appendLog(this.mission.id, `MissionManager: process-group quiescence blocked — ${processes.blocked.map((entry) => entry.reason).join("; ")}`);
    }
    return { quiesced: pending === 0, pending };
  }

  /**
   * Fenced, atomic mission write: requires the lease and refuses terminal missions.
   * Throws MissionFencedError when the write is rejected.
   */
  private fencedWrite(
    mutator: (cur: Mission) => Partial<Mission> | null,
    opts: { requireLease?: boolean } = {}
  ): Mission {
    const id = this.mission.id;
    const requireLease = opts.requireLease ?? this.lease !== null;
    const res = updateMissionAtomic(
      id,
      (cur) => {
        if (isTerminalStatus(cur.status)) {
          throw new MissionFencedError(id, `mission is already ${cur.status}`);
        }
        return mutator(cur);
      },
      { fence: () => !requireLease || (this.lease?.isHeld() ?? false) }
    );
    if (res.reason === "fenced" || res.reason === "terminal") {
      throw new MissionFencedError(id, res.detail ?? res.reason);
    }
    if (res.reason === "not_found") throw new MissionStateError(id, `Mission ${id} not found`);
    return res.mission ?? this.mission;
  }

  // ─── Checkpointing ─────────────────────────────────────────────────────────

  /**
   * Persist completed delegations and fail-closed durable execution intents.
   * Called before execution and after every outcome so a crash cannot turn an
   * unknown effect into an automatic duplicate on the next run.
   */
  private checkpoint(
    results: TrackedResult[],
    repairIteration: number,
    reason: MissionCheckpoint["reason"]
  ): void {
    const durableIntents = new Map<string, IntentEntry>();
    for (const entry of [...this.inFlightDelegations.values(), ...this.carriedAmbiguous.values()]) {
      durableIntents.set(entry.intent_id ?? entry.fingerprint, entry);
    }
    const cp: MissionCheckpoint = {
      approved_spec_hash: this.approvedSpecHash,
      mission_id: this.mission.id,
      version: 1,
      saved_at: new Date().toISOString(),
      timeout_ms: this.timeoutMs,
      elapsed_ms:
        this.elapsed_ms +
        (this.attemptStartedAt > 0 ? Date.now() - this.attemptStartedAt : 0),
      completed: [...this.capabilityResults, ...results].map((r, i) => ({
        index: i,
        delegation_id: r.delegationId,
        agent_role: r.agent_role,
        task: r.task ?? "",
        fingerprint: r.fingerprint,
        status: r.status,
        output: r.output,
        artifacts: r.artifacts,
        duration_ms: r.duration_ms,
        model: r.model,
        tools_used: r.tools_used,
        qualified_attempt_ids: r.qualified_attempt_ids,
        usage: r.usage,
      })),
      in_flight: [...durableIntents.values()],
      repair_iterations: repairIteration,
      capability_attempts: this.capabilityAttempts,
      execution_adaptations: this.executionAdaptations,
      execution_superseded: [...this.executionSuperseded],
      execution_terminal_blocker: this.executionTerminalBlocker,
      plan: this.acceptedPlan ?? undefined,
      repair_provenance: this.repairProvenance,
      recovery_resolutions: this.recoveryResolutions,
      owner_id: this.lease?.ownerId,
      reason,
    };
    const lease = this.lease;
    saveCheckpoint(cp, lease ? { fence: () => lease.isHeld() } : {});
    this.lastResults = results;
  }

  /**
   * Abort and durably checkpoint on SIGINT/SIGTERM, then wait for actual work
   * and descendant settlement. Paused state and lease release happen only after
   * quiescence. Repeated signals share the same guarded termination attempt.
   */
  pauseForProcessExit(signal: string): Promise<boolean> {
    if (this.exitAttemptActive && this.exitPromise) return this.exitPromise;
    this.exitHandled = true;
    if (!this.exitSettlement) {
      this.exitSettlement = new Promise<void>((resolve) => { this.confirmExitSettlement = resolve; });
    }
    this.exitAttemptActive = true;
    const attempt = this.quiesceForProcessExit(signal);
    this.exitPromise = attempt;
    void attempt.then(
      () => { if (this.exitPromise === attempt) this.exitAttemptActive = false; },
      () => { if (this.exitPromise === attempt) this.exitAttemptActive = false; }
    );
    return attempt;
  }

  private async quiesceForProcessExit(signal: string): Promise<boolean> {
    let quiesced = false;
    try {
      this.abortWith(new Error(`process received ${signal}`));
      try {
        this.checkpoint(this.lastResults, this.currentRepair, "process_exit");
      } catch (err) {
        appendLog(this.mission.id, `MissionManager: exit checkpoint skipped — ${String(err)}`);
      }
      const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
      this.quiesceResult = q;
      quiesced = q.quiesced;
      const lease = this.lease;
      if (quiesced) {
        const paused = updateMissionAtomic(
          this.mission.id,
          (cur) => (isTerminalStatus(cur.status) ? null : {
            status: "paused",
            metadata: {
              ...cur.metadata,
              process_exit: { signal, quiesced: true, confirmed_at: new Date().toISOString() },
            },
          }),
          { fence: () => !lease || lease.isHeld() }
        );
        quiesced = paused.applied || (paused.mission !== null && isTerminalStatus(paused.mission.status));
      }
      appendLog(
        this.mission.id,
        quiesced
          ? `MissionManager: received ${signal} — work and descendants quiesced; checkpointed ${this.lastResults.length} completed delegation(s), mission paused (resumable)`
          : `MissionManager: received ${signal} — quiescence not established; mission remains running with lease/process evidence retained`
      );
    } catch (err) {
      quiesced = false;
      appendLog(this.mission.id, `MissionManager: exit handler failed without confirming quiescence — ${String(err)}`);
    } finally {
      if (quiesced) {
        this.confirmExitSettlement?.();
        this.confirmExitSettlement = null;
        this.lease?.release();
      }
    }
    return quiesced;
  }

  // ─── Cancellation ──────────────────────────────────────────────────────────

  /**
   * Cancel the mission: abort every in-flight phase and specialist, wait for
   * them to stop, then mark the mission `cancelled` and seal artifact
   * registration. Resolves once that is done (or the quiescence wait timed
   * out, reported via `quiesced: false`).
   *
   * When this manager is not running the mission, falls back to `cancelMission`
   * (which also handles missions owned by another process).
   */
  async cancel(reason = "cancelled by request"): Promise<CancelResult> {
    const id = this.mission.id;
    if (!this.runPromise) {
      return cancelMission(id, reason);
    }
    if (!this.cancelInfo) this.cancelInfo = { reason, requested_at: Date.now() };
    this.abortWith(new MissionCancelledError(id, this.cancelInfo.reason));
    try {
      await this.runPromise;
    } catch {
      /* run() reports its own outcome through the mission record */
    }
    const m = loadMission(id);
    if (m && !isTerminalStatus(m.status) && this.inflight.size === 0) {
      // A retry is immediate even while the observable background continuation
      // is sleeping. Both paths use the same lease and idempotent finalizer.
      const finalized = await this.finalizeCancelled();
      if (finalized.mission.status === "cancelled") this.finish();
    }
    const latest = loadMission(id);
    return {
      cancelled: latest?.status === "cancelled",
      quiesced: this.quiesceResult?.quiesced ?? this.inflight.size === 0,
      status: (latest?.status ?? "not_found") as CancelResult["status"],
      pending_operations: this.quiesceResult?.pending ?? this.inflight.size,
    };
  }

  private async finalizeCancelled(): Promise<{ mission: Mission; review: QAReview | null }> {
    const id = this.mission.id;
    const info = this.cancelInfo ?? { reason: "cancelled", requested_at: Date.now() };

    // No new artifacts from here on, including from stragglers that ignore the signal.
    const before = loadMission(id);
    if (before && !isTerminalStatus(before.status)) sealMission(id, "cancelled");

    const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
    this.quiesceResult = q;

    // Malformed/unreadable checkpoint bytes are evidence, not an empty slot.
    // Cancellation may complete after quiescence, but must never replace those
    // bytes with a newly valid `cancelled` checkpoint.
    let preserveDamagedCheckpoint = false;
    try {
      loadCheckpoint(id);
    } catch (err) {
      preserveDamagedCheckpoint = true;
      appendLog(id, `MissionManager: cancellation preserving damaged checkpoint evidence — ${String(err)}`);
    }

    try {
      this.fencedWrite((cur) => ({
        // Never confirm a terminal stop while work is known to be pending.
        status: q.quiesced ? "cancelled" : "running",
        metadata: {
          ...cur.metadata,
          cancellation: {
            reason: info.reason,
            requested_at: new Date(info.requested_at).toISOString(),
            ...(q.quiesced ? { confirmed_at: new Date().toISOString() } : {}),
            quiesced: q.quiesced,
            pending_operations: q.pending,
            ...(preserveDamagedCheckpoint ? { damaged_checkpoint_preserved: true } : {}),
          },
        },
      }));
      try {
        if (!preserveDamagedCheckpoint) this.checkpoint(this.lastResults, this.currentRepair, "cancelled");
      } catch {
        /* checkpoint is audit only for a cancelled mission */
      }
      appendLog(
        id,
        q.quiesced
          ? `MissionManager: cancelled (${info.reason}); quiesced=true pending_operations=0`
          : `MissionManager: cancellation still pending (${info.reason}); quiesced=false pending_operations=${q.pending}; lease retained`
      );
      if (q.quiesced) {
        clearCancelRequest(id);
        this.deferredSettlement = null;
      }
    } catch (err) {
      appendLog(id, `MissionManager: cancel could not be recorded — ${String(err)}`);
    }
    return { mission: loadMission(id)!, review: null };
  }

  // ─── Run ───────────────────────────────────────────────────────────────────

  /**
   * Run the mission to a terminal state (or `paused`). Rejects with
   * MissionLeaseError when another owner holds the mission and with
   * MissionStateError when the mission is not in a runnable state.
   */
  run(): Promise<{ mission: Mission; review: QAReview | null }> {
    if (!this.runPromise) this.runPromise = this.runOwned();
    return this.runPromise;
  }

  private async runOwned(): Promise<{ mission: Mission; review: QAReview | null }> {
    const m = this.mission;
    if (!Array.isArray(m.acceptance_criteria) || m.acceptance_criteria.length === 0 ||
        m.acceptance_criteria.some((criterion) => typeof criterion !== "string" || criterion.trim().length === 0)) {
      throw new MissionStateError(m.id, "Mission execution requires at least one non-blank acceptance criterion");
    }

    // 1. Single-owner lease. Everything up to the first await is synchronous,
    // so the early checkpoint below still precedes the first model call.
    if (!this.lease) {
      this.lease = tryAcquireMissionLease(m.id, "run");
      if (!this.lease) throw new MissionLeaseError(m.id, readMissionLease(m.id));
    } else if (!this.lease.isHeld()) {
      throw new MissionLeaseError(m.id, readMissionLease(m.id));
    }
    const lease = this.lease;
    activeManagers.set(m.id, this);
    lease.startHeartbeat({
      onLost: () => {
        appendLog(m.id, "MissionManager: lease lost — stopping without further writes");
        this.abortWith(new MissionFencedError(m.id, "lease lost"));
      },
      onCancelRequest: (reason) => {
        if (!this.cancelInfo) void this.cancel(reason);
      },
    });
    let claimedResult: { mission: Mission; review: QAReview | null } | null = null;
    try {
      const allowed = this.options.allowedStatuses ?? ["approved", "paused", "running"];
      const claimed = updateMissionAtomic(
        m.id,
        (cur) => {
          if (!allowed.includes(cur.status)) {
            throw new MissionStateError(
              m.id,
              `Mission ${m.id} is '${cur.status}'; expected one of: ${allowed.join(", ")}`
            );
          }
          // A fully injected offline runtime owns its synthetic fixture
          // contracts. Every production execution and any bound fixture must
          // retain the explicit approval through planning, repair and resume.
          this.recovering = cur.status !== "approved";
          if (cur.metadata?.approved_spec_binding || !this.offlineFixture) {
            this.approvedSpecHash = assertApprovedSpecBinding(cur).spec_hash;
            const checkpoint = loadCheckpoint(cur.id);
            if (checkpoint && checkpoint.approved_spec_hash !== this.approvedSpecHash) {
              throw new MissionStateError(cur.id, "Checkpoint lacks matching approved specification; explicit reconciliation required");
            }
          }
          return { status: "running" };
        },
        { fence: () => lease.isHeld() }
      );
      if (claimed.reason === "not_found") throw new MissionStateError(m.id, `Mission ${m.id} not found`);
      if (!claimed.applied) throw new MissionLeaseError(m.id, readMissionLease(m.id));
      this.mission = claimed.mission!;
      if (missionSealReason(m.id) !== null) unsealMission(m.id); // explicit re-open of a non-terminal mission
      const stale = readCancelRequest(m.id);
      if (stale && stale.requested_at < lease.acquiredAt) clearCancelRequest(m.id);

      resetSession(m.id);
      setSessionSignal(m.id, this.controller.signal);
      setSessionFence(m.id, this.executionFence);
      claimedResult = await this.runClaimed();
    } finally {
      // Signal handling owns the exit sequence. Do not release its lease or
      // resolve run() until its asynchronous quiescence attempt has finished.
      if (this.exitHandled) {
        if (this.exitAttemptActive && this.exitPromise) await this.exitPromise;
        if (this.quiesceResult?.quiesced !== true) this.deferTerminalizationUntilQuiesced();
        // Keep run() and its installed signal handlers alive across transient
        // failures. A later SIGINT/SIGTERM starts a fresh attempt and resolves
        // this only after paused/terminal state and process settlement are real.
        if (this.exitSettlement) await this.exitSettlement;
        this.finish();
      } else if (this.deferredSettlement || this.quiesceResult?.quiesced === false ||
                 (this.inflight.size > 0 && this.controller.signal.aborted)) {
        this.deferTerminalizationUntilQuiesced();
      } else {
        this.finish();
      }
    }
    if (this.exitHandled) return { mission: loadMission(m.id)!, review: null };
    return claimedResult!;
  }

  private deferTerminalizationUntilQuiesced(): void {
    if (this.completionContinuation) return;
    const id = this.mission.id;
    this.completionContinuation = (async () => {
      for (let attempt = 0; ; attempt++) {
        // If the underlying promise never settles there is deliberately no
        // all-settled timeout: retaining ownership is the only safe outcome.
        while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
        if (!this.lease?.isHeld()) {
          appendLog(id, "MissionManager: deferred settlement stopped because ownership was lost; no terminal claim written");
          return;
        }
        let finished = false;
        try {
          // Explicit cancellation supersedes a pending fatal/checkpoint/timeout
          // outcome, without weakening process or checkpoint integrity checks.
          if (this.cancelInfo) {
            await this.finalizeCancelled();
            finished = loadMission(id)?.status === "cancelled" && this.quiesceResult?.quiesced === true;
          } else if (this.deferredSettlement) {
            const settle = this.deferredSettlement;
            finished = await settle();
            if (finished) this.deferredSettlement = null;
          } else if (this.exitHandled) {
            finished = await this.pauseForProcessExit("deferred settlement");
          } else {
            const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
            this.quiesceResult = q;
            if (q.quiesced) {
              try {
                this.checkpoint(this.lastResults, this.currentRepair, "timeout");
                this.fencedWrite((cur) => ({
                  status: "paused",
                  metadata: { ...cur.metadata, timeout_recovery: { quiesced: true, pending_operations: 0 } },
                }));
                finished = true;
              } catch (err) {
                appendLog(id, `MissionManager: deferred pause rejected — ${String(err)}`);
              }
            }
          }
        } catch (err) {
          appendLog(id, `MissionManager: deferred settlement attempt failed; ownership retained for retry — ${String(err)}`);
        }
        if (finished || isTerminalStatus(loadMission(id)?.status ?? this.mission.status)) {
          this.finish();
          return;
        }
        if (attempt % 20 === 0) {
          appendLog(id, "MissionManager: settlement remains non-terminal; retained owner will retry after process/in-flight evidence changes");
        }
        await delay(100);
      }
    })().catch((err) => {
      appendLog(id, `MissionManager: deferred continuation stopped unexpectedly; lease retained — ${String(err)}`);
    }).finally(() => {
      this.completionContinuation = null;
    });
  }

  private finish(): void {
    const id = this.mission.id;
    if (this.qualificationMonitor) clearInterval(this.qualificationMonitor);
    setSessionSignal(id, undefined);
    setSessionFence(id, undefined);
    this.lease?.release();
    if (activeManagers.get(id) === this) activeManagers.delete(id);
  }

  private async runClaimed(): Promise<{ mission: Mission; review: QAReview | null }> {
    const m = this.mission;
    const startedAt = Date.now();
    appendLog(m.id, `MissionManager: starting execution (lease generation ${this.lease?.generation})`);
    this.attemptStartedAt = startedAt;
    // Durable checkpoint before the first LLM await. On resume, retain the
    // existing checkpoint instead of replacing completed work with an empty
    // early checkpoint. Restore it now so a signal during replanning is safe.
    let existingCheckpoint: MissionCheckpoint | null;
    try {
      existingCheckpoint = loadCheckpoint(m.id);
      if (existingCheckpoint) {
        this.acceptedPlan = validatedStoredPlan(m.id, existingCheckpoint.plan, new Set(existingCheckpoint.execution_superseded ?? []));
        this.capabilityAttempts = [...(existingCheckpoint.capability_attempts ?? [])];
        this.executionAdaptations = existingCheckpoint.execution_adaptations ?? 0;
        this.executionSuperseded = new Set(existingCheckpoint.execution_superseded ?? []);
        this.executionTerminalBlocker = existingCheckpoint.execution_terminal_blocker;
        this.repairProvenance = [...(existingCheckpoint.repair_provenance ?? [])];
        this.recoveryResolutions = [...(existingCheckpoint.recovery_resolutions ?? [])];
        this.elapsed_ms = existingCheckpoint.elapsed_ms;
        this.lastResults = existingCheckpoint.completed.map(resultFromCheckpointEntry);
        appendLog(
          m.id,
          `MissionManager: existing checkpoint retained — ${existingCheckpoint.completed.length} previous delegation result(s), elapsed_ms=${existingCheckpoint.elapsed_ms}`
        );
      }
      if (!this.offlineFixture) {
        const admission = prepareMissionAdmission(loadMission(m.id)!, this.options.admission, {
          recovering: this.recovering || existingCheckpoint !== null,
        });
        // Publish provenance under generation + ownership before any model call.
        admission.withEffect(() => {
          this.mission = this.fencedWrite((cur) => ({ metadata: { ...cur.metadata, [MISSION_ADMISSION_KEY]: admission.record } }));
        }, { stage: "mission" });
        this.admission = admission;
        // Revocation stops an idle/in-flight runtime too, not just its next tool.
        // The timer is notification only; every effect still checks synchronously.
        this.qualificationMonitor = setInterval(() => {
          if (this.controller.signal.aborted) return;
          try { this.checkAdmission(); }
          catch (error) { this.abortWith(error instanceof Error ? error : new QualificationDeniedError(String(error))); }
        }, 100);
        this.qualificationMonitor.unref();
      }
      if (!existingCheckpoint) {
        this.checkpoint(this.lastResults, 0, "process_exit");
      }
    } catch (err) {
      return this.settleFailure(err);
    }
    try {
      return await withMissionTimeout(
        m.id,
        Math.max(0, Math.trunc(this.timeoutMs - this.elapsed_ms)),
        (signal) => this.execute(m, startedAt, signal),
        async (err) => {
          // Timeout is NOT a failure: abort the manager as well as the inner
          // timeout signal so ownership is retained until every tracked
          // provider/tool operation has actually settled.
          this.abortWith(err);
          const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
          this.quiesceResult = q;
          try {
            this.checkpoint(this.lastResults, this.currentRepair, "timeout");
            appendLog(
              m.id,
              q.quiesced
                ? `MissionManager: timeout after ${this.timeoutMs}ms — mission paused and checkpointed (resumable)`
                : `MissionManager: timeout after ${this.timeoutMs}ms — ${q.pending} operation(s) still pending; ownership retained`
            );
            this.fencedWrite((cur) => ({
              status: q.quiesced ? "paused" : "running",
              metadata: {
                ...cur.metadata,
                timeout_recovery: {
                  quiesced: q.quiesced,
                  pending_operations: q.pending,
                  elapsed_ms: this.elapsed_ms + (this.attemptStartedAt > 0 ? Date.now() - this.attemptStartedAt : 0),
                  budget_ms: this.timeoutMs,
                  ...(q.quiesced ? { confirmed_at: new Date().toISOString() } : {}),
                },
              },
            }));
            const cp = loadCheckpoint(m.id);
            if (cp) {
              appendLog(
                m.id,
                `MissionManager: checkpoint retained at ${m.id} (${cp.completed.length} completed delegations)`
              );
            }
          } catch (err) {
            appendLog(m.id, `MissionManager: timeout pause rejected — ${String(err)}`);
          }
        },
        { signal: this.controller.signal, settleGraceMs: this.options.timeoutGraceMs }
      );
    } catch (err) {
      return this.settleFailure(err);
    }
  }

  private async settleFailure(err: unknown): Promise<{ mission: Mission; review: QAReview | null }> {
    const m = this.mission;
    // Cancellation is its own outcome. It is never reported as `failed`.
    if (this.cancelInfo || err instanceof MissionCancelledError) {
      return this.finalizeCancelled();
    }
    if (err instanceof MissionTimeoutError) {
      return { mission: loadMission(m.id)!, review: null };
    }
    if (err instanceof MissionFencedError || this.exitHandled) {
      appendLog(m.id, `MissionManager: stopped without writing — ${String(err)}`);
      return { mission: loadMission(m.id)!, review: null };
    }
    if (err instanceof QualificationDeniedError) {
      // A denied qualification pauses the mission; without this line the pause
      // has no journal entry at all and the denial reason survives only in
      // metadata, which makes the cause of a stopped run invisible.
      appendLog(m.id, `MissionManager: qualification denied — ${String(err.message)}`);
      this.abortWith(err);
      const settle = async (): Promise<boolean> => {
        const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
        this.quiesceResult = q;
        if (!q.quiesced) return false;
        // Keep durable intents and legacy evidence; stopping is permitted even
        // after revocation. Do not turn loss of qualification into product failure
        // or an implicit permission to rerun an unknown remote effect.
        if (this.admission) this.checkpoint(this.completedProvider(), this.currentRepair, "manual");
        this.fencedWrite((cur) => ({ status: "paused", metadata: {
          ...cur.metadata, qualification_blocked: { detected_at: new Date().toISOString(), reason: err.message },
        } }));
        return true;
      };
      if (!(await settle())) this.deferredSettlement = settle;
      return { mission: loadMission(m.id)!, review: null };
    }
    if (err instanceof MissionRecoveryRequiredError) {
      appendLog(m.id, `MissionManager: effect-bearing failure requires recovery — ${String(err)}`);
      this.abortWith(err);
      const settle = async (): Promise<boolean> => {
        const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
        this.quiesceResult = q;
        if (!q.quiesced) return false;
        try {
          const blocked = this.gateUnresolvedIntents(loadCheckpoint(m.id), err.failedReview);
          if (!blocked) {
            appendLog(m.id, "MissionManager: failed outcome lost its durable intent; recovery remains blocked");
            return false;
          }
          return true;
        } catch (writeErr) {
          appendLog(m.id, `MissionManager: failed-outcome recovery pause not recorded — ${String(writeErr)}`);
          return false;
        }
      };
      if (!(await settle())) this.deferredSettlement = settle;
      return { mission: loadMission(m.id)!, review: null };
    }
    if (err instanceof CheckpointIntegrityError) {
      // Never overwrite, delete, or plan around damaged checkpoint evidence.
      appendLog(m.id, `MissionManager: checkpoint integrity blocked execution — ${String(err)}`);
      this.abortWith(err);
      const settle = async (): Promise<boolean> => {
        const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
        this.quiesceResult = q;
        if (!q.quiesced) return false;
        try {
          this.fencedWrite((cur) => ({
            status: "paused",
            metadata: {
              ...cur.metadata,
              recovery_blocked: {
                kind: "checkpoint_integrity",
                code: err.code,
                detected_at: new Date().toISOString(),
                detail: err.message,
              },
            },
          }));
          return true;
        } catch (writeErr) {
          appendLog(m.id, `MissionManager: checkpoint pause not recorded — ${String(writeErr)}`);
          return false;
        }
      };
      if (!(await settle())) this.deferredSettlement = settle;
      return { mission: loadMission(m.id)!, review: null };
    }
    appendLog(m.id, `MissionManager: fatal error — ${String(err)}`);
    this.abortWith(err instanceof Error ? err : new Error(String(err)));
    const settle = async (): Promise<boolean> => {
      const q = await this.quiesce(this.options.quiesceTimeoutMs ?? DEFAULT_QUIESCE_TIMEOUT_MS);
      this.quiesceResult = q;
      if (!q.quiesced) return false;
      try {
        sealMission(m.id, "failed");
        this.fencedWrite(() => ({ status: "failed" }));
        return true;
      } catch (writeErr) {
        appendLog(m.id, `MissionManager: failure not recorded — ${String(writeErr)}`);
        return false;
      }
    };
    if (!(await settle())) this.deferredSettlement = settle;
    return { mission: loadMission(m.id)!, review: null };
  }

  // ─── Delegations ───────────────────────────────────────────────────────────

  /**
   * Run a single delegation and return an AgentResult.
   * Captures tool call names from the FullOutput for QA context.
   *
   * A delegation that reports failure is `failed`; one that neither called a
   * tool nor registered an artifact is `partial`. Text output is never
   * auto-saved as an artifact to paper over a missing deliverable.
   */
  private async runDelegation(
    del: DelegationPlanItem,
    missionId: string,
    priorResults: AgentResult[],
    signal: AbortSignal
  ): Promise<TrackedResult> {
    const start = Date.now();
    const storedDelegation = del as Partial<StoredDelegationPlanItem>;
    const fingerprint = storedDelegation.fingerprint ?? planFingerprint(del);
    const delegationId = storedDelegation.delegation_id;
    const artifactsBefore = new Set(listArtifacts(missionId).map((artifact) => artifact.id));

    const availableArtifacts = listArtifacts(missionId);

    // Include artifact file paths for file_read access
    const artifactFileList = availableArtifacts.length > 0
      ? `\nAVAILABLE ARTIFACT FILES (use file_read to load):\n${availableArtifacts.map((a) => `  - ${a.name}: ${a.path}`).join("\n")}\n`
      : "";

    // Embed content of small prior artifacts directly in context (avoid file_read round-trip)
    const artifactContentsInContext = availableArtifacts
      .filter((a) => a.path && fs.existsSync(a.path) && a.type !== "image")
      .map((a) => {
        const size = fs.statSync(a.path!).size;
        if (size > 12000) return null; // skip large files; agent should use file_read
        const content = fs.readFileSync(a.path!, "utf-8");
        return `--- ${a.name} ---\n${content}`;
      })
      .filter((c): c is string => c !== null);

    const priorDataSection = artifactContentsInContext.length > 0
      ? `\nDATA FROM PREVIOUS AGENTS:\n${artifactContentsInContext.join("\n\n")}\n`
      : "";

    // Upstream agent outputs, surfaced directly in the agent context.
    const priorOutputSection = priorResults.length > 0
      ? `\nFINDINGS FROM UPSTREAM AGENTS (you must build on these — do not repeat their work):\n${priorResults
          .map((r) => `--- ${r.agent_role} (${r.status}) ---\n${excerpt(r.output)}`)
          .join("\n\n")}\n`
      : "";

    const combinedContext =
      `${del.context ?? ""}${priorOutputSection}${priorDataSection}${artifactFileList}`;

    // Registered in the delegation tree so the mission record shows the real
    // hierarchy (top-level agents + their recursively spawned children).
    const target: MissionExecutionTarget = { stage: "delegation", role: del.agent_role, tools: del.tools };
    const nodeId = this.withEffect(() => registerTopLevelNode(missionId, del.agent_role, del.task), target);
    try {
      // Durable intent BEFORE the specialist can produce any effect. It is
      // dropped only together with the checkpoint that records the outcome.
      this.withEffect(() => this.openIntent(nodeId, { kind: "delegation", fingerprint, delegationId, role: del.agent_role, task: del.task, nodeId }), target);
      this.assertActive(signal);
      const allowedTools = del.tools.filter((tool) => approvedToolGrants(this.mission).has(tool));
      const attempt = del.uses_capability_attempt
        ? this.capabilityAttempts.find((candidate) => candidate.attempt_id === del.uses_capability_attempt)
        : undefined;
      if (del.uses_capability_attempt && (!attempt || !attempt.qualified_target || !del.tools.includes("shell"))) {
        throw new QualificationDeniedError("delegation references a missing/unqualified capability attempt or omits shell");
      }
      const qualifiedAttemptIds = new Map<string, string>();
      const localCapability = attempt
        ? createLocalCapabilityGate({
            mission: loadMission(missionId)!, delegationId: delegationId!, attempt, policy: this.options.acquisition,
            onReceipt: (attemptId, receipt: QualifiedInvocationReceipt) => qualifiedAttemptIds.set(attemptId, receipt.receipt_id),
          })
        : undefined;
      const res = await this.guard(
        this.deps.executeSpecialist(
          {
            role: del.agent_role,
            task: del.task,
            context: combinedContext,
            tools: allowedTools,
            allowedTools,
            expected_output: del.expected_output,
            missionId,
            depth: 0,
            nodeId,
          },
          missionId,
          { maxSteps: 15, signal, fence: this.executionFence, beginEffect: this.effectMarker(nodeId),
            withEffect: this.withEffect, modelRoute: this.options.modelRoute, experience: this.options.experience,
            localCapability, qualifiedAttemptIds, executeSpecialist: this.deps.executeSpecialist }
        ),
        signal
      );
      this.assertActive(signal);

      const uniqueTools = res.tools_used ?? [];
      const selectedModel = res.model ?? this.deps.resolveModelForRole(del.agent_role);
      const outputText = res.output ?? "";
      const actualNewArtifacts = listArtifacts(missionId)
        .filter((artifact) => !artifactsBefore.has(artifact.id))
        .map((artifact) => artifact.id);
      const reportedArtifacts = new Set(res.artifacts ?? []);
      const newArtifacts = actualNewArtifacts.filter((artifactId) => {
        if (!reportedArtifacts.has(artifactId)) return false;
        const artifact = listArtifacts(missionId).find((candidate) => candidate.id === artifactId);
        return !!artifact && artifactIntegrityDefect(artifact) === null;
      });
      const integrityIssues = [...reportedArtifacts].flatMap((artifactId) => {
        const artifact = listArtifacts(missionId).find((candidate) => candidate.id === artifactId);
        const defect = artifact ? artifactIntegrityDefect(artifact) : null;
        return defect ? [defect] : [];
      });

      const issues: string[] = [...(res.issues ?? []), ...integrityIssues];
      const durableReceipts = listQualifiedInvocationReceipts(missionId).filter((receipt) =>
        receipt.delegation_id === delegationId && receipt.attempt_id === attempt?.attempt_id);
      const actualQualifiedAttempts = [...new Set(durableReceipts.map((receipt) => receipt.attempt_id))];
      const missingQualifiedReceipt = !!del.uses_capability_attempt &&
        (actualQualifiedAttempts.length !== 1 ||
          ![...qualifiedAttemptIds.values()].some((id) => durableReceipts.some((receipt) => receipt.receipt_id === id)));
      if (missingQualifiedReceipt) {
        issues.push("Claimed qualified capability use has no matching actual durable invocation receipt");
      }
      let status: AgentResult["status"] = res.success && !missingQualifiedReceipt ? "success" : "failed";
      if (!res.success) {
        issues.push("The specialist reported failure; this delegation is not counted as done");
      }
      if (newArtifacts.length === 0) {
        status = "failed";
        issues.push("No verified new artifact was registered by this delegation; text and unrelated parallel artifacts are not deliverables");
      }

      appendLog(
        missionId,
        `runDelegation: ${del.agent_role} status=${status} model=${selectedModel} tokens=${res.usage?.total_tokens ?? "UNKNOWN"} tools=[${uniqueTools.join(",")}] new_artifacts=${newArtifacts.length}`
      );

      finalizeNode(missionId, nodeId, status === "success" ? "success" : "failed", {
        model: selectedModel,
        tools_used: uniqueTools,
        artifacts: newArtifacts,
        duration_ms: Date.now() - start,
        note: status === "success" ? undefined : issues[0],
      });

      // A failed outcome that followed a real effect keeps its intent: the
      // failure is recorded, but it does not prove the effect did not happen.
      const retained = status === "failed" && this.retainFailedIntent(nodeId, issues, false, {
        reported: [...reportedArtifacts].filter((artifactId) => actualNewArtifacts.includes(artifactId)),
      });

      return {
        agent_role: del.agent_role,
        status,
        output: outputText,
        artifacts: newArtifacts,
        issues,
        duration_ms: Date.now() - start,
        model: selectedModel,
        tools_used: uniqueTools,
        qualified_attempt_ids: actualQualifiedAttempts,
        usage: res.usage,
        fingerprint,
        delegationId,
        task: del.task,
        intentKey: retained ? undefined : nodeId,
      };
    } catch (err) {
      // Cancellation, timeout and lease loss are not delegation failures.
      if (signal.aborted || err instanceof MissionFencedError || err instanceof CheckpointIntegrityError || err instanceof QualificationDeniedError) {
        try {
          finalizeNode(missionId, nodeId, "failed", { duration_ms: Date.now() - start, note: "aborted" });
        } catch {
          /* ignore */
        }
        throw signal.aborted ? reasonOf(signal) : err;
      }
      appendLog(missionId, `runDelegation ERROR [${del.agent_role}]: ${String(err)}`);
      // A definite error before any effect is recorded as a failed result (re-run
      // on resume), so its intent is resolved. After an effect it is retained.
      this.retainFailedIntent(nodeId, [String(err)], true);
      if (!this.inFlightDelegations.get(nodeId)?.failed_outcome) this.inFlightDelegations.delete(nodeId);
      try {
        finalizeNode(missionId, nodeId, "failed", {
          model: this.deps.resolveModelForRole(del.agent_role),
          duration_ms: Date.now() - start,
          note: String(err).slice(0, 300),
        });
      } catch {
        // node may not exist if registration itself failed
      }
      return {
        agent_role: del.agent_role,
        status: "failed",
        output: "",
        artifacts: [],
        issues: [String(err)],
        duration_ms: Date.now() - start,
        model: this.deps.resolveModelForRole(del.agent_role),
        tools_used: [],
        qualified_attempt_ids: [],
        fingerprint,
        delegationId,
        task: del.task,
      };
    }
  }

  // ─── Artifact supersession ─────────────────────────────────────────────────

  /** Supersessions durably recorded on the mission (read fresh; the record is the source of truth). */
  private currentSupersessions(): ArtifactSupersession[] {
    return verifiedSupersessions(this.mission.id, readSupersessions(loadMission(this.mission.id) ?? this.mission));
  }

  /** Bind durable repair authentication to the exact candidate reviewed by QA. */
  private candidateRepairLineage(): { supersessions: ArtifactSupersession[]; provenance: import("./lifecycle.js").RepairProvenance[]; resolutions: import("./lifecycle.js").DurableRecoveryResolution[] } {
    const supersessions = this.currentSupersessions();
    const ids = new Set(supersessions.map((link) => link.provenance_id));
    return {
      supersessions,
      provenance: this.repairProvenance.filter((proof) => ids.has(proof.provenance_id)),
      resolutions: structuredClone(this.recoveryResolutions),
    };
  }

  /**
   * A crash can follow the authenticated provenance checkpoint but precede its
   * mission-metadata index. Rebuild only links independently present in that
   * checkpoint with matching registry claims and intact terminal evidence.
   */
  private restoreCheckpointSupersessions(): void {
    const checkpoint = loadCheckpoint(this.mission.id);
    const proven = (checkpoint?.repair_provenance ?? []).flatMap((proof) => proof.supersessions);
    if (proven.length === 0) return;
    const recorded = readSupersessions(loadMission(this.mission.id) ?? this.mission);
    const missing = proven.filter((candidate) => !recorded.some((known) => sameSupersession(known, candidate)));
    this.recordSupersessions(verifiedSupersessions(this.mission.id, missing));
  }

  private recordSupersessions(additions: ArtifactSupersession[]): void {
    if (additions.length === 0) return;
    const written = this.fencedWrite((cur) => {
      const metadata = mergeSupersessions(cur.metadata as Record<string, unknown>, additions);
      return metadata === cur.metadata ? null : { metadata };
    });
    this.mission = written;
    appendLog(
      this.mission.id,
      `MissionManager: ${additions.length} artifact(s) superseded by same-name repair output: ${additions.map((a) => `${a.name} ${a.superseded_id} -> ${a.superseded_by}`).join("; ")}`
    );
  }

  // ─── Durable intents ───────────────────────────────────────────────────────

  /**
   * Decide whether a definite failure still needs recovery gating. True (and the
   * in-flight intent stays, marked with `failed_outcome`) when the attempt durably
   * marked an effect, its failed result reported artifacts that really are new, or
   * it spawned child agents. A failure with no such footprint is resolved as before.
   */
  private retainFailedIntent(key: string, issues: string[], thrown: boolean, observed: { reported?: string[] } = {}): boolean {
    const entry = this.inFlightDelegations.get(key);
    if (!entry) return false;
    const spawned = entry.baseline ? newTreeChildren(this.mission.id, entry.baseline, entry.node_id).length > 0 : false;
    // A paid model call is not a durable footprint: it cannot be replayed into a
    // duplicated external effect, and the ledger already records its cost. Only a
    // real mark, a reported artifact or a spawned child makes this unrecoverable.
    const realMark = !!entry.effect_marked_at && !costOnlyEffects(entry);
    const effectful = realMark || (observed.reported?.length ?? 0) > 0 || spawned;
    if (!effectful) return false;
    entry.failed_outcome = {
      recorded_at: new Date().toISOString(),
      thrown,
      issues: issues.slice(0, 5).map((issue) => issue.slice(0, 300)),
    };
    return true;
  }

  private persistedRepairCount(entry: IntentEntry): number {
    return entry.kind === "repair" ? Math.max(0, (entry.repair_iteration ?? 1) - 1) : this.currentRepair;
  }

  /** Persist the intent synchronously; if it cannot be made durable the work must not start. */
  private openIntent(
    key: string,
    args: { kind: "delegation" | "repair"; fingerprint: string; delegationId?: string; role: string; task: string; nodeId?: string; repairIteration?: number }
  ): IntentEntry {
    const entry: IntentEntry = {
      fingerprint: args.fingerprint,
      delegation_id: args.delegationId,
      agent_role: args.role,
      task: args.task,
      started_at: new Date().toISOString(),
      protocol: INTENT_PROTOCOL,
      intent_id: crypto.randomUUID(),
      kind: args.kind,
      node_id: args.nodeId,
      repair_iteration: args.repairIteration,
      baseline: captureBaseline(this.mission.id),
    };
    this.inFlightDelegations.set(key, entry);
    try {
      this.checkpoint(this.completedProvider(), this.persistedRepairCount(entry), "manual");
    } catch (err) {
      this.inFlightDelegations.delete(key);
      throw err;
    }
    return entry;
  }

  /** Cooperative marker a specialist may call immediately before an external effect; it is durable before returning. */
  private effectMarker(key: string): (label?: string) => void {
    return (label?: string) => {
      this.withEffect(() => {
        const entry = this.inFlightDelegations.get(key);
        if (!entry) throw new QualificationDeniedError("effect lacks a live delegation intent");
        const normalized = label ? String(label).slice(0, 200) : undefined;
        const labels = entry.effect_labels ?? (entry.effect_label ? [entry.effect_label] : []);
        const firstMark = !entry.effect_marked_at;
        const newLabel = !!normalized && !labels.includes(normalized);
        // A model call marks "model generate" before every generation, so the
        // first mark must persist. Later distinct labels persist too, otherwise
        // an earlier model call would hide a subsequent shell write from the
        // recovery decision.
        if (!firstMark && !newLabel) return;
        if (newLabel) labels.push(normalized!);
        entry.effect_labels = labels;
        entry.effect_marked_at ??= new Date().toISOString();
        entry.effect_label ??= normalized;
        this.checkpoint(this.completedProvider(), this.persistedRepairCount(entry), "manual");
      }, { stage: "effect", label });
    };
  }

  /**
   * Resume gate. Every intent that survived a crash is checked for durable
   * footprints. Any footprint (or the strict policy) makes the outcome
   * ambiguous: the mission is paused and stays blocked until an operator calls
   * resolveAmbiguousDelegation. An intent with no observable footprint is
   * cleared and its delegation re-runs.
   */
  private gateUnresolvedIntents(
    checkpoint: MissionCheckpoint | null,
    failedReview?: { review: QAReview; gate: import("./qa-gate.js").QAGateResult }
  ): { mission: Mission; review: null } | null {
    const id = this.mission.id;
    const policy = this.options.unresolvedIntentPolicy ?? "strict";
    const intents = ((checkpoint?.in_flight ?? []) as IntentEntry[]).filter((entry) => entry.protocol === INTENT_PROTOCOL);
    for (const entry of intents) {
      const intentId = entry.intent_id ?? entry.fingerprint;
      entry.intent_id = intentId;
      if (entry.ambiguous) {
        this.carriedAmbiguous.set(intentId, entry);
        continue;
      }
      const reasons = intentEvidence(id, entry, policy);
      if (reasons.length === 0) {
        appendLog(id, `MissionManager: unresolved ${entry.kind ?? "delegation"} '${entry.agent_role}' left no durable footprint; it is re-run`);
        continue;
      }
      entry.ambiguous = { detected_at: new Date().toISOString(), reasons };
      this.carriedAmbiguous.set(intentId, entry);
    }
    if (this.carriedAmbiguous.size === 0) return null;

    this.checkpoint(this.lastResults, checkpoint?.repair_iterations ?? 0, "manual");
    const blocked = [...this.carriedAmbiguous.values()];
    appendLog(id, `MissionManager: ${blocked.length} delegation outcome(s) are ambiguous after a crash; mission blocked until explicitly resolved`);
    this.fencedWrite((cur) => ({
      status: "paused",
      metadata: {
        ...cur.metadata,
        ...(failedReview ? {
          qa_gate: {
            passed: failedReview.gate.passed,
            blockers: failedReview.gate.blockers,
            criterion_checks: failedReview.gate.criterion_checks,
            llm_score: failedReview.gate.llm_score,
            llm_passed: failedReview.gate.llm_passed,
          },
        } : {}),
        recovery_blocked: {
          kind: "ambiguous_delegation_outcome",
          detected_at: new Date().toISOString(),
          resolve_with: "resolveAmbiguousDelegation(missionId, { intent_id, decision: 'retry' | 'accept', operator, note, artifacts? })",
          entries: blocked.map((entry) => ({
            intent_id: entry.intent_id,
            kind: entry.kind ?? "delegation",
            agent_role: entry.agent_role,
            task: entry.task.slice(0, 300),
            fingerprint: entry.fingerprint,
            started_at: entry.started_at,
            reasons: entry.ambiguous?.reasons ?? [],
          })),
        },
      },
    }));
    return { mission: loadMission(id)!, review: null };
  }

  /** Convert planner diagnoses into bounded real work, then extend rather than rewrite accepted history. */
  private async planWithCapabilities(
    m: Mission,
    stored: StoredMissionPlan | null,
    results: TrackedResult[],
    repairIteration: number,
    signal: AbortSignal,
    executionFailure?: string,
    initialOptions?: { capabilityAttempt?: CapabilityAttempt },
    resumeAfterAdaptation = false
  ): Promise<{ plan: StoredMissionPlan } | { blocked: { mission: Mission; review: QAReview } }> {
    const blocked = (detail: string): { blocked: { mission: Mission; review: QAReview } } => {
      appendLog(this.mission.id, `MissionManager: execution blocked — ${detail}`);
      const review: QAReview = {
        passed: false, score: 0, criteria_results: [],
        defects: [{ issue: detail, severity: "critical" }],
        recommendations: ["Adjust the approved tools/scope or provide the missing capability, then create a newly approved mission."],
        verdict: `FAIL: ${detail}`,
      };
      return { blocked: { mission: this.mission, review } };
    };
    if (stored && !executionFailure && !resumeAfterAdaptation &&
        !(this.executionAdaptations > 0 && results.some((result) =>
          result.status !== "success" && (!result.delegationId || !this.executionSuperseded.has(result.delegationId))
        ))) return { plan: stored };
    // An empty/no-plan checkpoint after acquisition must remain in the
    // capability transition, not masquerade as an accepted primary plan.
    this.acceptedPlan = stored;
    let decision: DelegationPlan | CapabilityDecision;
    if (resumeAfterAdaptation) {
      if (!stored) return blocked("Adaptation recovery has no accepted plan to resume");
      decision = await this.guard(this.deps.planMission(m, {
        signal, executionFailure: executionFailure ?? "Resume the bounded execution adaptation after an interrupted planner call.",
        ...(this.capabilityAttempts.length > 0
          ? { capabilityAttempt: this.capabilityAttempts[this.capabilityAttempts.length - 1] } : {}),
        previousPlan: { strategy: stored.strategy, delegations: stored.delegations },
      }), signal);
    } else if (executionFailure) {
      if (this.executionAdaptations >= 1) {
        return blocked("Ordinary execution adaptation limit exhausted; no second replan is permitted");
      }
      this.executionAdaptations = 1;
      this.checkpoint(results, repairIteration, "manual");
      decision = await this.guard(this.deps.planMission(m, {
        signal, executionFailure,
        previousPlan: stored ? { strategy: stored.strategy, delegations: stored.delegations } : undefined,
      }), signal);
    } else {
      decision = await this.guard(this.deps.planMission(m, { signal, ...initialOptions }), signal);
    }
    this.assertActive(signal);
    let accepted = stored;
    for (let transitions = 0; transitions <= 3; transitions++) {
      if (ordinaryPlan(decision)) {
        const invalidTarget = (decision as DelegationPlan).delegations.find((delegation) => {
          if (!delegation.uses_capability_attempt) return false;
          const attempt = this.capabilityAttempts.find((candidate) => candidate.attempt_id === delegation.uses_capability_attempt);
          return !attempt?.qualified_target || !delegation.tools.includes("shell");
        });
        if (invalidTarget) {
          return blocked(`Delegation references a missing/unqualified capability attempt or omits shell: ${invalidTarget.uses_capability_attempt}`);
        }
        if (resumeAfterAdaptation && stored) {
          // Re-planning was already authorized and the counter persisted. Do
          // not ask Head to recreate an identical extension: it would be a new
          // identity with no durable effect record. Resume the accepted plan.
          const extension = validatedStoredPlan(m.id, freezeAcceptedPlan(decision as DelegationPlan))!;
          const unsigned: Omit<StoredMissionPlan, "plan_hash"> = {
            version: 1, strategy: `${stored.strategy} -> ${extension.strategy}`,
            delegations: [...stored.delegations, ...extension.delegations],
          };
          const superseded = new Set(this.executionSuperseded);
          for (const result of results.filter((entry) => entry.status !== "success")) {
            if (result.delegationId) superseded.add(result.delegationId);
          }
          const plan = validatedStoredPlan(m.id, { ...unsigned, plan_hash: storedPlanHash(unsigned) }, superseded)!;
          this.executionSuperseded = superseded;
          this.acceptedPlan = plan;
          this.checkpoint(results, repairIteration, "manual");
          return { plan };
        }
        const extension = validatedStoredPlan(m.id, freezeAcceptedPlan(decision as DelegationPlan))!;
        const unsigned: Omit<StoredMissionPlan, "plan_hash"> = accepted
          ? { version: 1, strategy: `${accepted.strategy} -> ${extension.strategy}`, delegations: [...accepted.delegations, ...extension.delegations] }
          : { version: 1, strategy: extension.strategy, delegations: extension.delegations };
        const superseded = new Set(this.executionSuperseded);
        if (executionFailure) {
          for (const result of results.filter((entry) => entry.status !== "success")) {
            if (result.delegationId) superseded.add(result.delegationId);
          }
        }
        const plan = validatedStoredPlan(m.id, { ...unsigned, plan_hash: storedPlanHash(unsigned) }, superseded)!;
        this.executionSuperseded = superseded;
        this.acceptedPlan = plan;
        this.checkpoint(results, repairIteration, "manual");
        return { plan };
      }
      const errors = validateCapabilityDecision(decision, approvedToolGrants(m), new Set<string>());
      // The acquisition decision itself carries no executable tool grants. Tool
      // registration is checked below against the actual registry.
      if (errors.length > 0) return blocked(`Capability decision rejected: ${errors.join("; ")}`);
      const diagnosis = decision as CapabilityDecision;
      if (diagnosis.status === "blocked" || diagnosis.status === "replan") {
        return blocked(diagnosis.detail?.trim() || `Planner could not produce an executable ${diagnosis.status} plan`);
      }
      if (diagnosis.status === "continue") return blocked("Planner returned neither executable work nor a capability diagnosis");
      const capability = diagnosis.capability!.trim().toLowerCase();
      const repeated = this.capabilityAttempts.some((attempt) => attempt.capability === capability);
      if (repeated) return blocked(`Capability '${capability}' was already investigated; refusing an acquisition loop`);
      const { allTools } = await import("../tools/index.js");
      const approved = approvedToolGrants(m);
      const tools = ["capability_library", "web_search", "web_fetch", "file_read", "file_write", "file_list", "shell", "save_artifact"]
        .filter((tool) => approved.has(tool) && tool in allTools);
      const investigationTools = tools.filter((tool) => tool !== "capability_library" && tool !== "save_artifact");
      if (!tools.includes("save_artifact") || investigationTools.length === 0) {
        return blocked(`Capability '${capability}' cannot be investigated within approved registered tools`);
      }
      const suggested = m.metadata.specification as { suggested_agents?: unknown } | undefined;
      const roles = new Set(Array.isArray(suggested?.suggested_agents) ? suggested.suggested_agents : []);
      const role = roles.has("researcher") ? "researcher" : roles.has("executor") ? "executor" : null;
      if (!role) return blocked(`No approved specialist role can investigate '${capability}'`);
      const task = `Investigate and acquire a reusable way to provide the missing capability '${capability}'. ` +
        `Reason: ${diagnosis.detail ?? "required by the approved mission"}. Discover existing local or mature open-source options, ` +
        `When capability_library is available, consult it first for unvetted reusable candidates before reaching for the network. ` +
        `Its metadata never approves, installs or executes a candidate and does not replace concrete feasibility and security verification. ` +
        `Evaluate concrete feasibility and security, and where possible use an already-approved tool or local runtime to establish the capability. ` +
        `Do not install packages, change host configuration, purchase anything, expand scope or claim success from documentation alone. ` +
        `Persist a concise JSON observation with capability, status (available|missing|failed), detail and optional acquired. ` +
        `Omit acquired when nothing was acquired; do not use null. When present, acquired must be one short string naming ` +
        `the approved tool or absolute local procedure, never an object. An available+acquired string alone is not an invocation grant. ` +
        `status available is only valid when you name what exists: either acquired (one short string) or local_target. ` +
        `When you propose a local_target, also set acquired to one short string naming that procedure: a host policy may require acquired on every available observation, and without it a correct proposal is still refused. ` +
        `An available observation with neither is rejected as unresolvable; use missing or failed when nothing usable was verified. ` +
        `To propose a qualified local Node procedure, include local_target: {runtime: "node", executable_path, executable_sha256, args, probe_artifacts}; runtime is required and must be exactly "node". ` +
        `executable_path is the canonical absolute path of the procedure source file itself (not /usr/bin/node), and executable_sha256 is that source file's actual SHA-256. The trusted gate supplies the fixed 'node --' runtime command; do not include node or '--' in args. ` +
        `Use an exact fixed no-placeholder argument array appropriate to the approved deliverable paths, and ` +
        `probe_artifacts as [{artifact_id, sha256}] referencing persisted real probe output. artifact_id must be the registry UUID actually returned by save_artifact/file_write or listed by file_list; never use a basename, name, path, or a UUID quoted only in another file. sha256 must be the actual bytes hash of that same registry artifact. ` +
        `Probe output is evidence, not the final deliverable: its JSON must not contain capability/status/detail/local_target fields that could be mistaken for the observation. Write exactly one observation JSON object with only capability, status, detail, optional acquired and optional local_target keys; do not add probe totals, method, source or other domain fields. Do not execute the proposed target during acquisition. ` +
        `Use exact absolute runtime paths supplied in the task; relative runtime paths resolve to the mission directory and are not a valid absence check. ` +
        `This acquisition is already authorized within the existing approved tool grants: do not require a second mapping-approval record. ` +
        `If status is missing or failed, the observation is terminal: do not invent a fallback or expand grants.`;
      const acquisition: DelegationPlanItem = {
        agent_role: role, task, context: diagnosis.detail ?? "", tools,
        expected_output: `Hash-bound capability observation for ${capability}`, parallel: false,
      };
      appendLog(m.id, `MissionManager: capability gap '${capability}' — bounded acquisition before replanning`);
      const outcome = await this.runDelegation(acquisition, m.id, results, signal);
      const acquisitionIntentKey = outcome.intentKey;
      // A pre-effect failure closes its intent; an effect-bearing failure keeps
      // the same key and must enter explicit recovery before terminalization.
      if (acquisitionIntentKey && !this.inFlightDelegations.get(acquisitionIntentKey)?.failed_outcome) {
        this.inFlightDelegations.delete(acquisitionIntentKey);
      }
      this.capabilityResults.push(outcome);
      this.completedProvider = () => [...this.capabilityResults, ...results];
      this.checkpoint(results, repairIteration, "manual");
      if (acquisitionIntentKey && this.inFlightDelegations.get(acquisitionIntentKey)?.failed_outcome) {
        throw new MissionRecoveryRequiredError(m.id);
      }
      let reportedArtifacts = listArtifacts(m.id).filter((candidate) => outcome.artifacts.includes(candidate.id) && candidate.path);
      if (outcome.status !== "success" || reportedArtifacts.length === 0) {
        return blocked(`Acquisition for '${capability}' produced no verified observation`);
      }
      const scanObservations = (artifacts: Artifact[]) => {
        const observations: Array<{
          artifact: Artifact;
          observation: { capability?: unknown; status?: unknown; detail?: unknown; acquired?: unknown; local_target?: unknown };
        }> = [];
        for (const artifact of artifacts) {
          try {
            const text = fs.readFileSync(artifact.path!, "utf-8");
            const start = text.indexOf("{");
            const end = text.lastIndexOf("}");
            if (start < 0 || end < start) continue;
            const parsed: unknown = JSON.parse(text.slice(start, end + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              const observation = parsed as { capability?: unknown; status?: unknown; detail?: unknown; acquired?: unknown; local_target?: unknown };
              // A domain deliverable may legitimately contain a field named
              // "capability". Only the strict observation protocol is eligible;
              // arbitrary result/probe JSON must never create ambiguity.
              const protocolKeys = new Set(["capability", "status", "detail", "acquired", "local_target"]);
              if (observation.capability === capability && typeof observation.status === "string" &&
                  typeof observation.detail === "string" && observation.detail.trim().length > 0 &&
                  Object.keys(observation).every(key => protocolKeys.has(key))) {
                observations.push({ artifact, observation });
              }
            }
          } catch {
            // Research notes and unrelated JSON are not observations.
          }
        }
        return observations;
      };
      let observations = scanObservations(reportedArtifacts);
      // An "available" observation that names nothing and proposes nothing is
      // not actionable: no qualified target can be created from it, so a replan
      // that references the attempt must fail. Treat it like a missing one.
      const notActionable = observations.length === 1 &&
        observations[0].observation.status === "available" &&
        typeof observations[0].observation.acquired !== "string" &&
        observations[0].observation.local_target === undefined;
      if (observations.length === 0 || notActionable) {
        // The acquisition did real work but omitted the protocol observation
        // object, or claimed availability without saying what was acquired. One
        // bounded correction asks only for that object from the already
        // persisted evidence; it cannot re-probe, install or expand scope, and
        // its output is rescanned with the identical strict filter.
        appendLog(m.id, `MissionManager: acquisition for '${capability}' persisted ` +
          (observations.length === 0 ? "no protocol observation" : "an unresolvable available observation") +
          " — one corrective write");
        const persisted = listArtifacts(m.id)
          .filter((candidate) => candidate.path && candidate.metadata?.sha256)
          .slice(-40)
          .map((candidate) => `- ${candidate.name} (artifact_id ${candidate.id}, sha256 ${candidate.metadata.sha256})`)
          .join("\n");
        const correction: DelegationPlanItem = {
          agent_role: role,
          task: `Write the single required capability observation JSON for '${capability}'. The acquisition investigation is already complete: ` +
            `do not re-run probes, do not modify existing files, do not install anything. Read the persisted evidence listed in the context and ` +
            `save exactly one new JSON artifact whose entire top-level object has ONLY the keys capability, status, detail, optional acquired and optional local_target. ` +
            `capability must be exactly "${capability}". status is one of available|missing|failed and must reflect what was actually verified. ` +
            `If the evidence shows a usable procedure exists, status MUST be available AND you MUST say what it is: either acquired (one short name) or local_target. ` +
            `An available observation with neither acquired nor local_target is rejected as unresolvable — never use available to mean "the work is done" or "the capability is understood". ` +
            `If nothing usable was actually verified, use missing or failed instead. ` +
            `detail is one short non-empty sentence. No other keys are permitted (no probe totals, method, source, invocation or verification fields). ` +
            `If the verified evidence includes a local Node procedure proposal, local_target must be {runtime:"node", executable_path, executable_sha256, args, probe_artifacts} ` +
            `with executable_path the absolute source-file path, executable_sha256 that file's actual SHA-256, args the fixed no-placeholder argument array, ` +
            `and probe_artifacts as [{artifact_id, sha256}] using the registry UUIDs and byte hashes from the context. ` +
            `When you propose a local_target, also set acquired to one short string naming that procedure: a host policy may require acquired on every available observation, and without it a correct proposal is still refused.`,
          context: `Persisted mission artifacts (registry UUID and byte hash):\n${persisted || "(none reported)"}`,
          tools: ["file_read", "file_list", "file_write", "save_artifact"].filter((tool) => tools.includes(tool)),
          expected_output: `Exactly one protocol observation for ${capability}`,
          parallel: false,
        };
        const corrected = await this.runDelegation(correction, m.id, results, signal);
        const correctedIntent = corrected.intentKey;
        if (correctedIntent && !this.inFlightDelegations.get(correctedIntent)?.failed_outcome) {
          this.inFlightDelegations.delete(correctedIntent);
        }
        this.capabilityResults.push(corrected);
        this.completedProvider = () => [...this.capabilityResults, ...results];
        this.checkpoint(results, repairIteration, "manual");
        if (correctedIntent && this.inFlightDelegations.get(correctedIntent)?.failed_outcome) {
          throw new MissionRecoveryRequiredError(m.id);
        }
        reportedArtifacts = listArtifacts(m.id).filter((candidate) => corrected.artifacts.includes(candidate.id) && candidate.path);
        observations = corrected.status === "success" ? scanObservations(reportedArtifacts) : [];
      }
      if (observations.length !== 1) {
        return blocked(`Acquisition for '${capability}' produced ${observations.length} matching observations; exactly one is required`);
      }
      const { artifact, observation } = observations[0];
      if (!["available", "missing", "failed"].includes(String(observation.status)) ||
          typeof observation.detail !== "string" || !observation.detail.trim() ||
          (observation.acquired !== undefined && typeof observation.acquired !== "string")) {
        return blocked(`Acquisition for '${capability}' returned an invalid observation`);
      }
      if (observation.status === "available" &&
          (typeof observation.acquired !== "string" || !observation.acquired.trim()) &&
          observation.local_target === undefined) {
        return blocked(`Acquisition for '${capability}' reported availability without naming what was acquired; ` +
          `an available observation needs acquired or local_target`);
      }
      if (typeof artifact.metadata.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(artifact.metadata.sha256)) {
        return blocked(`Acquisition for '${capability}' observation lacks a valid hash`);
      }
      const attempt: CapabilityAttempt = {
        attempt_id: crypto.randomUUID(), capability,
        observation: {
          capability, status: observation.status as CapabilityAttempt["observation"]["status"], detail: observation.detail,
          ...(typeof observation.acquired === "string" && observation.acquired.trim()
            ? { acquired: observation.acquired }
            : {}),
        },
        artifact_id: artifact.id, artifact_sha256: artifact.metadata.sha256, created_at: new Date().toISOString(),
      };
      if (observation.local_target !== undefined) {
        if (!this.options.acquisition) return blocked(`Acquisition for '${capability}' proposed local_target without trusted host acquisition policy`);
        const persistedObservation: CapabilityObservation = {
          ...attempt.observation, local_target: observation.local_target as CapabilityObservation["local_target"],
        };
        const trusted = resolveQualifiedTarget({
          mission: loadMission(m.id)!, attempt, observation: persistedObservation,
          proposal: persistedObservation.local_target!, policy: this.options.acquisition,
        });
        attempt.observation = persistedObservation;
        attempt.qualified_target = persistedQualifiedTarget(trusted);
      }
      this.capabilityAttempts.push(attempt);
      // A qualified executable becomes immutable for the remainder of the
      // mission so no later delegation or repair can silently invalidate it.
      registerQualifiedExecutables(m.id, qualifiedExecutablePaths(this.capabilityAttempts));
      this.fencedWrite((cur) => ({ metadata: { ...cur.metadata, capability_plane: { outcome: "observed", attempts: this.capabilityAttempts } } }));
      this.checkpoint(results, repairIteration, "manual");
      if (attempt.observation.status !== "available") {
        const detail = `Capability '${capability}' observation is terminal (${attempt.observation.status}): ${attempt.observation.detail}`;
        this.executionTerminalBlocker = `FAIL: ${detail}`;
        this.checkpoint(results, repairIteration, "manual");
        return blocked(detail);
      }
      decision = await this.guard(this.deps.planMission(m, {
        signal, capabilityAttempt: attempt,
        ...(executionFailure ? { executionFailure } : {}),
        previousPlan: accepted ? { strategy: accepted.strategy, delegations: accepted.delegations } : undefined,
      }), signal);
      this.assertActive(signal);
    }
    return blocked("Capability/replan transition limit exhausted");
  }

  private async execute(
    m: Mission,
    _startedAt: number,
    signal: AbortSignal
  ): Promise<{ mission: Mission; review: QAReview | null }> {
    // 0. Check for checkpoint (resume path). Planning happens first because
    // the checkpoint stores results, while the current plan defines the work
    // still to run. Results are matched by delegation fingerprint below.
    const checkpoint = loadCheckpoint(m.id);
    const storedCheckpointPlan = validatedStoredPlan(m.id, checkpoint?.plan, new Set(checkpoint?.execution_superseded ?? []));
    if (checkpoint) {
      this.acceptedPlan = storedCheckpointPlan;
      this.capabilityAttempts = [...(checkpoint.capability_attempts ?? [])];
      this.executionAdaptations = checkpoint.execution_adaptations ?? 0;
      this.executionSuperseded = new Set(checkpoint.execution_superseded ?? []);
      this.executionTerminalBlocker = checkpoint.execution_terminal_blocker;
      this.repairProvenance = [...(checkpoint.repair_provenance ?? [])];
      this.recoveryResolutions = [...(checkpoint.recovery_resolutions ?? [])];
      registerQualifiedExecutables(m.id, qualifiedExecutablePaths(this.capabilityAttempts));
    }
    this.restoreCheckpointSupersessions();

    // Historical observation identity is checked against its registry record;
    // same-name repairs may have replaced the backing path. Authenticated
    // lineage alone can redirect execution to a current, integrity-valid revision.
    const restoredRecords = allArtifactRecords(m.id);
    const restoredLinks = verifiedSupersessions(m.id, [
      ...readSupersessions(loadMission(m.id) ?? m),
      ...(checkpoint?.repair_provenance ?? []).flatMap((proof) => proof.supersessions),
    ]);
    const restoredCurrent = listArtifacts(m.id);
    for (const attempt of this.capabilityAttempts) {
      if (!resolveCurrentArtifact(attempt.artifact_id, attempt.artifact_sha256, restoredLinks, restoredCurrent, restoredRecords)) {
        throw new CheckpointIntegrityError(
          m.id, "malformed",
          `capability observation '${attempt.attempt_id}' failed identity, lineage or current-byte validation`,
          `${m.id}.json`
        );
      }
      if (attempt.qualified_target) {
        if (!attempt.observation.local_target) {
          throw new CheckpointIntegrityError(m.id, "malformed", "qualified capability attempt lacks its proposal", `${m.id}.json`);
        }
        // Persisted identity never authorizes itself: reconstruct live trust
        // through current host policy and compare the complete saved identity.
        resolveQualifiedTarget({
          mission: loadMission(m.id)!, attempt, observation: attempt.observation,
          proposal: attempt.observation.local_target, policy: this.options.acquisition,
          expected: attempt.qualified_target,
        });
      }
    }
    const restoredTerminalObservation = this.capabilityAttempts.find((attempt) => attempt.observation.status !== "available");
    if (restoredTerminalObservation && !this.executionTerminalBlocker) {
      const { capability, observation } = restoredTerminalObservation;
      this.executionTerminalBlocker = `FAIL: Capability '${capability}' observation is terminal (${observation.status}): ${observation.detail}`;
    }
    const initialRepairIteration = checkpoint?.repair_iterations ?? 0;
    this.currentRepair = initialRepairIteration;

    // Restore elapsed time from checkpoint
    if (checkpoint) {
      this.elapsed_ms = checkpoint.elapsed_ms;
    }
    const executionStartTime = Date.now();

    // Nothing may run again while an earlier attempt's outcome is unknown.
    const blockedByAmbiguity = this.gateUnresolvedIntents(checkpoint);
    if (blockedByAmbiguity) return blockedByAmbiguity;

    this.restoreCheckpointSupersessions();

    const injected = this.options.deps ?? {};
    const keys: Array<keyof ManagerDeps> = ["planMission", "executeSpecialist", "reviewMissionDetailed", "resolveModelForRole"];
    const missing = keys.filter((k) => !injected[k] && !(k === "planMission" && storedCheckpointPlan));
    this.deps = { ...(missing.length ? await loadDefaultDeps(missing) : {}), ...injected } as ManagerDeps;

    // 1. Reuse the exact accepted plan whenever one exists. Head is not asked
    // to rewrite confirmed history on resume. Legacy checkpoints may replan only
    // until their completed results are proven to match without omissions.
    let plan: StoredMissionPlan;
    const results: TrackedResult[] = [];
    const completedBeforePlan = [...(checkpoint?.completed ?? [])];
    const capabilityOutcome = this.capabilityAttempts[this.capabilityAttempts.length - 1];
    const planOptions = capabilityOutcome && !storedCheckpointPlan && !this.executionTerminalBlocker
      ? { capabilityAttempt: capabilityOutcome }
      : undefined;
    if (storedCheckpointPlan) {
      plan = storedCheckpointPlan;
      appendLog(m.id, "MissionManager: using the exact stored accepted plan (Head replan skipped)");
    } else if (this.executionTerminalBlocker) {
      // A restored missing/failed observation is terminal even if the process
      // stopped before the blocker itself was checkpointed. QA still reviews
      // the durable evidence, but neither Head nor a specialist runs again.
      plan = validatedStoredPlan(m.id, freezeAcceptedPlan({ strategy: "No executable plan", delegations: [] }))!;
    } else {
      this.assertActive(signal);
      try {
        const planned = await this.planWithCapabilities(m, null, results, initialRepairIteration, signal, undefined, planOptions);
        if ("blocked" in planned) {
          this.executionTerminalBlocker = planned.blocked.review.verdict;
          plan = validatedStoredPlan(m.id, freezeAcceptedPlan({ strategy: "No executable plan", delegations: [] }))!;
        } else {
          plan = planned.plan;
        }
      } catch (err) {
        if (err instanceof CheckpointIntegrityError) throw new MissionStateError(m.id, err.message);
        throw err;
      }
    }
    const matched = matchCompletedDelegations(plan.delegations, checkpoint);
    const matchedCheckpointIndices = new Set(matched.values());
    for (const entry of checkpoint?.completed ?? []) {
      if (entry.status === "success" && entry.delegation_id && plan.delegations.some((delegation) => delegation.delegation_id === entry.delegation_id)) {
        const artifactIds = new Set(entry.artifacts ?? []);
        for (const artifact of listArtifacts(m.id)) {
          if (artifactIds.has(artifact.id) && artifactIntegrityDefect(artifact) !== null) {
            throw new CheckpointIntegrityError(m.id, "malformed", "stored result artifact failed integrity validation", `${m.id}.json`);
          }
        }
      }
    }
    let interruptedAdaptation = false;
    // A safe ordinary retry in the current process retires the earlier failed
    // identity when its replacement outcome is durably recorded. Superseded
    // attempts must neither suppress that outcome nor request another replan.
    const ordinaryRetriedIds = new Set<string>();
    const serviceCheckpointIndices = new Set<number>();
    if (checkpoint && this.capabilityAttempts.length > 0 && this.capabilityResults.length === 0) {
      checkpoint.completed.forEach((entry, index) => {
        if (entry.artifacts?.some((id) => this.capabilityAttempts.some((attempt) => attempt.artifact_id === id))) {
          serviceCheckpointIndices.add(index);
        }
      });
      if (serviceCheckpointIndices.size !== this.capabilityAttempts.length) {
        throw new CheckpointIntegrityError(m.id, "malformed", "capability attempts lack their completed service outcomes", `${m.id}.json`);
      }
      this.capabilityResults = [...serviceCheckpointIndices].sort((a, b) => a - b)
        .map((index) => resultFromCheckpointEntry(checkpoint.completed[index]));
    }
    const unmatchedCompleted = completedBeforePlan.filter((entry, index) =>
      entry.status === "success" && !matchedCheckpointIndices.has(index) && !serviceCheckpointIndices.has(index)
    );
    const normTask = (value: string) => value.trim().replace(/\s+/g, " ");
    const incompatibleCompleted = unmatchedCompleted.filter((entry) => storedCheckpointPlan ||
      plan.delegations.some((delegation) => delegation.agent_role === entry.agent_role && normTask(delegation.task) === normTask(entry.task))
    );
    if (incompatibleCompleted.length > 0) {
      throw new CheckpointIntegrityError(
        m.id,
        "malformed",
        `plan identity conflicts with ${incompatibleCompleted.length} confirmed successful delegation(s); refusing to redefine or repeat them`,
        `${m.id}.json`
      );
    }
    this.mission = loadMission(m.id) ?? this.mission;

    // Restore already-completed delegations from checkpoint. Only confirmed
    // successes are reused; failed, partial and in-flight entries are re-run.
    if (checkpoint && checkpoint.completed.length > 0) {
      const reusedEntries = [...matched.values()].sort((a, b) => a - b);
      appendLog(
        m.id,
        `MissionManager: resuming from checkpoint — ${reusedEntries.length} of ${checkpoint.completed.length} checkpointed delegation(s) reused; ` +
          `${checkpoint.completed.length - reusedEntries.length} to be re-run or dropped; ${checkpoint.in_flight?.length ?? 0} were in flight`
      );
      for (const i of reusedEntries) {
        const planIndex = [...matched.entries()].find(([, checkpointIndex]) => checkpointIndex === i)?.[0];
        const restored = resultFromCheckpointEntry(checkpoint.completed[i]);
        results.push({ ...restored, delegationId: planIndex === undefined ? restored.delegationId : plan.delegations[planIndex].delegation_id });
      }
      // Retain an active plan's definite pre-effect failure as audit history,
      // while still allowing its ordinary safe retry to add a fresh result.
      // Without this, the retry filter mistakes the new attempt for the old
      // failure and QA/finalization see only a failed, empty deliverable.
      if (this.executionAdaptations === 0 || checkpoint.completed.length > 1) {
        checkpoint.completed.forEach((entry) => {
          if (entry.status !== "failed") return;
          const active = plan.delegations.find((delegation) =>
            !this.executionSuperseded.has(delegation.delegation_id) &&
            (entry.delegation_id
              ? delegation.delegation_id === entry.delegation_id
              : delegation.fingerprint === entry.fingerprint)
          );
          if (active && !results.some((result) => result.delegationId === active.delegation_id)) {
            results.push({ ...resultFromCheckpointEntry(entry), delegationId: active.delegation_id });
          }
        });
      }
      if (this.executionAdaptations > 0) {
        checkpoint.completed.forEach((entry, index) => {
          if (entry.status !== "failed" || serviceCheckpointIndices.has(index) || !entry.delegation_id) return;
          if (!results.some((result) => result.delegationId === entry.delegation_id)) results.push(resultFromCheckpointEntry(entry));
        });
        results.sort((a, b) => (checkpoint.completed.findIndex((entry) => entry.delegation_id === a.delegationId)) -
          (checkpoint.completed.findIndex((entry) => entry.delegation_id === b.delegationId)));
      }
    }
    if (!storedCheckpointPlan) {
      this.acceptedPlan = plan;
      // The accepted identities and migrated result ids are durable before
      // registration, model execution, file writes, or any specialist effect.
      this.checkpoint(results, initialRepairIteration, "manual");
    }
    this.completedProvider = () => results;

    const executeBatches = async (): Promise<void> => {
      const batches = buildExecutionBatches(plan.delegations);
      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      this.assertActive(signal);
      const toRun = batches[batchIdx].filter((item) => {
        const identity = (item.del as StoredDelegationPlanItem).delegation_id;
        if (matched.has(item.index)) return false;
        if (ordinaryRetriedIds.has(identity) || this.executionSuperseded.has(identity)) return false;
        // Once the bounded adaptation was consumed, a restored failed attempt
        // is terminal audit evidence, not permission to execute it again.
        // Unattempted identities in the accepted extension may still run.
        if (!restoredOriginalPlanRetry && storedCheckpointPlan && this.executionAdaptations > 0 &&
            results.some((result) => result.delegationId === identity && result.status !== "success")) return false;
        return !results.some((result) => result.delegationId === identity && result.status === "success");
      });

      if (toRun.length === 0) {
        appendLog(m.id, `MissionManager: batch ${batchIdx} already completed (skipped)`);
        continue;
      }

      // Progress is checkpointed as each delegation finishes.
      const finishedInBatch: TrackedResult[] = [];
      this.completedProvider = () => [...results, ...finishedInBatch];
      const onDone = (r: TrackedResult) => {
        finishedInBatch.push(r);
        if (!signal.aborted) {
          // The outcome and the removal of its intent are one durable write.
          if (r.intentKey) this.inFlightDelegations.delete(r.intentKey);
          try {
            this.checkpoint([...results, ...finishedInBatch], initialRepairIteration, "manual");
          } catch (err) {
            if (!(err instanceof MissionFencedError)) throw err;
          }
        }
      };

      if (toRun.length > 1) {
        const roleList = toRun.map((i) => i.del.agent_role).join(", ");
        appendLog(m.id, `MissionManager: executing ${toRun.length} parallel delegations: [${roleList}]`);
        const settled = await Promise.allSettled(
          toRun.map(async ({ del }) => {
            const r = await this.runDelegation(del, m.id, results, signal);
            onDone(r);
            return r;
          })
        );
        this.assertActive(signal);
        const batchResults = settled.map((outcome, i): TrackedResult =>
          outcome.status === "fulfilled"
            ? outcome.value
            : {
                agent_role: toRun[i].del.agent_role,
                status: "failed",
                output: "",
                artifacts: [],
                issues: [String(outcome.reason)],
                duration_ms: 0,
                tools_used: [],
                qualified_attempt_ids: [],
                fingerprint: (toRun[i].del as StoredDelegationPlanItem).fingerprint ?? planFingerprint(toRun[i].del),
                delegationId: (toRun[i].del as StoredDelegationPlanItem).delegation_id,
                task: toRun[i].del.task,
              }
        );
        for (const r of batchResults) {
          appendLog(
            m.id,
            `MissionManager: ${r.agent_role} completed in ${r.duration_ms}ms (parallel) — ${r.status}`
          );
          if (r.delegationId && !this.executionSuperseded.has(r.delegationId) &&
              results.some((result) => result.delegationId === r.delegationId && result.status !== "success")) {
            ordinaryRetriedIds.add(r.delegationId);
          }
          results.push(r);
        }
      } else {
        const { del } = toRun[0];
        appendLog(m.id, `MissionManager: executing ${del.agent_role} — ${del.task.slice(0, 80)}`);
        const r = await this.runDelegation(del, m.id, results, signal);
        onDone(r);
        appendLog(m.id, `MissionManager: ${del.agent_role} completed in ${r.duration_ms}ms — ${r.status}`);
        if (r.delegationId && !this.executionSuperseded.has(r.delegationId) &&
            results.some((result) => result.delegationId === r.delegationId && result.status !== "success")) {
          ordinaryRetriedIds.add(r.delegationId);
        }
        results.push(r);
      }
      // Checkpoint after every batch so a crash loses at most one batch.
      this.checkpoint(results, initialRepairIteration, "manual");
      }
    };

    const restoredOriginalPlanRetry = !!storedCheckpointPlan && !this.executionTerminalBlocker &&
      results.some((result) => result.status === "failed" && !!result.delegationId &&
        !this.executionSuperseded.has(result.delegationId) &&
        checkpoint?.completed.some((entry) => entry.delegation_id === result.delegationId && entry.status === "failed") &&
        checkpoint?.completed.some((entry) => entry.status === "failed" &&
          !!entry.delegation_id && this.executionSuperseded.has(entry.delegation_id) &&
          entry.fingerprint === result.fingerprint));
    // A bounded ordinary failure can be replanned once. Effect-bearing failures
    // remain operator-recovery-only; successful work and accepted identities are
    // never redefined by the extension.
    if (!restoredOriginalPlanRetry && [...this.inFlightDelegations.values(), ...this.carriedAmbiguous.values()]
      .some((entry) => !!entry.failed_outcome || entry.ambiguous || intentEvidence(m.id, entry, "evidence").length > 0)) {
      this.checkpoint(results, initialRepairIteration, "manual");
      throw new MissionRecoveryRequiredError(m.id);
    }
    if (!restoredOriginalPlanRetry && storedCheckpointPlan && this.executionAdaptations > 0 && this.executionSuperseded.size === 0 && !this.executionTerminalBlocker &&
        results.some((result) => result.status !== "success" && (!result.delegationId || !this.executionSuperseded.has(result.delegationId)))) {
      const failure = results.filter((result) => result.status !== "success").map((result) =>
        `${result.agent_role} (${result.delegationId ?? "unknown"}): ${result.issues.join("; ") || result.output.slice(-1000) || "failed"}`
      ).join("\n");
      const adapted = await this.planWithCapabilities(m, plan, results, initialRepairIteration, signal, failure, undefined, true);
      if ("blocked" in adapted) {
        this.executionTerminalBlocker = adapted.blocked.review.verdict;
        this.checkpoint(results, initialRepairIteration, "manual");
      } else {
        plan = adapted.plan;
        interruptedAdaptation = true;
        matched.clear();
        const rematched = matchCompletedDelegations(plan.delegations, {
          mission_id: m.id, version: 1, saved_at: new Date().toISOString(), timeout_ms: this.timeoutMs,
          elapsed_ms: this.elapsed_ms, repair_iterations: initialRepairIteration, reason: "manual",
          completed: results.map((result, index) => ({
            index, delegation_id: result.delegationId, agent_role: result.agent_role, task: result.task ?? "",
            fingerprint: result.fingerprint, status: result.status, output: result.output, artifacts: result.artifacts,
            duration_ms: result.duration_ms, model: result.model, tools_used: result.tools_used, usage: result.usage,
          })),
        });
        for (const [planIndex, resultIndex] of rematched) matched.set(planIndex, resultIndex);
      }
    }
    const activeAdaptedDelegations = plan.delegations.filter((delegation) => !this.executionSuperseded.has(delegation.delegation_id));
    const resumedAdaptationComplete = !!storedCheckpointPlan && this.executionAdaptations > 0 &&
      activeAdaptedDelegations.length > 0 && activeAdaptedDelegations.every((delegation) =>
        results.some((result) => result.delegationId === delegation.delegation_id && result.status === "success")
      );
    if (!this.executionTerminalBlocker && (interruptedAdaptation || !resumedAdaptationComplete)) await executeBatches();
    const failureNeedsRecovery = () => [...this.inFlightDelegations.values(), ...this.carriedAmbiguous.values()]
      .some((entry) => !!entry.failed_outcome || intentEvidence(m.id, entry, "evidence").length > 0);
    let resumedFailedPlan = false;
    const activeFailures = () => results.filter((result) =>
      result.status !== "success" && (!result.delegationId ||
        (!this.executionSuperseded.has(result.delegationId) && !ordinaryRetriedIds.has(result.delegationId)))
    );
    // Preserve the established recovery contract for a definite pre-effect
    // failure restored with the original plan: its safe retry is not a new
    // execution adaptation. Initial failures and accepted replacement failures
    // still use the single bounded adaptation path above/below.
    const retryingRestoredDefiniteFailure = restoredOriginalPlanRetry &&
      activeFailures().length > 0 && activeFailures().every((result) =>
        result.delegationId && !this.executionSuperseded.has(result.delegationId) &&
        checkpoint?.plan?.delegations.some((delegation) => delegation.delegation_id === result.delegationId) &&
        checkpoint?.completed.some((entry) =>
          entry.delegation_id === result.delegationId && entry.status === "failed"
        )
      );
    while (activeFailures().length > 0 && !this.executionTerminalBlocker && !retryingRestoredDefiniteFailure) {
      if (failureNeedsRecovery()) {
        appendLog(m.id, "MissionManager: execution adaptation stopped because an unresolved attempt has a durable footprint");
        break;
      }
      const failed = activeFailures();
      const failure = failed.map((result) =>
        `${result.agent_role} (${result.delegationId ?? "unknown"}): ${result.issues.join("; ") || result.output.slice(-1000) || "failed"}`
      ).join("\n");
      if (this.executionAdaptations > 0) {
        if (storedCheckpointPlan && this.executionSuperseded.size === 0 && !resumedFailedPlan && this.executionAdaptations === 1 && failed.every((result) =>
          checkpoint?.completed.some((entry) => entry.delegation_id === result.delegationId && entry.status === "failed"))) {
          const resumed = await this.planWithCapabilities(m, plan, results, initialRepairIteration, signal, undefined, undefined, true);
          if ("blocked" in resumed) {
            this.executionTerminalBlocker = resumed.blocked.review.verdict;
            this.checkpoint(results, initialRepairIteration, "manual");
            break;
          }
          plan = resumed.plan;
          resumedFailedPlan = true;
        } else break;
      } else {
        const adapted = await this.planWithCapabilities(m, plan, results, initialRepairIteration, signal, failure);
        if ("blocked" in adapted) {
          this.executionTerminalBlocker = adapted.blocked.review.verdict;
          this.checkpoint(results, initialRepairIteration, "manual");
          break;
        }
        plan = adapted.plan;
      }
      const adaptedMatched = matchCompletedDelegations(plan.delegations, {
        mission_id: m.id, version: 1, saved_at: new Date().toISOString(), timeout_ms: this.timeoutMs,
        elapsed_ms: this.elapsed_ms, repair_iterations: initialRepairIteration, reason: "manual" as const,
        completed: results.map((result, index) => ({
          index, delegation_id: result.delegationId, agent_role: result.agent_role, task: result.task ?? "",
          fingerprint: result.fingerprint, status: result.status, output: result.output, artifacts: result.artifacts,
          duration_ms: result.duration_ms, model: result.model, tools_used: result.tools_used, usage: result.usage,
        })),
      });
      matched.clear();
      for (const [planIndex, resultIndex] of adaptedMatched) matched.set(planIndex, resultIndex);
      // Superseded ids were committed atomically with the accepted extension.
      this.checkpoint(results, initialRepairIteration, "manual");
      this.completedProvider = () => results;
      await executeBatches();
    }

    this.completedProvider = () => results;

    // Ordinary returned/thrown failures with a durable effect footprint are
    // ambiguous too. Route them through the same retained-ownership quiescence
    // path as other nonterminal failures; paused state is published only after
    // all real descendants have stopped.
    if ([...this.inFlightDelegations.values()].some((entry) => entry.failed_outcome)) {
      this.checkpoint(results, initialRepairIteration, "manual");
      throw new MissionRecoveryRequiredError(m.id);
    }

    // Persist terminal evidence on ordinary pre-effect failures too. Only an
    // unresolved effect-bearing attempt may bypass the normal final record.
    this.checkpoint(results, initialRepairIteration, "manual");

    // 3. Collect artifact contents for QA
    // Reconcile first: agents that wrote binary deliverables directly into the
    // artifact directory (e.g. screenshots) would otherwise be invisible to QA.
    this.assertActive(signal);
    const reconciled = this.withEffect(() => reconcileArtifactFiles(m.id, { fence: () => !!this.lease?.isHeld() }));
    if (reconciled.length > 0) {
      appendLog(
        m.id,
        `MissionManager: reconciled ${reconciled.length} unregistered artifact file(s): ${reconciled.map((a) => a.name).join(", ")}`
      );
    }
    const activeResults = results.filter((result) => {
      if (!result.delegationId) return true;
      if (this.executionSuperseded.has(result.delegationId)) return false;
      if (!ordinaryRetriedIds.has(result.delegationId)) return true;
      return result === [...results].reverse().find((candidate) => candidate.delegationId === result.delegationId);
    });
    const activePlanCount = plan.delegations.filter((delegation) => !this.executionSuperseded.has(delegation.delegation_id)).length;
    // Freeze the exact candidate identity before QA. Re-review after repair uses
    // a new epoch, so a verdict can never migrate to a different artifact set.
    let candidate = createCandidateEpoch(m, plan, listArtifacts(m.id), initialRepairIteration, this.candidateRepairLineage());
    // A mutated pinned procedure cannot be repaired by producing more
    // deliverables: the acquisition is bounded and already spent.
    const qualifiedDefects = qualifiedExecutableDefects(this.capabilityAttempts);
    if (qualifiedDefects.length > 0 && !this.executionTerminalBlocker) {
      this.executionTerminalBlocker = `FAIL: ${qualifiedDefects.join(" | ")}`;
      appendLog(m.id, `MissionManager: ${qualifiedDefects.length} qualified-executable integrity defect(s) — terminal`);
    }
    // Sort: JSON data files first (most important for QA), then markdown
    const artifactContents = sortJsonFirst(listArtifacts(m.id)).map(artifactContentFor);

    // 4. Independent QA review
    const executionOutput = results
      .map(
        (r) =>
          `--- ${r.agent_role} (${r.status}) ---\n${r.output.slice(0, 4000)}\n` +
          (r.issues.length ? `Issues: ${r.issues.join("; ")}` : "")
      )
      .join("\n\n");

    const initialReview = await this.guard(
      this.deps.reviewMissionDetailed(m, executionOutput, artifactContents, { signal, fence: this.executionFence, candidate }),
      signal
    );
    if (this.executionTerminalBlocker) {
      initialReview.review = {
        ...initialReview.review, passed: false,
        defects: [...initialReview.review.defects, { issue: this.executionTerminalBlocker, severity: "critical" }],
        verdict: `FAIL: ${this.executionTerminalBlocker}`,
      };
      initialReview.gate = { ...initialReview.gate, passed: false, blockers: [...initialReview.gate.blockers, this.executionTerminalBlocker] };
    }
    persistCandidateEvidence(candidate, createCandidateReviewReceipt(candidate, executionOutput, artifactContents, initialReview.review, initialReview.gate));
    let { review, gate } = applyExecutionEvidenceGate(
      activeResults,
      activePlanCount,
      listArtifacts(m.id),
      initialReview.review,
      initialReview.gate,
      [],
      this.currentSupersessions()
    );
    // A reviewer that passed must never be silently overridden. Without this,
    // two runs paused with gate_passed=false and no recorded reason, because
    // the override happened between the reviewer's log line and the repair log.
    if (initialReview.gate.passed && !gate.passed) {
      appendLog(m.id, `MissionManager: QA reviewer passed but the execution evidence gate blocked: ${gate.blockers.join(" | ")}`);
    }
    // An operator's repair retry is an execution instruction, not merely
    // permission to forget the old ambiguity. Even a reviewer that now likes
    // the original artifacts must not silently skip the authorized attempt.
    const pendingRepairRetry = this.recoveryResolutions.find((candidate) =>
      candidate.kind === "repair" && candidate.decision === "retry" && !candidate.consumed_at
    );
    if (pendingRepairRetry) {
      const reason = `Operator ${pendingRepairRetry.operator} explicitly required retry of repair ${pendingRepairRetry.repair_iteration ?? "recorded"}`;
      review = {
        ...review,
        passed: false,
        defects: [...review.defects, { issue: reason, severity: "major" }],
        verdict: `FAIL: ${reason}`,
      };
      gate = { ...gate, passed: false, blockers: [...gate.blockers, reason] };
    }
    this.assertActive(signal);

    // 5. Bounded repair if QA fails
    const latestExecution = loadCheckpoint(m.id);
    for (const id of latestExecution?.execution_superseded ?? []) this.executionSuperseded.add(id);
    const currentResults = activeResults;
    const currentPlanCount = plan.delegations.filter((delegation) => !this.executionSuperseded.has(delegation.delegation_id)).length;
    let repairIteration = initialRepairIteration;
    const repairBlockers: string[] = [];
    while (
      !review.passed &&
      !this.executionTerminalBlocker &&
      currentResults.length === currentPlanCount &&
      repairBlockers.length === 0 &&
      currentResults.every((result) => result.status === "success" && result.artifacts.length > 0) &&
      repairIteration < MAX_REPAIR_ITERATIONS
    ) {
      repairIteration++;
      this.currentRepair = repairIteration;
      appendLog(
        m.id,
        `MissionManager: QA failed (score ${review.score}, gate_passed=${gate.passed}), repair iteration ${repairIteration}`
      );

      // The repair task must see BOTH the LLM defects and the deterministic
      // gate blockers — a gate-only failure (e.g. an unevaluated criterion)
      // produces no LLM defect and would otherwise be unrepairable.
      const problemList = [
        ...review.defects.map(
          (d) => `[${d.severity?.toUpperCase() ?? "ISSUE"}] ${d.issue}`
        ),
        ...gate.blockers.map((b) => `[GATE BLOCKER] ${b}`),
        ...gate.criterion_checks
          .filter((c) => !c.passed)
          .map((c) => `[CRITERION NOT MET] ${c.criterion} — ${c.reason}`),
      ];

      const repairTools = ["shell", "file_read", "file_write", "web_search", "web_fetch", "save_artifact"]
        .filter((tool) => approvedToolGrants(m).has(tool));
      const repairArtifactsBefore = new Set(listArtifacts(m.id).map((artifact) => artifact.id));
      const repairTask = `Fix the following defects identified by QA without changing the approved scope:\n${problemList.join("\n")}\n\n` +
        `Original task context:\n${m.description}\n\n` +
        `${m.metadata.approved_spec_binding
          ? `${formatApprovedSpecContext(assertApprovedSpecBinding(m))}\n\n` : ""}` +
        `Original objective: ${m.objective}\n` +
        `Accepted deliverables:\n${plan.delegations.map((delegation) => `- ${delegation.expected_output}`).join("\n")}\n` +
        `Acceptance criteria:\n${m.acceptance_criteria.map((c) => `- ${c}`).join("\n")}\n\n` +
        (this.capabilityAttempts.some((attempt) => attempt.qualified_target)
          ? `Never modify, rewrite, move or delete a host-qualified procedure. These paths are immutable pinned capabilities and writes to them are refused:\n` +
            `${qualifiedExecutablePaths(this.capabilityAttempts).map((item) => `- ${item}`).join("\n")}\n\n`
          : "") +
        `Modify the existing files at their approved paths. Do not create substitute deliverables in a different directory.\n` +
        `Keep the final response concise; the persisted artifacts are the deliverable.`;
      const repairKey = `repair:${repairIteration}`;
      // A repair is an agent like any other: it consumes one slot of the durable
      // mission-wide budget BEFORE its intent or any effect, and is a tree node.
      let repairNodeId: string;
      try {
        repairNodeId = this.withEffect(() => registerTopLevelNode(m.id, "executor", repairTask.slice(0, 500)), { stage: "repair", role: "executor", tools: repairTools });
      } catch (err) {
        if (!(err instanceof DelegationRequestError)) throw err;
        repairBlockers.push(`Repair ${repairIteration} refused before any effect: ${err.message}`);
        appendLog(m.id, `MissionManager: repair ${repairIteration} refused — ${err.message}`);
        repairIteration--;
        this.currentRepair = repairIteration;
        ({ review, gate } = applyExecutionEvidenceGate(
          currentResults,
          currentPlanCount,
          listArtifacts(m.id),
          review,
          gate,
          repairBlockers,
          this.currentSupersessions()
        ));
        break;
      }
      const repairStart = Date.now();
      const closeRepairNode = (status: "success" | "failed", note?: string) => {
        try {
          finalizeNode(m.id, repairNodeId, status, {
            model: this.deps.resolveModelForRole("executor"),
            duration_ms: Date.now() - repairStart,
            note,
          });
        } catch {
          /* tree persistence is observability; the budget slot is already durable */
        }
      };
      try {
        this.withEffect(() => this.openIntent(repairKey, {
          kind: "repair",
          fingerprint: delegationFingerprint("executor", `repair ${repairIteration}`, "Corrected artifacts addressing all defects"),
          role: "executor",
          task: repairTask.slice(0, 500),
          repairIteration,
          nodeId: repairNodeId,
        }), { stage: "repair", role: "executor", tools: repairTools });
      } catch (err) {
        closeRepairNode("failed", "intent could not be made durable");
        throw err;
      }
      let repairResult: Awaited<ReturnType<ExecuteSpecialistFn>>;
      try {
        this.assertActive(signal);
        repairResult = await this.guard(
          this.deps.executeSpecialist(
            {
              role: "executor",
              task: repairTask,
              context: `Mission: ${m.title}. Repair iteration ${repairIteration}.`,
              tools: repairTools,
              allowedTools: repairTools,
              expected_output: "Corrected artifacts addressing all defects",
              missionId: m.id,
              depth: 0,
              nodeId: repairNodeId,
            },
            m.id,
            { signal, fence: this.executionFence, beginEffect: this.effectMarker(repairKey),
              withEffect: this.withEffect, modelRoute: this.options.modelRoute,
              experience: this.options.experience, executeSpecialist: this.deps.executeSpecialist }
          ),
          signal
        );
        this.assertActive(signal);
      } catch (err) {
        const interrupted = signal.aborted || err instanceof MissionFencedError || err instanceof QualificationDeniedError;
        closeRepairNode("failed", interrupted ? "aborted" : String(err).slice(0, 300));
        if (interrupted) throw err;

        const thrownBlocker = `Repair ${repairIteration} threw before a verified successful outcome: ${String(err).slice(0, 300)}`;
        repairBlockers.push(thrownBlocker);
        const retained = this.retainFailedIntent(repairKey, [thrownBlocker], true);
        if (!retained) {
          // A definite pre-effect error is bounded terminal failure; preserve
          // original artifacts and do not invent ambiguity or repeat work.
          this.inFlightDelegations.delete(repairKey);
          ({ review, gate } = applyExecutionEvidenceGate(
            results,
            plan.delegations.length,
            listArtifacts(m.id),
            review,
            gate,
            repairBlockers,
            this.currentSupersessions()
          ));
          break;
        }
        ({ review, gate } = applyExecutionEvidenceGate(
          currentResults,
          currentPlanCount,
          listArtifacts(m.id),
          review,
          gate,
          repairBlockers,
          this.currentSupersessions()
        ));
        this.checkpoint(results, this.persistedRepairCount(this.inFlightDelegations.get(repairKey)!), "manual");
        // Never publish a resumable pause while this repair's descendants live.
        throw new MissionRecoveryRequiredError(m.id, { review, gate });
      }
      const reportedRepairArtifacts = new Set(repairResult.artifacts ?? []);
      const newRepairArtifacts = listArtifacts(m.id).filter((artifact) =>
        !repairArtifactsBefore.has(artifact.id) &&
        reportedRepairArtifacts.has(artifact.id) &&
        artifactIntegrityDefect(artifact) === null
      );
      if (!repairResult.success) repairBlockers.push(`Repair ${repairIteration} reported failure`);
      if (newRepairArtifacts.length === 0) repairBlockers.push(`Repair ${repairIteration} produced no verified new artifact`);
      closeRepairNode(repairBlockers.length === 0 ? "success" : "failed", repairBlockers[0]);
      if (repairBlockers.length > 0) {
        // An effect-bearing failed repair keeps its intent and is made durable now,
        // so a later timeout, crash or fenced terminal write cannot erase it.
        const anyNewRecords = listArtifacts(m.id).some((artifact) => !repairArtifactsBefore.has(artifact.id));
        const retained = this.retainFailedIntent(repairKey, repairBlockers, false, { reported: anyNewRecords ? ["new-artifact-record"] : [] });
        if (!retained) this.inFlightDelegations.delete(repairKey);
        ({ review, gate } = applyExecutionEvidenceGate(
          currentResults,
          currentPlanCount,
          listArtifacts(m.id),
          review,
          gate,
          repairBlockers,
          this.currentSupersessions()
        ));
        if (retained) {
          this.checkpoint(results, this.persistedRepairCount(this.inFlightDelegations.get(repairKey)!), "manual");
          // Ordinary finalization must never erase an effect-bearing failure or
          // publish paused before its registered processes have actually stopped.
          throw new MissionRecoveryRequiredError(m.id, { review, gate });
        }
        break;
      }
      const repairIntent = this.inFlightDelegations.get(repairKey);
      if (!repairIntent?.intent_id) throw new MissionStateError(m.id, "Completed repair lost its durable intent identity");
      const retryCompletedAt = new Date().toISOString();
      for (const resolution of this.recoveryResolutions) {
        if (resolution.kind === "repair" && resolution.decision === "retry" && !resolution.consumed_at &&
            (resolution.repair_iteration ?? repairIteration) <= repairIteration) {
          resolution.consumed_at = retryCompletedAt;
          resolution.consumed_by = repairIntent.intent_id;
        }
      }
      const provenanceId = crypto.randomUUID();
      const additions = deriveSupersessions(
        m.id,
        newRepairArtifacts,
        repairArtifactsBefore,
        repairIteration,
        "repair",
        { intentId: repairIntent.intent_id, provenanceId }
      );
      if (additions.length > 0) {
        this.repairProvenance.push({
          provenance_id: provenanceId,
          intent_id: repairIntent.intent_id,
          repair_iteration: repairIteration,
          source: "repair",
          outcome: "completed",
          recorded_at: new Date().toISOString(),
          supersessions: additions,
        });
      }
      // Provenance becomes durable in the same checkpoint that closes the real
      // repair intent, before its metadata mapping can be consumed by a gate.
      this.inFlightDelegations.delete(repairKey);
      this.checkpoint(results, repairIteration, "manual");
      this.recordSupersessions(additions);
      appendLog(m.id, `MissionManager: repair ${repairIteration} completed`);

      // Checkpoint after metadata linkage as well.
      this.checkpoint(results, repairIteration, "manual");

      // Re-collect artifacts and re-review.
      // Reconcile again: the repair agent may have written new binary files.
      this.withEffect(() => reconcileArtifactFiles(m.id, { fence: () => !!this.lease?.isHeld() }));
      candidate = createCandidateEpoch(m, plan, listArtifacts(m.id), repairIteration, this.candidateRepairLineage());
      const updatedContents = sortJsonFirst(listArtifacts(m.id)).map(artifactContentFor);
      // Keep the original execution output visible to QA so it can still see
      // what the first pass produced, alongside the repair result.
      const combinedOutput = `${executionOutput}\n\n--- repair ${repairIteration} ---\n${repairResult.output.slice(0, 4000)}`;
      const repairedReview = await this.guard(
        this.deps.reviewMissionDetailed(m, combinedOutput, updatedContents, { signal, fence: this.executionFence, candidate }),
        signal
      );
      persistCandidateEvidence(candidate, createCandidateReviewReceipt(candidate, combinedOutput, updatedContents, repairedReview.review, repairedReview.gate));
      ({ review, gate } = applyExecutionEvidenceGate(
        currentResults,
        currentPlanCount,
        listArtifacts(m.id),
        repairedReview.review,
        repairedReview.gate,
        repairBlockers,
        this.currentSupersessions()
      ));
      this.assertActive(signal);
    }

    // Acquisition is immutable audit history. A later same-name repair may
    // replace its visible artifact only through authenticated repair lineage;
    // ordinary delegation writes can never silently redirect this input.
    const currentArtifacts = listArtifacts(m.id);
    const records = allArtifactRecords(m.id);
    const provenSupersessions = this.currentSupersessions();
    const capabilityEvidenceBlockers: string[] = [];
    for (const attempt of this.capabilityAttempts) {
      if (!resolveCurrentArtifact(attempt.artifact_id, attempt.artifact_sha256, provenSupersessions, currentArtifacts, records)) {
        capabilityEvidenceBlockers.push(`Capability observation '${attempt.attempt_id}' failed identity, authenticated lineage or current-byte validation`);
      }
    }

    // 6. Finalize mission. Re-read and re-verify bytes immediately before the
    // terminal write; QA approval cannot rescue deleted or replaced evidence.
    const finalArtifacts = listArtifacts(m.id);
    try {
      assertCandidateCurrent(candidate, finalArtifacts);
    } catch (error) {
      const issue = `Candidate binding: ${String(error)}`;
      review = { ...review, passed: false, defects: [...review.defects, { issue, severity: "critical" }], verdict: `FAIL: ${issue}` };
      gate = { ...gate, passed: false, blockers: [...gate.blockers, issue] };
    }
    ({ review, gate } = applyExecutionEvidenceGate(
      currentResults,
      currentPlanCount,
      finalArtifacts,
      review,
      gate,
      repairBlockers,
      this.currentSupersessions()
    ));
    if (capabilityEvidenceBlockers.length > 0) {
      review = {
        ...review, passed: false,
        defects: [...review.defects, ...capabilityEvidenceBlockers.map((issue) => ({ issue, severity: "critical" as const }))],
        verdict: `FAIL: ${capabilityEvidenceBlockers.join("; ")}`,
      };
      gate = { ...gate, passed: false, blockers: [...gate.blockers, ...capabilityEvidenceBlockers] };
    }
    const finalStatus = review.passed ? "completed" : "failed";

    // Attach execution accounting: models, tools and token usage per delegation.
    const tokenKeys = ["input_tokens", "output_tokens", "total_tokens", "reasoning_tokens", "cached_input_tokens"] as const;
    const accountingResults = [...this.capabilityResults, ...results];
    const totals = Object.fromEntries(tokenKeys.map((key) => [key, accountingResults.reduce<number | "UNKNOWN">(
      (sum, result) => {
        if (sum === "UNKNOWN") return sum;
        const observed: number | "UNKNOWN" | undefined = result.usage?.[key];
        if (observed === undefined || observed === "UNKNOWN") return "UNKNOWN";
        return sum + (observed ?? 0);
      }, 0,
    )])) as MissionExecutionSummary["totals"];

    // Update elapsed time (accumulated across all resume cycles)
    this.elapsed_ms += Date.now() - executionStartTime;
    this.attemptStartedAt = 0;

    const executionSummary: MissionExecutionSummary = {
      delegations: results.map((r) => ({
        agent_role: r.agent_role,
        status: r.status,
        model: r.model,
        tools_used: r.tools_used ?? [],
        artifacts: [...r.artifacts],
        qualified_attempt_ids: r.qualified_attempt_ids ?? [],
        usage: r.usage,
        duration_ms: r.duration_ms,
      })),
      models_used: [...new Set(accountingResults.map((r) => r.model).filter((m): m is string => !!m))],
      tools_used: [...new Set(accountingResults.flatMap((r) => r.tools_used ?? []))],
      totals,
      qa_score: review.score,
      qa_passed: review.passed,
      repair_iterations: repairIteration,
    };

    // The real, dynamic agent hierarchy — including agents spawned recursively
    // by specialists — persisted so the mission record shows what actually ran.
    const delegationTree = getDelegationTree(m.id);

    // Last check, then seal registration before the fenced terminal write. A
    // failed terminalization can be explicitly resumed; runOwned unseals only
    // a non-terminal mission under its new lease.
    this.assertActive(signal);
    this.withEffect(() => {
      sealMission(m.id, finalStatus);
      this.fencedWrite((cur) => ({
      status: finalStatus,
      artifacts: finalArtifacts.map((a) => a.id),
      metadata: {
        ...cur.metadata,
        execution: executionSummary,
        ...(this.capabilityAttempts.length > 0 ? {
          capability_plane: { outcome: "observed", attempts: this.capabilityAttempts, plan_hash: plan.plan_hash },
        } : {}),
        execution_adaptations: this.executionAdaptations,
        candidate: {
          epoch_id: candidate.epoch_id,
          candidate_sha256: candidate.candidate_sha256,
          repair_iteration: candidate.repair_iteration,
          evidence_path: path.join(DATA_DIR, "candidate-evidence", m.id, `${candidate.epoch_id}.json`),
        },
        delegation_tree: {
          total_agents: delegationTree.total_agents,
          max_depth: delegationTree.max_depth,
          nodes: delegationTree.nodes,
        },
        qa_gate: {
          passed: gate.passed,
          blockers: gate.blockers,
          criterion_checks: gate.criterion_checks,
          llm_score: gate.llm_score,
          llm_passed: gate.llm_passed,
        },
      },
      }));
    }, { stage: "acceptance" });

    appendLog(
      m.id,
      `MissionManager: finished — status=${finalStatus}, score=${review.score}, ` +
        `delegations=${results.length}, models=[${executionSummary.models_used.join(",")}], ` +
        `tools=[${executionSummary.tools_used.join(",")}], total_tokens=${totals.total_tokens}`
    );
    // Mission reached a terminal state — the checkpoint is no longer needed.
    clearCheckpoint(m.id);
    return { mission: loadMission(m.id)!, review };
  }
}

/**
 * Explicitly resolve a delegation or repair whose outcome became ambiguous
 * after a crash. The mission must be paused with no live owner.
 *
 *  - "retry": the operator accepts that the external effect may repeat; the
 *    intent is dropped and the work runs again on resume.
 *  - "accept": the operator vouches that the effect happened and names the
 *    registered artifacts that evidence it. They must pass the full integrity
 *    check. A delegation then counts as a recorded success (never re-run);
 *    a repair counts as performed and QA re-reviews the result.
 *
 * Every resolution is recorded in `mission.metadata.recovery_resolutions`.
 * The mission stays paused; call run() to resume once nothing remains blocked.
 */
export function resolveAmbiguousDelegation(
  missionId: string,
  resolution: AmbiguousResolution
): { remaining: number; mission: Mission } {
  const operator = typeof resolution.operator === "string" ? resolution.operator.trim() : "";
  const note = typeof resolution.note === "string" ? resolution.note.trim() : "";
  if (!operator || !note) throw new MissionStateError(missionId, "An explicit resolution needs a non-empty operator and note");
  if (resolution.decision !== "retry" && resolution.decision !== "accept") {
    throw new MissionStateError(missionId, "Resolution decision must be 'retry' or 'accept'");
  }
  const lease = tryAcquireMissionLease(missionId, "run");
  if (!lease) throw new MissionLeaseError(missionId, readMissionLease(missionId));
  try {
    const mission = loadMission(missionId);
    if (!mission) throw new MissionStateError(missionId, `Mission ${missionId} not found`);
    if (mission.status !== "paused") {
      throw new MissionStateError(missionId, `Mission ${missionId} is '${mission.status}'; ambiguous outcomes can only be resolved while paused`);
    }
    const checkpoint = loadCheckpoint(missionId);
    const inFlight = (checkpoint?.in_flight ?? []) as IntentEntry[];
    const entry = inFlight.find((candidate) => candidate.protocol === INTENT_PROTOCOL && candidate.ambiguous && (candidate.intent_id ?? candidate.fingerprint) === resolution.intent_id);
    if (!checkpoint || !entry) throw new MissionStateError(missionId, `No ambiguous outcome '${resolution.intent_id}' is recorded for mission ${missionId}`);
    validatedStoredPlan(missionId, checkpoint.plan, new Set(checkpoint.execution_superseded ?? []));

    const completed = checkpoint.completed.map((result) => ({ ...result, artifacts: [...(result.artifacts ?? [])] }));
    const durableResolutions = [...(checkpoint.recovery_resolutions ?? [])];
    const previousDecision = durableResolutions.find((candidate) => candidate.intent_id === resolution.intent_id);
    if (previousDecision && previousDecision.decision !== resolution.decision) {
      throw new MissionStateError(missionId, `Intent '${resolution.intent_id}' already has a staged '${previousDecision.decision}' resolution`);
    }
    const durableResolution: DurableRecoveryResolution = previousDecision ?? {
      resolution_id: crypto.randomUUID(),
      intent_id: resolution.intent_id,
      kind: entry.kind ?? "delegation",
      decision: resolution.decision,
      operator,
      note,
      artifacts: [],
      resolved_at: new Date().toISOString(),
      repair_iteration: entry.kind === "repair" ? entry.repair_iteration : undefined,
    };
    if (!previousDecision) durableResolutions.push(durableResolution);
    let repairProvenance = [...(checkpoint.repair_provenance ?? [])];
    let repairIterations = checkpoint.repair_iterations;
    let evidence: string[] = [];
    if (resolution.decision === "accept") {
      const wanted = [...new Set(resolution.artifacts ?? [])];
      if (wanted.length === 0) throw new MissionStateError(missionId, "Accepting an ambiguous outcome requires the registered artifact ids that evidence it");
      if (!entry.baseline || !Array.isArray(entry.baseline.artifact_ids)) {
        throw new MissionStateError(missionId, "Cannot accept: the attempt has no durable pre-effect artifact baseline");
      }
      const baselineIds = new Set(entry.baseline.artifact_ids);
      const registry = new Map(listArtifacts(missionId).map((artifact) => [artifact.id, artifact]));
      const defects = wanted.flatMap((artifactId) => {
        const artifact = registry.get(artifactId);
        if (!artifact) return [`artifact '${artifactId}' is not a currently registered artifact for this mission`];
        if (artifact.mission_id !== missionId || baselineIds.has(artifactId)) {
          return [`artifact '${artifactId}' did not appear during this attempt and cannot vouch for its effect`];
        }
        const defect = artifactIntegrityDefect(artifact);
        return defect ? [defect] : [];
      });
      if (defects.length > 0) throw new MissionStateError(missionId, `Cannot accept: ${defects.join("; ")}`);
      evidence = wanted;
      durableResolution.artifacts = [...wanted];
      if (entry.kind === "repair") {
        repairIterations = Math.max(repairIterations, entry.repair_iteration ?? repairIterations);
        const replacements = wanted.map((id) => registry.get(id)!);
        const existingProof = repairProvenance.find((proof) =>
          proof.intent_id === resolution.intent_id && proof.source === "operator_accept"
        );
        const provenanceId = existingProof?.provenance_id ?? crypto.randomUUID();
        const derived = deriveSupersessions(
          missionId,
          replacements,
          baselineIds,
          entry.repair_iteration ?? repairIterations,
          "operator_accept",
          { intentId: resolution.intent_id, provenanceId }
        );
        if (!existingProof && derived.length > 0) {
          repairProvenance.push({
            provenance_id: provenanceId,
            intent_id: resolution.intent_id,
            repair_iteration: entry.repair_iteration ?? repairIterations,
            source: "operator_accept",
            outcome: "operator_accepted",
            recorded_at: durableResolution.resolved_at,
            operator,
            supersessions: derived,
          });
        }
        for (const priorRetry of durableResolutions) {
          if (priorRetry.kind === "repair" && priorRetry.decision === "retry" && !priorRetry.consumed_at &&
              (priorRetry.repair_iteration ?? entry.repair_iteration ?? 0) <= (entry.repair_iteration ?? repairIterations)) {
            priorRetry.consumed_at = durableResolution.resolved_at;
            priorRetry.consumed_by = resolution.intent_id;
          }
        }
        // Stage both the operator decision and repair provenance while the
        // ambiguous intent remains. A crash before final closure stays blocked.
        saveCheckpoint(
          {
            ...checkpoint,
            saved_at: new Date().toISOString(),
            repair_iterations: repairIterations,
            repair_provenance: repairProvenance,
            recovery_resolutions: durableResolutions,
            owner_id: lease.ownerId,
            reason: "manual",
          },
          { fence: () => lease.isHeld() }
        );
        const supersessionWrite = updateMissionAtomic(
          missionId,
          (cur) => {
            if (isTerminalStatus(cur.status)) return null;
            const metadata = mergeSupersessions(cur.metadata as Record<string, unknown>, derived);
            return metadata === cur.metadata ? null : { metadata };
          },
          { fence: () => lease.isHeld() }
        );
        if (supersessionWrite.reason === "fenced" || supersessionWrite.reason === "not_found") {
          throw new MissionStateError(missionId, "Cannot accept: mission state changed during operator resolution");
        }
        const all = verifiedSupersessions(missionId, readSupersessions(loadMission(missionId)));
        if (derived.some((link) => !all.some((known) => sameSupersession(known, link)))) {
          throw new MissionStateError(missionId, "Cannot accept: the artifact supersession could not be recorded durably");
        }
        const byId = new Map(all.map((link) => [link.superseded_id, link]));
        const allRecords = new Map(allArtifactRecords(missionId).map((artifact) => [artifact.id, artifact]));
        for (const done of completed) {
          done.artifacts = (done.artifacts ?? []).map((id) => registry.has(id) ? id :
            resolveSuperseded(id, byId, registry, allRecords.get(id)?.name)?.id ?? id);
        }
      } else {
        completed.push({
          index: completed.length,
          delegation_id: entry.delegation_id,
          agent_role: entry.agent_role,
          task: entry.task,
          fingerprint: entry.fingerprint,
          status: "success",
          output: `Accepted by ${operator} after an ambiguous crash: ${note}`,
          artifacts: wanted,
          duration_ms: 0,
          tools_used: [],
        });
      }
    } else if (entry.kind === "repair") {
      // A retry authorizes another effect; it does not pretend that the failed
      // attempt never replaced a same-name artifact. Preserve A -> B before the
      // next repair creates B -> C, or the completed original's A reference can
      // no longer be resolved. This lineage is not an acceptance of B's quality.
      const registry = new Map(listArtifacts(missionId).map((artifact) => [artifact.id, artifact]));
      const baselineIds = new Set(entry.baseline?.artifact_ids ?? []);
      const replacements = [...registry.values()].filter((artifact) =>
        !baselineIds.has(artifact.id) && artifactIntegrityDefect(artifact) === null
      );
      const existingProof = repairProvenance.find((proof) =>
        proof.intent_id === resolution.intent_id && proof.source === "operator_retry"
      );
      const provenanceId = existingProof?.provenance_id ?? crypto.randomUUID();
      const derived = deriveSupersessions(
        missionId,
        replacements,
        baselineIds,
        entry.repair_iteration ?? repairIterations + 1,
        "operator_retry",
        { intentId: resolution.intent_id, provenanceId }
      );
      if (!existingProof && derived.length > 0) {
        repairProvenance.push({
          provenance_id: provenanceId,
          intent_id: resolution.intent_id,
          repair_iteration: entry.repair_iteration ?? repairIterations + 1,
          source: "operator_retry",
          outcome: "operator_retried",
          recorded_at: durableResolution.resolved_at,
          operator,
          supersessions: derived,
        });
      }
      // Stage the proof while the intent remains ambiguous. A crash before the
      // metadata index or final closure must still resume through this gate.
      if (derived.length > 0) {
        const all = [...verifiedSupersessions(missionId, readSupersessions(loadMission(missionId))), ...derived];
        const byId = new Map(all.map((link) => [link.superseded_id, link]));
        const allRecords = new Map(allArtifactRecords(missionId).map((artifact) => [artifact.id, artifact]));
        for (const done of completed) {
          done.artifacts = (done.artifacts ?? []).map((id) => registry.has(id) ? id :
            resolveSuperseded(id, byId, registry, allRecords.get(id)?.name)?.id ?? id);
        }
        saveCheckpoint(
          { ...checkpoint, completed, repair_provenance: repairProvenance, recovery_resolutions: durableResolutions, owner_id: lease.ownerId, reason: "manual" },
          { fence: () => lease.isHeld() }
        );
        const lineageWrite = updateMissionAtomic(
          missionId,
          (cur) => {
            if (isTerminalStatus(cur.status)) return null;
            const metadata = mergeSupersessions(cur.metadata as Record<string, unknown>, derived);
            return metadata === cur.metadata ? null : { metadata };
          },
          { fence: () => lease.isHeld() }
        );
        if (lineageWrite.reason === "fenced" || lineageWrite.reason === "not_found") {
          throw new MissionStateError(missionId, "Cannot retry: mission state changed during operator resolution");
        }
      }
      // Re-open exactly the failed repair's iteration, not an original
      // delegation. The next durable resolution supersedes older unconsumed
      // retry instructions for that same work.
      repairIterations = Math.max(0, (entry.repair_iteration ?? repairIterations + 1) - 1);
      for (const priorRetry of durableResolutions) {
        if (priorRetry.resolution_id !== durableResolution.resolution_id &&
            priorRetry.kind === "repair" && priorRetry.decision === "retry" && !priorRetry.consumed_at &&
            (priorRetry.repair_iteration ?? entry.repair_iteration ?? 0) <= (entry.repair_iteration ?? repairIterations + 1)) {
          priorRetry.consumed_at = durableResolution.resolved_at;
          priorRetry.consumed_by = durableResolution.resolution_id;
        }
      }
    }
    const remainingEntries = inFlight.filter((candidate) => candidate !== entry);
    saveCheckpoint(
      {
        ...checkpoint,
        saved_at: new Date().toISOString(),
        completed,
        in_flight: remainingEntries,
        repair_iterations: repairIterations,
        repair_provenance: repairProvenance,
        recovery_resolutions: durableResolutions,
        owner_id: lease.ownerId,
        reason: "manual",
      },
      { fence: () => lease.isHeld() }
    );
    const stillAmbiguous = remainingEntries.filter((candidate) => candidate.protocol === INTENT_PROTOCOL && candidate.ambiguous);
    const updated = updateMissionAtomic(
      missionId,
      (cur) => {
        if (isTerminalStatus(cur.status)) return null;
        const { recovery_blocked: previous, ...rest } = cur.metadata as Record<string, unknown> & { recovery_blocked?: { entries?: Array<{ intent_id?: string }> } };
        const resolutions = Array.isArray(rest.recovery_resolutions) ? (rest.recovery_resolutions as unknown[]) : [];
        const metadata: Record<string, unknown> = {
          ...rest,
          recovery_resolutions: [
            ...resolutions,
            {
              resolution_id: durableResolution.resolution_id,
              intent_id: resolution.intent_id,
              kind: entry.kind ?? "delegation",
              agent_role: entry.agent_role,
              fingerprint: entry.fingerprint,
              decision: resolution.decision,
              operator,
              note,
              artifacts: evidence,
              resolved_at: new Date().toISOString(),
            },
          ],
        };
        if (stillAmbiguous.length > 0 && previous) {
          const keep = new Set(stillAmbiguous.map((candidate) => candidate.intent_id));
          metadata.recovery_blocked = { ...previous, entries: (previous.entries ?? []).filter((e) => keep.has(e.intent_id)) };
        }
        return { metadata };
      },
      { fence: () => lease.isHeld() }
    );
    appendLog(missionId, `MissionManager: ambiguous outcome ${resolution.intent_id} resolved as '${resolution.decision}' by ${operator}: ${note}`);
    return { remaining: stillAmbiguous.length, mission: updated.mission ?? loadMission(missionId)! };
  } finally {
    lease.release();
  }
}

/**
 * Create a dynamic mission manager for an approved mission.
 */
export function createMissionManager(
  mission: Mission,
  timeoutMs?: number,
  options?: MissionManagerOptions
): MissionManager {
  return new MissionManager(mission, timeoutMs, options);
}

/**
 * Install SIGINT/SIGTERM handlers that let a mission persist progress before
 * exit. The mission stays resumable instead of being stuck in `running`
 * (AWE-READINESS-01 D5 / mission d2d08e60). Returns an uninstall function so
 * the handlers do not leak into later work in the same process.
 */
export function installTerminationHandlers(manager: MissionManager): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const handlers = signals.map((sig) => {
    const handler = () => {
      void manager.pauseForProcessExit(sig).then((quiesced) => {
        if (quiesced) process.exit(sig === "SIGINT" ? 130 : 143);
      });
    };
    process.on(sig, handler);
    return { sig, handler };
  });
  return () => {
    for (const { sig, handler } of handlers) process.off(sig, handler);
  };
}
