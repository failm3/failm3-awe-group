import { z } from "zod";

// ─── Mission lifecycle ────────────────────────────────────────────────────────

export const MissionStatus = z.enum([
  "pending_approval",
  "approved",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);
export type MissionStatus = z.infer<typeof MissionStatus>;

export const MissionPriority = z.enum(["low", "normal", "high", "critical"]);
export type MissionPriority = z.infer<typeof MissionPriority>;

/** A PASS with no evaluated requirement is not acceptance evidence. */
const AcceptanceCriterionSchema = z.string().refine(
  (criterion) => criterion.trim().length > 0,
  { message: "Acceptance criteria must not be blank" }
);
const AcceptanceCriteriaSchema = z.array(AcceptanceCriterionSchema).min(
  1,
  "At least one non-blank acceptance criterion is required"
);

export const MissionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  objective: z.string(),
  acceptance_criteria: AcceptanceCriteriaSchema,
  status: MissionStatus,
  priority: MissionPriority,
  created_at: z.string(),
  updated_at: z.string(),
  head_agent_id: z.string().optional(),
  artifacts: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Mission = z.infer<typeof MissionSchema>;

/**
 * Execution accounting attached to a mission once it finishes.
 * Kept in `Mission.metadata.execution` so the Mission schema stays stable.
 */
export interface MissionExecutionSummary {
  delegations: Array<{
    agent_role: string;
    status: string;
    model?: string;
    tools_used: string[];
    /** Artifact registry IDs newly produced by this exact delegation. */
    artifacts: string[];
    qualified_attempt_ids?: string[];
    usage?: AgentResult["usage"];
    duration_ms: number;
  }>;
  models_used: string[];
  tools_used: string[];
  totals: {
    input_tokens: number | "UNKNOWN";
    output_tokens: number | "UNKNOWN";
    total_tokens: number | "UNKNOWN";
    reasoning_tokens: number | "UNKNOWN";
    cached_input_tokens: number | "UNKNOWN";
  };
  qa_score?: number;
  qa_passed?: boolean;
  repair_iterations?: number;
}

export const SpecificationSchema = z.object({
  title: z.string().describe("Concise mission title"),
  objective: z.string().describe("Clear statement of the mission goal"),
  scope: z.string().describe("What is in scope / out of scope"),
  acceptance_criteria: AcceptanceCriteriaSchema
    .describe("At least one verifiable, non-blank completion criterion"),
  suggested_tools: z
    .array(z.string())
    .describe("Tools likely needed: shell, web_search, file_write, etc."),
  suggested_agents: z
    .array(z.string())
    .describe("Specialist roles: researcher, coder, reviewer, etc."),
  estimated_complexity: z.enum(["trivial", "simple", "moderate", "complex"]),
  risks: z.array(z.string()).describe("Potential obstacles or failure modes"),
  csv_limits: z.object({
    maxBytes: z.number().int().positive().max(10_000_000),
    maxRows: z.number().int().positive().max(100_000),
  }).strict().optional().describe("Explicit approved CSV acquisition limits; required for csv_analytics"),
  csv_input: z.object({ path: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict().optional().describe("Owner-approved authoritative CSV input identity for independent QA"),
  web_product: z.object({
    directory: z.string().min(1).max(256),
    verifier: z.literal("r1-static-task-tracker-v1"),
  }).strict().optional().describe("Approved finite static web-product verification target"),
});
export type Specification = z.infer<typeof SpecificationSchema>;

// ─── Delegation ───────────────────────────────────────────────────────────────

export const DelegationSchema = z.object({
  agent_role: z.string(),
  task: z.string(),
  context: z.string(),
  tools: z.array(z.string()),
  expected_output: z.string(),
  parent_mission_id: z.string(),
});
export type Delegation = z.infer<typeof DelegationSchema>;

/** Host-observed qualified local capability invocation, never a model grant. */
export interface QualifiedLocalAttemptUse {
  delegation_id: string;
  attempt_id: string;
  receipt_id: string;
}

export const AgentResultSchema = z.object({
  agent_role: z.string(),
  status: z.enum(["success", "partial", "failed"]),
  output: z.string(),
  artifacts: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  duration_ms: z.number(),
  /** Model id that executed this delegation (observability / cost attribution). */
  model: z.string().optional(),
  /** Tools actually invoked by the agent during this delegation. */
  tools_used: z.array(z.string()).default([]),
  /** Host-derived qualified local capability receipts, never model assertions. */
  qualified_attempt_ids: z.array(z.string()).default([]),
  /** Token usage reported by the provider; absent SDK fields are never costed as zero. */
  usage: z
    .object({
      input_tokens: z.union([z.number().int().nonnegative().safe(), z.literal("UNKNOWN")]),
      output_tokens: z.union([z.number().int().nonnegative().safe(), z.literal("UNKNOWN")]),
      total_tokens: z.union([z.number().int().nonnegative().safe(), z.literal("UNKNOWN")]),
      reasoning_tokens: z.union([z.number().int().nonnegative().safe(), z.literal("UNKNOWN")]),
      cached_input_tokens: z.union([z.number().int().nonnegative().safe(), z.literal("UNKNOWN")]).optional(),
    })
    .optional(),
});
export type AgentResult = z.infer<typeof AgentResultSchema>;

// ─── QA ───────────────────────────────────────────────────────────────────────

export const QADefectSchema = z.object({
  issue: z.string(),
  severity: z.enum(["critical", "major", "minor"]),
});
export type QADefect = z.infer<typeof QADefectSchema>;

export const QAReviewSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(10),
  criteria_results: z.array(
    z.object({
      criterion: z.string(),
      passed: z.boolean(),
      notes: z.string(),
    })
  ),
  defects: z.array(QADefectSchema),
  recommendations: z.array(z.string()),
  verdict: z.string(),
});
export type QAReview = z.infer<typeof QAReviewSchema>;

// ─── Artifact ─────────────────────────────────────────────────────────────────

export const ArtifactSchema = z.object({
  id: z.string(),
  mission_id: z.string(),
  type: z.enum(["file", "text", "url", "data", "code", "image", "json"]),
  name: z.string(),
  path: z.string().optional(),
  content: z.string().optional(),
  created_at: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
