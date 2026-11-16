import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const CHILD = path.join(ROOT, "src/tests/helpers/r0-runtime-child.ts");

export function tempDir(prefix = "r0-runtime-"): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

export interface Child {
  proc: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
  waitFor: (text: string, ms?: number) => Promise<void>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

export function spawnChild(dataDir: string, scenario: string, args: string[] = [], env: Record<string, string> = {}): Child {
  const proc = spawn(process.execPath, ["--import", pathToFileURL(path.join(ROOT, "node_modules/tsx/dist/loader.mjs")).href, CHILD, scenario, ...args], {
    cwd: dataDir,
    env: {
      PATH: process.env.PATH,
      HOME: dataDir,
      NODE_PATH: path.join(ROOT, "node_modules"),
      AWE_DATA_DIR: path.join(dataDir, "data"),
      ROUTER_CHEAP_API_KEY: "r0-offline-invalid-do-not-use",
      NO_COLOR: "1",
      ...env,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  proc.stdout.on("data", (c) => (out += c));
  proc.stderr.on("data", (c) => (err += c));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    proc.once("close", (code, signal) => resolve({ code, signal }))
  );
  const guard = setTimeout(() => proc.kill("SIGKILL"), 60_000);
  guard.unref();
  return {
    proc,
    stdout: () => out,
    stderr: () => err,
    exited,
    async waitFor(text, ms = 20_000) {
      const deadline = Date.now() + ms;
      while (!out.includes(text)) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for "${text}"; stdout=${out} stderr=${err.slice(0, 1500)}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
  };
}

export async function until(cond: () => boolean, ms = 10_000, what = "condition"): Promise<void> {
  const deadline = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export function baseMission(id: string, over: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  return {
    id,
    title: "r0 runtime",
    description: "offline",
    objective: "offline objective",
    acceptance_criteria: ["Deliver the thing"],
    status: "approved" as const,
    priority: "normal" as const,
    created_at: now,
    updated_at: now,
    artifacts: [],
    metadata: { preserved: { nonce: "keep" } } as Record<string, unknown>,
    ...over,
  };
}

export const passedReview = () => ({ passed: true, score: 9, criteria_results: [], defects: [], recommendations: [], verdict: "PASS" });
export const passedGate = () => ({ passed: true, blockers: [], criterion_checks: [], llm_score: 9, llm_passed: true });

export function makeChecker(title: string) {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  return {
    section(name: string) {
      console.log(`\n${name}`);
    },
    check(name: string, ok: boolean, detail = "") {
      if (ok) {
        passed++;
        console.log(`  ✓ ${name}`);
      } else {
        failed++;
        failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
        console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
      }
    },
    finish(): never {
      console.log(`\n${"─".repeat(60)}\n${title}: passed ${passed}, failed ${failed}`);
      if (failed) failures.forEach((f) => console.log(`  FAIL: ${f}`));
      process.exit(failed ? 1 : 0);
    },
  };
}

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
