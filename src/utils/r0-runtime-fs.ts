/**
 * Low-level, dependency-free filesystem primitives for the AWE runtime:
 * unique-tmp atomic writes, synchronous cross-process file locks, pid liveness.
 *
 * Everything here is synchronous on purpose. Mission records are updated from
 * signal handlers and from short critical sections, and the callers (storage,
 * lifecycle) are synchronous APIs that predate this module.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as crypto from "crypto";

const HOST = os.hostname();

/** Block the thread for `ms` without spinning. */
export function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function currentHost(): string {
  return HOST;
}

export function uniqueTmpPath(filePath: string): string {
  return `${filePath}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`;
}

/**
 * Write a file atomically: unique tmp name (no collisions between processes or
 * between concurrent writers in one process), fsync, rename. The tmp file is
 * removed when anything fails.
 */
export function atomicWriteFileSync(filePath: string, data: string): void {
  const tmp = uniqueTmpPath(filePath);
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, "wx", 0o644);
    fs.writeSync(fd, data, 0, "utf-8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function atomicWriteJsonSync(filePath: string, data: unknown): void {
  atomicWriteFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Cross-process lock ──────────────────────────────────────────────────────

export class LockTimeoutError extends Error {
  constructor(public lockFile: string, public timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for lock ${path.basename(lockFile)}`);
    this.name = "LockTimeoutError";
  }
}

interface LockInfo {
  pid: number;
  host: string;
  token: string;
  created_at: number;
}

export interface FileLockOptions {
  /** How long to wait for the lock. */
  timeoutMs?: number;
  /** A lock older than this is considered abandoned even if the pid is alive. */
  maxHoldMs?: number;
}

const DEFAULT_LOCK_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_HOLD_MS = 60_000;

/** Locks currently held by this process (critical sections are synchronous, so this is reentrancy only). */
const heldHere = new Set<string>();

function readLockInfo(lockFile: string): LockInfo | null | "unreadable" {
  let raw: string;
  try {
    raw = fs.readFileSync(lockFile, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    return "unreadable";
  }
  try {
    const parsed = JSON.parse(raw) as LockInfo;
    if (typeof parsed?.token !== "string" || typeof parsed?.pid !== "number") return "unreadable";
    return parsed;
  } catch {
    return "unreadable";
  }
}

/**
 * Break a lock whose holder is gone. Returns true when the lock file was
 * removed (or vanished) and the caller should retry immediately.
 *
 * The lock file is renamed to a private name first so that only one breaker
 * wins; the renamed file is then verified to be the lock we judged stale. If
 * another process replaced it in between, the fresh lock is put back.
 */
function tryBreakStale(lockFile: string, maxHoldMs: number): boolean {
  const info = readLockInfo(lockFile);
  if (info === null) return true;

  let stale = false;
  if (info === "unreadable") {
    try {
      stale = Date.now() - fs.statSync(lockFile).mtimeMs > 5_000;
    } catch {
      return true;
    }
  } else {
    const age = Date.now() - info.created_at;
    const holderDead = info.host === HOST && !isPidAlive(info.pid);
    stale = holderDead || age > maxHoldMs;
  }
  if (!stale) return false;

  const graveyard = `${lockFile}.stale.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
  try {
    fs.renameSync(lockFile, graveyard);
  } catch {
    return true; // somebody else broke it or released it
  }
  const moved = readLockInfo(graveyard);
  const expectedToken = info === "unreadable" ? null : info.token;
  const sameLock =
    expectedToken === null ? moved === "unreadable" : moved !== null && moved !== "unreadable" && moved.token === expectedToken;
  if (!sameLock) {
    // We removed a lock that was acquired after we looked. Put it back.
    try {
      fs.linkSync(graveyard, lockFile);
    } catch {
      /* the new owner's release or another acquirer won the slot */
    }
  }
  try {
    fs.unlinkSync(graveyard);
  } catch {
    /* ignore */
  }
  return true;
}

function acquireLockFile(lockFile: string, opts: Required<FileLockOptions>): string {
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  const token = crypto.randomUUID();
  const info: LockInfo = { pid: process.pid, host: HOST, token, created_at: Date.now() };
  const staging = uniqueTmpPath(lockFile);
  fs.writeFileSync(staging, JSON.stringify(info), "utf-8");
  const deadline = Date.now() + opts.timeoutMs;
  try {
    for (;;) {
      try {
        // link() is atomic and fails with EEXIST, and the lock content is
        // complete the instant the file becomes visible.
        fs.linkSync(staging, lockFile);
        return token;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      }
      if (tryBreakStale(lockFile, opts.maxHoldMs)) continue;
      if (Date.now() >= deadline) throw new LockTimeoutError(lockFile, opts.timeoutMs);
      sleepSync(2 + Math.floor(Math.random() * 10));
    }
  } finally {
    try {
      fs.unlinkSync(staging);
    } catch {
      /* ignore */
    }
  }
}

function releaseLockFile(lockFile: string, token: string): void {
  const info = readLockInfo(lockFile);
  if (info && info !== "unreadable" && info.token === token) {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Run a synchronous critical section under a cross-process exclusive lock.
 * Reentrant within the process. A lock whose holder died (same host, pid gone)
 * is broken automatically.
 */
export function withFileLock<T>(lockFile: string, fn: () => T, options: FileLockOptions = {}): T {
  if (heldHere.has(lockFile)) return fn();
  const opts = {
    timeoutMs: options.timeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS,
    maxHoldMs: options.maxHoldMs ?? DEFAULT_MAX_HOLD_MS,
  };
  const token = acquireLockFile(lockFile, opts);
  heldHere.add(lockFile);
  try {
    const result = fn();
    if (result && typeof (result as { then?: unknown }).then === "function") {
      throw new Error("withFileLock: critical sections must be synchronous");
    }
    return result;
  } finally {
    heldHere.delete(lockFile);
    releaseLockFile(lockFile, token);
  }
}
