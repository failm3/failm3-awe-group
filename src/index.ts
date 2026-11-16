#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import { Command, CommanderError } from "commander";
import type { Mission, QAReview, Specification } from "./types/index.js";
import type { AmbiguousResolution, MissionManagerOptions } from "./agents/mission-manager.js";
import { APPROVED_SPEC_BINDING_KEY, createApprovedSpecBinding, SpecBindingError } from "./utils/spec-binding.js";

// This must stay before every dynamic import of storage, lifecycle, memory, or
// agents. Static imports of those modules would be evaluated before this body.
// Nox Runtime never auto-loads a developer workspace .env. A production launch
// must select its dedicated credential file explicitly; override:true prevents
// an inherited OpenCode/provider variable from winning over that selection.
const envFile = path.join(process.cwd(), ".env");
if (process.env.AWE_OFFLINE_TEST === "1") {
  // Offline interface/storage fixtures still use an isolated synthetic .env.
  // No live model or network access is available under this explicit test mode.
  if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
} else {
  const runtimeEnvFile = process.env.AWE_RUNTIME_ENV_FILE;
  if (!runtimeEnvFile || !path.isAbsolute(runtimeEnvFile)) {
    throw new Error("AWE_RUNTIME_ENV_FILE must select an absolute dedicated Nox Runtime env file");
  }
  const selected = path.resolve(runtimeEnvFile);
  const loaded = dotenv.config({ path: selected, override: true });
  if (loaded.error || !loaded.parsed?.ROUTER_CHEAP_API_KEY) {
    throw new Error("Dedicated Nox Runtime env file must contain ROUTER_CHEAP_API_KEY");
  }
  // The OpenAI-compatible model adapter must never fall back to a developer key.
  delete process.env.OPENAI_API_KEY;
}

type MissionResult = { mission: Mission; review: QAReview | null };
type ManagerRunner = { run: () => Promise<MissionResult> };
type ManagerFactory = (
  mission: Mission,
  timeoutMs?: number,
  options?: MissionManagerOptions
) => ManagerRunner;

type StorageModule = typeof import("./utils/storage.js");

/** Offline/programmatic entry-point seams. Production defaults remain lazy real modules. */
export interface CliDependencies {
  storage?: StorageModule;
  createSpecification?: (request: string) => Promise<Specification>;
  createMissionManager?: ManagerFactory;
  resolveAmbiguousDelegation?: (
    missionId: string,
    resolution: AmbiguousResolution
  ) => { remaining: number; mission: Mission };
  /** Trusted host composition; no request/model metadata is interpreted as policy. */
  resolveMissionAdmission?: import("./config/mission-policy.js").MissionAdmissionResolver;
  resolveMissionExperience?: import("./config/experience-policy.js").MissionExperienceResolver;
  installTerminationHandlers?: (manager: ManagerRunner) => () => void;
  reconcileOrphanedMissions?: () => unknown | Promise<unknown>;
  isInteractive?: () => boolean;
  confirm?: (question: string) => Promise<string>;
}

class CliExit extends Error {
  constructor(readonly code: number) {
    super(`CLI exit ${code}`);
  }
}

function storage(deps: CliDependencies): Promise<StorageModule> | StorageModule {
  return deps.storage ?? import("./utils/storage.js");
}

async function specify(request: string, deps: CliDependencies): Promise<Specification> {
  return deps.createSpecification
    ? deps.createSpecification(request)
    : (await import("./agents/prompt-master.js")).createSpecification(request);
}

async function managerFactory(deps: CliDependencies): Promise<ManagerFactory> {
  return deps.createMissionManager ??
    ((await import("./agents/mission-manager.js")).createMissionManager as ManagerFactory);
}

async function terminationHandlers(deps: CliDependencies): Promise<(manager: ManagerRunner) => () => void> {
  return deps.installTerminationHandlers ??
    ((await import("./agents/mission-manager.js")).installTerminationHandlers as unknown as (
      manager: ManagerRunner
    ) => () => void);
}

function timeoutMs(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error("--timeout must be a positive number of seconds");
    throw new CliExit(2);
  }
  return parsed * 1000;
}

