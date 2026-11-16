#!/usr/bin/env npx tsx
import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { baseMission, passedGate, passedReview } from "./helpers/r0-runtime-util.js";
import type { ManagerDeps } from "../agents/mission-manager.js";
import type { CapabilityAttempt } from "../agents/capability-plane.js";
import type { QualificationReceipt } from "../utils/qualification.js";

// Every agent dependency is synthetic. The only subprocess is the real,
// network-isolated production shell running the fixed local Node fixture.
const root = fs.mkdtempSync(path.join(process.cwd(), ".r2-qualified-acquisition-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
globalThis.fetch = async () => { throw new Error("Network forbidden in qualified acquisition acceptance"); };

const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const { MissionManager } = await import("../agents/mission-manager.js");
const { shellTool } = await import("../tools/index.js");
const { runWithToolContext } = await import("../security/tool-context.js");
const { createQualificationAuthority } = await import("../utils/qualification.js");
const {
  commandContractHash,
  listQualifiedInvocationReceipts,
  qualifiedTargetCommand,
  qualifyLocalTarget,
  recognizeQualifiedNodeCommand,
} = await import("../utils/local-capability.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../utils/spec-binding.js");

after(() => fs.rmSync(root, { recursive: true, force: true }));

const sha256 = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const FIXED_ARGUMENT = "fixed-argument-v1";

type Mode =
  | "reuse"
  | "resume"
  | "no-invoke"
  | "wrong-command"
  | "wrong-args"
  | "mutation"
  | "probe-mutation"
  | "revoke";

interface Scenario {
  id: string;
  mode: Mode;
  target: string;
  output: string;
  invocations: string;
  probePath?: string;
  attempt?: CapabilityAttempt;
  acquisitions: number;
  deliveries: number;
  receiptIds: string[];
  releases: Array<{ task: string; delegationId: string; receiptId: string }>;
  host: ReturnType<typeof makeHost>;
}

function makeMission(id: string) {
  const mission = baseMission(id, {
    title: "qualified acquisition acceptance",
    objective: "Run only the independently qualified local Node fixture and persist its output",
    acceptance_criteria: ["Deliver real fixture output"],
    metadata: { specification: {
      title: "qualified acquisition acceptance",
      objective: "Run only the independently qualified local Node fixture and persist its output",
      scope: "isolated local fixture only",
      acceptance_criteria: ["Deliver real fixture output"],
      suggested_tools: ["shell", "save_artifact"],
      suggested_agents: ["executor"],
      estimated_complexity: "simple",
      risks: [],
    } },
  });
  mission.metadata.approved_spec_binding = createApprovedSpecBinding(mission);
  storage.saveMission(mission);
  return mission;
}

function makeHost(mission: ReturnType<typeof baseMission>) {
  const credential = Object.freeze({ hostOnly: true });
  const authority = createQualificationAuthority({
    issuers: [{ principal: "independent-reviewer", scopes: ["local-runtime"] }],
    authenticateIssuer: (value) => value === credential ? "independent-reviewer" : null,
    authorize: () => true,
  });
  const binding = {
    solverId: "local-runner",
    scope: "local-runtime",
    specHash: assertApprovedSpecBinding(mission).spec_hash,
    capabilityHash: "b".repeat(64),
    profileHash: "c".repeat(64),
  };
  const qualificationId = `q-${mission.id}`;
  const receipt: QualificationReceipt = {
    ...binding,
    qualificationId,
    receiptId: crypto.randomUUID(),
    issuer: "independent-reviewer",
    evidenceHash: "d".repeat(64),
    evidenceRefs: ["isolated:fixed-node-fixture"],
    issuedAt: Date.now() - 100,
    expiresAt: Date.now() + 60_000,
  };
  authority.qualify(receipt, credential, 0);
  // Reuse the exact host admission. A new admission on each policy lookup would
  // correctly fail the durable-identity comparison and would not test reuse.
  const admission = authority.admit(qualificationId, binding);
  let targetAllowed = true;
  return {
    authority,
    qualificationId,
    acquisition(input: Parameters<typeof qualifyLocalTarget>[0]) {
      return qualifyLocalTarget(input, {
        authority,
        admission,
        authorizeTarget: () => targetAllowed,
      });
    },
    revoke() {
      const generation = authority.inspect(qualificationId)!.generation;
      authority.revoke(qualificationId, generation, credential, "acceptance revocation before release");
    },
  };
}

function fixture(id: string) {
  const work = storage.prepareMissionWorkspace(id);
  const target = path.join(work, "qualified-fixture.cjs");
  const output = path.join(work, "fixture-output.txt");
  const invocations = path.join(work, "fixture-invocations.jsonl");
  fs.writeFileSync(target, `
const fs = require('node:fs');
if (process.argv.length !== 4 || process.argv[3] !== ${JSON.stringify(FIXED_ARGUMENT)}) process.exit(23);
fs.appendFileSync(${JSON.stringify(invocations)}, JSON.stringify({ output: process.argv[2], fixed: process.argv[3] }) + '\\n');
fs.writeFileSync(process.argv[2], 'qualified invocation\\n');
`);
  return { target, output, invocations };
}

function invocationCount(scenario: Scenario): number {
  if (!fs.existsSync(scenario.invocations)) return 0;
  return fs.readFileSync(scenario.invocations, "utf8").trim().split("\n").filter(Boolean).length;
}

function successful(role: string, artifact: { id: string }, qualifiedAttemptIds?: string[]) {
  return {
    role,
    output: "real output persisted",
    artifacts: [artifact.id],
    success: true,
    tools_used: ["save_artifact"],
    model: "offline",
    ...(qualifiedAttemptIds ? { qualified_attempt_ids: qualifiedAttemptIds } : {}),
  };
}

function depsFor(scenario: Scenario): ManagerDeps {
  return {
    planMission: async (_mission, options) => {
      if (options?.executionFailure) {
        return { status: "blocked", detail: "synthetic terminal outcome; no fallback execution" };
      }
      if (!options?.capabilityAttempt) {
        return { status: "acquire", capability: "fixture-runtime", detail: "fixed local fixture required" };
      }
      const attempt = options.capabilityAttempt;
      scenario.attempt = attempt;
      assert.ok(attempt.qualified_target, "host qualification must precede replanning");
      const exact = qualifiedTargetCommand(attempt.qualified_target);
      const delegation = (task: string) => ({
        agent_role: "executor",
        task,
        context: `Use this exact qualified invocation: ${exact}`,
        tools: ["shell", "save_artifact"],
        expected_output: "real fixture output",
        parallel: false,
        uses_capability_attempt: attempt.attempt_id,
      });
      const plan = { strategy: "use qualified fixture", delegations: [delegation("first qualified invocation")] };
      if (scenario.mode === "reuse") plan.delegations.push(delegation("second qualified invocation"));
      return plan;
    },
    executeSpecialist: async (config, missionId, options) => {
      const work = storage.prepareMissionWorkspace(missionId);
      if (config.task.includes("Investigate and acquire")) {
        scenario.acquisitions++;
        assert.equal(options?.localCapability, undefined, "acquisition itself has no invocation grant");
        const probe = storage.saveArtifactFile(missionId, "probe.json", JSON.stringify({ independentlyVerified: true }), "json");
        // Domain results may share a field name with the protocol, but their
        // additional keys must never make them candidate observations.
        storage.saveArtifactFile(missionId, "domain-result.json", JSON.stringify({
          capability: "fixture-runtime", row_count: 3, sites: { North: { completed: 2 } },
        }), "json");
        scenario.probePath = probe.path!;
        const observation = storage.saveArtifactFile(missionId, "observation.json", JSON.stringify({
          capability: "fixture-runtime",
          status: "available",
          detail: "real persisted probe; the proposal still requires host qualification",
          acquired: "candidate-fixture",
          local_target: {
            runtime: "node",
            executable_path: scenario.target,
            executable_sha256: sha256(scenario.target),
            args: [scenario.output, FIXED_ARGUMENT],
            probe_artifacts: [{ artifact_id: probe.id, sha256: String(probe.metadata.sha256) }],
          },
        }), "json");
        assert.equal(fs.existsSync(scenario.output), false, "a model proposal must not execute during acquisition");
        return successful(config.role, observation);
      }

      scenario.deliveries++;
      if (scenario.mode === "no-invoke") {
        const artifact = storage.saveArtifactFile(missionId, "forged-result-metadata.json", JSON.stringify({ claimOnly: true }), "json");
        return successful(config.role, artifact, [scenario.attempt!.attempt_id]);
      }

      // These changes happen after MissionManager constructed the real gate but
      // before production shell release, exercising the mandatory second check.
      if (scenario.mode === "mutation") fs.appendFileSync(scenario.target, "// mutation after gate construction\n");
      if (scenario.mode === "probe-mutation") fs.writeFileSync(scenario.probePath!, "mutated probe bytes\n");
      if (scenario.mode === "revoke") scenario.host.revoke();

      let command = options!.localCapability!.command;
      if (scenario.mode === "wrong-command") command = `printf forbidden > '${scenario.output}'`;
      if (scenario.mode === "wrong-args") command += " 'unexpected-argument'";
      const shell = await runWithToolContext({
        missionId,
        workspaceRoot: work,
        allowedTools: new Set(["shell"]),
        withEffect: options!.withEffect,
        fence: options!.fence,
        signal: options!.signal,
        beginEffect: options!.beginEffect,
        localCapability: options!.localCapability,
        qualifiedAttemptIds: options!.qualifiedAttemptIds,
      }, () => shellTool.execute!({ command, cwd: work, timeout_ms: 10_000 } as never, {} as never)) as {
        success: boolean;
        stderr: string;
      };
      if (!shell.success) throw new Error(shell.stderr);

      assert.equal(fs.readFileSync(scenario.output, "utf8"), "qualified invocation\n");
      const receiptIds = options!.qualifiedAttemptIds!;
      assert.equal(receiptIds.has(scenario.attempt!.attempt_id), true, "real release, not result metadata, records the attempt");
      const receiptId = receiptIds.get(scenario.attempt!.attempt_id)!;
      const durableReceipt = listQualifiedInvocationReceipts(missionId).find((receipt) => receipt.receipt_id === receiptId);
      assert.ok(durableReceipt, "release receipt must be durable before specialist completion");
      assert.equal(durableReceipt.attempt_id, scenario.attempt!.attempt_id);
      assert.ok(lifecycle.loadCheckpoint(missionId)?.plan?.delegations.some((delegation) =>
        delegation.delegation_id === durableReceipt.delegation_id &&
        delegation.task === config.task &&
        delegation.uses_capability_attempt === scenario.attempt!.attempt_id
      ), "receipt delegation_id must be the exact frozen delegation being executed");
      scenario.receiptIds.push(receiptId);
      scenario.releases.push({ task: config.task, delegationId: durableReceipt.delegation_id, receiptId });
      const name = config.task.startsWith("second") ? "second-result.txt" : "first-result.txt";
      const artifact = storage.saveArtifactFile(missionId, name, fs.readFileSync(scenario.output, "utf8"), "text");
      return successful(config.role, artifact);
    },
    reviewMissionDetailed: async () => {
      if (scenario.mode === "resume" && scenario.deliveries === 1 && !lifecycle.loadCheckpoint(scenario.id)?.completed.some((entry) => entry.status === "success" && entry.delegation_id)) {
        throw new Error("unexpected checkpoint state before review interruption");
      }
      return { review: passedReview(), gate: passedGate() };
    },
    resolveModelForRole: () => "offline",
  };
}

async function runScenario(id: string, mode: Mode) {
  const mission = makeMission(id);
  const files = fixture(id);
  const host = makeHost(mission);
  const scenario: Scenario = { id, mode, ...files, acquisitions: 0, deliveries: 0, receiptIds: [], releases: [], host };
  const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
    acquisition: (input) => host.acquisition(input),
    deps: depsFor(scenario),
    quiesceTimeoutMs: 1_000,
  }).run();
  return { result, scenario };
}

