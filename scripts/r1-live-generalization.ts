#!/usr/bin/env npx tsx
/** Authorized, bounded live transfer mission plus independent host verification. */
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import dotenv from "dotenv";

if (process.argv[2] !== "--run-authorized-generalization") {
  throw new Error("Explicit live generalization flag required");
}
dotenv.config({ quiet: true });
delete process.env.AWE_OFFLINE_TEST;
const runRoot = path.resolve("reports", `r1-generalization-${Date.now()}`);
fs.mkdirSync(runRoot, { recursive: true });
process.env.AWE_DATA_DIR = path.join(runRoot, "state");

const storage = await import("../src/utils/storage.js");
const { createApprovedSpecBinding, assertApprovedSpecBinding } = await import("../src/utils/spec-binding.js");
const { MissionManager } = await import("../src/agents/mission-manager.js");
const { listModelCalls } = await import("../src/utils/model-ledger.js");
const { ordinaryPlan } = await import("../src/agents/capability-plane.js");
const { chromium } = await import("playwright");
const { allArtifactRecords, authenticateSupersessions, resolveCurrentArtifact } = await import("../src/utils/artifact-evidence.js");

const id = `r1-generalization-${randomUUID()}`;
const workspace = storage.prepareMissionWorkspace(id);
const inputPath = path.join(workspace, "input", "rescue-shifts.csv");
fs.mkdirSync(path.dirname(inputPath), { recursive: true });
const csv = [
  "shift_id,district,team,scheduled_hours,completed_hours,incidents",
  "S-01,North,Harbor,12,11,2",
  "S-02,South,Harbor,8,8,1",
  "S-03,North,Ridge,10,7,3",
  "S-04,West,Ridge,14,13,0",
  "S-05,South,Harbor,6,5,2",
  "S-06,West,Ridge,9,9,1",
].join("\n") + "\n";
fs.writeFileSync(inputPath, csv);
const expected = {
  rows: 6,
  scheduled_hours: 59,
  completed_hours: 53,
  incidents: 9,
  completion_percent: 89.83,
  districts: {
    North: { scheduled_hours: 22, completed_hours: 18 },
    South: { scheduled_hours: 14, completed_hours: 13 },
    West: { scheduled_hours: 23, completed_hours: 22 },
  },
};
const criteria = [
  "Persist metrics.json with exact totals, district comparisons, and the reproducible calculation method for the supplied CSV. Use the exact keys row_count, scheduled_hours, completed_hours, incidents, completion_percent (2 decimal places), and districts. districts must be a JSON object keyed by district name. Every count, hour total and percentage in metrics.json must be a JSON number, never a string; format percentages to two decimal places in dashboard.html.",
  "Create a polished, self-contained dashboard.html that visibly presents every metric and requires no external assets.",
  "Use the approved render_dashboard capability to render dashboard.html in Chromium and save dashboard.png at exactly 1280x720, with legible content and no browser error page.",
];
const description = "A previously unseen local data, document and visual-production mission; no task-specific application workflow is supplied.";
const spec = {
  title: "Unseen rescue-shift analytics dashboard",
  objective: "Turn the supplied rescue-shift CSV into independently reproducible analytics and a rendered visual dashboard.",
  scope: `Read only ${inputPath} as mission input. Work only inside ${workspace}. Use ordinary local runtimes and existing tools. Deliver metrics.json, dashboard.html and dashboard.png. Keep the artifact set concise: apart from bounded capability-probe evidence, avoid unnecessary scratch reports, logs and duplicate scripts; put the reproducible calculation method in metrics.json. No package installation, network access, publishing, deployment, purchases or external changes.`,
  acceptance_criteria: criteria,
  suggested_tools: ["file_read", "file_write", "file_list", "shell", "save_artifact", "render_dashboard"],
  suggested_agents: ["analyst", "coder", "designer", "executor"],
  estimated_complexity: "moderate" as const,
  risks: ["Exact arithmetic and browser rendering must be verified from bytes, not model claims"],
};
const now = new Date().toISOString();
const pending = {
  id, title: spec.title, objective: spec.objective, description,
  acceptance_criteria: criteria, status: "pending_approval" as const, priority: "normal" as const,
  created_at: now, updated_at: now, artifacts: [], metadata: { specification: spec },
};
storage.saveMission(pending);
// This local test fixture explicitly exercises the same immutable approval
// transition as the CLI. The invocation flag is never passed to a model.
const approved = {
  ...pending, status: "approved" as const,
  metadata: { ...pending.metadata, approved_spec_binding: createApprovedSpecBinding(pending) },
};
storage.saveMission(approved);

