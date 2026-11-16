import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

/** Host policy, never model/tool arguments. Cgroup bounds cover the entire
 * execution (including bwrap); rlimits are inherited by each descendant. */
export interface ExecutionResourceLimits {
  memoryBytes: number;
  tasks: number;
  cpuPercent: number;
  cpuSeconds: number;
  fileBytes: number;
  openFiles: number;
  wallMs: number;
}

export const DEFAULT_EXECUTION_RESOURCE_LIMITS: Readonly<ExecutionResourceLimits> = Object.freeze({
  memoryBytes: 1024 * 1024 * 1024,
  tasks: 64,
  cpuPercent: 100,
  cpuSeconds: 30,
  fileBytes: 64 * 1024 * 1024,
  openFiles: 256,
  wallMs: 30_000,
});

const binaries = ["/usr/bin/systemd-run", "/usr/bin/systemctl", "/usr/bin/python3", "/usr/bin/prlimit", "/usr/bin/env", "/usr/bin/bwrap"];

function managerEnvironment(): NodeJS.ProcessEnv {
  if (process.platform !== "linux" || !process.getuid || process.getuid() === 0) {
    throw new Error("Resource isolation requires non-root Linux with a delegated systemd user manager");
  }
  const runtime = `/run/user/${process.getuid()}`;
  // Do not forward the owner's environment (including loader hooks/credentials)
  // to either the manager client or the trusted verification executable.
  return { PATH: "/usr/bin:/bin", LANG: "C.UTF-8", XDG_RUNTIME_DIR: runtime,
    DBUS_SESSION_BUS_ADDRESS: `unix:path=${runtime}/bus` };
}

/** Safe read-only capability query. It does not create scopes or change host
 * configuration. Every launch additionally verifies the actual kernel files. */
export function inspectResourceIsolation(): { supported: boolean; reason?: string; controlGroup?: string } {
  try {
    const env = managerEnvironment();
    for (const file of binaries) fs.accessSync(file, fs.constants.X_OK);
    const result = spawnSync("/usr/bin/systemctl", ["--user", "show", "--property=ControlGroup", "--value"], {
      env, encoding: "utf8", timeout: 3000, maxBuffer: 16 * 1024,
    });
    if (result.error || result.status !== 0) throw new Error(`User manager unavailable: ${result.error ?? result.stderr.trim()}`);
    const controlGroup = result.stdout.trim();
    if (!controlGroup.startsWith("/") || controlGroup.split("/").includes("..")) throw new Error("Invalid user-manager cgroup");
    const dir = path.join("/sys/fs/cgroup", controlGroup);
    const controllers = fs.readFileSync(path.join(dir, "cgroup.controllers"), "utf8").trim().split(/\s+/);
    if (!["memory", "pids", "cpu"].every((name) => controllers.includes(name))) {
      throw new Error("User manager lacks delegated memory, pids or cpu controller");
    }
    return { supported: true, controlGroup };
  } catch (error) {
    return { supported: false, reason: String(error) };
  }
}

function validatedLimits(overrides: Partial<ExecutionResourceLimits>): ExecutionResourceLimits {
  const limits = { ...DEFAULT_EXECUTION_RESOURCE_LIMITS, ...overrides };
  const bounds: Record<keyof ExecutionResourceLimits, [number, number]> = {
    memoryBytes: [32 * 1024 * 1024, 4 * 1024 * 1024 * 1024],
    tasks: [8, 256], cpuPercent: [1, 200], cpuSeconds: [1, 120],
    fileBytes: [1024, 256 * 1024 * 1024], openFiles: [32, 1024], wallMs: [100, 120_000],
  };
  for (const key of Object.keys(bounds) as Array<keyof ExecutionResourceLimits>) {
    const [min, max] = bounds[key];
    if (!Number.isSafeInteger(limits[key]) || limits[key] < min || limits[key] > max) {
      throw new Error(`Invalid execution resource limit ${key}: expected integer ${min}..${max}`);
    }
  }
  return limits;
}

