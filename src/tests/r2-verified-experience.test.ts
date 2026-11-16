import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { Agent } from "@mastra/core/agent";
import { after } from "node:test";
import type { Mission, Specification } from "../types/index.js";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r2-experience-test-"));
after(() => fs.rmSync(root, { recursive: true, force: true }));
process.env.AWE_DATA_DIR = path.join(root, "state");
const storage = await import("../utils/storage.js");
const { createApprovedSpecBinding } = await import("../utils/spec-binding.js");
const { createQualificationAuthority } = await import("../utils/qualification.js");
const { saveVerifiedExperience, retrieveVerifiedExperience } = await import("../memory/experience.js");
const { executeSpecialist } = await import("../agents/specialists.js");
const { allTools } = await import("../tools/index.js");
const sha = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const selection = { scope: "delimited-text-recovery", capabilityHash: sha("parser"), profileHash: sha("fresh-context-v1") };
const binding = { solverId: "coder", specHash: "a".repeat(64), ...selection };
const credential = Object.freeze({ hostOnly: true });
const authority = createQualificationAuthority({
  issuers: [{ principal: "independent-qa", scopes: [selection.scope] }],
  authenticateIssuer: value => value === credential ? "independent-qa" : null,
  authorize: candidate => candidate.solverId === binding.solverId && candidate.scope === binding.scope &&
    candidate.specHash === (storage.loadMission("source")?.metadata.approved_spec_binding as { spec_hash: string } | undefined)?.spec_hash &&
    candidate.capabilityHash === binding.capabilityHash && candidate.profileHash === binding.profileHash,
  now: () => 1000,
});

function sourceFixture(): { record: import("../memory/experience.js").ExperienceRecord; contentPath: string; verificationPath: string } {
  const specification: Specification = {
    title: "Source parser repair", objective: "Repair a real parser", scope: "Source task only",
    acceptance_criteria: ["Independent tests pass"], suggested_tools: ["shell", "file_read", "file_write"],
    suggested_agents: ["coder"], estimated_complexity: "simple", risks: [],
  };
  const now = new Date().toISOString();
  const mission: Mission = { id: "source", title: specification.title, description: specification.scope,
    objective: specification.objective, acceptance_criteria: specification.acceptance_criteria,
    status: "pending_approval", priority: "normal", created_at: now, updated_at: now, artifacts: [], metadata: { specification } };
  storage.saveMission(mission);
  storage.saveMission({ ...mission, status: "approved", metadata: { specification, approved_spec_binding: createApprovedSpecBinding(mission) } });
  const approved = assertApproved(storage.loadMission("source")!);
  const content = storage.saveArtifactFile("source", "parser.js", "export function parse(text) { /* independently tested implementation */ return []; }\n", "code");
  const verification = storage.saveArtifactFile("source", "independent-qa.json", JSON.stringify({
    independent: true, passed: true, cases: 6, evidence: ["independent-host-tests-v1"],
    source_artifact_id: content.id, source_artifact_sha256: content.metadata.sha256, verifier_sha256: sha("test verifier"),
  }), "data");
  const issuedAt = 1000;
  const receipt = { ...binding, specHash: approved.spec_hash, qualificationId: "source-qualification", receiptId: "source-receipt",
    issuer: "independent-qa", evidenceHash: verification.metadata.sha256 as string,
    evidenceRefs: [content.id, verification.id], issuedAt, expiresAt: 2000 };
  const state = authority.qualify(receipt, credential, 0);
  storage.updateMission("source", { status: "completed", artifacts: [content.id, verification.id] });
  const record = { version: 1 as const, ...selection, solverId: binding.solverId, sourceMissionId: "source",
    sourceSpecHash: approved.spec_hash, sourceArtifactId: content.id, sourceSha256: content.metadata.sha256 as string,
    verificationArtifactId: verification.id, verificationSha256: verification.metadata.sha256 as string,
    qualificationId: "source-qualification", qualificationGeneration: state.generation, receiptId: "source-receipt",
    createdAt: new Date(1000).toISOString() };
  return { record, contentPath: content.path!, verificationPath: verification.path! };
}
function assertApproved(mission: Mission) {
  const binding = mission.metadata.approved_spec_binding as { spec_hash: string };
  return { spec_hash: binding.spec_hash };
}

