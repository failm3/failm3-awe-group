import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { runWithToolContext } from "../security/tool-context.js";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r0-reqa-adapters-test-"));
const isolatedData = path.join(root, "isolated-state");
process.env.AWE_DATA_DIR = isolatedData;
const oldPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
const bundledChrome = path.join(root, "browsers", "chromium-offline", "chrome-linux64", "chrome");
fs.mkdirSync(path.dirname(bundledChrome), { recursive: true });
fs.writeFileSync(bundledChrome, "offline fixture");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, "browsers");
after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  if (oldPlaywrightPath === undefined) delete process.env.PLAYWRIGHT_BROWSERS_PATH;
  else process.env.PLAYWRIGHT_BROWSERS_PATH = oldPlaywrightPath;
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`Timed out waiting for ${label}`);
}

async function promptlyRejects(run: Promise<unknown>, pattern: RegExp): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      assert.rejects(run, pattern),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("abort did not settle promptly")), 500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

type ExecCall = {
  command: string;
  options: { signal?: AbortSignal; timeout?: number };
  succeed: () => void;
};
const execCalls: ExecCall[] = [];
(globalThis as any).__r0ReqaExec = (command: string, options: any, callback: any) => {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? {} : options ?? {};
  execCalls.push({
    command,
    options: opts,
    succeed: () => cb(null, { stdout: "", stderr: "" }),
  });
  return {};
};
const mcpDouble = {
  constructed: 0,
  listCalls: 0,
  disconnects: 0,
  list: () => Promise.resolve({}),
};
(globalThis as any).__r0ReqaMCP = mcpDouble;

const browserDouble: {
  isPlaywrightAvailable: (signal?: AbortSignal) => Promise<boolean>;
  getPlaywrightTools: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
} = {
  isPlaywrightAvailable: async () => true,
  getPlaywrightTools: async () => ({}),
};
(globalThis as any).__r0ReqaBrowserMCP = browserDouble;

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "child_process" && context.parentURL?.includes("/config/mcp.")) {
      return { url: "r0-reqa:child-process", shortCircuit: true };
    }
    if (specifier === "@mastra/mcp" && context.parentURL?.includes("/config/mcp.")) {
      return { url: "r0-reqa:mcp-client", shortCircuit: true };
    }
    if (specifier === "../config/mcp.js" && context.parentURL?.includes("/tools/browser.")) {
      return { url: "r0-reqa:browser-mcp", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "r0-reqa:child-process") return {
      format: "module", shortCircuit: true,
      source: "export * from 'node:child_process'; export const exec = (...args) => globalThis.__r0ReqaExec(...args);",
    };
    if (url === "r0-reqa:mcp-client") return {
      format: "module", shortCircuit: true,
      source: `export class MCPClient {
        constructor(config) { globalThis.__r0ReqaMCP.constructed++; this.config = config; }
        listTools() { globalThis.__r0ReqaMCP.listCalls++; return globalThis.__r0ReqaMCP.list(); }
        async disconnect() { globalThis.__r0ReqaMCP.disconnects++; }
      }`,
    };
    if (url === "r0-reqa:browser-mcp") return {
      format: "module", shortCircuit: true,
      source: "export const isPlaywrightAvailable = (...a) => globalThis.__r0ReqaBrowserMCP.isPlaywrightAvailable(...a); export const getPlaywrightTools = (...a) => globalThis.__r0ReqaBrowserMCP.getPlaywrightTools(...a);",
    };
    return next(url, context);
  },
});
after(() => {
  hooks.deregister();
  delete (globalThis as any).__r0ReqaExec;
  delete (globalThis as any).__r0ReqaMCP;
  delete (globalThis as any).__r0ReqaBrowserMCP;
});

const mcp = await import("../config/mcp.js");
const { shellTool } = await import("../tools/index.js");
const { browserNavigateTool } = await import("../tools/browser.js");