function printSpecification(spec: Specification): void {
  console.log("📋 Specification:\n");
  console.log(`  Title:     ${spec.title}`);
  console.log(`  Objective: ${spec.objective}`);
  console.log(`  Scope / exclusions: ${spec.scope}`);
  console.log("  Criteria:");
  spec.acceptance_criteria.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  console.log(`  Complexity: ${spec.estimated_complexity}`);
  console.log(`  Tools: ${spec.suggested_tools.join(", ")}`);
  console.log(`  Agents: ${spec.suggested_agents.join(", ")}`);
  spec.risks.forEach((risk) => console.log(`  Risk: ${risk}`));
}

/** Compare with the displayed task under the storage lock before binding it. */
function approvalPatch(current: Mission, displayed: Mission): Partial<Mission> | null {
  if (current.status !== "pending_approval") return null;
  const binding = createApprovedSpecBinding(current);
  if (binding.spec_hash !== createApprovedSpecBinding(displayed).spec_hash) {
    throw new SpecBindingError(current.id, "changed while awaiting approval; reload and approve again");
  }
  return { status: "approved", metadata: { ...current.metadata, [APPROVED_SPEC_BINDING_KEY]: binding } };
}

function pendingMission(id: string, spec: Specification, request: string): Mission {
  const now = new Date().toISOString();
  return {
    id,
    title: spec.title,
    description: request,
    objective: spec.objective,
    acceptance_criteria: spec.acceptance_criteria,
    status: "pending_approval",
    priority: "normal",
    created_at: now,
    updated_at: now,
    artifacts: [],
    metadata: { specification: spec },
  };
}

function printPending(id: string): void {
  console.log(`\n⏸ Mission ${id} is pending_approval; no execution was started.`);
  console.log(`Approve interactively: scripts/run-nox-runtime.sh approve ${id}`);
  console.log(`Approve noninteractively: scripts/run-nox-runtime.sh approve ${id} --approve`);
}

