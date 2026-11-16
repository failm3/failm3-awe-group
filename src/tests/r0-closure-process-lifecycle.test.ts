import assert from "node:assert/strict";
import { after, test } from "node:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r0-process-lifecycle-test-"));
const dataDir = path.join(root, "state");
process.env.AWE_DATA_DIR = dataDir;
const lifecycle = await import("../agents/lifecycle.js");
const processRegistry = await import("../utils/process-registry.js");

const childHelper = path.join(process.cwd(), "src/tests/helpers/r0-closure-process-lifecycle-child.mjs");
const resistantHelper = path.join(process.cwd(), "src/tests/helpers/r0-closure-adapters-resistant-child.mjs");
const loader = path.join(process.cwd(), "node_modules/tsx/dist/loader.mjs");
const fixtures: Fixture[] = [];

interface Fixture {
  id: string;
  workdir: string;
  readyFile: string;
  lateFile: string;
  child: ChildProcessWithoutNullStreams;
  closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
  stdout: () => string;
  stderr: () => string;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, description: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await delay(20);
  }
}

function startFixture(mode: "sigterm" | "orphan" | "fatal" | "checkpoint" | "checkpoint-cancel" | "signal-retry", name: string): Fixture {
  const id = crypto.randomUUID();
  const workdir = path.join(root, name);
  fs.mkdirSync(workdir, { recursive: true });
  const readyFile = path.join(workdir, "ready");
  const lateFile = path.join(workdir, "late-effect");
  const localHelper = path.join(workdir, "resistant-child.mjs");
  fs.copyFileSync(resistantHelper, localHelper);
  const command = [process.execPath, localHelper, readyFile, lateFile, "1400"].map(shellQuote).join(" ");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "NODE_ENV", "AWE_DATA_DIR"].includes(key)
  ));
  const child = spawn(process.execPath, ["--import", loader, childHelper, mode, id, command, workdir, readyFile], {
    cwd: workdir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.once("close", (code, signal) => resolve({ code, signal }))
  );
  const fixture: Fixture = {
    id, workdir, readyFile, lateFile, child, closed,
    stdout: () => stdout,
    stderr: () => stderr,
  };
  fixtures.push(fixture);
  return fixture;
}

function processRecords(id: string): string[] {
  const dir = path.join(dataDir, "process-groups");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.startsWith(`${id.toLowerCase()}--`) && name.endsWith(".json"));
}

async function cleanup(fixture: Fixture): Promise<void> {
  if (fixture.child.exitCode === null && fixture.child.signalCode === null) fixture.child.kill("SIGKILL");
  await fixture.closed;
  const savedRecord = `${fixture.readyFile}.record`;
  const savedRecordPath = `${fixture.readyFile}.record-path`;
  if (fs.existsSync(savedRecord) && fs.existsSync(savedRecordPath)) {
    const destination = fs.readFileSync(savedRecordPath, "utf8").trim();
    const processDir = path.join(dataDir, "process-groups");
    if (destination.startsWith(`${processDir}${path.sep}`) && fs.existsSync(destination)) {
      fs.copyFileSync(savedRecord, destination);
    }
  }
  // This is the same confirmed-dead-owner production reaper, used as a safety
  // net if a failing assertion leaves an isolated fixture group behind.
  await processRegistry.reapOrphanedMissionProcessGroups(fixture.id, { graceMs: 0, timeoutMs: 2000 }).catch(() => {});
  // Compatibility cleanup for a regression to a pre-registry implementation.
  // The PID came only from this fixture's private ready file, never from a real
  // mission or unrelated process record.
  if (fs.existsSync(fixture.readyFile)) {
    const descendantPid = Number(fs.readFileSync(fixture.readyFile, "utf8").trim());
    if (Number.isSafeInteger(descendantPid) && descendantPid > 1) {
      try { process.kill(descendantPid, "SIGKILL"); } catch { /* already gone */ }
    }
  }
}

after(async () => {
  for (const fixture of fixtures.reverse()) await cleanup(fixture);
  fs.rmSync(root, { recursive: true, force: true });
});

