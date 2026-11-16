import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { MissionSchema, ArtifactSchema } from "../types/index.js";
import type { Mission, Artifact } from "../types/index.js";
import { atomicWriteFileSync, atomicWriteJsonSync, withFileLock } from "./r0-runtime-fs.js";
import { APPROVED_SPEC_BINDING_KEY, assertApprovedSpecBinding, assertApprovedSpecUnchanged } from "./spec-binding.js";
import { assertMissionAdmissionUnchanged } from "./mission-admission.js";
import { writeWorkspaceFile } from "../security/workspace-fs.js";

/**
 * Root of all persisted state. Defaults to `<cwd>/.awe-data`; `AWE_DATA_DIR`
 * relocates it (tests and isolated runs).
 */
export const DATA_DIR = process.env.AWE_DATA_DIR
  ? path.resolve(process.env.AWE_DATA_DIR)
  : path.join(process.cwd(), ".awe-data");
const MISSIONS_DIR = path.join(DATA_DIR, "missions");
const ARTIFACTS_DIR = path.join(DATA_DIR, "artifacts");

export function missionArtifactDir(missionId: string): string {
  return path.join(ARTIFACTS_DIR, assertSafeMissionId(missionId));
}

/** Trusted provisioning; never let a model choose or redirect its filesystem grant. */
export function prepareMissionWorkspace(missionId: string): string {
  ensureDirs();
  const directory = missionArtifactDir(missionId);
  ensureArtifactDirectory(directory);
  return fs.realpathSync(directory);
}

