import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";
import {
  saveMission,
  loadMission,
  listMissions,
  updateMissionAtomic,
  DATA_DIR,
  listArtifacts,
  appendLog,
} from "../utils/storage.js";
import { createSpecification } from "../agents/prompt-master.js";
import { createMissionManager, installTerminationHandlers } from "../agents/mission-manager.js";
import type { Mission } from "../types/index.js";
import * as crypto from "crypto";
import { APPROVED_SPEC_BINDING_KEY, createApprovedSpecBinding, SpecBindingError } from "../utils/spec-binding.js";
import { resolveConfiguredMissionAdmission } from "../config/mission-policy.js";
import { resolveConfiguredMissionExperience } from "../config/experience-policy.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function printMission(m: Mission) {
  console.log(`\n  ID:          ${m.id}`);
  console.log(`  Title:       ${m.title}`);
  console.log(`  Status:      ${m.status}`);
  console.log(`  Objective:   ${m.objective}`);
  console.log(`  Criteria:`);
  m.acceptance_criteria.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
  console.log(`  Created:     ${m.created_at}`);
}

export async function runCli(options: { installTerminationHandlers?: boolean } = {}) {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║          AWE GROUP — Universal Agent           ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  while (true) {
    console.log("\n─────────────────────────────────────────────────");
    console.log("  1. New mission (from natural language request)");
    console.log("  2. List missions");
    console.log("  3. View mission details");
    console.log("  4. View mission artifacts");
    console.log("  5. View mission logs");
    console.log("  6. Exit");
    console.log("─────────────────────────────────────────────────");

    const choice = await ask("\nSelect [1-6]: ");

    if (choice === "1") {
      const request = await ask("\nEnter your request:\n> ");
      if (!request) continue;

      console.log("\n⚡ Prompt Master is analyzing your request...");
      try {
        const spec = await createSpecification(request);

        console.log("\n📋 Generated Specification:\n");
        console.log(`  Title:     ${spec.title}`);
        console.log(`  Objective: ${spec.objective}`);
        console.log(`  Scope:     ${spec.scope}`);
        console.log(`  Criteria:`);
        spec.acceptance_criteria.forEach((c, i) => console.log(`    ${i + 1}. ${c}`));
        console.log(`  Tools:     ${spec.suggested_tools.join(", ")}`);
        console.log(`  Agents:    ${spec.suggested_agents.join(", ")}`);
        console.log(`  Complexity:${spec.estimated_complexity}`);
        if (spec.risks.length) {
          console.log(`  Risks:`);
          spec.risks.forEach((r) => console.log(`    ! ${r}`));
        }

        // Every generated specification is durable before the approval prompt.
        const now = new Date().toISOString();
        const mission: Mission = {
          id: crypto.randomUUID(),
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
        saveMission(mission);
        appendLog(mission.id, "Mission specification saved as pending_approval via interactive CLI");

        const approve = await ask("\nApprove and execute? [y/N]: ");
        if (approve.toLowerCase() !== "y") {
          console.log(`Mission ${mission.id} remains pending_approval; no execution was started.`);
          console.log(`Approve later with: scripts/run-nox-runtime.sh approve ${mission.id}`);
          continue;
        }

        const claim = updateMissionAtomic(
          mission.id,
          (cur) => {
            if (cur.status !== "pending_approval") return null;
            const binding = createApprovedSpecBinding(cur);
            if (binding.spec_hash !== createApprovedSpecBinding(mission).spec_hash) {
              throw new SpecBindingError(cur.id, "changed while awaiting approval; reload and approve again");
            }
            return { status: "approved", metadata: { ...cur.metadata, [APPROVED_SPEC_BINDING_KEY]: binding } };
          }
        );
        if (!claim.applied || !claim.mission) throw new Error("Mission changed before approval");
        appendLog(mission.id, "Mission explicitly approved via interactive CLI");

        console.log(`\n🚀 Starting mission ${mission.id}...`);
        console.log("   Head Agent → Mission Manager → Specialists → QA");

        const admission = await resolveConfiguredMissionAdmission(claim.mission);
        const experience = await resolveConfiguredMissionExperience(claim.mission);
        const manager = createMissionManager(claim.mission, undefined, { allowedStatuses: ["approved"], admission, experience });
        const uninstall = options.installTerminationHandlers ? installTerminationHandlers(manager) : () => {};
        let result: Awaited<ReturnType<typeof manager.run>>;
        try {
          result = await manager.run();
        } finally {
          uninstall();
        }

        console.log(`\n${"═".repeat(50)}`);
        if (result.review?.passed) {
          console.log(`✅ MISSION COMPLETED — QA score: ${result.review.score}/10`);
        } else if (result.mission.status === "paused" || result.mission.status === "cancelled") {
          console.log(`⏸ MISSION ${result.mission.status.toUpperCase()}`);
        } else {
          console.log(`❌ MISSION FAILED — QA score: ${result.review?.score ?? 0}/10`);
          if (result.review?.defects.length) {
            console.log("   Defects:");
            result.review.defects.forEach((d) => console.log(`     ! [${d.severity}] ${d.issue}`));
          }
        }
        console.log(`${"═".repeat(50)}`);

        // Show artifacts
        const artifacts = listArtifacts(mission.id);
        if (artifacts.length) {
          console.log(`\n📦 Artifacts (${artifacts.length}):`);
          artifacts.forEach((a) => console.log(`   • ${a.name} [${a.type}] ${a.path ?? ""}`));
        }
      } catch (err) {
        console.error(`\n❌ Error: ${err}`);
      }
    } else if (choice === "2") {
      const missions = listMissions();
      if (!missions.length) {
        console.log("\n  No missions yet.");
      } else {
        console.log(`\n  ${missions.length} mission(s):\n`);
        missions.forEach((m, i) => {
          console.log(`  ${i + 1}. [${m.status}] ${m.title}`);
          console.log(`     ID: ${m.id}`);
        });
      }
    } else if (choice === "3" || choice === "4" || choice === "5") {
      const missions = listMissions();
      if (!missions.length) {
        console.log("\n  No missions yet.");
        continue;
      }
      missions.forEach((m, i) => console.log(`  ${i + 1}. [${m.status}] ${m.title}`));
      const idx = await ask("\nSelect mission number: ");
      const mission = missions[parseInt(idx) - 1];
      if (!mission) {
        console.log("Invalid selection.");
        continue;
      }

      if (choice === "3") {
        printMission(mission);
      } else if (choice === "4") {
        const artifacts = listArtifacts(mission.id);
        if (!artifacts.length) {
          console.log("\n  No artifacts.");
        } else {
          console.log(`\n  Artifacts (${artifacts.length}):\n`);
          artifacts.forEach((a) => {
            console.log(`  • ${a.name} [${a.type}]`);
            if (a.content) console.log(`    ${a.content.slice(0, 200)}...`);
            if (a.path) console.log(`    Path: ${a.path}`);
          });
        }
      } else if (choice === "5") {
        const logFile = path.join(DATA_DIR, `${mission.id}.log`);
        if (!fs.existsSync(logFile)) {
          console.log("\n  No logs.");
        } else {
          const logs = fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
          console.log(`\n  Logs (${logs.length} entries):\n`);
          logs.forEach((l) => console.log(`  ${l}`));
        }
      }
    } else if (choice === "6") {
      console.log("\nGoodbye.");
      rl.close();
      process.exit(0);
    } else {
      console.log("Invalid choice.");
    }
  }
}