test("D6: real MCP availability/discovery starts no post-abort probe, client, or listTools transition", async () => {
  const duringWhich = new AbortController();
  const whichRun = mcp.isPlaywrightAvailable(duringWhich.signal);
  await waitFor(() => execCalls.length === 1, "which npx");
  assert.equal(execCalls[0].command, "which npx");
  assert.equal(execCalls[0].options.signal, duringWhich.signal);
  duringWhich.abort(new Error("cancel during which"));
  execCalls[0].succeed(); // Deliberately report late success despite cancellation.
  await promptlyRejects(whichRun, /cancel during which/);
  assert.equal(execCalls.length, 1, "version probe must not start after abort");
  assert.equal(mcpDouble.constructed, 0);
  assert.equal(mcpDouble.listCalls, 0);

  const duringVersion = new AbortController();
  const discoveryRun = mcp.getPlaywrightTools(duringVersion.signal);
  await waitFor(() => execCalls.length === 2, "second which npx");
  execCalls[1].succeed();
  await waitFor(() => execCalls.length === 3, "version probe");
  assert.equal(execCalls[2].command, "npx @playwright/mcp --version");
  assert.equal(execCalls[2].options.signal, duringVersion.signal);
  duringVersion.abort(new Error("cancel during version"));
  execCalls[2].succeed();
  await promptlyRejects(discoveryRun, /cancel during version/);
  assert.equal(execCalls.length, 3);
  assert.equal(mcpDouble.constructed, 0, "availability abort cannot construct/start MCP");
  assert.equal(mcpDouble.listCalls, 0);

  // An aborted attempt must not poison availability with a cached false value.
  const availableRun = mcp.isPlaywrightAvailable();
  await waitFor(() => execCalls.length === 4, "successful which npx");
  execCalls[3].succeed();
  await waitFor(() => execCalls.length === 5, "successful version probe");
  execCalls[4].succeed();
  assert.equal(await availableRun, true, "fixture Chromium resolves after successful probes");

  const preAborted = new AbortController();
  preAborted.abort(new Error("cancel before discovery"));
  await promptlyRejects(mcp.getPlaywrightTools(preAborted.signal), /cancel before discovery/);
  assert.equal(mcpDouble.constructed, 0);
  assert.equal(mcpDouble.listCalls, 0);
  assert.equal(execCalls.length, 5, "cached availability also performs no post-abort probe");

  const listStarted = deferred();
  const listRelease = deferred<Record<string, unknown>>();
  mcpDouble.list = () => { listStarted.resolve(); return listRelease.promise; };
  const duringList = new AbortController();
  const heldDiscovery = mcp.getPlaywrightTools(duringList.signal);
  await listStarted.promise;
  assert.equal(mcpDouble.constructed, 1);
  assert.equal(mcpDouble.listCalls, 1);
  let heldDiscoverySettled = false;
  void heldDiscovery.then(
    () => { heldDiscoverySettled = true; },
    () => { heldDiscoverySettled = true; },
  );
  duringList.abort(new Error("cancel active discovery"));
  await waitFor(() => mcpDouble.disconnects === 1, "best-effort MCP disconnect");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(heldDiscoverySettled, false, "abort is not quiesced while original discovery is still active");
  listRelease.resolve({ playwright_browser_navigate: {} });
  await promptlyRejects(heldDiscovery, /cancel active discovery/);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(mcpDouble.listCalls, 1, "late discovery result starts no additional operation");
  assert.equal(execCalls.length, 5);
});

