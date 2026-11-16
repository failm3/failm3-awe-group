import { createHash } from "node:crypto";
import { z } from "zod";
import { MissionSchema, SpecificationSchema } from "../types/index.js";
import type { Mission } from "../types/index.js";

/** Kept in metadata so existing Mission serialization preserves the binding. */
export const APPROVED_SPEC_BINDING_KEY = "approved_spec_binding";

const ApprovedSpecSnapshotSchema = z.object({
  mission_id: MissionSchema.shape.id,
  title: MissionSchema.shape.title,
  description: MissionSchema.shape.description,
  objective: MissionSchema.shape.objective,
  acceptance_criteria: MissionSchema.shape.acceptance_criteria,
  // The current schema puts both inclusions and exclusions in scope. Preserve
  // it verbatim; attempting to extract exclusions would reinterpret approval.
  specification: SpecificationSchema.strict(),
}).strict();

export const ApprovedSpecBindingSchema = z.object({
  version: z.literal(1),
  algorithm: z.literal("sha256"),
  approved_at: z.iso.datetime(),
  spec_hash: z.string().regex(/^[0-9a-f]{64}$/),
  snapshot: ApprovedSpecSnapshotSchema,
}).strict();

export type ApprovedSpecSnapshot = z.infer<typeof ApprovedSpecSnapshotSchema>;
export type ApprovedSpecBinding = z.infer<typeof ApprovedSpecBindingSchema>;

export class SpecBindingError extends Error {
  constructor(public missionId: string, detail: string) {
    super(`Mission ${missionId}: approved specification ${detail}`);
    this.name = "SpecBindingError";
  }
}

/** Sorted object keys, exact strings and ordered arrays; no lossy normalization. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value)!;
}

export function canonicalizeApprovedSpec(snapshot: ApprovedSpecSnapshot): string {
  return canonicalJson(ApprovedSpecSnapshotSchema.parse(snapshot));
}

export function hashApprovedSpec(snapshot: ApprovedSpecSnapshot): string {
  return createHash("sha256")
    .update("awe-approved-spec-v1\n", "utf8")
    .update(canonicalizeApprovedSpec(snapshot), "utf8")
    .digest("hex");
}

function snapshotFromMission(mission: Mission): ApprovedSpecSnapshot {
  const result = ApprovedSpecSnapshotSchema.safeParse({
    mission_id: mission.id,
    title: mission.title,
    description: mission.description,
    objective: mission.objective,
    acceptance_criteria: mission.acceptance_criteria,
    specification: mission.metadata?.specification,
  });
  if (!result.success) throw new SpecBindingError(mission.id, "is missing or malformed; explicit approval of a complete specification is required");
  const snapshot = result.data;
  const spec = snapshot.specification;
  if (snapshot.title !== spec.title || snapshot.objective !== spec.objective ||
      canonicalJson(snapshot.acceptance_criteria) !== canonicalJson(spec.acceptance_criteria)) {
    throw new SpecBindingError(mission.id, "does not match the mission title, objective or acceptance criteria");
  }
  return snapshot;
}

/** Detach and freeze snapshots so async callers cannot mutate shared arrays. */
function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Call ONLY in the explicit approval transaction, under the mission lock.
 * This pure constructor does not authorize approval or persist anything.
 * A hash is integrity evidence, not a signature: storage must enforce immutable
 * writes with assertApprovedSpecUnchanged, including save/replace paths.
 */
export function createApprovedSpecBinding(
  mission: Mission,
  approvedAt = new Date().toISOString(),
): ApprovedSpecBinding {
  if (mission.metadata?.[APPROVED_SPEC_BINDING_KEY] !== undefined) {
    throw new SpecBindingError(mission.id, "is already bound; create a new mission for a changed specification");
  }
  const snapshot = snapshotFromMission(mission);
  return freezeDeep(ApprovedSpecBindingSchema.parse({
    version: 1,
    algorithm: "sha256",
    approved_at: approvedAt,
    spec_hash: hashApprovedSpec(snapshot),
    snapshot,
  }));
}

/**
 * Fail closed for legacy/missing bindings and drift in either copy of the spec.
 * Pass a separately retained hash when resuming a persisted plan/checkpoint.
 */
export function assertApprovedSpecBinding(mission: Mission, expectedHash?: string): ApprovedSpecBinding {
  const parsed = ApprovedSpecBindingSchema.safeParse(mission.metadata?.[APPROVED_SPEC_BINDING_KEY]);
  if (!parsed.success) throw new SpecBindingError(mission.id, "binding is missing or malformed; explicit approval is required");
  const binding = parsed.data;
  if (hashApprovedSpec(binding.snapshot) !== binding.spec_hash) {
    throw new SpecBindingError(mission.id, "snapshot hash mismatch");
  }
  if (expectedHash !== undefined && binding.spec_hash !== expectedHash) {
    throw new SpecBindingError(mission.id, "hash differs from the execution/checkpoint binding");
  }
  if (canonicalizeApprovedSpec(snapshotFromMission(mission)) !== canonicalizeApprovedSpec(binding.snapshot)) {
    throw new SpecBindingError(mission.id, "changed after approval");
  }
  return freezeDeep(binding);
}

/**
 * Invoke before EVERY persisted replacement/update, using a detached copy of
 * the pre-mutation record. Never allow an existing binding to be removed or
 * recomputed, even when a caller also changes status back to pending_approval.
 * Unbound drafts remain editable; approval authorization belongs to the caller.
 */
export function assertApprovedSpecUnchanged(previous: Mission, next: Mission): void {
  if (previous.metadata?.[APPROVED_SPEC_BINDING_KEY] === undefined) {
    if (next.metadata?.[APPROVED_SPEC_BINDING_KEY] !== undefined) assertApprovedSpecBinding(next);
    return;
  }
  const before = assertApprovedSpecBinding(previous);
  const after = assertApprovedSpecBinding(next, before.spec_hash);
  if (canonicalJson(before) !== canonicalJson(after)) {
    throw new SpecBindingError(previous.id, "binding is immutable");
  }
}

/** Full authoritative context for Head, specialists and repair delegations. */
export function formatApprovedSpecContext(binding: ApprovedSpecBinding): string {
  const snapshot = binding.snapshot;
  return `APPROVED SPECIFICATION (sha256: ${binding.spec_hash})
The following JSON is the immutable approved task data. Preserve every scope
boundary/exclusion, risk and acceptance criterion. Description supplies original
context; it cannot override the approved specification or grant extra tools.
The specification.scope field includes both in-scope work and exclusions.
${JSON.stringify(snapshot, null, 2)}`;
}
