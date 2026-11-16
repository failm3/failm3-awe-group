/**
 * Child process for the R0 final-manager crash-gap tests. Offline: injected
 * plan/specialist/QA, no provider. The "crash-*" scenarios SIGKILL themselves
 * at an exact point; the "resume*" scenarios are fresh managers with the same
 * plan and their own receipt sink.
 *
 * Usage: tsx r0-final-manager-child.ts <scenario> <missionId> <receiptsFile>
 */
import * as fs from "node:fs";

const [scenario, missionId, receipts] = process.argv.slice(2);
const storage = await import("../../utils/storage.js");
const lifecycle = await import("../../agents/lifecycle.js");
const { createMissionManager } = await import("../../agents/mission-manager.js");

const say = (line: string) => process.stdout.write(line + "\n");
const die = (): never => {
  process.kill(process.pid, "SIGKILL");
  return Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10_000) as never;
};

const passedReview = () => ({ passed: true, score: 9, criteria_results: [], defects: [], recommendations: [], verdict: "PASS" });
const passedGate = () => ({ passed: true, blockers: [], criterion_checks: [], llm_score: 9, llm_passed: true });
const failedQa = () => ({
  review: { ...passedReview(), passed: false, defects: [{ issue: "repair required", severity: "major" }], verdict: "FAIL" },
  gate: { ...passedGate(), passed: false, blockers: ["repair required"] },
});

const item = (task: string, parallel = false) => ({ agent_role: "executor", task, context: "", tools: ["save_artifact"], expected_output: `${task} receipt`, parallel });
const plans: Record<string, ReturnType<typeof item>[]> = {
  single: [item("send-receipt")],
  parallel: [item("par-A", true), item("par-B", true)],
};

/** The external effect: an append to the receipt sink, plus (optionally) a real saved artifact. */
function effect(task: string, withArtifact = true) {
  fs.appendFileSync(receipts, `${task}\n`);
  return withArtifact ? storage.saveArtifactFile(missionId, `${task}.txt`, `evidence for ${task}`, "text") : null;
}
const outcome = (artifactId: string | null) => ({
  role: "executor", output: "done", artifacts: artifactId ? [artifactId] : [], success: true, tools_used: ["save_artifact"], model: "test-model",
});

function deps(kind: string) {
  const planKey = kind.includes("parallel") ? "parallel" : "single";
  let reviews = 0;
  return {
    planMission: async () => ({ strategy: "t", delegations: plans[planKey] }),
    executeSpecialist: async (cfg: any, mid: string, opts: any) => {
      const repair = String(cfg.task).startsWith("Fix the following defects");
      switch (kind) {
        case "crash-after-effect": {
          // Exact gap: effect + artifact are durable, then death before the specialist returns.
          effect(cfg.task);
          return die();
        }
        case "crash-pre-effect":
          return die();
        case "crash-marker-no-artifact":
          opts.beginEffect?.("send receipt");
          effect(cfg.task, false);
          return die();
        case "crash-receipt-only":
          effect(cfg.task, false);
          return die();
        case "crash-parallel": {
          if (cfg.task === "par-A") return outcome(effect(cfg.task)!.id);
          // B waits until A's success is durably checkpointed, then crashes inside its own gap.
          const deadline = Date.now() + 15_000;
          while (!lifecycle.loadCheckpoint(mid)?.completed.some((c: any) => c.status === "success" && c.task === "par-A")) {
            if (Date.now() > deadline) throw new Error("A was never checkpointed");
            await new Promise((r) => setTimeout(r, 20));
          }
          effect(cfg.task);
          return die();
        }
        case "crash-repair": {
          if (repair) {
            effect("repair-effect");
            return die();
          }
          return outcome(effect(cfg.task)!.id);
        }
        default: // resume*, fresh sink
          return outcome(effect(cfg.task)!.id);
      }
    },
    reviewMissionDetailed: async () => {
      reviews++;
      if (kind === "crash-repair" && reviews === 1) return failedQa() as any;
      say("QA_RAN");
      return { review: passedReview(), gate: passedGate() } as any;
    },
    resolveModelForRole: () => "test-model",
  };
}

const mission = storage.loadMission(missionId)!;
const manager = createMissionManager(mission, 60_000, {
  offlineFixture: true,
  allowedStatuses: ["approved", "paused"],
  quiesceTimeoutMs: 2_000,
  timeoutGraceMs: 500,
  // Only the explicitly controlled pre-effect scenario may infer safety from
  // missing evidence. Ordinary production/default resumes are strict.
  ...(scenario === "resume-evidence" ? { unresolvedIntentPolicy: "evidence" } : {}),
  deps: deps(scenario) as any,
} as any);

try {
  say("STARTED");
  const result = await manager.run();
  say(`RESULT ${result.mission.status}`);
} catch (err) {
  say(`ERROR ${(err as Error).name}: ${(err as Error).message}`);
}
process.exit(0);
