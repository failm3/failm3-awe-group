#!/usr/bin/env npx tsx
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  ALL_TARGETS, CONTROLS, HIDDEN_CASES_PER_TARGET, MODEL_ID, SOURCE_ARTIFACT, SOURCE_CONTRACT, TARGET_COUNT, TOOLS,
  duplicateMutant, escapeMutant, formatSpec, hiddenCases, manifest, rangeMutant, sha256, sourceEdgeCorpus,
  splitOnlyMutant, stubSource, targetSource, visibleTest, type TargetConfig,
} from "./fixtures.js";
import { analyze, checkSourceText, exactTwoSidedMcNemar, verifySource, verifyTarget } from "./verifier.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const mode = process.argv[2];
if (mode !== "--preflight" && mode !== "--run-authorized-final-transfer") {
  throw new Error("Use exactly --preflight (offline) or --run-authorized-final-transfer");
}
if (process.argv.length !== 3) throw new Error("Unexpected arguments");

function protocolAttestation() {
  const files = fs.readdirSync(HERE).filter(name => /\.(?:ts|md)$/.test(name)).sort()
    .map(name => ({ file: `scripts/r2-final-transfer/${name}`, sha256: sha256(fs.readFileSync(path.join(HERE, name))) }));
  return { schema: 1, protocol_sha256: sha256(fs.readFileSync(path.join(HERE, "FROZEN-PROTOCOL.md"))),
    source_artifact_sha256: sha256(SOURCE_ARTIFACT), source_contract_sha256: sha256(SOURCE_CONTRACT),
    source_edge_corpus_sha256: sha256(JSON.stringify(sourceEdgeCorpus())), harness_files: files, targets: manifest(), controls: CONTROLS };
}