test("D6: production browser wrapper blocks cold availability/discovery transitions after abort and recovers later", async () => {
  const availabilityStarted = deferred();
  const availabilityRelease = deferred<boolean>();
  let discoveries = 0;
  let rawEffects = 0;
  browserDouble.isPlaywrightAvailable = (signal) => {
    assert.ok(signal, "tool signal reaches availability");
    availabilityStarted.resolve();
    return availabilityRelease.promise;
  };
  browserDouble.getPlaywrightTools = async (signal) => {
    discoveries++;
    assert.ok(signal, "tool signal reaches discovery");
    return {};
  };
  const controller = new AbortController();
  const cold = runWithToolContext(
    { missionId: "reqa-browser", allowedTools: new Set(["browser_navigate"]), signal: controller.signal },
    () => browserNavigateTool.execute!({ url: "https://example.test/" } as never, {} as never),
  );
  await availabilityStarted.promise;
  controller.abort(new Error("cancel cold availability"));
  availabilityRelease.resolve(true);
  const refused = await cold as { success: boolean; error?: string };
  assert.equal(refused.success, false);
  assert.match(refused.error ?? "", /cancel cold availability/);
  assert.equal(discoveries, 0, "no MCP discovery begins after availability abort");
  assert.equal(rawEffects, 0);

  const discoveryStarted = deferred();
  const discoveryRelease = deferred<Record<string, unknown>>();
  browserDouble.isPlaywrightAvailable = async () => true;
  browserDouble.getPlaywrightTools = (signal) => {
    assert.ok(signal);
    discoveries++;
    discoveryStarted.resolve();
    return discoveryRelease.promise;
  };
  const duringDiscovery = new AbortController();
  const discoveryRun = runWithToolContext(
    { missionId: "reqa-browser", allowedTools: new Set(["browser_navigate"]), signal: duringDiscovery.signal },
    () => browserNavigateTool.execute!({ url: "https://example.test/" } as never, {} as never),
  );
  await discoveryStarted.promise;
  duringDiscovery.abort(new Error("cancel browser discovery"));
  discoveryRelease.resolve({
    playwright_browser_navigate: { execute: async () => { rawEffects++; return {}; } },
  });
  const discoveryResult = await discoveryRun as { success: boolean; error?: string };
  assert.equal(discoveryResult.success, false);
  assert.match(discoveryResult.error ?? "", /cancel browser discovery/);
  assert.equal(rawEffects, 0, "late discovered action never executes");

  // Rejected cold discovery is not a permanent cached rejection.
  browserDouble.getPlaywrightTools = async () => ({
    playwright_browser_navigate: {
      execute: async (_input: unknown, options: { abortSignal?: AbortSignal }) => {
        assert.ok(options.abortSignal);
        rawEffects++;
        return { url: "https://example.test/" };
      },
    },
  });
  const healthy = await runWithToolContext(
    { missionId: "reqa-browser", allowedTools: new Set(["browser_navigate"]), signal: new AbortController().signal },
    () => browserNavigateTool.execute!({ url: "https://example.test/" } as never, {} as never),
  ) as { success: boolean };
  assert.equal(healthy.success, true);
  assert.equal(rawEffects, 1);
});

test("D4: shell gets absolute state identity without authority to shared memory", async () => {
  const workdir = path.join(root, "shell-workdir");
  fs.mkdirSync(workdir);
  const probe = path.join(workdir, "state-probe.mjs");
  const sentinel = path.join(isolatedData, "supervisor-only.txt");
  fs.writeFileSync(sentinel, "synthetic supervisor state");
  const storageUrl = pathToFileURL(path.join(process.cwd(), "src", "utils", "storage.ts")).href;
  const memoryUrl = pathToFileURL(path.join(process.cwd(), "src", "memory", "index.ts")).href;
  fs.writeFileSync(probe, `
    const storage = await import(${JSON.stringify(storageUrl)});
    let memoryDenied = false;
    try { await import(${JSON.stringify(memoryUrl)}); } catch { memoryDenied = true; }
    console.log(JSON.stringify({
      dataDir: storage.DATA_DIR,
      memoryDenied,
      supervisorVisible: (await import('node:fs')).existsSync(${JSON.stringify(sentinel)}),
      aweDataDir: process.env.AWE_DATA_DIR,
      providerKeyPresent: Boolean(process.env.ROUTER_CHEAP_API_KEY),
    }));
  `);
  const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;
  const loader = path.join(process.cwd(), "node_modules", "tsx", "dist", "loader.mjs");
  const command = [process.execPath, "--import", loader, probe].map(quote).join(" ");
  const result = await runWithToolContext(
    { missionId: "reqa-shell", allowedTools: new Set(["shell"]) },
    () => shellTool.execute!({ command, cwd: workdir, timeout_ms: 30000 } as never, {} as never),
  ) as { success: boolean; stdout: string; stderr: string };
  assert.equal(result.success, true, result.stderr);
  const child = JSON.parse(result.stdout);
  assert.equal(child.dataDir, isolatedData);
  // R1 explicitly removes shared DB authority from untrusted shell. The
  // trusted runtime still owns memory and uses the configured isolated root.
  assert.equal(child.supervisorVisible, false);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "synthetic supervisor state");
  assert.equal(fs.existsSync(path.join(isolatedData, "memory.db")), false);
  assert.equal(child.aweDataDir, isolatedData);
  assert.equal(child.providerKeyPresent, false, "provider credentials remain excluded");
  assert.equal(path.isAbsolute(child.aweDataDir), true);
  assert.equal(fs.existsSync(path.join(isolatedData, "missions")), true);
  assert.equal(fs.existsSync(path.join(workdir, ".awe-data")), false, "child cannot create/fallback to cwd default state");
});
