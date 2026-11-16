import { Agent } from "@mastra/core/agent";
import { createHash } from "node:crypto";
import { withModelCall, modelCallUsage } from "../utils/model-ledger.js";
import { smartModel, selectModelForRole } from "../config/models.js";
import { allTools } from "../tools/index.js";
import { synthesizeRoleInstructions } from "./recursion.js";
import { runWithToolContext, throwIfAborted, getToolContext } from "../security/tool-context.js";
import { assertToolAllowed } from "../security/tool-context.js";
import { listArtifacts, prepareMissionWorkspace, loadMission, reconcileArtifactFiles } from "../utils/storage.js";
import { assertApprovedSpecBinding, formatApprovedSpecContext } from "../utils/spec-binding.js";

/**
 * Specialist agent factory. Creates a configured agent for a given role
 * with the right tools and model.
 */
export interface SpecialistConfig {
  role: string;
  task: string;
  context: string;
  tools: string[];
  allowedTools?: string[];
  expected_output: string;
  missionId?: string;
  /**
   * Delegation depth of this agent. Depth 0 is a top-level specialist
   * created by the Mission Manager; deeper agents may spawn children.
   */
  depth?: number;
  /** Node id of this agent in the delegation tree (for parent linkage). */
  nodeId?: string;
}

const ROLE_INSTRUCTIONS: Record<string, string> = {
  researcher:
    "You are a research specialist. Find information using web_search, web_extract, and web_fetch. " +
    "Use web_extract to get readable text from pages (better than raw web_fetch for articles). " +
    "Verify facts from multiple sources. Return structured, cited findings.",
  coder:
    "You are a software engineering specialist. Write clean, working code. " +
    "Test your code using shell. Save code files using file_write. " +
    "Always verify code compiles/runs before declaring success.",
  writer:
    "You are a technical writer. Produce clear, well-structured documents. " +
    "Match the requested format (markdown, plain text, etc.). " +
    "Save outputs using save_artifact or file_write.",
  analyst:
    "You are a data analyst. Process data methodically. " +
    "Use shell for data manipulation. Produce structured analysis with clear conclusions.",
  devops:
    "You are a DevOps specialist. Run shell commands carefully. " +
    "Inspect systems, configure infrastructure, manage deployments. " +
    "Always check state before making changes.",
  designer:
    "You are a UI/UX designer. Plan interfaces, component structure, and user flows. " +
    "Produce design specifications and wireframe descriptions.",
  executor:
    "You are a general-purpose executor. Accomplish the task using any available tools. " +
    "Be thorough and verify your output.",
  reviewer:
    "You are an independent reviewer. Verify real outputs against acceptance criteria. " +
    "Check for correctness, completeness, and quality. Report defects honestly.",
};

/**
 * Resolve the model id that will be used for a given role.
 * Exposed so the MissionManager can attribute cost and model choice per delegation.
 */
export function resolveModelForRole(role: string): string {
  return selectModelForRole(role).modelId ?? "unknown";
}

/**
 * Build the `delegate` tool that lets a running specialist create further
 * specialised sub-agents.
 *
 * The tool is only attached when the agent is allowed to delegate (depth is
 * below the cap). Limits are enforced in code by `runDelegateCall` — the
 * prompt only advertises them.
 */
