import { z } from "zod";
import type { Mission } from "../types/index.js";
import { assertApprovedSpecBinding } from "./spec-binding.js";
import { QualificationDeniedError } from "./qualification.js";
import type { createQualificationAuthority, QualificationBinding, QualificationAdmission } from "./qualification.js";

/** Stored in the existing mission record; there is no second admission registry. */
export const MISSION_ADMISSION_KEY = "mission_admission";

export interface MissionExecutionTarget {
  stage: "mission" | "delegation" | "repair" | "effect" | "acceptance";
  role?: string;
  tools?: readonly string[];
  label?: string;
}

export interface MissionQualificationRequirement {
  qualificationId: string;
  binding: QualificationBinding;
}

/** Only a trusted host may supply this option. Never deserialize it from a request. */
export type MissionAdmissionPolicy = {
  mode: "product";
  authority: ReturnType<typeof createQualificationAuthority>;
  /** Resolve the complete professional profile/capability requirements from host policy. */
  requirements: (mission: Readonly<Mission>) => readonly MissionQualificationRequirement[];
  /** Explicitly cover every requested role/tool, including repair and recursive effects. */
  authorizeExecution: (mission: Readonly<Mission>, target: Readonly<MissionExecutionTarget>) => boolean;
} | {
  mode: "engineering-practice";
  /** Practice authorization is a host capability bound to one approved mission. */
  missionId: string;
  specHash: string;
  authorizeExecution: (mission: Readonly<Mission>, target: Readonly<MissionExecutionTarget>) => boolean;
};

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const bindingSchema = z.object({ solverId: id, scope: id, specHash: hash, capabilityHash: hash, profileHash: hash }).strict();
const requirementSchema = z.object({ qualificationId: id, binding: bindingSchema }).strict();
const admissionSchema = bindingSchema.extend({
  admissionId: id, qualificationId: id, receiptId: id,
  generation: z.number().int().positive().safe(),
  admittedAt: z.number().int().nonnegative().safe(), expiresAt: z.number().int().nonnegative().safe(),
}).strict();
const recordSchema = z.discriminatedUnion("mode", [
  z.object({ version: z.literal(1), mode: z.literal("product"), missionId: z.string(), specHash: hash,
    requirements: z.array(requirementSchema).min(1), admissions: z.array(admissionSchema).min(1) }).strict(),
  z.object({ version: z.literal(1), mode: z.literal("engineering-practice"), missionId: z.string(), specHash: hash }).strict(),
]);
export type MissionAdmissionRecord = z.infer<typeof recordSchema>;
export type SynchronousMissionEffect = <T>(effect: () => T extends PromiseLike<unknown> ? never : T, target?: MissionExecutionTarget) => T;

function deny(reason: string): never { throw new QualificationDeniedError(reason); }
function equal(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function detached<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

/** Freeze policy inputs so callbacks cannot mutate the manager's mission or target. */
function frozen<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
}

/**
 * Reconstruct using trusted host policy on EVERY restart. A saved record never
 * authorizes itself. Existing admissions are checked, never silently refreshed:
 * requalification cannot revive an older mission generation.
 */
