import { strict as assert } from "node:assert";
import { test, after } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import https from "node:https";
import { EventEmitter } from "node:events";
import { registerHooks, syncBuiltinESMExports } from "node:module";
import { spawnSync } from "node:child_process";
import { runWithToolContext, type ToolContext } from "../security/tool-context.js";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// All files, including the workspace-confined file_write target, are disposable.
const root = fs.mkdtempSync(path.join(process.cwd(), ".r0-final-tools-test-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
after(() => fs.rmSync(root, { recursive: true, force: true }));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

// Replace ONLY the discovery dependency. The exported browser tool and Mastra
// createTool wrappers run unchanged; no availability commands or MCP spawn.
const discoveryStarted = deferred();
const discoveryRelease = deferred<Record<string, unknown>>();
const discovery = {
  isPlaywrightAvailable: async () => true,
  getPlaywrightTools: async () => {
    discoveryStarted.resolve();
    return discoveryRelease.promise;
  },
};
(globalThis as any).__r0FinalMCP = discovery;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "../config/mcp.js" && context.parentURL?.includes("/tools/browser.")) {
      return { url: "r0-final:mcp", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "r0-final:mcp") return {
      format: "module", shortCircuit: true,
      source: "export const isPlaywrightAvailable = (...a) => globalThis.__r0FinalMCP.isPlaywrightAvailable(...a); export const getPlaywrightTools = (...a) => globalThis.__r0FinalMCP.getPlaywrightTools(...a);",
    };
    return next(url, context);
  },
});
after(() => { hooks.deregister(); delete (globalThis as any).__r0FinalMCP; });
const { fileWriteTool, webSearchTool } = await import("../tools/index.js");
const { browserNavigateTool, browserClickTool } = await import("../tools/browser.js");
const storage = await import("../utils/storage.js");

const context = (tool: string, extra: Partial<ToolContext> = {}): ToolContext => ({
  missionId: "final-tools-mission", allowedTools: new Set([tool]), ...extra,
});
const execute = (tool: { execute?: any }, input: unknown, ctx: ToolContext): Promise<any> =>
  runWithToolContext(ctx, () => tool.execute(input, {}));

test("D1: second fence check is under the mission lock, before raw mkdir/write, with or without mission_id", async () => {
  for (const register of [false, true]) {
    let checks = 0;
    const missionId = `fenced-file-${register}`;
    const target = path.join(root, `must-not-create-${register}`, "nested", "out.txt");
    const result = await execute(fileWriteTool, {
      path: target, content: "forbidden bytes", ...(register ? { mission_id: missionId } : {}),
    }, context("file_write", {
      missionId,
      fence: () => {
        checks++;
        if (checks === 2) assert.ok(fs.existsSync(storage.missionLockPath(missionId)), "final boundary check holds mission lock after the durable marker");
        return checks === 1;
      },
    }));
    assert.equal(result.success, false);
    assert.match(result.error, /ownership lost/);
    assert.equal(checks, 2);
    assert.equal(fs.existsSync(target), false, "no raw file/bytes left behind");
    assert.equal(fs.existsSync(path.join(root, `must-not-create-${register}`)), false, "no requested directories created");
    assert.equal(fs.existsSync(storage.missionArtifactDir(missionId)), false);
    assert.deepEqual(storage.listArtifacts(missionId), []);
  }
});

test("D1: stale write cannot overwrite existing bytes; normal writes retain opt-in artifact semantics", async () => {
  const target = path.join(root, "existing.txt");
  fs.writeFileSync(target, "original");
  let checks = 0;
  await execute(fileWriteTool, { path: target, content: "overwrite" }, context("file_write", { fence: () => ++checks === 1 }));
  assert.equal(fs.readFileSync(target, "utf8"), "original");
  const plain = await execute(fileWriteTool, { path: target, content: "plain" }, context("file_write"));
  assert.equal(plain.success, true);
  assert.equal(plain.artifact_id, undefined);
  assert.deepEqual(storage.listArtifacts("final-tools-mission"), []);
  const ids = new Set<string>();
  const registered = await execute(fileWriteTool, {
    path: target, content: "registered", mission_id: "final-tools-mission",
  }, context("file_write", { fence: () => true, artifactIds: ids }));
  assert.equal(registered.success, true);
  assert.ok(ids.has(registered.artifact_id));
  assert.equal(fs.readFileSync(target, "utf8"), "registered");
  const artifacts = storage.listArtifacts("final-tools-mission");
  assert.equal(artifacts.length, 1);
  assert.equal(fs.readFileSync(artifacts[0].path!, "utf8"), "registered");
  const cross = path.join(root, "cross-mission", "out.txt");
  assert.equal((await execute(fileWriteTool, { path: cross, content: "no", mission_id: "other" }, context("file_write"))).success, false);
  assert.equal(fs.existsSync(path.dirname(cross)), false);
});

