#!/usr/bin/env npx tsx
/** R0 interface governance regressions: no provider calls or external network. */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as http from "node:http";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Mission } from "../types/index.js";
import { assertApprovedSpecBinding } from "../utils/spec-binding.js";
import type {
  ApiServerDependencies,
  ApiServerOptions,
} from "../api/server.js";
import type { Server } from "node:http";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI_CHILD = path.join(ROOT, "src/tests/helpers/r0-closure-interfaces-cli-child.ts");
const TSX_LOADER = path.join(ROOT, "node_modules/tsx/dist/loader.mjs");
const originalCwd = process.cwd();
const suiteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "awe-r0-closure-interfaces-"));
const apis: Server[] = [];
let checks = 0;

function check(condition: unknown, name: string, detail = ""): void {
  assert.ok(condition, `${name}${detail ? ` — ${detail}` : ""}`);
  checks++;
}

function section(name: string): void {
  console.log(`\n━━━ ${name} ━━━`);
}

function baseMission(id: string, status: Mission["status"]): Mission {
  const now = new Date().toISOString();
  return {
    id,
    title: "offline interface fixture",
    description: "isolated test",
    objective: "verify interface governance",
    acceptance_criteria: ["Return verified evidence"],
    status,
    priority: "normal",
    created_at: now,
    updated_at: now,
    artifacts: [],
    metadata: {},
  };
}

interface CliResult {
  exitCode: number;
  specificationCalls: number;
  managerFactoryCalls: number;
  managerRunCalls: number;
  admissionPolicyCalls: number;
  admissionMissionIds: string[];
  experiencePolicyCalls: number;
  experienceMissionIds: string[];
  experienceOptions: Array<{ scope: string } | null>;
  recoveryCalls: number;
  recoveryDecisions: Array<{ decision: string; artifacts?: string[] }>;
  allowedStatuses: string[][];
  missions: Array<{ id: string; status: Mission["status"] }>;
  dataDir: string;
  memoryDbPath: string;
  checkpointFile: string;
  cwd: string;
  credentialSource: string;
}

function cliChild(
  cwd: string,
  args: string[],
  extraEnv: Record<string, string | undefined> = {}
): { result: CliResult; stdout: string; stderr: string } {
  const childEnv: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: cwd,
    NODE_PATH: path.join(ROOT, "node_modules"),
    AWE_OFFLINE_TEST: "1",
    ROUTER_CHEAP_BASE_URL: "http://127.0.0.1:9/v1",
    NO_COLOR: "1",
  };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }
  const run = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(TSX_LOADER).href, CLI_CHILD, ...args],
    { cwd, env: childEnv, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }
  );
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";
  const line = stdout.split("\n").find((entry) => entry.startsWith("R0_CLOSURE_INTERFACES_RESULT "));
  if (!line && run.status !== 0) {
    return { result: { exitCode: run.status ?? 1, specificationCalls: 0, managerFactoryCalls: 0, managerRunCalls: 0,
      admissionPolicyCalls: 0, experiencePolicyCalls: 0, admissionMissionIds: [], experienceMissionIds: [], experienceOptions: [],
      recoveryCalls: 0, recoveryDecisions: [], allowedStatuses: [], missions: [], dataDir: "", memoryDbPath: "",
      checkpointFile: "", cwd, credentialSource: "bootstrap-refused" }, stdout, stderr };
  }
  assert.ok(line, `CLI result marker missing; status=${run.status} signal=${run.signal}\n${stdout}\n${stderr}`);
  const result = JSON.parse(line!.slice("R0_CLOSURE_INTERFACES_RESULT ".length)) as CliResult;
  assert.equal(run.status, result.exitCode, `child exit/result mismatch\n${stdout}\n${stderr}`);
  return { result, stdout, stderr };
}

function makeCliWorkspace(envContents = "AWE_DATA_DIR=./dotenv-data\n"): string {
  const cwd = fs.mkdtempSync(path.join(suiteRoot, "cli-"));
  fs.writeFileSync(path.join(cwd, ".env"), envContents, { mode: 0o600 });
  return cwd;
}

