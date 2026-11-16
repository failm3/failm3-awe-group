/**
 * AWE GROUP — Mission lifecycle: timeout, checkpoint, resume.
 *
 * Motivation (AWE-READINESS-01 defect D5): three missions were left in
 * status `running` after their processes were killed, with no way to
 * continue or reconcile them. The runtime also had no bound on how long a
 * mission could run, so a slow model call could hang a mission forever.
 *
 * This module provides:
 *   1. `withMissionTimeout` — bound a mission's execution. On timeout the
 *      mission is checkpointed and marked `paused`, NOT `failed`, because the
 *      work done so far is still valid and resumable.
 *   2. `saveCheckpoint` / `loadCheckpoint` — durable, atomic checkpoint of
 *      the mission state (completed delegations, plan, elapsed time).
 *   3. `resumeMission` — continue a paused mission on the SAME mission id,
 *      skipping delegations that already completed.
 *   4. `reconcileOrphanedMissions` — on startup, find missions stuck in
 *      `running` whose process is gone and mark them `paused` so they become
 *      resumable instead of being permanently inconsistent.
 *
 *   5. Single-owner leases (`acquireMissionLease`): a heartbeat-refreshed,
 *      expiring, cross-process lease per mission. Only the lease holder may run
 *      the mission; crash recovery never pauses a mission whose lease is live.
 *   6. Cancel requests (`requestMissionCancel`): how another process asks the
 *      lease holder to stop.
 *
 * A mission id is never reused for a different mission: resume continues the
 * same record, and the checkpoint carries the mission id it belongs to.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import {
  DATA_DIR,
  getMissionRevision,
  loadMission,
  updateMissionAtomic,
  appendLog,
  atomicWriteJson,
  dataSubdir,
  assertSafeMissionId,
  isSafeMissionId,
  withMissionLock,
} from "../utils/storage.js";
import { withFileLock, isPidAlive, currentHost } from "../utils/r0-runtime-fs.js";
import type { DelegationPlanItem } from "./head-agent.js";
import type { AgentResult } from "../types/index.js";
import { hasMissionProcessEvidence, reapOrphanedMissionProcessGroups } from "../utils/process-registry.js";

const CHECKPOINT_DIR = path.join(DATA_DIR, "checkpoints");

/** Default wall-clock budget for a single mission. */
export const DEFAULT_MISSION_TIMEOUT_MS = 30 * 60 * 1000;

// ─── Checkpoint schema ───────────────────────────────────────────────────────

export interface DelegationCheckpoint {
  /** Index of the delegation within the mission plan. */
  index: number;
  /** Stable id assigned before the delegation's first effect. */
  delegation_id?: string;
  agent_role: string;
  task: string;
  /**
   * Stable identity of the delegation: sha256(role, task, expected_output).
   * Absent in legacy checkpoints, which are matched by role only.
   */
  fingerprint?: string;
  status: "success" | "partial" | "failed";
  output: string;
  artifacts?: string[];
  duration_ms: number;
  model?: string;
  tools_used?: string[];
  /** Host receipts, not model claims, for qualified target use. */
  qualified_attempt_ids?: string[];
  usage?: AgentResult["usage"];
}

/** A delegation that had started but not finished. Never counts as done. `intent-v1` records are fail-closed on resume until reconciled or explicitly resolved. */
export interface InFlightDelegation {
  fingerprint: string;
  delegation_id?: string;
  agent_role: string;
  task: string;
  started_at: string;
}

export type StoredDelegationPlanItem = DelegationPlanItem & {
  delegation_id: string;
  fingerprint: string;
};

/** The exact accepted plan. Provider prose generated later cannot redefine it. */
export interface StoredMissionPlan {
  version: 1;
  plan_hash: string;
  strategy: string;
  delegations: StoredDelegationPlanItem[];
}

/** A manager-produced lineage claim, retained independently of writable mission metadata. */
export interface ArtifactSupersession {
  superseded_id: string;
  superseded_by: string;
  name: string;
  superseded_sha256?: string;
  superseded_size_bytes?: number;
  replacement_sha256?: string;
  replacement_size_bytes?: number;
  repair_iteration: number;
  recorded_at: string;
  source: "repair" | "operator_accept" | "operator_retry";
  intent_id?: string;
  provenance_id?: string;
}

export interface RepairProvenance {
  provenance_id: string;
  intent_id: string;
  repair_iteration: number;
  source: ArtifactSupersession["source"];
  outcome: "completed" | "operator_accepted" | "operator_retried";
  recorded_at: string;
  operator?: string;
  supersessions: ArtifactSupersession[];
}

/** Operator decisions are checkpoint evidence as well as visible mission metadata. */
export interface DurableRecoveryResolution {
  resolution_id: string;
  intent_id: string;
  kind: "delegation" | "repair";
  decision: "retry" | "accept";
  operator: string;
  note: string;
  artifacts: string[];
  resolved_at: string;
  /** Repair attempt this decision authorizes or accepts, when applicable. */
  repair_iteration?: number;
  /** Set once a later successful/accepted repair has carried out a retry. */
  consumed_at?: string;
  consumed_by?: string;
}

