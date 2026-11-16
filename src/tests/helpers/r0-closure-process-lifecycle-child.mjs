import * as fs from "node:fs";
import * as path from "node:path";

const [mode, missionId, command, cwd, readyFile] = process.argv.slice(2);
if (!["sigterm", "orphan", "fatal", "checkpoint", "checkpoint-cancel", "signal-retry"].includes(mode) || !missionId || !command || !cwd || !readyFile) {
  throw new Error("mode, missionId, command, cwd and readyFile are required");
}

const storage = await import("../../utils/storage.js");
const { createMissionManager, installTerminationHandlers } = await import("../../agents/mission-manager.js");
const { CheckpointIntegrityError } = await import("../../agents/lifecycle.js");
const { shellTool } = await import("../../tools/index.js");
const { runWithToolContext } = await import("../../security/tool-context.js");

const now = new Date().toISOString();
storage.saveMission({
  id: missionId,
  title: "R0 isolated process lifecycle fixture",
  description: "Offline real-child process lifecycle verification",
  objective: "Verify actual process-group quiescence before recovery state changes",
  acceptance_criteria: ["The registered descendant is stopped before paused state is published"],
  status: "approved",
  priority: "normal",
  created_at: now,
  updated_at: now,
  artifacts: [],
  metadata: { specification: { suggested_tools: ["shell"] } },
});

function damageRegisteredProcessRecord() {
  const dir = storage.dataSubdir("process-groups");
  const name = fs.readdirSync(dir).find((entry) => entry.startsWith(`${missionId.toLowerCase()}--`) && entry.endsWith(".json"));
  if (!name) throw new Error("registered process record not found");
  const file = path.join(dir, name);
  fs.copyFileSync(file, `${readyFile}.record`);
  fs.writeFileSync(`${readyFile}.record-path`, file);
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  record.group_start_ticks = "1";
  fs.writeFileSync(file, JSON.stringify(record));
}

const manager = createMissionManager(storage.loadMission(missionId), 30000, {
  quiesceTimeoutMs: ["fatal", "checkpoint", "checkpoint-cancel", "signal-retry"].includes(mode) ? 100 : 5000,
  timeoutGraceMs: ["fatal", "checkpoint", "checkpoint-cancel", "signal-retry"].includes(mode) ? 50 : 5000,
  allowedStatuses: ["approved"],
  offlineFixture: true,
  deps: {
    planMission: async () => ({
      strategy: "one real local shell process",
      delegations: [{
        agent_role: "executor",
        task: "Run the isolated SIGTERM-resistant fixture",
        context: "No provider or network is involved",
        tools: ["shell"],
        expected_output: "A stopped local process group",
        parallel: false,
      }],
    }),
    executeSpecialist: async (_config, id, options) => {
      options?.beginEffect?.("start isolated local process fixture");
      if (mode === "signal-retry") {
        fs.writeFileSync(readyFile, `${process.pid}\n`);
        await new Promise((resolve) => setTimeout(resolve, 900));
        return {
          role: "executor",
          output: "settled after abort",
          artifacts: [],
          success: false,
          tools_used: [],
          model: "offline-signal-retry-fixture",
        };
      }
      const execution = runWithToolContext(
        { missionId: id, allowedTools: new Set(["shell"]), signal: options?.signal, fence: options?.fence },
        () => shellTool.execute({ command, cwd, timeout_ms: 30000 }, {}),
      );
      if (mode === "fatal" || mode === "checkpoint" || mode === "checkpoint-cancel") {
        void execution.catch(() => {});
        for (let attempt = 0; attempt < 1000 && !fs.existsSync(readyFile); attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (!fs.existsSync(readyFile)) throw new Error(`${mode} fixture descendant did not start`);
        // Damage process/checkpoint evidence only after run() owns the mission
        // and the accepted plan has been checkpointed. Pre-run process evidence
        // is intentionally an acquisition barrier, not a settlement test.
        damageRegisteredProcessRecord();
        if (mode === "checkpoint" || mode === "checkpoint-cancel") {
          fs.writeFileSync(path.join(storage.dataSubdir("checkpoints"), `${missionId}.json`), "{damaged-checkpoint");
          throw new CheckpointIntegrityError(missionId, "malformed", "controlled damaged checkpoint with live descendant", `${missionId}.json`);
        }
        throw new Error("controlled fatal failure with a live registered descendant");
      }
      const result = await execution;
      return {
        role: "executor",
        output: JSON.stringify(result),
        artifacts: [],
        success: result.success,
        tools_used: ["shell"],
        model: "offline-process-fixture",
      };
    },
    reviewMissionDetailed: async () => { throw new Error("QA must not run in the process-lifecycle fixture"); },
    resolveModelForRole: () => "offline-process-fixture",
  },
});

if (!["sigterm", "orphan", "fatal", "checkpoint", "checkpoint-cancel", "signal-retry"].includes(mode)) throw new Error("unsupported fixture mode");
const uninstall = mode === "sigterm" || mode === "signal-retry" ? installTerminationHandlers(manager) : () => {};
void manager.run().then(
  ({ mission }) => {
    console.log(`R0_PROCESS_RESULT ${mission.status}`);
    if (mode === "signal-retry" && mission.status === "paused") process.exit(143);
  },
  (error) => console.error(`R0_PROCESS_ERROR ${String(error)}`),
).finally(uninstall);

for (let attempt = 0; attempt < 1000; attempt++) {
  if (fs.existsSync(readyFile)) {
    console.log("R0_PROCESS_READY");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}
setInterval(() => {}, 1000);
