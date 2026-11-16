import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Mission } from "../types/index.js";
import type { CapabilityAttempt, CapabilityObservation } from "../agents/capability-plane.js";
import type { createQualificationAuthority, QualificationAdmission } from "./qualification.js";
import { QualificationDeniedError } from "./qualification.js";
import { atomicWriteJson, dataSubdir, listArtifacts, withMissionLock } from "./storage.js";

/** Model-proposed identity only. It is never an invocation grant by itself. */
export interface LocalTargetProposal {
  runtime: "node";
  executable_path: string;
  executable_sha256: string;
  args: string[];
  probe_artifacts: Array<{ artifact_id: string; sha256: string }>;
}

/** Durable identity is deliberately free of authority/policy callbacks. */
export interface PersistedQualifiedTarget extends LocalTargetProposal {
  qualification_id: string;
  generation: number;
  admission: QualificationAdmission;
  command_sha256: string;
}

export interface TrustedQualifiedTarget extends PersistedQualifiedTarget {
  authority: ReturnType<typeof createQualificationAuthority>;
  /** Current host target policy, checked again at every executable release. */
  authorizeTarget: (mission: Readonly<Mission>, target: Readonly<PersistedQualifiedTarget>) => boolean;
}

export interface LocalTargetQualificationInput {
  mission: Readonly<Mission>;
  attempt: Readonly<CapabilityAttempt>;
  observation: Readonly<CapabilityObservation>;
  proposal: Readonly<LocalTargetProposal>;
}

export type LocalCapabilityAcquisitionPolicy = (
  input: LocalTargetQualificationInput
) => TrustedQualifiedTarget | null;

export interface QualifiedInvocationReceipt {
  version: 1;
  receipt_id: string;
  mission_id: string;
  delegation_id: string;
  attempt_id: string;
  qualification_id: string;
  generation: number;
  executable_path: string;
  executable_sha256: string;
  command_sha256: string;
  created_at: string;
}

export interface LocalCapabilityGate {
  attemptId: string;
  command: string;
  /** Called synchronously inside the shell's existing withToolEffect boundary. */
  authorizeAndRelease: (command: string, release: () => void) => void;
}

const HASH = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function validToken(value: unknown, allowEmpty = false): value is string {
  return typeof value === "string" && (allowEmpty || value.length > 0) &&
    !value.includes("\0") && !value.includes("\n") && !value.includes("\r") && !value.includes("'") &&
    !value.includes("$") && !value.includes("`") && !value.includes("\\") && !/[{}*?[\]]/.test(value) &&
    !/^<[^<>\r\n]+>$/.test(value);
}

export function shellQuote(value: string): string {
  if (!validToken(value)) throw new QualificationDeniedError("local target path/arguments must be single-quote-safe fixed strings");
  return `'${value}'`;
}

/** The only command contract a qualified delegation may use for its target. */
export function qualifiedTargetCommand(target: Pick<LocalTargetProposal, "executable_path" | "args">): string {
  return ["node", "--", shellQuote(target.executable_path), ...target.args.map(shellQuote)].join(" ");
}

export function commandContractHash(command: string): string {
  return sha256(command);
}

/** Strict recognition, not shell parsing: no chaining, expansion, redirection or placeholders. */
export function recognizeQualifiedNodeCommand(command: string): { executable_path: string; args: string[] } | null {
  if (!command.startsWith("node -- '")) return null;
  const tokens: string[] = [];
  let offset = "node -- ".length;
  while (offset < command.length) {
    if (command[offset] !== "'") return null;
    const end = command.indexOf("'", offset + 1);
    if (end < 0) return null;
    const token = command.slice(offset + 1, end);
    if (!validToken(token)) return null;
    tokens.push(token);
    offset = end + 1;
    if (offset === command.length) break;
    if (command[offset] !== " ") return null;
    offset++;
    if (offset === command.length) return null;
  }
  if (tokens.length === 0 || !path.isAbsolute(tokens[0])) return null;
  return { executable_path: tokens[0], args: tokens.slice(1) };
}

