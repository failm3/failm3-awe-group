/** One explicit, bounded engineering-practice mission. Not a product-qualification issuer. */
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

if (process.argv.length !== 3 || process.argv[2] !== "--run-authorized-local-web-practice") {
  throw new Error("Explicit --run-authorized-local-web-practice flag required");
}
if (process.env.AWE_OFFLINE_TEST === "1") throw new Error("Refusing to represent an offline fixture as live execution");
dotenv.config({ quiet: true });

// Nothing below supplies the test product or influences independent verification.
const runRoot = path.resolve("reports", `r1-local-web-${Date.now()}-${randomUUID().slice(0, 8)}`);
fs.mkdirSync(runRoot, { recursive: false });
process.env.AWE_DATA_DIR = path.join(runRoot, "state");
const id = `r1-web-${randomUUID()}`;

const { WEB_PRODUCT_CONTRACT, WEB_PRODUCT_CONTRACT_DIGEST, verifyWebProduct } =
  await import("../src/capabilities/web-product.js");
const storage = await import("../src/utils/storage.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../src/utils/spec-binding.js");
const { SpecificationSchema } = await import("../src/types/index.js");
const { MissionManager } = await import("../src/agents/mission-manager.js");
const { createHostModelRouter } = await import("../src/config/models.js");
const { listModelCalls } = await import("../src/utils/model-ledger.js");

// Model configuration retained the Router.Cheap credential in its private model
// adapter closure. Do not expose ambient provider/API credentials to subsequent
// host helpers or child processes; no shell/network tool is granted below.
for (const name of ["ROUTER_CHEAP_API_KEY", "OPENAI_API_KEY", "TAVILY_API_KEY", "AWE_API_SECRET"]) {
  delete process.env[name];
}

const criteria = [
  "Persist a solver-authored zero-dependency static task tracker at product/index.html.",
  "The independent r1-static-task-tracker-v1 verifier returns PASS for the exact persisted product tree, including bounded keyboard, persistence, filtering, literal-rendering and viewport checks.",
];
const specification = SpecificationSchema.parse({
  title: "Agent-built local static task tracker",
  objective: "Build the finite interactive task tracker below through the real specialist tool path; save its source tree in this mission workspace.",
  scope: "Only the local product/ static source tree and its registered artifacts. Create only the source files needed there; no reports, duplicate root-level files, tests or unrelated artifacts. No external content or network grants, no package installation/build scripts, no deployment, no external publication, no changes to host configuration or other missions. Do not create or edit independent verification receipts. Use the approved file tools; no solver-issued QA receipt can establish PASS.",
  acceptance_criteria: criteria,
  suggested_tools: ["file_write", "file_read", "file_list", "save_artifact"],
  suggested_agents: ["coder", "executor"],
  estimated_complexity: "simple",
  risks: [
    "A visually plausible or syntactically valid page is insufficient: every bounded real-browser interaction must pass.",
    "Every resource URL must resolve inside the product snapshot. Use relative paths only; data:, blob:, external and protocol-relative URLs are not permitted. To avoid an unsolicited /favicon.ico resource error, include a local product/favicon.svg and reference it from index.html as favicon.svg, with no external or data: URL.",
  ],
  web_product: { directory: "product", verifier: "r1-static-task-tracker-v1" },
});
const contract = { digest: WEB_PRODUCT_CONTRACT_DIGEST, requirements: WEB_PRODUCT_CONTRACT };
const now = new Date().toISOString();
storage.saveMission({
  id, title: specification.title, description: `${specification.objective}\n\nFINITE VERIFIER CONTRACT:\n${JSON.stringify(contract, null, 2)}`,
  objective: specification.objective, acceptance_criteria: criteria, status: "pending_approval",
  priority: "normal", artifacts: [], created_at: now, updated_at: now, metadata: {
    specification, finite_web_contract: contract,
    engineering_authorization: "User-authorized local R1 engineering-practice mission; no product qualification, deployment or publication",
  },
});
// This host-side transition records the already authorized, displayed static
// scope. A request body or model response cannot reach this resolver or flag.
const claim = storage.updateMissionAtomic(id, current => {
  if (current.status !== "pending_approval") return null;
  return { status: "approved", metadata: {
    ...current.metadata, approved_spec_binding: createApprovedSpecBinding(current),
    approved_local_practice_at: new Date().toISOString(),
  } };
});
if (!claim.applied) throw new Error("Local practice approval claim failed");
const approved = claim.mission!;
const specHash = assertApprovedSpecBinding(approved).spec_hash;
const approvedTools = new Set(specification.suggested_tools);
const approvedRoles = new Set(specification.suggested_agents);
const admission = {
  mode: "engineering-practice" as const, missionId: id, specHash,
  authorizeExecution: (_mission: unknown, target: { stage: string; role?: string; tools?: readonly string[] }) => {
    if (target.role !== undefined && !approvedRoles.has(target.role)) return false;
    if (target.tools?.some(tool => !approvedTools.has(tool))) return false;
    return new Set(["mission", "delegation", "repair", "effect", "acceptance"]).has(target.stage);
  },
};
let failure: string | undefined;
try {
  const modelRoute = createHostModelRouter({
    allowedModels: ["claude-opus-5-5", "claude-fable-5-2"],
    byRole: { coder: "claude-fable-5-2", executor: "claude-fable-5-2" },
  });
  await new MissionManager(approved, 600_000, { admission, modelRoute }).run();
} catch (error) {
  // Do not persist a provider response, URL or credential-bearing error body.
  failure = error instanceof Error ? error.name : "ExecutionError";
}

const mission = storage.loadMission(id)!;
const workspace = storage.missionArtifactDir(id);
let independent: Awaited<ReturnType<typeof verifyWebProduct>> | undefined;
let independentFailure: string | undefined;
try {
  independent = await verifyWebProduct({ workspaceRoot: workspace, projectDir: path.join(workspace, "product") });
} catch (error) {
  independentFailure = error instanceof Error ? error.name : "VerificationError";
}
const calls = listModelCalls(id);
const receiptPath = path.join(runRoot, "independent-verification.json");
if (independent) storage.atomicWriteJson(receiptPath, independent);
const accepted = mission.status === "completed" && independent?.outcome === "PASS";
const summary = {
  schema_version: 1,
  kind: "live-local-agent-built-static-web-practice",
  qualification: "engineering-practice-only-not-product-qualified",
  mission_id: id, run_root: runRoot, workspace,
  approved_spec_sha256: specHash, verifier_contract_sha256: WEB_PRODUCT_CONTRACT_DIGEST,
  mission_status: mission.status, failure, independent_failure: independentFailure,
  independent_outcome: independent?.outcome ?? "BLOCKED",
  independent_tree_sha256: independent?.tree_sha256 ?? null,
  independent_receipt: independent ? receiptPath : null,
  accepted, provider_cost: "UNKNOWN",
  model_calls: calls,
  artifacts: storage.listArtifacts(id).map(({ id, name, path, metadata }) => ({ id, name, path, sha256: metadata.sha256 })),
  deployment: "NOT_PERFORMED", publication: "NOT_PERFORMED",
};
storage.atomicWriteJson(path.join(runRoot, "summary.json"), summary);
fs.writeFileSync(path.join(runRoot, "approval-scope.json"), JSON.stringify({ id, approved, contract }, null, 2));
console.log(JSON.stringify({
  mission_id: id, status: mission.status, accepted, run_root: runRoot,
  independent_outcome: summary.independent_outcome, provider_cost: "UNKNOWN",
}, null, 2));
if (!accepted) process.exitCode = 1;
