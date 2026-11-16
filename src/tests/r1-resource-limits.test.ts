import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  inspectResourceIsolation, resourceLimitedSandbox, type ExecutionResourceLimits,
} from "../security/resource-limits.js";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r1-resource-test-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));

// A small genuine bubblewrap filesystem: no host data, home, /run, or /sys.
// Work contains only files made by this suite. No product state import.
function sandbox(command: string[]): string[] {
  const args = ["--unshare-pid", "--die-with-parent", "--unshare-net", "--unshare-ipc", "--unshare-uts", "--cap-drop", "ALL"];
  for (const dir of ["/usr", "/bin", "/sbin", "/lib", "/lib64"]) {
    if (fs.existsSync(dir)) args.push("--ro-bind", dir, dir);
  }
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--bind", root, "/work", "--chdir", "/work",
    "--", "/bin/sh", "-c", 'IFS= read -r permit && [ "$permit" = released ] || exit 125; exec "$@"', "gate", ...command);
  return args;
}

function start(command: string[], limits: Partial<ExecutionResourceLimits> = {}, release = true, badBus = false, omitMemoryCap = false) {
  const launch = resourceLimitedSandbox(sandbox(command), {
    PATH: "/usr/bin:/bin", HOME: "/tmp", TEST_SECRET: "never-forward-this", NODE_OPTIONS: "--invalid",
    XDG_RUNTIME_DIR: "/run/user/1000", DBUS_SESSION_BUS_ADDRESS: "never-forward-this",
  }, { memoryBytes: 64 * 1024 * 1024, tasks: 8, cpuSeconds: 3, wallMs: 5000, ...limits });
  if (badBus) {
    launch.env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${root}/absent-bus`;
    launch.env.XDG_RUNTIME_DIR = path.join(root, "absent-runtime");
  }
  if (omitMemoryCap) launch.args = launch.args.filter((arg) => !arg.startsWith("--property=MemoryMax="));
  const child = spawn(launch.executable, launch.args, { env: launch.env, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  child.stdin.on("error", () => {});
  const watchdog = setTimeout(() => { try { process.kill(-child.pid!, "SIGKILL"); } catch {} }, 10_000);
  const closed = new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => { clearTimeout(watchdog); resolve({ code, signal, stdout, stderr }); });
  });
  if (release) child.stdin.end("released\n");
  return { child, closed, launch, stdout: () => stdout };
}

const python = (code: string) => ["/usr/bin/python3", "-I", "-c", code];

test("read-only capability discovery requires real delegated CPU, memory and pids", () => {
  const probe = inspectResourceIsolation();
  assert.equal(probe.supported, true, JSON.stringify(probe));
});

test("positive: real Node coding work writes artifact with bounded resources and scrubbed environment", async () => {
  const fixture = start(["/usr/bin/node", "-e", `
    const fs = require('fs');
    if (process.env.TEST_SECRET || process.env.NODE_OPTIONS || process.env.XDG_RUNTIME_DIR || process.env.DBUS_SESSION_BUS_ADDRESS) process.exit(3);
    fs.writeFileSync('/work/answer.json', JSON.stringify({answer: [1,2,3].reduce((a,b)=>a+b,0)}));
    console.log('coding-ok');
  `], { memoryBytes: 256 * 1024 * 1024, tasks: 24 });
  const result = await fixture.closed;
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.match(result.stdout, /coding-ok/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "answer.json"), "utf8")), { answer: 6 });
});

test("gate retains original detached PID/PGID, enforces actual cgroup files, and EOF denies effects", async () => {
  const fixture = start(python("open('/work/unreleased','w').write('bad')"), {}, false);
  try {
    const deadline = Date.now() + 3000;
    let group = "";
    while (Date.now() < deadline) {
      try { group = fs.readFileSync(`/proc/${fixture.child.pid}/cgroup`, "utf8").trim().slice(3); } catch {}
      if (group.endsWith(fixture.launch.unit)) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(group.endsWith(fixture.launch.unit), group);
    const dir = path.join("/sys/fs/cgroup", group);
    assert.equal(fs.readFileSync(path.join(dir, "memory.max"), "utf8").trim(), "67108864");
    assert.equal(fs.readFileSync(path.join(dir, "memory.swap.max"), "utf8").trim(), "0");
    assert.equal(fs.readFileSync(path.join(dir, "pids.max"), "utf8").trim(), "8");
    assert.equal(fs.readFileSync(path.join(dir, "cpu.max"), "utf8").trim(), "100000 100000");
    const stat = fs.readFileSync(`/proc/${fixture.child.pid}/stat`, "utf8");
    assert.equal(Number(stat.slice(stat.lastIndexOf(")") + 1).trim().split(/\s+/)[2]), fixture.child.pid);
    fixture.child.stdin.end();
    assert.equal((await fixture.closed).code, 125);
    assert.equal(fs.existsSync(path.join(root, "unreleased")), false);
  } finally {
    fixture.child.stdin.end();
    await fixture.closed;
  }
});

test("negative: 64MiB aggregate memory cap terminates a bounded 96MiB allocation", async () => {
  const result = await start(python("x=bytearray(96*1024*1024); print('allocation-escaped', flush=True)")).closed;
  assert.ok(result.code !== 0 || result.signal, JSON.stringify(result));
  assert.doesNotMatch(result.stdout, /allocation-escaped/);
});

test("negative: aggregate memory cap includes a setsid descendant, not only the root worker", async () => {
  const result = await start(python(`
import os, time
x=bytearray(24*1024*1024)
pid=os.fork()
if pid == 0:
    os.setsid()
    y=bytearray(48*1024*1024)
    open('/work/aggregate-memory-escaped','w').write('bad')
    os._exit(0)
os.waitpid(pid,0)
`)).closed;
  assert.ok(result.code !== 0 || result.signal, JSON.stringify(result));
  assert.equal(fs.existsSync(path.join(root, "aggregate-memory-escaped")), false);
});

test("negative: per-execution tasks cap rejects fork with at most twelve attempts", async () => {
  const result = await start(python(`
import os, errno, signal, time
children=[]
try:
    for attempt in range(12):
        try:
            pid=os.fork()
        except OSError as error:
            assert error.errno == errno.EAGAIN
            print('tasks-denied', len(children), flush=True)
            break
        if pid == 0:
            time.sleep(4)
            os._exit(0)
        children.append(pid)
    else:
        raise RuntimeError('task cap escaped')
finally:
    for pid in children:
        os.kill(pid, signal.SIGKILL)
    for pid in children:
        os.waitpid(pid, 0)
`)).closed;
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.match(result.stdout, /tasks-denied [1-7]/);
});

test("negative: hard per-file limit rejects a two-KiB write at one KiB", async () => {
  const result = await start(python(`
import os, errno, resource
assert resource.getrlimit(resource.RLIMIT_FSIZE) == (1024,1024)
try:
    with open('/work/bounded-file','wb',buffering=0) as f:
        f.write(b'x'*2048)
        f.write(b'y')
    raise RuntimeError('file cap escaped')
except OSError as error:
    assert error.errno == errno.EFBIG
    print('file-denied')
`), { fileBytes: 1024 }).closed;
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.match(result.stdout, /file-denied/);
  assert.equal(fs.statSync(path.join(root, "bounded-file")).size, 1024);
});

test("negative: hard descriptor cap denies bounded open attempts and cannot be raised", async () => {
  const result = await start(python(`
import os, errno, resource
assert resource.getrlimit(resource.RLIMIT_NOFILE) == (32,32)
try:
    resource.setrlimit(resource.RLIMIT_NOFILE,(64,64))
    raise RuntimeError('hard limit raised')
except ValueError:
    pass
handles=[]
try:
    for attempt in range(40): handles.append(os.open('/dev/null',os.O_RDONLY))
    raise RuntimeError('fd cap escaped')
except OSError as error:
    assert error.errno == errno.EMFILE
    print('fd-denied')
finally:
    for fd in handles: os.close(fd)
`), { openFiles: 32 }).closed;
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.match(result.stdout, /fd-denied/);
});

test("negative: inherited one-second hard CPU limit kills a real worker", async () => {
  const result = await start(python("import resource; assert resource.getrlimit(resource.RLIMIT_CPU)==(1,1)\nwhile True: pass"), { cpuSeconds: 1, wallMs: 4000 }).closed;
  assert.ok(result.code !== 0 || result.signal, JSON.stringify(result));
});

test("negative: manager wall deadline ends sleeping execution without parent cancellation", async () => {
  const started = Date.now();
  const result = await start(python("import time; time.sleep(3); open('/work/late-effect','w').write('bad')"), { wallMs: 300 }).closed;
  assert.ok(result.code !== 0 || result.signal, JSON.stringify(result));
  assert.ok(Date.now() - started < 2500, "manager independently enforces deadline");
  assert.equal(fs.existsSync(path.join(root, "late-effect")), false);
});

test("negative: unavailable manager fails closed before command effects", async () => {
  const result = await start(python("open('/work/manager-fallback','w').write('bad')"), {}, true, true).closed;
  assert.notEqual(result.code, 0, JSON.stringify(result));
  assert.equal(fs.existsSync(path.join(root, "manager-fallback")), false);
  assert.match(result.stderr, /Failed to connect|No such file/);
});

test("negative: actual unbounded cgroup is rejected before the release-gated command", async () => {
  const result = await start(python("open('/work/unbounded-fallback','w').write('bad')"), {}, true, false, true).closed;
  assert.equal(result.code, 125, JSON.stringify(result));
  assert.match(result.stderr, /memory.max is not bounded by policy/);
  assert.equal(fs.existsSync(path.join(root, "unbounded-fallback")), false);
});

test("invalid policy is rejected before any launch", () => {
  for (const limits of [{ tasks: 0 }, { wallMs: Infinity }, { memoryBytes: NaN }, { openFiles: 1.5 }]) {
    assert.throws(() => resourceLimitedSandbox(sandbox(["/usr/bin/true"]), {}, limits), /Invalid execution resource limit/);
  }
});