// Runs before bwrap and before its executable-release gate. systemd-run --scope
// execs this helper without changing PID/PGID: durable process registration and
// --die-with-parent retain their existing ownership semantics. No polling-based
// resource supervisor, shared-UID RLIMIT_NPROC, or unbounded fallback is used.
const VERIFY_AND_EXEC = String.raw`
import json, os, pathlib, sys
try:
    policy = json.loads(sys.argv[1])
    entries = pathlib.Path('/proc/self/cgroup').read_text().splitlines()
    group = next(line[3:] for line in entries if line.startswith('0::'))
    if not group.startswith('/') or '..' in group.split('/') or group.split('/')[-1] != policy['unit']:
        raise RuntimeError('execution did not enter its unique cgroup')
    root = pathlib.Path('/sys/fs/cgroup' + group)
    def read(name):
        return (root / name).read_text().strip()
    for name, maximum in [('memory.max', policy['memoryBytes']), ('memory.swap.max', 0), ('pids.max', policy['tasks'])]:
        raw = read(name)
        if raw == 'max' or int(raw) > maximum:
            raise RuntimeError(name + ' is not bounded by policy')
    if read('memory.oom.group') != '1':
        raise RuntimeError('whole-execution OOM termination unavailable')
    quota, period = read('cpu.max').split()
    if quota == 'max' or int(quota) * 100 > policy['cpuPercent'] * int(period):
        raise RuntimeError('CPU bandwidth cap unavailable')
    os.execv(sys.argv[2], sys.argv[2:])
except Exception as error:
    print('Resource isolation unavailable: ' + str(error), file=sys.stderr)
    sys.exit(125)
`;

export interface ResourceLimitedLaunch {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  unit: string;
  limits: ExecutionResourceLimits;
}

/** Wrap a *trusted* bwrap argument vector, not an arbitrary unisolated command.
 * Caller must keep PID namespace/die-with-parent, private proc, dropped caps,
 * no host /sys or /run mounts, a secret-free workspace, and its durable stdin
 * release gate. Spawn with detached:true and pipe stdio as before. The returned
 * manager env is host-only; env -i removes bus/runtime access before bwrap.
 * This enforces aggregate RAM/swap/task/CPU-bandwidth caps, inherited hard
 * per-process CPU/fd and per-file size limits, plus a manager wall deadline.
 * Per-file size is NOT an aggregate filesystem/disk quota.
 */
export function resourceLimitedSandbox(
  sandboxArgs: string[],
  childEnv: NodeJS.ProcessEnv,
  overrides: Partial<ExecutionResourceLimits> = {},
): ResourceLimitedLaunch {
  const limits = validatedLimits(overrides);
  const env = managerEnvironment();
  const unit = `awe-exec-${randomUUID()}.scope`;
  const properties = [
    `MemoryMax=${limits.memoryBytes}`, "MemorySwapMax=0", "OOMPolicy=kill",
    `TasksMax=${limits.tasks}`, `CPUQuota=${limits.cpuPercent}%`,
    `RuntimeMaxSec=${limits.wallMs}ms`, "TimeoutStopSec=500ms", "SendSIGKILL=yes",
  ];
  const allowedEnv = new Set(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TERM", "NODE_ENV", "CI", "AWE_DATA_DIR"]);
  const cleanEnv = Object.entries(childEnv).filter(([key, value]) => allowedEnv.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  return {
    executable: "/usr/bin/systemd-run", unit, limits, env,
    args: ["--user", "--scope", "--quiet", "--collect", "--expand-environment=no", `--unit=${unit}`,
      ...properties.map((property) => `--property=${property}`), "--",
      "/usr/bin/python3", "-I", "-c", VERIFY_AND_EXEC, JSON.stringify({ ...limits, unit }),
      "/usr/bin/prlimit", `--cpu=${limits.cpuSeconds}:${limits.cpuSeconds}`,
      `--fsize=${limits.fileBytes}:${limits.fileBytes}`, `--nofile=${limits.openFiles}:${limits.openFiles}`,
      "--core=0:0", "--memlock=0:0", "--",
      "/usr/bin/env", "-i", ...cleanEnv, "/usr/bin/bwrap", ...sandboxArgs],
  };
}