test("qualified fixed Node target executes through real shell with exact durable receipts and same-mission reuse", async () => {
  const { result, scenario } = await runScenario("r2-qualified-reuse", "reuse");
  assert.equal(result.mission.status, "completed", JSON.stringify(result.mission.metadata.qa_gate));
  assert.equal(scenario.acquisitions, 1, "a second delegation reuses acquisition evidence");
  assert.equal(scenario.deliveries, 2);
  assert.equal(invocationCount(scenario), 2);

  const target = scenario.attempt!.qualified_target!;
  const exact = qualifiedTargetCommand(target);
  assert.deepEqual(recognizeQualifiedNodeCommand(exact), {
    executable_path: scenario.target,
    args: [scenario.output, FIXED_ARGUMENT],
  });
  for (const malformed of [
    `${exact} `,
    ` ${exact}`,
    `node  -- '${scenario.target}' '${scenario.output}' '${FIXED_ARGUMENT}'`,
    `node -- "${scenario.target}" '${scenario.output}' '${FIXED_ARGUMENT}'`,
    `${exact}; printf chained`,
    `${exact} > output`,
    `${exact} | cat`,
    `node -- '${scenario.target}' '$OUTPUT' '${FIXED_ARGUMENT}'`,
    `node -- '${scenario.target}' "unterminated`,
    `node -- './relative.cjs' '${scenario.output}' '${FIXED_ARGUMENT}'`,
  ]) assert.equal(recognizeQualifiedNodeCommand(malformed), null, malformed);
  const receipts = listQualifiedInvocationReceipts(scenario.id);
  assert.equal(receipts.length, 2);
  const execution = (result.mission.metadata.execution as any).delegations as any[];
  assert.equal(execution.length, 2);
  assert.equal(lifecycle.loadCheckpoint(scenario.id), null, "completed missions clean up their terminal checkpoint");
  const durableAttempt = (result.mission.metadata.capability_plane as any).attempts[0];
  assert.equal(durableAttempt.attempt_id, scenario.attempt!.attempt_id);
  for (const [index, entry] of execution.entries()) {
    assert.deepEqual(entry.qualified_attempt_ids, [scenario.attempt!.attempt_id]);
    const release = scenario.releases[index];
    const receipt = receipts.find((candidate) => candidate.receipt_id === release.receiptId);
    assert.ok(receipt, "each specialist result is tied to the durable receipt observed at its actual release");
    assert.equal(receipt.delegation_id, release.delegationId, "same-mission reuse must not switch delegation identities");
    assert.equal(receipt.mission_id, scenario.id);
    assert.equal(receipt.attempt_id, scenario.attempt!.attempt_id);
    assert.equal(receipt.qualification_id, scenario.host.qualificationId);
    assert.equal(receipt.generation, target.generation);
    assert.equal(receipt.executable_path, scenario.target);
    assert.equal(receipt.executable_sha256, sha256(scenario.target));
    assert.equal(receipt.command_sha256, commandContractHash(exact));
  }
  assert.deepEqual(receipts.map((receipt) => receipt.receipt_id).sort(), [...scenario.receiptIds].sort());
  assert.equal(new Set(receipts.map((receipt) => receipt.receipt_id)).size, 2);
  assert.equal(new Set(receipts.map((receipt) => receipt.delegation_id)).size, 2);
});