test("SIGTERM: real manager waits for a resistant registered group before paused state and lease release", async () => {
  const fixture = startFixture("sigterm", "sigterm");
  try {
    await waitFor(
      () => fixture.stdout().includes("R0_PROCESS_READY") || fixture.child.exitCode !== null,
      "SIGTERM fixture readiness",
    );
    assert.match(fixture.stdout(), /R0_PROCESS_READY/, fixture.stderr());
    assert.equal(fs.existsSync(fixture.lateFile), false);
    fixture.child.kill("SIGTERM");
    const exit = await fixture.closed;
    assert.equal(exit.code, 143, JSON.stringify({ exit, stdout: fixture.stdout(), stderr: fixture.stderr() }));
    const mission = (await import("../utils/storage.js")).loadMission(fixture.id)!;
    assert.equal(mission.status, "paused", JSON.stringify(mission.metadata));
    const checkpoint = lifecycle.loadCheckpoint(fixture.id)!;
    assert.equal(checkpoint.reason, "process_exit");
    assert.equal(lifecycle.readMissionLease(fixture.id), null, "a quiesced signal exit releases its own lease");
    await delay(1500);
    assert.equal(fs.existsSync(fixture.lateFile), false, "no descendant effect can occur after confirmed process exit");
    assert.deepEqual(processRecords(fixture.id), [], "durable process registration was reclaimed");
  } finally {
    await cleanup(fixture);
  }
});

test("orphan recovery: malformed process evidence remains preserved and blocks resumable state", async () => {
  const storage = await import("../utils/storage.js");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  storage.saveMission({
    id,
    title: "Malformed process recovery fixture",
    description: "Offline fail-closed recovery",
    objective: "Never discard orphan process evidence",
    acceptance_criteria: ["Damaged process evidence blocks paused state"],
    status: "running",
    priority: "normal",
    created_at: now,
    updated_at: now,
    artifacts: [],
    metadata: {},
  });
  const deadOwner = spawn(process.execPath, ["-e", ""], { stdio: ["pipe", "pipe", "pipe"] });
  await new Promise<void>((resolve) => deadOwner.once("close", () => resolve()));
  const ownerId = crypto.randomUUID();
  const lease = {
    version: 1,
    mission_id: id,
    owner_id: ownerId,
    pid: deadOwner.pid,
    host: (await import("node:os")).hostname(),
    purpose: "run",
    generation: 1,
    acquired_at: Date.now() - 1000,
    heartbeat_at: Date.now() - 1000,
    expires_at: Date.now() - 100,
    ttl_ms: 100,
  };
  storage.atomicWriteJson(path.join(storage.dataSubdir("leases"), `${id}.json`), lease);
  const launchId = crypto.randomUUID();
  const registryDir = path.join(dataDir, "process-groups");
  fs.mkdirSync(registryDir, { recursive: true });
  const damaged = path.join(registryDir, `${id}--${launchId}.json`);
  const damagedBytes = "{\"version\":1,\"mission_id\":\"wrong\",\"pgid\":1}";
  fs.writeFileSync(damaged, damagedBytes);
  try {
    const report = await Promise.resolve(lifecycle.reconcileOrphanedMissions());
    assert.equal(storage.loadMission(id)!.status, "running", JSON.stringify(report));
    assert.equal(fs.readFileSync(damaged, "utf8"), damagedBytes);
    assert.notEqual(lifecycle.readMissionLease(id)?.owner_id, lease.owner_id, "the dead owner cannot remain an active execution claim");
    assert.equal(lifecycle.tryAcquireMissionLease(id, "resume"), null, "no replacement can enter while malformed evidence is unresolved");
    assert.ok((report as any).blocked?.some((entry: any) => entry.mission_id === id), JSON.stringify(report));
    assert.ok(!report.paused.includes(id) && !report.resumable.includes(id));
  } finally {
    fs.rmSync(damaged, { force: true });
    fs.rmSync(path.join(storage.dataSubdir("leases"), `${id}.json`), { force: true });
  }
});

test("direct cancellation after SIGKILL reaps the orphan before cancelled state", async () => {
  const fixture = startFixture("orphan", "direct-cancel");
  try {
    await waitFor(
      () => fixture.stdout().includes("R0_PROCESS_READY") || fixture.child.exitCode !== null,
      "direct-cancel fixture readiness",
    );
    assert.match(fixture.stdout(), /R0_PROCESS_READY/, fixture.stderr());
    fixture.child.kill("SIGKILL");
    assert.equal((await fixture.closed).signal, "SIGKILL");
    const { cancelMission } = await import("../agents/mission-manager.js");
    const result = await cancelMission(fixture.id, "isolated direct post-SIGKILL cancellation");
    assert.equal(result.cancelled, true, JSON.stringify(result));
    assert.equal(result.quiesced, true, JSON.stringify(result));
    const storage = await import("../utils/storage.js");
    assert.equal(storage.loadMission(fixture.id)!.status, "cancelled");
    assert.deepEqual(processRecords(fixture.id), []);
    await delay(1500);
    assert.equal(fs.existsSync(fixture.lateFile), false, "cancelled state cannot precede a late orphan effect");
    assert.equal(lifecycle.readMissionLease(fixture.id), null);
  } finally {
    await cleanup(fixture);
  }
});

