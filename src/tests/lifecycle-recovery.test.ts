/**
 * E1-RECOVERY-HOTFIX-01 — regression tests for mission recovery.
 *
 * Reproduces the failure of mission `d2d08e60-023d-4463-b668-58f2d9fda757`:
 * the CLI process was terminated while a delegation was still running, so the
 * mission record stayed `running` forever and no checkpoint or artifact was
 * ever written.
 *
 * The failure was caused by three gaps that these tests pin down:
 *   1. no SIGINT/SIGTERM handler persisted progress before exit;
 *   2. the first checkpoint was written only AFTER the first batch returned;
 *   3. the mission deadline timer was `unref`'d, so an otherwise idle event
 *      loop let the process exit without the budget ever firing.
 *
 * Every test runs in a child process with its own DATA_DIR (process.cwd()),
 * so the real `.awe-data/` is never touched. No LLM calls are made.
 *
 * Run: npx tsx src/tests/lifecycle-recovery.test.ts
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import type { Mission } from "../types/index.js";
import { APPROVED_SPEC_BINDING_KEY, assertApprovedSpecBinding, createApprovedSpecBinding } from "../utils/spec-binding.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/** A temp working directory; the child's DATA_DIR resolves to <dir>/.awe-data. */
function tempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "awe-recovery-"));
  fs.mkdirSync(path.join(dir, ".awe-data/missions"), { recursive: true });
  return dir;
}

function writeMission(dir: string, id: string): void {
  const mission: Mission = {
    id,
    title: "recovery test",
    description: "recovery test",
    objective: "recovery test",
    acceptance_criteria: ["a"],
    status: "pending_approval",
    priority: "normal",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    artifacts: [],
    metadata: {
      specification: {
        title: "recovery test",
        objective: "recovery test",
        scope: "Synthetic offline recovery fixture; no external effects or live model calls.",
        acceptance_criteria: ["a"],
        suggested_tools: [],
        suggested_agents: [],
        estimated_complexity: "trivial",
        risks: ["The test deliberately terminates the execution process."],
      },
    },
  };
  // Simulate explicit approval before the interrupted running state. Recovery
  // must consume a real binding rather than manufacture one from status.
  mission.metadata[APPROVED_SPEC_BINDING_KEY] = createApprovedSpecBinding(mission);
  mission.metadata.mission_admission = {
    version: 1, mode: "engineering-practice", missionId: mission.id,
    specHash: assertApprovedSpecBinding(mission).spec_hash,
  };
  mission.status = "running";
  fs.writeFileSync(path.join(dir, ".awe-data/missions", `${id}.json`), JSON.stringify(mission, null, 2));
}

