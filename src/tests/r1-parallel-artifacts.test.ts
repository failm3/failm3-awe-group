#!/usr/bin/env npx tsx
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

test("parallel shell producers register and retain only their own artifacts", async () => {
  const fixture = fs.mkdtempSync(path.join(process.cwd(), ".r1-parallel-artifacts-"));
  const previousData = process.env.AWE_DATA_DIR;
  process.env.AWE_DATA_DIR = path.join(fixture, "state");
  try {
    const { prepareMissionWorkspace, listArtifacts } = await import("../utils/storage.js");
    const { shellTool } = await import("../tools/index.js");
    const { runWithToolContext } = await import("../security/tool-context.js");
    const missionId = "parallel-shell-attribution";
    const workspace = prepareMissionWorkspace(missionId);
    const firstIds = new Set<string>();
    const secondIds = new Set<string>();
    const run = (artifactIds: Set<string>, command: string) => runWithToolContext({
      missionId, workspaceRoot: workspace, allowedTools: new Set(["shell"]), artifactIds,
    }, () => shellTool.execute!({ command, cwd: workspace, timeout_ms: 10_000 } as never, {} as never) as Promise<{ success: boolean; stderr: string }>);

    // Both providers are active concurrently and overlap their shell work.
    // The shell/registration critical sections must still attribute disjointly.
    const [first, second] = await Promise.all([
      run(firstIds, "sleep 0.2; printf first > first.txt"),
      run(secondIds, "printf second > second.txt; sleep 0.2"),
    ]);
    assert.equal(first.success, true, first.stderr);
    assert.equal(second.success, true, second.stderr);
    const artifacts = listArtifacts(missionId);
    const namesFor = (ids: Set<string>) => artifacts.filter((artifact) => ids.has(artifact.id)).map((artifact) => artifact.name).sort();
    assert.deepEqual(namesFor(firstIds), ["first.txt"]);
    assert.deepEqual(namesFor(secondIds), ["second.txt"]);
    assert.equal(firstIds.size, 1);
    assert.equal(secondIds.size, 1);
    assert.deepEqual([...firstIds].some((id) => secondIds.has(id)), false);
    assert.equal(fs.readFileSync(path.join(workspace, "first.txt"), "utf8"), "first");
    assert.equal(fs.readFileSync(path.join(workspace, "second.txt"), "utf8"), "second");
  } finally {
    if (previousData === undefined) delete process.env.AWE_DATA_DIR;
    else process.env.AWE_DATA_DIR = previousData;
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