function ensureDirs() {
  for (const dir of [DATA_DIR, MISSIONS_DIR, ARTIFACTS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // existsSync/mkdirSync accept an existing symlink to a directory. Refuse
    // it before any mission or artifact bytes/metadata can cross DATA_DIR's
    // namespace, including when the link existed before module import.
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Storage path contains a symbolic link or non-directory component: ${dir}`);
    }
  }
}

ensureDirs();

/** A sub-directory of DATA_DIR (created on demand): locks, leases, sealed, ... */
export function dataSubdir(name: string): string {
  const dir = path.join(DATA_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ─── Ids ──────────────────────────────────────────────────────────────────────

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Mission ids are used in file names; reject anything that could escape DATA_DIR. */
export function isSafeMissionId(id: unknown): id is string {
  return typeof id === "string" && SAFE_ID.test(id) && !id.includes("..");
}

export function assertSafeMissionId(id: string): string {
  if (!isSafeMissionId(id)) throw new Error(`Unsafe mission id: ${JSON.stringify(String(id).slice(0, 80))}`);
  return id;
}

// ─── Atomic write helper ──────────────────────────────────────────────────────

/**
 * Atomically write JSON: unique tmp file + fsync + rename. Prevents partial
 * writes, and concurrent writers never share a tmp file.
 */
export function atomicWriteJson(filePath: string, data: unknown): void {
  atomicWriteJsonSync(filePath, data);
}

// ─── Per-mission cross-process lock ───────────────────────────────────────────

export function missionLockPath(id: string): string {
  return path.join(dataSubdir("locks"), `mission-${assertSafeMissionId(id)}.lock`);
}

/**
 * Run a synchronous critical section under the mission's cross-process lock.
 * Reentrant. Lock order across the runtime is always mission lock -> lease lock.
 */
export function withMissionLock<T>(id: string, fn: () => T): T {
  return withFileLock(missionLockPath(id), fn);
}

// ─── Missions ─────────────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<string>(["completed", "failed", "cancelled"]);

export function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

/**
 * The revision lives in the record file as `_rev`, outside the Mission schema:
 * `loadMission` never exposes it and `metadata` stays exactly what callers
 * stored. Legacy records without `_rev` are revision 0.
 */
function readMissionFile(id: string): { mission: Mission; revision: number } | null {
  if (!isSafeMissionId(id)) return null;
  const file = path.join(MISSIONS_DIR, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    const result = MissionSchema.safeParse(raw);
    if (!result.success) {
      console.error(`[storage] Corrupt mission ${id}:`, result.error.message);
      return null;
    }
    const rev = (raw as { _rev?: unknown })._rev;
    return { mission: result.data, revision: typeof rev === "number" && Number.isFinite(rev) ? rev : 0 };
  } catch (err) {
    console.error(`[storage] Failed to read mission ${id}:`, err);
    return null;
  }
}

function writeMissionFile(mission: Mission, revision: number): void {
  ensureDirs();
  atomicWriteJson(path.join(MISSIONS_DIR, `${assertSafeMissionId(mission.id)}.json`), { ...mission, _rev: revision });
}

/** Current write revision of a mission (0 for legacy records), or null when it does not exist. */
export function getMissionRevision(id: string): number | null {
  return readMissionFile(id)?.revision ?? null;
}

/**
 * Create or replace a mission record under the mission lock, bumping its
 * revision so a stale copy saved over a newer record is visible to CAS
 * writers. Prefer `updateMissionAtomic` for modifications.
 */
export function saveMission(mission: Mission): void {
  withMissionLock(mission.id, () => {
    const existing = readMissionFile(mission.id);
    if (!existing && fs.existsSync(path.join(MISSIONS_DIR, `${assertSafeMissionId(mission.id)}.json`))) {
      throw new Error(`Mission ${mission.id} has an unreadable existing record; refusing to overwrite approval evidence`);
    }
    if (existing) {
      assertApprovedSpecUnchanged(existing.mission, mission);
      assertMissionAdmissionUnchanged(existing.mission, mission);
    }
    else if (mission.metadata?.[APPROVED_SPEC_BINDING_KEY] !== undefined) assertApprovedSpecBinding(mission);
    // Legacy unbound records remain writable for recovery. Only explicit
    // approval entry points create a binding; storage never infers approval.
    writeMissionFile(mission, existing ? existing.revision + 1 : 1);
  });
}

export function loadMission(id: string): Mission | null {
  return readMissionFile(id)?.mission ?? null;
}

export function listMissions(): Mission[] {
  ensureDirs();
  const missions: Mission[] = [];
  for (const f of fs.readdirSync(MISSIONS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const id = f.replace(/\.json$/, "");
    const m = loadMission(id);
    if (m) missions.push(m);
  }
  return missions.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type MissionMutator = (current: Mission) => Partial<Mission> | null | undefined;

export interface MissionUpdateOptions {
  /** Compare-and-set: apply only when the stored revision equals this value. */
  expectedRevision?: number;
  /**
   * Evaluated inside the mission lock against the current record. Return
   * false (or a reason string) to reject the write, e.g. "I no longer own the lease".
   */
  fence?: (current: Mission) => boolean | string;
  /** Permit changing `status` away from a terminal status (explicit re-open). */
  allowTerminalTransition?: boolean;
}

export interface MissionUpdateResult {
  applied: boolean;
  /** The stored record after the call (the unchanged record when not applied). */
  mission: Mission | null;
  /** Revision of `mission` (use it as `expectedRevision` for the next compare-and-set). */
  revision?: number;
  reason?: "not_found" | "conflict" | "terminal" | "fenced" | "noop";
  detail?: string;
}

/**
 * Atomic read-modify-write of a mission record under the per-mission
 * cross-process lock. The mutator sees the freshest stored record and returns
 * the fields to change (or null for no change), so concurrent writers never
 * lose each other's confirmed updates.
 *
 * A terminal mission (completed/failed/cancelled) refuses a status change
 * unless `allowTerminalTransition` is set: a late writer can never overwrite a
 * terminal state.
 */
export function updateMissionAtomic(
  id: string,
  mutator: MissionMutator,
  options: MissionUpdateOptions = {}
): MissionUpdateResult {
  if (!isSafeMissionId(id)) return { applied: false, mission: null, reason: "not_found" };
  return withMissionLock(id, (): MissionUpdateResult => {
    const stored = readMissionFile(id);
    if (!stored) return { applied: false, mission: null, reason: "not_found" };
    const current = stored.mission;
    // Retain the original even if a callback mutates nested metadata in place.
    const original = structuredClone(current);
    const unchanged = (reason: NonNullable<MissionUpdateResult["reason"]>, detail?: string): MissionUpdateResult => ({
      applied: false,
      mission: original,
      revision: stored.revision,
      reason,
      detail,
    });

    if (options.expectedRevision !== undefined && stored.revision !== options.expectedRevision) {
      return unchanged("conflict", `expected revision ${options.expectedRevision}, found ${stored.revision}`);
    }
    if (options.fence) {
      const verdict = options.fence(current);
      if (verdict !== true) {
        return unchanged("fenced", typeof verdict === "string" ? verdict : "fence rejected the write");
      }
    }

    const patch = mutator(current);
    if (!patch) return unchanged("noop");

    if (
      isTerminalStatus(original.status) &&
      patch.status !== undefined &&
      patch.status !== original.status &&
      !options.allowTerminalTransition
    ) {
      return unchanged("terminal", `mission is ${current.status}; refusing status change to ${patch.status}`);
    }

    const { id: _ignoredId, ...fields } = patch;
    const updated: Mission = {
      ...current,
      ...fields,
      id,
      updated_at: new Date().toISOString(),
    };
    assertApprovedSpecUnchanged(original, updated);
    assertMissionAdmissionUnchanged(original, updated);
    writeMissionFile(updated, stored.revision + 1);
    return { applied: true, mission: updated, revision: stored.revision + 1 };
  });
}

/** Compare-and-set convenience over `updateMissionAtomic`. */
export function compareAndSetMission(
  id: string,
  expectedRevision: number,
  patch: Partial<Mission>
): MissionUpdateResult {
  return updateMissionAtomic(id, () => patch, { expectedRevision });
}

/**
 * Backwards-compatible patch update. Now an atomic read-modify-write under the
 * cross-process lock. Returns the stored record (null when it does not exist);
 * a status change on a terminal mission is refused and the unchanged record is
 * returned. Use `updateMissionAtomic` when you need to know whether it applied.
 */
export function updateMission(id: string, patch: Partial<Mission>): Mission | null {
  return updateMissionAtomic(id, () => patch).mission;
}

// ─── Sealing (cancel fence for artifact registration) ─────────────────────────

export class MissionSealedError extends Error {
  constructor(public missionId: string, public reason: string) {
    super(`Mission ${missionId} is sealed (${reason}); refusing to register artifacts`);
    this.name = "MissionSealedError";
  }
}

function sealPath(id: string): string {
  return path.join(dataSubdir("sealed"), `${assertSafeMissionId(id)}.json`);
}

/** After sealing, no new artifact can be registered for the mission. */
export function sealMission(id: string, reason: string): void {
  withMissionLock(id, () => {
    atomicWriteJson(sealPath(id), { mission_id: id, reason, sealed_at: new Date().toISOString(), pid: process.pid });
  });
}

export function unsealMission(id: string): void {
  withMissionLock(id, () => {
    try {
      fs.unlinkSync(sealPath(id));
    } catch {
      /* not sealed */
    }
  });
}

export function missionSealReason(id: string): string | null {
  if (!isSafeMissionId(id)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(sealPath(id), "utf-8"));
    return typeof raw?.reason === "string" ? raw.reason : "sealed";
  } catch {
    return null;
  }
}

// ─── Artifacts ────────────────────────────────────────────────────────────────

/**
 * Artifacts cannot be registered for a sealed or cancelled mission, so the
 * output of a cancelled run (or of a straggler that ignored the abort) never
 * becomes a deliverable. Called under the mission lock.
 */
function assertNotSealed(missionId: string): void {
  const reason = missionSealReason(missionId);
  if (reason !== null) throw new MissionSealedError(missionId, reason);
  const status = readMissionFile(missionId)?.mission.status;
  if (status && isTerminalStatus(status)) throw new MissionSealedError(missionId, status);
}

export interface ArtifactWriteOptions {
  /** Revalidated under the mission lock immediately before registration. */
  fence?: () => boolean;
  signal?: AbortSignal;
}

function assertArtifactWriteAllowed(missionId: string, options: ArtifactWriteOptions): void {
  assertNotSealed(missionId);
  options.signal?.throwIfAborted();
  if (options.fence && !options.fence()) throw new MissionSealedError(missionId, "mission ownership lost");
}

/** Fence filesystem side effects and optional artifact registration as one
 * synchronous mission-lock critical section (mission lock -> lease lock).
 */
export function withMissionWrite<T>(missionId: string, write: () => T, options: ArtifactWriteOptions = {}): T {
  return withMissionLock(missionId, () => {
    assertArtifactWriteAllowed(missionId, options);
    return write();
  });
}

export function saveArtifact(artifact: Artifact, options: ArtifactWriteOptions = {}): void {
  ensureDirs();
  withMissionLock(artifact.mission_id, () => {
    assertArtifactWriteAllowed(artifact.mission_id, options);
    const file = path.join(ARTIFACTS_DIR, `${artifact.id}.json`);
    atomicWriteJson(file, artifact);
  });
}

/** Create one artifact directory component without ever traversing a symlink. */
function ensureArtifactDirectory(directory: string): void {
  try {
    fs.mkdirSync(directory);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
  }
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Artifact path contains a symbolic link or non-directory component: ${directory}`);
  }
}