test("D1: locked boundary also refuses abort/seal before raw file creation", async () => {
  for (const kind of ["abort", "seal"]) {
    const controller = new AbortController();
    const missionId = `boundary-${kind}`;
    const target = path.join(root, kind, "out.txt");
    // Flip after entry guard at the path validation boundary.
    const original = fs.realpathSync.native;
    fs.realpathSync.native = ((...args: Parameters<typeof original>) => {
      if (kind === "abort") controller.abort(new Error("boundary abort"));
      else storage.sealMission(missionId, "boundary seal");
      return original(...args as [any]);
    }) as typeof original;
    try {
      const result = await execute(fileWriteTool, { path: target, content: "no" }, context("file_write", { missionId, signal: controller.signal }));
      assert.equal(result.success, false);
      assert.equal(fs.existsSync(path.dirname(target)), false);
    } finally { fs.realpathSync.native = original; }
  }
});

test("D2/D6: actual browser wrappers recheck cold-discovery fence and propagate abortSignal to held MCP operation", async () => {
  let calls = 0, effects = 0, sawAbort = false;
  let owner = true;
  let started = deferred();
  let release = deferred();
  let seenSignal: AbortSignal | undefined;
  const raw = createTool({
    id: "held_browser", description: "offline MCP operation",
    inputSchema: z.unknown(),
    execute: async (_input, options) => {
      calls++;
      seenSignal = options?.abortSignal;
      return new Promise<unknown>((resolve, reject) => {
        const abort = () => { sawAbort = true; reject(seenSignal?.reason); };
        seenSignal?.addEventListener("abort", abort, { once: true });
        started.resolve();
        release.promise.then(() => {
          seenSignal?.removeEventListener("abort", abort);
          // This models the supported MCP request cancellation boundary:
          // a cancelled held operation must not perform its delayed effect.
          if (sawAbort || seenSignal?.aborted) return;
          effects++;
          resolve({ url: "https://example.test/" });
        });
      });
    },
  });
  const cold = execute(browserNavigateTool, { url: "https://example.test/" }, context("browser_navigate", { fence: () => owner }));
  await discoveryStarted.promise;
  owner = false;
  discoveryRelease.resolve({ playwright_browser_navigate: raw, playwright_browser_click: raw });
  const refused = await cold;
  assert.equal(refused.success, false);
  assert.match(refused.error, /ownership lost/);
  assert.equal(calls, 0, "zero raw MCP invocation after ownership loss during discovery");
  assert.equal(effects, 0);

  for (const action of ["click", "navigate"]) {
    started = deferred(); release = deferred(); sawAbort = false;
    const controller = new AbortController();
    const held = action === "click"
      ? execute(browserClickTool, { selector: "#submit" }, context("browser_click", { signal: controller.signal }))
      : execute(browserNavigateTool, { url: "https://example.test/" }, context("browser_navigate", { signal: controller.signal }));
    await started.promise;
    assert.equal(seenSignal, controller.signal, "Mastra's supported execution context receives exact signal");
    controller.abort(new Error(`cancel held ${action}`));
    assert.equal(sawAbort, true, "underlying MCP operation actually received cancellation");
    const cancelled = await held;
    assert.equal(cancelled.success, false);
    release.resolve();
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(effects, 0, `no delayed ${action} after abort and release`);
  }
  assert.equal(calls, 2);
});

type FakeRequest = EventEmitter & { destroy: (error?: Error) => void; write: () => void; end: () => void; setTimeout: () => void };
function offlineHTTPS(t: any) {
  const requests: Array<{ options: any; req: FakeRequest; destroyed: boolean; respond: (json: unknown, status?: number) => void }> = [];
  t.mock.method(https, "request", (options: any, callback: (res: any) => void) => {
    const req = new EventEmitter() as FakeRequest;
    const record = {
      options, req, destroyed: false,
      // Deliberately allow late callbacks even after destroy to test refusal.
      respond(json: unknown, status = 200) {
        const res = Object.assign(new EventEmitter(), { statusCode: status });
        callback(res);
        res.emit("data", JSON.stringify(json));
        res.emit("end");
      },
    };
    req.destroy = () => { record.destroyed = true; }; // no error event: cancellation must still settle promptly
    req.write = () => {};
    req.end = () => {};
    req.setTimeout = () => {};
    requests.push(record);
    return req;
  });
  syncBuiltinESMExports();
  const oldKey = process.env.TAVILY_API_KEY;
  t.after(() => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    if (oldKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = oldKey;
  });
  return requests;
}
const search = (signal: AbortSignal) => execute(webSearchTool, { query: "offline", max_results: 3, search_depth: "basic" }, context("web_search", { signal }));
async function promptRejection(run: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      assert.rejects(run, /cancel/),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("abort did not settle promptly")), 300); }),
    ]);
  } finally { clearTimeout(timer); }
}

