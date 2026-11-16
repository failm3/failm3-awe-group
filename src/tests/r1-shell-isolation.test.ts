import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { shellSandboxArgs } from "../security/shell-sandbox.js";

test("real sandbox excludes synthetic sibling, shared state, credentials, sockets and egress", () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), ".r1-isolation-"));
  try {
    const work = path.join(fixture, "mission");
    const state = path.join(fixture, "state");
    fs.mkdirSync(work); fs.mkdirSync(state);
    fs.writeFileSync(path.join(fixture, "host-secret"), "synthetic-host-secret");
    fs.writeFileSync(path.join(state, "memory.db"), "synthetic-runtime-state");
    fs.writeFileSync(path.join(work, ".env.production.local"), "synthetic-key");
    fs.mkdirSync(path.join(work, "nested"));
    fs.writeFileSync(path.join(work, "nested", ".netrc"), "synthetic-credential");
    fs.symlinkSync(path.join(fixture, "host-secret"), path.join(work, "escape"));
    const script = `
      const fs = require('fs'), net = require('net');
      const must = (v, msg) => { if (!v) throw Error(msg); };
      for (const p of ${JSON.stringify([path.join(fixture, "host-secret"), path.join(state, "memory.db"), path.join(work, "escape"), "/run", "/var/run"])}) {
        must(!fs.existsSync(p), 'exposed host path: ' + p);
      }
      for (const p of ['.env.production.local', 'nested/.netrc']) {
        let bytes;
        try { bytes = fs.readFileSync(p); } catch (e) { must(['EACCES', 'ENOENT'].includes(e.code), e.message); }
        must(!bytes || bytes.length === 0, 'credential leak');
      }
      fs.writeFileSync('output.txt', 'mission output');
      const socket = net.connect({host:'127.0.0.1',port:8871});
      socket.on('connect', () => { throw Error('host network exposed'); });
      socket.on('error', () => console.log('isolated'));
      socket.setTimeout(1000, () => { socket.destroy(); console.log('isolated'); });
    `;
    const result = spawnSync("bwrap", ["--unshare-pid", "--die-with-parent",
      ...shellSandboxArgs({ workdir: work, dataDir: state }, work),
      "--proc", "/proc", "--dev", "/dev", "--chdir", work, "--", process.execPath, "-e", script,
    ], { encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin" } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /isolated/);
    assert.equal(fs.readFileSync(path.join(work, "output.txt"), "utf8"), "mission output");
    assert.equal(fs.readFileSync(path.join(state, "memory.db"), "utf8"), "synthetic-runtime-state");
    assert.equal(fs.readFileSync(path.join(work, ".env.production.local"), "utf8"), "synthetic-key");
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test("linked-worktree .git file is masked without exposing its control state", () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), ".r1-linked-worktree-"));
  try {
    const control = path.join(fixture, "control");
    fs.mkdirSync(control);
    fs.writeFileSync(path.join(control, "HEAD"), "synthetic-control-state\n");
    fs.writeFileSync(path.join(fixture, ".git"), `gitdir: ${control}\n`);
    const probe = spawnSync("bwrap", ["--unshare-pid", "--die-with-parent",
      ...shellSandboxArgs({ workdir: fixture }, fixture), "--proc", "/proc", "--dev", "/dev",
      "--chdir", fixture, "--", "/bin/bash", "-c", `
        test -f .git
        test ! -s .git
        test ! -e control
        ! printf forbidden > .git
        printf verified > output.txt
      `,
    ], { encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin" } });
    assert.equal(probe.status, 0, probe.stderr);
    assert.equal(fs.readFileSync(path.join(control, "HEAD"), "utf8"), "synthetic-control-state\n");
    assert.match(fs.readFileSync(path.join(fixture, ".git"), "utf8"), /^gitdir:/);
    assert.equal(fs.readFileSync(path.join(fixture, "output.txt"), "utf8"), "verified");
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test("production shell grant writes its own artifact and denies another mission", async () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), ".r1-tool-isolation-"));
  const oldData = process.env.AWE_DATA_DIR;
  process.env.AWE_DATA_DIR = path.join(fixture, "state");
  try {
    const { prepareMissionWorkspace } = await import("../utils/storage.js");
    const { shellTool, fileReadTool } = await import("../tools/index.js");
    const { runWithToolContext } = await import("../security/tool-context.js");
    const own = prepareMissionWorkspace("owner");
    const other = prepareMissionWorkspace("other");
    const sentinel = path.join(other, "private.txt");
    fs.writeFileSync(sentinel, "synthetic other mission");
    const context = { missionId: "owner", workspaceRoot: own, allowedTools: new Set(["shell", "file_read"]) };
    const result = await runWithToolContext(context, () => shellTool.execute!({
      command: `test ! -e '${sentinel}' && printf verified > result.txt`, cwd: own, timeout_ms: 5000,
    } as never, {} as never)) as { success: boolean; stderr: string };
    assert.equal(result.success, true, result.stderr);
    assert.equal(fs.readFileSync(path.join(own, "result.txt"), "utf8"), "verified");
    const denied = await runWithToolContext(context, () => fileReadTool.execute!({ path: sentinel } as never, {} as never)) as { success: boolean };
    assert.equal(denied.success, false);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "synthetic other mission");
  } finally {
    if (oldData === undefined) delete process.env.AWE_DATA_DIR; else process.env.AWE_DATA_DIR = oldData;
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test("confined actor cannot rename an opened grant into an unmounted host directory", () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), ".r1-rename-isolation-"));
  try {
    const work = path.join(fixture, "work");
    fs.mkdirSync(path.join(work, "nested"), { recursive: true });
    const file = path.join(work, "nested", "original");
    fs.writeFileSync(file, "unchanged");
    const script = `
      const fs = require('fs');
      const fd = fs.openSync(${JSON.stringify(path.join(work, "nested"))}, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      try {
        fs.renameSync(${JSON.stringify(path.join(work, "nested"))}, ${JSON.stringify(path.join(fixture, "escaped"))});
        throw Error('cross-grant rename should be unavailable');
      } catch (error) {
        if (!['ENOENT','EACCES','EPERM','EXDEV'].includes(error.code)) throw error;
      }
      if (fs.readFileSync('/proc/self/fd/' + fd + '/original', 'utf8') !== 'unchanged') process.exit(3);
      fs.closeSync(fd);
    `;
    const result = spawnSync("bwrap", ["--unshare-pid", "--die-with-parent",
      ...shellSandboxArgs({ workdir: work }, work), "--proc", "/proc", "--dev", "/dev",
      "--chdir", work, "--", process.execPath, "-e", script,
    ], { encoding: "utf8", timeout: 5000, env: { PATH: "/usr/bin:/bin" } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(fixture, "escaped")), false);
    assert.equal(fs.readFileSync(file, "utf8"), "unchanged");
  } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
});