test("checkpoint resume reuses acquisition and successful qualified work without another release", async () => {
  const id = "r2-qualified-resume";
  const mission = makeMission(id);
  const host = makeHost(mission);
  const scenario: Scenario = { id, mode: "resume", ...fixture(id), acquisitions: 0, deliveries: 0, receiptIds: [], releases: [], host };
  let reviews = 0;
  const deps = depsFor(scenario);
  const interruptingDeps: ManagerDeps = {
    ...deps,
    reviewMissionDetailed: async () => {
      reviews++;
      throw new Error("synthetic interruption after successful qualified work was checkpointed");
    },
  };
  const first = await new MissionManager(storage.loadMission(id)!, 30_000, {
    acquisition: (input) => host.acquisition(input), deps: interruptingDeps, quiesceTimeoutMs: 1_000,
  }).run();
  assert.equal(first.mission.status, "failed");
  assert.deepEqual([scenario.acquisitions, scenario.deliveries, invocationCount(scenario)], [1, 1, 1]);
  const checkpoint = lifecycle.loadCheckpoint(id)!;
  assert.equal(checkpoint.completed.filter((entry) => entry.status === "success" && entry.delegation_id).length, 1);
  assert.deepEqual(checkpoint.in_flight, []);
  const before = listQualifiedInvocationReceipts(id);
  assert.equal(before.length, 1);

  storage.unsealMission(id);
  storage.updateMissionAtomic(id, () => ({ status: "paused" }), { allowTerminalTransition: true });
  const resumed = await new MissionManager(storage.loadMission(id)!, 30_000, {
    allowedStatuses: ["paused"],
    acquisition: (input) => host.acquisition(input),
    deps: {
      ...deps,
      planMission: async () => { throw new Error("stored accepted plan must be reused"); },
      executeSpecialist: async () => { throw new Error("successful acquisition/delivery must not repeat"); },
      reviewMissionDetailed: async () => ({ review: passedReview(), gate: passedGate() }),
    },
    quiesceTimeoutMs: 1_000,
  }).run();
  assert.equal(resumed.mission.status, "completed", JSON.stringify(resumed.mission.metadata.qa_gate));
  assert.equal(reviews, 1);
  assert.deepEqual([scenario.acquisitions, scenario.deliveries, invocationCount(scenario)], [1, 1, 1]);
  assert.deepEqual(listQualifiedInvocationReceipts(id), before, "resume adds no duplicate invocation receipt");
  assert.deepEqual((resumed.mission.metadata.execution as any).delegations[0].qualified_attempt_ids, [scenario.attempt!.attempt_id]);
});