function assertIsolatedRoots(result: CliResult, expectedRoot: string, cwd: string): void {
  const root = path.resolve(expectedRoot);
  check(result.dataDir === root, "storage resolves only to the absolute .env AWE_DATA_DIR", result.dataDir);
  check(result.memoryDbPath === path.join(root, "memory.db"), "memory resolves under the same absolute root", result.memoryDbPath);
  check(result.checkpointFile === path.join(root, "checkpoints", "r0-env-lifecycle-probe.json"), "lifecycle resolves under the same absolute root", result.checkpointFile);
  check(!fs.existsSync(path.join(cwd, ".awe-data")), "default .awe-data was never created");
}

interface ApiResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  body: any;
}

async function openApi(options: ApiServerOptions = {}): Promise<{ server: Server; port: number }> {
  const server = createApiServer(0, { apiSecret: "r0-interface-test-secret", ...options });
  apis.push(server);
  if (!server.listening) await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return { server, port: address.port };
}

function request(
  port: number,
  method: string,
  route: string,
  options: { key?: string; body?: unknown; rawBody?: string; origin?: string } = {}
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const payload = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const headers: Record<string, string> = {};
    if (options.key) headers["x-api-key"] = options.key;
    if (options.origin) headers.origin = options.origin;
    if (payload !== undefined) {
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(payload));
    }
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: route,
      headers,
      timeout: 5000,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let body: any = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = text; }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, text, body });
      });
    });
    req.on("timeout", () => req.destroy(new Error("local request timeout")));
    req.on("error", reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function until(condition: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const offlineSpecification = async () => ({
  title: "API offline specification",
  objective: "test authenticated interfaces",
  scope: "local only",
  acceptance_criteria: ["Persist pending approval"],
  suggested_tools: [],
  suggested_agents: [],
  estimated_complexity: "trivial" as const,
  risks: [],
});

// Only Node/test modules above were evaluated before this isolated cwd/root.
process.chdir(suiteRoot);
process.env.AWE_DATA_DIR = path.join(suiteRoot, "api-data");
process.env.AWE_OFFLINE_TEST = "1";
process.env.ROUTER_CHEAP_API_KEY = "r0-offline-no-provider";
process.env.OPENAI_API_KEY = "r0-offline-no-provider";
process.env.ROUTER_CHEAP_BASE_URL = "http://127.0.0.1:9/v1";
delete process.env.AWE_API_HOST;
delete process.env.AWE_API_CORS_ORIGINS;
process.env.AWE_API_SECRET = "inherited-value-ignored-by-explicit-test-options";

const storage = await import("../utils/storage.js");
const lifecycle = await import("../agents/lifecycle.js");
const managers = await import("../agents/mission-manager.js");
const { createApiServer } = await import("../api/server.js");

try {
  section("one-shot explicit approval and durable pending recovery");
  {
    const cwd = makeCliWorkspace();
    const pending = cliChild(cwd, ["run", "create", "an", "artifact"]);
    check(pending.result.exitCode === 0, "absent noninteractive approval is a successful pending operation", pending.stderr);
    check(pending.result.specificationCalls === 1, "offline specification seam ran once");
    check(pending.result.managerFactoryCalls === 0 && pending.result.managerRunCalls === 0, "default noninteractive run never constructs or starts a manager");
    check(pending.result.missions.length === 1 && pending.result.missions[0].status === "pending_approval", "generated specification is persisted pending_approval first");
    assertIsolatedRoots(pending.result, path.join(cwd, "dotenv-data"), cwd);
    const pendingId = pending.result.missions[0].id;

    const approved = cliChild(cwd, ["approve", pendingId, "--approve"], { R0_TEST_EXPERIENCE: "1" });
    check(approved.result.managerFactoryCalls === 1 && approved.result.managerRunCalls === 1, "shipped approve command starts a pending mission exactly once", approved.stderr);
    check(approved.result.allowedStatuses[0]?.join(",") === "approved", "approve command permits only the approved claim");
    check(approved.result.admissionPolicyCalls === 1 && approved.result.admissionMissionIds[0] === pendingId,
      "shipped approve resolves and passes host-only admission before manager construction");
    check(approved.result.experiencePolicyCalls === 1 && approved.result.experienceMissionIds[0] === pendingId &&
      approved.result.experienceOptions[0]?.scope === "host-selected",
      "shipped approve forwards only host-resolved verified experience");
    check(approved.result.missions[0]?.status === "approved", "approved fixture remains recoverable at the pre-running crash boundary");

    const resumed = cliChild(cwd, ["resume", pendingId, "--timeout", "2"]);
    check(resumed.result.managerFactoryCalls === 1 && resumed.result.managerRunCalls === 1, "approved crash-window record resumes through the shipped CLI", resumed.stderr);
    check(resumed.result.allowedStatuses[0]?.includes("approved") && resumed.result.allowedStatuses[0]?.includes("paused"), "CLI resume accepts only the two explicitly recoverable states");
    check(resumed.result.admissionPolicyCalls === 1 && resumed.result.admissionMissionIds[0] === pendingId,
      "shipped CLI resume reconstructs admission for the exact persisted mission");
  }

  {
    const cwd = makeCliWorkspace();
    const denied = cliChild(cwd, ["run", "offline", "request", "--no-approve"]);
    check(denied.result.managerFactoryCalls === 0 && denied.result.managerRunCalls === 0, "--no-approve never invokes a manager");
    check(denied.result.missions[0]?.status === "pending_approval", "--no-approve preserves pending_approval");
    assertIsolatedRoots(denied.result, path.join(cwd, "dotenv-data"), cwd);
  }

  {
    const cwd = makeCliWorkspace();
    const approved = cliChild(cwd, ["run", "offline", "request", "--approve"]);
    check(approved.result.exitCode === 0, "explicit approval returns the injected successful outcome");
    check(approved.result.managerFactoryCalls === 1 && approved.result.managerRunCalls === 1, "explicit --approve starts exactly once");
    check(approved.result.allowedStatuses.length === 1 && approved.result.allowedStatuses[0][0] === "approved", "one-shot approval has one approved execution attempt");
  }

  {
    const cwd = makeCliWorkspace();
    const contradiction = cliChild(cwd, ["run", "offline", "request", "--approve", "--no-approve"]);
    check(contradiction.result.exitCode === 2, "contradictory approval flags are rejected");
    check(contradiction.result.specificationCalls === 0 && contradiction.result.managerFactoryCalls === 0, "contradictory flags have no Prompt Master or manager effects");
    check(contradiction.result.missions.length === 0, "contradictory flags create no mission");
  }

  {
    const declinedCwd = makeCliWorkspace();
    const declined = cliChild(declinedCwd, ["run", "interactive", "request"], {
      R0_TEST_INTERACTIVE: "1",
      R0_TEST_ANSWER: "n",
    });
    check(declined.result.managerFactoryCalls === 0 && declined.result.missions[0]?.status === "pending_approval", "interactive default no preserves pending and zero manager calls");

    const acceptedCwd = makeCliWorkspace();
    const accepted = cliChild(acceptedCwd, ["run", "interactive", "request"], {
      R0_TEST_INTERACTIVE: "1",
      R0_TEST_ANSWER: "y",
    });
    check(accepted.result.managerFactoryCalls === 1 && accepted.result.managerRunCalls === 1 && accepted.result.exitCode === 0, "interactive y explicitly approves one execution");
  }

  {
    const acceptCwd = makeCliWorkspace();
    const accepted = cliChild(acceptCwd, [
      "accept", "mission-local", "intent-local", "artifact-a", "artifact-b",
      "--operator", "local-operator", "--note", "verified through REST integration coverage",
    ]);
    check(accepted.result.exitCode === 0 && accepted.result.recoveryCalls === 1, "shipped CLI accept invokes the resolver seam once", accepted.stderr);
    check(accepted.result.recoveryDecisions[0]?.decision === "accept" && accepted.result.recoveryDecisions[0]?.artifacts?.length === 2, "CLI accept forwards explicit artifact ids");
    check(accepted.result.managerFactoryCalls === 0, "CLI accept alone never starts execution");

    const retryCwd = makeCliWorkspace();
    const retried = cliChild(retryCwd, [
      "retry", "mission-local", "intent-local",
      "--operator", "local-operator", "--note", "one explicit retry authorized",
    ]);
    check(retried.result.exitCode === 0 && retried.result.recoveryDecisions[0]?.decision === "retry", "shipped CLI retry is an explicit resolver operation", retried.stderr);
    check(retried.result.managerFactoryCalls === 0 && retried.result.managerRunCalls === 0, "CLI retry does not execute until a separate resume");
  }

  section("Nox production credential selection ignores developer env and inherited provider keys");
  {
    const cwd = makeCliWorkspace("AWE_DATA_DIR=./dotenv-data\nROUTER_CHEAP_API_KEY=dotenv-marker\n");
    const runtimeEnv = path.join(cwd, "runtime-private.env");
    fs.writeFileSync(runtimeEnv, "ROUTER_CHEAP_API_KEY=nox-runtime-marker\n", { mode: 0o600 });
    const processRoot = path.join(cwd, "process-data");
    const common = {
      AWE_DATA_DIR: processRoot, AWE_OFFLINE_TEST: undefined,
      ROUTER_CHEAP_API_KEY: "opencode-inherited-marker", OPENAI_API_KEY: "opencode-openai-marker",
    };
    const missing = cliChild(cwd, ["run", "offline", "request"], common);
    check(missing.result.exitCode !== 0 && missing.stderr.includes("AWE_RUNTIME_ENV_FILE"),
      "production Nox refuses to auto-load workspace or inherited provider configuration");
    const relative = cliChild(cwd, ["run", "offline", "request"], { ...common, AWE_RUNTIME_ENV_FILE: "runtime-private.env" });
    check(relative.result.exitCode !== 0 && relative.stderr.includes("absolute"), "relative runtime secret paths fail closed");
    const selected = cliChild(cwd, ["run", "offline", "request"], { ...common, AWE_RUNTIME_ENV_FILE: runtimeEnv }).result;
    assertIsolatedRoots(selected, processRoot, cwd);
    check(!fs.existsSync(path.join(cwd, "dotenv-data")), "developer workspace dotenv is not read by Nox Runtime");
    check(selected.credentialSource === "dedicated-runtime", "dedicated runtime key overrides inherited provider credential without exposing its value");

    const launcher = path.join(ROOT, "scripts/run-nox-runtime.sh");
    const missingDedicated = spawnSync(launcher, ["--help"], {
      cwd: ROOT, env: { PATH: process.env.PATH ?? "", HOME: cwd, AWE_OFFLINE_TEST: "1",
        AWE_RUNTIME_ENV_FILE: path.join(cwd, "missing-runtime.env") },
      encoding: "utf8", timeout: 30_000,
    });
    check(missingDedicated.status !== 0 && missingDedicated.stderr.includes("Dedicated Nox Runtime env file"),
      "guarded launcher strips inherited offline mode and still requires the dedicated runtime credential file",
      missingDedicated.stderr);
    check(!fs.existsSync(path.join(cwd, "dotenv-data")),
      "guarded launcher cannot select workspace dotenv through inherited offline mode");
  }

  section("API listener, authentication and CORS defaults");
  {
    assert.throws(
      () => createApiServer(0, { host: "0.0.0.0", apiSecret: "" }),
      /AWE_API_SECRET.*non-loopback/,
      "non-loopback listener without a key must be refused synchronously"
    );
    checks++;
    assert.throws(
      () => createApiServer(0, { host: "127.0.0.1", apiSecret: "" }),
      /refusing to expose open mission APIs/,
      "even loopback has no unauthenticated mission route fallback"
    );
    checks++;
    assert.throws(
      () => createApiServer(0, { apiSecret: "key", corsOrigins: ["*"] }),
      /Wildcard CORS/,
      "wildcard CORS configuration is refused"
    );
    checks++;

    const { server, port } = await openApi({ dependencies: { createSpecification: offlineSpecification } });
    const address = server.address();
    check(address && typeof address === "object" && address.address === "127.0.0.1", "default listener binds loopback only");

    const health = await request(port, "GET", "/health");
    check(health.status === 200, "nonsensitive health remains available");

    const specified = await request(port, "POST", "/specify", {
      key: "r0-interface-test-secret",
      body: { request: "create a local fixture" },
    });
    check(specified.status === 200 && specified.body.mission.status === "pending_approval", "authorized specifying mutation persists pending approval");
    const id = specified.body.mission_id as string;

    const requests: Array<[string, string, unknown?]> = [
      ["GET", "/missions"],
      ["GET", `/missions/${id}`],
      ["GET", `/missions/${id}/artifacts`],
      ["GET", `/missions/${id}/logs`],
      ["POST", `/missions/${id}/approve`, {}],
      ["POST", `/missions/${id}/resume`, {}],
      ["POST", `/missions/${id}/recovery/accept`, { intent_id: "x", operator: "o", note: "n" }],
      ["POST", `/missions/${id}/recovery/retry`, { intent_id: "x", operator: "o", note: "n" }],
      ["POST", `/missions/${id}/cancel`, {}],
    ];
    for (const [method, route, body] of requests) {
      const denied = await request(port, method, route, { body });
      check(denied.status === 401, `unauthenticated ${method} ${route} denied`, denied.text);
    }
    for (const route of [`/missions/${id}/artifacts`, `/missions/${id}/logs`]) {
      const allowed = await request(port, "GET", route, { key: "r0-interface-test-secret" });
      check(allowed.status === 200, `authorized sensitive read works: ${route}`);
    }
    const missingLogs = await request(port, "GET", "/missions/not-present/logs", { key: "r0-interface-test-secret" });
    check(missingLogs.status === 404, "missing mission logs return honest 404", missingLogs.text);
    const traversalLogs = await request(port, "GET", "/missions/..%2Foutside/logs", { key: "r0-interface-test-secret" });
    check(traversalLogs.status === 400 && !traversalLogs.text.includes("r0-interface-test-secret"), "decoded log ids cannot traverse out of the state root", traversalLogs.text);
    const malformed = await request(port, "POST", "/specify", {
      key: "r0-interface-test-secret",
      rawBody: '{"request":"r0-interface-test-secret"',
    });
    check(malformed.status === 400 && typeof malformed.body?.error === "string" && !malformed.text.includes("<html") && !malformed.text.includes("r0-interface-test-secret"), "terminal API error middleware returns redacted JSON", malformed.text);

    const corsRead = await request(port, "GET", "/missions", {
      key: "r0-interface-test-secret",
      origin: "https://untrusted.example",
    });
    check(corsRead.headers["access-control-allow-origin"] === undefined, "default CORS emits no origin grant");
    check(corsRead.headers["access-control-allow-origin"] !== "*", "API never defaults to wildcard CORS");

    const allowedOrigin = await openApi({
      corsOrigins: ["https://allowed.example"],
      dependencies: { createSpecification: offlineSpecification },
    });
    const allowedCors = await request(allowedOrigin.port, "GET", "/missions", {
      key: "r0-interface-test-secret",
      origin: "https://allowed.example",
    });
    check(allowedCors.headers["access-control-allow-origin"] === "https://allowed.example", "explicit CORS allowlist echoes only its configured origin");
    const deniedCors = await request(allowedOrigin.port, "GET", "/missions", {
      key: "r0-interface-test-secret",
      origin: "https://other.example",
    });
    check(deniedCors.headers["access-control-allow-origin"] === undefined, "non-allowlisted origin receives no CORS grant");
  }

  section("API strict recovery resolver, accept evidence and explicit retry");
  {
    let planCalls = 0;
    let specialistCalls = 0;
    let experiencePolicyCalls = 0;
    let apiExperienceForwarded = false;
    const dependencies: ApiServerDependencies = {
      createSpecification: offlineSpecification,
      resolveMissionExperience: () => {
        experiencePolicyCalls++;
        return {
          selection: { scope: "api-host-memory", capabilityHash: "b".repeat(64), profileHash: "c".repeat(64) },
          authority: { inspect: () => null, admit: () => { throw new Error("not executed by interface test"); } } as never,
          authorizeTarget: () => true,
        };
      },
      createMissionManager: (mission, timeout, options) => {
        apiExperienceForwarded = options?.experience?.selection.scope === "api-host-memory";
        return managers.createMissionManager(mission, timeout, {
        ...options,
        quiesceTimeoutMs: 500,
        deps: {
          planMission: async () => {
            planCalls++;
            return {
              strategy: "reuse accepted work",
              delegations: [{
                agent_role: "executor",
                task: "do work",
                context: "",
                tools: [],
                expected_output: "out",
                parallel: false,
              }],
            };
          },
          executeSpecialist: async () => {
            specialistCalls++;
            throw new Error("accepted work must not execute again");
          },
          reviewMissionDetailed: async () => ({
            review: {
              passed: true,
              score: 9,
              criteria_results: [{ criterion: "Return verified evidence", passed: true, notes: "offline" }],
              defects: [],
              recommendations: [],
              verdict: "PASS",
            },
            gate: { passed: true, blockers: [], criterion_checks: [], llm_score: 9, llm_passed: true },
          }),
          resolveModelForRole: () => "offline-injected-model",
        },
      });
    },
    };
    const { port } = await openApi({ dependencies });
    const id = "r0-api-recovery-accept";
    const intentId = "intent-api-accept";
    const blocked = baseMission(id, "paused");
    blocked.metadata = {
      recovery_blocked: {
        kind: "ambiguous_delegation_outcome",
        entries: [{ intent_id: intentId, agent_role: "executor", task: "do work", reasons: ["strict policy"] }],
      },
    };
    storage.saveMission(blocked);
    const artifact = storage.saveArtifactFile(id, "verified.txt", "real verified evidence");
    const fingerprint = lifecycle.delegationFingerprint("executor", "do work", "out");
    const makeBlockedCheckpoint = (missionId: string, resolutionIntent: string) => lifecycle.saveCheckpoint({
      mission_id: missionId,
      version: 1,
      saved_at: new Date().toISOString(),
      timeout_ms: 30_000,
      elapsed_ms: 0,
      completed: [],
      repair_iterations: 0,
      reason: "manual",
      in_flight: [{
        fingerprint,
        agent_role: "executor",
        task: "do work",
        started_at: new Date().toISOString(),
        protocol: "intent-v1",
        intent_id: resolutionIntent,
        kind: "delegation",
        baseline: { artifact_ids: [], artifact_fs_digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", tree_node_ids: [] },
        ambiguous: { detected_at: new Date().toISOString(), reasons: ["strict policy"] },
      }],
    } as any);
    makeBlockedCheckpoint(id, intentId);

    const resumed = await request(port, "POST", `/missions/${id}/resume`, {
      key: "r0-interface-test-secret",
      body: {},
    });
    check(resumed.status === 202, "authenticated paused resume is shipped");
    await until(() => {
      const mission = storage.loadMission(id)!;
      return mission.status === "paused" && Boolean((mission.metadata.execution_owner as any)?.released_at);
    }, "strict unresolved-intent gate to settle");
    check(planCalls === 0 && specialistCalls === 0, "strict unresolved-intent gate blocks Head and specialist effects before resolution");
    check(storage.loadMission(id)?.status === "paused", "unresolved resume returns to paused rather than bypassing recovery");

    const noEvidence = await request(port, "POST", `/missions/${id}/recovery/accept`, {
      key: "r0-interface-test-secret",
      body: { intent_id: intentId, operator: "local-operator", note: "accept only with proof" },
    });
    check(noEvidence.status === 409, "accept without resolver-required artifact evidence is refused");
    check((lifecycle.loadCheckpoint(id)?.in_flight ?? []).length === 1, "failed accept preserves ambiguous evidence");

    const inventedEvidence = await request(port, "POST", `/missions/${id}/recovery/accept`, {
      key: "r0-interface-test-secret",
      body: { intent_id: intentId, operator: "local-operator", note: "check registration", artifacts: ["invented-artifact"] },
    });
    check(inventedEvidence.status === 409, "accept with invented artifact evidence is refused by the real resolver");

    const accepted = await request(port, "POST", `/missions/${id}/recovery/accept`, {
      key: "r0-interface-test-secret",
      body: { intent_id: intentId, operator: "local-operator", note: "verified hash and bytes", artifacts: [artifact.id] },
    });
    check(accepted.status === 200 && accepted.body.remaining === 0, "operator accept succeeds with real verified artifact evidence", accepted.text);
    check((lifecycle.loadCheckpoint(id)?.in_flight ?? []).length === 0, "real resolver durably resolves accepted intent");
    check((storage.loadMission(id)?.metadata.recovery_resolutions as any[])?.[0]?.decision === "accept", "accept decision is auditable in mission metadata");

    const afterAccept = await request(port, "POST", `/missions/${id}/resume`, {
      key: "r0-interface-test-secret",
      body: {},
    });
    check(afterAccept.status === 202, "accepted paused mission remains resumable");
    await until(() => storage.loadMission(id)?.status === "completed", "accepted mission completion");
    check(planCalls === 1 && specialistCalls === 0, "resume reuses accepted evidence without executing the effect again");
    check(experiencePolicyCalls === 2 && apiExperienceForwarded,
      "API blocked and accepted resumes resolve and forward host experience before manager construction");
    check(storage.listArtifacts(id).some((entry) => entry.id === artifact.id), "accepted verified artifact remains a real deliverable");

    const terminalResume = await request(port, "POST", `/missions/${id}/resume`, {
      key: "r0-interface-test-secret",
      body: {},
    });
    check(terminalResume.status === 409 && planCalls === 1, "terminal mission cannot be resumed");
    const pending = baseMission("r0-api-resume-pending", "pending_approval");
    storage.saveMission(pending);
    const pendingResume = await request(port, "POST", `/missions/${pending.id}/resume`, {
      key: "r0-interface-test-secret",
      body: {},
    });
    check(pendingResume.status === 409 && planCalls === 1, "pending approval cannot be smuggled through resume");

    const retryId = "r0-api-recovery-retry";
    const retryMission = baseMission(retryId, "paused");
    retryMission.metadata = { recovery_blocked: { kind: "ambiguous_delegation_outcome", entries: [{ intent_id: "intent-api-retry" }] } };
    storage.saveMission(retryMission);
    makeBlockedCheckpoint(retryId, "intent-api-retry");
    const retried = await request(port, "POST", `/missions/${retryId}/recovery/retry`, {
      key: "r0-interface-test-secret",
      body: { intent_id: "intent-api-retry", operator: "local-operator", note: "explicitly authorize one retry" },
    });
    check(retried.status === 200 && retried.body.decision === "retry", "explicit retry operation is shipped through the real resolver", retried.text);
    check((lifecycle.loadCheckpoint(retryId)?.in_flight ?? []).length === 0, "retry removes only the explicitly resolved intent");
    check((storage.loadMission(retryId)?.metadata.recovery_resolutions as any[])?.[0]?.decision === "retry", "retry decision preserves an audit record");
    check(specialistCalls === 0, "retry resolution alone never executes a specialist");
  }

  section("deferred stale API failure cannot overwrite a replacement owner");
  {
    const id = "r0-api-stale-fallback";
    const pending = baseMission(id, "pending_approval");
    pending.metadata.specification = {
      ...(await offlineSpecification()), title: pending.title, objective: pending.objective,
      acceptance_criteria: pending.acceptance_criteria,
    };
    storage.saveMission(pending);
    let rejectOld!: (error: Error) => void;
    const oldRun = new Promise<unknown>((_resolve, reject) => { rejectOld = reject; });
    let releaseReplacement!: () => void;
    let resolveReplacement!: (value: unknown) => void;
    const replacementRun = new Promise<unknown>((resolve) => { resolveReplacement = resolve; });
    let factoryCalls = 0;
    let oldOwner = "";
    let oldGeneration = 0;
    const dependencies: ApiServerDependencies = {
      createSpecification: offlineSpecification,
      createMissionManager: (_mission, _timeout, options) => {
        factoryCalls++;
        const lease = options!.lease!;
        if (factoryCalls === 1) {
          oldOwner = lease.ownerId;
          oldGeneration = lease.generation;
          return {
            run: () => {
              // Simulate the old attempt losing/releasing ownership before its
              // deferred transport/model failure reaches the API catch handler.
              lease.release();
              return oldRun;
            },
          };
        }
        return {
          run: () => {
            const claimed = storage.updateMissionAtomic(
              id,
              (cur) => cur.status === "approved" ? { status: "running" } : null,
              { fence: () => lease.isHeld() }
            );
            assert.ok(claimed.applied, "replacement manager must claim approved mission");
            releaseReplacement = () => lease.release();
            return replacementRun;
          },
        };
      },
    };
    const { port } = await openApi({ dependencies });
    const approved = await request(port, "POST", `/missions/${id}/approve`, {
      key: "r0-interface-test-secret",
      body: {},
    });
    check(approved.status === 200 && factoryCalls === 1, "old approved attempt started once", approved.text);
    check(storage.loadMission(id)?.status === "approved", "deferred old failure leaves the approved crash-window state");

    const resumed = await request(port, "POST", `/missions/${id}/resume`, {
      key: "r0-interface-test-secret",
      body: {},
    });
    check(resumed.status === 202 && factoryCalls === 2, "new owner resumed the approved interrupted attempt", resumed.text);
    const replacement = storage.loadMission(id)!;
    const replacementOwner = replacement.metadata.execution_owner as any;
    const replacementRevision = storage.getMissionRevision(id);
    const replacementLogs = fs.readFileSync(path.join(storage.DATA_DIR, `${id}.log`), "utf8");
    // Lifecycle generations increment over an extant lease record; release removes
    // that record, so the random owner id is the durable distinguishing fence.
    check(replacement.status === "running" && replacementOwner.owner_id !== oldOwner && Number.isFinite(replacementOwner.generation) && Number.isFinite(oldGeneration), "replacement has a distinct fenced owner id and running state");

    rejectOld(new Error("deferred stale failure r0-interface-test-secret"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const afterOldFailure = storage.loadMission(id)!;
    check(afterOldFailure.status === "running", "deferred old rejection cannot mark replacement failed");
    check((afterOldFailure.metadata.execution_owner as any).owner_id === replacementOwner.owner_id, "deferred old rejection cannot overwrite replacement owner metadata");
    check(storage.getMissionRevision(id) === replacementRevision, "owner-fenced old fallback performs no mission CAS write");
    check(storage.listArtifacts(id).length === 0, "deferred old failure produces no artifacts");
    const logsAfter = fs.readFileSync(path.join(storage.DATA_DIR, `${id}.log`), "utf8");
    check(logsAfter === replacementLogs + "Mission resumed via API with strict unresolved-intent recovery\n" || !logsAfter.includes("deferred stale failure"), "deferred old failure adds no sensitive error log over replacement state");
    check(!logsAfter.includes("r0-interface-test-secret"), "API credentials never appear in mission logs");

    resolveReplacement({ mission: storage.loadMission(id), review: null });
    releaseReplacement();
    await replacementRun;
  }

  section("synchronous runner rejection stays nonterminal and retains ownership evidence");
  {
    const id = "r0-api-sync-rejection";
    const pending = baseMission(id, "pending_approval");
    pending.metadata.specification = {
      ...(await offlineSpecification()), title: pending.title, objective: pending.objective,
      acceptance_criteria: pending.acceptance_criteria,
    };
    storage.saveMission(pending);
    let releaseRejected: () => void = () => {};
    let runnerReceivedBinding = false;
    let admissionCalls = 0;
    let denyAdmission = false;
    const { port } = await openApi({ dependencies: {
      createSpecification: offlineSpecification,
      resolveMissionAdmission: (mission) => {
        admissionCalls++;
        if (denyAdmission) throw new Error("synthetic host admission unavailable");
        return {
          mode: "engineering-practice", missionId: mission.id,
          specHash: assertApprovedSpecBinding(mission).spec_hash,
          authorizeExecution: () => true,
        };
      },
      createMissionManager: (mission, _timeout, options) => ({
        run: () => {
          releaseRejected = () => options!.lease!.release();
          runnerReceivedBinding = !!assertApprovedSpecBinding(mission).spec_hash;
          throw new Error("synchronous rejected run r0-interface-test-secret");
        },
      }),
    } });
    try {
      const approved = await request(port, "POST", `/missions/${id}/approve`, {
        key: "r0-interface-test-secret",
        body: {},
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      check(approved.status === 200 && storage.loadMission(id)?.status === "approved", "synchronous rejection never synthesizes failed terminal state", approved.text);
      check(runnerReceivedBinding && !!assertApprovedSpecBinding(storage.loadMission(id)!).spec_hash,
        "explicit API approval binds the specification before the rejecting runner starts");
      check(lifecycle.readMissionLease(id) !== null, "rejection alone cannot release the execution lease");
      const logs = fs.readFileSync(path.join(storage.DATA_DIR, `${id}.log`), "utf8");
      check(logs.includes("settlement is owned by the mission manager") && !logs.includes("synchronous rejected run r0-interface-test-secret"), "rejection logging redacts credentials without changing mission state");
      denyAdmission = true;
      releaseRejected();
      releaseRejected = () => {};
      const denied = await request(port, "POST", `/missions/${id}/resume`, {
        key: "r0-interface-test-secret", body: {},
      });
      check(denied.status === 500 && admissionCalls === 2 && lifecycle.readMissionLease(id) === null,
        "API start/resume cannot construct a manager without its explicit current host policy", denied.text);
    } finally {
      releaseRejected();
    }
  }

  console.log(`\nr0-closure-interfaces: ${checks} checks passed`);
  console.log("Offline interface regressions only; no production certification or R0 closure claim.");
} finally {
  for (const api of apis.splice(0)) {
    if (api.listening) await new Promise<void>((resolve) => api.close(() => resolve()));
  }
  process.chdir(originalCwd);
  fs.rmSync(suiteRoot, { recursive: true, force: true });
}
