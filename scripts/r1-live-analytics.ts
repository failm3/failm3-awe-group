/** Authorized R1 engineering qualification run, isolated from the R0 data tree. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import dotenv from "dotenv";

if (process.argv[2] !== "--run-authorized-qualification") throw new Error("Explicit qualification-run flag required");
dotenv.config({ quiet: true });
delete process.env.AWE_OFFLINE_TEST;
const runRoot = path.resolve("reports", `r1-live-${Date.now()}`);
fs.mkdirSync(runRoot, { recursive: true });
process.env.AWE_DATA_DIR = path.join(runRoot, "state");
const { saveMission, loadMission, prepareMissionWorkspace } = await import("../src/utils/storage.js");
const { createApprovedSpecBinding } = await import("../src/utils/spec-binding.js");
const { assertApprovedSpecBinding } = await import("../src/utils/spec-binding.js");
const { MissionManager } = await import("../src/agents/mission-manager.js");
const { listModelCalls } = await import("../src/utils/model-ledger.js");
const id = `r1-live-${randomUUID()}`;
const workspace = prepareMissionWorkspace(id);
const input = path.join(workspace, "transactions.csv");
const csv = "event_id,order_id,currency,kind,amount_cents,status\n" +
  "s1,o1,USD,sale,10500,settled\ns1,o1,USD,sale,10500,settled\nr1,o1,USD,refund,1500,settled\n" +
  "s2,o2,EUR,sale,7200,settled\np1,o3,USD,sale,9900,pending\n";
fs.writeFileSync(input, csv);
const criteria = ["Save a CSV analytics evidence artifact with independently reproducible exact USD and EUR totals, duplicate and pending counts."];
const spec = {
  title: "R1 live descriptive CSV qualification", objective: "Calculate exact descriptive transaction analytics and persist an owner-readable result.",
  scope: `Engineering qualification only. Read ${input}. Use csv_analytics to save csv-analytics.json. No external writes, no network, no currency conversion, no invented inputs. Raw input is immutable.`,
  acceptance_criteria: criteria, suggested_tools: ["csv_analytics", "file_read"], suggested_agents: ["analyst"],
  estimated_complexity: "simple" as const, risks: ["Conflicting event IDs or malformed input must block analytics"],
  csv_limits: { maxBytes: 100000, maxRows: 1000 },
  csv_input: { path: input, sha256: createHash("sha256").update(csv).digest("hex") },
};
const now = new Date().toISOString();
const mission = { id, title: spec.title, objective: spec.objective, description: spec.scope,
  acceptance_criteria: criteria, status: "pending_approval" as const, priority: "normal" as const,
  created_at: now, updated_at: now, metadata: { specification: spec } };
saveMission(mission);
const approved = { ...mission, status: "approved" as const, metadata: {
  ...mission.metadata, approved_spec_binding: createApprovedSpecBinding(mission),
  engineering_authorization: "User-approved R1 implementation and qualification; no product admission",
} };
saveMission(approved);
let failure: string | undefined;
try { await new MissionManager(approved, 180000, { admission: {
  mode: "engineering-practice", missionId: approved.id,
  specHash: assertApprovedSpecBinding(approved).spec_hash, authorizeExecution: () => true,
} }).run(); }
catch (error) { failure = error instanceof Error ? error.name : "ExecutionError"; }
const final = loadMission(id);
const calls = listModelCalls(id);
const summary = { id, status: final?.status, failure, model_calls: calls, provider_cost: "UNKNOWN", runRoot };
fs.writeFileSync(path.join(runRoot, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ id, status: final?.status, failure, runRoot, provider_cost: "UNKNOWN" }, null, 2));
if (final?.status !== "completed") process.exitCode = 1;
