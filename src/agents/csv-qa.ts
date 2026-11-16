import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { Mission } from "../types/index.js";
import { assertApprovedSpecBinding } from "../utils/spec-binding.js";
import { listArtifacts, missionArtifactDir } from "../utils/storage.js";
import { verifyCsvAnalytics } from "../capabilities/csv-verifier.js";
import { renderCsvAnalyticsReport, type CsvAnalyticsResult } from "../capabilities/csv-analytics.js";

function snapshot(file: string, root: string, maxBytes: number): Buffer {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const actual = fs.realpathSync(`/proc/self/fd/${fd}`);
    if (!actual.startsWith(root + path.sep)) throw new Error("QA descriptor escaped mission workspace");
    const before = fs.fstatSync(fd, { bigint: true });
    if (!before.isFile() || before.size > BigInt(maxBytes)) throw new Error("QA file exceeds snapshot bound");
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      if (!count) throw new Error("QA input changed while snapshotting");
      offset += count;
    }
    const after = fs.fstatSync(fd, { bigint: true });
    if (before.size !== after.size || before.ctimeNs !== after.ctimeNs || before.mtimeNs !== after.mtimeNs) {
      throw new Error("QA input changed while snapshotting");
    }
    return bytes;
  } finally { fs.closeSync(fd); }
}

/** Host QA reopens the owner-bound raw input. Solver receipts are never authority. */
export function csvEvidenceDefects(mission: Mission): string[] {
  if (!mission.metadata.approved_spec_binding) return [];
  const spec = assertApprovedSpecBinding(mission).snapshot.specification;
  if (!spec.suggested_tools.includes("csv_analytics")) return [];
  try {
    if (!spec.csv_limits || !spec.csv_input) throw new Error("CSV QA requires approved limits and input digest");
    const root = fs.realpathSync(missionArtifactDir(mission.id));
    const input = fs.realpathSync(spec.csv_input.path);
    if (!input.startsWith(root + path.sep)) throw new Error("CSV QA input outside mission workspace");
    const bytes = snapshot(input, root, spec.csv_limits.maxBytes);
    if (createHash("sha256").update(bytes).digest("hex") !== spec.csv_input.sha256) throw new Error("Approved CSV input changed");
    let verified = 0;
    for (const artifact of listArtifacts(mission.id)) {
      if (!artifact.path || path.extname(artifact.path) !== ".json") continue;
      const target = fs.realpathSync(artifact.path);
      if (!target.startsWith(root + path.sep)) throw new Error("CSV QA artifact outside bounds");
      const contents = snapshot(target, root, 2_000_000);
      if (artifact.metadata.sha256 !== createHash("sha256").update(contents).digest("hex")) throw new Error("CSV artifact bytes differ from saved identity");
      let bundle;
      try { bundle = JSON.parse(contents.toString("utf8")); } catch { continue; }
      if (bundle.schema !== "r1-csv-evidence-v1") continue;
      const receipt = verifyCsvAnalytics(bytes, bundle.result_json, spec.csv_limits);
      if (receipt.outcome !== "MATCH") throw new Error("Independent CSV recomputation disagrees with saved output");
      if (JSON.parse(bundle.result_json).status !== "PASS_DATA") throw new Error("CSV input blocked; mission result is not verified analytics");
      // Independently checked numbers must also be the numbers shown to the
      // owner. A correct hidden JSON object cannot certify altered report prose.
      if (bundle.report !== renderCsvAnalyticsReport(JSON.parse(bundle.result_json) as CsvAnalyticsResult)) {
        throw new Error("CSV report differs from independently verified metrics");
      }
      verified++;
    }
    if (!verified) throw new Error("No independently verified CSV result artifact");
    return [];
  } catch (error) { return [String(error)]; }
}
