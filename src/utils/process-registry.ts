/**
 * Durable ownership and quiescence records for detached shell process groups.
 *
 * Linux process-group ids can outlive both the AWE process and the shell that
 * created them. These records let a later owner stop only groups belonging to
 * the affected mission and to a confirmed-dead AWE process. They are not a
 * replacement for an external supervisor on other platforms.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { DATA_DIR, atomicWriteJson, assertSafeMissionId } from "./storage.js";

const REGISTRY_DIR = path.join(DATA_DIR, "process-groups");
const HOST = os.hostname();
const OWNER_STAT = process.platform === "linux" ? readProcStat(process.pid) : null;
const OWNER_START_TICKS = OWNER_STAT?.startTicks;
const OWNER_PGID = OWNER_STAT?.pgid;

export interface ProcessGroupRecord {
  version: 1;
  status: "launching" | "active";
  launch_id: string;
  mission_id: string;
  host: string;
  owner_pid: number;
  owner_start_ticks: string | null;
  pid: number | null;
  pgid: number | null;
  group_start_ticks: string | null;
  registered_at: string;
}

export interface PreparedProcessGroup {
  readonly launchId: string;
  readonly missionId: string;
  readonly recordPath: string;
  readonly releasePath: string;
}

export interface RegisteredProcessGroup extends PreparedProcessGroup {
  readonly pid: number;
  readonly pgid: number;
  readonly groupStartTicks: string | null;
}

export interface ProcessQuiescenceResult {
  quiesced: boolean;
  launch_id: string;
  reason?: string;
}

export interface ProcessRecoveryResult {
  /** True only when every valid record is gone and no live member remains. */
  quiesced: boolean;
  reclaimed: string[];
  blocked: Array<{ launch_id: string | null; reason: string }>;
}

interface ProcStat {
  state: string;
  pgid: number;
  startTicks: string;
}

/** Parse Linux stat without splitting the parenthesized, space-containing comm. */
function readProcStat(pid: number): ProcStat | null {
  try {
    const raw = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = raw.lastIndexOf(")");
    if (close < 0) return null;
    const rest = raw.slice(close + 1).trim().split(/\s+/);
    const state = rest[0];
    const pgid = Number(rest[2]);
    const startTicks = rest[19];
    if (!state || !Number.isSafeInteger(pgid) || !/^\d+$/.test(startTicks ?? "")) return null;
    return { state, pgid, startTicks };
  } catch {
    return null;
  }
}

function validPid(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 1;
}

function validLaunchId(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
}

function registryFile(missionId: string, launchId: string): string {
  return path.join(REGISTRY_DIR, `${assertSafeMissionId(missionId)}--${launchId}.json`);
}

function writeRecord(file: string, record: ProcessGroupRecord): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  atomicWriteJson(file, record);
}

/**
 * Persist launch identity before spawning. The spawned shell must use the
 * returned releasePath as a gate; mission commands cannot run before attach.
 */
export function prepareDetachedProcessGroup(missionId: string): PreparedProcessGroup {
  assertSafeMissionId(missionId);
  if (process.platform !== "linux") {
    throw new Error("Durable detached process-group registration currently requires Linux");
  }
  const launchId = crypto.randomUUID();
  const recordPath = registryFile(missionId, launchId);
  const prepared: PreparedProcessGroup = {
    launchId,
    missionId,
    recordPath,
    releasePath: `${recordPath}.release`,
  };
  writeRecord(recordPath, {
    version: 1,
    status: "launching",
    launch_id: launchId,
    mission_id: missionId,
    host: HOST,
    owner_pid: process.pid,
    owner_start_ticks: OWNER_START_TICKS ?? null,
    pid: null,
    pgid: null,
    group_start_ticks: null,
    registered_at: new Date().toISOString(),
  });
  return prepared;
}

/**
 * Attach the real detached child and persist its PID/start identity. Call this
 * synchronously after spawn and before releasing the command gate.
 */