for (const kind of ["missing-policy", "denied-by-host"] as const) {
  test(`proposal alone cannot execute when independent qualification is ${kind}`, async () => {
    const id = `r2-qualified-${kind}`;
    const mission = makeMission(id);
    const host = makeHost(mission);
    const scenario: Scenario = { id, mode: "no-invoke", ...fixture(id), acquisitions: 0, deliveries: 0, receiptIds: [], releases: [], host };
    const result = await new MissionManager(storage.loadMission(id)!, 30_000, {
      ...(kind === "denied-by-host" ? { acquisition: () => null } : {}),
      deps: depsFor(scenario),
      quiesceTimeoutMs: 1_000,
    }).run();
    assert.notEqual(result.mission.status, "completed", "missing or denied independent qualification cannot complete");
    if (kind === "missing-policy") assert.equal(result.mission.status, "failed");
    else assert.equal(result.mission.status, "paused", "QualificationDeniedError retains a truthful resumable recovery state");
    assert.equal(scenario.acquisitions, 1, "the model did produce a real observation/proposal");
    assert.equal(scenario.deliveries, 0, "no qualified replan/delegation is possible");
    assert.equal(scenario.attempt, undefined);
    assert.equal(invocationCount(scenario), 0);
    assert.equal(fs.existsSync(scenario.output), false);
    assert.deepEqual(listQualifiedInvocationReceipts(id), []);
  });
}