export interface MissionCheckpoint {
  approved_spec_hash?: string;
  mission_id: string;
  version: 1;
  saved_at: string;
  /** Wall-clock budget for the mission in ms. */
  timeout_ms: number;
  /** Total elapsed time across all attempts (checkpoint + resumed runs). */
  elapsed_ms: number;
  /** Delegations that already completed and must not be re-run on resume. */
  completed: DelegationCheckpoint[];
  /** Delegations running at checkpoint time. Legacy entries re-run; durable intent-v1 entries follow the manager's recovery policy. */
  in_flight?: InFlightDelegation[];
  /** Number of repair iterations already performed. */
  repair_iterations: number;
  /** Bounded discovery/acquisition epochs. Completed attempts are never repeated. */
  capability_attempts?: import("./capability-plane.js").CapabilityAttempt[];
  /** At most one ordinary execution-failure replan is permitted per mission. */
  execution_adaptations?: number;
  /** Failed attempts replaced by the accepted extension; retained for audit, not completion. */
  execution_superseded?: string[];
  /** A fail-closed planner outcome retained until normal terminal evidence is written. */
  execution_terminal_blocker?: string;
  /** Exact accepted/executed plan, persisted before specialist effects. */
  plan?: StoredMissionPlan;
  /** Genuine repair/operator lineage evidence used to authenticate metadata links. */
  repair_provenance?: RepairProvenance[];
  /** Durable operator decisions retained across later checkpoints and resumes. */
  recovery_resolutions?: DurableRecoveryResolution[];
  /** Lease owner that wrote the checkpoint. */
  owner_id?: string;
  /** Why the checkpoint was written. */
  reason: "timeout" | "manual" | "process_exit" | "completed" | "cancelled";
}

/** sha256 over role, task and expected output: the identity used to match results on resume. */
export function delegationFingerprint(role: string, task: string, expectedOutput = ""): string {
  const h = crypto.createHash("sha256");
  for (const part of [role, task, expectedOutput]) {
    h.update(String(part ?? "").trim().replace(/\s+/g, " "));
    h.update("\u0000");
  }
  return h.digest("hex");
}