test("only hash-intact independently qualified source artifacts enter specialist execution", async () => {
  const { record, contentPath, verificationPath } = sourceFixture();
  const sourceTarget = () => ({ mission: storage.loadMission("source")!, role: "coder", authorize: () => true });
  assert.equal(retrieveVerifiedExperience(selection, sourceTarget(), authority), null, "unregistered source cannot be recalled");
  assert.throws(() => saveVerifiedExperience(record, selection, sourceTarget(), authority), /another completed mission|not approved for execution/);

  const targetSpec: Specification = { title: "Fresh target", objective: "Repair a different parser", scope: "Target only",
    acceptance_criteria: ["Independent target tests pass"], suggested_tools: ["file_write"],
    suggested_agents: ["coder"], estimated_complexity: "simple", risks: [] };
  const now = new Date().toISOString();
  const target: Mission = { id: "target", title: targetSpec.title, description: targetSpec.scope, objective: targetSpec.objective,
    acceptance_criteria: targetSpec.acceptance_criteria, status: "pending_approval", priority: "normal",
    created_at: now, updated_at: now, artifacts: [], metadata: { specification: targetSpec } };
  storage.saveMission(target);
  const targetPolicy = (policy = true) => ({ mission: storage.loadMission("target")!, role: "coder", authorize: () => policy });
  assert.throws(() => saveVerifiedExperience(record, selection, targetPolicy(), authority), /explicit approval/);
  storage.saveMission({ ...target, status: "approved", metadata: { specification: targetSpec, approved_spec_binding: createApprovedSpecBinding(target) } });
  assert.throws(() => saveVerifiedExperience(record, selection, targetPolicy(false), authority), /target denied/);
  const saved = saveVerifiedExperience(record, selection, targetPolicy(), authority);
  const unrelatedRole = { mission: storage.loadMission("target")!, role: "writer", authorize: () => true };
  assert.equal(retrieveVerifiedExperience(selection, unrelatedRole, authority), null,
    "a persisted coder record is not injected into an incompatible writer role");
  assert.match(saved.reference, /<verified_experience/);
  assert.equal(retrieveVerifiedExperience({ ...selection, scope: "unrelated" }, targetPolicy(), authority), null);
  assert.equal(retrieveVerifiedExperience({ ...selection, capabilityHash: "f".repeat(64) }, targetPolicy(), authority), null);
  storage.updateMission("target", { status: "running" });
  const originalGenerate = Agent.prototype.generate;
  let instructions = "";
  let userMessage = "";
  let generateOptions: any;
  let memoryOnPrepareStep: (() => Promise<unknown>) | undefined;
  try {
    Agent.prototype.generate = async function (this: InstanceType<typeof Agent>, messages: any, options: any) {
      instructions = String(await this.getInstructions());
      userMessage = messages[0].content;
      generateOptions = options;
      const grant = storage.prepareMissionWorkspace("target");
      const written = await allTools.file_write.execute?.({ path: path.join(grant, "target.js"),
        content: "export const adapted = true;\n", mission_id: "target" }, {});
      assert.equal((written as { success?: boolean } | undefined)?.success, true, JSON.stringify(written));
      return { text: "saved", finishReason: "stop", toolCalls: [], toolResults: [],
        totalUsage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 } } as any;
    } as typeof originalGenerate;
    const outcome = await executeSpecialist({ role: "coder", task: "Repair target", context: "Fresh context",
      tools: ["file_write"], expected_output: "Target implementation", missionId: "target" }, "target",
      { experience: { selection, authority, authorizeTarget: () => true } });
    assert.equal(outcome.success, true, outcome.issues?.join("; "));
    assert.doesNotMatch(instructions, /independently tested implementation/);
    assert.match(userMessage, /independently tested implementation/);
    assert.match(userMessage, /UNTRUSTED REFERENCE DATA/);
    assert.equal(outcome.experience?.qualificationId, record.qualificationId);
    assert.equal(outcome.experience?.referenceSha256, sha(saved.reference));
    assert.equal(generateOptions.maxRetries, 0);
    assert.equal(outcome.provider_max_retries, 0);
    memoryOnPrepareStep = generateOptions.experimental_prepareStep;
    await memoryOnPrepareStep!();
    const withoutExperience = await executeSpecialist({ role: "coder", task: "Repair target", context: "Fresh context",
      tools: ["file_write"], expected_output: "Target implementation", missionId: "target" }, "target", { maxRetries: 0 });
    assert.equal(withoutExperience.provider_max_retries, 0);
    assert.equal(withoutExperience.experience, undefined);
    assert.equal(generateOptions.maxRetries, 0);
    assert.doesNotMatch(userMessage, /UNTRUSTED REFERENCE DATA/);
  } finally { Agent.prototype.generate = originalGenerate; }

  const originalContent = fs.readFileSync(contentPath);
  fs.writeFileSync(contentPath, "tampered");
  try { assert.throws(() => retrieveVerifiedExperience(selection, targetPolicy(), authority), /bytes differ/); }
  finally { fs.writeFileSync(contentPath, originalContent); }
  const originalVerification = fs.readFileSync(verificationPath);
  fs.writeFileSync(verificationPath, JSON.stringify({ independent: true, passed: true, source_artifact_id: record.sourceArtifactId,
    source_artifact_sha256: "f".repeat(64) }));
  try { assert.throws(() => retrieveVerifiedExperience(selection, targetPolicy(), authority), /identity|bytes differ/); }
  finally { fs.writeFileSync(verificationPath, originalVerification); }
  authority.revoke(record.qualificationId, record.qualificationGeneration, credential, "Negative retrieval fence");
  assert.throws(() => retrieveVerifiedExperience(selection, targetPolicy(), authority), /revoked|stale/);
  assert.throws(() => saved.checkDispatch(), /revoked|stale/);
  await assert.rejects(memoryOnPrepareStep!(), /revoked|stale/);
});
