#!/usr/bin/env npx tsx
/** Bounded live experiment: verified source artifact -> fresh target, equal-budget arms. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
import type { Mission, Specification } from "../src/types/index.js";

if (process.argv[2] !== "--run-authorized-memory-transfer") throw new Error("Explicit live memory-transfer flag required");
dotenv.config({ quiet: true });
delete process.env.AWE_OFFLINE_TEST;
const runRoot = path.resolve("reports", `r2-memory-transfer-${Date.now()}`);
fs.mkdirSync(runRoot, { recursive: true });
process.env.AWE_DATA_DIR = path.join(runRoot, "state");
const storage = await import("../src/utils/storage.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../src/utils/spec-binding.js");
const { createQualificationAuthority } = await import("../src/utils/qualification.js");
const { saveVerifiedExperience } = await import("../src/memory/experience.js");
const { executeSpecialist } = await import("../src/agents/specialists.js");
const { createHostModelRouter } = await import("../src/config/models.js");
const { listModelCalls } = await import("../src/utils/model-ledger.js");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const selection = { scope: "delimited-text-recovery", capabilityHash: sha("delimited-text-parser-v1"), profileHash: sha("fresh-specialist-equal-budget-v1") };
const MAX_STEPS = 10;
const MAX_RETRIES = 0;
const MODEL_ID = "claude-fable-5-2";
const modelRoute = createHostModelRouter({ allowedModels: [MODEL_ID], byRole: { coder: MODEL_ID } });
const runId = path.basename(runRoot);
const sourceId = `${runId}-source`;
const tools = ["file_read", "file_list", "file_write", "shell", "save_artifact"];
const contract = [
  "The input is UTF-8 delimited text. The first row is data; there is no special header treatment.",
  "Return an array of rows, each an array of field strings. Empty input returns [].",
  "A quoted field starts and ends with a double quote. It may contain the delimiter, CR/LF newlines and empty text.",
  "Two double quotes inside a quoted field decode to one literal double quote.",
  "Unquoted fields may be empty, including trailing fields. Accept LF and CRLF record separators.",
  "Malformed unterminated quotes, characters after a closing quote, or quotes inside an unquoted field must throw Error('INVALID_FORMAT').",
].join("\n") + "\n";
const require = createRequire(import.meta.url);

function makeMission(id: string, title: string, file: string, delimiter: string): Mission {
  const workspace = storage.prepareMissionWorkspace(id);
  const relative = file.split("/");
  const target = path.join(workspace, ...relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const functionName = file.includes("ledger") ? "parseLedgerCsv" : "parseRosterExport";
  fs.writeFileSync(target, `function ${functionName}(text) {\n  return text.trim().split(/\\r?\\n/).map(line => line.split('${delimiter}'));\n}\nmodule.exports = { ${functionName} };\n`);
  fs.writeFileSync(path.join(workspace, "FORMAT.md"), contract);
  const sample = delimiter === "," ? "a,b\n1,2\n" : "a;b\n1;2\n";
  const expected = JSON.stringify([["a", "b"], ["1", "2"]]);
  fs.writeFileSync(path.join(workspace, "visible.test.cjs"), `const assert = require('node:assert/strict');\nconst { ${functionName} } = require('./${relative.join("/")}');\nassert.deepEqual(${functionName}(${JSON.stringify(sample)}), ${expected});\nconsole.log('visible PASS');\n`);
  const specification: Specification = {
    title, objective: `Repair ${relative.join("/")} so its exported parser implements FORMAT.md for ${JSON.stringify(delimiter)}-delimited input.`,
    scope: `Work only in the current mission workspace. Read FORMAT.md and visible.test.cjs. Repair the existing exported function and run the visible test. No packages, network, external files, or changes to tests.`,
    acceptance_criteria: ["The existing module exports the required function", "The implementation satisfies the complete documented format, not only the visible example", "The visible test executes successfully"],
    suggested_tools: tools, suggested_agents: ["coder"], estimated_complexity: "simple", risks: ["Visible tests are intentionally incomplete; independent verification covers the documented edge cases"],
  };
  const now = new Date().toISOString();
  const pending: Mission = { id, title, description: "Fresh isolated software repair experiment", objective: specification.objective,
    acceptance_criteria: specification.acceptance_criteria, status: "pending_approval", priority: "normal",
    created_at: now, updated_at: now, artifacts: [], metadata: { specification } };
  storage.saveMission(pending);
  storage.saveMission({ ...pending, status: "approved", metadata: { specification, approved_spec_binding: createApprovedSpecBinding(pending) } });
  const approvedMission = storage.loadMission(id)!;
  const visibleSha256 = sha(fs.readFileSync(path.join(workspace, "visible.test.cjs")));
  storage.updateMission(id, { status: "running", metadata: { ...approvedMission.metadata, visible_test_sha256: visibleSha256 } });
  return storage.loadMission(id)!;
}

function verifySource(id: string, target: boolean) {
  const workspace = storage.prepareMissionWorkspace(id);
  const visible = path.join(workspace, "visible.test.cjs");
  const expectedVisibleHash = storage.loadMission(id)?.metadata.visible_test_sha256;
  if (typeof expectedVisibleHash !== "string" || sha(fs.readFileSync(visible)) !== expectedVisibleHash) throw new Error("Visible test was modified");
  const visibleRun = spawnSync(process.execPath, [visible], { cwd: workspace, encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
  if (visibleRun.status !== 0 || visibleRun.error) throw new Error(`Visible test failed: ${visibleRun.stdout}${visibleRun.stderr}${visibleRun.error ?? ""}`);
  const file = path.join(workspace, target ? "lib/roster.cjs" : "src/ledger.cjs");
  const api = require(file);
  const parse = target ? api.parseRosterExport : api.parseLedgerCsv;
  if (typeof parse !== "function") throw new Error("Missing required export");
  const verifiedArtifactSha256 = sha(fs.readFileSync(file));
  const d = target ? ";" : ",";
  const q = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = [["a", "plain", "9"], ["b", `with${d}delimiter`, ""], ["c", 'He said "yes"', "3"], ["d", "line1\r\nline2", "4"]];
  const input = rows.map(row => row.map((value, index) => index === 1 ? q(value) : value).join(d)).join("\r\n") + "\r\n";
  const assert = require("node:assert/strict") as typeof import("node:assert/strict");
  assert.deepEqual(parse(""), []);
  assert.deepEqual(parse(input), rows);
  assert.deepEqual(parse(`x${d}${d}\n`), [["x", "", ""]]);
  for (const invalid of [`a${d}"unterminated`, `a${d}"closed"x`, `a${d}bad"quote`]) assert.throws(() => parse(invalid), /INVALID_FORMAT/);
  const finalVisibleRun = spawnSync(process.execPath, [visible], { cwd: workspace, encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
  if (finalVisibleRun.status !== 0 || finalVisibleRun.error || sha(fs.readFileSync(file)) !== verifiedArtifactSha256 ||
      sha(fs.readFileSync(visible)) !== expectedVisibleHash) throw new Error("Implementation/test changed during independent verification");
  return { independent: true, passed: true, cases: 6, target, visible_test_passed: true, visible_test_sha256: expectedVisibleHash,
    artifactPath: file, artifactSha256: verifiedArtifactSha256 };
}

async function runArm(arm: "on" | "off", authority: ReturnType<typeof createQualificationAuthority>) {
  const id = `${runId}-target-${arm}`;
  if (!storage.loadMission(id)) makeMission(id, "Fresh roster export parser repair", "lib/roster.cjs", ";");
  const before = Date.now();
  const outcome = await executeSpecialist({ role: "coder", missionId: id,
    task: "Repair the assigned roster parser from its local documentation and visible tests.",
    context: "Fresh task. Do not assume another mission's code, data, API, approval or test results.",
    tools, expected_output: "A repaired lib/roster.cjs and an executed visible test" }, id,
    { maxSteps: MAX_STEPS, maxRetries: MAX_RETRIES, modelRoute, ...(arm === "on" ? { experience: { selection, authority, authorizeTarget: target =>
      target.missionId === id && target.role === "coder" && target.selection.scope === selection.scope } } : {}) });
  const duration = Date.now() - before;
  let verification: ReturnType<typeof verifySource> | null = null;
  let error: string | null = null;
  try { verification = verifySource(id, true); } catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
  const parserArtifacts = storage.listArtifacts(id).filter(artifact => artifact.name === "lib/roster.cjs" && artifact.path && outcome.artifacts.includes(artifact.id));
  const attributedParser = parserArtifacts.length === 1 && parserArtifacts[0].metadata.sha256 === verification?.artifactSha256 ? parserArtifacts[0] : null;
  storage.updateMission(id, { status: verification && attributedParser ? "completed" : "failed" });
  return { arm, mission_id: id, outcome, duration_ms: duration, attributed_parser_artifact_id: attributedParser?.id ?? null,
    independent_verification: verification, verification_error: error };
}

const source = makeMission(sourceId, "Source ledger parser repair", "src/ledger.cjs", ",");
const publicationTarget = makeMission(`${runId}-target-on`, "Fresh roster export parser repair", "lib/roster.cjs", ";");
let sourceOutcome;
let sourceVerification: ReturnType<typeof verifySource> | null = null;
let fatal: string | null = null;
let arms: Array<Awaited<ReturnType<typeof runArm>>> = [];
let experience: unknown = null;
const approved = assertApprovedSpecBinding(source);
const binding = { solverId: "coder", specHash: approved.spec_hash, ...selection };
const credential = Object.freeze({ hostOnly: true });
const authority = createQualificationAuthority({
  issuers: [{ principal: "independent-host-tests", scopes: [selection.scope] }],
  authenticateIssuer: value => value === credential ? "independent-host-tests" : null,
  authorize: candidate => candidate.solverId === binding.solverId && candidate.scope === binding.scope &&
    candidate.specHash === binding.specHash && candidate.capabilityHash === binding.capabilityHash && candidate.profileHash === binding.profileHash,
});
try {
  sourceOutcome = await executeSpecialist({ role: "coder", missionId: sourceId,
    task: "Repair the assigned ledger parser from its local documentation and visible tests.",
    context: "Solve this source task from its actual repository; no implementation is supplied.",
    tools, expected_output: "A repaired src/ledger.cjs and an executed visible test" }, sourceId, { maxSteps: MAX_STEPS, modelRoute });
  sourceVerification = verifySource(sourceId, false);
  const sourceArtifacts = storage.listArtifacts(sourceId).filter(artifact => artifact.name === "src/ledger.cjs" && artifact.path);
  if (sourceArtifacts.length !== 1) throw new Error("Verified source must have exactly one visible same-name artifact");
  const sourceArtifact = sourceArtifacts[0];
  if (!sourceArtifact?.path || sourceArtifact.metadata.sha256 !== sourceVerification.artifactSha256 ||
      !sourceOutcome.artifacts.includes(sourceArtifact.id)) throw new Error("Verified source implementation was not the attributed specialist artifact");
  const qa = storage.saveArtifactFile(sourceId, "independent-verification.json", JSON.stringify({
    independent: true, passed: true, cases: sourceVerification.cases, evidence: ["independent-host-tests-v1"],
    source_artifact_id: sourceArtifact.id, source_artifact_sha256: sourceVerification.artifactSha256,
    verifier_sha256: sha(fs.readFileSync(path.resolve("scripts/r2-memory-transfer.ts"))),
  }), "data");
  const issuedAt = Date.now();
  const receipt = { ...binding, qualificationId: `${runId}-qualification`, receiptId: `${runId}-receipt`,
    issuer: "independent-host-tests", evidenceHash: qa.metadata.sha256 as string,
    evidenceRefs: [sourceArtifact.id, qa.id], issuedAt, expiresAt: issuedAt + 3_600_000 };
  const qualified = authority.qualify(receipt, credential, 0);
  storage.updateMission(sourceId, { status: "completed", artifacts: [sourceArtifact.id, qa.id] });
  const record = { version: 1 as const, ...selection, solverId: "coder", sourceMissionId: sourceId,
    sourceSpecHash: approved.spec_hash, sourceArtifactId: sourceArtifact.id, sourceSha256: sourceVerification.artifactSha256,
    verificationArtifactId: qa.id, verificationSha256: qa.metadata.sha256 as string,
    qualificationId: qualified.qualificationId, qualificationGeneration: qualified.generation, receiptId: qualified.receipt.receiptId,
    createdAt: new Date(issuedAt).toISOString() };
  const saved = saveVerifiedExperience(record, selection,
    { mission: publicationTarget, role: "coder", authorize: target => target.missionId === publicationTarget.id }, authority);
  experience = { ...record, retrieved_reference_sha256: sha(saved.reference) };
  const order = Date.now() % 2 ? ["on", "off"] as const : ["off", "on"] as const;
  for (const arm of order) arms.push(await runArm(arm, authority));
} catch (error) {
  fatal = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
const on = arms.find(arm => arm.arm === "on");
const off = arms.find(arm => arm.arm === "off");
const validityChecks = {
  source_specialist_completed: sourceOutcome?.success === true,
  source_independently_verified: sourceVerification?.passed === true,
  verified_experience_admitted: !!experience,
  memory_on_reference_actually_injected: !!experience && on?.outcome.experience?.qualificationId === (experience as { qualificationId: string }).qualificationId &&
    on?.outcome.experience?.referenceSha256 === (experience as { retrieved_reference_sha256: string }).retrieved_reference_sha256,
  both_target_arms_executed: !!on && !!off,
  equal_pinned_model_and_max_step_cap: !!on && !!off && on.outcome.model === MODEL_ID && off.outcome.model === MODEL_ID,
  equal_actual_provider_retry_option: on?.outcome.provider_max_retries === MAX_RETRIES && off?.outcome.provider_max_retries === MAX_RETRIES,
  memory_off_received_no_reference: off?.outcome.experience === undefined,
  both_target_delegations_produced_deliverables: on?.outcome.success === true && off?.outcome.success === true &&
    on.outcome.artifacts.length > 0 && off.outcome.artifacts.length > 0,
  both_arms_modified_and_attributed_assigned_parser: !!on?.attributed_parser_artifact_id && !!off?.attributed_parser_artifact_id,
};
const modelCalls = listModelCalls().filter(call => call.mission_id?.startsWith(runId));
const experimentValid = Object.values(validityChecks).every(Boolean) && !fatal &&
  [on?.mission_id, off?.mission_id].every(id => modelCalls.filter(call => call.mission_id === id && call.status === "completed").length === 1) &&
  modelCalls.every(call => call.model === MODEL_ID);
const correctnessTransferObserved = on?.independent_verification?.passed === true && !!off && !off.independent_verification;
const result = { schema: 1, run_root: runRoot, source_mission_id: sourceId, source_outcome: sourceOutcome,
  source_verification: sourceVerification, experience, target_arms: arms, validity_checks: validityChecks,
  experiment_valid: experimentValid, transfer_observed: correctnessTransferObserved, fatal,
  comparison: { memory_on_passed: on?.independent_verification?.passed === true,
    memory_off_passed: off?.independent_verification?.passed === true, same_independent_verifier: true,
    configured_max_steps_each: MAX_STEPS, configured_model_each: MODEL_ID, configured_provider_retries_each: 0,
    token_or_spend_budget_equality: "NOT_CLAIMED" },
  conclusion: !experimentValid ? "EXPERIMENT_INVALID" : correctnessTransferObserved ? "OBSERVED_IN_THIS_SINGLE_PAIR"
    : "NO_DEMONSTRATED_CORRECTNESS_TRANSFER_IN_THIS_PAIR",
  model_calls: modelCalls, provider_cost: "UNKNOWN" };
fs.writeFileSync(path.join(runRoot, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, model_calls: result.model_calls.map(call => ({ role: call.role, status: call.status, model: call.model, usage: call.usage })) }, null, 2));
if (!experimentValid) process.exitCode = 1;
