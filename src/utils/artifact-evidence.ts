import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Artifact } from "../types/index.js";
import { ArtifactSchema } from "../types/index.js";
import type { ArtifactSupersession, RepairProvenance } from "../agents/lifecycle.js";
import { dataSubdir } from "./storage.js";

/** Read every valid registry revision, including same-name records hidden by listArtifacts. */
export function allArtifactRecords(missionId: string): Artifact[] {
  let files: string[];
  try {
    files = fs.readdirSync(dataSubdir("artifacts"));
  } catch {
    return [];
  }
  const records: Artifact[] = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file.endsWith(".meta.json")) continue;
    try {
      const parsed = ArtifactSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dataSubdir("artifacts"), file), "utf8")));
      if (parsed.success && parsed.data.mission_id === missionId) records.push(parsed.data);
    } catch {
      /* Corrupt records cannot authenticate evidence. */
    }
  }
  return records;
}

export function artifactIntegrityDefect(artifact: Artifact): string | null {
  if (!artifact.path) {
    return `Artifact '${artifact.name}' is inline-only or legacy: it has no immutable backing file, and inline content cannot vouch for itself; re-register the bytes through saveArtifactFile (recovery path)`;
  }
  const expectedHash = artifact.metadata?.sha256;
  const expectedSize = artifact.metadata?.size_bytes;
  const sizeOk = typeof expectedSize === "number" && Number.isSafeInteger(expectedSize) && expectedSize >= 0;
  const hashOk = typeof expectedHash === "string" && /^[0-9a-f]{64}$/.test(expectedHash);
  if (!sizeOk || !hashOk) {
    const absent = [!hashOk ? "sha256" : null, !sizeOk ? "size_bytes" : null].filter(Boolean).join(" and ");
    return `Artifact '${artifact.name}' lacks immutable integrity metadata (${absent} missing or invalid); re-register the file through saveArtifactFile or reconciliation (recovery path)`;
  }
  let bytes: Buffer;
  try {
    if (fs.lstatSync(artifact.path).isSymbolicLink()) {
      return `Artifact '${artifact.name}' backing path is not a regular file (symbolic link)`;
    }
    const descriptor = fs.openSync(artifact.path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      if (!fs.fstatSync(descriptor).isFile()) return `Artifact '${artifact.name}' backing path is not a regular file`;
      bytes = fs.readFileSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return `Artifact '${artifact.name}' backing file is missing or unreadable`;
  }
  if (bytes.length !== expectedSize) return `Artifact '${artifact.name}' size changed (${expectedSize} -> ${bytes.length} bytes)`;
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== expectedHash) {
    return `Artifact '${artifact.name}' content hash changed`;
  }
  if (typeof artifact.content === "string" && !Buffer.from(artifact.content, "utf-8").equals(bytes)) {
    return `Artifact '${artifact.name}' inline content differs from its verified backing file`;
  }
  return null;
}

function sameSupersession(a: ArtifactSupersession, b: ArtifactSupersession): boolean {
  return a.superseded_id === b.superseded_id && a.superseded_by === b.superseded_by &&
    a.name === b.name && a.superseded_sha256 === b.superseded_sha256 &&
    a.superseded_size_bytes === b.superseded_size_bytes &&
    a.replacement_sha256 === b.replacement_sha256 &&
    a.replacement_size_bytes === b.replacement_size_bytes &&
    a.repair_iteration === b.repair_iteration && a.source === b.source &&
    a.intent_id === b.intent_id && a.provenance_id === b.provenance_id;
}

export interface SupersessionAuthentication {
  missionId: string;
  links: ArtifactSupersession[];
  provenance: RepairProvenance[];
  records?: Artifact[];
  /** Ordinary repair needs no operator resolution; recovery paths supply theirs. */
  resolutions?: Array<{
    kind: string; intent_id: string; decision: string; artifacts?: string[]; operator?: string;
  }>;
}

/**
 * Authenticate metadata pointers against durable manager/operator evidence and
 * both registry endpoints. Intermediate paths may contain a successor's bytes;
 * only a terminal record's live bytes are required to match its historical hash.
 */