const planning: Array<{ kind: string; capability?: string }> = [];
let failure: string | undefined;
try {
  // Leave bounded room for QA and durable candidate finalization after the
  // acquisition, replan and three sequential specialist calls.
  const manager = new MissionManager(approved, 30 * 60_000, {
    admission: {
      mode: "engineering-practice", missionId: id,
      specHash: assertApprovedSpecBinding(approved).spec_hash,
      authorizeExecution: () => true,
    },
    deps: {
      // Observe the real Head boundary without substituting its model output.
      planMission: async (mission, options) => {
        const { planMission } = await import("../src/agents/head-agent.js");
        const decision = await planMission(mission, options);
        const plan = ordinaryPlan(decision);
        planning.push(plan
          ? { kind: options?.capabilityAttempt ? "replan" : options?.executionFailure ? "failure-replan" : "plan" }
          : { kind: decision.status, capability: decision.capability });
        return decision;
      },
    },
  });
  const result = await manager.run();
  fs.writeFileSync(path.join(runRoot, "qa-review.json"), JSON.stringify(result.review, null, 2));
} catch (error) {
  failure = error instanceof Error ? error.name : "ExecutionError";
}

const checks: Array<{ check: string; passed: boolean; detail?: string }> = [];
function check(checkName: string, passed: boolean, detail?: string): void {
  checks.push({ check: checkName, passed, ...(detail ? { detail } : {}) });
}
const final = storage.loadMission(id);
const artifacts = storage.listArtifacts(id);
check("mission completed through independent QA", final?.status === "completed", final?.status);
check("real Head model call recorded", listModelCalls(id).some((call) => call.role === "head-agent" && call.status === "completed"));
check("independent QA model call recorded", listModelCalls(id).some((call) => call.role === "qa-agent" && call.status === "completed"));
const gap = planning.find((entry) => entry.kind === "acquire");
check("Head exercised capability-gap diagnosis", !!gap, JSON.stringify(planning));
check("capability result caused replanning", gap ? planning.some((entry) => entry.kind === "replan") : true);
const capabilityPlane = final?.metadata.capability_plane as { attempts?: Array<{ artifact_id: string; artifact_sha256: string }> } | undefined;
const attempts = capabilityPlane?.attempts ?? [];
// The exact reviewed candidate retains repair authentication after checkpoint cleanup.
const candidateEvidencePath = final?.metadata.candidate && (final.metadata.candidate as { evidence_path?: string }).evidence_path;
let reviewedCandidate: any;
let authenticatedSupersessions: any[] = [];
if (candidateEvidencePath && fs.existsSync(candidateEvidencePath)) {
  reviewedCandidate = JSON.parse(fs.readFileSync(candidateEvidencePath, "utf8")).candidate;
  const candidateBytes = { ...reviewedCandidate };
  delete candidateBytes.candidate_sha256;
  delete candidateBytes.created_at;
  if (createHash("sha256").update(JSON.stringify(candidateBytes)).digest("hex") === reviewedCandidate.candidate_sha256) {
    authenticatedSupersessions = authenticateSupersessions({
      missionId: id,
      links: reviewedCandidate.repair_supersessions ?? [],
      provenance: reviewedCandidate.repair_provenance ?? [],
      resolutions: reviewedCandidate.recovery_resolutions ?? [],
      records: allArtifactRecords(id),
    });
  }
}
check("capability acquisition persisted exactly once", gap ? attempts.length === 1 : attempts.length <= 1);
for (const attempt of attempts) {
  const observation = resolveCurrentArtifact(
    attempt.artifact_id, attempt.artifact_sha256, authenticatedSupersessions, artifacts, allArtifactRecords(id)
  );
  check("capability evidence hash remains current", !!observation);
}