function readExecutable(executablePath: string): { path: string; sha256: string } {
  if (!path.isAbsolute(executablePath) || !validToken(executablePath)) {
    throw new QualificationDeniedError("local target requires an absolute canonical executable path");
  }
  const canonical = fs.realpathSync.native(executablePath);
  if (canonical !== executablePath) throw new QualificationDeniedError("local target path is not canonical");
  const fd = fs.openSync(canonical, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new QualificationDeniedError("local target is not a regular file");
    return { path: canonical, sha256: sha256(fs.readFileSync(fd)) };
  } finally {
    fs.closeSync(fd);
  }
}

function canonicalProposal(proposal: LocalTargetProposal): LocalTargetProposal {
  if (!proposal || proposal.runtime !== "node" || !Array.isArray(proposal.args) || proposal.args.length > 64 ||
      proposal.args.some((arg) => !validToken(arg, true) || arg.length > 4096) ||
      !Array.isArray(proposal.probe_artifacts) || proposal.probe_artifacts.length === 0 ||
      !HASH.test(proposal.executable_sha256)) {
    throw new QualificationDeniedError("invalid local target proposal");
  }
  const executable = readExecutable(proposal.executable_path);
  if (executable.sha256 !== proposal.executable_sha256) {
    throw new QualificationDeniedError("local target executable hash differs from the proposal");
  }
  const ids = new Set<string>();
  const probes = proposal.probe_artifacts.map((probe) => {
    if (!probe || typeof probe.artifact_id !== "string" || !HASH.test(probe.sha256) || ids.has(probe.artifact_id)) {
      throw new QualificationDeniedError("invalid or duplicate local target probe identity");
    }
    ids.add(probe.artifact_id);
    return { artifact_id: probe.artifact_id, sha256: probe.sha256 };
  });
  return { runtime: "node", executable_path: executable.path, executable_sha256: executable.sha256, args: [...proposal.args], probe_artifacts: probes };
}

function verifyProbes(missionId: string, proposal: LocalTargetProposal): void {
  const artifacts = new Map(listArtifacts(missionId).map((artifact) => [artifact.id, artifact]));
  for (const probe of proposal.probe_artifacts) {
    const artifact = artifacts.get(probe.artifact_id);
    if (!artifact || artifact.metadata.sha256 !== probe.sha256 || !artifact.path) {
      throw new QualificationDeniedError("local target probe artifact is missing or its identity changed");
    }
    const fd = fs.openSync(artifact.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (!fs.fstatSync(fd).isFile() || sha256(fs.readFileSync(fd)) !== probe.sha256) {
        throw new QualificationDeniedError("local target probe bytes do not match their proposed hash");
      }
    } finally {
      fs.closeSync(fd);
    }
  }
}

/**
 * Host helper for an acquisition callback. It canonicalizes/rehashes the real
 * executable and verifies real probe bytes. The host alone supplies the existing
 * qualification authority, generation-bound admission and live target policy.
 */
export function qualifyLocalTarget(
  input: LocalTargetQualificationInput,
  host: {
    authority: ReturnType<typeof createQualificationAuthority>;
    admission: QualificationAdmission;
    authorizeTarget: TrustedQualifiedTarget["authorizeTarget"];
  }
): TrustedQualifiedTarget | null {
  try {
    if (input.observation.status !== "available") return null;
    const proposal = canonicalProposal(input.proposal);
    verifyProbes(input.mission.id, proposal);
    const command = qualifiedTargetCommand(proposal);
    const state = host.authority.inspect(host.admission.qualificationId);
    if (!state || state.status !== "provisional" ||
        state.admissions.some((saved) => saved.admissionId === host.admission.admissionId &&
          saved.generation === host.admission.generation && state.generation === saved.generation) !== true) {
      return null;
    }
    // This performs the live binding, receipt, generation and host grant checks.
    host.authority.withAdmission(host.admission, "dispatch", () => undefined);
    const persisted: PersistedQualifiedTarget = {
      ...proposal,
      qualification_id: host.admission.qualificationId,
      generation: host.admission.generation,
      admission: structuredClone(host.admission),
      command_sha256: commandContractHash(command),
    };
    if (host.authorizeTarget(input.mission, persisted) !== true) return null;
    return { ...persisted, authority: host.authority, authorizeTarget: host.authorizeTarget };
  } catch {
    return null;
  }
}

export function persistedQualifiedTarget(target: TrustedQualifiedTarget): PersistedQualifiedTarget {
  const { authority: _authority, authorizeTarget: _authorizeTarget, ...identity } = target;
  return structuredClone(identity);
}

