import { Agent } from "@mastra/core/agent";
import { withModelCall } from "../utils/model-ledger.js";
import { smartModel } from "../config/models.js";
import type { Mission, Delegation } from "../types/index.js";
import { appendLog } from "../utils/storage.js";
import { z } from "zod";
import { createAgentMemory } from "../memory/index.js";
import { assertApprovedSpecBinding, formatApprovedSpecContext } from "../utils/spec-binding.js";
import { allTools } from "../tools/index.js";
import { availableCapabilities, validateCapabilityDecision } from "./capability-plane.js";
import type { CapabilityAttempt, CapabilityDecision, PlanMissionWithCapabilities } from "./capability-plane.js";
import { qualifiedTargetCommand } from "../utils/local-capability.js";
import { extractJson, responsePreview } from "../utils/json-extract.js";

const DelegationSchema = z.object({
  agent_role: z.string(),
  task: z.string(),
  context: z.string(),
  tools: z.array(z.string()),
  expected_output: z.string(),
  parallel: z.boolean().optional().default(false),
  uses_capability_attempt: z.string().optional(),
});
const DelegationPlanSchema = z.object({
  strategy: z.string(),
  delegations: z.array(DelegationSchema),
});
const CapabilityDecisionSchema = z.object({
  status: z.enum(["continue", "acquire", "replan", "blocked"]).default("continue"),
  capability: z.string().max(120).optional(),
  detail: z.string().max(2000).optional(),
  strategy: z.string().optional(),
  delegations: z.array(DelegationSchema).optional(),
});

/** A single delegation item in the Head Agent's plan, with parallel flag. */
export type DelegationPlanItem = Omit<Delegation, "parent_mission_id"> & {
  parallel: boolean;
  /** Existing qualified attempt only; this field never creates a grant. */
  uses_capability_attempt?: string;
};

/** Result of planning: strategy plus list of delegations. */
export type DelegationPlan = {
  strategy: string;
  delegations: DelegationPlanItem[];
};

/**
 * Head Agent: receives an approved mission and decides how to accomplish it.
 * Creates delegation plans, selects tools and models, and coordinates
 * Mission Managers and Specialized Agents.
 */
export const headAgent = new Agent({
  id: "head-agent",
  name: "HeadAgent",
  instructions: `You are the AWE GROUP Head Agent.

You receive approved missions and are responsible for:
1. Analyzing the mission to understand what must be accomplished
2. Choosing the right execution strategy (single-agent vs. delegation)
3. Breaking complex missions into parallel or sequential sub-tasks
4. Assigning each sub-task to the most appropriate specialist role
5. Returning a concrete, verifiable delegation plan

You are a planner only. You do not execute tools or perform externally visible
work. Execution is delegated to the Mission Manager and its narrowly granted
specialists.

Available capabilities for delegation: shell, file_read, file_write, file_list,
web_fetch, web_search, save_artifact, ti_search, delegate. A delegation receives only the
explicitly requested tools; unknown or omitted tool names never grant all tools.

The ti_search tool queries the AWE Tool Intelligence catalog (Manus v2) which contains
~12 researched tools and frameworks. Use it when you need to discover what tools have
been researched for a capability (e.g. browser automation, MCP, agent frameworks).
Resources returned are DISCOVERED/DOCUMENTED research candidates — not approved for
automatic execution. Treat results as research intelligence, not installation candidates.

You may delegate to these specialist roles:
- researcher: web search, URL analysis, fact gathering, literature review
- coder: writing code, debugging, refactoring, testing
- writer: documents, reports, summaries, README files
- analyst: data analysis, structured output, pattern recognition
- devops: shell commands, infrastructure, deployment
- designer: UI/UX planning, visual structure, accessibility

For complex missions, return a delegation JSON plan. Every delegation must
produce at least one persisted artifact; textual claims without a deliverable
are not successful execution.`,
  model: smartModel,
  memory: createAgentMemory("head-agent"),
});