test("specialist result metadata cannot forge a qualified invocation receipt", async () => {
  const { result, scenario } = await runScenario("r2-qualified-forged-result", "no-invoke");
  assert.notEqual(result.mission.status, "completed");
  assert.equal(scenario.acquisitions, 1);
  assert.equal(invocationCount(scenario), 0);
  assert.equal(fs.existsSync(scenario.output), false);
  assert.deepEqual(listQualifiedInvocationReceipts(scenario.id), []);
  const checkpoint = lifecycle.loadCheckpoint(scenario.id);
  const execution = result.mission.metadata.execution as any;
  const results = execution?.delegations ?? checkpoint?.completed.filter((entry) => entry.delegation_id) ?? [];
  assert.ok(results.length > 0, "the failed specialist result must remain durable on either final or paused paths");
  assert.ok(results.every((entry: any) => (entry.qualified_attempt_ids ?? []).length === 0),
    "manager derives actual qualified use only from durable receipts, not specialist metadata");
  assert.ok(checkpoint?.in_flight?.some((entry: any) => entry.failed_outcome),
    "the forged successful claim after creating an artifact remains effect-bearing recovery evidence");
  const evidence = JSON.stringify({ qa: result.mission.metadata.qa_gate, recovery: result.mission.metadata.recovery_blocked, checkpoint });
  assert.match(evidence, /no matching actual durable invocation receipt/i);
});

for (const mode of ["wrong-command", "wrong-args", "mutation", "probe-mutation", "revoke"] as const) {
  test(`${mode} fails closed at the real shell boundary before executable release`, async () => {
    const { result, scenario } = await runScenario(`r2-qualified-${mode}`, mode);
    assert.notEqual(result.mission.status, "completed");
    assert.equal(scenario.acquisitions, 1);
    assert.equal(scenario.deliveries, 1);
    assert.equal(invocationCount(scenario), 0, `${mode} must not run the fixture`);
    assert.equal(fs.existsSync(scenario.output), false, `${mode} must not produce target output`);
    assert.deepEqual(listQualifiedInvocationReceipts(scenario.id), [], "denied release cannot leave an invocation receipt");
  });
}
