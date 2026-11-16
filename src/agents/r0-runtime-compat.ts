/**
 * Compatibility typings for the cancellation contract.
 *
 * The runtime passes an AbortSignal to the Head Agent, the specialists and QA.
 * Those modules gain an optional trailing `{ signal }` options argument; until
 * every one of them declares it, these casts let the runtime pass the signal
 * without editing their files. Extra arguments are ignored at runtime by
 * implementations that do not know about them.
 *
 * TODO(integrator): once `planMission(m, { signal })`,
 * `reviewMissionDetailed(m, out, artifacts, { signal })` and
 * `executeSpecialist(cfg, id, { maxSteps, signal })` declare the options,
 * delete this file and call them directly.
 */

import type { Mission, QAReview } from "../types/index.js";
import type { DelegationPlan } from "./head-agent.js";
import type { QAGateResult } from "./qa-gate.js";
import type { SpecialistConfig, SpecialistOutcome } from "./specialists.js";

export interface SignalOptions {
  signal?: AbortSignal;
  fence?: () => boolean;
  /** Immutable candidate being reviewed; QA must not replace this identity. */
  candidate?: import("./candidate.js").CandidateEpoch;
}

export type PlanMissionFn = (mission: Mission, options?: SignalOptions & {
  capabilityAttempt?: import("./capability-plane.js").CapabilityAttempt;
  previousPlan?: DelegationPlan;
  executionFailure?: string;
}) => Promise<DelegationPlan | import("./capability-plane.js").CapabilityDecision>;

export type ReviewMissionFn = (
  mission: Mission,
  executionOutput: string,
  artifactContents: string[],
  options?: SignalOptions
) => Promise<{ review: QAReview; gate: QAGateResult }>;

export type ExecuteSpecialistFn = (
  config: SpecialistConfig,
  missionId: string,
  options?: {
    maxSteps?: number;
    signal?: AbortSignal;
    fence?: () => boolean;
    /** Durable, synchronous marker invoked before model or tool effects. */
    beginEffect?: (label?: string) => void;
    withEffect?: import("../utils/mission-admission.js").SynchronousMissionEffect;
    modelRoute?: (role: string, nodeId?: string) => ReturnType<typeof import("../config/models.js").selectModelForRole>;
    experience?: import("../agents/specialists.js").SpecialistRunOptions["experience"];
    localCapability?: import("../agents/specialists.js").SpecialistRunOptions["localCapability"];
    qualifiedAttemptIds?: Map<string, string>;
    /** Host executor inherited by nested children; see SpecialistRunOptions. */
    executeSpecialist?: ExecuteSpecialistFn;
  }
) => Promise<SpecialistOutcome>;

export type ResolveModelFn = (role: string) => string;

/** Merge any number of (possibly undefined) signals into one. */
export function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const real = signals.filter((s): s is AbortSignal => !!s);
  if (real.length === 0) return undefined;
  if (real.length === 1) return real[0];
  return AbortSignal.any(real);
}
