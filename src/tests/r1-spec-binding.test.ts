#!/usr/bin/env npx tsx
/** Offline approval integrity and actual Head prompt/delegation boundary tests. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as http from "node:http";
import {
  APPROVED_SPEC_BINDING_KEY,
  assertApprovedSpecBinding,
  assertApprovedSpecUnchanged,
  canonicalizeApprovedSpec,
  createApprovedSpecBinding,
  hashApprovedSpec,
  SpecBindingError,
} from "../utils/spec-binding.js";
import { MissionSchema } from "../types/index.js";
import type { Mission, Specification } from "../types/index.js";

const spec: Specification = {
  title: "Research an offline launch",
  objective: "Produce a source-backed launch brief",
  scope: "IN: local evidence and a draft. OUT: publishing, purchases, production changes.",
  acceptance_criteria: ["Brief cites each source", "No live launch is performed"],
  suggested_tools: ["file_read", "save_artifact"],
  suggested_agents: ["researcher", "writer"],
  estimated_complexity: "moderate",
  risks: ["Source dates may be stale", "No authority to publish"],
};
const timestamp = "2026-11-14T00:00:00.000Z";
function draft(): Mission {
  return {
    id: "r1-spec-binding-offline", title: spec.title,
    description: "Original request: evaluate the launch; keep it an unpublished draft.",
    objective: spec.objective, acceptance_criteria: [...spec.acceptance_criteria],
    status: "pending_approval", priority: "normal", created_at: timestamp, updated_at: timestamp,
    artifacts: [], metadata: { specification: structuredClone(spec) },
  };
}
function approved(): Mission {
  const mission = draft();
  mission.metadata[APPROVED_SPEC_BINDING_KEY] = createApprovedSpecBinding(mission, timestamp);
  mission.status = "approved";
  return mission;
}
function specification(mission: Mission): Specification {
  return mission.metadata.specification as Specification;
}
let checks = 0;
function check(name: string, run: () => void): void {
  run();
  checks++;
  console.log(`PASS ${name}`);
}

check("canonical digest is stable across object order and JSON/Mission schema round trips", () => {
  const mission = approved();
  const binding = assertApprovedSpecBinding(mission);
  const reversed = Object.fromEntries(Object.entries(binding.snapshot).reverse()) as typeof binding.snapshot;
  assert.equal(hashApprovedSpec(reversed), binding.spec_hash);
  assert.equal(canonicalizeApprovedSpec(reversed), canonicalizeApprovedSpec(binding.snapshot));
  assert.equal(assertApprovedSpecBinding(MissionSchema.parse(JSON.parse(JSON.stringify(mission)))).spec_hash, binding.spec_hash);
});

check("snapshot is detached and deeply frozen; exact whitespace and array order matter", () => {
  const mission = draft();
  const binding = createApprovedSpecBinding(mission, timestamp);
  specification(mission).risks.push("later risk");
  mission.acceptance_criteria.push("later criterion");
  assert.deepEqual(binding.snapshot.specification.risks, spec.risks);
  assert.deepEqual(binding.snapshot.acceptance_criteria, spec.acceptance_criteria);
  assert.throws(() => binding.snapshot.specification.risks.push("mutation"), TypeError);
  for (const mutate of [
    (copy: typeof binding.snapshot) => { copy.description += " "; },
    (copy: typeof binding.snapshot) => { copy.specification.suggested_tools.reverse(); },
  ]) {
    const copy = structuredClone(binding.snapshot);
    mutate(copy);
    assert.notEqual(hashApprovedSpec(copy), binding.spec_hash);
  }
});

const mutations: Record<string, (mission: Mission) => void> = {
  "mission identity": (m) => { m.id += "-another"; },
  "title": (m) => { m.title += " changed"; specification(m).title = m.title; },
  "description": (m) => { m.description += " publish it"; },
  "objective": (m) => { m.objective = "Publish now"; specification(m).objective = m.objective; },
  "scope/exclusions": (m) => { specification(m).scope = "Publish to production"; },
  "risk": (m) => { specification(m).risks = []; },
  "criterion": (m) => { m.acceptance_criteria = ["Anything works"]; specification(m).acceptance_criteria = [...m.acceptance_criteria]; },
  "tool grant": (m) => { specification(m).suggested_tools.push("shell"); },
  "specialist suggestion": (m) => { specification(m).suggested_agents.push("devops"); },
  "complexity": (m) => { specification(m).estimated_complexity = "trivial"; },
};
for (const [name, mutate] of Object.entries(mutations)) {
  check(`post-approval ${name} mutation is rejected`, () => {
    const before = approved();
    const after = structuredClone(before);
    mutate(after);
    assert.throws(() => assertApprovedSpecBinding(after), SpecBindingError);
    assert.throws(() => assertApprovedSpecUnchanged(before, after), SpecBindingError);
  });
}

check("missing, malformed, partial, inconsistent or unknown specifications fail closed", () => {
  assert.throws(() => assertApprovedSpecBinding(draft()), SpecBindingError);
  for (const replacement of [undefined, null, { suggested_tools: ["shell"] }, { ...spec, acceptance_criteria: [] }, { ...spec, exclusions: "unknown extra authority" }]) {
    const mission = draft();
    mission.metadata.specification = replacement;
    assert.throws(() => createApprovedSpecBinding(mission), SpecBindingError);
  }
  const inconsistent = draft();
  inconsistent.acceptance_criteria = ["Different criterion"];
  assert.throws(() => createApprovedSpecBinding(inconsistent), SpecBindingError);
  for (const replacement of [null, {}, { version: 99 }, { ...createApprovedSpecBinding(draft()), spec_hash: "f".repeat(64) }]) {
    const mission = approved();
    mission.metadata[APPROVED_SPEC_BINDING_KEY] = replacement;
    assert.throws(() => assertApprovedSpecBinding(mission), SpecBindingError);
  }
});

check("storage guard rejects binding deletion, replacement and timestamp rewrite", () => {
  const before = approved();
  assert.throws(() => createApprovedSpecBinding(before), SpecBindingError);
  const deleted = structuredClone(before);
  delete deleted.metadata[APPROVED_SPEC_BINDING_KEY];
  deleted.status = "pending_approval";
  assert.throws(() => assertApprovedSpecUnchanged(before, deleted), SpecBindingError);
  deleted.description += " Changed and rehashed";
  deleted.metadata[APPROVED_SPEC_BINDING_KEY] = createApprovedSpecBinding(deleted);
  assert.throws(() => assertApprovedSpecUnchanged(before, deleted), SpecBindingError);
  const retimed = structuredClone(before);
  (retimed.metadata[APPROVED_SPEC_BINDING_KEY] as { approved_at: string }).approved_at = "2026-11-15T00:00:00.000Z";
  assert.throws(() => assertApprovedSpecUnchanged(before, retimed), SpecBindingError);
  assert.throws(() => assertApprovedSpecBinding(before, "0".repeat(64)), SpecBindingError);
});

check("draft edits and execution metadata/status updates remain supported", () => {
  const beforeDraft = draft();
  const editedDraft = draft();
  editedDraft.description += " clarification";
  assertApprovedSpecUnchanged(beforeDraft, editedDraft);
  assertApprovedSpecUnchanged(beforeDraft, approved());
  const before = approved();
  const after = structuredClone(before);
  after.status = "completed";
  after.updated_at = "2026-11-15T00:00:00.000Z";
  after.artifacts.push("artifact-1");
  after.metadata.execution = { qa_passed: true };
  assertApprovedSpecUnchanged(before, after);
});

// Configure isolation BEFORE importing Head, which initializes storage/memory.
const sandbox = fs.mkdtempSync("/tmp/opencode/awe-r1-spec-binding-");
process.env.AWE_DATA_DIR = path.join(sandbox, "data");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";
process.env.OPENAI_API_KEY = "offline-test-only";
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network forbidden in offline spec-binding test"); };
try {
  const storage = await import("../utils/storage.js");
  let serial = 0;
  function storedApproved(): Mission {
    const mission = draft();
    mission.id = `r1-storage-binding-${++serial}`;
    storage.saveMission(mission);
    const result = storage.updateMissionAtomic(mission.id, (cur) => ({
      status: "approved",
      metadata: { ...cur.metadata, [APPROVED_SPEC_BINDING_KEY]: createApprovedSpecBinding(cur, timestamp) },
    }));
    assert.equal(result.applied, true);
    return result.mission!;
  }
  function unchangedOnDisk(mission: Mission, attempt: () => void): void {
    const file = path.join(process.env.AWE_DATA_DIR!, "missions", `${mission.id}.json`);
    const bytes = fs.readFileSync(file, "utf8");
    const revision = storage.getMissionRevision(mission.id);
    assert.throws(attempt, SpecBindingError);
    assert.equal(fs.readFileSync(file, "utf8"), bytes);
    assert.equal(storage.getMissionRevision(mission.id), revision);
  }
  check("storage approval atomically persists a binding and rejects all approved field drift", () => {
    for (const [name, mutate] of Object.entries(mutations)) {
      if (name === "mission identity") continue;
      const mission = storedApproved();
      assertApprovedSpecBinding(storage.loadMission(mission.id)!);
      const changed = structuredClone(mission);
      mutate(changed);
      unchangedOnDisk(mission, () => storage.saveMission(changed));
      unchangedOnDisk(mission, () => storage.updateMissionAtomic(mission.id, () => changed));
    }
  });
  check("storage rejects in-place mutator and fence changes against the original stored binding", () => {
    const mission = storedApproved();
    unchangedOnDisk(mission, () => storage.updateMissionAtomic(mission.id, (cur) => {
      specification(cur).suggested_tools.push("shell");
      return { metadata: cur.metadata };
    }));
    unchangedOnDisk(mission, () => storage.updateMissionAtomic(mission.id, () => ({ status: "running" }), {
      fence: (cur) => { specification(cur).scope = "publish"; return true; },
    }));
    const noop = storage.updateMissionAtomic(mission.id, (cur) => {
      cur.description = "must not escape through the returned record";
      return null;
    });
    assert.equal(noop.mission?.description, mission.description);
    assert.equal(storage.loadMission(mission.id)?.description, mission.description);
  });
  check("save, compatibility update and CAS cannot remove or rehash an existing binding", () => {
    const mission = storedApproved();
    const replacement = structuredClone(mission);
    delete replacement.metadata[APPROVED_SPEC_BINDING_KEY];
    unchangedOnDisk(mission, () => storage.saveMission(replacement));
    unchangedOnDisk(mission, () => storage.updateMission(mission.id, { metadata: replacement.metadata }));
    replacement.description += " new task";
    replacement.metadata[APPROVED_SPEC_BINDING_KEY] = createApprovedSpecBinding(replacement);
    unchangedOnDisk(mission, () => storage.compareAndSetMission(mission.id, storage.getMissionRevision(mission.id)!, replacement));
    const current = storage.loadMission(mission.id)!;
    storage.updateMission(mission.id, { status: "completed" });
    unchangedOnDisk(current, () => storage.updateMissionAtomic(mission.id, () => ({ ...replacement, status: "pending_approval" }), { allowTerminalTransition: true }));
  });
  check("storage permits execution updates and preserves provisioned mission workspaces", () => {
    const mission = storedApproved();
    const expectedHash = assertApprovedSpecBinding(mission).spec_hash;
    const result = storage.updateMissionAtomic(mission.id, (cur) => ({
      status: "running", artifacts: ["artifact-id"], metadata: { ...cur.metadata, execution: { phase: "planning" } },
    }));
    assert.equal(result.applied, true);
    assertApprovedSpecBinding(result.mission!, expectedHash);
    storage.saveMission({ ...result.mission!, status: "paused" });
    assertApprovedSpecBinding(storage.loadMission(mission.id)!, expectedHash);
    const workspace = storage.prepareMissionWorkspace(mission.id);
    assert.equal(workspace, fs.realpathSync(storage.missionArtifactDir(mission.id)));
  });
  check("legacy unbound states stay loadable/writable without inferred approval", () => {
    for (const status of ["pending_approval", "approved", "running", "paused", "failed", "cancelled", "completed"] as const) {
      const mission = draft();
      mission.id = `r1-legacy-${status}`;
      mission.status = status;
      mission.metadata = { specification: { suggested_tools: ["save_artifact"] } };
      storage.saveMission(mission);
      storage.updateMission(mission.id, { metadata: { ...mission.metadata, recovery_note: "preserve evidence" } });
      const loaded = storage.loadMission(mission.id)!;
      assert.equal(loaded.status, status);
      assert.equal(loaded.metadata[APPROVED_SPEC_BINDING_KEY], undefined);
      assert.throws(() => assertApprovedSpecBinding(loaded), SpecBindingError);
    }
    const legacyDraft = draft();
    legacyDraft.id = "r1-legacy-explicit-approval";
    storage.saveMission(legacyDraft);
    const result = storage.updateMissionAtomic(legacyDraft.id, (cur) => ({
      status: "approved", metadata: { ...cur.metadata, [APPROVED_SPEC_BINDING_KEY]: createApprovedSpecBinding(cur) },
    }));
    assertApprovedSpecBinding(result.mission!);
  });
  check("new malformed supplied bindings and existing corrupted bindings cannot be overwritten", () => {
    const mission = draft();
    mission.id = "r1-invalid-new-binding";
    mission.metadata[APPROVED_SPEC_BINDING_KEY] = {};
    assert.throws(() => storage.saveMission(mission), SpecBindingError);
    assert.equal(storage.loadMission(mission.id), null);
    const bound = storedApproved();
    const file = path.join(process.env.AWE_DATA_DIR!, "missions", `${bound.id}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    raw.metadata[APPROVED_SPEC_BINDING_KEY].spec_hash = "0".repeat(64);
    fs.writeFileSync(file, JSON.stringify(raw));
    assert.ok(storage.loadMission(bound.id), "corrupt binding stays inspectable for recovery");
    unchangedOnDisk(bound, () => storage.saveMission(bound));
    unchangedOnDisk(bound, () => storage.updateMission(bound.id, { metadata: {} }));
    raw.acceptance_criteria = [];
    fs.writeFileSync(file, JSON.stringify(raw));
    const damagedBytes = fs.readFileSync(file, "utf8");
    assert.throws(() => storage.saveMission(bound), /refusing to overwrite approval evidence/);
    assert.equal(fs.readFileSync(file, "utf8"), damagedBytes);
  });
  // Import the CLI from an empty cwd so its dotenv bootstrap cannot read the
  // developer's real environment file. Storage is already bound to the sandbox.
  const cwd = process.cwd();
  process.chdir(sandbox);
  let cli: typeof import("../index.js");
  try { cli = await import("../index.js"); } finally { process.chdir(cwd); }
  let managerCalls = 0;
  const cliDeps: import("../index.js").CliDependencies = {
    storage,
    createSpecification: async () => structuredClone(spec),
    reconcileOrphanedMissions: () => {},
    installTerminationHandlers: () => () => {},
    isInteractive: () => false,
    createMissionManager: (mission) => {
      assertApprovedSpecBinding(mission);
      managerCalls++;
      return { run: async () => ({ mission, review: null }) };
    },
  };
  const cliDraft = draft();
  cliDraft.id = "r1-cli-explicit-approval";
  storage.saveMission(cliDraft);
  await cli.runEntryPoint(["node", "awe", "approve", cliDraft.id], cliDeps);
  check("CLI absent approval leaves an unbound pending mission", () => {
    assert.equal(managerCalls, 0);
    assert.equal(storage.loadMission(cliDraft.id)!.metadata[APPROVED_SPEC_BINDING_KEY], undefined);
  });
  await cli.runEntryPoint(["node", "awe", "approve", cliDraft.id, "--approve"], cliDeps);
  check("CLI explicit approve binds before constructing the manager", () => {
    assert.equal(managerCalls, 1);
    assertApprovedSpecBinding(storage.loadMission(cliDraft.id)!);
  });
  await cli.runEntryPoint(["node", "awe", "run", "offline binding request", "--approve"], cliDeps);
  check("CLI one-shot explicit run binds before constructing the manager", () => assert.equal(managerCalls, 2));
  const raced = draft();
  raced.id = "r1-cli-display-race";
  storage.saveMission(raced);
  await cli.runEntryPoint(["node", "awe", "approve", raced.id], {
    ...cliDeps,
    isInteractive: () => true,
    confirm: async () => {
      storage.updateMission(raced.id, { description: "Changed after display" });
      return "y";
    },
  });
  check("CLI does not approve a specification changed while the user was confirming", () => {
    assert.equal(managerCalls, 2);
    assert.equal(storage.loadMission(raced.id)!.status, "pending_approval");
    assert.equal(storage.loadMission(raced.id)!.metadata[APPROVED_SPEC_BINDING_KEY], undefined);
  });

  const { createApiServer } = await import("../api/server.js");
  const api = createApiServer(0, {
    host: "127.0.0.1", apiSecret: "r1-offline-binding-test",
    dependencies: { createMissionManager: (mission, _timeout, options) => {
      assertApprovedSpecBinding(mission);
      managerCalls++;
      return { run: async () => { options?.lease?.release(); } };
    } },
  });
  try {
    if (!api.listening) await new Promise<void>((resolve, reject) => {
      api.once("listening", resolve); api.once("error", reject);
    });
    const address = api.address();
    assert.ok(address && typeof address === "object");
    const approveApi = (id: string): Promise<number> => new Promise((resolve, reject) => {
      const request = http.request({
        host: "127.0.0.1", port: address.port, method: "POST", path: `/missions/${id}/approve`,
        headers: { "x-api-key": "r1-offline-binding-test", "content-type": "application/json" },
      }, (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode!));
      });
      request.on("error", reject);
      request.end("{}");
    });
    const apiDraft = draft();
    apiDraft.id = "r1-api-explicit-approval";
    storage.saveMission(apiDraft);
    const success = await approveApi(apiDraft.id);
    check("API approval binds the complete task before manager invocation", () => {
      assert.equal(success, 200);
      assert.equal(managerCalls, 3);
      assertApprovedSpecBinding(storage.loadMission(apiDraft.id)!);
    });
    const incomplete = draft();
    incomplete.id = "r1-api-incomplete-approval";
    incomplete.metadata = {};
    storage.saveMission(incomplete);
    const refused = await approveApi(incomplete.id);
    check("API returns conflict for incomplete legacy approval and starts no execution", () => {
      assert.equal(refused, 409);
      assert.equal(managerCalls, 3);
      assert.equal(storage.loadMission(incomplete.id)!.status, "pending_approval");
      assert.equal(storage.loadMission(incomplete.id)!.metadata[APPROVED_SPEC_BINDING_KEY], undefined);
    });
  } finally {
    await new Promise<void>((resolve, reject) => api.close((error) => error ? reject(error) : resolve()));
  }
  const { headAgent, planMission } = await import("../agents/head-agent.js");
  const { ordinaryPlan } = await import("../agents/capability-plane.js");
  const originalGenerate = headAgent.generate;
  let generated = 0;
  let prompt = "";
  let reply = JSON.stringify({
    strategy: "Write draft", delegations: [{ agent_role: "writer", task: "Draft", context: "compact context", tools: ["save_artifact", "shell"], expected_output: "brief", parallel: false }],
  });
  let mutateDuringPlanning: (() => void) | undefined;
  Object.defineProperty(headAgent, "generate", { configurable: true, writable: true, value: async (messages: Array<{ content: string }>) => {
    generated++;
    prompt = messages[0].content;
    mutateDuringPlanning?.();
    return { text: reply };
  } });
  try {
    const mission = approved();
    const plan = ordinaryPlan(await planMission(mission))!;
    check("actual Head prompt includes full approved description, scope/exclusions, risks and acceptance", () => {
      for (const value of [mission.description, spec.scope, ...spec.risks, ...spec.acceptance_criteria, assertApprovedSpecBinding(mission).spec_hash]) {
        assert.ok(prompt.includes(value), `Missing prompt content: ${value}`);
        assert.ok(plan.delegations[0].context.includes(value), `Missing delegation content: ${value}`);
      }
      assert.deepEqual(plan.delegations[0].tools, ["save_artifact"]);
    });
    reply = "not JSON";
    const fallback = ordinaryPlan(await planMission(mission))!;
    check("Head fallback retains the entire approval and never expands grants", () => {
      assert.ok(fallback.delegations[0].context.includes(spec.scope));
      assert.ok(fallback.delegations[0].context.includes(mission.description));
      assert.deepEqual(fallback.delegations[0].tools, spec.suggested_tools);
    });
    const gapMission = draft();
    specification(gapMission).suggested_tools = [...specification(gapMission).suggested_tools, "render_dashboard"];
    gapMission.metadata[APPROVED_SPEC_BINDING_KEY] = createApprovedSpecBinding(gapMission, timestamp);
    gapMission.status = "approved";
    reply = JSON.stringify({
      strategy: "Bypass with shell", delegations: [{ agent_role: "writer", task: "Draft", context: "compact context", tools: ["save_artifact"], expected_output: "brief", parallel: false }],
    });
    const gapDecision = await planMission(gapMission);
    reply = "not JSON";
    const gapFallback = await planMission(gapMission);
    check("Head cannot silently bypass an approved but unregistered suggested capability", () => {
      for (const decision of [gapDecision, gapFallback]) {
        assert.equal(ordinaryPlan(decision), null);
        if (!("status" in decision)) throw new Error("Expected a capability decision");
        assert.equal(decision.status, "acquire");
        assert.equal(decision.capability, "render_dashboard");
      }
    });
    const beforeCalls = generated;
    await assert.rejects(planMission(draft()), SpecBindingError);
    const tampered = approved();
    specification(tampered).scope = "outside approval";
    await assert.rejects(planMission(tampered), SpecBindingError);
    const pending = approved();
    pending.status = "pending_approval";
    await assert.rejects(planMission(pending), /not approved for planning/);
    check("Head rejects missing/drifted approval and pending status before model calls", () => assert.equal(generated, beforeCalls));
    const mutable = approved();
    mutateDuringPlanning = () => { mutable.description = "changed while awaiting model"; };
    await assert.rejects(planMission(mutable), SpecBindingError);
    check("Head refuses an in-flight specification mutation instead of returning fallback", () => assert.equal(generated, beforeCalls + 1));
  } finally {
    headAgent.generate = originalGenerate;
  }
} finally {
  globalThis.fetch = originalFetch;
  fs.rmSync(sandbox, { recursive: true, force: true });
}
console.log(`\n${checks} spec-binding checks passed (offline, isolated data).`);