async function preflight() {
  const started = Date.now();
  const report = path.join(ROOT, "reports", `r2-final-transfer-preflight-${Date.now()}`);
  fs.mkdirSync(report, { recursive: true });
  const references = [];
  for (const config of ALL_TARGETS) {
    const reference = checkSourceText(targetSource(config), config);
    if (!reference.passed) throw new Error(`Reference ${config.index} failed ${reference.failureCase}: ${reference.error}`);
    const workspace = path.join(report, "references", String(config.index).padStart(2, "0"));
    fs.mkdirSync(path.join(workspace, path.dirname(config.file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, config.file), targetSource(config));
    fs.writeFileSync(path.join(workspace, "visible.test.cjs"), visibleTest(config));
    const visible = spawnSync(process.execPath, [path.join(workspace, "visible.test.cjs")], { cwd: workspace, encoding: "utf8", timeout: 10_000, env: { PATH: "/usr/bin:/bin" } });
    if (visible.status !== 0 || visible.error) throw new Error(`Reference ${config.index} visible test failed: ${visible.stderr}${visible.error ?? ""}`);
    const cases = hiddenCases(config);
    const categoryCounts = Object.fromEntries(["valid", "syntax-invalid", "semantic-invalid"].map(category => [category, cases.filter(x => x.category === category).length]));
    if (cases.length !== HIDDEN_CASES_PER_TARGET || Object.values(categoryCounts).some(n => n === 0)) throw new Error(`Case coverage ${config.index}`);
    // Executable visible material contains no hidden inputs or expected outputs.
    // FORMAT.md intentionally specifies the public grammar and output contract.
    const visibleSource = visibleTest(config);
    // Parse literals from the actual generated test, then enforce that none is a
    // complete hidden case. A visible base record is legitimately a prefix of a
    // longer hidden record; substring matching would be a false positive.
    const literalPattern = /(?:parse\w+|decodeSeparated|readInput)\(("(?:[^"\\]|\\.)*")\)/g;
    const visibleInputs = [...visibleSource.matchAll(literalPattern)].map(match => JSON.parse(match[1]));
    const visibleOutputs = [...visibleSource.matchAll(/\), (\[\{.*?\}\])\);/g)].map(match => match[1]);
    if (visibleInputs.length !== 2 || visibleOutputs.length !== 2) throw new Error(`Visible literal extraction failed for target ${config.index}`);
    for (const test of cases) {
      const hiddenInput = visibleInputs.includes(test.input);
      const hiddenOutput = test.expected !== undefined && visibleOutputs.includes(JSON.stringify(test.expected));
      // The two documented ordinary examples are visible by design. Other cases
      // may share their base output, but may not introduce a visible hidden input
      // or a second distinct expected output.
      const distinctExpected = test.id !== "ordinary" && JSON.stringify(test.expected) !== visibleOutputs[0];
      if ((test.id !== "ordinary" && hiddenInput) || (hiddenOutput && distinctExpected)) {
        throw new Error(`Hidden input/output leaked in target ${config.index}: ${test.id}`);
      }
    }
    references.push({ index: config.index, passed: true, cases: cases.length, categories: categoryCounts, visiblePassed: true });
  }
  const mutants = [];
  for (const [name, mutate, expectedCase] of [
    ["split-only", splitOnlyMutant, "ordinary"], ["escape", escapeMutant, "escaped-quote"],
    ["duplicate", duplicateMutant, "duplicate"], ["range", rangeMutant, "window-high"],
  ] as const) {
    for (const config of ALL_TARGETS) {
      const result = checkSourceText(mutate(config), config);
      if (result.passed) throw new Error(`${name} mutant escaped target ${config.index}`);
      // Every seeded defect must be detected by its intended independent family.
      if (result.failureCase !== expectedCase && !(name === "range" && ["window-high", "duration-high"].includes(result.failureCase ?? ""))) {
        throw new Error(`${name} mutant target ${config.index} failed only incidentally at ${result.failureCase}: ${result.error}`);
      }
    }
    mutants.push({ name, rejected_targets: TARGET_COUNT, intended_detector: expectedCase });
  }
  const sourceWorkspace = path.join(report, "source-reference");
  fs.mkdirSync(path.join(sourceWorkspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(sourceWorkspace, "src/ledger.cjs"), SOURCE_ARTIFACT);
  fs.writeFileSync(path.join(sourceWorkspace, "visible.test.cjs"), `const assert=require('node:assert/strict');const {parseLedgerCsv}=require('./src/ledger.cjs');\nassert.deepEqual(parseLedgerCsv('name,team\\nAda,Core\\n'),[['name','team'],['Ada','Core']]);\nassert.deepEqual(parseLedgerCsv('id,count\\nx,2'),[['id','count'],['x','2']]);console.log('visible PASS');\n`);
  const source = verifySource(sourceWorkspace);
  if (!source.passed || source.artifactSha256 !== sha256(SOURCE_ARTIFACT)) throw new Error(`Source qualification failed: ${source.error}`);
  for (const forbidden of ["WINDOW", "RATE", "LIMIT", "DURATION", "COLOR", "FLAGS", "key=value"]) {
    if (SOURCE_ARTIFACT.includes(forbidden)) throw new Error(`Source artifact contains target-specific term ${forbidden}`);
  }
  if (exactTwoSidedMcNemar(0, 0) !== 1 || exactTwoSidedMcNemar(10, 0) !== 2 / 1024 ||
      Math.abs(exactTwoSidedMcNemar(7, 3) - 0.34375) > 1e-14) throw new Error("Frozen McNemar implementation failed known values");
  const again = JSON.stringify(manifest());
  if (again !== JSON.stringify(manifest()) || ALL_TARGETS.length !== TARGET_COUNT) throw new Error("Fixture regeneration is not deterministic");
  const attestation = protocolAttestation();
  const result = { schema: 1, mode: "offline_preflight", network_calls: 0, model_calls: 0, live_targets_executed: 0,
    passed: true, target_references: references, source, mutants, hidden_cases_total: TARGET_COUNT * HIDDEN_CASES_PER_TARGET,
    attestation, duration_ms: Date.now() - started };
  fs.writeFileSync(path.join(report, "preflight-result.json"), JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(report, "attestation.json"), JSON.stringify(attestation, null, 2));
  console.log(JSON.stringify({ passed: true, report, targets: references.length, hidden_cases: result.hidden_cases_total,
    mutants: mutants.map(x => ({ ...x, all_rejected: true })), source_cases: source.cases, network_calls: 0, model_calls: 0 }, null, 2));
}

