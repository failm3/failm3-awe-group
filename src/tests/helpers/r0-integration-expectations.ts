/**
 * Independent expectations for pending seams. Adapters may translate field/API
 * names, but must call production logic and MUST NOT implement the policy under test.
 * Nothing in this file invokes a model or imports side-effectful production code.
 */
import assert from "node:assert/strict";

export const providerCases = [
  { name: "empty-response", response: {}, before: [], after: [], success: false },
  { name: "whitespace-response", response: { text: " \n\t" }, before: [], after: [], success: false },
  { name: "false-success-no-artifact", response: { text: "Done, report saved successfully." }, before: [], after: [], success: false },
  { name: "old-artifact-not-new", response: { text: "Done" }, before: ["old"], after: ["old"], success: false },
  { name: "provider-error-with-text", response: { text: "Done", finishReason: "error" }, before: [], after: ["new"], success: false },
  { name: "failed-save-tool", response: { text: "Done", toolResults: [{ toolName: "save_artifact", result: { success: false, error: "denied" } }] }, before: [], after: [], success: false },
  { name: "real-new-artifact", response: { text: "Created report", finishReason: "stop" }, before: ["old"], after: ["old", "new"], success: true },
  { name: "replacement-id-same-count", response: { text: "Replaced report", finishReason: "stop" }, before: ["old"], after: ["replacement"], success: true },
] as const;

export async function assertProviderOutcomes(evaluate: (fixture: typeof providerCases[number]) => any | Promise<any>) {
  for (const fixture of providerCases) {
    const outcome = await evaluate(fixture);
    assert.equal(outcome.success, fixture.success, fixture.name);
    if (!fixture.success) assert.ok(outcome.issues?.length > 0, `${fixture.name}: explicit issues required`);
    if (fixture.success) {
      const expected = fixture.after.filter((id) => !(fixture.before as readonly string[]).includes(id));
      assert.deepEqual([...outcome.artifacts].sort(), [...expected].sort(), `${fixture.name}: propagate actual new artifact IDs`);
      assert.ok(outcome.output.includes(fixture.response.text), `${fixture.name}: preserve result text`);
    }
  }
}

export async function assertChildrenPlanning(resolve: (request: any) => any[] | Promise<any[]>) {
  const legacy = { role: "executor", task: "append one receipt A", parallel: true };
  const one = await resolve(legacy);
  assert.equal(one.length, 1, "parallel:true schedules one legacy task exactly once");
  assert.equal(one[0].task, legacy.task);
  const request = {
    parallel: true,
    children: [
      { role: "writer", task: "produce document A", tools: ["save_artifact"], expected_output: "A.md" },
      { role: "analyst", task: "compute independent dataset B", tools: ["file_read"], expected_output: "B.json" },
    ],
  };
  const children = await resolve(request);
  assert.equal(children.length, 2);
  assert.deepEqual(children.map((child) => child.task), request.children.map((child) => child.task));
  assert.deepEqual(children.map((child) => child.role), ["writer", "analyst"]);
  assert.deepEqual(children.map((child) => child.tools), [["save_artifact"], ["file_read"]]);
}

export function assertResumeIdentity(successfulIndices: (plan: any[], checkpoint: any) => Set<number>) {
  const plan = (task: string) => ({ agent_role: "executor", task, context: "", tools: [], expected_output: "receipt" });
  const checkpoint = {
    mission_id: "r0-mission", version: 1, saved_at: new Date().toISOString(), timeout_ms: 1000,
    elapsed_ms: 40, repair_iterations: 0, reason: "manual",
    completed: [{ index: 0, agent_role: "executor", task: "effect-A", status: "success", output: "receipt-A", duration_ms: 5 }],
  };
  assert.deepEqual([...successfulIndices([plan("effect-B"), plan("effect-A")], checkpoint)], [1],
    "Reordered same-role tasks must match actual task identity");
  assert.deepEqual([...successfulIndices([plan("effect-A")], checkpoint)], [0]);
  checkpoint.completed[0].status = "failed";
  assert.deepEqual([...successfulIndices([plan("effect-A")], checkpoint)], []);
}