export function attachDetachedProcessGroup(
  prepared: PreparedProcessGroup,
  pid: number | undefined,
): RegisteredProcessGroup {
  if (!validPid(pid)) throw new Error("Detached child has no usable PID");
  if (pid === process.pid) throw new Error("Detached child PID cannot equal its owner PID");
  const ownPgid = OWNER_PGID;
  if (ownPgid === undefined) throw new Error("Owner process-group identity is unavailable");
  if (ownPgid === pid) throw new Error("Refusing to register the owner's own process group");
  const stat = readProcStat(pid);
  if (!stat) {
    // Very short-lived processes can exit before attach. Keeping a durable
    // launching record would make recovery falsely believe it was quiesced.
    try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
    throw new Error("Detached child exited before process-group registration");
  }
  if (stat.pgid !== pid) throw new Error(`Child ${pid} is not its detached process-group leader`);
  const registered: RegisteredProcessGroup = {
    ...prepared,
    pid,
    pgid: pid,
    groupStartTicks: stat.startTicks,
  };
  writeRecord(prepared.recordPath, {
    version: 1,
    status: "active",
    launch_id: prepared.launchId,
    mission_id: prepared.missionId,
    host: HOST,
    owner_pid: process.pid,
    owner_start_ticks: OWNER_START_TICKS ?? null,
    pid,
    pgid: pid,
    group_start_ticks: stat.startTicks,
    registered_at: new Date().toISOString(),
  });
  return registered;
}

/** Release only a fully registered, still-live gated command. */
export function releaseDetachedProcessGroup(group: RegisteredProcessGroup): void {
  if (!fs.existsSync(group.recordPath)) throw new Error("Process-group record disappeared before release");
  fs.writeFileSync(group.releasePath, `${group.launchId}\n`, { encoding: "utf8", flag: "wx" });
}