test("SIGKILL: real orphan reconciliation reaps the dead owner's resistant group before publishing paused", async () => {
  const fixture = startFixture("orphan", "orphan");
  let reconciled = false;
  try {
    await waitFor(
      () => fixture.stdout().includes("R0_PROCESS_READY") || fixture.child.exitCode !== null,
      "orphan fixture readiness",
    );
    assert.match(fixture.stdout(), /R0_PROCESS_READY/, fixture.stderr());
    assert.equal(processRecords(fixture.id).length, 1, "the active process group was durable before owner death");
    const overlapFile = path.join(fixture.workdir, "replacement-overlap");
    fixture.child.kill("SIGKILL");
    const exit = await fixture.closed;
    assert.equal(exit.signal, "SIGKILL");
    const storage = await import("../utils/storage.js");
    assert.equal(storage.loadMission(fixture.id)!.status, "running", "hard death itself cannot publish clean state");
    const gateFile = path.join(fixture.workdir, "contender-go");
    const contender = spawn(process.execPath, [
      "--import", loader,
      path.join(process.cwd(), "src/tests/helpers/r0-closure-recovery-contender.mjs"),
      fixture.id, overlapFile, gateFile,
    ], {
      cwd: fixture.workdir,
      env: { PATH: process.env.PATH, AWE_DATA_DIR: dataDir },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let contenderError = "", contenderOutput = "";
    contender.stderr.on("data", (chunk) => { contenderError += chunk.toString(); });
    contender.stdout.on("data", (chunk) => { contenderOutput += chunk.toString(); });
    const contenderClosed = new Promise<number | null>((resolve) => contender.once("close", (code) => resolve(code)));
    await waitFor(() => contenderOutput.includes("READY"), "preloaded recovery contender readiness");
    fs.writeFileSync(gateFile, "go");
    const recovery = lifecycle.reconcileOrphanedMissions();
    const report = await recovery;
    reconciled = true;
    assert.equal(storage.loadMission(fixture.id)!.status, "paused", JSON.stringify(report));
    assert.ok(report.paused.includes(fixture.id), JSON.stringify(report));
    assert.equal(await contenderClosed, 0, `${contenderError}\n${contenderOutput}`);
    assert.match(contenderOutput, /RECOVERY_COMPLETED_WITHOUT_OVERLAP|ACQUIRED_AFTER_PAUSED/);
    assert.equal(fs.existsSync(overlapFile), false, "replacement acquisition was denied throughout active orphan reaping");
    await delay(1500);
    assert.equal(fs.existsSync(fixture.lateFile), false, "orphan recovery prevents the scheduled late effect");
    assert.deepEqual(processRecords(fixture.id), [], JSON.stringify({ report, records: processRecords(fixture.id).map((name) => fs.readFileSync(path.join(dataDir, "process-groups", name), "utf8")) }));
    const nextOwner = lifecycle.tryAcquireMissionLease(fixture.id, "resume");
    assert.ok(nextOwner, "recovery leaves the mission available only after actual quiescence");
    nextOwner?.release();
  } finally {
    if (!reconciled) await Promise.resolve().then(() => lifecycle.reconcileOrphanedMissions()).catch(() => {});
    await cleanup(fixture);
  }
});

test("terminal-plus-live evidence reopens under retained cancellation ownership", async () => {
  const fixture = startFixture("orphan", "terminal-quiescence");
  const foreignOwner = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: ["pipe", "pipe", "pipe"] });
  const { cancelMission } = await import("../agents/mission-manager.js");
  try {
    await waitFor(() => fixture.stdout().includes("R0_PROCESS_READY"), "terminal fixture readiness");
    const storage = await import("../utils/storage.js");
    storage.updateMissionAtomic(fixture.id, () => ({ status: "failed" }));

    // Keep the real descendant alive but attribute its record to a separate
    // live owner. Killing the fixture manager leaves no manager to forward to,
    // and the foreign-owner safety check must refuse to kill that descendant.
    const recordName = processRecords(fixture.id)[0];
    const recordPath = path.join(dataDir, "process-groups", recordName);
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    const ownerStat = fs.readFileSync(`/proc/${foreignOwner.pid}/stat`, "utf8");
    const ownerRest = ownerStat.slice(ownerStat.lastIndexOf(")") + 1).trim().split(/\s+/);
    record.owner_pid = foreignOwner.pid;
    record.owner_start_ticks = ownerRest[19];
    fs.writeFileSync(recordPath, JSON.stringify(record));
    fixture.child.kill("SIGKILL");
    assert.equal((await fixture.closed).signal, "SIGKILL");

    const first = await cancelMission(fixture.id, "terminal status must not hide foreign-live processes", { waitMs: 1000 });
    assert.equal(first.quiesced, false, JSON.stringify(first));
    assert.equal(first.cancelled, false);
    assert.equal(first.pending_operations, 1);
    assert.equal(first.status, "running", "unresolved terminal evidence is explicitly reopened for recovery");
    assert.equal(processRecords(fixture.id).length, 1, "unresolved evidence remains preserved");
    const retained = lifecycle.readMissionLease(fixture.id);
    assert.equal(retained?.purpose, "cancel", "blocked direct cancellation retains durable ownership");

    const second = await cancelMission(fixture.id, "retry must reuse retained ownership", { waitMs: 1000 });
    assert.equal(second.quiesced, false, JSON.stringify(second));
    assert.equal(lifecycle.readMissionLease(fixture.id)?.owner_id, retained?.owner_id);
    assert.equal(storage.loadMission(fixture.id)!.status, "running");
  } finally {
    if (foreignOwner.exitCode === null && foreignOwner.signalCode === null) foreignOwner.kill("SIGKILL");
    await new Promise<void>((resolve) => {
      if (foreignOwner.exitCode !== null || foreignOwner.signalCode !== null) resolve();
      else foreignOwner.once("close", () => resolve());
    });
    // Once the foreign owner is confirmed dead, the same direct recovery path
    // reaps the group, restores the original terminal outcome and releases.
    await cancelMission(fixture.id, "settle isolated terminal recovery fixture", { waitMs: 2000 }).catch(() => {});
    await cleanup(fixture);
  }
});

