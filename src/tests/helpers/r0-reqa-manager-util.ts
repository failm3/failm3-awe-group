import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT } from "./r0-runtime-util.js";

const CHILD = path.join(ROOT, "src/tests/helpers/r0-reqa-manager-child.ts");

export interface ReqaChild {
  proc: ChildProcessWithoutNullStreams;
  stdout: () => string;
  stderr: () => string;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null }>;
}

/** Spawn a fresh offline manager process against `<root>/data`. No real provider key, no inherited data dir. */
export function spawnReqaChild(root: string, scenario: string, missionId: string, receipts: string, extraEnv: Record<string, string> = {}): ReqaChild {
  const proc = spawn(process.execPath, ["--import", pathToFileURL(path.join(ROOT, "node_modules/tsx/dist/loader.mjs")).href, CHILD, scenario, missionId, receipts], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: root,
      NODE_PATH: path.join(ROOT, "node_modules"),
      AWE_DATA_DIR: path.join(root, "data"),
      ROUTER_CHEAP_API_KEY: "r0-offline-invalid-do-not-use",
      NO_COLOR: "1",
      ...extraEnv,
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
  const guard = setTimeout(() => proc.kill("SIGKILL"), 90_000);
  guard.unref();
  return { proc, stdout: () => out, stderr: () => err, exited };
}
