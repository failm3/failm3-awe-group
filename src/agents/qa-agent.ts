import { Agent } from "@mastra/core/agent";
import { smartModel } from "../config/models.js";
import { QAReviewSchema } from "../types/index.js";
import type { Mission, QAReview } from "../types/index.js";
import { appendLog } from "../utils/storage.js";
import { createAgentMemory } from "../memory/index.js";
import { applyQAGate } from "./qa-gate.js";
import type { QAGateResult } from "./qa-gate.js";
import { withModelCall } from "../utils/model-ledger.js";
import { assertApprovedSpecBinding, formatApprovedSpecContext } from "../utils/spec-binding.js";
import { csvEvidenceDefects } from "./csv-qa.js";
import { webEvidenceDefects } from "./web-qa.js";
import { extractJson } from "../utils/json-extract.js";
import { listQualifiedInvocationReceipts } from "../utils/local-capability.js";

/**
 * Independent QA Agent: verifies real outputs against acceptance criteria.
 * Returns structured JSON — does NOT use structuredOutput (unreliable across providers).
 * Does NOT use tools — artifact contents are passed as text in the prompt.
 */
export const qaAgent = new Agent({
  id: "qa-agent",
  name: "QAAgent",
  instructions: `You are the AWE GROUP Independent QA Agent.

Your sole purpose is to verify mission outputs against acceptance criteria.
You are independent from the agents that produced the work.

You ARE the production independent QA that runs after execution (the host's
"Nox QA"). A criterion such as "passes independent Nox QA" refers to this review:
judge it by whether your own independent verification of the artifacts confirms
the criterion's substantive claims. Do not fail it merely because no separate
QA verdict is embedded in the deliverables, and do not pass it on the strength of
the producers' own self-check scripts — verify the bytes and values yourself.

You will receive artifact contents directly in the prompt — do NOT call any tools.

You must return ONLY a JSON object — no prose, no markdown, no explanation before or after.
Start your response with { and end with }.

The JSON must have exactly this structure:
{
  "passed": true or false,
  "score": integer 0-10,
  "criteria_results": [
    {"criterion": "exact criterion text", "passed": true/false, "notes": "brief explanation"}
  ],
  "defects": [
    {"issue": "description of the problem", "severity": "critical" | "major" | "minor"}
  ],
  "recommendations": ["action item"],
  "verdict": "PASS: explanation" or "FAIL: explanation"
}

Rules:
- You MUST evaluate EVERY acceptance criterion listed below, one entry per criterion.
  Use the criterion text verbatim (copied exactly) in the "criterion" field.
- If a criterion was not satisfied, you MUST mark passed=false and explain why.
  Do NOT soften a criterion to make the mission pass.
- A criterion that is only partially met is passed=false.
- If a section of a deliverable is still a placeholder (for example
  "Pending transcription of the researcher result set"), then every criterion
  depending on that section is passed=false. Reporting a placeholder as done
  is a critical defect.
- score is a secondary signal only. A high score with a failed criterion is
  still a FAIL.
- passed=true only if score >= 6 AND every acceptance criterion is passed=true
  AND there are no critical/major defects.
- defects array may be empty if there are none
- Be pragmatic: if agents worked hard and produced real artifacts despite technical limitations (e.g., website SSR blocking), score the effort and output quality, not perfect API compliance
- Accept inferred/reconstructed requirements when the source website blocks programmatic access
- Return ONLY JSON, nothing else`,
  model: smartModel,
  memory: createAgentMemory("qa-agent"),
});

export const QA_EVIDENCE_LIMITS = Object.freeze({
  /**
   * Artifacts are reviewed in batches. Each batch keeps the per-artifact
   * window small enough for a single careful read, and every artifact is
   * assigned to exactly one batch, so coverage is complete rather than
   * prefix-only.
   */
  maxArtifactsPerBatch: 16,
  maxBatchChars: 120_000,
  maxExecutionChars: 24_000,
  /** Coverage is reported, then bounded: an unbounded mission is not reviewable. */
  maxBatches: 12,
});

export interface EvidenceBatch {
  index: number;
  /** 1-based artifact ordinals, in review order. */
  artifactNumbers: number[];
  text: string;
}