for (const provider of ["tavily", "ddg"]) {
  test(`D5: ${provider} in-flight abort destroys request, settles promptly, refuses delayed success and constructs no fallback`, async (t) => {
    const requests = offlineHTTPS(t);
    process.env.TAVILY_API_KEY = provider === "tavily" ? "offline-only" : "";
    const controller = new AbortController();
    const run = search(controller.signal);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.signal, controller.signal);
    controller.abort(new Error("cancel search"));
    assert.equal(requests[0].destroyed, true, "actual request destroyed, not just result masked");
    await promptRejection(run);
    requests[0].respond({ results: [{ title: "late", url: "https://example.test", content: "late" }], RelatedTopics: [{ Text: "late", FirstURL: "https://example.test" }] });
    await new Promise<void>((r) => setImmediate(r));
    assert.equal(requests.length, 1, "no request/fallback constructed after abort");
  });
}

test("D5: failed Tavily arriving after abort never starts DDG", async (t) => {
  const requests = offlineHTTPS(t);
  process.env.TAVILY_API_KEY = "offline-only";
  const controller = new AbortController();
  const run = search(controller.signal);
  controller.abort(new Error("cancel Tavily"));
  requests[0].respond({ error: "failed" }, 500);
  await promptRejection(run);
  assert.equal(requests[0].destroyed, true);
  assert.equal(requests.length, 1);
});

test("D5: cancellation also destroys an in-flight DDG fallback after a normal Tavily failure", async (t) => {
  const requests = offlineHTTPS(t);
  process.env.TAVILY_API_KEY = "offline-only";
  const controller = new AbortController();
  const run = search(controller.signal);
  requests[0].respond({ error: "failed" }, 500);
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(requests.length, 2);
  controller.abort(new Error("cancel fallback"));
  assert.equal(requests[1].destroyed, true);
  await promptRejection(run);
  requests[1].respond({ RelatedTopics: [{ Text: "late", FirstURL: "https://example.test" }] });
  assert.equal(requests.length, 2);
});

test("D5: abort after response end but before awaited continuation refuses success and fallback", async (t) => {
  const requests = offlineHTTPS(t);
  for (const provider of ["empty-tavily", "tavily", "ddg"]) {
    process.env.TAVILY_API_KEY = provider === "ddg" ? "" : "offline-only";
    const controller = new AbortController();
    const count = requests.length;
    const run = search(controller.signal);
    requests[count].respond(provider === "empty-tavily" ? { results: [] } : {
      results: [{ title: "success", url: "https://example.test", content: "success" }],
      RelatedTopics: [{ Text: "success", FirstURL: "https://example.test" }],
    });
    controller.abort(new Error("cancel continuation"));
    await promptRejection(run);
    assert.equal(requests.length, count + 1);
  }
});

test("D5: already aborted search constructs no HTTPS request", async (t) => {
  const requests = offlineHTTPS(t);
  const controller = new AbortController();
  controller.abort(new Error("cancel before entry"));
  await promptRejection(search(controller.signal));
  assert.equal(requests.length, 0);
});

test("D5: ordinary Tavily success and DDG fallback remain functional", async (t) => {
  const requests = offlineHTTPS(t);
  process.env.TAVILY_API_KEY = "offline-only";
  const run = search(new AbortController().signal);
  requests[0].respond({ results: [{ title: "result", url: "https://example.test", content: "snippet" }] });
  assert.equal((await run).results[0].snippet, "snippet");
  const fallback = search(new AbortController().signal);
  requests[1].respond({ error: "unavailable" }, 503);
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(requests[2].options.hostname, "api.duckduckgo.com");
  requests[2].respond({ RelatedTopics: [{ Text: "DDG - result", FirstURL: "https://example.test/ddg" }] });
  assert.equal((await fallback).results[0].title, "DDG");
});

test("D4: targeted-repair source follows AWE_DATA_DIR and defaults; importing never starts repair", async () => {
  const before = storage.listMissions();
  const { SOURCE_DIR, runTargetedRepair } = await import("../run-targeted-repair.js");
  assert.equal(SOURCE_DIR, path.join(process.env.AWE_DATA_DIR!, "artifacts", "25be2dad-039c-4cb2-8667-d4184df47363"));
  assert.deepEqual(storage.listMissions(), before);
  const cwd = path.join(root, "default-root");
  fs.mkdirSync(cwd);
  const script = `import { SOURCE_DIR } from ${JSON.stringify(new URL("../run-targeted-repair.ts", import.meta.url).href)}; console.log(SOURCE_DIR);`;
  const env = { ...process.env };
  delete env.AWE_DATA_DIR;
  const child = spawnSync(process.execPath, ["--import", path.join(process.cwd(), "node_modules/tsx/dist/loader.mjs"), "--input-type=module", "--eval", script], { cwd, env, encoding: "utf8", timeout: 30000 });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), path.join(cwd, ".awe-data/artifacts/25be2dad-039c-4cb2-8667-d4184df47363"));
  assert.deepEqual(fs.readdirSync(path.join(cwd, ".awe-data/missions")), [], "no repair mission created on import");
  await assert.rejects(runTargetedRepair(), /Standalone targeted repair is disabled/);
  assert.deepEqual(storage.listMissions(), before, "the disabled alternate runner creates no uncontrolled mission");
});