/**
 * A qualified executable is a pinned capability, not a mission deliverable.
 * Its bytes must not be rewritten by a later specialist or repair: any change
 * silently invalidates the qualification and produces unverified deliverables.
 */
export function qualifiedExecutablePaths(attempts: ReadonlyArray<CapabilityAttempt>): string[] {
  return attempts.flatMap((attempt) => attempt.qualified_target ? [attempt.qualified_target.executable_path] : []);
}

/** Refuse a write whose target is (or would replace) a qualified executable. */
export function assertNotQualifiedExecutable(protectedPaths: readonly string[], target: string): void {
  if (protectedPaths.length === 0) return;
  let canonical: string;
  try { canonical = fs.realpathSync(path.resolve(target)); }
  catch { canonical = path.resolve(target); }
  for (const qualified of protectedPaths) {
    if (canonical === qualified) {
      throw new QualificationDeniedError(
        `qualified executable '${path.basename(qualified)}' is immutable after qualification; repair must address deliverables, not the pinned procedure`);
    }
  }
}

/** Module-scope registry: a target path is read-only even without full tool context. */
const qualifiedPathsByMission = new Map<string, string[]>();

export function registerQualifiedExecutables(missionId: string, paths: readonly string[]): void {
  if (paths.length > 0) qualifiedPathsByMission.set(missionId, [...paths]);
}

export function qualifiedExecutablePathsFor(missionId: string): string[] {
  return qualifiedPathsByMission.get(missionId) ?? [];
}

/** True when a shell command text names a qualified executable path. */
export function shellTouchesQualifiedExecutable(missionId: string, command: string): string | null {
  for (const qualified of qualifiedExecutablePathsFor(missionId)) {
    if (command.includes(qualified)) return qualified;
  }
  return null;
}

/**
 * Deterministic gate: every qualified executable must still hash to the bytes
 * the host qualified. Anything else means the competence itself was mutated and
 * no downstream artifact can be trusted.
 */
export function qualifiedExecutableDefects(attempts: ReadonlyArray<CapabilityAttempt>): string[] {
  const defects: string[] = [];
  for (const attempt of attempts) {
    const target = attempt.qualified_target;
    if (!target) continue;
    let actual: string;
    try { actual = sha256(fs.readFileSync(target.executable_path)); }
    catch (error) {
      defects.push(`qualified executable '${path.basename(target.executable_path)}' is unreadable: ${String(error)}`);
      continue;
    }
    if (actual !== target.executable_sha256) {
      defects.push(`qualified executable '${path.basename(target.executable_path)}' bytes changed after qualification (expected ${target.executable_sha256}, found ${actual})`);
    }
  }
  return defects;
}

function sameIdentity(a: PersistedQualifiedTarget, b: PersistedQualifiedTarget): boolean {
  return JSON.stringify(persistedQualifiedTarget(a as TrustedQualifiedTarget)) ===
    JSON.stringify(persistedQualifiedTarget(b as TrustedQualifiedTarget));
}

/** Resolve through host policy on initial use and every resume/delegation/release. */
export function resolveQualifiedTarget(input: LocalTargetQualificationInput & {
  policy: LocalCapabilityAcquisitionPolicy | undefined;
  expected?: PersistedQualifiedTarget;
}): TrustedQualifiedTarget {
  if (!input.policy) throw new QualificationDeniedError("structured local acquisition requires trusted host acquisition policy");
  const proposal = canonicalProposal(input.proposal);
  const qualified = input.policy({
    mission: input.mission, attempt: input.attempt, observation: input.observation, proposal,
  });
  if (!qualified) throw new QualificationDeniedError("host did not qualify the proposed local target");
  const canonical = canonicalProposal(qualified);
  if (JSON.stringify(canonical) !== JSON.stringify(proposal) ||
      !SAFE_ID.test(qualified.qualification_id) ||
      qualified.qualification_id !== qualified.admission.qualificationId ||
      qualified.generation !== qualified.admission.generation ||
      qualified.command_sha256 !== commandContractHash(qualifiedTargetCommand(canonical)) ||
      (input.expected && !sameIdentity(qualified, input.expected))) {
    throw new QualificationDeniedError("host-qualified target identity differs from its durable proposal/admission");
  }
  verifyProbes(input.mission.id, canonical);
  return qualified;
}

