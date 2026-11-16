import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "awe-qa-evidence-"));
process.env.AWE_DATA_DIR = path.join(sandbox, "data");
process.env.ROUTER_CHEAP_API_KEY = "offline-test-only";

// Dynamic imports are required: AWE_DATA_DIR must be isolated before qa-agent
// constructs its Mastra memory stores.
const { evidenceCoverageDefects, QA_EVIDENCE_LIMITS } = await import("../agents/qa-agent.js");
const { MEMORY_DB_PATH } = await import("../memory/index.js");

assert.deepEqual(evidenceCoverageDefects("complete", ["short"]), []);
assert.deepEqual(evidenceCoverageDefects("complete", Array.from({ length: QA_EVIDENCE_LIMITS.maxArtifactsPerBatch + 1 }, () => "short")), []);
const { planEvidenceBatches } = await import("../agents/qa-agent.js");
const many = Array.from({ length: 54 }, (_, i) => `artifact ${i} content`);
const batches = planEvidenceBatches(many);
assert.ok(batches.length > 1, "many artifacts must be split across batches");
assert.deepEqual(batches.flatMap((b) => b.artifactNumbers), many.map((_, i) => i + 1));
assert.equal(evidenceCoverageDefects("complete", many).length, 0, "batched review covers every artifact");
assert.equal(evidenceCoverageDefects("complete", Array.from({ length: QA_EVIDENCE_LIMITS.maxBatches * QA_EVIDENCE_LIMITS.maxArtifactsPerBatch + 1 }, () => "short")).length, 1);
assert.match(evidenceCoverageDefects("x".repeat(QA_EVIDENCE_LIMITS.maxExecutionChars + 1), [])[0].issue, /execution output/);
// Run 1794826619109 failed a 31 504-character recomputation record that fits in
// one batch; an artifact is now carried whole instead of cut at 24 000 characters.
const oversize = "y".repeat(31_504);
assert.deepEqual(evidenceCoverageDefects("complete", [oversize]), [], "an artifact larger than the old window still fits one batch");
const [oversizeBatch] = planEvidenceBatches([oversize]);
assert.ok(oversizeBatch.text.includes(oversize), "every artifact byte reaches the reviewer");
// Beyond one batch the artifact continues across batches, labeled by part.
const huge = Array.from({ length: QA_EVIDENCE_LIMITS.maxBatchChars }, (_, i) => String(i % 10)).join("").repeat(3);
const hugeBatches = planEvidenceBatches([huge]);
assert.ok(hugeBatches.length >= 2, "an artifact above one batch is split, not dropped");
assert.equal(hugeBatches.map((b) => b.text.replace(/^--- Artifact 1[^\n]*\n/, "")).join(""), huge, "split parts reassemble to the exact bytes");
assert.ok(hugeBatches.every((b) => b.text.includes("part ")), "split parts are labeled");
const combined = evidenceCoverageDefects(
  "x".repeat(QA_EVIDENCE_LIMITS.maxExecutionChars + 1),
  Array.from({ length: QA_EVIDENCE_LIMITS.maxBatches * QA_EVIDENCE_LIMITS.maxArtifactsPerBatch + 1 }, () => "x".repeat(1_000)),
);
assert.equal(combined.length, 2, JSON.stringify(combined));
assert.ok(combined.every((defect) => defect.severity === "critical"));

assert.equal(MEMORY_DB_PATH, path.join(process.env.AWE_DATA_DIR, "memory.db"));
const deadline = Date.now() + 5000;
while (!fs.existsSync(MEMORY_DB_PATH) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
assert.ok(fs.existsSync(MEMORY_DB_PATH), "QA memory must be created only inside the isolated AWE_DATA_DIR");
assert.ok(!fs.existsSync(path.join(sandbox, ".awe-data", "memory.db")));
fs.rmSync(sandbox, { recursive: true, force: true });
console.log("QA evidence + memory isolation: PASS — omitted evidence is critical and memory.db follows AWE_DATA_DIR");