export function authenticateSupersessions(input: SupersessionAuthentication): ArtifactSupersession[] {
  const records = new Map((input.records ?? allArtifactRecords(input.missionId)).map((record) => [record.id, record]));
  const supersededAgain = new Set(input.links.map((link) => link.superseded_id));
  return input.links.filter((link) => {
    const old = records.get(link.superseded_id);
    const replacement = records.get(link.superseded_by);
    if (!old || !replacement || old.mission_id !== input.missionId || replacement.mission_id !== input.missionId) return false;
    if (!link.name || old.name !== link.name || replacement.name !== link.name) return false;
    if (typeof link.superseded_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(link.superseded_sha256) ||
        typeof link.superseded_size_bytes !== "number" || !Number.isSafeInteger(link.superseded_size_bytes) ||
        typeof link.replacement_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(link.replacement_sha256) ||
        typeof link.replacement_size_bytes !== "number" || !Number.isSafeInteger(link.replacement_size_bytes)) return false;
    if (old.metadata?.sha256 !== link.superseded_sha256 || old.metadata?.size_bytes !== link.superseded_size_bytes ||
        replacement.metadata?.sha256 !== link.replacement_sha256 || replacement.metadata?.size_bytes !== link.replacement_size_bytes) return false;
    if (!supersededAgain.has(replacement.id) && artifactIntegrityDefect(replacement) !== null) return false;
    if (!link.intent_id || !link.provenance_id) return false;
    const proof = input.provenance.find((candidate) =>
      candidate.provenance_id === link.provenance_id && candidate.intent_id === link.intent_id &&
      candidate.repair_iteration === link.repair_iteration && candidate.source === link.source &&
      candidate.supersessions.some((known) => sameSupersession(known, link))
    );
    if (!proof) return false;
    if (link.source === "repair") return proof.outcome === "completed";
    if (link.source === "operator_retry") {
      return proof.outcome === "operator_retried" && (input.resolutions ?? []).some((resolution) =>
        resolution.kind === "repair" && resolution.intent_id === link.intent_id && resolution.decision === "retry" &&
        (!proof.operator || resolution.operator === proof.operator)
      );
    }
    return proof.outcome === "operator_accepted" && (input.resolutions ?? []).some((resolution) =>
      resolution.kind === "repair" && resolution.intent_id === link.intent_id && resolution.decision === "accept" &&
      (resolution.artifacts ?? []).includes(link.superseded_by) && (!proof.operator || resolution.operator === proof.operator)
    );
  });
}

export interface EvidenceResolution {
  original: Artifact;
  current: Artifact;
  hops: number;
}

/** Resolve immutable acquisition history to intact current bytes, or fail closed. */
export function resolveCurrentArtifact(
  originalId: string,
  originalSha256: string,
  links: ArtifactSupersession[],
  currentArtifacts: Artifact[],
  records: Artifact[]
): EvidenceResolution | null {
  const byId = new Map(records.map((record) => [record.id, record]));
  const original = byId.get(originalId);
  if (!original || original.metadata?.sha256 !== originalSha256) return null;
  const currentById = new Map(currentArtifacts.map((record) => [record.id, record]));
  const supersededBy = new Map(links.map((link) => [link.superseded_id, link]));
  const seen = new Set<string>();
  let artifact = original;
  let hops = 0;
  // A visible record with an outgoing edge is not a terminal revision. Walk
  // every reachable edge so a cycle cannot be laundered through listArtifacts.
  while (true) {
    if (seen.has(artifact.id) || hops > 32) return null;
    seen.add(artifact.id);
    const link = supersededBy.get(artifact.id);
    if (!link) break;
    hops++;
    if (link.name !== original.name || link.superseded_sha256 !== artifact.metadata?.sha256) return null;
    const replacement = byId.get(link.superseded_by);
    if (!replacement || replacement.name !== original.name || replacement.metadata?.sha256 !== link.replacement_sha256) return null;
    artifact = replacement;
  }
  const current = currentById.get(artifact.id);
  if (!current || current.name !== original.name || current.metadata?.sha256 !== artifact.metadata?.sha256 || artifactIntegrityDefect(current)) return null;
  return { original, current, hops };
}