const ARTIFACT_REVISION_KEY = "revision";

function artifactRevision(artifact: Artifact): number {
  const revision = artifact.metadata[ARTIFACT_REVISION_KEY];
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

/** Canonical, mission-relative POSIX identity shared by content and metadata. */
function canonicalArtifactName(missionDir: string, name: string): string {
  const posixName = name.replace(/\\/g, path.posix.sep);
  const filePath = path.resolve(missionDir, posixName);
  if (filePath === missionDir || !filePath.startsWith(missionDir + path.sep)) {
    throw new Error(`Artifact name escapes the mission directory: ${name}`);
  }
  return path.relative(missionDir, filePath).split(path.sep).join(path.posix.sep);
}

/** A revisioned same-path record supersedes an unversioned legacy basename. */
function artifactIdentity(artifact: Artifact): string {
  return artifactRevision(artifact) > 0 ? artifact.name : path.posix.basename(artifact.name);
}

function nextArtifactRevision(missionId: string, name: string): number {
  let latest = 0;
  for (const f of fs.readdirSync(ARTIFACTS_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(ARTIFACTS_DIR, f), "utf-8"));
      const result = ArtifactSchema.safeParse(raw);
      if (result.success && result.data.mission_id === missionId && result.data.name === name) {
        latest = Math.max(latest, artifactRevision(result.data));
      }
    } catch {
      // Corrupt entries remain ignored, consistently with listArtifacts.
    }
  }
  return latest + 1;
}

