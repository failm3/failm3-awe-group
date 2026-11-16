#!/usr/bin/env npx tsx
/** One bounded live unknown-capability mission with independent host qualification. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";

if (process.argv[2] !== "--run-authorized-final-acquisition" || process.argv.length !== 3) {
  throw new Error("Use exactly --run-authorized-final-acquisition");
}
if (process.env.AWE_OFFLINE_TEST) throw new Error("Refusing live acquisition under AWE_OFFLINE_TEST");
const runtimeEnvFile = process.env.AWE_RUNTIME_ENV_FILE;
if (!runtimeEnvFile || !path.isAbsolute(runtimeEnvFile)) {
  throw new Error("AWE_RUNTIME_ENV_FILE must select an absolute dedicated Nox Runtime env file");
}
const dotenv = await import("dotenv");
const loaded = dotenv.default.config({ path: path.resolve(runtimeEnvFile), override: true, quiet: true });
if (loaded.error || !loaded.parsed?.ROUTER_CHEAP_API_KEY) {
  throw new Error("Dedicated Nox Runtime env file must contain ROUTER_CHEAP_API_KEY");
}
delete process.env.OPENAI_API_KEY;
const runRoot = path.resolve("reports", `r2-final-acquisition-${Date.now()}`);
fs.mkdirSync(runRoot, { recursive: true });
process.env.AWE_DATA_DIR = path.join(runRoot, "state");

const storage = await import("../src/utils/storage.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../src/utils/spec-binding.js");
const { MissionManager } = await import("../src/agents/mission-manager.js");
const { loadCheckpoint } = await import("../src/agents/lifecycle.js");
const { createQualificationAuthority } = await import("../src/utils/qualification.js");
const { qualifyLocalTarget, listQualifiedInvocationReceipts } = await import("../src/utils/local-capability.js");
const { ordinaryPlan } = await import("../src/agents/capability-plane.js");
const { listModelCalls } = await import("../src/utils/model-ledger.js");
const { createHostModelRouter } = await import("../src/config/models.js");

const id = `r2-acquisition-${randomUUID()}`;
const workspace = storage.prepareMissionWorkspace(id);
const input = {
  source: "Lumen Harbor field pilot",
  period: "2026-W45",
  observations: [
    { site: "North", cohort: "Harbor", scheduled: 12, completed: 11, incidents: 2 },
    { site: "South", cohort: "Harbor", scheduled: 8, completed: 8, incidents: 1 },
    { site: "North", cohort: "Ridge", scheduled: 10, completed: 7, incidents: 3 },
  ],
};
const expected = {
  row_count: 3,
  scheduled: 30,
  completed: 26,
  incidents: 6,
  completion_percent: 86.67,
  sites: { North: { scheduled: 22, completed: 18, incidents: 5 }, South: { scheduled: 8, completed: 8, incidents: 1 } },
};
const fixture = path.join(workspace, "input", "pilot.observations.json");
fs.mkdirSync(path.dirname(fixture), { recursive: true });
fs.writeFileSync(fixture, JSON.stringify(input, null, 2) + "\n");
const fixtureHash = createHash("sha256").update(fs.readFileSync(fixture)).digest("hex");

const capability = "observation-digest-v1";
const spec = {
  title: "Unknown observation-digest mission",
  objective: `Acquire and actually use the new ${capability} competence to produce an exact operational digest from the supplied observations.`,
  scope: `Work only in ${workspace}. Read ${fixture}. The required new capability is ${capability}: it must independently read the JSON observation fixture, compute exact row/site totals and completion percentage, and persist digest.json and digest.md. A proposed local procedure source must have a stable path below ${workspace}; its fixed args must be exactly [${fixture}, ${workspace}]. Do not use a probe output directory as the final args output. No packages, network, publishing, deployment, purchases or external changes.`,
  acceptance_criteria: [
    "Head identifies the missing named capability, performs one bounded acquisition and replans with an actually qualified local procedure.",
    "The acquired procedure is invoked with its exact qualified executable bytes and fixed arguments; a durable invocation receipt is present.",
    "digest.json has exact numeric row_count, scheduled, completed, incidents, completion_percent (2 decimals), and a sites object keyed by site with totals; digest.md presents the same values with a reproducible method.",
    "All deliverables are registered artifacts whose bytes pass independent host verification and independent Nox QA.",
  ],
  suggested_tools: ["file_read", "file_write", "file_list", "shell", "save_artifact"],
  suggested_agents: ["researcher", "executor", "analyst", "coder"],
  estimated_complexity: "moderate" as const,
  risks: ["A model-authored observation is not qualification", "Visible examples do not replace independent arithmetic verification"],
};
const now = new Date().toISOString();
const pending = {
  id, title: spec.title, description: spec.objective, objective: spec.objective,
  acceptance_criteria: spec.acceptance_criteria, status: "pending_approval" as const,
  priority: "normal" as const, created_at: now, updated_at: now, artifacts: [], metadata: { specification: spec },
};
storage.saveMission(pending);
const approved = { ...pending, status: "approved" as const,
  metadata: { ...pending.metadata, approved_spec_binding: createApprovedSpecBinding(pending) } };
storage.saveMission(approved);
const specHash = assertApprovedSpecBinding(approved).spec_hash;

const issuerCredential = Object.freeze({ hostIndependentIssuer: true });
const capabilityHash = createHash("sha256").update(capability).digest("hex");
const profileHash = createHash("sha256").update("r2-live-acquisition-profile-v1").digest("hex");
const binding = { solverId: "local-capability", scope: "local-acquisition", specHash, capabilityHash, profileHash };
const authority = createQualificationAuthority({
  issuers: [{ principal: "independent-acquisition-qa", scopes: ["local-acquisition"] }],
  authenticateIssuer: value => value === issuerCredential ? "independent-acquisition-qa" : null,
  authorize: candidate => JSON.stringify(candidate) === JSON.stringify(binding),
});

const planning: Array<Record<string, unknown>> = [];
let failure: string | null = null;
let liveAdmission: ReturnType<typeof authority.admit> | null = null;
let qualificationPublications = 0;
let acquisitionPolicyCalls = 0;
const modelRoute = createHostModelRouter({ allowedModels: ["claude-opus-5-5", "deepseek-v4-flash", "claude-sonnet-5-5"],
  byRole: { researcher: "claude-sonnet-5-5", executor: "claude-sonnet-5-5", analyst: "claude-sonnet-5-5" } });
const manager = new MissionManager(approved, 30 * 60_000, {
  admission: { mode: "engineering-practice", missionId: id, specHash, authorizeExecution: () => true },
  acquisition: inputValue => {
    acquisitionPolicyCalls++;
    // This trusted host callback independently qualifies the real proposal once.
    // Replan/resume re-resolves that same durable admission; publishing a new
    // qualification on every policy evaluation would change the expected identity.
    // The solver never receives the issuer credential or an invocation grant.
    if (inputValue.mission.id !== id || inputValue.observation.capability !== capability ||
        inputValue.observation.status !== "available" || !inputValue.observation.acquired) return null;
    const proposal = inputValue.proposal;
    if (proposal.args.length !== 2 || proposal.args[0] !== fixture || proposal.args[1] !== workspace) return null;
    const qualificationId = `q-${id}`;
    const expectedTarget = inputValue.attempt.qualified_target;
    if (expectedTarget && expectedTarget.qualification_id !== qualificationId) return null;
    if (!liveAdmission) {
      if (expectedTarget) return null;
      const receiptId = `r-${randomUUID()}`;
      const issuedAt = Date.now();
      const evidenceRefs = proposal.probe_artifacts.map(probe => probe.artifact_id);
      if (evidenceRefs.length === 0) return null;
      const evidenceHash = createHash("sha256").update(JSON.stringify(proposal.probe_artifacts)).digest("hex");
      authority.qualify({ ...binding, qualificationId, receiptId,
        issuer: "independent-acquisition-qa", evidenceHash, evidenceRefs,
        issuedAt, expiresAt: issuedAt + 2 * 60 * 60_000 }, issuerCredential, 0);
      qualificationPublications++;
      liveAdmission = authority.admit(qualificationId, binding);
    }
    return qualifyLocalTarget(inputValue, { authority, admission: liveAdmission,
      authorizeTarget: (mission, target) => mission.id === id &&
        assertApprovedSpecBinding(mission).spec_hash === specHash &&
        target.executable_path.startsWith(workspace + path.sep) &&
        target.args.length === 2 && target.args[0] === fixture && target.args[1] === workspace &&
        target.probe_artifacts.every(probe => storage.listArtifacts(id).some(artifact =>
          artifact.id === probe.artifact_id && artifact.metadata.sha256 === probe.sha256)) });
  },
  modelRoute,
  deps: {
    planMission: async (mission, options) => {
      const { planMission } = await import("../src/agents/head-agent.js");
      const decision = await planMission(mission, options);
      const plan = ordinaryPlan(decision);
      planning.push({ kind: plan ? options?.capabilityAttempt ? "replan" : "plan" : decision.status,
        capability: "capability" in decision ? decision.capability : undefined,
        attempt: options?.capabilityAttempt?.attempt_id });
      return decision;
    },
  },
});

try {
  const result = await manager.run();
  fs.writeFileSync(path.join(runRoot, "qa-review.json"), JSON.stringify(result.review, null, 2));
} catch (error) {
  failure = error instanceof Error ? error.name : "ExecutionError";
}

const checks: Array<{ check: string; passed: boolean; detail?: string }> = [];
const check = (name: string, passed: boolean, detail?: string) => checks.push({ check: name, passed, ...(detail ? { detail } : {}) });
const final = storage.loadMission(id);
const artifacts = storage.listArtifacts(id);
const attempts = ((final?.metadata.capability_plane as { attempts?: any[] } | undefined)?.attempts ?? []);
const receipts = listQualifiedInvocationReceipts(id);
const execution = final?.metadata.execution as { delegations?: any[] } | undefined;
const calls = listModelCalls(id);
check("mission completed through independent Nox QA", final?.status === "completed", final?.status);
check("real Head and independent QA calls recorded", calls.some(call => call.role === "head-agent" && call.status === "completed") &&
  calls.some(call => call.role === "qa-agent" && call.status === "completed"));
check("unknown capability caused acquisition then replan", planning.some(item => item.kind === "acquire") && planning.some(item => item.kind === "replan"), JSON.stringify(planning));
check("exactly one structured qualified acquisition", attempts.length === 1 && !!attempts[0]?.qualified_target);
check("host published and reused one qualification across replan policy checks", qualificationPublications === 1 && acquisitionPolicyCalls >= 2);
check("actual invocation receipt bound to mission, attempt, executable and command", receipts.length === 1 &&
  receipts[0].mission_id === id && receipts[0].attempt_id === attempts[0]?.attempt_id &&
  receipts[0].executable_sha256 === attempts[0]?.qualified_target?.executable_sha256 &&
  receipts[0].command_sha256 === attempts[0]?.qualified_target?.command_sha256);
const checkpoint = loadCheckpoint(id);
// `metadata.execution` is written only at terminalization, so a paused run has
// no summary yet; the durable checkpoint records the same attribution.
const attributed = new Set<string>([
  ...((execution?.delegations ?? []) as Array<{ qualified_attempt_ids?: string[] }>)
    .flatMap(delegation => delegation.qualified_attempt_ids ?? []),
  ...((checkpoint?.completed ?? []) as Array<{ qualified_attempt_ids?: string[] }>)
    .flatMap(entry => entry.qualified_attempt_ids ?? []),
]);
check("specialist result attributes actual qualified invocation",
  !!attempts[0]?.attempt_id && attributed.has(attempts[0].attempt_id),
  `attributed=${JSON.stringify([...attributed])} status=${final?.status}`);

const digestArtifact = artifacts.find(artifact => artifact.name === "digest.json");
const markdownArtifact = artifacts.find(artifact => artifact.name === "digest.md");
let digest: any;
try { digest = digestArtifact?.path ? JSON.parse(fs.readFileSync(digestArtifact.path, "utf8")) : undefined; } catch {}
check("exact independently recomputed digest totals", !!digest && digest.row_count === expected.row_count &&
  digest.scheduled === expected.scheduled && digest.completed === expected.completed &&
  digest.incidents === expected.incidents && digest.completion_percent === expected.completion_percent);
check("exact independently recomputed site totals", !!digest && Object.entries(expected.sites).every(([site, totals]) =>
  Object.entries(totals).every(([key, value]) => digest.sites?.[site]?.[key] === value)));
check("human digest is present and consistent", !!markdownArtifact?.path && (() => {
  const text = fs.readFileSync(markdownArtifact.path!, "utf8");
  return ["30", "26", "6", "86.67"].every(value => text.includes(value)) && /method|formula|calculat/i.test(text);
})());
check("fixture unchanged", createHash("sha256").update(fs.readFileSync(fixture)).digest("hex") === fixtureHash);
check("all final artifact hashes match bytes", artifacts.every(artifact => !!artifact.path && fs.existsSync(artifact.path) &&
  createHash("sha256").update(fs.readFileSync(artifact.path)).digest("hex") === artifact.metadata.sha256));
check("provider monetary cost remains unknown", true, "UNKNOWN");
const summary = { schema: "r2-final-acquisition-live-v1", id, runRoot, status: final?.status, failure,
  approved_spec_hash: specHash, planning, attempts, qualification_publications: qualificationPublications,
  acquisition_policy_calls: acquisitionPolicyCalls, invocation_receipts: receipts,
  artifacts: artifacts.map(artifact => ({ id: artifact.id, name: artifact.name, sha256: artifact.metadata.sha256 })),
  model_calls: calls, provider_cost: "UNKNOWN", checks, passed: checks.every(item => item.passed) };
fs.writeFileSync(path.join(runRoot, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ id, runRoot, status: final?.status, failure, planning, receipts: receipts.length,
  checks, passed: summary.passed }, null, 2));
if (!summary.passed) process.exitCode = 1;