function restoreDamagedProcessRecord(fixture: Fixture): void {
  const savedRecord = `${fixture.readyFile}.record`;
  const savedRecordPath = `${fixture.readyFile}.record-path`;
  assert.ok(fs.existsSync(savedRecord) && fs.existsSync(savedRecordPath), "fixture saved its original process identity");
  const destination = fs.readFileSync(savedRecordPath, "utf8").trim();
  assert.ok(destination.startsWith(`${path.join(dataDir, "process-groups")}${path.sep}`));
  fs.copyFileSync(savedRecord, destination);
}

async function verifyFailedQuiescenceBlocksFinalization(mode: "fatal" | "checkpoint"): Promise<void> {
  const fixture = startFixture(mode, mode);
  try {
    await waitFor(
      () => fixture.stdout().includes("R0_PROCESS_RESULT") || fixture.child.exitCode !== null,
      `${mode} fixture nonterminal result`,
    );
    assert.match(fixture.stdout(), /R0_PROCESS_RESULT running/, fixture.stderr());
    const storage = await import("../utils/storage.js");
    assert.equal(storage.loadMission(fixture.id)!.status, "running");
    assert.ok(lifecycle.readMissionLease(fixture.id), "failed quiescence retains lease evidence");
    assert.equal(processRecords(fixture.id).length, 1, "failed quiescence retains process evidence");
    const checkpointPath = path.join(storage.dataSubdir("checkpoints"), `${fixture.id}.json`);
    if (mode === "checkpoint") {
      assert.equal(fs.readFileSync(checkpointPath, "utf8"), "{damaged-checkpoint");
      assert.equal(storage.loadMission(fixture.id)!.metadata?.recovery_blocked, undefined, "damaged checkpoint evidence is not converted into resumable state while processes survive");
    }

    // Remove only the transient identity blocker. The retained manager must
    // retry automatically, quiesce the real descendant, then publish outcome.
    restoreDamagedProcessRecord(fixture);
    // This fixture's specialist fails after an explicit effect marker. It is
    // recoverable rather than terminally failed, but only after settlement.
    const expected = "paused";
    // Publication and the subsequent lease release are separate durable events.
    // Wait for both instead of sampling ownership inside that valid interval.
    await waitFor(
      () => storage.loadMission(fixture.id)!.status === expected &&
        processRecords(fixture.id).length === 0 && lifecycle.readMissionLease(fixture.id) === null,
      `${mode} deferred settlement, process reclamation, publication and lease release`,
      10000,
    );
    assert.equal(processRecords(fixture.id).length, 0, "the deferred retry reclaimed the real process group");
    assert.equal(lifecycle.readMissionLease(fixture.id), null, "ownership releases only after settlement and publication");
    if (mode === "checkpoint") {
      assert.equal(fs.readFileSync(checkpointPath, "utf8"), "{damaged-checkpoint", "automatic recovery preserves damaged checkpoint bytes");
      assert.equal((storage.loadMission(fixture.id)!.metadata?.recovery_blocked as any)?.kind, "checkpoint_integrity");
    }
    await delay(1500);
    assert.equal(fs.existsSync(fixture.lateFile), false, "the deferred retry stopped the scheduled late effect");
    assert.equal(storage.loadMission(fixture.id)!.status, expected);
  } finally {
    await cleanup(fixture);
    assert.deepEqual(processRecords(fixture.id), [], "isolated descendant cleanup restored identity and reaped the group");
  }
}