/**
 * Split artifacts into review batches. Batch composition is deterministic:
 * artifacts keep their given order and a batch closes when the next artifact
 * would exceed the batch character or artifact count limit.
 *
 * An artifact larger than one batch is carried whole across consecutive
 * batches, sliced at the batch bound and labeled by part, rather than cut off
 * at a per-artifact window. Cutting bytes discarded real evidence: run
 * 1794826619109 failed a 31 504-character recomputation record that would have
 * fit in a single batch. What still cannot be covered is reported as a defect.
 */
export function planEvidenceBatches(artifactContents: string[]): EvidenceBatch[] {
  const batches: EvidenceBatch[] = [];
  let numbers: number[] = [];
  let parts: string[] = [];
  let chars = 0;
  let open = false;
  const flush = () => {
    if (!open) return;
    batches.push({ index: batches.length + 1, artifactNumbers: numbers, text: parts.join("\n\n") });
    numbers = []; parts = []; chars = 0; open = false;
  };
  artifactContents.forEach((content, i) => {
    const chunks: string[] = [];
    for (let at = 0; at < content.length; at += QA_EVIDENCE_LIMITS.maxBatchChars) {
      chunks.push(content.slice(at, at + QA_EVIDENCE_LIMITS.maxBatchChars));
    }
    if (chunks.length === 0) chunks.push("");
    // Opening a new artifact may need a fresh batch; a continuation chunk always
    // fits, because a batch holds at most one full-size chunk.
    if (open && (numbers.length >= QA_EVIDENCE_LIMITS.maxArtifactsPerBatch ||
        chars + chunks[0].length > QA_EVIDENCE_LIMITS.maxBatchChars)) flush();
    chunks.forEach((chunk, part) => {
      const label = chunks.length === 1
        ? `--- Artifact ${i + 1} ---`
        : `--- Artifact ${i + 1} (part ${part + 1} of ${chunks.length}) ---`;
      if (open && chars + chunk.length > QA_EVIDENCE_LIMITS.maxBatchChars) flush();
      if (!open) open = true;
      if (numbers[numbers.length - 1] !== i + 1) numbers.push(i + 1);
      parts.push(`${label}\n${chunk}`);
      chars += chunk.length;
    });
  });
  flush();
  return batches;
}

export function evidenceCoverageDefects(
  executionOutput: string,
  artifactContents: string[]
): QAReview["defects"] {
  const defects: QAReview["defects"] = [];
  const batches = planEvidenceBatches(artifactContents);
  if (batches.length > QA_EVIDENCE_LIMITS.maxBatches) {
    defects.push({
      issue: `QA evidence incomplete: ${artifactContents.length} artifact(s) require ${batches.length} review batches, above the ${QA_EVIDENCE_LIMITS.maxBatches}-batch limit`,
      severity: "critical",
    });
  }
  if (executionOutput.length > QA_EVIDENCE_LIMITS.maxExecutionChars) {
    defects.push({
      issue: `QA evidence incomplete: execution output exceeded the ${QA_EVIDENCE_LIMITS.maxExecutionChars}-character review window`,
      severity: "critical",
    });
  }
  return defects;
}

export async function reviewMission(
  mission: Mission,
  executionOutput: string,
  artifactContents: string[],
  options: { signal?: AbortSignal; fence?: () => boolean; candidate?: import("./candidate.js").CandidateEpoch } = {}
): Promise<QAReview> {
  return (await reviewMissionDetailed(mission, executionOutput, artifactContents, options)).review;
}

/**
 * Full review result: the LLM review plus the deterministic gate verdict.
 * The gate is binding — `review.passed` is already adjusted by it.
 */
