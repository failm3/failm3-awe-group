#!/usr/bin/env npx tsx
/** Two bounded professional missions. Offline validation never imports provider code. */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { Mission, QAReview } from "../../src/types/index.js";
import {
  HOST_EXPERIENCE_POLICY, HOST_MODEL_POLICY, LIVE_APPROVAL, MODEL_IDS,
  analyticsFixture, researchFixture, type MissionFixture,
} from "./fixtures.js";
import {
  check, fixtureNegativeControls, independentVerification, overlapProof, protocolAttestation, readStableFile,
  verifyCandidateEvidence, type CandidateEvidence, type Check, type DelegationInterval,
} from "./verifier.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const mode = process.argv[2];
let activeRunRoot: string | null = null;
if ((mode !== "--validate-only" && mode !== "--run-authorized-professional") || process.argv.length !== 3) {
  throw new Error("Use exactly --validate-only (offline) or --run-authorized-professional (live)");
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.name;
  return "NonErrorExecutionFailure";
}
function writeJson(file: string, value: unknown): void {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(fd, bytes, "utf8"); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  const directory = fs.openSync(path.dirname(file), "r");
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function writeBytes(file: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  const directory = fs.openSync(path.dirname(file), "r");
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}

function validateOnly(): never {
  const controls = fixtureNegativeControls();
  const attestation = protocolAttestation(HERE);
  const concurrencyChecks = [
    check("positive real interval intersection proves concurrency",
      (overlapProof([
        { mission_id: "offline-research", started_at: "2026-01-01T00:00:00.000Z", finished_at: "2026-01-01T00:00:02.000Z" },
        { mission_id: "offline-analytics", started_at: "2026-01-01T00:00:01.000Z", finished_at: "2026-01-01T00:00:03.000Z" },
      ]) as { proven: boolean }).proven === true),
    check("sequential execution is not represented as concurrent",
      (overlapProof([
        { mission_id: "offline-research", started_at: "2026-01-01T00:00:00.000Z", finished_at: "2026-01-01T00:00:01.000Z" },
        { mission_id: "offline-analytics", started_at: "2026-01-01T00:00:01.000Z", finished_at: "2026-01-01T00:00:02.000Z" },
      ]) as { proven: boolean }).proven === false),
    check("missing intervals do not prove concurrency",
      (overlapProof([]) as { proven: boolean }).proven === false),
  ];
  const checks: Check[] = [
    check("valid reference fixtures independently pass", controls.references.passed, JSON.stringify(controls.references)),
    ...controls.controls.map(control => check(`${control.kind} control: ${control.name}`, control.passed, control.detail)),
    ...concurrencyChecks,
  ];
  const result = {
    schema: "r2-final-professional-validation-v1",
    mode: "validate-only",
    network_calls: 0,
    model_calls: 0,
    missions_executed: 0,
    references: controls.references,
    negative_controls: controls.controls,
    checks,
    attestation,
    provider_cost: "UNKNOWN",
    passed: checks.every(item => item.passed),
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

interface MissionEvidence {
  mission_id: string;
  status: string;
  started_at: string;
  finished_at: string;
  execution_error: string | null;
  approved_spec_hash: string;
  host_execution_policy: unknown;
  artifacts: unknown[];
  intervals: DelegationInterval[];
  model_calls: unknown[];
  qa_review: QAReview | null;
  qa_candidate_receipt: unknown;
  candidate_evidence_path: string | null;
  candidate_evidence_sha256: string | null;
  delegation_tree: unknown;
  independent_verification: ReturnType<typeof independentVerification>;
  checks: Check[];
  passed: boolean;
}

async function live(): Promise<never> {
  if (process.env.AWE_OFFLINE_TEST !== undefined) throw new Error("Refusing live execution when AWE_OFFLINE_TEST is present");
  const selected = process.env.AWE_RUNTIME_ENV_FILE;
  if (!selected || !path.isAbsolute(selected)) throw new Error("AWE_RUNTIME_ENV_FILE must be an absolute dedicated Nox Runtime env file");
  // Never select or disclose ambient developer credentials. Do not print this path.
  const dotenv = await import("dotenv");
  const loaded = dotenv.default.config({ path: path.resolve(selected), override: true });
  if (loaded.error || !loaded.parsed?.ROUTER_CHEAP_API_KEY) throw new Error("Dedicated Nox Runtime env must contain ROUTER_CHEAP_API_KEY");
  delete process.env.OPENAI_API_KEY;
  delete process.env.AWE_MISSION_EXPERIENCE_MODULE;
  if (process.env.AWE_OFFLINE_TEST !== undefined) throw new Error("Credential file must not enable AWE_OFFLINE_TEST");

  const runRoot = path.join(ROOT, "reports", `r2-final-professional-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`);
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  activeRunRoot = runRoot;
  process.env.AWE_DATA_DIR = path.join(runRoot, "state");
  const initialAttestation = protocolAttestation(HERE);
  writeJson(path.join(runRoot, "attestation.json"), initialAttestation);
  const credentialEvidence = {
    source: "absolute-dedicated-runtime-env-file",
    loaded_before_provider_imports: true,
    override: true,
    router_cheap_key_present: true,
    openai_api_key_deleted: true,
    offline_test_absent: true,
    path_disclosed: false,
    key_material_or_fingerprints_recorded: false,
  };

  const storage = await import("../../src/utils/storage.js");
  const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../../src/utils/spec-binding.js");
  const { MissionManager } = await import("../../src/agents/mission-manager.js");
  const { createHostModelRouter } = await import("../../src/config/models.js");
  const { resolveConfiguredMissionExperience } = await import("../../src/config/experience-policy.js");
  const { listModelCalls } = await import("../../src/utils/model-ledger.js");
  const modelRoute = createHostModelRouter({
    allowedModels: [...MODEL_IDS],
    byRole: { researcher: "claude-sonnet-5-5", analyst: "claude-sonnet-5-5", writer: "claude-sonnet-5-5" },
  });
  // Recursive child roles are model-authored labels, not host routing policy.
  // Select the route in trusted host code instead of extending policy from them.
  const specialistModelRoute = () => modelRoute("researcher");

  const runId = path.basename(runRoot).replaceAll(/[^A-Za-z0-9_-]/g, "-");
  function prepare(kind: "research" | "analytics"): { fixture: MissionFixture; approved: Mission } {
    const id = `${runId}-${kind}`;
    const workspace = storage.prepareMissionWorkspace(id);
    const fixture = kind === "research" ? researchFixture(runId, workspace) : analyticsFixture(runId, workspace);
    for (const [name, bytes] of Object.entries(fixture.inputs)) {
      const file = path.join(workspace, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
    }
    // Host provisioning is not a model deliverable. Register the immutable
    // inputs before specialists establish their new-artifact baselines.
    for (const name of Object.keys(fixture.inputs)) storage.saveArtifactFile(id, name, fixture.inputs[name], "file");
    const now = new Date().toISOString();
    const specification = fixture.specification;
    const pending: Mission = {
      id, title: specification.title, description: "Bounded local professional-mission harness; engineering practice only.",
      objective: specification.objective, acceptance_criteria: specification.acceptance_criteria,
      status: "pending_approval", priority: "normal", created_at: now, updated_at: now,
      artifacts: [], metadata: { specification },
    };
    storage.saveMission(pending);
    writeJson(path.join(runRoot, "specifications", `${kind}-pending.json`), pending);
    // This dedicated live flag is the explicit operator approval transaction.
    const approved: Mission = {
      ...pending, status: "approved", updated_at: new Date().toISOString(),
      metadata: { ...pending.metadata, approved_spec_binding: createApprovedSpecBinding(pending) },
    };
    storage.saveMission(approved);
    writeJson(path.join(runRoot, "approvals", `${kind}.json`), {
      schema: "r2-final-professional-approval-v1", approval: LIVE_APPROVAL,
      approved_at: assertApprovedSpecBinding(approved).approved_at,
      spec_hash: assertApprovedSpecBinding(approved).spec_hash,
      approved_spec: assertApprovedSpecBinding(approved).snapshot,
    });
    return { fixture, approved: storage.loadMission(id)! };
  }
  const research = prepare("research");
  const analytics = prepare("analytics");

  async function runOne(item: { fixture: MissionFixture; approved: Mission }): Promise<MissionEvidence> {
    const { fixture, approved } = item;
    const binding = assertApprovedSpecBinding(approved);
    const approvedTools = new Set(binding.snapshot.specification.suggested_tools);
    const hostExecutionPolicy = {
      composition: "trusted-host-only",
      mode: "engineering-practice",
      mission_id: fixture.id,
      spec_hash: binding.spec_hash,
      fail_closed: true,
      allowed_stages: ["mission", "delegation", "repair", "effect", "acceptance"],
      allowed_tools: [...approvedTools].sort(),
      selection_inputs: ["approved mission identity", "approved spec hash", "host target role/tools/stage"],
      prohibited_selection_inputs: ["request metadata", "model metadata", "model-authored configuration"],
    };
    const intervals: DelegationInterval[] = [];
    const startedAt = new Date().toISOString();
    let review: QAReview | null = null;
    let executionError: string | null = null;
    try {
      const experience = await resolveConfiguredMissionExperience(approved);
      if (experience !== undefined) throw new Error("Professional harness policy forbids experience injection");
      const manager = new MissionManager(approved, 20 * 60_000, {
        admission: {
          mode: "engineering-practice", missionId: fixture.id, specHash: binding.spec_hash,
          authorizeExecution: (mission, target) => mission.id === fixture.id &&
            assertApprovedSpecBinding(mission).spec_hash === binding.spec_hash &&
            ["mission", "delegation", "repair", "effect", "acceptance"].includes(target.stage) &&
            (!target.tools || target.tools.every(tool => approvedTools.has(tool))),
        },
        modelRoute: specialistModelRoute,
        deps: {
          // Observe the production specialist boundary without replacing it.
          executeSpecialist: async (config, missionId, options) => {
            const { executeSpecialist } = await import("../../src/agents/specialists.js");
            const started_at = new Date().toISOString();
            const outcome = await executeSpecialist(config, missionId, options);
            intervals.push({
              node_id: config.nodeId ?? "", mission_id: missionId, role: config.role,
              started_at, finished_at: new Date().toISOString(), artifact_ids: [...outcome.artifacts],
            });
            return outcome;
          },
        },
      });
      const result = await manager.run();
      review = result.review;
    } catch (error) {
      executionError = safeError(error);
    }
    const finishedAt = new Date().toISOString();
    const final = storage.loadMission(fixture.id);
    const artifacts = final ? storage.listArtifacts(fixture.id).filter(artifact => final.artifacts.includes(artifact.id)) : [];
    const modelCalls = listModelCalls(fixture.id);
    const candidate = final ? verifyCandidateEvidence(final, artifacts) : { checks: [check("candidate evidence unavailable", false)], evidencePath: null, receipt: null };
    // Every registry revision, including superseded same-name records, so the
    // independent projection can tell a retired revision from a fabricated ID.
    const registry = final ? (await import("../../src/utils/artifact-evidence.js")).allArtifactRecords(fixture.id) : [];
    const independent = final ? independentVerification({ fixture, mission: final, artifacts, registry, modelCalls, intervals }) : {
      schema: "r2-final-professional-independent-verification-v1" as const,
      mission_id: fixture.id, independent: true as const, artifacts: [], intervals,
      checks: [check("terminal mission record exists", false)], passed: false,
    };
    const snapshotChecks: Check[] = [];
    let copiedCandidatePath: string | null = null;
    let copiedCandidateHash: string | null = null;
    if (candidate.evidencePath) {
      try {
        const bytes = readStableFile(candidate.evidencePath);
        const parsed = JSON.parse(bytes.toString("utf8")) as CandidateEvidence;
        copiedCandidatePath = path.join(runRoot, "candidate-evidence", `${fixture.kind}-${parsed.candidate.epoch_id}.json`);
        writeBytes(copiedCandidatePath, bytes);
        const copied = readStableFile(copiedCandidatePath);
        if (!copied.equals(bytes)) throw new Error("Candidate evidence copy differs");
        copiedCandidateHash = parsed.candidate.candidate_sha256;
        snapshotChecks.push(check("immutable candidate and QA evidence copied byte-identically", true, copiedCandidatePath));
      } catch {
        snapshotChecks.push(check("immutable candidate and QA evidence copied byte-identically", false));
      }
    } else snapshotChecks.push(check("immutable candidate and QA evidence copied byte-identically", false));
    const checks = [
      check("mission execution boundary returned without a host exception", executionError === null, executionError ?? "settled"),
      ...candidate.checks, ...independent.checks, ...snapshotChecks,
    ];
    const missionEvidence: MissionEvidence = {
      mission_id: fixture.id, status: final?.status ?? "MISSING", started_at: startedAt, finished_at: finishedAt,
      execution_error: executionError, approved_spec_hash: binding.spec_hash, host_execution_policy: hostExecutionPolicy,
      artifacts: artifacts.map(artifact => ({ id: artifact.id, name: artifact.name, revision: artifact.metadata.revision,
        sha256: artifact.metadata.sha256, size_bytes: artifact.metadata.size_bytes })),
      intervals, model_calls: modelCalls, qa_review: review, qa_candidate_receipt: candidate.receipt,
      candidate_evidence_path: copiedCandidatePath, candidate_evidence_sha256: copiedCandidateHash,
      delegation_tree: final?.metadata.delegation_tree ?? null, independent_verification: independent, checks,
      passed: checks.every(item => item.passed),
    };
    writeJson(path.join(runRoot, "missions", `${fixture.kind}.json`), missionEvidence);
    return missionEvidence;
  }

  // Both production runs begin together. Their complete wall-clock intervals,
  // not Head parallel flags, determine whether concurrency is actually proven.
  const results = await Promise.all([runOne(research), runOne(analytics)]);
  const concurrency = overlapProof(results.map(result => ({
    mission_id: result.mission_id, started_at: result.started_at, finished_at: result.finished_at,
  })));
  const finalAttestation = protocolAttestation(HERE);
  const protocolIntact = JSON.stringify(initialAttestation) === JSON.stringify(finalAttestation);
  const checks = [
    check("both missions pass independent production and byte verification", results.every(result => result.passed)),
    check("concurrent execution has positive whole-mission overlap", concurrency.proven === true),
    check("harness and fixture attestation remained immutable", protocolIntact),
  ];
  const summary = {
    schema: "r2-final-professional-run-v1",
    mode: "authorized-live",
    run_root: runRoot,
    started_at: results.map(result => result.started_at).sort()[0],
    finished_at: results.map(result => result.finished_at).sort().at(-1),
    credential_evidence: credentialEvidence,
    approvals: [research, analytics].map(item => ({ mission_id: item.fixture.id, spec_hash: assertApprovedSpecBinding(item.approved).spec_hash })),
    host_execution_policy: results.map(result => result.host_execution_policy),
    host_model_policy: HOST_MODEL_POLICY,
    host_experience_policy: HOST_EXPERIENCE_POLICY,
    model_route: { allowed_models: [...MODEL_IDS], role_overrides: { researcher: "claude-sonnet-5-5", analyst: "claude-sonnet-5-5", writer: "claude-sonnet-5-5" } },
    missions: results,
    model_ledger: results.flatMap(result => result.model_calls),
    concurrency,
    protocol_attestation: finalAttestation,
    protocol_intact: protocolIntact,
    checks,
    provider_cost: "UNKNOWN",
    readiness_claim: "NONE: this bounded harness result does not declare R2 readiness",
    passed: results.every(result => result.passed) && checks.every(item => item.passed),
  };
  writeJson(path.join(runRoot, "model-ledger.json"), summary.model_ledger);
  writeJson(path.join(runRoot, "delegation-trees.json"), results.map(result => ({
    mission_id: result.mission_id,
    tree: result.delegation_tree,
    intervals: result.intervals,
  })));
  writeJson(path.join(runRoot, "summary.json"), summary);
  console.log(JSON.stringify({ schema: summary.schema, run_root: runRoot, passed: summary.passed,
    provider_cost: "UNKNOWN", concurrency, checks,
    missions: results.map(result => ({ mission_id: result.mission_id, status: result.status, passed: result.passed,
      execution_error: result.execution_error, failed_checks: result.checks.filter(item => !item.passed) })) }, null, 2));
  process.exit(summary.passed ? 0 : 1);
}

try {
  if (mode === "--validate-only") validateOnly();
  else await live();
} catch (error) {
  const failure = {
    schema: "r2-final-professional-summary-v1",
    mode: mode === "--validate-only" ? "validate-only" : "authorized-live",
    passed: false,
    error: safeError(error),
    provider_cost: "UNKNOWN",
    readiness_claim: "NONE: this bounded harness result does not declare R2 readiness",
  };
  if (activeRunRoot) {
    try { writeJson(path.join(activeRunRoot, "summary.json"), { ...failure, run_root: activeRunRoot }); }
    catch { /* The sanitized console failure remains available if evidence storage fails. */ }
  }
  console.log(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
}
