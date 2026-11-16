/**
 * P0 artifact identity/revision regression tests.
 * Runs against temporary state and never touches real mission artifacts.
 * Run: npx tsx src/tests/artifact-identity.test.ts
 */

import { strict as assert } from "node:assert";
import { test, after } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { registerHooks } from "node:module";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "awe-artifact-identity-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
after(() => fs.rmSync(root, { recursive: true, force: true }));

// The storage/tools tests do not need browser discovery; keep imports offline.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../config/mcp.js" && context.parentURL?.includes("/tools/browser.")) {
      return { url: "artifact-identity:mcp", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "artifact-identity:mcp") return {
      format: "module", shortCircuit: true,
      source: "export const isPlaywrightAvailable = async () => false; export const getPlaywrightTools = async () => ({});",
    };
    return next(url, context);
  },
});
after(() => hooks.deregister());

const originalCwd = process.cwd();
process.chdir(root);
after(() => process.chdir(originalCwd));

const storage = await import("../utils/storage.js");
const { fileWriteTool } = await import("../tools/index.js");
const { runWithToolContext } = await import("../security/tool-context.js");

function metadataPath(id: string): string {
  return path.join(process.env.AWE_DATA_DIR!, "artifacts", `${id}.json`);
}

test("nested paths are independent and same-millisecond writes select the latest revision", () => {
  const missionId = "nested-revisions";
  const realDate = globalThis.Date;
  const fixed = "2026-01-01T00:00:00.000Z";
  class FixedDate extends realDate {
    constructor(...args: any[]) { super(...(args.length ? args : [fixed]) as []); }
    static now() { return new realDate(fixed).getTime(); }
  }
  globalThis.Date = FixedDate as DateConstructor;
  try {
    const first = storage.saveArtifactFile(missionId, "a/result.txt", "A1");
    const other = storage.saveArtifactFile(missionId, "b/result.txt", "B1");
    const second = storage.saveArtifactFile(missionId, "a/result.txt", "A2");

    assert.equal(first.name, "a/result.txt");
    assert.equal(first.metadata.revision, 1);
    assert.equal(other.metadata.revision, 1);
    assert.equal(second.metadata.revision, 2);
    assert.equal(second.created_at, first.created_at);
    assert.notEqual(second.id, first.id);

    const artifacts = storage.listArtifacts(missionId);
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts.find((a) => a.name === "a/result.txt")!.id, second.id);
    assert.equal(artifacts.find((a) => a.name === "a/result.txt")!.content, "A2");
    assert.equal(artifacts.find((a) => a.name === "b/result.txt")!.id, other.id);

    const raw = JSON.parse(fs.readFileSync(metadataPath(first.id), "utf8"));
    raw.created_at = "2099-01-01T00:00:00.000Z";
    fs.writeFileSync(metadataPath(first.id), JSON.stringify(raw));
    assert.equal(storage.listArtifacts(missionId).find((a) => a.name === "a/result.txt")!.id, second.id,
      "a forged future timestamp cannot supersede a higher revision");
  } finally {
    globalThis.Date = realDate;
  }
});

test("saveArtifactFile canonicalizes names without weakening traversal fences", () => {
  const missionId = "canonical-names";
  const first = storage.saveArtifactFile(missionId, "nested/../nested/result.txt", "one");
  assert.equal(first.name, "nested/result.txt");
  const second = storage.saveArtifactFile(missionId, "nested\\result.txt", "two");
  assert.equal(second.metadata.revision, 2);
  assert.equal(storage.listArtifacts(missionId).length, 1);
  assert.equal(storage.listArtifacts(missionId)[0].id, second.id);
  assert.throws(() => storage.saveArtifactFile(missionId, "../escaped.txt", "no"), /escapes/);
  assert.throws(() => storage.saveArtifactFile(missionId, "..\\escaped.txt", "no"), /escapes/);
  assert.throws(() => storage.saveArtifactFile(missionId, "/absolute.txt", "no"), /escapes/);
  assert.equal(fs.existsSync(path.join(root, "escaped.txt")), false);
});