export function prepareMissionAdmission(
  mission: Mission,
  policy: MissionAdmissionPolicy | undefined,
  options: { recovering: boolean },
): { record: MissionAdmissionRecord; withEffect: SynchronousMissionEffect } {
  if (!policy) deny("production mission requires trusted host qualification policy");
  const specHash = assertApprovedSpecBinding(mission).spec_hash;
  const snapshot = frozen(detached(mission));
  const raw = mission.metadata?.[MISSION_ADMISSION_KEY];
  const parsed = raw === undefined ? undefined : recordSchema.safeParse(raw);
  if (parsed && !parsed.success) deny("malformed mission admission record");
  const saved = parsed?.success ? parsed.data : undefined;
  if (saved && (saved.missionId !== mission.id || saved.specHash !== specHash || saved.mode !== policy.mode)) {
    deny("mission admission purpose or approved specification changed");
  }
  // Legacy checkpoints stay recoverable/inspectable, but cannot retroactively
  // qualify completed work. An operator must reconcile into a freshly approved mission.
  if (!saved && options.recovering) deny("legacy execution lacks admission provenance; explicit reconciliation required");
  const authorize = policy.authorizeExecution;
  if (typeof authorize !== "function") deny("host execution scope policy required");
  let record: MissionAdmissionRecord;
  let authority: ReturnType<typeof createQualificationAuthority> | undefined;
  if (policy.mode === "engineering-practice") {
    if (policy.missionId !== mission.id || policy.specHash !== specHash) deny("practice authorization is not bound to this mission");
    record = saved ?? { version: 1, mode: policy.mode, missionId: mission.id, specHash };
  } else if (policy.mode === "product") {
    if (typeof policy.requirements !== "function" || !policy.authority) deny("professional qualification requirements required");
    const requirements = z.array(requirementSchema).min(1).safeParse(policy.requirements(snapshot));
    if (!requirements.success) deny("missing or unknown professional qualification requirements");
    const expected = requirements.data.sort((a, b) => a.qualificationId.localeCompare(b.qualificationId));
    if (new Set(expected.map((r) => r.qualificationId)).size !== expected.length ||
        expected.some((r) => r.binding.specHash !== specHash)) deny("duplicate or incorrectly bound qualification requirements");
    authority = policy.authority;
    if (saved?.mode === "product") {
      if (!equal(saved.requirements, expected) || saved.admissions.length !== expected.length ||
          saved.admissions.some((a, i) => a.qualificationId !== expected[i].qualificationId ||
            Object.entries(expected[i].binding).some(([key, value]) => a[key as keyof QualificationAdmission] !== value))) {
        deny("host requirements differ from persisted admission");
      }
      record = saved;
    } else {
      if (authorize(snapshot, Object.freeze({ stage: "mission" })) !== true) deny("host execution scope policy");
      record = { version: 1, mode: "product", missionId: mission.id, specHash, requirements: expected,
        admissions: expected.map((r) => authority!.admit(r.qualificationId, r.binding)) };
    }
  } else {
    deny("unknown execution purpose");
  }
  const boundRecord = frozen(detached(record));
  // Same-mission synchronous reentrancy only: all admissions are already
  // locked while nested recursive targets are authorized and reserved.
  let synchronousDepth = 0;
  const withEffect: SynchronousMissionEffect = <T>(effect: () => T extends PromiseLike<unknown> ? never : T, target: MissionExecutionTarget = { stage: "effect" }): T => {
    if (typeof effect !== "function" || effect.constructor.name === "AsyncFunction") deny("synchronous mission effect required");
    const checkedTarget = frozen(detached(target));
    const invoke = (): T => {
      if (authorize(snapshot, checkedTarget) !== true) deny("host execution scope policy");
      const result = effect();
      if (result && typeof (result as { then?: unknown }).then === "function") deny("asynchronous mission effect forbidden");
      return result;
    };
    // Stable ordering prevents opposite-order acquisition when profiles share scopes.
    // All callbacks are synchronous: this is a local effect/intent fence, never a
    // claim to hold the qualification lock during an awaited remote operation.
    const enter = (index: number): T => {
      if (boundRecord.mode !== "product" || index === boundRecord.admissions.length) return invoke();
      return authority!.withAdmission(boundRecord.admissions[index], target.stage === "acceptance" ? "acceptance" : "dispatch", () => enter(index + 1) as T extends PromiseLike<unknown> ? never : T);
    };
    if (synchronousDepth > 0) return invoke();
    synchronousDepth++;
    try { return enter(0); } finally { synchronousDepth--; }
  };
  withEffect(() => undefined, { stage: "mission" });
  return { record: boundRecord, withEffect };
}

/** Storage integration hook: existing admission provenance may never be replaced. */
export function assertMissionAdmissionUnchanged(previous: Mission, next: Mission): void {
  const before = previous.metadata?.[MISSION_ADMISSION_KEY];
  if (before !== undefined && !equal(before, next.metadata?.[MISSION_ADMISSION_KEY])) deny("mission admission provenance is immutable");
}