test("fatal failure retains ownership and automatically retries transient process settlement", async () => {
  await verifyFailedQuiescenceBlocksFinalization("fatal");
});

test("checkpoint integrity retains damaged bytes and automatically retries transient process settlement", async () => {
  await verifyFailedQuiescenceBlocksFinalization("checkpoint");
});

test("explicit cancellation after checkpoint damage preserves exact bytes through quiescence", async () => {
  const fixture = startFixture("checkpoint-cancel", "checkpoint-cancel");
  try {
    await waitFor(
      () => fixture.stdout().includes("R0_PROCESS_RESULT") || fixture.child.exitCode !== null,
      "checkpoint cancellation fixture nonterminal result",
    );
    assert.match(fixture.stdout(), /R0_PROCESS_RESULT running/, fixture.stderr());
    const storage = await import("../utils/storage.js");
    const checkpointPath = path.join(storage.dataSubdir("checkpoints"), `${fixture.id}.json`);
    assert.equal(fs.readFileSync(checkpointPath, "utf8"), "{damaged-checkpoint");
    assert.ok(lifecycle.readMissionLease(fixture.id));

    const { cancelMission } = await import("../agents/mission-manager.js");
    const cancellation = cancelMission(fixture.id, "cancel while preserving damaged checkpoint", { waitMs: 8000 });
    await delay(250);
    restoreDamagedProcessRecord(fixture);
    const result = await cancellation;
    assert.equal(result.cancelled, true, JSON.stringify(result));
    assert.equal(result.quiesced, true, JSON.stringify(result));
    assert.equal(storage.loadMission(fixture.id)!.status, "cancelled");
    assert.equal(fs.readFileSync(checkpointPath, "utf8"), "{damaged-checkpoint", "cancellation must not replace damaged checkpoint evidence");
    assert.equal(lifecycle.readMissionLease(fixture.id), null);
    assert.deepEqual(processRecords(fixture.id), []);
    await delay(1500);
    assert.equal(fs.existsSync(fixture.lateFile), false);
  } finally {
    await cleanup(fixture);
  }
});

test("repeated SIGTERM retries transient failed quiescence without uninstalling handlers", async () => {
  const fixture = startFixture("signal-retry", "signal-retry");
  try {
    await waitFor(
      () => fixture.stdout().includes("R0_PROCESS_READY") || fixture.child.exitCode !== null,
      "signal-retry fixture readiness",
    );
    fixture.child.kill("SIGTERM");
    await delay(250);
    assert.equal(fixture.child.exitCode, null);
    assert.equal(fixture.child.signalCode, null);
    assert.doesNotMatch(fixture.stdout(), /R0_PROCESS_RESULT/, "run stays pending and handlers stay installed");
    const storage = await import("../utils/storage.js");
    assert.equal(storage.loadMission(fixture.id)!.status, "running");
    assert.ok(lifecycle.readMissionLease(fixture.id));
    fixture.child.kill("SIGTERM");
    const exit = await Promise.race([
      fixture.closed,
      delay(10000).then(() => { throw new Error(`retried signal did not settle: ${fixture.stdout()} ${fixture.stderr()}`); }),
    ]);
    assert.equal(exit.code, 143, JSON.stringify({ exit, stdout: fixture.stdout(), stderr: fixture.stderr() }));
    assert.match(fixture.stdout(), /R0_PROCESS_RESULT paused/);
    assert.equal(storage.loadMission(fixture.id)!.status, "paused");
    assert.equal(lifecycle.readMissionLease(fixture.id), null);
  } finally {
    await cleanup(fixture);
  }
});