function ensureCheckpointDir(): void {
  if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function checkpointPath(missionId: string): string {
  return path.join(CHECKPOINT_DIR, `${assertSafeMissionId(missionId)}.json`);
}

export class MissionFencedError extends Error {
  constructor(public missionId: string, public detail: string) {
    super(`Write to mission ${missionId} rejected: ${detail}`);
    this.name = "MissionFencedError";
  }
}

/**
 * Write a checkpoint atomically (unique tmp file + rename) under the mission
 * lock. With `fence`, the write is rejected (MissionFencedError) when the
 * caller no longer owns the mission.
 */
export function saveCheckpoint(
  checkpoint: MissionCheckpoint,
  options: { fence?: () => boolean } = {}
): string {
  ensureCheckpointDir();
  const target = checkpointPath(checkpoint.mission_id);
  withMissionLock(checkpoint.mission_id, () => {
    if (options.fence && !options.fence()) {
      throw new MissionFencedError(checkpoint.mission_id, "checkpoint fenced: lease no longer held");
    }
    atomicWriteJson(target, checkpoint);
  });
  return target;
}

export type CheckpointIntegrityCode = "malformed" | "unreadable" | "wrong_mission";

/** Existing checkpoint evidence is never equivalent to an absent checkpoint. */
export class CheckpointIntegrityError extends Error {
  constructor(
    public missionId: string,
    public code: CheckpointIntegrityCode,
    detail: string,
    public readonly checkpointPath: string
  ) {
    super(`Checkpoint for mission ${missionId} is ${code.replace("_", " ")}: ${detail}`);
    this.name = "CheckpointIntegrityError";
  }
}

function malformedCheckpoint(missionId: string, target: string, detail: string): never {
  throw new CheckpointIntegrityError(missionId, "malformed", detail, target);
}

/**
 * Load valid checkpoint evidence. `null` means ENOENT only: malformed JSON,
 * read failures, invalid structure and a different mission id all fail closed.
 */
export function loadCheckpoint(missionId: string): MissionCheckpoint | null {
  if (!isSafeMissionId(missionId)) {
    throw new CheckpointIntegrityError(missionId, "malformed", "unsafe mission id", String(missionId));
  }
  const target = checkpointPath(missionId);
  let raw: string;
  try {
    raw = fs.readFileSync(target, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new CheckpointIntegrityError(
      missionId,
      "unreadable",
      `read failed (${(err as NodeJS.ErrnoException).code ?? String(err)})`,
      target
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return malformedCheckpoint(missionId, target, `invalid JSON (${String(err)})`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return malformedCheckpoint(missionId, target, "root must be an object");
  }
  const candidate = parsed as Partial<MissionCheckpoint>;
  if (candidate.mission_id !== missionId) {
    throw new CheckpointIntegrityError(
      missionId,
      "wrong_mission",
      `record belongs to ${JSON.stringify(candidate.mission_id ?? null)}`,
      target
    );
  }
  if (candidate.version !== 1) return malformedCheckpoint(missionId, target, "unsupported or missing version");
  if (!Array.isArray(candidate.completed)) return malformedCheckpoint(missionId, target, "completed must be an array");
  for (const entry of candidate.completed) {
    if (!entry || typeof entry !== "object" || !Number.isSafeInteger(entry.index) ||
        typeof entry.agent_role !== "string" || typeof entry.task !== "string" ||
        !["success", "partial", "failed"].includes(entry.status) || typeof entry.output !== "string" ||
        typeof entry.duration_ms !== "number" || !Number.isFinite(entry.duration_ms) ||
        (entry.artifacts !== undefined && (!Array.isArray(entry.artifacts) || entry.artifacts.some((id) => typeof id !== "string"))) ||
        (entry.qualified_attempt_ids !== undefined && (!Array.isArray(entry.qualified_attempt_ids) ||
          entry.qualified_attempt_ids.some((id) => typeof id !== "string" || !id.trim()))) ||
        (entry.fingerprint !== undefined && typeof entry.fingerprint !== "string")) {
      return malformedCheckpoint(missionId, target, "completed contains an invalid delegation result");
    }
  }
  if (candidate.in_flight !== undefined && !Array.isArray(candidate.in_flight)) {
    return malformedCheckpoint(missionId, target, "in_flight must be an array");
  }
  for (const entry of candidate.in_flight ?? []) {
    if (!entry || typeof entry !== "object" || typeof entry.fingerprint !== "string" ||
        typeof entry.agent_role !== "string" || typeof entry.task !== "string" || typeof entry.started_at !== "string") {
      return malformedCheckpoint(missionId, target, "in_flight contains an invalid delegation intent");
    }
  }
  if (!Number.isSafeInteger(candidate.repair_iterations) || (candidate.repair_iterations ?? -1) < 0 ||
      typeof candidate.elapsed_ms !== "number" || !Number.isFinite(candidate.elapsed_ms) ||
      typeof candidate.timeout_ms !== "number" || !Number.isFinite(candidate.timeout_ms) ||
      typeof candidate.saved_at !== "string") {
    return malformedCheckpoint(missionId, target, "invalid timing or repair accounting");
  }
  if (candidate.execution_adaptations !== undefined &&
      (!Number.isSafeInteger(candidate.execution_adaptations) || candidate.execution_adaptations < 0 || candidate.execution_adaptations > 1)) {
    return malformedCheckpoint(missionId, target, "execution_adaptations must be 0 or 1");
  }
  if (candidate.execution_superseded !== undefined &&
      (!Array.isArray(candidate.execution_superseded) || candidate.execution_superseded.some((id) => typeof id !== "string" || !id.trim()))) {
    return malformedCheckpoint(missionId, target, "execution_superseded must contain delegation ids");
  }
  if (candidate.execution_terminal_blocker !== undefined &&
      (typeof candidate.execution_terminal_blocker !== "string" || !candidate.execution_terminal_blocker.trim())) {
    return malformedCheckpoint(missionId, target, "execution_terminal_blocker must be a non-empty string");
  }
  if (candidate.capability_attempts !== undefined && !Array.isArray(candidate.capability_attempts)) {
    return malformedCheckpoint(missionId, target, "capability_attempts must be an array");
  }
  for (const attempt of candidate.capability_attempts ?? []) {
    const observation = attempt?.observation;
    if (!attempt || typeof attempt !== "object" || typeof attempt.attempt_id !== "string" || !attempt.attempt_id.trim() ||
        typeof attempt.capability !== "string" || !attempt.capability.trim() ||
        !observation || typeof observation !== "object" || observation.capability !== attempt.capability ||
        !["available", "missing", "failed"].includes(observation.status) ||
        typeof observation.detail !== "string" || !observation.detail.trim() ||
        (observation.acquired !== undefined && typeof observation.acquired !== "string") ||
        (observation.local_target !== undefined && (!observation.local_target || typeof observation.local_target !== "object" ||
          Array.isArray(observation.local_target) || observation.local_target.runtime !== "node")) ||
        (attempt.qualified_target !== undefined && (!attempt.qualified_target || typeof attempt.qualified_target !== "object" ||
          Array.isArray(attempt.qualified_target) || attempt.qualified_target.runtime !== "node" || !observation.local_target)) ||
        typeof attempt.artifact_id !== "string" || !attempt.artifact_id.trim() ||
        typeof attempt.artifact_sha256 !== "string" || !/^[a-f0-9]{64}$/.test(attempt.artifact_sha256) ||
        typeof attempt.created_at !== "string" || !Number.isFinite(Date.parse(attempt.created_at))) {
      return malformedCheckpoint(missionId, target, "capability_attempts contains an invalid observation");
    }
  }
  if (candidate.plan !== undefined && (!candidate.plan || typeof candidate.plan !== "object" || Array.isArray(candidate.plan))) {
    return malformedCheckpoint(missionId, target, "plan must be an object");
  }
  if (candidate.repair_provenance !== undefined && !Array.isArray(candidate.repair_provenance)) {
    return malformedCheckpoint(missionId, target, "repair_provenance must be an array");
  }
  if (candidate.recovery_resolutions !== undefined && !Array.isArray(candidate.recovery_resolutions)) {
    return malformedCheckpoint(missionId, target, "recovery_resolutions must be an array");
  }
  for (const proof of candidate.repair_provenance ?? []) {
    if (!proof || typeof proof !== "object" || typeof proof.provenance_id !== "string" ||
        typeof proof.intent_id !== "string" || !Number.isSafeInteger(proof.repair_iteration) ||
        !["repair", "operator_accept", "operator_retry"].includes(proof.source) ||
        !["completed", "operator_accepted", "operator_retried"].includes(proof.outcome) ||
        !Array.isArray(proof.supersessions) || proof.supersessions.some((link) => !link || typeof link !== "object")) {
      return malformedCheckpoint(missionId, target, "repair_provenance contains an invalid record");
    }
  }
  for (const resolution of candidate.recovery_resolutions ?? []) {
    if (!resolution || typeof resolution !== "object" || typeof resolution.resolution_id !== "string" ||
        typeof resolution.intent_id !== "string" || !["delegation", "repair"].includes(resolution.kind) ||
        !["retry", "accept"].includes(resolution.decision) || typeof resolution.operator !== "string" ||
        typeof resolution.note !== "string" || !Array.isArray(resolution.artifacts) ||
        resolution.artifacts.some((id) => typeof id !== "string") || typeof resolution.resolved_at !== "string" ||
        (resolution.repair_iteration !== undefined && !Number.isSafeInteger(resolution.repair_iteration)) ||
        (resolution.consumed_at !== undefined && typeof resolution.consumed_at !== "string") ||
        (resolution.consumed_by !== undefined && typeof resolution.consumed_by !== "string")) {
      return malformedCheckpoint(missionId, target, "recovery_resolutions contains an invalid record");
    }
  }
  return candidate as MissionCheckpoint;
}

/** Remove a checkpoint (called when a mission reaches a terminal state). */
export function clearCheckpoint(missionId: string): void {
  const target = checkpointPath(missionId);
  try {
    fs.unlinkSync(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

// ─── Timeout wrapper ─────────────────────────────────────────────────────────

export class MissionTimeoutError extends Error {
  constructor(public missionId: string, public timeoutMs: number) {
    super(`Mission ${missionId} exceeded its ${timeoutMs}ms budget`);
    this.name = "MissionTimeoutError";
  }
}

export interface MissionTimeoutOptions {
  /** External abort (e.g. cancellation). Propagated to `fn`'s signal. */
  signal?: AbortSignal;
  /**
   * After the signal is aborted (timeout or external), how long to wait for
   * `fn` to settle before giving up on it. Default 2000 ms.
   */
  settleGraceMs?: number;
}

/**
 * Run `fn` with a wall-clock budget.
 *
 * `fn` receives an AbortSignal (existing zero-argument callers keep working).
 * On timeout the signal is aborted with a `MissionTimeoutError` reason so the
 * underlying work can stop, then `fn` is given `settleGraceMs` to settle
 * before the timeout handler runs. The timeout handler (checkpoint + pause)
 * therefore normally runs after the work has actually stopped. The promise
 * then rejects with `MissionTimeoutError` so the caller can distinguish "ran
 * out of time" from "failed". A result produced after the abort is discarded.
 *
 * An external `options.signal` abort is forwarded to `fn`; if `fn` does not
 * settle within the grace period the abort reason is thrown.
 *
 * The timer is deliberately NOT unref'd: it must keep the process alive while
 * a mission is running, so the budget always fires even if the only remaining
 * handle is the unsettled `fn()` promise (e.g. a stalled model request).
 */
export async function withMissionTimeout<T>(
  missionId: string,
  timeoutMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
  onTimeout?: (err: MissionTimeoutError) => Promise<void> | void,
  options: MissionTimeoutOptions = {}
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) {
    throw new RangeError("Mission timeout must be a nonnegative safe integer");
  }
  const graceMs = options.settleGraceMs ?? 2000;
  const controller = new AbortController();
  // An already-exhausted cumulative budget must not start a new provider/tool
  // effect while waiting for a zero-delay timer turn.
  if (timeoutMs === 0) {
    const err = new MissionTimeoutError(missionId, timeoutMs);
    controller.abort(err);
    if (onTimeout) await onTimeout(err);
    throw err;
  }
  const parent = options.signal;
  const timers: NodeJS.Timeout[] = [];

  let parentAbortResolve: (() => void) | undefined;
  const parentAborted = new Promise<"aborted">((resolve) => {
    parentAbortResolve = () => {
      timers.push(setTimeout(() => resolve("aborted"), graceMs));
    };
  });
  const onParentAbort = () => {
    controller.abort(parent!.reason);
    parentAbortResolve?.();
  };
  if (parent) {
    if (parent.aborted) onParentAbort();
    else parent.addEventListener("abort", onParentAbort, { once: true });
  }

  type Outcome = { kind: "ok"; value: T } | { kind: "err"; error: unknown };
  let fnPromise: Promise<Outcome>;
  try {
    fnPromise = Promise.resolve(fn(controller.signal)).then(
      (value): Outcome => ({ kind: "ok", value }),
      (error): Outcome => ({ kind: "err", error })
    );
  } catch (error) {
    fnPromise = Promise.resolve({ kind: "err", error });
  }

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timers.push(setTimeout(() => resolve("timeout"), timeoutMs));
  });

  try {
    const winner = await Promise.race([fnPromise, timeoutPromise, parentAborted]);
    if (winner === "aborted") throw parent!.reason ?? new Error("aborted");
    if (winner !== "timeout") {
      if (winner.kind === "ok") return winner.value;
      throw winner.error;
    }

    const err = new MissionTimeoutError(missionId, timeoutMs);
    controller.abort(err);
    let graceTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      fnPromise,
      new Promise<void>((resolve) => {
        graceTimer = setTimeout(resolve, graceMs);
      }),
    ]);
    if (graceTimer) clearTimeout(graceTimer);
    if (onTimeout) await onTimeout(err);
    throw err;
  } finally {
    for (const t of timers) clearTimeout(t);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

// ─── Single-owner mission lease ──────────────────────────────────────────────

export type LeasePurpose = "run" | "approve" | "resume" | "recovery" | "cancel";

export interface LeaseRecord {
  version: 1;
  mission_id: string;
  /** Random per-acquisition token. This, not the pid, identifies the owner. */
  owner_id: string;
  pid: number;
  host: string;
  purpose: LeasePurpose;
  /** Increments on every successful acquisition of this mission's lease. */
  generation: number;
  acquired_at: number;
  heartbeat_at: number;
  expires_at: number;
  ttl_ms: number;
}

export const DEFAULT_LEASE_TTL_MS = Number(process.env.AWE_LEASE_TTL_MS) > 0 ? Number(process.env.AWE_LEASE_TTL_MS) : 30_000;

export class MissionLeaseError extends Error {
  constructor(public missionId: string, public holder: LeaseRecord | null) {
    super(
      holder
        ? `Mission ${missionId} is already owned by pid ${holder.pid}@${holder.host} (${holder.purpose}, lease expires ${new Date(holder.expires_at).toISOString()})`
        : `Mission ${missionId}: could not acquire lease`
    );
    this.name = "MissionLeaseError";
  }
}

function leaseFile(missionId: string): string {
  return path.join(dataSubdir("leases"), `${assertSafeMissionId(missionId)}.json`);
}

function leaseLockFile(missionId: string): string {
  return path.join(dataSubdir("locks"), `lease-${assertSafeMissionId(missionId)}.lock`);
}

type MissionLeaseEvidence =
  | { kind: "absent"; record: null }
  | { kind: "valid"; record: LeaseRecord }
  | { kind: "invalid"; record: null };

function validLeaseRecord(raw: unknown, missionId: string): raw is LeaseRecord {
  if (!raw || typeof raw !== "object") return false;
  const record = raw as Partial<LeaseRecord>;
  const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);
  return record.version === 1 && record.mission_id === missionId &&
    typeof record.owner_id === "string" && record.owner_id.length > 0 &&
    integer(record.pid) && record.pid > 0 &&
    typeof record.host === "string" && record.host.length > 0 &&
    ["run", "approve", "resume", "recovery", "cancel"].includes(record.purpose ?? "") &&
    integer(record.generation) && record.generation > 0 &&
    integer(record.acquired_at) && integer(record.heartbeat_at) && integer(record.expires_at) &&
    integer(record.ttl_ms) && record.ttl_ms > 0;
}

/** Distinguish missing evidence from damaged evidence; only the former may be replaced. */
function inspectMissionLease(missionId: string): MissionLeaseEvidence {
  if (!isSafeMissionId(missionId)) return { kind: "invalid", record: null };
  let text: string;
  try {
    text = fs.readFileSync(leaseFile(missionId), "utf-8");
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "absent", record: null }
      : { kind: "invalid", record: null };
  }
  try {
    const raw: unknown = JSON.parse(text);
    return validLeaseRecord(raw, missionId)
      ? { kind: "valid", record: raw }
      : { kind: "invalid", record: null };
  } catch {
    return { kind: "invalid", record: null };
  }
}

export function readMissionLease(missionId: string): LeaseRecord | null {
  const evidence = inspectMissionLease(missionId);
  return evidence.kind === "valid" ? evidence.record : null;
}

/** A lease is live when it has not expired and, on this host, its process still exists. */
export function isLeaseLive(record: LeaseRecord | null, now = Date.now()): boolean {
  if (!record) return false;
  if (now >= record.expires_at) return false;
  if (record.host === currentHost() && !isPidAlive(record.pid)) return false;
  return true;
}

/**
 * Conservative crash/takeover guard. An expired lease does NOT prove that its
 * owner stopped: SIGSTOP, event-loop stalls and non-cooperative tools can leave
 * the process and external work alive. On another host liveness is unknowable
 * through this filesystem protocol, so takeover requires explicit recovery.
 */
export function isLeaseOwnerPotentiallyActive(record: LeaseRecord | null): boolean {
  if (!record) return false;
  if (record.host !== currentHost()) return true;
  return isPidAlive(record.pid);
}

export function hasLiveLease(missionId: string): boolean {
  return isLeaseLive(readMissionLease(missionId));
}

export function listLiveLeases(): LeaseRecord[] {
  const dir = dataSubdir("leases");
  const live: LeaseRecord[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const rec = readMissionLease(f.replace(/\.json$/, ""));
    if (isLeaseLive(rec)) live.push(rec!);
  }
  return live;
}

export interface HeartbeatOptions {
  /** Called once if the lease is found to be lost (taken over or expired and replaced). */
  onLost?: () => void;
  /** Called when another process asked this owner to cancel the mission. */
  onCancelRequest?: (reason: string) => void;
}

export class MissionLease {
  private timer: NodeJS.Timeout | undefined;
  private released = false;
  private lostNotified = false;
  private lastBeat = Date.now();

  constructor(private record: LeaseRecord) {}

  get missionId(): string {
    return this.record.mission_id;
  }
  get ownerId(): string {
    return this.record.owner_id;
  }
  get generation(): number {
    return this.record.generation;
  }
  get purpose(): LeasePurpose {
    return this.record.purpose;
  }
  get acquiredAt(): number {
    return this.record.acquired_at;
  }
  get ttlMs(): number {
    return this.record.ttl_ms;
  }

  /**
   * True while this object still owns the lease. An expired-but-unreplaced
   * lease is renewed on the spot (the holder was merely late); a lease that was
   * taken over or released is not held.
   */
  isHeld(): boolean {
    if (this.released) return false;
    const onDisk = readMissionLease(this.record.mission_id);
    if (!onDisk || onDisk.owner_id !== this.record.owner_id) return false;
    if (Date.now() < onDisk.expires_at) return true;
    return this.heartbeat();
  }

  /** Extend the lease. Returns false when it is no longer ours. */
  heartbeat(): boolean {
    if (this.released) return false;
    return withFileLock(leaseLockFile(this.record.mission_id), () => {
      const onDisk = readMissionLease(this.record.mission_id);
      if (!onDisk || onDisk.owner_id !== this.record.owner_id) return false;
      const now = Date.now();
      this.record = { ...onDisk, heartbeat_at: now, expires_at: now + this.record.ttl_ms };
      atomicWriteJson(leaseFile(this.record.mission_id), this.record);
      this.lastBeat = now;
      return true;
    });
  }

  /** Start a background heartbeat (also polls cross-process cancel requests). Does not keep the process alive. */
  startHeartbeat(options: HeartbeatOptions = {}): void {
    if (this.timer) return;
    const beatEvery = Math.max(50, Math.floor(this.record.ttl_ms / 3));
    const tickEvery = Math.min(1000, beatEvery);
    this.timer = setInterval(() => {
      try {
        if (Date.now() - this.lastBeat >= beatEvery && !this.heartbeat()) {
          this.notifyLost(options);
          return;
        }
        if (options.onCancelRequest) {
          const req = readCancelRequest(this.record.mission_id);
          if (req && req.requested_at >= this.record.acquired_at) options.onCancelRequest(req.reason);
        }
      } catch {
        /* a failed beat is retried on the next tick; expiry handles a dead disk */
      }
    }, tickEvery);
    this.timer.unref();
  }

  private notifyLost(options: HeartbeatOptions): void {
    this.stopHeartbeat();
    if (!this.lostNotified) {
      this.lostNotified = true;
      options.onLost?.();
    }
  }

  stopHeartbeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Release the lease (idempotent). Only deletes the lease file if it is still ours. */
  release(): void {
    if (this.released) return;
    this.released = true;
    this.stopHeartbeat();
    const id = this.record.mission_id;
    try {
      withMissionLock(id, () =>
        withFileLock(leaseLockFile(id), () => {
          const onDisk = readMissionLease(id);
          if (onDisk && onDisk.owner_id === this.record.owner_id) {
            fs.unlinkSync(leaseFile(id));
            updateMissionAtomic(id, (cur) => {
              const owner = cur.metadata?.execution_owner as { owner_id?: string } | undefined;
              return owner?.owner_id === this.record.owner_id
                ? { metadata: { ...cur.metadata, execution_owner: { ...owner, released_at: new Date().toISOString() } } }
                : null;
            });
          }
        })
      );
    } catch {
      /* expiry / dead-pid detection reclaims an unreleased lease */
    }
  }
}

/**
 * Take the single-owner lease for a mission, or return null when another live
 * owner holds it. Atomic across processes. Lock order: mission lock, then lease lock.
 */
export function tryAcquireMissionLease(
  missionId: string,
  purpose: LeasePurpose = "run",
  options: { ttlMs?: number } = {}
): MissionLease | null {
  assertSafeMissionId(missionId);
  const ttl = options.ttlMs ?? DEFAULT_LEASE_TTL_MS;
  return withMissionLock(missionId, () =>
    withFileLock(leaseLockFile(missionId), () => {
      const evidence = inspectMissionLease(missionId);
      // A damaged or foreign record is durable ownership evidence, not an empty
      // slot. Refuse every acquisition and leave its exact bytes untouched.
      if (evidence.kind === "invalid") return null;
      const existing = evidence.record;
      if (isLeaseLive(existing) || isLeaseOwnerPotentiallyActive(existing)) return null;
      // At this point a same-host owner is confirmed dead. Recovery leases do
      // not get a special permanent exemption: an expired but still alive (or
      // stopped) owner and every remote owner were rejected by the guard above.
      // Even after a recovery operator exits, unresolved process evidence is a
      // durable acquisition barrier. Only the reconciler may clear it.
      if (purpose !== "recovery" && purpose !== "cancel" && hasMissionProcessEvidence(missionId)) return null;
      const now = Date.now();
      const durableOwner = loadMission(missionId)?.metadata?.execution_owner as { generation?: unknown } | undefined;
      const previousGeneration = Math.max(
        existing?.generation ?? 0,
        typeof durableOwner?.generation === "number" && Number.isSafeInteger(durableOwner.generation) ? durableOwner.generation : 0,
      );
      const record: LeaseRecord = {
        version: 1,
        mission_id: missionId,
        owner_id: crypto.randomUUID(),
        pid: process.pid,
        host: currentHost(),
        purpose,
        generation: previousGeneration + 1,
        acquired_at: now,
        heartbeat_at: now,
        expires_at: now + ttl,
        ttl_ms: ttl,
      };
      atomicWriteJson(leaseFile(missionId), record);
      // Observability: the mission record names its current owner.
      updateMissionAtomic(missionId, (cur) => ({
        metadata: {
          ...cur.metadata,
          execution_owner: {
            owner_id: record.owner_id,
            pid: record.pid,
            host: record.host,
            purpose: record.purpose,
            generation: record.generation,
            acquired_at: new Date(record.acquired_at).toISOString(),
          },
        },
      }));
      return new MissionLease(record);
    })
  );
}

export type LeaseAcquisition =
  | { acquired: true; lease: MissionLease; handle: MissionLease }
  | { acquired: false; holder: LeaseRecord | null };

/**
 * Try to take the lease. Never throws for contention: `acquired: false` means a
 * live owner exists (`holder`). Pass `handle` to `releaseMissionLease`.
 */
export function acquireMissionLease(
  missionId: string,
  purpose: LeasePurpose = "run",
  options: { ttlMs?: number } = {}
): LeaseAcquisition {
  const lease = tryAcquireMissionLease(missionId, purpose, options);
  return lease
    ? { acquired: true, lease, handle: lease }
    : { acquired: false, holder: readMissionLease(missionId) };
}

/** Like `tryAcquireMissionLease` but throws `MissionLeaseError` when the mission is owned. */
export function requireMissionLease(
  missionId: string,
  purpose: LeasePurpose = "run",
  options: { ttlMs?: number } = {}
): MissionLease {
  const lease = tryAcquireMissionLease(missionId, purpose, options);
  if (!lease) throw new MissionLeaseError(missionId, readMissionLease(missionId));
  return lease;
}

export function releaseMissionLease(handle: MissionLease): void {
  handle.release();
}

// ─── Cross-process cancel requests ───────────────────────────────────────────

export interface CancelRequest {
  mission_id: string;
  reason: string;
  requested_at: number;
  requester_pid: number;
}

function cancelRequestFile(missionId: string): string {
  return path.join(dataSubdir("cancel-requests"), `${assertSafeMissionId(missionId)}.json`);
}

/** Ask the process holding the mission lease to cancel. The holder polls for this on its heartbeat tick. */
export function requestMissionCancel(missionId: string, reason: string): CancelRequest {
  const req: CancelRequest = {
    mission_id: missionId,
    reason: String(reason).slice(0, 500),
    requested_at: Date.now(),
    requester_pid: process.pid,
  };
  atomicWriteJson(cancelRequestFile(missionId), req);
  return req;
}

export function readCancelRequest(missionId: string): CancelRequest | null {
  if (!isSafeMissionId(missionId)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(cancelRequestFile(missionId), "utf-8")) as CancelRequest;
    return typeof raw?.reason === "string" && typeof raw.requested_at === "number" ? raw : null;
  } catch {
    return null;
  }
}

export function clearCancelRequest(missionId: string): void {
  try {
    fs.unlinkSync(cancelRequestFile(missionId));
  } catch {
    /* none */
  }
}

// ─── Orphan reconciliation ───────────────────────────────────────────────────

export interface OrphanReport {
  /** Mission ids stuck in `running`, or approved before their runner started, moved to `paused`. */
  paused: string[];
  /** Mission ids that already had a checkpoint (so they are directly resumable). */
  resumable: string[];
  /** Running missions left alone because their lease is live. */
  skipped_live: string[];
  /** Missions whose process evidence prevents safe recovery. */
  blocked: Array<{ mission_id: string; reasons: string[] }>;
}

/**
 * Find missions left in `running` and mark them `paused`.
 *
 * This is called at startup. A mission in `running` whose owning process is
 * gone can never finish on its own, so leaving it in `running` produces
 * permanently inconsistent state. Moving it to `paused` makes it resumable.
 *
 * A mission with a LIVE lease (unexpired, owner process alive) is never
 * touched, whichever process owns it. The decision is re-made inside the
 * mission lock, so a runner that acquires the lease concurrently is not paused.
 *
 * `runningMissions` additionally excludes missions the caller knows are in flight.
 */
export async function reconcileOrphanedMissions(
  runningMissions: Set<string> = new Set()
): Promise<OrphanReport> {
  const report: OrphanReport = { paused: [], resumable: [], skipped_live: [], blocked: [] };
  const missionsDir = path.join(DATA_DIR, "missions");
  if (!fs.existsSync(missionsDir)) return report;

  for (const f of fs.readdirSync(missionsDir)) {
    if (!f.endsWith(".json")) continue;
    const id = f.replace(/\.json$/, "");
    if (!isSafeMissionId(id) || runningMissions.has(id)) continue;
    let recoveryLease: MissionLease | null = null;
    const candidate = withMissionLock(id, () => {
      const current = loadMission(id);
      if (!current || (current.status !== "running" && current.status !== "approved")) return null;
      if (isLeaseOwnerPotentiallyActive(readMissionLease(id))) return { live: true as const };
      // Acquire while still holding the mission lock. There is no interval in
      // which a replacement can pass the dead-owner check before recovery.
      recoveryLease = tryAcquireMissionLease(id, "recovery", { ttlMs: 120_000 });
      if (!recoveryLease) return { live: true as const };
      return { live: false as const, revision: getMissionRevision(id) ?? undefined, status: current.status };
    });
    if (!candidate) continue;
    if (candidate.live) {
      report.skipped_live.push(id);
      continue;
    }
    const previousStatus = candidate.status;
    // Recovery ownership spans the entire asynchronous reap operation. Until
    // it is explicitly released, no replacement may overlap old descendants.
    const recovery = recoveryLease as unknown as MissionLease;
    recovery.startHeartbeat();
    try {
      const settlement = await reapOrphanedMissionProcessGroups(id).catch((err) => ({
        quiesced: false,
        reclaimed: [],
        blocked: [{ launch_id: null, reason: String(err) }],
      }));
      if (!settlement.quiesced) {
        const reasons = settlement.blocked.map((entry) => entry.reason);
        updateMissionAtomic(id, (cur) => ({
          metadata: {
            ...cur.metadata,
            recovery_blocked: {
              kind: "process_quiescence",
              detected_at: new Date().toISOString(),
              reasons,
            },
          },
        }), { expectedRevision: candidate.revision, fence: () => recovery.isHeld() });
        appendLog(id, `Lifecycle: recovery remains blocked; mission not resumable — ${reasons.join("; ")}`);
        report.blocked.push({ mission_id: id, reasons });
        continue;
      }

      const result = updateMissionAtomic(
        id,
        (cur) => (cur.status === "running" || cur.status === "approved" ? { status: "paused" } : null),
        { expectedRevision: candidate.revision, fence: () => recovery.isHeld() }
      );
      if (!result.applied) continue;
      appendLog(
        id,
        `Lifecycle: mission was found in '${previousStatus}' with no live lease — all ${settlement.reclaimed.length} process group(s) quiesced before moving to 'paused' (resumable)`
      );
      report.paused.push(id);
      try {
        if (loadCheckpoint(id)) report.resumable.push(id);
      } catch (err) {
        updateMissionAtomic(id, (cur) => ({
          metadata: {
            ...cur.metadata,
            recovery_blocked: {
              kind: "checkpoint_integrity",
              detected_at: new Date().toISOString(),
              detail: String(err),
            },
          },
        }), { fence: () => recovery.isHeld() });
        appendLog(id, `Lifecycle: checkpoint requires manual recovery — ${String(err)}`);
      }
    } finally {
      recovery.release();
    }
  }
  return report;
}