export function saveArtifactFile(
  missionId: string,
  name: string,
  content: string,
  type: Artifact["type"] = "file",
  options: ArtifactWriteOptions = {}
): Artifact {
  ensureDirs();
  assertSafeMissionId(missionId);
  return withMissionLock(missionId, () => {
    assertArtifactWriteAllowed(missionId, options);
    const id = crypto.randomUUID();
    const missionDir = path.join(ARTIFACTS_DIR, missionId);
    const canonicalName = canonicalArtifactName(missionDir, name);
    const filePath = path.resolve(missionDir, canonicalName);
    if (filePath === missionDir || !filePath.startsWith(missionDir + path.sep)) {
      throw new Error(`Artifact name escapes the mission directory: ${name}`);
    }

    // mkdir/write follow prepared symlinks unless every component is checked.
    // The mission lock excludes AWE's own writers; nofollow temp+rename also
    // prevents a final-component link from overwriting its external target.
    ensureArtifactDirectory(missionDir);
    const relative = path.relative(missionDir, filePath);
    const parts = relative.split(path.sep);
    let parent = missionDir;
    for (const part of parts.slice(0, -1)) {
      parent = path.join(parent, part);
      ensureArtifactDirectory(parent);
    }
    const realMissionDir = fs.realpathSync(missionDir);
    const realParent = fs.realpathSync(parent);
    if (realParent !== realMissionDir && !realParent.startsWith(realMissionDir + path.sep)) {
      throw new Error(`Artifact path escapes the real mission directory: ${name}`);
    }
    try {
      const existing = fs.lstatSync(filePath);
      if (existing.isSymbolicLink() || !existing.isFile()) {
        throw new Error(`Artifact target is not a regular non-symlink file: ${name}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }

    // Write content file first, then metadata — if content write fails, nothing is registered.
    writeWorkspaceFile(filePath, content, (candidate) => {
      if (!candidate.startsWith(realMissionDir + path.sep)) throw new Error("Artifact descriptor escaped mission directory");
      return candidate;
    });

    const contentBytes = Buffer.byteLength(content, "utf-8");
    const artifact: Artifact = {
      id,
      mission_id: missionId,
      type,
      name: canonicalName,
      path: filePath,
      content: content.length < 4096 ? content : undefined,
      created_at: new Date().toISOString(),
      metadata: {
        size_bytes: contentBytes,
        sha256: crypto.createHash("sha256").update(content, "utf-8").digest("hex"),
        [ARTIFACT_REVISION_KEY]: nextArtifactRevision(missionId, canonicalName),
      },
    };
    atomicWriteJson(path.join(ARTIFACTS_DIR, `${artifact.id}.json`), artifact);
    return artifact;
  });
}

export function listArtifacts(missionId: string): Artifact[] {
  ensureDirs();
  const allArtifacts: Artifact[] = [];
  for (const f of fs.readdirSync(ARTIFACTS_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(ARTIFACTS_DIR, f), "utf-8")
      );
      const result = ArtifactSchema.safeParse(raw);
      if (result.success && result.data.mission_id === missionId) {
        allArtifacts.push(result.data);
      }
    } catch {
      // skip corrupt artifact entries
    }
  }
  // Revisioned records have exact nested-path identity. Legacy records retain
  // basename dedup, so old flat/nested aliases remain readable without rewrite.
  // Only legacy ties use their original timestamp/UUID ordering; revisions
  // never depend on the wall clock or random id.
  allArtifacts.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const byIdentity = new Map<string, Artifact>();
  const revisionedBasenames = new Set<string>();
  for (const a of allArtifacts) {
    const key = artifactIdentity(a);
    const basename = path.posix.basename(a.name);
    if (artifactRevision(a) > 0) {
      revisionedBasenames.add(basename);
      const previous = byIdentity.get(key) ?? byIdentity.get(basename);
      if (!previous || artifactRevision(a) >= artifactRevision(previous)) {
        if (previous && artifactIdentity(previous) !== key) byIdentity.delete(artifactIdentity(previous));
        byIdentity.set(key, a);
      }
    } else if (!revisionedBasenames.has(basename)) {
      byIdentity.set(key, a);
    }
  }
  return Array.from(byIdentity.values());
}

/**
 * Register files that exist inside the mission's artifact directory but were
 * never registered through `saveArtifactFile` / `save_artifact`.
 *
 * Agents that write binary deliverables (screenshots, images, PDFs) directly
 * to the artifact directory produce a real file but no artifact record, which
 * means QA and the mission index cannot see the deliverable. This reconciles
 * the directory against the registry.
 *
 * Returns the artifacts that were newly registered.
 */
export function reconcileArtifactFiles(missionId: string, options: ArtifactWriteOptions & { reviseChanged?: boolean } = {}): Artifact[] {
  ensureDirs();
  if (!isSafeMissionId(missionId)) return [];
  return withMissionLock(missionId, () => {
    if (options.fence && !options.fence()) throw new MissionSealedError(missionId, "mission ownership lost");
    return reconcileArtifactFilesLocked(missionId, options.reviseChanged === true);
  });
}

function reconcileArtifactFilesLocked(missionId: string, reviseChanged = false): Artifact[] {
  const status = readMissionFile(missionId)?.mission.status;
  if (missionSealReason(missionId) !== null || (status !== undefined && isTerminalStatus(status))) return [];
  const missionDir = path.join(ARTIFACTS_DIR, missionId);
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(missionDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error(`Cannot reconcile a symbolic-link or non-directory artifact mission root: ${missionDir}`);
  }
  const realMissionDir = fs.realpathSync(missionDir);

  const artifacts = listArtifacts(missionId);
  const latestByName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));

  const newlyRegistered: Artifact[] = [];
  const files: Array<{ fullPath: string; relativePath: string }> = [];
  const collectFiles = (directory: string) => {
    const stat = fs.lstatSync(directory);
    const realDirectory = fs.realpathSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() ||
        (realDirectory !== realMissionDir && !realDirectory.startsWith(realMissionDir + path.sep))) {
      throw new Error(`Artifact reconciliation directory escapes the real mission directory: ${directory}`);
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      // Dirent never follows a child symlink. Ignore both file and directory
      // links; recurse only into checked real directories below the root.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        collectFiles(fullPath);
      } else if (entry.isFile()) {
        files.push({ fullPath, relativePath: path.relative(missionDir, fullPath) });
      }
    }
  };
  collectFiles(missionDir);

  for (const { fullPath, relativePath } of files) {
    // Skip our own artifact metadata sidecars and temp files.
    if (relativePath.endsWith(".meta.json") || relativePath.endsWith(".tmp") || relativePath.endsWith(".lock")) continue;
    // Hidden files such as verify/.tmp_before.txt are scratch that an agent rewrites in place. Adopting them pins bytes that later change and fails the integrity gate; registration through the artifact tools is unaffected.
    if (relativePath.split(path.sep).some((segment) => segment.startsWith("."))) continue;
    const canonicalName = relativePath.split(path.sep).join(path.posix.sep);
    const previous = latestByName.get(canonicalName);
    const stat = fs.statSync(fullPath);
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(fullPath)).digest("hex");
    // An active specialist may explicitly supersede changed bytes. Keep the
    // old record untouched and publish a new candidate revision; never rewrite
    // a hash that an earlier QA/candidate epoch may have bound.
    if (previous && previous.metadata.sha256 === sha256 && previous.metadata.size_bytes === stat.size) continue;
    // Outside an active delegation, a changed registered file is potential
    // tampering. Leave its old identity visible so QA/recovery reports the hash
    // mismatch instead of silently promoting the replacement bytes.
    if (previous && !reviseChanged) continue;
    const id = crypto.randomUUID();
    const artifact: Artifact = {
      id,
      mission_id: missionId,
      type: guessArtifactType(relativePath),
      name: canonicalName,
      path: fullPath,
      created_at: new Date().toISOString(),
      metadata: {
        size_bytes: stat.size,
        sha256,
        reconciled: true,
        ...(previous ? { previous_artifact_id: previous.id } : {}),
        [ARTIFACT_REVISION_KEY]: nextArtifactRevision(missionId, canonicalName),
      },
    };
    atomicWriteJson(path.join(ARTIFACTS_DIR, `${artifact.id}.json`), artifact);
    newlyRegistered.push(artifact);
  }

  return newlyRegistered;
}

/** Infer an artifact type from a file extension. */
function guessArtifactType(name: string): Artifact["type"] {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".gif" || ext === ".webp") {
    return "image";
  }
  if (ext === ".json") return "json";
  if (ext === ".md" || ext === ".txt" || ext === ".csv") return "text";
  return "file";
}


// ─── Logs ─────────────────────────────────────────────────────────────────────

// Sanitize log message to prevent log injection
function sanitizeLogMessage(msg: string): string {
  return msg.replace(/[\r\n]/g, " ").slice(0, 2000);
}

export function appendLog(missionId: string, message: string): void {
  ensureDirs();
  const logFile = path.join(DATA_DIR, `${isSafeMissionId(missionId) ? missionId : "_invalid-id"}.log`);
  const line = `[${new Date().toISOString()}] ${sanitizeLogMessage(message)}\n`;
  fs.appendFileSync(logFile, line, "utf-8");
}
