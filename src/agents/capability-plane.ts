import type { Mission } from "../types/index.js";
import type { DelegationPlan, DelegationPlanItem } from "./head-agent.js";
import type { LocalTargetProposal, PersistedQualifiedTarget } from "../utils/local-capability.js";

export type CapabilityStatus = "available" | "missing" | "failed";

export interface CapabilityObservation {
  capability: string;
  status: CapabilityStatus;
  detail: string;
  /** A registered tool, local package or documented procedure — never a new grant. */
  acquired?: string;
  /** Optional executable proposal; only the host acquisition callback can qualify it. */
  local_target?: LocalTargetProposal;
}

/** Model-proposed diagnosis; the manager validates and bounds every transition. */
export interface CapabilityDecision {
  status: "continue" | "acquire" | "replan" | "blocked";
  capability?: string;
  detail?: string;
  strategy?: string;
  delegations?: DelegationPlanItem[];
}

export interface CapabilityAttempt {
  attempt_id: string;
  capability: string;
  observation: CapabilityObservation;
  artifact_id: string;
  artifact_sha256: string;
  created_at: string;
  /** Non-callback identity only; host policy reconstructs live trust on resume. */
  qualified_target?: PersistedQualifiedTarget;
}

export type PlanOptions = {
  signal?: AbortSignal;
  capabilityAttempt?: CapabilityAttempt;
  previousPlan?: DelegationPlan;
  executionFailure?: string;
};
export type PlanMissionWithCapabilities = (
  mission: Mission,
  options?: PlanOptions
) => Promise<DelegationPlan | CapabilityDecision>;

export function ordinaryPlan(plan: DelegationPlan | CapabilityDecision): DelegationPlan | null {
  return Array.isArray((plan as DelegationPlan).delegations) && !("status" in plan) ? plan as DelegationPlan : null;
}

export function validateCapabilityDecision(
  decision: CapabilityDecision | DelegationPlan,
  approvedTools: ReadonlySet<string>,
  knownTools: ReadonlySet<string>
): string[] {
  const errors: string[] = [];
  const status = "status" in decision ? decision.status : "continue";
  if (!["continue", "acquire", "replan", "blocked"].includes(status)) errors.push("unknown decision status");
  if (status === "acquire") {
    const capability = "capability" in decision ? decision.capability?.trim() : undefined;
    if (!capability) errors.push("acquire requires a named capability");
    else if (capability.length > 120) errors.push("capability name is too long");
  }
  // Only an ordinary plan is executable. A capability diagnosis may include
  // illustrative/proposed delegations, but the manager never runs them; their
  // tool names must not reject the bounded acquisition before real grants are
  // constructed from the approved registry below.
  if (!("status" in decision)) {
    for (const delegation of decision.delegations ?? []) {
      for (const tool of delegation.tools) {
        if (!approvedTools.has(tool)) errors.push(`tool '${tool}' was not approved`);
        if (!knownTools.has(tool)) errors.push(`tool '${tool}' is not registered`);
      }
    }
  }
  return errors;
}

/** Real registered tools, not model claims, determine whether acquisition can proceed. */
export function availableCapabilities(knownTools: ReadonlySet<string>): string[] {
  return [...knownTools].sort();
}