function removeRecord(group: PreparedProcessGroup): void {
  for (const file of [group.releasePath, group.recordPath]) {
    try { fs.unlinkSync(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function discardUnstartedGroup(prepared: PreparedProcessGroup): void {
  try { removeRecord(prepared); } catch { /* remain fail-closed for recovery */ }
}

/** Clean up a spawn/attach failure without ever releasing executable work. */
export function abortPreparedProcessGroup(prepared: PreparedProcessGroup, pid?: number): void {
  if (pid && validPid(pid) && pid !== process.pid && OWNER_PGID !== undefined && OWNER_PGID !== pid) {
    try { process.kill(-pid, "SIGKILL"); } catch { /* already gone */ }
  }
  discardUnstartedGroup(prepared);
}

function validateRecord(value: unknown, missionId: string, file: string): ProcessGroupRecord {
  const record = value as Partial<ProcessGroupRecord> | null;
  const launchId = record?.launch_id;
  const malformed = !record || record.version !== 1 || !validLaunchId(launchId) ||
    registryFile(missionId, launchId) !== file || record.mission_id !== missionId ||
    record.host !== HOST || typeof record.host !== "string" || record.host.length === 0 ||
    !validPid(record.owner_pid) || typeof record.registered_at !== "string" ||
    !Number.isFinite(Date.parse(record.registered_at)) ||
    (record.owner_start_ticks !== null && !/^\d+$/.test(record.owner_start_ticks ?? "")) ||
    (record.status !== "launching" && record.status !== "active");
  if (malformed) throw new Error("Malformed or cross-mission process-group record");
  if (record.status === "launching") return record as ProcessGroupRecord;
  if (!validPid(record.pid) || !validPid(record.pgid) || record.pid !== record.pgid ||
      record.pgid === process.pid || OWNER_PGID === undefined || OWNER_PGID === record.pgid ||
      !/^\d+$/.test(record.group_start_ticks ?? "")) {
    throw new Error("Malformed or unsafe active process-group identity");
  }
  return record as ProcessGroupRecord;
}

function listRecords(missionId: string): Array<{ file: string; launchId: string | null; record?: ProcessGroupRecord; error?: string }> {
  assertSafeMissionId(missionId);
  let names: string[];
  try { names = fs.readdirSync(REGISTRY_DIR); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result: ReturnType<typeof listRecords> = [];
  const prefix = `${missionId.toLowerCase()}--`;
  for (const name of names) {
    if (!name.toLowerCase().startsWith(prefix) || !name.endsWith(".json")) continue;
    const file = path.join(REGISTRY_DIR, name);
    const launchId = name.slice(prefix.length, -5);
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Process-group record must be a regular non-symlink file");
      const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
      result.push({ file, launchId, record: validateRecord(parsed, missionId, file) });
    } catch (error) {
      result.push({ file, launchId: validLaunchId(launchId) ? launchId : null, error: String(error) });
    }
  }
  return result;
}

/** Fail closed while any valid or malformed process evidence remains. */
export function hasMissionProcessEvidence(missionId: string): boolean {
  return listRecords(missionId).length > 0;
}

function ownerIsAlive(record: ProcessGroupRecord): boolean | null {
  if (!record.owner_start_ticks) return null;
  const procDir = `/proc/${record.owner_pid}`;
  try { fs.statSync(procDir); } catch (error) {
    // Only an actually absent PID confirms death. Permission, I/O and other
    // inspection failures must never authorize a process-group kill.
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : null;
  }
  const stat = readProcStat(record.owner_pid);
  if (stat) return stat.startTicks === record.owner_start_ticks;
  try {
    fs.statSync(procDir);
    return null; // present but unreadable/malformed is not a dead-owner proof
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? false : null;
  }
}

/** Ensure a still-present leader is the original one, not a reused PGID. */
function groupIdentityIsValid(record: ProcessGroupRecord): boolean {
  if (!record.pgid || !record.group_start_ticks) return false;
  const leader = readProcStat(record.pgid);
  if (leader) return leader.pgid === record.pgid && leader.startTicks === record.group_start_ticks;
  try {
    fs.statSync(`/proc/${record.pgid}`);
    return false; // present but unreadable cannot establish group identity
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

function signalGroup(record: ProcessGroupRecord, signal: "SIGTERM" | "SIGKILL"): void {
  if (!record.pgid || !groupIdentityIsValid(record)) throw new Error("Process-group identity changed; refusing to signal a possibly reused PGID");
  try { process.kill(-record.pgid, signal); } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return;
    throw error;
  }
}

/** Live non-zombie members, or null when procfs cannot provide a decision. */
function liveGroupMembers(pgid: number): boolean | null {
  if (process.platform !== "linux") return null;
  let entries: string[];
  try { entries = fs.readdirSync("/proc"); } catch { return null; }
  let sawZombie = false;
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const stat = readProcStat(Number(entry));
    if (stat?.pgid === pgid && stat.state === "Z") sawZombie = true;
    if (stat && stat.pgid === pgid && stat.state !== "Z") return true;
  }
  // Zombies cannot perform userspace effects, but a signal-0 mismatch with an
  // otherwise empty scan means inspection raced or was incomplete, not proof.
  try {
    process.kill(-pgid, 0);
    return sawZombie ? false : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return null;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Terminate one registered group and remove its durable record only after both
 * close (when supplied) and actual process-group disappearance. A timeout or
 * blocked identity is explicit; the record remains for bounded recovery.
 */
export async function quiesceRegisteredProcessGroup(
  group: RegisteredProcessGroup,
  options: { graceMs?: number; timeoutMs?: number; close?: Promise<unknown> } = {},
): Promise<ProcessQuiescenceResult> {
  let record: ProcessGroupRecord;
  try {
    const stat = fs.lstatSync(group.recordPath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Process-group record must be a regular non-symlink file");
    record = validateRecord(JSON.parse(fs.readFileSync(group.recordPath, "utf8")), group.missionId, group.recordPath);
    if (record.status !== "active") throw new Error("Process group was not fully registered");
  } catch (error) {
    return { quiesced: false, launch_id: group.launchId, reason: String(error) };
  }

  let closeError: unknown = null;
  let closeDone = !options.close;
  options.close?.then(
    () => { closeDone = true; },
    (error) => { closeError = error; closeDone = true; },
  );
  const graceMs = Math.max(0, Math.min(options.graceMs ?? 500, 30_000));
  const timeoutMs = Math.max(graceMs + 1, Math.min(options.timeoutMs ?? 5_000, 120_000));
  const started = Date.now();
  let reason = closeError ? String(closeError) : undefined;
  let killed = false;
  try { signalGroup(record, "SIGTERM"); } catch (error) { reason = String(error); }

  while (Date.now() - started <= timeoutMs) {
    const elapsed = Date.now() - started;
    if (!killed && elapsed >= graceMs) {
      try { signalGroup(record, "SIGKILL"); } catch (error) { reason = String(error); }
      killed = true;
    }

    const live = liveGroupMembers(record.pgid!);
    const groupGone = live === false;
    if (groupGone && closeDone) {
      try { removeRecord(group); } catch (error) {
        return { quiesced: false, launch_id: group.launchId, reason: String(error) };
      }
      return { quiesced: true, launch_id: group.launchId };
    }
    await delay(Math.min(20, Math.max(1, timeoutMs - elapsed)));
  }
  return {
    quiesced: false,
    launch_id: group.launchId,
    reason: reason ?? `Process group ${record.pgid} did not quiesce within ${timeoutMs} ms`,
  };
}

/**
 * Recovery hook for lifecycle: call AFTER determining the recorded mission
 * owner is dead, but BEFORE publishing paused/resumable state or allowing a new
 * overlapping run. It independently re-verifies owner death before any signal.
 * Malformed records, live/unknown owners and surviving groups block recovery.
 */
export async function reapOrphanedMissionProcessGroups(
  missionId: string,
  options: { graceMs?: number; timeoutMs?: number } = {},
): Promise<ProcessRecoveryResult> {
  const entries = listRecords(missionId);
  const result: ProcessRecoveryResult = { quiesced: true, reclaimed: [], blocked: [] };
  for (const entry of entries) {
    if (!entry.record) {
      result.blocked.push({ launch_id: entry.launchId, reason: entry.error ?? "Malformed process-group record" });
      continue;
    }
    const record = entry.record;
    if (record.status !== "active" || record.pid === null) {
      result.blocked.push({ launch_id: record.launch_id, reason: "Launch was not durably attached; external supervisor inspection required" });
      continue;
    }
    const alive = ownerIsAlive(record);
    if (alive !== false) {
      result.blocked.push({
        launch_id: record.launch_id,
        reason: alive ? "Recorded owner is still alive; refusing orphan kill" : "Recorded owner identity cannot be verified",
      });
      continue;
    }
    const group: RegisteredProcessGroup = {
      launchId: record.launch_id,
      missionId,
      recordPath: entry.file,
      releasePath: `${entry.file}.release`,
      pid: record.pid,
      pgid: record.pgid!,
      groupStartTicks: record.group_start_ticks,
    };
    const settled = await quiesceRegisteredProcessGroup(group, options);
    if (settled.quiesced) result.reclaimed.push(record.launch_id);
    else result.blocked.push({ launch_id: record.launch_id, reason: settled.reason ?? "Process group remains live" });
  }
  result.quiesced = result.blocked.length === 0;
  return result;
}

/**
 * Cooperative process-exit hook. Unlike orphan recovery this is allowed to
 * stop groups owned by THIS live process, but only after matching the full
 * mission/PID/start identity. Any non-quiesced result must block paused state.
 */
export async function quiesceCurrentMissionProcessGroups(
  missionId: string,
  options: { graceMs?: number; timeoutMs?: number } = {},
): Promise<ProcessRecoveryResult> {
  const entries = listRecords(missionId);
  const result: ProcessRecoveryResult = { quiesced: true, reclaimed: [], blocked: [] };
  for (const entry of entries) {
    if (!entry.record) {
      result.blocked.push({ launch_id: entry.launchId, reason: entry.error ?? "Malformed process-group record" });
      continue;
    }
    const record = entry.record;
    if (record.owner_pid !== process.pid || record.owner_start_ticks !== (OWNER_START_TICKS ?? null)) {
      result.blocked.push({ launch_id: record.launch_id, reason: "Process-group owner identity does not match this process" });
      continue;
    }
    if (record.status !== "active" || record.pid === null) {
      result.blocked.push({ launch_id: record.launch_id, reason: "Launch was not durably attached" });
      continue;
    }
    const group: RegisteredProcessGroup = {
      launchId: record.launch_id,
      missionId,
      recordPath: entry.file,
      releasePath: `${entry.file}.release`,
      pid: record.pid,
      pgid: record.pgid!,
      groupStartTicks: record.group_start_ticks,
    };
    const settled = await quiesceRegisteredProcessGroup(group, options);
    if (settled.quiesced) result.reclaimed.push(record.launch_id);
    else result.blocked.push({ launch_id: record.launch_id, reason: settled.reason ?? "Process group remains live" });
  }
  result.quiesced = result.blocked.length === 0;
  return result;
}