async function buildDelegateTool(config: SpecialistConfig) {
  const { createTool } = await import("@mastra/core/tools");
  const { z } = await import("zod");
  const { runDelegateCall, RECURSION_LIMITS } = await import("./recursion.js");

  return createTool({
    id: "delegate",
    description:
      `Delegate a sub-task to a newly created specialised sub-agent. ` +
      `Use this when the task needs a specialisation you do not have, ` +
      `or when the work decomposes further. ` +
      `Every sub-agent is accepted only when it persists at least one new artifact itself: ` +
      `grant it a write tool you hold (file_write or save_artifact) and tell it to save its own result under the exact name you need. ` +
      `A sub-agent that only returns text fails, and its text is not an attributed deliverable. ` +
      `For two or more independent children, issue exactly ONE delegate call with the children array and parallel: true. ` +
      `Separate delegate calls are separate reservations, even if their executions happen to overlap. ` +
      `Hard limits (enforced automatically, refusals are returned as normal results): ` +
      `max depth ${RECURSION_LIMITS.maxDepth}, max ${RECURSION_LIMITS.maxTotalAgents} agents per mission, ` +
      `max ${RECURSION_LIMITS.maxParallelChildren} concurrent children.`,
    inputSchema: z.object({
      role: z.string().describe("Short role name for the sub-agent, e.g. 'visual-qa' or 'data-auditor'"),
      task: z.string().describe("The concrete sub-task the sub-agent must complete"),
      expected_output: z.string().optional().describe("What the sub-agent must return/save"),
      context: z.string().optional().describe("Extra context the sub-agent needs"),
      parallel: z.boolean().optional().default(false).describe("Run children concurrently"),
      tools: z.array(z.string()).optional().describe("Requested child tools"),
      children: z.array(z.object({
        role: z.string(), task: z.string(), context: z.string().optional(), expected_output: z.string().optional(), tools: z.array(z.string()).optional(),
      })).max(4).optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      output: z.string(),
      errors: z.array(z.string()).default([]),
      refused_reason: z.string().optional(),
    }),
    execute: async (input: any) => {
      assertToolAllowed("delegate");
      const parentGrants = new Set(config.allowedTools ?? config.tools);
      const requested = input.tools as string[] | undefined;
      const childTools = requested?.filter((name) => parentGrants.has(name));
      if (requested && childTools!.length !== requested.length) {
        return { success: false, output: "Delegation denied: child requested tools outside parent grants", errors: ["Child tool grant exceeds parent grant"] };
      }
      const outcome = await runDelegateCall(
        config.missionId ?? "unknown-mission",
        config.nodeId ?? null,
        config.depth ?? 0,
        ({
          role: input.role,
          task: input.task,
          expected_output: input.expected_output,
          context: input.context,
          tools: childTools,
          parallel: input.parallel,
          children: input.children,
        } as any),
        {
          allowedTools: parentGrants,
          fence: getToolContext()?.fence,
          signal: getToolContext()?.signal,
          beginEffect: getToolContext()?.beginEffect,
          withEffect: getToolContext()?.withEffect,
          modelRoute: getToolContext()?.modelRoute,
          experience: getToolContext()?.experience,
          localCapability: getToolContext()?.localCapability,
          qualifiedAttemptIds: getToolContext()?.qualifiedAttemptIds,
          executeSpecialist: getToolContext()?.executeSpecialist,
        }
      );
      return {
        success: outcome.success,
        output: outcome.warnings?.length ? `${outcome.output}\n\n[Delegation warnings: ${outcome.warnings.join(" | ")}]` : outcome.output,
        errors: outcome.errors,
        refused_reason: outcome.refused_reason,
      };
    },
  });
}

