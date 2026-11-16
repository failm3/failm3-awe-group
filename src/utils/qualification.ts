import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DATA_DIR } from "./storage.js";
import { atomicWriteJsonSync, withFileLock } from "./r0-runtime-fs.js";

/**
 * Host-only admission seam, not a solver tool or a cryptographic identity system.
 * The host supplies authentication, issuer scopes, and live grants/resource policy.
 * Never construct this authority from mission/model input or expose issuer credentials
 * to a solver. DATA_DIR must be protected by the execution boundary: a process that
 * can rewrite this store or inject policy is already trusted by this implementation.
 * Hashes bind provenance; they do not authenticate the calling process or prove QA.
 */
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative().safe();
const bindingSchema = z.object({
  solverId: id,
  scope: id,
  specHash: hash,
  capabilityHash: hash,
  profileHash: hash,
}).strict();
const receiptSchema = bindingSchema.extend({
  qualificationId: id,
  receiptId: id,
  issuer: id,
  evidenceHash: hash,
  evidenceRefs: z.array(z.string().min(1).max(2048)).min(1).max(100),
  issuedAt: time,
  expiresAt: time,
}).strict();
const admissionSchema = bindingSchema.extend({
  admissionId: id,
  qualificationId: id,
  receiptId: id,
  generation: z.number().int().positive().safe(),
  admittedAt: time,
  expiresAt: time,
}).strict();
const stateSchema = z.object({
  version: z.literal(1),
  qualificationId: id,
  generation: z.number().int().positive().safe(),
  status: z.enum(["provisional", "revoked"]),
  receipt: receiptSchema,
  receipts: z.array(receiptSchema).min(1),
  admissions: z.array(admissionSchema),
  transitions: z.array(z.object({
    generation: z.number().int().positive().safe(),
    status: z.enum(["provisional", "revoked"]),
    at: time,
    principal: id,
    reason: z.string().min(1).max(2048),
  }).strict()).min(1),
}).strict();

export type QualificationBinding = z.infer<typeof bindingSchema>;
export type QualificationReceipt = z.infer<typeof receiptSchema>;
export type QualificationAdmission = z.infer<typeof admissionSchema>;
export type QualificationState = z.infer<typeof stateSchema>;
export type QualificationPhase = "admission" | "dispatch" | "acceptance";

export interface QualificationHostPolicy {
  /** Host-configured independent QA principals and their explicitly approved scopes. */
  issuers: ReadonlyArray<{ principal: string; scopes: readonly string[] }>;
  /** Authenticate an opaque host credential; never trust receipt.issuer as identity. */
  authenticateIssuer: (credential: unknown) => string | null;
  /** Host checks current grants, profile eligibility and resources at every seam. */
  authorize: (binding: Readonly<QualificationBinding>, phase: QualificationPhase) => boolean;
  /** Host clock injection for deterministic tests; never a request field. */
  now?: () => number;
}

export class QualificationDeniedError extends Error {
  constructor(message: string) {
    super(`Qualification denied: ${message}`);
    this.name = "QualificationDeniedError";
  }
}

function deny(message: string): never { throw new QualificationDeniedError(message); }
function binding(value: QualificationBinding): QualificationBinding {
  return {
    solverId: value.solverId, scope: value.scope, specHash: value.specHash,
    capabilityHash: value.capabilityHash, profileHash: value.profileHash,
  };
}
function sameBinding(a: QualificationBinding, b: QualificationBinding): boolean {
  return JSON.stringify(binding(a)) === JSON.stringify(binding(b));
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) deny("invalid input or persisted state");
  return result.data;
}

// withFileLock is reentrant; authority callbacks must not exploit that to mutate
// a qualification while its dispatch/acceptance critical section is in progress.
const active = new Set<string>();