const metricsArtifact = artifacts.find((artifact) => artifact.name === "metrics.json");
const htmlArtifact = artifacts.find((artifact) => artifact.name === "dashboard.html");
const pngArtifact = artifacts.find((artifact) => artifact.name === "dashboard.png");
check("all required canonical artifacts registered", !!(metricsArtifact && htmlArtifact && pngArtifact), artifacts.map((a) => a.name).join(", "));
let metrics: Record<string, unknown> | undefined;
if (metricsArtifact?.path) {
  try { metrics = JSON.parse(fs.readFileSync(metricsArtifact.path, "utf8")); } catch {}
}
const serializedMetrics = metrics ? JSON.stringify(metrics) : "";
const exact = (value: unknown) => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
check("metrics contain exact expected scalar fields", !!metrics &&
  metrics.row_count === expected.rows && metrics.scheduled_hours === expected.scheduled_hours &&
  metrics.completed_hours === expected.completed_hours && metrics.incidents === expected.incidents &&
  metrics.completion_percent === expected.completion_percent && !!metrics.districts);
const districts = exact(metrics?.districts);
check("metrics contain exact district totals", Object.entries(expected.districts).every(([district, totals]) => {
  const actual = exact(districts[district]);
  return actual.scheduled_hours === totals.scheduled_hours && actual.completed_hours === totals.completed_hours;
}));
check("metrics describe a reproducible method", typeof serializedMetrics === "string" &&
  /calculation|formula|method/i.test(serializedMetrics));