export async function reviewMissionDetailed(
  mission: Mission,
  executionOutput: string,
  artifactContents: string[],
  options: { signal?: AbortSignal; fence?: () => boolean; candidate?: import("./candidate.js").CandidateEpoch } = {}
): Promise<{ review: QAReview; gate: QAGateResult }> {
  options.signal?.throwIfAborted();
  appendLog(mission.id, "QA: starting independent review");
  // Measure coverage on the full input before constructing the bounded prompt.
  // Measuring the already-sliced prompt would silently hide omitted evidence.
  const evidenceDefects = evidenceCoverageDefects(executionOutput, artifactContents);
  evidenceDefects.push(...csvEvidenceDefects(mission).map((issue) => ({ issue, severity: "critical" as const })));
  evidenceDefects.push(...(await webEvidenceDefects(mission, options)).map((issue) => ({ issue, severity: "critical" as const })));
  const approvedContext = mission.metadata.approved_spec_binding
    ? formatApprovedSpecContext(assertApprovedSpecBinding(mission)) : "";
  const candidateContext = options.candidate
    ? `\nREVIEWED CANDIDATE:\n${JSON.stringify(options.candidate)}\nThis identity is supplied by the host; do not infer or replace it.\n`
    : "";
  // Host-recorded qualified invocations are durable evidence that never appears
  // in the artifact set. Withholding them made QA report "no receipt exists",
  // driving repair iterations that could not satisfy the criterion.
  const attempts = (mission.metadata.capability_plane as { attempts?: Array<Record<string, unknown>> } | undefined)?.attempts ?? [];
  const qualifiedTargets = attempts.filter((attempt) => attempt.qualified_target);
  const receipts = qualifiedTargets.length > 0 ? listQualifiedInvocationReceipts(mission.id) : [];
  const capabilityContext = qualifiedTargets.length === 0 ? "" : `\nHOST-RECORDED QUALIFIED CAPABILITY (host evidence, not an artifact):\n` +
    `Qualified attempt(s):\n${JSON.stringify(qualifiedTargets.map((attempt) => ({
      attempt_id: attempt.attempt_id, capability: attempt.capability,
      observation: attempt.observation, qualified_target: attempt.qualified_target,
    })), null, 2)}\n` +
    (receipts.length === 0
      ? "Invocation receipts: NONE — the qualified procedure has no durable invocation receipt.\n"
      : `Durable qualified invocation receipts (${receipts.length}):\n${JSON.stringify(receipts, null, 2)}\n`) +
    `A criterion asking for a durable invocation receipt is satisfied by a host receipt above that binds this mission, ` +
    `the qualified attempt, the executable bytes and the exact command; it does not need to be duplicated as an artifact. ` +
    `The reverse also holds: if the section says NONE, the criterion is not met regardless of artifacts.\n`;

  const batches = planEvidenceBatches(artifactContents);
  // Every artifact appears in exactly one batch, in review order, so the final
  // verdict is synthesized from findings over the whole artifact set instead
  // of a prefix of it.
  const reviewOnce = async (prompt: string, label: string): Promise<QAReview> => {
    const parsed = await (async () => {
      const response = await withModelCall({
        missionId: mission.id, role: "qa-agent", model: smartModel.modelId, provider: smartModel.providerId,
      }, () => qaAgent.generate([{ role: "user", content: prompt }], { abortSignal: options.signal }));
      options.signal?.throwIfAborted();
      return (response.text ?? "").trim();
    })();
    let value: QAReview;
    try {
      value = QAReviewSchema.parse(JSON.parse(extractJson(parsed)));
    } catch (parseErr) {
      appendLog(mission.id, `QA: ${label} output was not schema-valid JSON (${parseErr}) — raw: ${parsed.slice(0, 200)}`);
      // Unstructured prose can never certify deliverables. Fail closed rather
      // than inferring PASS from words such as "passed" in an invalid response.
      value = {
        passed: false,
        score: 0,
        criteria_results: [],
        defects: [{ issue: `QA ${label} output was not valid structured JSON`, severity: "critical" }],
        recommendations: ["Re-run QA with a schema-valid review"],
        verdict: "FAIL: QA output unparseable",
      };
    }
    return value;
  };

  const header = `MISSION: ${mission.title}
OBJECTIVE: ${mission.objective}
${approvedContext}
${candidateContext}${capabilityContext}

ACCEPTANCE CRITERIA:
${mission.acceptance_criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}
`;
  let llmReview: QAReview;
  try {
    const findings: QAReview[] = [];
    for (const batch of batches) {
      const scope = batches.length === 1
        ? "Review this completed mission."
        : `Review part ${batch.index} of ${batches.length} of this completed mission. ` +
          `You see artifacts ${batch.artifactNumbers[0]}–${batch.artifactNumbers[batch.artifactNumbers.length - 1]} of ${artifactContents.length}. ` +
          "Judge only what this part shows and say so in the notes.";
      findings.push(await reviewOnce(`${scope} Return ONLY valid JSON — no prose or markdown.

${header}
EXECUTION OUTPUT:
${executionOutput.slice(0, QA_EVIDENCE_LIMITS.maxExecutionChars)}

ARTIFACTS PRODUCED:
${batch.text}`, `batch ${batch.index}`));
    }

    if (findings.length === 1) {
      llmReview = findings[0];
    } else {
      // One synthesis over the batch findings decides the criteria. It never
      // sees raw artifacts: it reconciles what the parts actually observed.
      llmReview = await reviewOnce(`Decide the mission verdict from complete part reviews. Return ONLY valid JSON — no prose or markdown.
A criterion passes only if every part that observed its evidence reported it met.
A defect reported by any part is unresolved unless another part shows it was
repaired; report the strongest severity. Do not invent evidence.

${header}
PART REVIEWS (all ${findings.length} parts, covering every artifact):
${JSON.stringify(findings.map((finding, i) => ({
  part: i + 1,
  artifacts: batches[i].artifactNumbers,
  passed: finding.passed,
  score: finding.score,
  criteria_results: finding.criteria_results,
  defects: finding.defects,
  recommendations: finding.recommendations,
})), null, 2)}`, "synthesis");
      // Batch-level defects are facts about real content; the synthesis cannot
      // discard them by omission.
      const reported = new Set(llmReview.defects.map((defect) => `${defect.severity}:${defect.issue}`));
      const inherited = findings.flatMap((finding) => finding.defects)
        .filter((defect) => defect.severity !== "minor" && !reported.has(`${defect.severity}:${defect.issue}`));
      if (inherited.length > 0) {
        llmReview = {
          ...llmReview,
          passed: false,
          defects: [...llmReview.defects, ...inherited],
          verdict: llmReview.passed
            ? "FAIL: part review defects were not resolved by the synthesis"
            : llmReview.verdict,
        };
      }
    }
  } catch (err) {
    if (options.signal?.aborted) throw err;
    appendLog(mission.id, `QA: generate() threw: ${err}`);
    const review: QAReview = {
      passed: false,
      score: 0,
      criteria_results: [],
      defects: [{ issue: `QA agent error: ${String(err).slice(0, 200)}`, severity: "critical" }],
      recommendations: ["Retry QA review"],
      verdict: "FAIL: QA agent encountered an error",
    };
    return {
      review,
      gate: {
        passed: false,
        blockers: ["QA agent error"],
        criterion_checks: [],
        llm_score: 0,
        llm_passed: false,
      },
    };
  }

  // Evidence truncation must be visible and binding. Reviewing only a prefix of
  // a mission is not sufficient to confirm every acceptance criterion.
  if (evidenceDefects.length > 0) {
    llmReview = {
      ...llmReview,
      passed: false,
      defects: [...llmReview.defects, ...evidenceDefects],
    };
  }

  // ─── Deterministic gate ────────────────────────────────────────────────────
  // The LLM verdict is advisory. The gate is binding and can only block.
  const evidence = [
    { label: "execution output", text: executionOutput },
    ...artifactContents.map((c, i) => ({ label: `artifact ${i + 1}`, text: c })),
  ];
  const gate = applyQAGate(mission, llmReview, evidence);

  const review: QAReview = {
    ...llmReview,
    passed: gate.passed,
    verdict: gate.passed
      ? `PASS: ${llmReview.verdict || `score ${llmReview.score}`}`
      : `FAIL: ${gate.blockers.join(" | ")}`,
  };

  appendLog(
    mission.id,
    `QA: llm score=${llmReview.score} llm_passed=${llmReview.passed} gate_passed=${gate.passed}` +
      (gate.blockers.length > 0 ? ` blockers=[${gate.blockers.join(" ;; ")}]` : "")
  );

  return { review, gate };
}
