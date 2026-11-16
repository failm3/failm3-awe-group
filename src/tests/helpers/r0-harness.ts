import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const WORKER = path.join(ROOT, "src/tests/helpers/r0-worker.ts");
export const LOADER = path.join(ROOT, "node_modules/tsx/dist/loader.mjs");

export function spawnWorker(directory: string, scenario: string, args: string[] = []) {
  // Do not inherit real API keys, provider URLs, dotenv configuration or data-dir overrides.
  return spawn(process.execPath, ["--import", LOADER, WORKER, scenario, ...args], {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      TMPDIR: directory,
      ROUTER_CHEAP_API_KEY: "r0-offline-invalid-do-not-use",
      NO_COLOR: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export async function scenario(name: string, watchdogMs = 25_000): Promise<void> {
  const directory = mkdtempSync(path.join(ROOT, "src/tests/helpers/r0-temp-"));
  const child = spawnWorker(directory, name);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), watchdogMs);
  try {
    const result = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve({ code, signal }));
    });
    assert.equal(result.code, 0,
      `${name}: child code=${result.code}, signal=${result.signal}\n${stdout}\n${stderr}`);
    assert.match(stdout, /R0_ASSERTIONS_COMPLETED/, "Worker exited without executing assertions");
  } finally {
    clearTimeout(timer);
    rmSync(directory, { recursive: true, force: true });
  }
}