async function live() {
  if (process.env.AWE_OFFLINE_TEST === "1") throw new Error("Refusing live experiment under AWE_OFFLINE_TEST");
  const runtimeEnvFile = process.env.AWE_RUNTIME_ENV_FILE;
  if (!runtimeEnvFile || !path.isAbsolute(runtimeEnvFile)) {
    throw new Error("AWE_RUNTIME_ENV_FILE must select an absolute dedicated Nox Runtime env file");
  }
  // Nox must never load a developer-workspace .env. Select the dedicated secret
  // file before any provider-capable import, and never log its path or contents.
  const dotenv = await import("dotenv");
  const loaded = dotenv.default.config({ path: path.resolve(runtimeEnvFile), override: true });
  if (loaded.error || !loaded.parsed?.ROUTER_CHEAP_API_KEY) {
    throw new Error("Dedicated Nox Runtime env file must contain ROUTER_CHEAP_API_KEY");
  }
  delete process.env.OPENAI_API_KEY;
  const credentialEvidence = Object.freeze({ source: "dedicated_runtime_env_file", loaded: true, router_cheap_key_present: true, openai_key_deleted: true });
  const runRoot = path.join(ROOT, "reports", `r2-final-transfer-${Date.now()}`);
  fs.mkdirSync(runRoot, { recursive: true });
  const attestation = protocolAttestation();
  fs.writeFileSync(path.join(runRoot, "attestation.json"), JSON.stringify(attestation, null, 2));
  // Hashing and fixture attestation precede all provider-capable imports and dispatches.
  process.env.AWE_DATA_DIR = path.join(runRoot, "state");
  const storage = await import("../../src/utils/storage.js");
  const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../../src/utils/spec-binding.js");
  const { createQualificationAuthority } = await import("../../src/utils/qualification.js");
  const { saveVerifiedExperience } = await import("../../src/memory/experience.js");
  const { executeSpecialist } = await import("../../src/agents/specialists.js");
  const { createHostModelRouter } = await import("../../src/config/models.js");
  const { listModelCalls } = await import("../../src/utils/model-ledger.js");
  const modelRoute = createHostModelRouter({ allowedModels: [MODEL_ID], byRole: { coder: MODEL_ID } });
  const runId = path.basename(runRoot).replaceAll(/[^A-Za-z0-9_-]/g, "-");
  const sourceId = `${runId}-source`;
  const selection = { scope: "delimited-text-recovery", capabilityHash: sha256("strict-delimited-parser-v2"), profileHash: sha256("fresh-specialist-final-transfer-v1") };
  const targetIds = new Map<string, string>();
  for (const config of ALL_TARGETS) for (const arm of ["on", "off"] as const) targetIds.set(`${config.index}:${arm}`, `${runId}-t${String(config.index).padStart(2, "0")}-${arm}`);
  const expectedVisibleHashes = new Map<string, string>();

  function mission(id: string, title: string, objective: string, scope: string) {
    const specification = { title, objective, scope,
      acceptance_criteria: ["The assigned CommonJS module exports its required function", "The implementation satisfies all of FORMAT.md, not just visible examples", "The unmodified visible test executes successfully"],
      suggested_tools: [...TOOLS], suggested_agents: ["coder"], estimated_complexity: "simple" as const,
      risks: ["Visible tests are intentionally tiny; the complete documented grammar and semantics are required"] };
    const now = new Date().toISOString();
    const pending = { id, title, description: "Controlled fresh parser repair", objective, acceptance_criteria: specification.acceptance_criteria,
      status: "pending_approval" as const, priority: "normal" as const, created_at: now, updated_at: now, artifacts: [], metadata: { specification } };
    storage.saveMission(pending);
    storage.saveMission({ ...pending, status: "approved", metadata: { specification, approved_spec_binding: createApprovedSpecBinding(pending) } });
    return storage.loadMission(id)!;
  }
  function makeTarget(config: TargetConfig, arm: "on" | "off") {
    const id = targetIds.get(`${config.index}:${arm}`)!;
    const workspace = storage.prepareMissionWorkspace(id);
    fs.mkdirSync(path.join(workspace, path.dirname(config.file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, config.file), stubSource(config));
    fs.writeFileSync(path.join(workspace, "FORMAT.md"), formatSpec(config));
    fs.writeFileSync(path.join(workspace, "visible.test.cjs"), visibleTest(config));
    const current = mission(id, `Separated record parser ${String(config.index).padStart(2, "0")} ${arm.toUpperCase()}`,
      `Repair ${config.file} so ${config.exportName} implements the complete local FORMAT.md specification.`,
      "Work only in this fresh mission workspace. Read FORMAT.md and visible.test.cjs. Repair the assigned module and run the visible test. No packages, network, external files, delegation, or test modifications.");
    expectedVisibleHashes.set(id, sha256(visibleTest(config)));
    storage.updateMission(id, { status: "running", metadata: { ...current.metadata, visible_test_sha256: expectedVisibleHashes.get(id) } });
    return storage.loadMission(id)!;
  }

  // Host-built source; no source model call, package, or network operation.
  const sourceWorkspace = storage.prepareMissionWorkspace(sourceId);
  fs.mkdirSync(path.join(sourceWorkspace, "src"), { recursive: true });
  fs.writeFileSync(path.join(sourceWorkspace, "src/ledger.cjs"), SOURCE_ARTIFACT);
  fs.writeFileSync(path.join(sourceWorkspace, "visible.test.cjs"), `const assert=require('node:assert/strict');const {parseLedgerCsv}=require('./src/ledger.cjs');\nassert.deepEqual(parseLedgerCsv('name,team\\nAda,Core\\n'),[['name','team'],['Ada','Core']]);\nassert.deepEqual(parseLedgerCsv('id,count\\nx,2'),[['id','count'],['x','2']]);console.log('visible PASS');\n`);
  const sourceApproved = mission(sourceId, "Host source CSV parser qualification", "Qualify the host-built strict CSV parser artifact", "Host source construction and independent edge verification only");
  const sourceVerification = verifySource(sourceWorkspace);
  if (!sourceVerification.passed || sourceVerification.artifactSha256 !== sha256(SOURCE_ARTIFACT)) throw new Error("Host source failed frozen qualification; no target model fallback is allowed");
  const sourceArtifact = storage.saveArtifactFile(sourceId, "src/ledger.cjs", SOURCE_ARTIFACT, "code");
  const qa = storage.saveArtifactFile(sourceId, "independent-verification.json", JSON.stringify({ independent: true, passed: true,
    cases: sourceVerification.cases, evidence: ["independent-host-tests-v1"], source_artifact_id: sourceArtifact.id,
    source_artifact_sha256: sourceVerification.artifactSha256, verifier_sha256: sha256(fs.readFileSync(path.join(HERE, "verifier.ts"))) }), "data");
  const approved = assertApprovedSpecBinding(sourceApproved);
  const binding = { solverId: "coder", specHash: approved.spec_hash, ...selection };
  const credential = Object.freeze({ hostOnly: true });
  const authority = createQualificationAuthority({ issuers: [{ principal: "independent-host-tests", scopes: [selection.scope] }],
    authenticateIssuer: value => value === credential ? "independent-host-tests" : null,
    authorize: candidate => candidate.solverId === binding.solverId && candidate.scope === binding.scope &&
      candidate.specHash === binding.specHash && candidate.capabilityHash === binding.capabilityHash && candidate.profileHash === binding.profileHash });
  const issuedAt = Date.now();
  const qualificationId = `${runId}-qualification`;
  const receipt = { ...binding, qualificationId, receiptId: `${runId}-receipt`, issuer: "independent-host-tests",
    evidenceHash: qa.metadata.sha256 as string, evidenceRefs: [sourceArtifact.id, qa.id], issuedAt, expiresAt: issuedAt + 8 * 3_600_000 };
  const qualified = authority.qualify(receipt, credential, 0);
  storage.updateMission(sourceId, { status: "completed", artifacts: [sourceArtifact.id, qa.id] });
  const record = { version: 1 as const, ...selection, solverId: "coder", sourceMissionId: sourceId, sourceSpecHash: approved.spec_hash,
    sourceArtifactId: sourceArtifact.id, sourceSha256: sourceVerification.artifactSha256!, verificationArtifactId: qa.id,
    verificationSha256: qa.metadata.sha256 as string, qualificationId, qualificationGeneration: qualified.generation,
    receiptId: qualified.receipt.receiptId, createdAt: new Date(issuedAt).toISOString() };
  const firstOn = makeTarget(ALL_TARGETS[0], "on");
  const saved = saveVerifiedExperience(record, selection, { mission: firstOn, role: "coder",
    authorize: target => target.missionId === firstOn.id && target.role === "coder" }, authority);
  const experience = { ...record, retrieved_reference_sha256: sha256(saved.reference) };

  const attempts: any[] = [];
  const saveProgress = () => fs.writeFileSync(path.join(runRoot, "attempts.json"), JSON.stringify(attempts, null, 2));
  async function runArm(config: TargetConfig, arm: "on" | "off") {
    const id = targetIds.get(`${config.index}:${arm}`)!;
    if (!storage.loadMission(id)) makeTarget(config, arm);
    const beforeCalls = new Set(listModelCalls(id).map(call => call.call_id));
    const started = Date.now();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome: any = null;
    let executionError: string | null = null;
    let timedOut = false;
    try {
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => {
        timedOut = true;
        const abortError = new Error("240s wall cap exceeded");
        controller.abort(abortError);
        reject(abortError);
      }, CONTROLS.wallCapMs); });
      outcome = await Promise.race([executeSpecialist({ role: "coder", missionId: id,
        task: "Repair the assigned separated-record parser from its complete local documentation and tiny visible test.",
        context: "Fresh independent task. Do not assume another mission's files, API, schema, data, approval, hidden cases or results. Follow only this mission's approved FORMAT.md.",
        tools: [...TOOLS], allowedTools: [...TOOLS], expected_output: `A repaired ${config.file} and an executed unmodified visible test` }, id,
        { maxSteps: CONTROLS.maxSteps, maxRetries: CONTROLS.maxRetries, modelRoute, signal: controller.signal,
          ...(arm === "on" ? { experience: { selection, authority, authorizeTarget: (target: { missionId: string; role: string }) =>
            target.missionId === id && target.role === "coder" } } : {}) }), timeout]);
    } catch (error) {
      // Ledger records intentionally omit provider text. Match that boundary in
      // attempt evidence too: no accidental key, URL, or prompt capture.
      executionError = timedOut ? "WALL_CAP_EXCEEDED" : error instanceof Error ? error.name : "PROVIDER_OR_EXECUTION_ERROR";
    }
    finally { if (timer) clearTimeout(timer); }
    const duration = Date.now() - started;
    const verification = verifyTarget(storage.prepareMissionWorkspace(id), config, expectedVisibleHashes.get(id));
    const parserArtifacts = storage.listArtifacts(id).filter(artifact => artifact.name === config.file && artifact.path && outcome?.artifacts?.includes(artifact.id));
    const attributed = parserArtifacts.length === 1 && parserArtifacts[0].metadata.sha256 === verification.artifactSha256 ? parserArtifacts[0] : null;
    const calls = listModelCalls(id).filter(call => !beforeCalls.has(call.call_id));
    const protocolChecks = {
      executed_once: true, pinned_model: outcome?.model === MODEL_ID && calls.every(call => call.model === MODEL_ID && call.provider === "routercheap"),
      exactly_one_terminal_completed_sdk_call: calls.length === 1 && calls[0].status === "completed",
      no_provider_error: !executionError && !timedOut && outcome?.success === true,
      retry_cap: outcome?.provider_max_retries === 0, reference_policy: arm === "on" ?
        outcome?.experience?.qualificationId === qualificationId && outcome?.experience?.referenceSha256 === experience.retrieved_reference_sha256 : outcome?.experience === undefined,
      visible_test_intact: verification.visibleSha256 === expectedVisibleHashes.get(id), final_artifact_attributed: !!attributed,
      only_registered_tools: outcome?.tools_used?.every((tool: string) => (TOOLS as readonly string[]).includes(tool)) === true,
      wall_cap_observed: duration <= CONTROLS.wallCapMs + 5000,
    };
    const protocolValid = Object.values(protocolChecks).every(Boolean);
    storage.updateMission(id, { status: verification.passed && attributed ? "completed" : "failed" });
    const attempt = { pair: config.index, arm, mission_id: id, config, execution_order: attempts.length + 1, outcome, execution_error: executionError,
      timed_out: timedOut, duration_ms: duration, attributed_parser_artifact_id: attributed?.id ?? null,
      independent_verification: verification, passed: verification.passed && !!attributed, protocol_valid: protocolValid,
      protocol_checks: protocolChecks, model_ledger_ids: calls.map(call => call.call_id), model_calls: calls,
      usage: outcome?.usage ?? calls.map(call => call.usage) };
    attempts.push(attempt); saveProgress();
  }

  for (const config of ALL_TARGETS) {
    const order: Array<"on" | "off"> = config.index % 2 === 0 ? ["on", "off"] : ["off", "on"];
    for (const arm of order) await runArm(config, arm); // No retry/repair/optional stopping.
  }
  const finalAttestation = protocolAttestation();
  const hashesIntact = JSON.stringify(finalAttestation) === JSON.stringify(attestation);
  const analysis = analyze(attempts);
  const allCalls = listModelCalls().filter(call => call.mission_id?.startsWith(runId));
  const globallyValid = hashesIntact && attempts.length === 80 && new Set(attempts.map(x => x.mission_id)).size === 80 &&
    attempts.every(x => x.protocol_valid) && analysis.valid_pairs === 40 && allCalls.length === 80 &&
    allCalls.every(call => call.model === MODEL_ID) && new Set(allCalls.map(call => call.call_id)).size === 80;
  const result = { schema: 1, protocol: "r2-final-transfer-v1", run_root: runRoot, attestation, hashes_intact: hashesIntact,
    credential_evidence: credentialEvidence, source_verification: sourceVerification, experience, controls: CONTROLS, execution_order: attempts.map(x => ({ pair: x.pair, arm: x.arm, mission_id: x.mission_id })),
    attempts, analysis, experiment_valid: globallyValid, protocol_invalid_attempts: attempts.filter(x => !x.protocol_valid).map(x => x.mission_id),
    model_calls: allCalls, provider_cost: "UNKNOWN", secondary_efficiency_is_not_success: true,
    conclusion: globallyValid ? "FROZEN_ANALYSIS_COMPLETE" : "EXPERIMENT_INVALID_OR_PARTIALLY_INVALID" };
  fs.writeFileSync(path.join(runRoot, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ run_root: runRoot, attempts: attempts.length, analysis, experiment_valid: globallyValid,
    protocol_invalid_attempts: result.protocol_invalid_attempts }, null, 2));
  if (!globallyValid) process.exitCode = 1;
}

if (mode === "--preflight") await preflight();
else await live();