if (htmlArtifact?.path) {
  const html = fs.readFileSync(htmlArtifact.path, "utf8");
  check("dashboard visibly contains exact totals", [53, 59, 9, "89.83"].every((value) => html.includes(String(value))));
  check("dashboard is self-contained", !/<(?:script|img|link)[^>]+(?:src|href)=["']https?:/i.test(html));
}
if (pngArtifact?.path && fs.existsSync(pngArtifact.path)) {
  const bytes = fs.readFileSync(pngArtifact.path);
  check("PNG bytes match registry hash", createHash("sha256").update(bytes).digest("hex") === pngArtifact.metadata.sha256);
  check("PNG is exactly 1280x720", bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(16) === 1280 && bytes.readUInt32BE(20) === 720);
  if (htmlArtifact?.path) {
    let browser;
    try {
      browser = await chromium.launch({
        executablePath: path.resolve(".oc-isolated/cache/ms-playwright/chromium-1148/chrome-linux/chrome"),
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        env: { PATH: "/usr/bin:/bin", HOME: "/tmp", LD_LIBRARY_PATH: path.resolve(".chromium-deps/usr/lib/x86_64-linux-gnu") },
      });
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`file://${htmlArtifact.path}`, { waitUntil: "load" });
      const text = await page.locator("body").innerText();
      const verificationPath = path.join(runRoot, "independent-dashboard.png");
      await page.screenshot({ path: verificationPath, animations: "disabled" });
      check("independent browser render has all metrics and no JS error", errors.length === 0 &&
        ["53", "59", "89.83"].every((value) => text.includes(value)), errors.join("; "));
      check("independent visual evidence saved", fs.statSync(verificationPath).size > 10_000);

      const comparisonPage = await browser.newPage();
      // Evaluate source text rather than a transpiler-wrapped function: tsx's
      // keepNames transform otherwise injects an unavailable __name helper
      // into Chromium and prevents the independent pixel check from running.
      const pixelInput = { submitted: bytes.toString("base64"), independent: fs.readFileSync(verificationPath).toString("base64") };
      const pixelComparison = await comparisonPage.evaluate(`(async ({ submitted, independent }) => {
        const decode = async (base64) => {
          const image = new Image();
          image.src = "data:image/png;base64," + base64;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("Pixel comparison canvas unavailable");
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height);
        };
        const [left, right] = await Promise.all([decode(submitted), decode(independent)]);
        if (left.width !== right.width || left.height !== right.height) {
          return { equal: false, width: left.width, height: left.height,
            independent_width: right.width, independent_height: right.height,
            differing_pixels: -1, total_pixels: left.width * left.height };
        }
        let differing = 0;
        for (let offset = 0; offset < left.data.length; offset += 4) {
          if (left.data[offset] !== right.data[offset] || left.data[offset + 1] !== right.data[offset + 1] ||
              left.data[offset + 2] !== right.data[offset + 2] || left.data[offset + 3] !== right.data[offset + 3]) differing++;
        }
        return { equal: differing === 0, width: left.width, height: left.height,
          independent_width: right.width, independent_height: right.height,
          differing_pixels: differing, total_pixels: left.width * left.height };
      })(${JSON.stringify(pixelInput)})`) as {
        equal: boolean; width: number; height: number; independent_width: number; independent_height: number;
        differing_pixels: number; total_pixels: number;
      };
      const differenceRatio = pixelComparison.differing_pixels < 0
        ? 1
        : pixelComparison.differing_pixels / pixelComparison.total_pixels;
      fs.writeFileSync(path.join(runRoot, "pixel-comparison.json"), JSON.stringify({
        ...pixelComparison, difference_ratio: differenceRatio, maximum_difference_ratio: 0.10,
      }, null, 2));
      check("submitted and independently rendered PNG pixels stay within the bounded render difference",
        pixelComparison.width === 1280 && pixelComparison.height === 720 &&
        pixelComparison.independent_width === 1280 && pixelComparison.independent_height === 720 && differenceRatio <= 0.10,
        `${pixelComparison.differing_pixels}/${pixelComparison.total_pixels} pixels differ (${(differenceRatio * 100).toFixed(4)}%); exact_equal=${pixelComparison.equal}`);
    } catch (error) {
      check("independent browser render", false, error instanceof Error ? error.message.slice(0, 300) : String(error));
    } finally { await browser?.close(); }
  }
}
const evidencePath = candidateEvidencePath;
check("immutable reviewed-candidate receipt exists", !!evidencePath && fs.existsSync(evidencePath));
if (evidencePath && fs.existsSync(evidencePath)) {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  const candidate = evidence.candidate;
  const receipt = evidence.receipt;
  const candidateBytes = { ...candidate, candidate_sha256: undefined, created_at: undefined };
  delete candidateBytes.candidate_sha256;
  delete candidateBytes.created_at;
  const receiptBytes = { ...receipt, receipt_sha256: undefined, created_at: undefined };
  delete receiptBytes.receipt_sha256;
  delete receiptBytes.created_at;
  check("candidate and review receipt hashes authenticate", createHash("sha256").update(JSON.stringify(candidateBytes)).digest("hex") === candidate.candidate_sha256 &&
    createHash("sha256").update(JSON.stringify(receiptBytes)).digest("hex") === receipt.receipt_sha256);
  check("independent QA approved the exact final candidate", candidate.candidate_sha256 === (final?.metadata.candidate as any)?.candidate_sha256 && receipt.review.passed === true);
}
check("every final artifact hash matches backing bytes", artifacts.every((artifact) => {
  if (!artifact.path || !fs.existsSync(artifact.path)) return false;
  return createHash("sha256").update(fs.readFileSync(artifact.path)).digest("hex") === artifact.metadata.sha256;
}));
const summary = {
  schema: "nox-live-generalization-v1", id, status: final?.status, failure,
  approved_spec_hash: assertApprovedSpecBinding(final ?? approved).spec_hash,
  planning, artifacts: artifacts.map((artifact) => ({ id: artifact.id, name: artifact.name, sha256: artifact.metadata.sha256 })),
  model_calls: listModelCalls(id), provider_cost: "UNKNOWN", checks,
  passed: checks.every((entry) => entry.passed), runRoot,
};
fs.writeFileSync(path.join(runRoot, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ id, status: final?.status, failure, planning, checks, passed: summary.passed, runRoot }, null, 2));
if (!summary.passed) process.exitCode = 1;