export async function createSpecialist(config: SpecialistConfig, selectedModel = selectModelForRole(config.role)): Promise<Agent> {
  const { RECURSION_LIMITS } = await import("./recursion.js");
  const toolMap: Record<string, (typeof allTools)[keyof typeof allTools]> = allTools;
  const selectedTools: Record<string, (typeof allTools)[keyof typeof allTools]> = {};
  const grants = new Set(config.allowedTools ?? config.tools);
  for (const t of config.tools) {
    // Unknown or ungranted requests fail closed by producing no capability.
    // They are never replaced with allTools; a mixed request keeps only the
    // explicitly granted, registered subset.
    if (grants.has(t) && toolMap[t]) selectedTools[t] = toolMap[t];
  }
  const tools = selectedTools;

  const baseInstructions = ROLE_INSTRUCTIONS[config.role] ?? null;
  const instructions = baseInstructions ?? synthesizeRoleInstructions(config.role);

  const depth = config.depth ?? 0;
  const canDelegate = depth < RECURSION_LIMITS.maxDepth && !!config.missionId && grants.has("delegate");

  const delegateTool = canDelegate ? await buildDelegateTool(config) : null;

  const agentTools: Record<string, unknown> = { ...tools };
  if (delegateTool) agentTools["delegate"] = delegateTool;

  return new Agent({
    id: `specialist-${config.role}-${depth}`,
    name: `Specialist_${config.role}`,
    instructions: `${instructions}

CURRENT TASK: ${config.task}

CONTEXT: ${config.context}

EXPECTED OUTPUT: ${config.expected_output}

${config.missionId ? `MISSION ID: ${config.missionId}
YOU MUST save all outputs with mission_id="${config.missionId}". For text use save_artifact or file_write.
Never call save_artifact or file_write for PNG/JPEG/PDF or other binary files: create them with the approved shell procedure and leave their bytes intact. Shell-generated files are registered automatically at the delegation boundary.
Do NOT return data only as text — always persist the real output.` : "Save text deliverables using save_artifact or file_write with the mission_id; preserve shell-generated binary files."}

${canDelegate ? `You MAY create further specialised sub-agents with the "delegate" tool when the task needs a specialisation you lack, or when the work decomposes further. Keep children concrete and verifiable. If the CURRENT TASK assigns you the coordinator role or says to perform recursion yourself, YOU are that coordinator: do not delegate the coordination or synthesis role to another coordinator, and do not add children outside the task's explicit delegation plan.` : ""}

After finishing, summarize: what you did, what artifacts you saved (names), and any issues.`,
    model: selectedModel,
    tools: agentTools as never,
  });
}

export interface SpecialistOutcome {
  role: string;
  output: string;
  artifacts: string[];
  success: boolean;
  issues?: string[];
  /** Model id that executed the delegation. */
  model?: string;
  /** Tools actually invoked during this delegation. */
  tools_used: string[];
  /** Actual qualified local capability invocations in this delegation tree. */
  qualified_attempt_ids?: string[];
  /** Actual provider retry option supplied by the host; SDK_DEFAULT means omitted. */
  provider_max_retries?: number | "SDK_DEFAULT";
  /** Host-observed retrieval attestation; absent means no experience was injected. */
  experience?: { qualificationId: string; referenceSha256: string };
  /** Token usage reported by the provider. */
  usage?: import("../utils/model-ledger.js").ModelCallUsage;
}

export interface ProviderOutcomeInput {
  response: {
    text?: string;
    finishReason?: string;
    toolResults?: Array<{
      toolName?: string;
      payload?: { toolName?: string };
      result?: { success?: boolean; error?: string } | unknown;
    }>;
  };
  artifactIdsBefore: readonly string[];
  artifactIdsAfter: readonly string[];
}

/**
 * Deterministically decide whether a provider result is a real deliverable.
 * Model claims are never sufficient: a non-empty response, successful finish,
 * no failed artifact save, and at least one newly registered artifact are all
 * required. Kept pure so the complete adverse matrix runs without a provider.
 */
export function evaluateProviderOutcome(input: ProviderOutcomeInput): {
  success: boolean;
  output: string;
  artifacts: string[];
  issues: string[];
} {
  const output = input.response.text ?? "";
  const before = new Set(input.artifactIdsBefore);
  const artifacts = input.artifactIdsAfter.filter((id) => !before.has(id));
  const issues: string[] = [];
  if (!output.trim()) issues.push("Specialist returned an empty result");
  if (input.response.finishReason === "error") issues.push("Provider finished with an error");
  for (const call of input.response.toolResults ?? []) {
    const toolName = call.toolName ?? call.payload?.toolName;
    const result = call.result as { success?: boolean; error?: unknown } | undefined;
    if (toolName === "save_artifact" && result?.success === false) {
      issues.push(`Artifact save failed${result.error ? `: ${String(result.error)}` : ""}`);
    }
  }
  if (artifacts.length === 0) issues.push("Delegation produced no newly registered artifact");
  return { success: issues.length === 0, output, artifacts, issues };
}

export interface SpecialistRunOptions {
  maxSteps?: number;
  /** Optional explicit provider retry ceiling; host policy, never prompt-authored. */
  maxRetries?: number;
  signal?: AbortSignal;
  fence?: () => boolean;
  /** Persisted synchronously by the manager before an effect can begin. */
  beginEffect?: (label?: string) => void;
  withEffect?: import("../utils/mission-admission.js").SynchronousMissionEffect;
  /** Trusted host routing policy; never copied from model-authored config. */
  modelRoute?: (role: string, nodeId?: string) => ReturnType<typeof selectModelForRole>;
  /** Host retrieval only; experience never grants tools or target approval. */
  experience?: {
    selection: import("../memory/experience.js").ExperienceSelection;
    authority: import("../memory/experience.js").ExperienceAuthority;
    authorizeTarget: import("../memory/experience.js").ExperienceTarget["authorize"];
  };
  /** Trusted target gate, constructed only by MissionManager for an existing attempt. */
  localCapability?: import("../utils/local-capability.js").LocalCapabilityGate;
  /** Shared with nested children so outcomes reflect actual durable shell receipts. */
  qualifiedAttemptIds?: Map<string, string>;
  /**
   * The host's specialist executor, inherited by nested children. A host that
   * injects its own executor into MissionManager must also observe, account for
   * and be able to bound every recursive child, not only depth 0.
   */
  executeSpecialist?: import("./r0-runtime-compat.js").ExecuteSpecialistFn;
}

export async function executeSpecialist(
  config: SpecialistConfig,
  missionId: string,
  options: SpecialistRunOptions = {}
): Promise<SpecialistOutcome> {
  throwIfAborted(options.signal);
  if (options.fence && !options.fence()) throw new Error("Specialist denied: mission ownership lost");
  if (config.missionId && config.missionId !== missionId) throw new Error("Specialist mission mismatch");
  // Recursive callers may supply only compact task context. Reattach the
  // immutable authority from storage instead of trusting a child prompt to
  // repeat exclusions, risks, tool grants or acceptance criteria correctly.
  const stored = loadMission(missionId);
  if (!stored && options.experience) throw new Error("Experience requires a persisted target mission");
  if (stored?.metadata.approved_spec_binding) {
    const binding = assertApprovedSpecBinding(stored);
    const approved = new Set(binding.snapshot.specification.suggested_tools);
    if ((config.allowedTools ?? config.tools).some(tool => !approved.has(tool))) {
      throw new Error("Specialist tools exceed immutable approved specification");
    }
    config = { ...config, context: `${formatApprovedSpecContext(binding)}\n\nTASK CONTEXT:\n${config.context}` };
  }
  let experienceDispatch: (() => void) | undefined;
  let experienceReference: string | undefined;
  let experienceAttestation: SpecialistOutcome["experience"];
  if (options.experience) {
    const { retrieveVerifiedExperience } = await import("../memory/experience.js");
    const experience = retrieveVerifiedExperience(options.experience.selection,
      { mission: stored!, role: config.role, authorize: options.experience.authorizeTarget }, options.experience.authority);
    if (experience) {
      experienceReference = experience.reference;
      experienceDispatch = experience.checkDispatch;
      experienceAttestation = { qualificationId: experience.record.qualificationId, referenceSha256: createHash("sha256").update(experience.reference).digest("hex") };
    }
  }
  const dispatchFence = () => {
    throwIfAborted(options.signal);
    if (options.fence && !options.fence()) throw new Error("Specialist dispatch denied: mission ownership lost");
    experienceDispatch?.();
  };
  const fencedDispatch = () => {
    if (options.withEffect) options.withEffect(dispatchFence, { stage: "delegation", role: config.role, tools: [...(config.allowedTools ?? config.tools)], label: "model step dispatch" });
    else dispatchFence();
  };
  const selectedModel = options.modelRoute?.(config.role, config.nodeId) ?? selectModelForRole(config.role);
  const maxRetries = options.maxRetries ?? (options.experience ? 0 : undefined);
  if (maxRetries !== undefined && (!Number.isInteger(maxRetries) || maxRetries < 0)) throw new Error("Invalid provider retry ceiling");
  const agent = await createSpecialist(config, selectedModel);
  // Adopt pre-existing passive files before this delegation begins. Shell
  // effects register and attribute their own subsequent changes atomically.
  reconcileArtifactFiles(missionId, { fence: options.fence, signal: options.signal });
  const before = new Set(listArtifacts(missionId).map((artifact) => artifact.id));
  const invokedTools = new Set<string>();
  const runtimeGrants = new Set(config.allowedTools ?? config.tools);
  const artifactIds = new Set<string>();
  const qualifiedAttemptIds = options.qualifiedAttemptIds ?? new Map<string, string>();
  const workspaceRoot = prepareMissionWorkspace(missionId);
  const response = await runWithToolContext({
    missionId,
    role: config.role,
    workspaceRoot,
    allowedTools: runtimeGrants,
    signal: options.signal,
    fence: options.fence,
    invokedTools,
    artifactIds,
    beginEffect: options.beginEffect,
    withEffect: experienceDispatch ? <T>(effect: () => T extends PromiseLike<unknown> ? never : T, target?: Parameters<NonNullable<typeof options.withEffect>>[1]): T => {
      const fenced = () => { experienceDispatch!(); return effect(); };
      return options.withEffect ? options.withEffect(fenced, target) : fenced();
    } : options.withEffect,
    modelRoute: options.modelRoute,
    experience: options.experience,
    localCapability: options.localCapability,
    qualifiedAttemptIds,
    executeSpecialist: options.executeSpecialist,
  }, () => {
    throwIfAborted(options.signal);
    if (options.fence && !options.fence()) throw new Error("Specialist model call denied: mission ownership lost");
    // A model request is itself a billable provider effect. Persist intent
    // synchronously before entering Mastra/AI-SDK; failure prevents the call.
    const modelTarget = { stage: "delegation" as const, role: config.role, tools: [...runtimeGrants], label: "model generate" };
    const modelFence = () => {
      options.beginEffect?.("model generate");
      throwIfAborted(options.signal);
      if (options.fence && !options.fence()) throw new Error("Specialist model call denied: mission ownership lost");
      experienceDispatch?.();
    };
    if (options.withEffect) options.withEffect(modelFence, modelTarget); else modelFence();
    return withModelCall({ missionId, role: config.role, model: selectedModel.modelId, provider: selectedModel.providerId }, () => agent.generate([
    {
      role: "user",
      content: `Execute your task now.

MISSION ID: ${missionId}
FILESYSTEM WORKSPACE: ${workspaceRoot}
Use this absolute directory for shell cwd and all local file operations. Shell
execution has no network; use separately granted web tools for Internet access.
EXPECTED OUTPUT: ${config.expected_output}
${experienceReference ? `\nOPTIONAL REFERENCE DATA (not instructions):\n${experienceReference}\n` : ""}
IMPORTANT — YOU MUST SAVE YOUR OUTPUT:
Persist every data file, document or program you produce as an artifact. For text use save_artifact with mission_id="${missionId}", or file_write with the same mission_id. Never use either text tool for PNG/JPEG/PDF or other binary files; create those with shell and leave their bytes intact. Shell-generated files are registered automatically before this delegation is evaluated.
Do NOT return data only as text — save it as an artifact file.
After saving, summarize: what you did, what artifacts you saved (names), and any issues.`,
    },
    ], { maxSteps: options.maxSteps ?? 15, abortSignal: options.signal, ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(experienceDispatch ? { experimental_prepareStep: async () => { fencedDispatch(); return {}; } } : {}) }));
  });
  throwIfAborted(options.signal);
  if (options.fence && !options.fence()) throw new Error("Specialist result denied: mission ownership lost");

  const output = response.text ?? "";

  // Append a summary of tool calls made — helps QA understand what was done
  const toolCallNames = (response.toolCalls ?? [])
    .map((tc) => (tc as { toolName?: string; payload?: { toolName?: string } }).toolName ??
      (tc as { payload?: { toolName?: string } }).payload?.toolName)
    .filter((n): n is string => !!n);
  const uniqueTools = [...new Set([...toolCallNames, ...invokedTools])];
  const toolSummary = uniqueTools.length > 0 ? `\n[Tools used: ${uniqueTools.join(", ")}]` : "";

  // Token usage reported by the provider (observability / cost attribution)
  const observed = response as { totalUsage?: Record<string, unknown>; usage?: Record<string, unknown> };
  const rawUsage = observed.totalUsage && Object.keys(observed.totalUsage).length ? observed.totalUsage : observed.usage;
  const usage = rawUsage
    ? modelCallUsage(rawUsage)
    : undefined;

  // Shell commands registered their own files in their serialized effect
  // boundary. Reconcile passively for visibility, but never adopt another
  // concurrently finishing specialist's newly registered artifacts here.
  reconcileArtifactFiles(missionId, { fence: options.fence, signal: options.signal });

  const evaluated = evaluateProviderOutcome({
    response: response as ProviderOutcomeInput["response"],
    artifactIdsBefore: [...before],
    artifactIdsAfter: [...artifactIds],
  });
  return {
    role: config.role,
    output: evaluated.output + toolSummary,
    artifacts: evaluated.artifacts,
    success: evaluated.success,
    issues: evaluated.issues,
    model: selectedModel.modelId,
    tools_used: uniqueTools,
    qualified_attempt_ids: [...qualifiedAttemptIds.keys()],
    provider_max_retries: maxRetries ?? "SDK_DEFAULT",
    experience: experienceAttestation,
    usage,
  };
}
