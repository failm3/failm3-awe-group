/**
 * E1-RECOVERY-CONTINUE-02 — nested artifact reconciliation regression test.
 * Runs against a temporary DATA_DIR and never touches real mission artifacts.
 * Run: npx tsx src/tests/artifact-reconciliation.test.ts
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const originalCwd = process.cwd();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "awe-artifacts-"));
process.env.AWE_DATA_DIR = path.join(dir, ".awe-data");
const missionId = "nested-artifact-test";
const missionDir = path.join(dir, ".awe-data/artifacts", missionId);
fs.mkdirSync(path.join(missionDir, "nivict-landing/screenshots"), { recursive: true });
fs.mkdirSync(path.join(missionDir, "nivict-landing/tools"), { recursive: true });
fs.writeFileSync(path.join(missionDir, "root.md"), "root");
fs.writeFileSync(path.join(missionDir, "nivict-landing/index.html"), "<!doctype html><title>Агенты</title>");
fs.writeFileSync(path.join(missionDir, "nivict-landing/styles.css"), ":root { --bg: #060d1a; }");
fs.writeFileSync(path.join(missionDir, "nivict-landing/tools/verify.cjs"), "// verification");
fs.writeFileSync(path.join(missionDir, "nivict-landing/screenshots/desktop-1280x720.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
fs.writeFileSync(path.join(missionDir, "nivict-landing/tmp.tmp"), "ignore");
// A verification agent's scratch file, rewritten in place, as in run 1794824124951.
fs.mkdirSync(path.join(missionDir, "nivict-landing/verify"), { recursive: true });
fs.writeFileSync(path.join(missionDir, "nivict-landing/verify/.tmp_before.txt"), "snapshot before");

try {
  process.chdir(dir);
  // DATA_DIR is computed at module load, so import only after entering temp cwd.
  const storage = await import("../utils/storage.js");
  const first = storage.reconcileArtifactFiles(missionId);
  const names = first.map((a) => a.name).sort();
  check("root file is registered", names.includes("root.md"));
  check("nested HTML is registered with its relative path", names.includes("nivict-landing/index.html"));
  check("nested CSS is registered", names.includes("nivict-landing/styles.css"));
  check("nested verification tool is registered", names.includes("nivict-landing/tools/verify.cjs"));
  check("nested screenshot is registered", names.includes("nivict-landing/screenshots/desktop-1280x720.png"));
  check("screenshot type is image", first.find((a) => a.name.endsWith(".png"))?.type === "image");
  check("temporary files are ignored", !names.some((name) => name.endsWith(".tmp")));
  // Run 1794824124951 adopted verify/.tmp_before.txt, the analyst rewrote it, and
  // the integrity gate then failed the mission with four critical blockers even
  // though the reviewer passed. Scratch files must never become deliverables.
  check("hidden scratch files are ignored", !names.some((name) => name.includes(".tmp_before")));
  check("all five real files were found", first.length === 5, JSON.stringify(names));

  const second = storage.reconcileArtifactFiles(missionId);
  check("second reconciliation is idempotent", second.length === 0, JSON.stringify(second.map((a) => a.name)));
  check("artifact registry contains no duplicates", storage.listArtifacts(missionId).length === 5);
} finally {
  process.chdir(originalCwd);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\npassed: ${passed}, failed: ${failed}`);
if (failed) process.exit(1);
console.log("Nested artifact reconciliation regression test passed.");