async function explicitOrInteractiveApproval(
  opts: { approve?: boolean },
  deps: CliDependencies,
  question: string
): Promise<boolean> {
  if (opts.approve === true) return true;
  if (opts.approve === false) return false;
  const interactive = deps.isInteractive?.() ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!interactive) {
    console.log("Noninteractive approval absent; use --approve to explicitly approve and start.");
    return false;
  }
  if (deps.confirm) return (await deps.confirm(question)).trim().toLowerCase() === "y";
  const readline = await import("readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

async function executeMission(
  mission: Mission,
  budgetMs: number | undefined,
  allowedStatuses: NonNullable<MissionManagerOptions["allowedStatuses"]>,
  deps: CliDependencies
): Promise<MissionResult> {
  const createManager = await managerFactory(deps);
  const admission = await (await import("./config/mission-policy.js"))
    .resolveConfiguredMissionAdmission(mission, deps.resolveMissionAdmission);
  const experience = await (await import("./config/experience-policy.js"))
    .resolveConfiguredMissionExperience(mission, deps.resolveMissionExperience);
  const manager = createManager(mission, budgetMs, { allowedStatuses, admission, experience });
  const install = await terminationHandlers(deps);
  const uninstall = install(manager);
  try {
    return await manager.run();
  } finally {
    uninstall();
  }
}

function printResult(result: MissionResult, artifacts: Array<{ name: string; type: string }>): void {
  console.log(`\n${"═".repeat(50)}`);
  if (result.review?.passed) {
    console.log(`✅ COMPLETED — QA score: ${result.review.score}/10`);
  } else if (result.mission.status === "paused") {
    console.log("⏸ PAUSED — checkpoint retained; mission remains resumable");
  } else if (result.mission.status === "cancelled") {
    console.log("🛑 CANCELLED");
  } else {
    console.log(`❌ ${result.mission.status.toUpperCase()} — QA score: ${result.review?.score ?? 0}/10`);
    result.review?.defects.forEach((d) => console.log(`   ! [${d.severity}] ${d.issue}`));
  }
  console.log(`${"═".repeat(50)}\n`);
  if (artifacts.length) {
    console.log(`📦 Artifacts (${artifacts.length}):`);
    artifacts.forEach((a) => console.log(`   • ${a.name} [${a.type}]`));
  }
}

async function approvePendingMission(
  missionId: string,
  opts: { approve?: boolean; timeout?: string },
  deps: CliDependencies
): Promise<void> {
  const budgetMs = timeoutMs(opts.timeout);
  const store = await storage(deps);
  const mission = store.loadMission(missionId);
  if (!mission) {
    console.error(`Mission not found: ${missionId}`);
    throw new CliExit(2);
  }
  if (mission.status !== "pending_approval") {
    console.error(`Mission ${missionId} is ${mission.status}; only pending_approval missions can be approved`);
    throw new CliExit(2);
  }
  const spec = mission.metadata.specification as Specification | undefined;
  console.log(`Description: ${mission.description}`);
  if (spec) printSpecification(spec);
  const approved = await explicitOrInteractiveApproval(
    opts,
    deps,
    `\nApprove and start mission ${missionId}? (y/N): `
  );
  if (!approved) {
    printPending(missionId);
    return;
  }

  // The initial record is always pending_approval. This fenced state transition
  // is the only path to construction of a manager for a one-shot/interactive run.
  const claim = store.updateMissionAtomic(
    missionId,
    (cur) => approvalPatch(cur, mission)
  );
  if (!claim.applied || !claim.mission) {
    console.error(`Mission ${missionId} changed before approval; reload and retry`);
    throw new CliExit(2);
  }
  store.appendLog(missionId, "Mission explicitly approved via CLI");
  console.log(`\n🚀 Starting mission ${missionId}...\n`);
  try {
    const result = await executeMission(
      claim.mission,
      budgetMs,
      ["approved"],
      deps
    );
    printResult(result, store.listArtifacts(missionId));
    throw new CliExit(result.review?.passed ? 0 : 1);
  } catch (err) {
    if (err instanceof CliExit) throw err;
    console.error(`Mission was not started: ${err instanceof Error ? err.message : String(err)}`);
    throw new CliExit(3);
  }
}

async function resolveRecovery(
  missionId: string,
  resolution: AmbiguousResolution,
  deps: CliDependencies
): Promise<void> {
  const resolver = deps.resolveAmbiguousDelegation ??
    (await import("./agents/mission-manager.js")).resolveAmbiguousDelegation;
  const result = resolver(missionId, resolution);
  console.log(
    `Recovery ${resolution.decision} recorded for ${resolution.intent_id}; ${result.remaining} ambiguous outcome(s) remain.`
  );
  console.log(`Resume explicitly with: scripts/run-nox-runtime.sh resume ${missionId}`);
}

export function createProgram(deps: CliDependencies = {}, invocationArgs: string[] = process.argv): Command {
  const program = new Command();
  program
    .name("awe-group")
    .description("AWE GROUP — Universal Autonomous Multi-Agent System")
    .version("0.1.0")
    .exitOverride();

  const rejectContradictoryApproval = () => {
    if (invocationArgs.includes("--approve") && invocationArgs.includes("--no-approve")) {
      console.error("--approve and --no-approve are contradictory");
      throw new CliExit(2);
    }
  };

  program
    .command("serve")
    .description("Start the REST API server (loopback and authenticated by default)")
    .option("-p, --port <port>", "port number", "3420")
    .option("--host <host>", "listener host (default 127.0.0.1; non-loopback requires AWE_API_SECRET)")
    .action(async (opts) => {
      const { createApiServer } = await import("./api/server.js");
      createApiServer(Number.parseInt(opts.port, 10), { host: opts.host });
    });

  program
    .command("cli")
    .description("Run the interactive CLI")
    .action(async () => {
      const { runCli } = await import("./cli/index.js");
      await runCli({ installTerminationHandlers: true });
    });

  program
    .command("run <request...>")
    .description("Create a specification; start only after explicit approval")
    .option("--approve", "explicitly approve and start in a noninteractive invocation")
    .option("--no-approve", "save pending_approval and never start execution")
    .option("--timeout <seconds>", "mission wall-clock budget in seconds (default 1800)")
    .action(async (requestParts: string[], opts: { approve?: boolean; timeout?: string }) => {
      rejectContradictoryApproval();
      const budgetMs = timeoutMs(opts.timeout);
      const request = requestParts.join(" ");
      console.log("\n⚡ Prompt Master is analyzing your request...\n");
      const spec = await specify(request, deps);
      printSpecification(spec);

      // Persist BEFORE prompting or constructing a manager. A declined prompt,
      // Ctrl-C, or absent noninteractive approval leaves this recoverable record.
      const crypto = await import("crypto");
      const mission = pendingMission(crypto.randomUUID(), spec, request);
      const store = await storage(deps);
      store.saveMission(mission);
      store.appendLog(mission.id, "Mission specification saved as pending_approval via CLI run");
      console.log(`\nMission created: ${mission.id}`);

      const approved = await explicitOrInteractiveApproval(
        opts,
        deps,
        "\nApprove and start this mission? (y/N): "
      );
      if (!approved) {
        printPending(mission.id);
        return;
      }

      const claim = store.updateMissionAtomic(
        mission.id,
        (cur) => approvalPatch(cur, mission)
      );
      if (!claim.applied || !claim.mission) {
        console.error(`Mission ${mission.id} changed before approval; execution refused`);
        throw new CliExit(2);
      }
      store.appendLog(mission.id, "Mission explicitly approved via CLI run");
      console.log("\n🚀 Starting mission...\n");
      try {
        const result = await executeMission(claim.mission, budgetMs, ["approved"], deps);
        printResult(result, store.listArtifacts(mission.id));
        throw new CliExit(result.review?.passed ? 0 : 1);
      } catch (err) {
        if (err instanceof CliExit) throw err;
        console.error(`Mission was not started: ${err instanceof Error ? err.message : String(err)}`);
        throw new CliExit(3);
      }
    });

  program
    .command("approve <missionId>")
    .description("Approve and start a mission previously saved as pending_approval")
    .option("--approve", "explicit noninteractive approval (otherwise an interactive y/N prompt is required)")
    .option("--timeout <seconds>", "mission wall-clock budget in seconds (default 1800)")
    .action(async (missionId: string, opts: { approve?: boolean; timeout?: string }) => {
      rejectContradictoryApproval();
      await approvePendingMission(missionId, opts, deps);
    });

  program
    .command("accept <missionId> <intentId> <artifactIds...>")
    .description("Accept an ambiguous outcome using real registered, integrity-verified artifact evidence")
    .requiredOption("--operator <operator>", "auditable operator identity")
    .requiredOption("--note <note>", "explicit evidence/reconciliation note")
    .action(async (
      missionId: string,
      intentId: string,
      artifactIds: string[],
      opts: { operator: string; note: string }
    ) => {
      await resolveRecovery(missionId, {
        intent_id: intentId,
        decision: "accept",
        operator: opts.operator,
        note: opts.note,
        artifacts: artifactIds,
      }, deps);
    });

  program
    .command("retry <missionId> <intentId>")
    .description("Explicitly authorize retrying an ambiguous outcome; does not execute until resume")
    .requiredOption("--operator <operator>", "auditable operator identity")
    .requiredOption("--note <note>", "explicit reason accepting a possible repeated effect")
    .action(async (
      missionId: string,
      intentId: string,
      opts: { operator: string; note: string }
    ) => {
      await resolveRecovery(missionId, {
        intent_id: intentId,
        decision: "retry",
        operator: opts.operator,
        note: opts.note,
      }, deps);
    });

  program
    .command("resume <missionId>")
    .description("Resume a paused mission, or an approved mission interrupted before its running claim")
    .option("--timeout <seconds>", "additional wall-clock budget in seconds (default 1800)")
    .action(async (missionId: string, opts: { timeout?: string }) => {
      const budgetMs = timeoutMs(opts.timeout);
      const store = await storage(deps);
      const mission = store.loadMission(missionId);
      if (!mission) {
        console.error(`Mission not found: ${missionId}`);
        throw new CliExit(2);
      }
      if (mission.status !== "paused" && mission.status !== "approved") {
        console.error(
          `Mission ${missionId} is ${mission.status}; only paused or approved (interrupted before running) missions can be resumed`
        );
        throw new CliExit(2);
      }
      store.appendLog(missionId, `Mission resumed via CLI with timeout_ms=${budgetMs ?? "default"}`);
      console.log(`\n▶ Resuming mission ${missionId} with the strict unresolved-intent gate...\n`);
      try {
        const result = await executeMission(mission, budgetMs, ["paused", "approved"], deps);
        printResult(result, store.listArtifacts(missionId));
        throw new CliExit(result.review?.passed ? 0 : 1);
      } catch (err) {
        if (err instanceof CliExit) throw err;
        console.error(`Mission was not resumed: ${err instanceof Error ? err.message : String(err)}`);
        throw new CliExit(3);
      }
    });

  program
    .command("career")
    .description("Run CAREER-01: Job search and application preparation on HeadHunter")
    .action(async () => {
      const { CAREER_01_MISSION } = await import("./missions/career-01.js");
      const store = await storage(deps);
      const createManager = await managerFactory(deps);
      const crypto = await import("crypto");

      console.log("\n=== AWE GROUP — CAREER-01 Mission ===\n");
      const mission = pendingMission(crypto.randomUUID(), {
        title: CAREER_01_MISSION.title,
        objective: CAREER_01_MISSION.objective,
        scope: CAREER_01_MISSION.context,
        acceptance_criteria: CAREER_01_MISSION.acceptance_criteria,
        suggested_tools: [],
        suggested_agents: [],
        estimated_complexity: "complex",
        risks: [],
      }, CAREER_01_MISSION.objective);
      mission.metadata = { ...mission.metadata, context: CAREER_01_MISSION.context, tags: CAREER_01_MISSION.tags };
      printSpecification(mission.metadata.specification as Specification);
      store.saveMission(mission);
      const approved = await explicitOrInteractiveApproval(
        {}, deps, "\nApprove and start CAREER-01 mission? (y/N): "
      );
      if (!approved) { printPending(mission.id); throw new CliExit(0); }
      const claim = store.updateMissionAtomic(mission.id, (cur) => approvalPatch(cur, mission));
      if (!claim.applied || !claim.mission) throw new Error("Mission changed before approval");
      store.appendLog(mission.id, "Mission created via career command");
      const admission = await (await import("./config/mission-policy.js"))
        .resolveConfiguredMissionAdmission(claim.mission, deps.resolveMissionAdmission);
      const experience = await (await import("./config/experience-policy.js"))
        .resolveConfiguredMissionExperience(claim.mission, deps.resolveMissionExperience);
      const manager = createManager(claim.mission, undefined, { allowedStatuses: ["approved"], admission, experience });
      let result: MissionResult;
      try {
        result = await manager.run();
      } catch (err) {
        console.error(`Mission was not started: ${err instanceof Error ? err.message : String(err)}`);
        throw new CliExit(3);
      }
      printResult(result, store.listArtifacts(mission.id));
      throw new CliExit(result.review?.passed ? 0 : 1);
    });

  return program;
}

/** Execute the real CLI bootstrap without importing storage before .env loading. */
export async function runEntryPoint(
  argv: string[] = process.argv,
  deps: CliDependencies = {}
): Promise<number> {
  if (argv.includes("--approve") && argv.includes("--no-approve")) {
    console.error("--approve and --no-approve are contradictory");
    return 2;
  }
  try {
    if (deps.reconcileOrphanedMissions) await deps.reconcileOrphanedMissions();
    else await (await import("./agents/lifecycle.js")).reconcileOrphanedMissions();
    await createProgram(deps, argv).parseAsync(argv);
    return 0;
  } catch (err) {
    if (err instanceof CliExit) return err.code;
    if (err instanceof CommanderError) {
      if (err.code === "commander.helpDisplayed" || err.code === "commander.version") return 0;
      return err.exitCode;
    }
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedFile && invokedFile === fileURLToPath(import.meta.url)) {
  process.exitCode = await runEntryPoint(process.argv);
}
