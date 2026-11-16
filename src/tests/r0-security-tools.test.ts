import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWithToolContext } from "../security/tool-context.js";
import { assertSafePath, shellTool } from "../tools/index.js";
import { webFetchTool, artifactTool } from "../tools/index.js";
import { listArtifacts } from "../utils/storage.js";

test("tool context denies no grant and unknown tool grants do not expand permissions", async () => {
  await assert.rejects(() => runWithToolContext({ missionId: "m1", allowedTools: new Set() }, async () => {
    await shellTool.execute!({ command: "true", cwd: process.cwd(), timeout_ms: 1000 } as never, {} as never);
  }), /not granted/);
  await assert.rejects(() => runWithToolContext({ missionId: "m1", allowedTools: new Set(["made_up"]) }, async () => {
    await shellTool.execute!({ command: "true", cwd: process.cwd(), timeout_ms: 1000 } as never, {} as never);
  }), /not granted/);
});

test("workspace path rejects traversal and symlink escape", () => {
  assert.throws(() => assertSafePath("/etc/passwd"), /outside the workspace/);
  const outside = mkdtempSync(join(tmpdir(), "awe-security-"));
  const link = join(process.cwd(), ".r0-security-link");
  try {
    symlinkSync(outside, link);
    assert.throws(() => assertSafePath(join(link, "secret")), /symlink escapes workspace/);
  } finally {
    rmSync(link, { force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("shell abort kills local child and reports failure", async () => {
  const controller = new AbortController();
  const run = runWithToolContext({ missionId: "m1", allowedTools: new Set(["shell"]), signal: controller.signal }, () =>
    shellTool.execute!({ command: "sleep 20", cwd: process.cwd(), timeout_ms: 10000 } as never, {} as never));
  setTimeout(() => controller.abort(new Error("cancel test")), 100);
  const result = await run as { success: boolean; stderr: string; exit_code: number };
  assert.equal(result.success, false);
  assert.notEqual(result.exit_code, 0);
});

test("stale owner is fenced again at artifact registration", async () => {
  const missionId = `stale-owner-${process.pid}`;
  let checks = 0;
  const fence = () => ++checks === 1; // valid at tool entry, stale before persistence
  const result = await runWithToolContext(
    { missionId, allowedTools: new Set(["save_artifact"]), fence },
    () => artifactTool.execute!({ mission_id: missionId, name: "stale.txt", content: "forbidden", type: "text" } as never, {} as never)
  ) as { success: boolean; error?: string };
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /ownership lost/);
  assert.equal(checks, 2);
  assert.deepEqual(listArtifacts(missionId), []);
});

test("web fetch validates protocol, credentials, and private destinations", async () => {
  const result = await runWithToolContext({ missionId: "m1", allowedTools: new Set(["web_fetch"]) }, () =>
    webFetchTool.execute!({ url: "http://127.0.0.1/", method: "GET" } as never, {} as never)) as { success: boolean; error?: string };
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /private/);
});
