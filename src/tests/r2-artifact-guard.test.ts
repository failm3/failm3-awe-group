/**
 * D4 — deleting a registered artifact is refused before it runs.
 *
 * Run 1794828929614 registered `probe/repair/tool-probe-before.txt` through
 * reconciliation at 12:02:00 and the same delegation removed it seconds later.
 * The terminal integrity gate then failed "all final artifact hashes match
 * bytes" for a file the agent had treated as scratch. The gate stays the
 * authority; this guard stops the ordinary mistake early and says what to do.
 *
 * Run: node scripts/run-offline-tests.mjs src/tests/r2-artifact-guard.test.ts
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { deletedRegisteredArtifacts } from "../security/artifact-guard.js";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "awe-guard-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
const workspace = path.join(root, "workspace");
fs.mkdirSync(workspace, { recursive: true });

const missionId = "guard-mission";
const storage = await import("../utils/storage.js");
const scratch = storage.prepareMissionWorkspace(missionId);
const pinned = storage.saveArtifactFile(missionId, "probe/repair/tool-probe-before.txt", "snapshot before");
const other = storage.saveArtifactFile(missionId, "digest.json", '{"rows":3}');
const registry = storage.listArtifacts(missionId);

try {
  const direct = deletedRegisteredArtifacts(`rm ${pinned.path}`, workspace, registry);
  check("direct rm of a registered file is detected", direct.includes(pinned.name), JSON.stringify(direct));

  const relative = deletedRegisteredArtifacts("cd . && rm -f probe/repair/tool-probe-before.txt", scratch, registry);
  check("relative path after cd is resolved against that directory", relative.includes(pinned.name), JSON.stringify(relative));

  const byDirectory = deletedRegisteredArtifacts("rm -rf probe/repair", scratch, registry);
  check("deleting the containing directory is detected", byDirectory.includes(pinned.name), JSON.stringify(byDirectory));

  const wholeTree = deletedRegisteredArtifacts(`rm -rf ${scratch}`, workspace, registry);
  check("deleting the whole workspace is detected for every artifact", wholeTree.length === registry.length, JSON.stringify(wholeTree));

  const unlink = deletedRegisteredArtifacts(`unlink '${other.path}'`, workspace, registry);
  check("quoted unlink target is detected", unlink.includes(other.name), JSON.stringify(unlink));

  const moved = deletedRegisteredArtifacts(`mv ${pinned.path} /tmp/moved.txt`, workspace, registry);
  check("moving a registered file away is detected", moved.includes(pinned.name), JSON.stringify(moved));

  // Ordinary work must stay possible.
  check("reading a registered file is allowed", deletedRegisteredArtifacts(`cat ${pinned.path}`, workspace, registry).length === 0);
  check("writing a missing scratch file is allowed", deletedRegisteredArtifacts("echo hi > scratch.txt", workspace, registry).length === 0);
  check("deleting an unregistered file is allowed", deletedRegisteredArtifacts("rm scratch.txt", workspace, registry).length === 0);
  check("deleting the destination of a move is allowed", deletedRegisteredArtifacts(`mv scratch.txt ${pinned.path}`, workspace, registry).length === 0);
  check("a command naming no path is allowed", deletedRegisteredArtifacts("ls -la", workspace, registry).length === 0);
  check("a similar name with a different tail is not matched", deletedRegisteredArtifacts(`rm ${pinned.path}.bak`, workspace, registry).length === 0);

  // The tool itself refuses before any process starts, and the refusal is
  // actionable rather than a bare denial. The tool's cwd must stay inside the
  // granted workspace root, so the call runs from the project root and names the
  // registered artifact by its absolute path.
  const tools = await import("../tools/index.js");
  const { runWithToolContext } = await import("../security/tool-context.js");
  const projectRoot = process.cwd();
  const executeShell = tools.shellTool.execute as (input: unknown, context: unknown) => Promise<{ success: boolean; stdout: string; stderr: string; exit_code: number }>;
  const call = (command: string) => runWithToolContext(
    { missionId, allowedTools: new Set(["shell"]), workspaceRoot: projectRoot } as any,
    () => executeShell({ command, cwd: projectRoot, timeout_ms: 5000 }, {})
  );
  const pinnedPath = pinned.path!;
  const denied = await call(`rm ${pinnedPath}`);
  check("shell refuses to delete a registered artifact", denied.success === false && denied.exit_code === 2, JSON.stringify(denied).slice(0, 160));
  check("the refusal names the artifact and the alternative", /registered artifact\(s\) cannot be deleted: probe\/repair\/tool-probe-before\.txt/.test(denied.stderr) && /save_artifact/.test(denied.stderr), denied.stderr);
  check("the file is untouched", fs.existsSync(pinnedPath));
  const allowed = await call("ls -a");
  check("an ordinary command still runs", allowed.success === true || allowed.exit_code !== 2, JSON.stringify(allowed).slice(0, 160));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log(`\npassed: ${passed}, failed: ${failed}`);
if (failed) process.exit(1);
console.log("Registered-artifact deletion guard passed.");
