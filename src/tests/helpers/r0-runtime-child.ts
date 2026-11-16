/**
 * Child-process scenarios for the r0-runtime tests. Offline: no model calls.
 * Usage: node --import tsx r0-runtime-child.ts <scenario> [args...]
 * DATA_DIR comes from AWE_DATA_DIR, set by the parent.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { once } from "node:events";

const [scenario, ...args] = process.argv.slice(2);
const storage = await import("../../utils/storage.js");
const lifecycle = await import("../../agents/lifecycle.js");

function say(line: string) {
  process.stdout.write(line + "\n");
}

async function main() {
  switch (scenario) {
    case "lease-hold":
    case "recovery-hold": {
      const [id, ttl] = args;
      const got = lifecycle.acquireMissionLease(id, scenario === "recovery-hold" ? "recovery" : "run", { ttlMs: ttl ? Number(ttl) : undefined });
      if (!got.acquired) {
        say("DENIED");
        return;
      }
      got.lease.startHeartbeat();
      if (args[2] === "no-heartbeat") got.lease.stopHeartbeat();
      say("HELD");
      // An unref'd heartbeat and a paused stdin do not keep Node alive by
      // themselves. Keep this fixture process alive until the parent acts.
      const keepAlive = setInterval(() => {}, 1000);
      process.on("SIGTERM", () => {
        clearInterval(keepAlive);
        got.lease.release();
        process.exit(0);
      });
      await once(process.stdin, "end");
      clearInterval(keepAlive);
      got.lease.release();
      return;
    }
    case "lease-try": {
      const [id] = args;
      const got = lifecycle.acquireMissionLease(id, "approve");
      say(got.acquired ? "ACQUIRED" : "DENIED");
      if (got.acquired) got.lease.release();
      return;
    }
    case "lease-race": {
      // Wait for GO on stdin so all racers start together, hold briefly, report.
      const [id] = args;
      say("READY");
      await once(process.stdin, "data");
      const got = lifecycle.acquireMissionLease(id, "run", { ttlMs: 30_000 });
      say(got.acquired ? "ACQUIRED" : "DENIED");
      if (got.acquired) {
        // Keep the lease until the parent closes stdin.
        await once(process.stdin, "end");
        got.lease.release();
      }
      return;
    }
    case "cas-writer": {
      const [id, n, tag] = args;
      say("READY");
      await once(process.stdin, "data");
      for (let i = 0; i < Number(n); i++) {
        const res = storage.updateMissionAtomic(id, (cur) => {
          const counters = { ...((cur.metadata.counters as Record<string, number>) ?? {}) };
          counters[tag] = (counters[tag] ?? 0) + 1;
          return { metadata: { ...cur.metadata, counters, total: ((cur.metadata.total as number) ?? 0) + 1 } };
        });
        if (!res.applied) throw new Error(`update not applied: ${res.reason}`);
      }
      say("DONE");
      return;
    }
    case "hold-mission-lock-and-die": {
      const [id] = args;
      storage.withMissionLock(id, () => {
        say("LOCKED");
        process.kill(process.pid, "SIGKILL");
        // never reached
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000);
      });
      return;
    }
    case "manager-blocking": {
      // Runs a manager whose specialist blocks until aborted. Cancellation must come from another process.
      const [id, markerDir] = args;
      const { createMissionManager } = await import("../../agents/mission-manager.js");
      const mission = storage.loadMission(id)!;
      const manager = createMissionManager(mission, 60_000, {
        offlineFixture: true,
        allowedStatuses: ["approved", "paused"],
        quiesceTimeoutMs: 5_000,
        deps: {
          planMission: async () => ({
            strategy: "test",
            delegations: [
              { agent_role: "executor", task: "block", context: "", tools: [], expected_output: "x", parallel: false },
            ],
          }),
          executeSpecialist: async (_cfg, _mid, opts) =>
            new Promise((_resolve, reject) => {
              say("DELEGATION_STARTED");
              opts?.signal?.addEventListener("abort", () => {
                fs.writeFileSync(path.join(markerDir, "specialist-aborted"), "yes");
                reject(new Error("aborted"));
              });
            }),
          reviewMissionDetailed: async () => {
            throw new Error("QA must not run");
          },
          resolveModelForRole: () => "test-model",
        },
      });
      try {
        const result = await manager.run();
        say(`RESULT ${result.mission.status}`);
      } catch (err) {
        say(`ERROR ${(err as Error).name}`);
      }
      return;
    }
    case "manager-try": {
      const [id] = args;
      const { createMissionManager } = await import("../../agents/mission-manager.js");
      const mission = storage.loadMission(id)!;
      const manager = createMissionManager(mission, 60_000, {
        offlineFixture: true,
        deps: {
          planMission: async () => ({
            strategy: "t",
            delegations: [{ agent_role: "executor", task: "one durable effect", context: "", tools: [], expected_output: "receipt", parallel: false }],
          }),
          executeSpecialist: async (_cfg, mid) => {
            const artifact = storage.saveArtifactFile(mid, "winner.txt", "single-owner execution receipt", "text");
            return { role: "executor", output: "done", artifacts: [artifact.id], success: true, tools_used: ["save_artifact"], model: "test-model" };
          },
          reviewMissionDetailed: async () => {
            await new Promise((r) => setTimeout(r, 1500));
            return { review: passedReview(), gate: passedGate() };
          },
          resolveModelForRole: () => "test-model",
        },
      });
      say("READY");
      await once(process.stdin, "data");
      try {
        const result = await manager.run();
        say(`RESULT ${result.mission.status}`);
      } catch (err) {
        say(`ERROR ${(err as Error).name}`);
      }
      return;
    }
    default:
      throw new Error(`unknown scenario ${scenario}`);
  }
}

function passedReview() {
  return { passed: true, score: 9, criteria_results: [], defects: [], recommendations: [], verdict: "PASS" };
}
function passedGate() {
  return { passed: true, blockers: [], criterion_checks: [], llm_score: 9, llm_passed: true };
}

await main();
process.exit(0);