export function createQualificationAuthority(policy: QualificationHostPolicy) {
  const issuers = new Map<string, Set<string>>();
  for (const entry of policy.issuers) {
    const principal = parse(id, entry.principal);
    if (issuers.has(principal)) deny("duplicate issuer policy");
    issuers.set(principal, new Set(entry.scopes.map((scope) => parse(id, scope))));
  }
  const authenticate = policy.authenticateIssuer;
  const authorize = policy.authorize;
  const clock = policy.now ?? Date.now;
  if (typeof authenticate !== "function" || typeof authorize !== "function") deny("host policy required");
  const root = path.join(DATA_DIR, "qualifications");

  function now(): number { return parse(time, clock()); }
  function trusted(receipt: QualificationReceipt): void {
    if (receipt.issuer === receipt.solverId || !issuers.get(receipt.issuer)?.has(receipt.scope)) {
      deny("issuer is not independent or authorized for scope");
    }
  }
  function issuer(credential: unknown, receipt: QualificationReceipt): string {
    trusted(receipt);
    const principal = authenticate(credential);
    if (principal !== receipt.issuer) deny("unauthenticated issuer");
    return principal;
  }
  function live(state: QualificationState, expected: QualificationBinding): void {
    trusted(state.receipt);
    const at = now();
    if (state.status !== "provisional") deny("revoked");
    if (state.receipt.issuedAt > at || state.receipt.expiresAt <= at) deny("receipt expired or not yet valid");
    if (!sameBinding(state.receipt, expected)) deny("provenance or scope mismatch");
  }
  function permit(expected: QualificationBinding, phase: QualificationPhase): void {
    if (authorize(Object.freeze(binding(expected)), phase) !== true) deny("host grants/resources policy");
  }
  function transaction<T>(qualificationId: string, fn: (file: string) => T): T {
    parse(id, qualificationId);
    fs.mkdirSync(root, { recursive: true });
    if (fs.lstatSync(root).isSymbolicLink() || !fs.lstatSync(root).isDirectory()) deny("unsafe store root");
    const file = path.join(root, `${qualificationId}.json`);
    if (active.has(file)) deny("reentrant qualification operation");
    return withFileLock(`${file}.lock`, () => {
      active.add(file);
      try { return fn(file); } finally { active.delete(file); }
    });
  }
  function load(file: string): QualificationState | null {
    let raw: string;
    try {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink()) deny("unsafe state file");
      raw = fs.readFileSync(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    let value: unknown;
    try { value = JSON.parse(raw); } catch { deny("corrupt persisted state"); }
    const state = parse(stateSchema, value);
    const last = state.transitions.at(-1)!;
    if (path.basename(file) !== `${state.qualificationId}.json` ||
        state.receipt.qualificationId !== state.qualificationId ||
        state.transitions.length !== state.generation ||
        last.generation !== state.generation || last.status !== state.status ||
        JSON.stringify(state.receipts.at(-1)) !== JSON.stringify(state.receipt)) deny("inconsistent persisted state");
    return state;
  }
  function required(file: string): QualificationState { return load(file) ?? deny("missing qualification"); }
  function cas(state: QualificationState | null, generation: number): number {
    if (!Number.isSafeInteger(generation) || generation < 0 || (state?.generation ?? 0) !== generation) deny("stale generation");
    if (generation === Number.MAX_SAFE_INTEGER) deny("generation exhausted");
    return generation + 1;
  }

  return {
    /** Host-only independent QA receipt publication. No automatic upgrade to verified. */
    qualify(input: QualificationReceipt, credential: unknown, expectedGeneration: number): QualificationState {
      const receipt = parse(receiptSchema, input);
      return transaction(receipt.qualificationId, (file) => {
        const principal = issuer(credential, receipt);
        const at = now();
        if (receipt.issuedAt > at || receipt.expiresAt <= at || receipt.expiresAt <= receipt.issuedAt) deny("invalid receipt validity");
        const previous = load(file);
        const generation = cas(previous, expectedGeneration);
        if (previous && (!sameBinding(previous.receipt, receipt) ||
            previous.receipts.some((old) => old.receiptId === receipt.receiptId) ||
            receipt.issuedAt < previous.transitions.at(-1)!.at)) deny("binding changed or stale/replayed receipt");
        const state: QualificationState = {
          version: 1, qualificationId: receipt.qualificationId, generation,
          status: "provisional", receipt, receipts: [...(previous?.receipts ?? []), receipt],
          admissions: previous?.admissions ?? [],
          transitions: [...(previous?.transitions ?? []), { generation, status: "provisional", at, principal, reason: "independent qualification" }],
        };
        atomicWriteJsonSync(file, state);
        return state;
      });
    },

    revoke(qualificationId: string, expectedGeneration: number, credential: unknown, reason: string): QualificationState {
      if (typeof reason !== "string" || !reason.trim() || reason.length > 2048) deny("revocation reason required");
      return transaction(qualificationId, (file) => {
        const state = required(file);
        const principal = issuer(credential, state.receipt);
        state.generation = cas(state, expectedGeneration);
        state.status = "revoked";
        state.transitions.push({ generation: state.generation, status: "revoked", at: now(), principal, reason });
        atomicWriteJsonSync(file, state);
        return state;
      });
    },

    admit(qualificationId: string, input: QualificationBinding): QualificationAdmission {
      const expected = parse(bindingSchema, input);
      return transaction(qualificationId, (file) => {
        const state = required(file);
        live(state, expected);
        permit(expected, "admission");
        live(state, expected);
        const admission: QualificationAdmission = {
          ...expected, qualificationId, admissionId: randomUUID(), receiptId: state.receipt.receiptId,
          generation: state.generation, admittedAt: now(), expiresAt: state.receipt.expiresAt,
        };
        state.admissions.push(admission);
        atomicWriteJsonSync(file, state);
        return admission;
      });
    },

    /**
     * Couple the live generation check and synchronous local effect/acceptance
     * under the same lock as revoke. Recheck for EVERY effect and final acceptance.
     * Do not await, return promises, start background work, or hold this lock for
     * long tasks. For remote work, synchronously record/dispatch through existing
     * ownership+intent fencing; a previously accepted remote effect remains an
     * unknown/reconciliation concern, not something revoke can undo.
     */
    withAdmission<T>(input: QualificationAdmission, phase: "dispatch" | "acceptance", effect: () => T extends PromiseLike<unknown> ? never : T): T {
      const admission = parse(admissionSchema, input);
      if (phase !== "dispatch" && phase !== "acceptance") deny("invalid fence phase");
      if (typeof effect !== "function" || effect.constructor.name === "AsyncFunction") deny("synchronous effect required");
      return transaction(admission.qualificationId, (file) => {
        const state = required(file);
        live(state, admission);
        const saved = state.admissions.find((item) => item.admissionId === admission.admissionId);
        if (!saved || JSON.stringify(saved) !== JSON.stringify(admission) ||
            admission.generation !== state.generation || admission.receiptId !== state.receipt.receiptId) deny("missing or stale admission");
        permit(admission, phase);
        live(state, admission);
        const result = effect();
        if (result && typeof (result as { then?: unknown }).then === "function") deny("asynchronous effect forbidden");
        return result;
      });
    },

    /** Diagnostic snapshot only; this is NOT an authorization/fence. */
    inspect(qualificationId: string): QualificationState | null {
      return transaction(qualificationId, load);
    },
  };
}
