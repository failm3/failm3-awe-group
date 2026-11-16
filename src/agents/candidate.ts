import * as crypto from "crypto";
import type { Artifact, Mission } from "../types/index.js";
import type { StoredMissionPlan, ArtifactSupersession, RepairProvenance, DurableRecoveryResolution } from "./lifecycle.js";
import type { QAReview } from "../types/index.js";
import type { QAGateResult } from "./qa-gate.js";
import { assertApprovedSpecBinding } from "../utils/spec-binding.js";
import { atomicWriteJson, dataSubdir } from "../utils/storage.js";
import * as path from "path";
import * as fs from "fs";

export interface CandidateArtifact {
  artifact_id: string;
  name: string;
  revision: number;
  path?: string;
  sha256: string;
  size_bytes: number;
}

/** The exact immutable artifact set presented to one independent review. */
export interface CandidateEpoch {
  schema: "nox-candidate-epoch-v1";
  epoch_id: string;
  mission_id: string;
  repair_iteration: number;
  spec_hash?: string;
  plan_hash: string;
  artifacts: CandidateArtifact[];
  /** Durable repair evidence needed after the transient checkpoint is cleared. */
  repair_supersessions: ArtifactSupersession[];
  repair_provenance: RepairProvenance[];
  recovery_resolutions: DurableRecoveryResolution[];
  candidate_sha256: string;
  created_at: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value, "utf-8").digest("hex");
}

function revisionOf(artifact: Artifact): number {
  const revision = artifact.metadata.revision;
  return typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 1 ? revision : 0;
}

export function candidateEpochHash(epoch: Omit<CandidateEpoch, "candidate_sha256" | "created_at">): string {
  return sha256(JSON.stringify(epoch));
}

export function createCandidateEpoch(
  mission: Mission,
  plan: StoredMissionPlan,
  artifacts: Artifact[],
  repairIteration: number,
  repairLineage: { supersessions: ArtifactSupersession[]; provenance: RepairProvenance[]; resolutions?: DurableRecoveryResolution[] } = { supersessions: [], provenance: [] }
): CandidateEpoch {
  const entries = artifacts.map((artifact): CandidateArtifact => {
    const digest = artifact.metadata.sha256;
    const size = artifact.metadata.size_bytes;
    // Preserve malformed/legacy records in the epoch instead of throwing before
    // QA. The existing deterministic evidence gate rejects them with a durable
    // review; an exception here would incorrectly require outcome recovery.
    return {
      artifact_id: artifact.id,
      name: artifact.name,
      revision: revisionOf(artifact),
      path: artifact.path,
      sha256: typeof digest === "string" ? digest : "",
      size_bytes: typeof size === "number" ? size : -1,
    };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.revision - b.revision || a.artifact_id.localeCompare(b.artifact_id));

  const unsigned: Omit<CandidateEpoch, "candidate_sha256" | "created_at"> = {
    schema: "nox-candidate-epoch-v1",
    epoch_id: crypto.randomUUID(),
    mission_id: mission.id,
    repair_iteration: repairIteration,
    spec_hash: mission.metadata.approved_spec_binding ? assertApprovedSpecBinding(mission).spec_hash : undefined,
    plan_hash: plan.plan_hash,
    artifacts: entries,
    repair_supersessions: structuredClone(repairLineage.supersessions),
    repair_provenance: structuredClone(repairLineage.provenance),
    recovery_resolutions: structuredClone(repairLineage.resolutions ?? []),
  };
  return { ...unsigned, candidate_sha256: candidateEpochHash(unsigned), created_at: new Date().toISOString() };
}

/** Re-read registry bytes and reject any replacement, deletion or late registration. */
export interface CandidateReviewReceipt {
  schema: "nox-candidate-review-v1";
  mission_id: string;
  epoch_id: string;
  candidate_sha256: string;
  execution_output_sha256: string;
  evidence_sha256: string;
  review: QAReview;
  gate: QAGateResult;
  receipt_sha256: string;
  created_at: string;
}

export function createCandidateReviewReceipt(
  candidate: CandidateEpoch,
  executionOutput: string,
  artifactContents: string[],
  review: QAReview,
  gate: QAGateResult
): CandidateReviewReceipt {
  const unsigned: Omit<CandidateReviewReceipt, "receipt_sha256" | "created_at"> = {
    schema: "nox-candidate-review-v1",
    mission_id: candidate.mission_id,
    epoch_id: candidate.epoch_id,
    candidate_sha256: candidate.candidate_sha256,
    execution_output_sha256: sha256(executionOutput),
    evidence_sha256: sha256(JSON.stringify(artifactContents)),
    review,
    gate,
  };
  return { ...unsigned, receipt_sha256: sha256(JSON.stringify(unsigned)), created_at: new Date().toISOString() };
}

export function persistCandidateEvidence(candidate: CandidateEpoch, receipt: CandidateReviewReceipt): void {
  if (receipt.epoch_id !== candidate.epoch_id || receipt.candidate_sha256 !== candidate.candidate_sha256) {
    throw new Error("Review receipt does not belong to the reviewed candidate");
  }
  const dir = path.join(dataSubdir("candidate-evidence"), candidate.mission_id);
  fs.mkdirSync(dir, { recursive: true });
  atomicWriteJson(path.join(dir, `${candidate.epoch_id}.json`), { candidate, receipt });
}

export function assertCandidateCurrent(candidate: CandidateEpoch, current: Artifact[]): void {
  const projected = current.map((artifact): CandidateArtifact => ({
    artifact_id: artifact.id,
    name: artifact.name,
    revision: revisionOf(artifact),
    path: artifact.path,
    sha256: typeof artifact.metadata.sha256 === "string" ? artifact.metadata.sha256 : "",
    size_bytes: typeof artifact.metadata.size_bytes === "number" ? artifact.metadata.size_bytes : -1,
  })).sort((a, b) => a.name.localeCompare(b.name) || a.revision - b.revision || a.artifact_id.localeCompare(b.artifact_id));
  if (JSON.stringify(projected) !== JSON.stringify(candidate.artifacts)) {
    throw new Error(`Reviewed candidate ${candidate.epoch_id} is stale or was mutated`);
  }
}
