/**
 * E1-RECOVERY-CONTINUE-02 — offline resume policy regression tests.
 *
 * Mission 25be2dad paused with designer/devops/analyst successful and coder
 * failed. The previous implementation skipped every checkpoint entry,
 * including the failed coder. It also matched by array index even though the
 * Head Agent generates a fresh plan on resume and may reorder delegations.
 *
 * Run: npx tsx src/tests/resume-policy.test.ts
 */

import { successfulDelegationIndices } from "../agents/mission-manager.js";
import type { DelegationPlanItem } from "../agents/head-agent.js";
import type { MissionCheckpoint } from "../agents/lifecycle.js";
import { resolveModelForRole } from "../agents/specialists.js";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function delegation(agent_role: string, task = agent_role): DelegationPlanItem {
  return {
    agent_role,
    task,
    context: "",
    tools: ["shell"],
    expected_output: "output",
    parallel: false,
  };
}

function checkpoint(
  entries: Array<{ index: number; role: string; status: "success" | "partial" | "failed" }>
): MissionCheckpoint {
  return {
    mission_id: "resume-test",
    version: 1,
    saved_at: new Date().toISOString(),
    timeout_ms: 900000,
    elapsed_ms: 900000,
    completed: entries.map((entry) => ({
      index: entry.index,
      agent_role: entry.role,
      task: "",
      status: entry.status,
      output: "",
      duration_ms: 1000,
    })),
    repair_iterations: 0,
    reason: "timeout",
  };
}

console.log("AWE GROUP — resume policy regression tests");

console.log("\nT1 — the real 25be2dad checkpoint retries failed coder only");
{
  const plan = [
    delegation("designer"),
    delegation("coder"),
    delegation("devops"),
    delegation("analyst"),
    delegation("coder", "apply fixes"),
    delegation("writer"),
  ];
  const cp = checkpoint([
    { index: 0, role: "designer", status: "success" },
    { index: 1, role: "coder", status: "failed" },
    { index: 2, role: "devops", status: "success" },
    { index: 3, role: "analyst", status: "success" },
  ]);
  const skipped = successfulDelegationIndices(plan, cp);
  check("successful designer is skipped", skipped.has(0));
  check("failed original coder is retried", !skipped.has(1));
  check("successful devops is skipped", skipped.has(2));
  check("successful analyst is skipped", skipped.has(3));
  check("new corrective coder still runs", !skipped.has(4));
  check("new writer still runs", !skipped.has(5));
}

console.log("\nT2 — reordered fresh plan does not repeat successful work");
{
  const plan = [
    delegation("coder"),
    delegation("writer"),
    delegation("designer"),
    delegation("analyst"),
    delegation("devops"),
  ];
  const cp = checkpoint([
    { index: 0, role: "designer", status: "success" },
    { index: 1, role: "coder", status: "failed" },
    { index: 2, role: "devops", status: "success" },
    { index: 3, role: "analyst", status: "success" },
  ]);
  const skipped = successfulDelegationIndices(plan, cp);
  check("designer matched at its new index", skipped.has(2));
  check("analyst matched at its new index", skipped.has(3));
  check("devops matched at its new index", skipped.has(4));
  check("coder is not accidentally skipped at checkpoint index 0", !skipped.has(0));
}

console.log("\nT3 — repeated roles match by occurrence and only success is reusable");
{
  const plan = [delegation("coder", "first"), delegation("coder", "second")];
  const cp = checkpoint([
    { index: 0, role: "coder", status: "success" },
    { index: 1, role: "coder", status: "failed" },
  ]);
  const skipped = successfulDelegationIndices(plan, cp);
  check("first successful coder occurrence is skipped", skipped.has(0));
  check("failed second coder occurrence is retried", !skipped.has(1));

  const partial = checkpoint([{ index: 0, role: "coder", status: "partial" }]);
  check("partial result is not treated as verified success", successfulDelegationIndices(plan, partial).size === 0);
  check("missing checkpoint runs everything", successfulDelegationIndices(plan, null).size === 0);
}

console.log("\nT4 — scoped coder fallback does not change the general coding route");
check("top-level coder uses the controlled Fable fallback", resolveModelForRole("coder") === "claude-fable-5-2");
check("general coding remains on Kimi", resolveModelForRole("coding") === "kimi-k3.1-pro");

console.log(`\npassed: ${passed}, failed: ${failed}`);
if (failed) process.exit(1);
console.log("All resume policy regression tests passed.");
