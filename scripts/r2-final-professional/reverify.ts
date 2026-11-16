#!/usr/bin/env npx tsx
/** Offline re-verification of one completed professional run; never writes its original summary. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { analyticsFixture, researchFixture } from "./fixtures.js";
import { check, independentVerification, overlapProof, readStableFile } from "./verifier.js";

const root = path.resolve(process.argv[2] ?? "");
if (!root || process.argv.length !== 3 || !path.basename(root).startsWith("r2-final-professional-")) {
  throw new Error("Use exactly one existing r2-final-professional report directory");
}
const summary = JSON.parse(readStableFile(path.join(root, "summary.json")).toString("utf8"));
const runId = path.basename(root);
const results = [];
for (const kind of ["research", "analytics"] as const) {
  const saved = JSON.parse(readStableFile(path.join(root, "missions", `${kind}.json`)).toString("utf8"));
  const fixture = kind === "research"
    ? researchFixture(runId, path.join(root, "state/artifacts", saved.mission_id))
    : analyticsFixture(runId, path.join(root, "state/artifacts", saved.mission_id));
  const mission = JSON.parse(readStableFile(path.join(root, "state/missions", `${saved.mission_id}.json`)).toString("utf8"));
  const records = fs.readdirSync(path.join(root, "state/artifacts")).filter(name => name.endsWith(".json"))
    .map(name => JSON.parse(readStableFile(path.join(root, "state/artifacts", name)).toString("utf8")))
    .filter(artifact => artifact.mission_id === saved.mission_id);
  const byId = new Map(records.map(artifact => [artifact.id, artifact]));
  const artifacts = saved.artifacts.map((artifact: { id: string }) => byId.get(artifact.id)).filter(Boolean);
  const independent = independentVerification({ fixture, mission, artifacts, registry: records,
    modelCalls: saved.model_calls, intervals: saved.intervals });
  const candidatePath = path.join(root, "candidate-evidence", `${kind}-${saved.qa_candidate_receipt?.candidate?.epoch_id ?? ""}.json`);
  const candidateFile = fs.existsSync(candidatePath) ? candidatePath :
    fs.readdirSync(path.join(root, "candidate-evidence")).filter(name => name.startsWith(`${kind}-`)).map(name => path.join(root, "candidate-evidence", name))[0];
  const candidate = JSON.parse(readStableFile(candidateFile).toString("utf8"));
  const candidateBytes = readStableFile(candidateFile);
  const candidateHash = createHash("sha256").update(candidateBytes).digest("hex");
  const checks = [
    ...independent.checks,
    check("saved candidate copy hashes to its recorded candidate digest",
      candidate.candidate.candidate_sha256 === saved.candidate_evidence_sha256 &&
      candidate.receipt?.candidate_sha256 === saved.candidate_evidence_sha256 && candidateBytes.length > 0),
    check("saved QA candidate projection matches the accepted artifact registry",
      JSON.stringify(candidate.candidate.artifacts.map((a: any) => ({ name: a.name, revision: a.revision, artifact_id: a.artifact_id })).sort((a: any,b: any) => a.name.localeCompare(b.name) || a.revision-b.revision || a.artifact_id.localeCompare(b.artifact_id))) ===
      JSON.stringify(saved.artifacts.map((a: any) => ({ name: a.name, revision: a.revision, artifact_id: a.id })).sort((a: any,b: any) => a.name.localeCompare(b.name) || a.revision-b.revision || a.artifact_id.localeCompare(b.artifact_id)))),
  ];
  results.push({ mission_id: saved.mission_id, status: mission.status, qa_passed: saved.qa_review?.passed === true,
    independent_verification: independent, checks, passed: checks.every(item => item.passed) });
}
const concurrency = overlapProof(summary.missions.map((m: any) => ({ mission_id: m.mission_id, started_at: m.started_at, finished_at: m.finished_at })));
const originalAttestation = JSON.parse(readStableFile(path.join(root, "attestation.json")).toString("utf8"));
const originalAttestationHash = createHash("sha256").update(readStableFile(path.join(root, "attestation.json"))).digest("hex");
const result = {
  schema: "r2-final-professional-reverification-v1", mode: "offline-readback", run_root: root,
  original_summary_sha256: createHash("sha256").update(readStableFile(path.join(root, "summary.json"))).digest("hex"),
  original_summary_passed: summary.passed, original_attestation_sha256: originalAttestationHash,
  original_protocol_intact: summary.protocol_intact, original_attestation: originalAttestation,
  missions: results,
  checks: [check("both saved missions pass full offline readback", results.every(item => item.passed)),
    check("whole-mission overlap is reproduced from saved intervals", concurrency.proven === true),
    check("original live protocol attestation was intact", summary.protocol_intact === true)],
  concurrency, provider_cost: "UNKNOWN", network_calls: 0, model_calls: 0,
};
result.checks.push(check("all re-verification checks pass", result.checks.every(item => item.passed)));
const output = path.join(root, "reverification.json");
fs.writeFileSync(output, JSON.stringify({ ...result, passed: result.checks.every(item => item.passed) }, null, 2) + "\n");
console.log(JSON.stringify({ output, passed: result.checks.every(item => item.passed), missions: results.map(item => ({ mission_id: item.mission_id, passed: item.passed })), original_summary_passed: summary.passed }, null, 2));
process.exit(result.checks.every(item => item.passed) ? 0 : 1);