function receiptFile(missionId: string): string {
  return path.join(dataSubdir("capability-invocations"), `${missionId}.json`);
}

export function listQualifiedInvocationReceipts(missionId: string): QualifiedInvocationReceipt[] {
  const file = receiptFile(missionId);
  let raw: string;
  try { raw = fs.readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const value = JSON.parse(raw) as unknown;
  if (!Array.isArray(value)) throw new Error("Malformed qualified invocation receipt store");
  return value as QualifiedInvocationReceipt[];
}

function persistReceipt(receipt: QualifiedInvocationReceipt): void {
  withMissionLock(receipt.mission_id, () => {
    const receipts = listQualifiedInvocationReceipts(receipt.mission_id);
    if (receipts.some((saved) => saved.receipt_id === receipt.receipt_id)) {
      throw new Error("Duplicate qualified invocation receipt");
    }
    atomicWriteJson(receiptFile(receipt.mission_id), [...receipts, receipt]);
  });
}

export function createLocalCapabilityGate(input: {
  mission: Mission;
  delegationId: string;
  attempt: CapabilityAttempt;
  policy: LocalCapabilityAcquisitionPolicy | undefined;
  onReceipt: (attemptId: string, receipt: QualifiedInvocationReceipt) => void;
}): LocalCapabilityGate {
  const persisted = input.attempt.qualified_target;
  if (!persisted) throw new QualificationDeniedError("capability attempt has no qualified local target");
  const proposal = input.attempt.observation.local_target;
  if (!proposal) throw new QualificationDeniedError("qualified capability attempt lacks its local target proposal");
  const resolve = () => resolveQualifiedTarget({
    mission: input.mission, attempt: input.attempt, observation: input.attempt.observation,
    proposal, policy: input.policy, expected: persisted,
  });
  const initial = resolve();
  const command = qualifiedTargetCommand(initial);
  return {
    attemptId: input.attempt.attempt_id,
    command,
    authorizeAndRelease(actualCommand, release) {
      const recognized = recognizeQualifiedNodeCommand(actualCommand);
      if (!recognized) {
        throw new QualificationDeniedError(
          "qualified target requires the exact fixed node command; in this delegation the shell accepts only " +
          `${command} and the host already rehashes the executable before release, so run that command alone`);
      }
      if (actualCommand !== command || recognized.executable_path !== initial.executable_path ||
          JSON.stringify(recognized.args) !== JSON.stringify(initial.args)) {
        throw new QualificationDeniedError("qualified target path or fixed arguments do not match the attempt");
      }
      const target = resolve();
      // Match the exact admission persisted in the qualification authority,
      // not a mutable object supplied by the acquisition callback.
      const live = target.authority.inspect(target.qualification_id);
      const admission = live?.admissions.find((saved) =>
        saved.admissionId === target.admission.admissionId &&
        saved.generation === target.admission.generation);
      if (!live || live.status !== "provisional" || !admission ||
          admission.generation !== target.generation) {
        throw new QualificationDeniedError("qualified local target admission is missing or stale");
      }
      target.authority.withAdmission(admission, "dispatch", () => {
        if (target.authorizeTarget(input.mission, persisted) !== true) {
          throw new QualificationDeniedError("current host target policy revoked the local target");
        }
        // Rehash the actual host bytes immediately before release, with both
        // the existing shell effect fence and the final admission lock held.
        const actual = readExecutable(target.executable_path);
        if (actual.sha256 !== target.executable_sha256) {
          throw new QualificationDeniedError("qualified target executable bytes changed");
        }
        const receipt: QualifiedInvocationReceipt = {
          version: 1, receipt_id: crypto.randomUUID(), mission_id: input.mission.id,
          delegation_id: input.delegationId, attempt_id: input.attempt.attempt_id,
          qualification_id: target.qualification_id,
          generation: admission.generation, executable_path: actual.path,
          executable_sha256: actual.sha256, command_sha256: commandContractHash(actualCommand),
          created_at: new Date().toISOString(),
        };
        persistReceipt(receipt);
        input.onReceipt(input.attempt.attempt_id, receipt);
        release();
      });
    },
  };
}
