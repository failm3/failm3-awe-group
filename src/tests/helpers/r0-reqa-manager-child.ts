/**
 * Child process for the R0 re-QA manager tests (D8 failed-outcome retention,
 * D3 same-name supersession). Offline: injected plan/specialist/QA, no provider.
 * "*-kill" scenarios SIGKILL themselves in QA, i.e. AFTER the failed outcome was
 * checkpointed and BEFORE the mission is terminalized. "resume*" scenarios are
 * fresh managers with their own receipt sink.
 *
 * Usage: tsx r0-reqa-manager-child.ts <scenario> <missionId> <receiptsFile>
 */
import * as fs from "node:fs";

const [scenario, missionId, receipts] = process.argv.slice(2);
const storage = await import("../../utils/storage.js");
// Exercise the real saveCheckpoint return-to-recordSupersessions crash window
// without adding a production fault hook. Strictly confined to this fixture.
if (["samename-commit-crash", "samename-multi-crash"].includes(scenario) || ["fail-effect-kill", "fail-effect-noartifact-kill", "throw-effect-kill"].includes(scenario)) {
  const { registerHooks } = await import("node:module");
  registerHooks({
    load(url, context, next) {
      if (!url.endsWith("/src/agents/lifecycle.ts")) return next(url, context);
      const loaded = next(url, context);
      const source = loaded.source?.toString();
      if (!source?.includes("return target}")) throw new Error("checkpoint crash fixture anchor missing");
      return {
        ...loaded,
        source: source.replace(
          "return target}",
          "globalThis.__r0RepairCommitCrash?.(checkpoint);globalThis.__r0FailedOutcomeCrash?.(checkpoint);return target}"
        ),
      };
    },
  });
  (globalThis as any).__r0RepairCommitCrash = (checkpoint: any) => {
    const committed = (checkpoint.repair_provenance ?? []).filter((proof: any) => proof.outcome === "completed");
    const target = scenario === "samename-multi-crash" ? Number(process.env.R0_CRASH_AT_REPAIR) : 1;
    if (committed.length !== target || checkpoint.repair_iterations !== target || checkpoint.in_flight.some((entry: any) => entry.kind === "repair")) return;
    const marker = scenario === "samename-multi-crash" ? `${receipts}.committed-${target}.json` : `${receipts}.committed.json`;
    fs.writeFileSync(marker, JSON.stringify({ repair_provenance: committed, in_flight: checkpoint.in_flight }));
    die();
  };
  (globalThis as any).__r0FailedOutcomeCrash = (checkpoint: any) => {
    if (checkpoint.in_flight?.some((entry: any) => entry.failed_outcome)) die();
  };
}
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

const item = (task: string) => ({ agent_role: "executor", task, context: "", tools: ["save_artifact"], expected_output: `${task} receipt`, parallel: false });
const SAMENAME = scenario.includes("samename");
const TASK = SAMENAME ? "make-index" : "send-receipt";

const receipt = (line: string) => fs.appendFileSync(receipts, `${line}\n`);
const delayForRepairOrdering = () => new Promise((resolve) => setTimeout(resolve, 15));
const ok = (artifactId: string | null, success = true) => ({
  role: "executor", output: "done", artifacts: artifactId ? [artifactId] : [], success, tools_used: ["save_artifact"], model: "test-model",
});

function deps() {
  let reviews = 0;
  return {
    planMission: async () => ({ strategy: "t", delegations: [item(TASK)] }),
    executeSpecialist: async (cfg: any, mid: string, opts: any) => {
      const repair = String(cfg.task).startsWith("Fix the following defects");
      switch (scenario) {
        case "fail-effect-kill": {
          opts.beginEffect?.("send receipt");
          receipt(cfg.task);
          const a = storage.saveArtifactFile(mid, `${cfg.task}.txt`, `evidence for ${cfg.task}`, "text");
          return ok(a.id, false);
        }
        case "fail-effect-noartifact-kill":
          opts.beginEffect?.("send receipt");
          receipt(cfg.task);
          return ok(null, false);
        case "throw-effect-kill":
          opts.beginEffect?.("send receipt");
          receipt(cfg.task);
          throw new Error("provider 500 after the receipt was sent");
        case "fail-noeffect-kill":
          return ok(null, false);
        case "samename-commit-crash":
        case "samename-multi-crash": {
          opts.beginEffect?.("rewrite index");
          await delayForRepairOrdering();
          const iteration = repair ? Number(String(cfg.context).match(/Repair iteration (\d+)/)?.[1] ?? 1) : 0;
          const artifact = storage.saveArtifactFile(
            mid,
            "index.html",
            repair ? `<h1>${String.fromCharCode(65 + iteration)} repaired</h1>` : "<h1>A original</h1>",
            "text",
          );
          return ok(artifact.id);
        }
        case "samename-retry": {
          receipt(repair ? "repair-effect" : cfg.task);
          opts.beginEffect?.("rewrite index");
          await delayForRepairOrdering();
          const priorResolution = ((storage.loadMission(mid)?.metadata.recovery_resolutions ?? []) as unknown[]).length > 0;
          const artifact = storage.saveArtifactFile(mid, "index.html", repair ? (priorResolution ? "<h1>C retried</h1>" : "<h1>B ambiguous</h1>") : "<h1>A original</h1>", "text");
          return ok(artifact.id, repair ? priorResolution : true);
        }
        case "samename-crash": {
          if (repair) {
            opts.beginEffect?.("rewrite index");
            receipt("repair-effect");
            await new Promise((r) => setTimeout(r, 15));
            storage.saveArtifactFile(mid, "index.html", "<h1>B repaired</h1>", "text");
            return die();
          }
          receipt(cfg.task);
          return ok(storage.saveArtifactFile(mid, "index.html", "<h1>A original</h1>", "text").id);
        }
        case "resume-samename":
          receipt(`UNEXPECTED ${cfg.task}`);
          return ok(storage.saveArtifactFile(mid, "index.html", "<h1>unexpected</h1>", "text").id);
        default: {
          // resume: the effect runs (once) with a real artifact.
          receipt(cfg.task);
          return ok(storage.saveArtifactFile(mid, `${cfg.task}.txt`, `evidence for ${cfg.task}`, "text").id);
        }
      }
    },
    reviewMissionDetailed: async () => {
      reviews++;
      if (scenario.endsWith("-kill")) return die();
      if (scenario === "samename-multi-crash" && process.env.R0_QA_ALWAYS_FAIL === "1") return failedQa() as any;
      if ((scenario === "samename-crash" || scenario === "samename-commit-crash" || scenario === "samename-multi-crash" || scenario === "samename-retry") && reviews === 1) return failedQa() as any;
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
  deps: deps() as any,
} as any);

try {
  say("STARTED");
  const result = await manager.run();
  say(`RESULT ${result.mission.status}`);
} catch (err) {
  say(`ERROR ${(err as Error).name}: ${(err as Error).message}`);
}
process.exit(0);