interface ChildRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** Run a tsx snippet in a child process with cwd = dir. */
function runChild(
  dir: string,
  code: string,
  opts: { waitForStdout?: string; killSignal?: NodeJS.Signals; killDelayMs?: number; timeoutMs?: number } = {}
): Promise<ChildRun> {
  return new Promise((resolve) => {
    // Write the snippet to a .mts file: ESM supports static imports and top-level await (tsx -e is CJS).
    const script = path.join(dir, "child.mts");
    fs.writeFileSync(script, code);
    const child = spawn(TSX, [script], {
      cwd: dir,
      env: { ...process.env, AWE_DATA_DIR: path.join(dir, ".awe-data") },
    });
    let stdout = "";
    let stderr = "";
    let killed = false;
    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (!killed && opts.waitForStdout && stdout.includes(opts.waitForStdout)) {
        killed = true;
        setTimeout(() => child.kill(opts.killSignal ?? "SIGTERM"), opts.killDelayMs ?? 0);
      }
    });
    child.stderr.on("data", (d) => (stderr += d.toString()));
    // Safety net: never let a hung child stall the suite.
    const guard = setTimeout(() => {
      if (!killed) child.kill("SIGKILL");
    }, opts.timeoutMs ?? 60000);
    child.on("exit", (code, signal) => {
      clearTimeout(guard);
      if (code !== 0 && code !== 143 && stderr) console.log(`    [child stderr] ${stderr.slice(0, 600).replace(/\n/g, "\n    ")}`);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function readCheckpoint(dir: string, id: string): any {
  const file = path.join(dir, ".awe-data/checkpoints", `${id}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function readMission(dir: string, id: string): any {
  const file = path.join(dir, ".awe-data/missions", `${id}.json`);
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function readLog(dir: string, id: string): string {
  const file = path.join(dir, ".awe-data", `${id}.log`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}

// Common bootstrap: import the real modules against the temp DATA_DIR.
function bootstrap(missionId: string, extra: string): string {
  return `
import { createMissionManager, installTerminationHandlers } from ${JSON.stringify(
    path.join(ROOT, "src/agents/mission-manager.ts")
  )};
import { loadMission } from ${JSON.stringify(path.join(ROOT, "src/utils/storage.ts"))};
import { assertApprovedSpecBinding } from ${JSON.stringify(path.join(ROOT, "src/utils/spec-binding.ts"))};
const mission = loadMission(${JSON.stringify(missionId)});
const manager = createMissionManager(mission, 60000, { admission: {
  mode: "engineering-practice", missionId: mission.id,
  specHash: assertApprovedSpecBinding(mission).spec_hash, authorizeExecution: () => true,
} });
const uninstall = installTerminationHandlers(manager);
${extra}
`;
}

async function main() {
  console.log("AWE GROUP — E1-RECOVERY-HOTFIX-01 regression tests");

  // ─── T1: SIGTERM checkpoints and pauses a mission mid-flight ──────────────
  section("T1 — SIGTERM during a delegation persists progress and pauses the mission");
  {
    const dir = tempDataDir();
    const id = "11111111-1111-4111-8111-111111111111";
    writeMission(dir, id);
    // A "delegation" that never settles, like a stalled model call.
    const code = bootstrap(id, `console.log("READY");\nsetInterval(() => {}, 1000); // a stalled model request holds a socket open; emulate it so the loop stays alive\nawait new Promise(() => {});`);
    const run = await runChild(dir, code, { waitForStdout: "READY", killDelayMs: 4000 });
    const cp = readCheckpoint(dir, id);
    const mission = readMission(dir, id);
    const log = readLog(dir, id);
    if (!cp) console.log(`    [child stdout] ${run.stdout.slice(0, 400).replace(/\n/g, "\n    ")}`);
    if (!cp) console.log(`    [child stderr] ${run.stderr.slice(0, 1200).replace(/\n/g, "\n    ")}`);
    if (!cp) {
      const walk = (d: string): string[] =>
        fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
        );
      console.log(`    [dir] ${dir}\n    [files] ${walk(dir).map((f) => f.replace(dir + "/", "")).join(", ")}`);
    }
    check("child exited with signal exit code 143", run.code === 143, `code=${run.code} signal=${run.signal} stdout=${run.stdout.slice(0, 300)} stderr=${run.stderr.slice(0, 800)}`);
    check("checkpoint written", cp !== null);
    check("checkpoint reason is process_exit", cp?.reason === "process_exit", `reason=${cp?.reason}`);
    check("checkpoint belongs to the mission", cp?.mission_id === id);
    check("mission paused", mission.status === "paused", `status=${mission.status}`);
    check("log records the signal", /received SIGTERM/.test(log), log.split("\n").slice(-3).join(" | ") || "LOG_EMPTY");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── T2: checkpoint exists BEFORE the first LLM await ────────────────────
  section("T2 — run() writes a checkpoint before any delegation starts");
  {
    const dir = tempDataDir();
    const id = "22222222-2222-4222-8222-222222222222";
    writeMission(dir, id);
    // `run()` writes the early checkpoint synchronously, then awaits the Head
    // Agent (a real LLM call). To stay offline we kill the process with
    // SIGKILL — which no JS handler can catch — the moment the checkpoint file
    // is observed, proving it was written before the first delegation began.
    const code = `
import { createMissionManager } from ${JSON.stringify(path.join(ROOT, "src/agents/mission-manager.ts"))};
import { loadMission } from ${JSON.stringify(path.join(ROOT, "src/utils/storage.ts"))};
import { assertApprovedSpecBinding } from ${JSON.stringify(path.join(ROOT, "src/utils/spec-binding.ts"))};
import * as fs from "fs";
const mission = loadMission(${JSON.stringify(id)});
const manager = createMissionManager(mission, 60000, { admission: {
  mode: "engineering-practice", missionId: mission.id,
  specHash: assertApprovedSpecBinding(mission).spec_hash, authorizeExecution: () => true,
} });
manager.run().then(({ mission }) => console.error("EARLY_RESULT", mission.status, JSON.stringify(mission.metadata.qualification_blocked ?? ""))).catch((error) => console.error("EARLY_ERROR", String(error)));
const deadline = Date.now() + 20000;
while (Date.now() < deadline) {
  if (fs.existsSync(".awe-data/checkpoints/${id}.json")) { console.log("CHECKPOINT_SEEN"); break; }
  await new Promise((r) => setTimeout(r, 50));
}
await new Promise(() => {});
`;
    const run = await runChild(dir, code, { waitForStdout: "CHECKPOINT_SEEN", killSignal: "SIGKILL" });
    const cp = readCheckpoint(dir, id);
    check("early checkpoint observed before any delegation ran", run.stdout.includes("CHECKPOINT_SEEN"));
    check("checkpoint exists", cp !== null);
    check("early checkpoint has zero completed delegations", Array.isArray(cp?.completed) && cp.completed.length === 0);
    check("early checkpoint retains the explicitly approved specification hash",
      cp?.approved_spec_hash === assertApprovedSpecBinding(readMission(dir, id)).spec_hash);
    check("child was killed by SIGKILL with no chance to clean up", run.signal === "SIGKILL", `signal=${run.signal}`);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── T3: the mission deadline keeps the process alive ────────────────────
  section("T3 — mission deadline fires even when it is the only pending handle");
  {
    const dir = tempDataDir();
    const id = "33333333-3333-4333-8333-333333333333";
    writeMission(dir, id);
    // The only pending handle is the timeout timer itself. With `unref` the
    // process would exit before the deadline; the fix keeps it referenced.
    const timerCode = `
import { withMissionTimeout } from ${JSON.stringify(path.join(ROOT, "src/agents/lifecycle.ts"))};
import * as fs from "fs";
try {
  await withMissionTimeout("t", 1200, () => new Promise(() => {}));
} catch {
  fs.writeFileSync("timer-fired.txt", "yes");
}
`;
    const run = await runChild(dir, timerCode);
    const fired = fs.existsSync(path.join(dir, "timer-fired.txt"));
    check("process did not exit before the deadline", run.code === 0 && run.signal === null, `code=${run.code} signal=${run.signal}`);
    check("deadline fired", fired);
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(60)}`);
  console.log(`passed: ${passed}, failed: ${failed}`);
  if (failed) {
    failures.forEach((f) => console.log(`  ✗ ${f}`));
    process.exit(1);
  }
  console.log("All recovery regression tests passed.");
}

main();