test("legacy records keep basename dedup and new writes do not rewrite them", () => {
  const missionId = "legacy-artifacts";
  const older = {
    id: "legacy-older", mission_id: missionId, type: "text", name: "old/result.txt",
    content: "old", created_at: "2020-01-01T00:00:00.000Z", metadata: {},
  };
  const newer = {
    id: "legacy-newer", mission_id: missionId, type: "text", name: "result.txt",
    content: "legacy latest", created_at: "2099-01-01T00:00:00.000Z", metadata: {},
  };
  fs.mkdirSync(path.dirname(metadataPath(older.id)), { recursive: true });
  fs.writeFileSync(metadataPath(older.id), JSON.stringify(older));
  fs.writeFileSync(metadataPath(newer.id), JSON.stringify(newer));
  assert.equal(storage.listArtifacts(missionId).length, 1);
  assert.equal(storage.listArtifacts(missionId)[0].id, newer.id);

  const registered = storage.saveArtifactFile(missionId, "new/result.txt", "revisioned latest");
  assert.equal(registered.metadata.revision, 1);
  const visible = storage.listArtifacts(missionId);
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, registered.id);
  assert.equal(JSON.parse(fs.readFileSync(metadataPath(newer.id), "utf8")).metadata.revision, undefined,
    "legacy metadata remains unchanged");
});

test("reconciliation assigns revisions and creates no root or nested duplicates", () => {
  const missionId = "reconciled-revisions";
  const first = storage.saveArtifactFile(missionId, "a/result.txt", "A1");
  const second = storage.saveArtifactFile(missionId, "a/result.txt", "A2");
  fs.mkdirSync(storage.missionArtifactDir(missionId), { recursive: true });
  fs.writeFileSync(path.join(storage.missionArtifactDir(missionId), "result.txt"), "root");
  const added = storage.reconcileArtifactFiles(missionId);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, "result.txt");
  assert.equal(added[0].metadata.revision, 1);
  assert.equal(storage.reconcileArtifactFiles(missionId).length, 0);
  assert.deepEqual(storage.listArtifacts(missionId).map((a) => a.name).sort(), ["a/result.txt", "result.txt"]);
  assert.equal(storage.listArtifacts(missionId).find((a) => a.name === "a/result.txt")!.id, second.id);
  assert.ok(first.id !== second.id);
});

test("reconciliation supersedes changed same-path bytes without mutating audit history", () => {
  const missionId = "reconciled-changed-bytes";
  const first = storage.saveArtifactFile(missionId, "nested/dashboard.png", "one");
  const originalRecord = fs.readFileSync(metadataPath(first.id), "utf8");
  // Keep the size identical: content hashing, not mtime or size, selects the revision.
  fs.writeFileSync(first.path!, "two");
  assert.equal(storage.reconcileArtifactFiles(missionId).length, 0,
    "passive reconciliation must not promote changed checkpoint/candidate bytes");
  const revised = storage.reconcileArtifactFiles(missionId, { reviseChanged: true });
  assert.equal(revised.length, 1);
  assert.equal(revised[0].name, "nested/dashboard.png");
  assert.equal(revised[0].metadata.revision, 2);
  assert.equal(revised[0].metadata.previous_artifact_id, first.id);
  assert.notEqual(revised[0].metadata.sha256, first.metadata.sha256);
  assert.equal(fs.readFileSync(metadataPath(first.id), "utf8"), originalRecord);
  assert.equal(storage.listArtifacts(missionId).length, 1);
  assert.equal(storage.listArtifacts(missionId)[0].id, revised[0].id);
  assert.equal(storage.reconcileArtifactFiles(missionId).length, 0);
});

test("file_write registers the mission-relative nested path", async () => {
  const missionId = "file-write-nested";
  const grant = storage.prepareMissionWorkspace(missionId);
  const target = path.join(grant, "reports", "final", "result.txt");
  const result: any = await runWithToolContext({
    missionId, workspaceRoot: grant, allowedTools: new Set(["file_write"]), fence: () => true,
  }, () => fileWriteTool.execute!({ path: target, content: "nested bytes", mission_id: missionId }, {} as never));
  assert.equal(result.success, true, String(result.error));
  const artifacts = storage.listArtifacts(missionId);
  assert.equal(artifacts.length, 1);
  assert.equal(artifacts[0].name, "reports/final/result.txt");
  assert.equal(artifacts[0].metadata.revision, 1);
  assert.equal(artifacts[0].path, target);
});