test("production shell renders with the read-only browser cache without exposing control state", async () => {
  const { prepareMissionWorkspace } = await import("../utils/storage.js");
  const { shellTool, artifactTool, fileWriteTool } = await import("../tools/index.js");
  const { runWithToolContext } = await import("../security/tool-context.js");
  const work = prepareMissionWorkspace("browser-render-owner");
  try {
    const html = path.join(work, "probe.html");
    const png = path.join(work, "probe.png");
    fs.writeFileSync(html, "<h1>verified browser</h1>");
    const result = await runWithToolContext({ missionId: "browser-render-owner", workspaceRoot: work,
      allowedTools: new Set(["shell"]) }, () => shellTool.execute!({
        command: `${process.execPath} ${path.join(process.cwd(), "scripts/browser-screenshot.cjs")} file://${html} ${png}`,
        cwd: work, timeout_ms: 30_000,
      } as never, {} as never)) as { success: boolean; stderr: string };
    assert.equal(result.success, true, result.stderr);
    const bytes = fs.readFileSync(png);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 1280);
    assert.equal(bytes.readUInt32BE(20), 720);
    const denied = await runWithToolContext({ missionId: "browser-render-owner", workspaceRoot: work,
      allowedTools: new Set(["save_artifact", "file_write"]) }, async () => [
        await artifactTool.execute!({ mission_id: "browser-render-owner", name: "probe.png", content: png } as never, {} as never),
        await fileWriteTool.execute!({ path: png, content: "not a PNG" } as never, {} as never),
      ]) as Array<{ success: boolean }>;
    assert.deepEqual(denied.map((entry) => entry.success), [false, false]);
    assert.deepEqual(fs.readFileSync(png), bytes);
    const probe = spawnSync("bwrap", ["--unshare-pid", "--die-with-parent",
      ...shellSandboxArgs({ workdir: work, runtimeRoot: process.cwd() }, work),
      "--proc", "/proc", "--dev", "/dev", "--chdir", work, "--", "/bin/bash", "-c", `
        test -f ${process.cwd()}/scripts/browser-screenshot.cjs
        test ! -e ${process.cwd()}/scripts/awe-screenshot.sh
        test ! -e ${process.cwd()}/package.json
        test ! -e ${process.cwd()}/src
        test ! -e ${process.cwd()}/.oc-isolated/state
        test ! -e ${process.cwd()}/.oc-isolated/config
        test ! -e ${process.cwd()}/.oc-isolated/data
        ! touch ${process.cwd()}/.oc-isolated/cache/ms-playwright/denied
        touch ${work}/writable-mission
      `,
    ], { encoding: "utf8", timeout: 30_000, env: { PATH: "/usr/bin:/bin" } });
    assert.equal(probe.status, 0, probe.stderr);
  } finally { fs.rmSync(work, { recursive: true, force: true }); }
});

test("pre-spawn resource-construction failure removes durable launching evidence", async () => {
  const { prepareMissionWorkspace, DATA_DIR } = await import("../utils/storage.js");
  const { shellTool } = await import("../tools/index.js");
  const { runWithToolContext } = await import("../security/tool-context.js");
  const { reapOrphanedMissionProcessGroups } = await import("../utils/process-registry.js");
  const workspace = prepareMissionWorkspace("launch-cleanup");
  const original = process.getuid;
  try {
    // Deterministically fail resource-launch construction AFTER durable prepare.
    // No manager reconfiguration or executable release is involved.
    (process as unknown as { getuid?: () => number }).getuid = undefined;
    const result = await runWithToolContext({ missionId: "launch-cleanup", workspaceRoot: workspace,
      allowedTools: new Set(["shell"]) }, () => shellTool.execute!({
        command: "printf forbidden > never-started", cwd: workspace, timeout_ms: 1500.5,
      } as never, {} as never)) as { success: boolean; stderr: string };
    assert.equal(result.success, false);
    assert.match(result.stderr, /Resource isolation/);
    assert.equal(fs.existsSync(path.join(workspace, "never-started")), false);
    assert.equal(fs.existsSync(path.join(DATA_DIR, "process-groups", "launch-cleanup")), false);
    const recovery = await reapOrphanedMissionProcessGroups("launch-cleanup");
    assert.deepEqual(recovery, { quiesced: true, reclaimed: [], blocked: [] });
  } finally { (process as unknown as { getuid?: () => number }).getuid = original; }
});