export const planMission: PlanMissionWithCapabilities = async (
  mission: Mission,
  options: {
    signal?: AbortSignal;
    capabilityAttempt?: CapabilityAttempt;
    previousPlan?: DelegationPlan;
    executionFailure?: string;
  } = {}
): Promise<DelegationPlan | CapabilityDecision> => {
  options.signal?.throwIfAborted();
  const binding = assertApprovedSpecBinding(mission);
  if (!["approved", "running", "paused"].includes(mission.status)) {
    throw new Error(`Mission ${mission.id} is not approved for planning (${mission.status})`);
  }
  const approvedContext = formatApprovedSpecContext(binding);
  const approvedTools = new Set(binding.snapshot.specification.suggested_tools);
  const registeredTools = new Set(Object.keys(allTools));
  // `delegate` is a conditional orchestration capability supplied by the
  // trusted specialist runtime. It is deliberately absent from the static
  // registry, but an explicit approved request for it is not a missing
  // domain capability and must not trigger acquisition.
  if (approvedTools.has("delegate")) registeredTools.add("delegate");
  const capabilityContext = options.capabilityAttempt
    ? `\nCAPABILITY ACQUISITION RESULT (real delegation evidence):\n${JSON.stringify(options.capabilityAttempt)}\nUse this outcome to replan. Do not repeat an identical acquisition.${options.capabilityAttempt.qualified_target
      ? `\nThe host-qualified attempt ID is ${options.capabilityAttempt.attempt_id}. To use it, set uses_capability_attempt to that exact ID on a delegation whose tools include shell and run exactly this fixed command with no additions:\n${qualifiedTargetCommand(options.capabilityAttempt.qualified_target)}\nThis reference creates no new grant.\nIn a delegation that references a qualified attempt, its shell accepts ONLY that exact command: hash checks, listings, probes and every other command are refused by the host gate. Do not ask for a pre-run hash or integrity check in the task; the host rehashes the executable and re-verifies its probes itself immediately before release, and a shell the gate refused is a gate decision, not a missing capability.`
      : ""}\n`
    : "";
  const failureContext = options.executionFailure
    ? `\nEXECUTION ADAPTATION REQUIRED:\n${options.executionFailure}\nChoose a different feasible strategy within the same approval.\n`
    : "";
  const previousPlanContext = options.previousPlan
    ? `\nPREVIOUS PLAN:\n${JSON.stringify(options.previousPlan)}\n`
    : "";
  appendLog(mission.id, `HeadAgent: planning mission "${mission.title}"`);

  const planPrompt = `Plan execution for this mission. Return ONLY valid JSON (no markdown):

${approvedContext}
${previousPlanContext}${capabilityContext}${failureContext}

Plan only work within this approved scope. Carry exclusions and risks into each
relevant delegation; do not weaken the acceptance criteria. Request only tools
listed in specification.suggested_tools.

REGISTERED CAPABILITIES: ${availableCapabilities(registeredTools).join(", ")}
A requested tool absent from this list is genuinely unavailable; listing it does
not grant or install it. A suggested capability absent from this list must first
be diagnosed with status="acquire", even when a shell procedure could provide
it; do not silently substitute a different capability. If a capability is missing, return status="acquire"
with a concise capability name and detail. The capability name is mandatory and
must be the exact name the objective requires (for example the named competence
in the mission objective), not a description of a tool. The manager may run one bounded
research/acquisition delegation using only already-approved registered tools;
it never automatically installs or trusts a discovered package. After a real
execution failure or acquisition, return a new executable plan with the same
JSON shape and no status, or status="blocked" with a concrete detail. Reuse
available libraries/procedures instead of assuming professional workflows.

Return a delegation plan:
{
  "strategy": "brief description of the approach",
  "delegations": [
    {
      "agent_role": "researcher|coder|writer|analyst|devops|designer|executor",
      "task": "specific task description",
      "context": "relevant context and constraints",
      "tools": ["tool1", "tool2"],
      "expected_output": "what this agent should produce",
      "parallel": false,
      "uses_capability_attempt": "optional existing host-qualified attempt ID"
    }
  ]
}

For simple missions, one delegation is enough.
For complex missions, use multiple delegations. Mark independent
sub-tasks with "parallel": true so they run concurrently. Sub-tasks
that depend on earlier output should use "parallel": false.

A delegation that calls "delegate" must grant its children a write tool
(file_write or save_artifact) and tell each child to persist its own output
under an explicit artifact name. Each child is accepted only when it registers
a new artifact; a child that only returns text fails, and its text cannot be
re-attributed by the parent. For two or more independent children, instruct
the coordinator to issue exactly ONE delegate call containing the full
"children" array and "parallel": true; separate delegate calls do not form
one parallel reservation.`;

  const generate = (messages: Array<{ role: "user"; content: string }>) =>
    withModelCall({ missionId: mission.id, role: "head-agent", model: smartModel.modelId, provider: smartModel.providerId },
      () => headAgent.generate(messages, { abortSignal: options.signal }));

  // A single malformed completion must not silently collapse an approved
  // mission into direct execution. One corrective retry, initial planning only:
  // an adaptation or capability decision stays fail-closed.
  const initial = await generate([{ role: "user", content: planPrompt }]);
  options.signal?.throwIfAborted();
  let text = initial.text.trim();
  // An async caller must not change task semantics while planning is in flight.
  assertApprovedSpecBinding(mission, binding.spec_hash);

  const retryPrompt = `${planPrompt}

YOUR PREVIOUS RESPONSE WAS NOT VALID. It must be exactly one JSON object with no
prose and no markdown fence. Parse error: {{ERROR}}
Previous response (first 1200 characters):
{{RESPONSE}}`;
  let retried = false;
  const retryOnce = async (cause: string): Promise<void> => {
    if (retried || options.capabilityAttempt || options.executionFailure) throw new Error(cause);
    retried = true;
    appendLog(mission.id, `HeadAgent: invalid plan output (${responsePreview(cause, 200)}); requesting one correction`);
    const correction = await generate([{
      role: "user",
      content: retryPrompt.replace("{{ERROR}}", cause).replace("{{RESPONSE}}", text.slice(0, 1200)),
    }]);
    options.signal?.throwIfAborted();
    text = correction.text.trim();
    assertApprovedSpecBinding(mission, binding.spec_hash);
  };

  const directPlan = (): DelegationPlan => ({
    strategy: "Direct execution",
    delegations: [{
      agent_role: "executor",
      task: binding.snapshot.objective,
      context: approvedContext,
      tools: [...approvedTools].filter((tool) => registeredTools.has(tool)),
      expected_output: "Completed mission output with artifacts",
      parallel: false,
    }],
  });
  const missingApprovedCapabilityDecision = (): CapabilityDecision | null => {
    if (options.capabilityAttempt || options.executionFailure) return null;
    const capability = [...approvedTools].find((tool) => !registeredTools.has(tool));
    if (!capability) return null;
    const detail = `Approved capability '${capability}' is not registered; bounded acquisition is required before execution`;
    appendLog(mission.id, `HeadAgent: capability decision acquire (${capability})`);
    return { status: "acquire", capability, detail };
  };
  const parsePlan = (): DelegationPlan | CapabilityDecision => {
    const parsed = CapabilityDecisionSchema.parse(JSON.parse(extractJson(text)));
    const adapting = !!(options.capabilityAttempt || options.executionFailure);
    const errors = validateCapabilityDecision(parsed, approvedTools, registeredTools);
    const unavailable = errors.filter((error) => error.includes("is not registered"));
    if (adapting && errors.length > 0) throw new Error(errors.join("; "));
    // An acquire without a name is not a diagnosis the manager can act on; it
    // would be rejected and the mission would end with no acquisition at all.
    const malformed = errors.filter((error) => !error.includes("is not registered"));
    if (!adapting && malformed.length > 0) throw new Error(malformed.join("; "));
    if (!adapting && parsed.status === "continue" && unavailable.length > 0) {
      return { status: "acquire", capability: "unregistered-tool", detail: unavailable.join("; ") };
    }
    if (parsed.status !== "continue") {
      appendLog(mission.id, `HeadAgent: capability decision ${parsed.status}${parsed.capability ? ` (${parsed.capability})` : ""}`);
      return parsed;
    }
    const missingApprovedCapability = missingApprovedCapabilityDecision();
    if (missingApprovedCapability) return missingApprovedCapability;
    const plan = DelegationPlanSchema.parse(parsed);
    appendLog(
      mission.id,
      `HeadAgent: plan has ${plan.delegations.length} delegation(s): ${plan.strategy}`
    );
    return {
      ...plan,
      delegations: plan.delegations.map((delegation) => ({
        ...delegation,
        context: `${delegation.context}\n\n${approvedContext}`,
        tools: delegation.tools.filter((tool) => approvedTools.has(tool) && registeredTools.has(tool)),
      })),
    };
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return parsePlan();
    } catch (error) {
      lastError = error;
      // A proposed replan or capability decision must never silently turn into
      // direct execution. Only an initial malformed ordinary plan may retry and
      // then fall back.
      if (options.capabilityAttempt || options.executionFailure) throw error;
      const missingApprovedCapability = missingApprovedCapabilityDecision();
      if (missingApprovedCapability) return missingApprovedCapability;
      if (attempt === 0) {
        await retryOnce(String(error));
        continue;
      }
    }
  }
  // Keep the legacy initial-plan contract; adaptation failures fail closed in
  // the manager and never silently discard a requested capability.
  appendLog(mission.id, `HeadAgent: could not parse plan after correction (${responsePreview(String(lastError), 300)}); response: ${responsePreview(text)}; using direct execution`);
  return directPlan();
};
