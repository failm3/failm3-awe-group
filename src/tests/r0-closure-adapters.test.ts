import { strict as assert } from "node:assert";
import { after, test } from "node:test";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { spawn } from "node:child_process";
import { registerHooks } from "node:module";
import { runWithToolContext, type ToolContext } from "../security/tool-context.js";

// One fresh synthetic state root for this suite. Every spawned parent inherits
// this same isolated fixture root; no real/default .awe-data is ever selected.
const root = fs.mkdtempSync(path.join(process.cwd(), ".r0-closure-adapters-test-"));
const isolatedData = path.join(root, "state");
process.env.AWE_DATA_DIR = isolatedData;
const browserRoot = path.join(root, "browsers");
const bundledChrome = path.join(browserRoot, "chromium-offline", "chrome-linux64", "chrome");
fs.mkdirSync(path.dirname(bundledChrome), { recursive: true });
fs.writeFileSync(bundledChrome, "offline executable fixture");
const oldPlaywrightPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
process.env.PLAYWRIGHT_BROWSERS_PATH = browserRoot;
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
function tick(ms = 10): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function waitFor(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await tick(5);
  }
  assert.fail(`Timed out waiting for ${label}`);
}
async function promptly<T>(run: Promise<T>, timeoutMs = 500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("operation did not settle promptly")), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
function settlement(run: Promise<unknown>): { settled: boolean } {
  const state = { settled: false };
  void run.then(() => { state.settled = true; }, () => { state.settled = true; });
  return state;
}
const errorText = (value: unknown): string => String((value as { error?: unknown })?.error ?? value);
const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

// ─── Offline MCP and browser doubles ─────────────────────────────────────────
type ProbeCall = { command: string; options: { signal?: AbortSignal } };
const probeCalls: ProbeCall[] = [];
let versionProbeFailure: Error | null = null;
(globalThis as any).__r0ClosureExec = (command: string, options: any, callback: any) => {
  probeCalls.push({ command, options });
  queueMicrotask(() => {
    if (versionProbeFailure && command.includes("--version")) callback(versionProbeFailure);
    else callback(null, { stdout: "", stderr: "" });
  });
  return {};
};
const mcpDouble: {
  constructed: number;
  listCalls: number;
  disconnectCalls: number;
  list: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
  disconnect: () => Promise<void>;
} = {
  constructed: 0,
  listCalls: 0,
  disconnectCalls: 0,
  list: async () => ({}),
  disconnect: async () => {},
};
(globalThis as any).__r0ClosureMCP = mcpDouble;

const browserDouble: {
  availabilityCalls: number;
  discoveryCalls: number;
  isPlaywrightAvailable: (signal?: AbortSignal) => Promise<boolean>;
  getPlaywrightTools: (signal?: AbortSignal) => Promise<Record<string, unknown>>;
} = {
  availabilityCalls: 0,
  discoveryCalls: 0,
  isPlaywrightAvailable: async () => { browserDouble.availabilityCalls++; return true; },
  getPlaywrightTools: async () => { browserDouble.discoveryCalls++; return {}; },
};
(globalThis as any).__r0ClosureBrowserMCP = browserDouble;

// ─── Offline DNS and transport doubles ───────────────────────────────────────
type DnsAnswer = { address: string; family?: number };
let dnsHandler: (host: string, options: unknown) => Promise<DnsAnswer[]> = async () => [{ address: "8.8.8.8", family: 4 }];
let dnsCalls: Array<{ host: string; options: unknown }> = [];
(globalThis as any).__r0ClosureLookup = (host: string, options: unknown, callback: (error: unknown, addresses?: DnsAnswer[]) => void) => {
  dnsCalls.push({ host, options });
  void dnsHandler(host, options).then((addresses) => callback(null, addresses), (error) => callback(error));
};

type FakeRequest = EventEmitter & {
  destroyed: boolean;
  writes: string[];
  destroy: (error?: Error) => void;
  write: (body: string) => void;
  end: () => void;
  setTimeout: () => void;
};
type OfflineRequest = {
  options: any;
  req: FakeRequest;
  destroyed: boolean;
  responseDestroyed: boolean;
  connectedAddress?: string;
  connectedFamily?: number;
  connectionAttempts: number;
  respond: (body: string, status?: number, headers?: Record<string, string>) => void;
  redirect: (location: string, status?: number) => void;
};
let transportRequests: OfflineRequest[] = [];
function resetTransport(): void {
  transportRequests = [];
}
(globalThis as any).__r0ClosureRequest = (options: any, callback: (response: any) => void) => {
  const req = new EventEmitter() as FakeRequest;
  const record = {} as OfflineRequest;
  req.destroyed = false;
  req.writes = [];
  req.destroy = () => { record.destroyed = true; req.destroyed = true; };
  req.write = (body) => { req.writes.push(body); };
  req.end = () => {
    if (typeof options.lookup !== "function") return;
    options.lookup(options.hostname, { family: 0 }, (error: unknown, address: string, family: number) => {
      if (error) return;
      record.connectedAddress = address;
      record.connectedFamily = family;
      record.connectionAttempts++;
    });
  };
  req.setTimeout = () => {};
  Object.assign(record, {
    options,
    req,
    destroyed: false,
    responseDestroyed: false,
    connectionAttempts: 0,
    respond(body: string, status = 200, headers: Record<string, string> = {}) {
      const res = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers,
        destroy: () => { record.responseDestroyed = true; },
      });
      callback(res);
      // This deliberately occurs even if destroy was non-cooperative cancellation.
      res.emit("data", Buffer.from(body));
      res.emit("end");
    },
    redirect(location: string, status = 302) {
      const res = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers: { location },
        destroy: () => { record.responseDestroyed = true; },
      });
      callback(res);
      res.emit("end");
    },
  });
  transportRequests.push(record);
  return req;
};

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "child_process" && context.parentURL?.includes("/config/mcp.")) {
      return { url: "r0-closure:exec", shortCircuit: true };
    }
    if (specifier === "@mastra/mcp" && context.parentURL?.includes("/config/mcp.")) {
      return { url: "r0-closure:mcp", shortCircuit: true };
    }
    if (specifier === "../config/mcp.js" && context.parentURL?.includes("/tools/browser.")) {
      return { url: "r0-closure:browser-mcp", shortCircuit: true };
    }
    if (specifier === "dns" && context.parentURL?.includes("/tools/index.")) {
      return { url: "r0-closure:dns", shortCircuit: true };
    }
    if (((specifier === "http" || specifier === "https") && context.parentURL?.includes("/tools/index.")) ||
        (specifier === "node:https" && context.parentURL?.includes("/security/search-request."))) {
      return { url: "r0-closure:http", shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "r0-closure:exec") return {
      format: "module", shortCircuit: true,
      source: "export * from 'node:child_process'; export const exec = (...a) => globalThis.__r0ClosureExec(...a);",
    };
    if (url === "r0-closure:mcp") return {
      format: "module", shortCircuit: true,
      source: `export class MCPClient {
        constructor(config) { globalThis.__r0ClosureMCP.constructed++; this.config = config; }
        listTools() { globalThis.__r0ClosureMCP.listCalls++; return globalThis.__r0ClosureMCP.list(); }
        disconnect() { globalThis.__r0ClosureMCP.disconnectCalls++; return globalThis.__r0ClosureMCP.disconnect(); }
      }`,
    };
    if (url === "r0-closure:browser-mcp") return {
      format: "module", shortCircuit: true,
      source: "export const isPlaywrightAvailable = (...a) => globalThis.__r0ClosureBrowserMCP.isPlaywrightAvailable(...a); export const getPlaywrightTools = (...a) => globalThis.__r0ClosureBrowserMCP.getPlaywrightTools(...a);",
    };
    if (url === "r0-closure:dns") return {
      format: "module", shortCircuit: true,
      source: "export const lookup = (...a) => globalThis.__r0ClosureLookup(...a);",
    };
    if (url === "r0-closure:http") return {
      format: "module", shortCircuit: true,
      source: "export const request = (...a) => globalThis.__r0ClosureRequest(...a);",
    };
    return next(url, context);
  },
});
after(() => {
  hooks.deregister();
  for (const key of ["__r0ClosureExec", "__r0ClosureMCP", "__r0ClosureBrowserMCP", "__r0ClosureLookup", "__r0ClosureRequest"]) {
    delete (globalThis as any)[key];
  }
});

const mcp = await import("../config/mcp.js");
const { browserNavigateTool } = await import("../tools/browser.js");
const { webFetchTool, webExtractTool, webSearchTool, fileListTool, shellTool } = await import("../tools/index.js");
const processRegistry = await import("../utils/process-registry.js");

function context(tool: string, extra: Partial<ToolContext> = {}): ToolContext {
  return { missionId: `closure-${tool}-${crypto.randomUUID()}`, allowedTools: new Set([tool]), ...extra };
}
function execute(tool: { execute?: any }, input: unknown, ctx: ToolContext): Promise<any> {
  return runWithToolContext(ctx, () => tool.execute(input, {}));
}
function navigate(signal?: AbortSignal): Promise<any> {
  return execute(browserNavigateTool, { url: "https://example.test/" }, context("browser_navigate", { signal }));
}

// R0 is not certified here: these are adapter doubles, deliberately not live
// Playwright/Chromium/MCP teardown evidence.
test("MCP: transient availability is retryable, while positive availability caches", async () => {
  versionProbeFailure = new Error("temporary offline probe failure");
  assert.equal(await mcp.isPlaywrightAvailable(), false);
  const failedCalls = probeCalls.length;
  assert.equal(failedCalls, 2);
  versionProbeFailure = null;
  assert.equal(await mcp.isPlaywrightAvailable(), true);
  assert.ok(probeCalls.length > failedCalls, "false availability did not become permanent");
  const positiveCalls = probeCalls.length;
  assert.equal(await mcp.isPlaywrightAvailable(), true);
  assert.equal(probeCalls.length, positiveCalls, "positive availability remains cached");
});

test("MCP: sole abort awaits late discovery AND deferred disconnect, then remains retryable", async () => {
  const list = deferred<Record<string, unknown>>();
  const listStarted = deferred();
  const disconnectStarted = deferred();
  const disconnectRelease = deferred();
  mcpDouble.list = () => { listStarted.resolve(); return list.promise; };
  mcpDouble.disconnect = () => { disconnectStarted.resolve(); return disconnectRelease.promise; };
  const controller = new AbortController();
  const run = mcp.getPlaywrightTools(controller.signal);
  await listStarted.promise;
  const state = settlement(run);
  controller.abort(new Error("last discovery caller cancelled"));
  await tick();
  assert.equal(state.settled, false, "pending listTools cannot be reported quiesced");
  assert.equal(mcpDouble.disconnectCalls, 1);
  await disconnectStarted.promise;
  list.resolve({ playwright_browser_navigate: { should_not_run: true } });
  await tick();
  assert.equal(state.settled, false, "disconnect COMPLETION is awaited, not merely called");
  disconnectRelease.resolve();
  await assert.rejects(run, /last discovery caller cancelled/);

  mcpDouble.list = async () => ({ playwright_browser_navigate: { healthy_after_abort: true } });
  mcpDouble.disconnect = async () => {};
  const recovered = await mcp.getPlaywrightTools();
  assert.equal((recovered as any).playwright_browser_navigate.healthy_after_abort, true);
  assert.equal(mcpDouble.listCalls, 2, "aborted rejected discovery never became a permanent cache");
});

test("MCP: non-cooperative discovery stays unsettled after disconnect, and rejected/empty discovery retries", async () => {
  const list = deferred<Record<string, unknown>>();
  const started = deferred();
  mcpDouble.list = () => { started.resolve(); return list.promise; };
  mcpDouble.disconnect = async () => {};
  const controller = new AbortController();
  const run = mcp.getPlaywrightTools(controller.signal);
  await started.promise;
  const state = settlement(run);
  controller.abort(new Error("noncooperative cancel"));
  await tick(30);
  assert.equal(state.settled, false, "no false quiescence when listTools ignores cancellation");
  list.resolve({});
  await assert.rejects(run, /noncooperative cancel/);

  mcpDouble.list = async () => { throw new Error("ordinary temporary discovery failure"); };
  assert.deepEqual(await mcp.getPlaywrightTools(), {}, "ordinary discovery failure remains graceful");
  mcpDouble.list = async () => ({ playwright_browser_navigate: { retry: true } });
  const recovered = await mcp.getPlaywrightTools();
  assert.equal((recovered as any).playwright_browser_navigate.retry, true);
});

test("browser: shared discovery has independent caller cancellation and no cross-caller rejection", async () => {
  browserDouble.availabilityCalls = 0;
  browserDouble.discoveryCalls = 0;
  browserDouble.isPlaywrightAvailable = async () => {
    browserDouble.availabilityCalls++;
    return browserDouble.availabilityCalls > 1;
  };
  const unavailable = await navigate();
  assert.equal(unavailable.success, false);
  assert.match(errorText(unavailable), /unavailable/);
  assert.equal(browserDouble.discoveryCalls, 0);

  const first = deferred<Record<string, unknown>>();
  browserDouble.getPlaywrightTools = () => { browserDouble.discoveryCalls++; return first.promise; };
  const a = navigate();
  const b = navigate();
  await waitFor(() => browserDouble.discoveryCalls === 1, "one shared cold discovery");
  // Complete this warm-up pair before starting explicit-signal callers.
  first.resolve({}); // complete the non-aborted warm-up pair
  await a;
  await b;

  const shared = deferred<Record<string, unknown>>();
  let sharedSignal: AbortSignal | undefined;
  browserDouble.getPlaywrightTools = (signal) => {
    browserDouble.discoveryCalls++;
    sharedSignal = signal;
    return shared.promise;
  };
  const aController = new AbortController();
  const bController = new AbortController();
  const aRun = navigate(aController.signal);
  const bRun = navigate(bController.signal);
  await waitFor(() => browserDouble.discoveryCalls === 2, "second shared generation");
  bController.abort(new Error("B only cancelled"));
  const bResult = await promptly(bRun);
  assert.equal(bResult.success, false);
  assert.match(errorText(bResult), /B only cancelled/);
  assert.equal(sharedSignal?.aborted, false, "B cannot cancel A's shared operation/client");
  const aState = settlement(aRun);
  await tick();
  assert.equal(aState.settled, false);
  shared.resolve({});
  assert.equal((await aRun).success, false); // empty map: graceful, not cached
  assert.equal(aController.signal.aborted, false);

  const second = deferred<Record<string, unknown>>();
  let secondSignal: AbortSignal | undefined;
  browserDouble.getPlaywrightTools = (signal) => {
    browserDouble.discoveryCalls++;
    secondSignal = signal;
    return second.promise;
  };
  const cController = new AbortController();
  const dController = new AbortController();
  const cRun = navigate(cController.signal);
  const dRun = navigate(dController.signal);
  await waitFor(() => browserDouble.discoveryCalls === 3, "reverse cancellation generation");
  cController.abort(new Error("A rejected but B remains"));
  const cResult = await promptly(cRun);
  assert.match(errorText(cResult), /A rejected but B remains/);
  assert.equal(secondSignal?.aborted, false);
  second.resolve({});
  const dResult = await promptly(dRun);
  assert.match(errorText(dResult), /not found/, "B completes independently rather than inheriting A rejection");
  assert.equal(dController.signal.aborted, false);
});

test("browser: last-abort/noncooperative behavior is honest; rejected/empty results retry; positive map caches", async () => {
  const held = deferred<Record<string, unknown>>();
  const heldStarted = deferred();
  browserDouble.getPlaywrightTools = () => { browserDouble.discoveryCalls++; heldStarted.resolve(); return held.promise; };
  const controller = new AbortController();
  const run = navigate(controller.signal);
  await heldStarted.promise;
  const state = settlement(run);
  controller.abort(new Error("last browser waiter abort"));
  await tick(30);
  assert.equal(state.settled, false, "noncooperative last discovery cannot publish false quiescence");
  held.resolve({ playwright_browser_navigate: { execute: async () => { throw new Error("post-abort raw effect"); } } });
  const refused = await run;
  assert.equal(refused.success, false);
  assert.match(errorText(refused), /last browser waiter abort/);

  browserDouble.getPlaywrightTools = async () => {
    browserDouble.discoveryCalls++;
    throw new Error("transient rejection");
  };
  const rejected = await navigate();
  assert.match(errorText(rejected), /transient rejection/);
  const beforeEmpty = browserDouble.discoveryCalls;
  browserDouble.getPlaywrightTools = async () => { browserDouble.discoveryCalls++; return {}; };
  const empty = await navigate();
  assert.match(errorText(empty), /not found/);
  assert.equal(browserDouble.discoveryCalls, beforeEmpty + 1);
  const beforeRetry = browserDouble.discoveryCalls;
  let rawEffects = 0;
  browserDouble.getPlaywrightTools = async () => {
    browserDouble.discoveryCalls++;
    return { playwright_browser_navigate: { execute: async (_input: unknown, options: { abortSignal?: AbortSignal }) => {
      assert.ok(options.abortSignal);
      rawEffects++;
      return { url: "https://example.test/", title: "offline" };
    } } };
  };
  const healthy = await navigate(new AbortController().signal);
  assert.equal(healthy.success, true, errorText(healthy));
  assert.equal(rawEffects, 1);
  const cached = await navigate(new AbortController().signal);
  assert.equal(cached.success, true);
  assert.equal(rawEffects, 2);
  assert.equal(browserDouble.discoveryCalls, beforeRetry + 1, "only the positive map is reused");
});

// ─── DNS/pinned-socket and callback cancellation proofs ──────────────────────
function publicDns(host: string): void {
  dnsCalls = [];
  dnsHandler = async () => [{ address: host.includes("v6") ? "2606:4700:4700::1111" : "8.8.8.8" }];
}
for (const [name, tool, input] of [
  ["web_fetch", webFetchTool, { url: "http://public-closure.test/a", method: "GET" }],
  ["web_extract", webExtractTool, { url: "http://public-closure.test/a", max_chars: 2000 }],
] as const) {
  test(`${name}: abort destroys transport, late response-end is inert, and no request/fallback follows`, async () => {
    publicDns("cancel");
    resetTransport();
    const controller = new AbortController();
    const run = execute(tool, input, context(name, { signal: controller.signal }));
    await waitFor(() => transportRequests.length === 1, `${name} request`);
    controller.abort(new Error(`cancel ${name} callback`));
    const cancelled = await promptly(run);
    assert.equal(cancelled.success, false);
    assert.match(errorText(cancelled), new RegExp(`cancel ${name}`));
    assert.equal(transportRequests[0].destroyed, true);
    transportRequests[0].respond("<title>late</title>late forbidden body");
    await tick();
    assert.equal(transportRequests.length, 1, "abort begins no redirect/fallback/new connection");
    assert.equal(cancelled.body, undefined);
    assert.equal(cancelled.text, undefined);
  });

  test(`${name}: success callback followed by abort before continuation cannot return delayed success`, async () => {
    publicDns("continuation");
    resetTransport();
    const controller = new AbortController();
    const run = execute(tool, input, context(name, { signal: controller.signal }));
    await waitFor(() => transportRequests.length === 1, `${name} callback request`);
    transportRequests[0].respond("<title>visible</title>visible body");
    controller.abort(new Error(`cancel ${name} continuation`));
    const result = await promptly(run);
    assert.equal(result.success, false);
    assert.equal(result.body, undefined);
    assert.equal(result.text, undefined);
  });
}

test("HTTP: abort during noncooperative DNS settles without connecting after late answers", async () => {
  resetTransport();
  dnsCalls = [];
  const answer = deferred<DnsAnswer[]>();
  let releaseLookup!: () => void;
  const lookupStarted = deferred();
  dnsHandler = () => { lookupStarted.resolve(); releaseLookup = () => answer.resolve([{ address: "8.8.8.8" }]); return answer.promise; };
  const controller = new AbortController();
  const run = execute(webFetchTool, { url: "http://slow-dns.test/", method: "GET" }, context("web_fetch", { signal: controller.signal }));
  await lookupStarted.promise;
  controller.abort(new Error("cancel DNS"));
  assert.match(errorText(await promptly(run)), /cancel DNS/);
  releaseLookup();
  await tick(20);
  assert.equal(transportRequests.length, 0, "late DNS answer starts no socket");
});

test("SSRF: public names resolving to private/reserved IPv4 and IPv6 never construct transport", async () => {
  const denied = [
    "127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.2", "0.0.0.0",
    "100.64.1.1", "198.51.100.8", "224.0.0.1", "240.0.0.1",
    "::1", "::", "fc00::1", "fe80::1", "ff02::1", "2001:db8::1",
    "::ffff:127.0.0.1", "::ffff:a00:1", "::7f00:1",
  ];
  for (const address of denied) {
    resetTransport();
    dnsCalls = [];
    dnsHandler = async () => [{ address }];
    const result = await execute(webFetchTool, { url: "http://public-rebinding.test/", method: "GET" }, context("web_fetch"));
    assert.equal(result.success, false, address);
    assert.match(errorText(result), /not allowed/, address);
    assert.equal(transportRequests.length, 0, `${address} reached transport`);
    assert.equal(dnsCalls.length, 1);
  }
  for (const literal of ["http://[::ffff:127.0.0.1]/", "http://[2001:db8::1]/", "http://127.0.0.1/"]) {
    resetTransport();
    const result = await execute(webFetchTool, { url: literal, method: "GET" }, context("web_fetch"));
    assert.equal(result.success, false, literal);
    assert.equal(transportRequests.length, 0);
  }
});

test("SSRF: redirect targets are resolved/rejected before a second connection", async () => {
  resetTransport();
  dnsCalls = [];
  dnsHandler = async (host) => [{ address: host === "start-public.test" ? "8.8.8.8" : "10.20.30.40" }];
  const run = execute(webExtractTool, { url: "http://start-public.test/start", max_chars: 100 }, context("web_extract"));
  await waitFor(() => transportRequests.length === 1, "public redirect source");
  transportRequests[0].redirect("http://redirect-private.test/secret", 302);
  const result = await promptly(run);
  assert.equal(result.success, false);
  assert.match(errorText(result), /not allowed/);
  assert.deepEqual(dnsCalls.map(({ host }) => host), ["start-public.test", "redirect-private.test"]);
  assert.equal(transportRequests.length, 1, "no HTTP connection to private redirect target");
});

test("SSRF: allowed mocked public path pins the validated address and preserves header/body behavior", async () => {
  publicDns("allowed");
  resetTransport();
  const run = execute(webFetchTool, {
    url: "http://allowed-public.test:8080/path?q=1", method: "POST", headers: { "X-Test": "yes" }, body: "offline body",
  }, context("web_fetch"));
  await waitFor(() => transportRequests.length === 1, "allowed public request");
  const request = transportRequests[0];
  assert.equal(request.connectedAddress, "8.8.8.8");
  assert.equal(request.connectedFamily, 4);
  assert.equal(request.connectionAttempts, 1);
  assert.equal(request.options.lookup instanceof Function, true);
  assert.equal(request.options.headers["X-Test"], "yes");
  assert.deepEqual(request.req.writes, ["offline body"]);
  request.respond("allowed response");
  const result = await promptly(run);
  assert.equal(result.success, true);
  assert.equal(result.body, "allowed response");
  assert.equal(dnsCalls.length, 1, "request lookup is pinned rather than a second unchecked DNS lookup");

  resetTransport();
  dnsCalls = [];
  dnsHandler = async () => [{ address: "8.8.8.8" }, { address: "127.0.0.1" }];
  const mixed = await execute(webFetchTool, { url: "http://mixed-answer.test/", method: "GET" }, context("web_fetch"));
  assert.equal(mixed.success, false, "mixed answers fail closed instead of exposing fallback addresses");
  assert.equal(transportRequests.length, 0);

  const before = dnsCalls.length;
  for (const url of ["file:///etc/passwd", "https://user:secret@allowed-public.test/"]) {
    const result = await execute(webFetchTool, { url, method: "GET" }, context("web_fetch"));
    assert.equal(result.success, false);
  }
  assert.equal(dnsCalls.length, before, "protocol/credential rejection precedes DNS");
});

// ─── Real local child processes; no network or external service ──────────────
const resistantHelper = path.join(process.cwd(), "src/tests/helpers/r0-closure-adapters-resistant-child.mjs");
const sigkillParent = path.join(process.cwd(), "src/tests/helpers/r0-closure-adapters-sigkill-parent.mjs");

function resistantCommand(readyFile: string, lateFile: string, delayMs = 1200): string {
  // Executable inputs must be handed into the child workspace explicitly.
  // The parent fixture starts with cwd here; the application source is outside
  // that child's filesystem grant and must not be exposed to make a test pass.
  const localHelper = path.join(path.dirname(readyFile), "resistant-child.mjs");
  fs.copyFileSync(resistantHelper, localHelper);
  return [process.execPath, localHelper, readyFile, lateFile, String(delayMs)].map(shellQuote).join(" ");
}

test("stale ownership after asynchronous DNS prevents fetch/extract transport creation", async () => {
  for (const [tool, url] of [[webFetchTool, "http://stale-fetch.test/"], [webExtractTool, "http://stale-extract.test/"]] as const) {
    resetTransport();
    let held = true;
    const dnsReady = deferred();
    dnsHandler = async () => { await dnsReady.promise; return [{ address: "8.8.8.8", family: 4 }]; };
    const run = execute(tool, { url }, context(tool === webFetchTool ? "web_fetch" : "web_extract", { fence: () => held }));
    await tick(20);
    held = false;
    dnsReady.resolve();
    const result = await run;
    assert.equal(result.success, false);
    assert.match(errorText(result), /ownership lost/);
    assert.equal(transportRequests.length, 0, "stale owner created no transport or request body");
    dnsHandler = async () => [{ address: "8.8.8.8", family: 4 }];
  }
});

test("stale ownership after failed primary search prevents fallback transport", async () => {
  resetTransport();
  const oldKey = process.env.TAVILY_API_KEY;
  process.env.TAVILY_API_KEY = "offline-test-only";
  let held = true;
  try {
    const run = execute(webSearchTool, { query: "stale fallback" }, context("web_search", { fence: () => held }));
    await waitFor(() => transportRequests.length === 1, "Tavily transport");
    transportRequests[0].respond(JSON.stringify({ error: "controlled primary failure" }), 500);
    // The response callback has completed; before its promise continuation can
    // choose the fallback, the owner loses its lease without an abort signal.
    held = false;
    const result = await run;
    assert.equal(result.success, false);
    assert.match(errorText(result), /ownership lost/);
    assert.equal(transportRequests.length, 1, "no DDG fallback request was created by the stale owner");
  } finally {
    if (oldKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = oldKey;
  }
});

test("recursive file_list has no helper process and inherits fence/abort controls", async () => {
  const workdir = path.join(root, "recursive-list");
  fs.mkdirSync(path.join(workdir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(workdir, "nested", "file.txt"), "offline");
  const result = await execute(fileListTool, { path: workdir, recursive: true }, context("file_list"));
  assert.equal(result.success, true);
  assert.deepEqual(result.entries, [path.join(workdir, "nested", "file.txt")]);
  const controller = new AbortController();
  controller.abort(new Error("cancel file listing"));
  const aborted = await execute(fileListTool, { path: workdir, recursive: true }, context("file_list", { signal: controller.signal }));
  assert.equal(aborted.success, false);
});

test("shell exports the resolved AWE_DATA_DIR from any child cwd", async () => {
  const workdir = path.join(root, "resolved-data-dir");
  const nested = path.join(workdir, "nested");
  fs.mkdirSync(nested, { recursive: true });
  const command = `${process.execPath} -e ${shellQuote("console.log(process.env.AWE_DATA_DIR)")}`;
  const result = await execute(shellTool, { command, cwd: nested, timeout_ms: 3000 }, context("shell"));
  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.stdout, isolatedData);
});

test("stale ownership before shell durable launch and executable release performs no work", async () => {
  for (const flipAt of ["launch", "release"] as const) {
    const workdir = path.join(root, `stale-shell-${flipAt}`);
    fs.mkdirSync(workdir, { recursive: true });
    const marker = path.join(workdir, "must-not-exist");
    let fenceCalls = 0;
    const missionId = `stale-shell-${flipAt}`;
    const registry = path.join(isolatedData, "process-groups");
    const forbiddenCall = flipAt === "release" ? 4 : 3;
    let result: any;
    try {
      result = await execute(shellTool, { command: `printf bad > '${marker}'`, cwd: workdir, timeout_ms: 2000 }, context("shell", { missionId, fence: () => ++fenceCalls < forbiddenCall }));
    } catch (error) {
      result = { success: false, error: String(error) };
    }
    assert.equal(result.success, false, JSON.stringify(result));
    assert.ok(fenceCalls >= forbiddenCall);
    assert.equal(fs.existsSync(marker), false);
    const records = fs.existsSync(registry) ? fs.readdirSync(registry).filter((name) => name.startsWith(`${missionId}--`)) : [];
    assert.deepEqual(records, []);
  }
});

test("escaped setsid descendants cannot perform an effect after shell settlement", async () => {
  const workdir = path.join(root, "escaped-descendant");
  fs.mkdirSync(workdir, { recursive: true });
  const late = path.join(workdir, "late-effect");
  const script = "import fs from 'node:fs'; setTimeout(() => fs.writeFileSync(process.argv[1], 'late'), 800);";
  const command = `setsid ${process.execPath} -e ${shellQuote(script)} ${shellQuote(late)} >/dev/null 2>&1 &`;
  const result = await execute(shellTool, { command, cwd: workdir, timeout_ms: 3000 }, context("shell"));
  assert.equal(result.success, true, JSON.stringify(result));
  await tick(1400);
  assert.equal(fs.existsSync(late), false, "PID-namespace supervisor reaped the escaped descendant");
});

test("process: abort SIGKILL-escalates resistant group, awaits close/quiescence, and no late file is possible", async () => {
  const workdir = path.join(root, "resistant-abort");
  fs.mkdirSync(workdir, { recursive: true });
  const readyFile = path.join(workdir, "ready");
  const lateFile = path.join(workdir, "late-effect");
  const controller = new AbortController();
  const missionId = `resistant-${crypto.randomUUID()}`;
  const run = execute(shellTool, {
    command: resistantCommand(readyFile, lateFile), cwd: workdir, timeout_ms: 10000,
  }, context("shell", { missionId, signal: controller.signal }));
  await waitFor(() => fs.existsSync(readyFile), "resistant descendant start");
  // A recovery attempt for a live current owner must refuse, not kill overlap.
  const live = await processRegistry.reapOrphanedMissionProcessGroups(missionId, { graceMs: 10, timeoutMs: 100 });
  assert.equal(live.quiesced, false);
  assert.match(live.blocked.map(({ reason }) => reason).join("\n"), /owner is still alive/);
  controller.abort(new Error("cancel resistant group"));
  const result = await promptly(run, 3000);
  assert.equal(result.success, false);
  assert.match(result.stderr, /Operation cancelled/);
  await tick(1000); // beyond the child's already-scheduled late effect deadline
  assert.equal(fs.existsSync(lateFile), false, "no descendant side effect after confirmed settle");
  const records = fs.readdirSync(path.join(isolatedData, "process-groups"));
  assert.equal(records.some((name) => name.startsWith(`${missionId.toLowerCase()}--`)), false, "record removed only after quiescence");
});

test("process: cooperative current-owner helper is itself safe for process-exit wiring", async () => {
  const workdir = path.join(root, "current-owner-quiescence");
  fs.mkdirSync(workdir, { recursive: true });
  const readyFile = path.join(workdir, "ready");
  const lateFile = path.join(workdir, "late-effect");
  const missionId = `current-owner-${crypto.randomUUID()}`;
  const run = execute(shellTool, {
    command: resistantCommand(readyFile, lateFile, 1000), cwd: workdir, timeout_ms: 10000,
  }, context("shell", { missionId }));
  await waitFor(() => fs.existsSync(readyFile), "current-owner resistant child");
  const stopped = await processRegistry.quiesceCurrentMissionProcessGroups(missionId, { graceMs: 75, timeoutMs: 3000 });
  assert.equal(stopped.quiesced, true, JSON.stringify(stopped));
  assert.equal(stopped.reclaimed.length, 1);
  const result = await promptly(run, 3000);
  assert.equal(result.success, false);
  await tick(1000);
  assert.equal(fs.existsSync(lateFile), false);
});

test("process: confirmed SIGKILL owner recovery kills surviving resistant group before returning", async () => {
  const workdir = path.join(root, "sigkill-recovery");
  fs.mkdirSync(workdir, { recursive: true });
  const readyFile = path.join(workdir, "ready");
  const lateFile = path.join(workdir, "late-effect");
  const missionId = `sigkill-${crypto.randomUUID()}`;
  const loader = path.join(process.cwd(), "node_modules/tsx/dist/loader.mjs");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "NODE_ENV", "AWE_DATA_DIR", "PLAYWRIGHT_BROWSERS_PATH"].includes(key)
  ));
  const parent = spawn(process.execPath, [
    "--import", loader, sigkillParent, missionId, resistantCommand(readyFile, lateFile, 1400), workdir, readyFile,
  ], { cwd: workdir, env, stdio: ["ignore", "pipe", "pipe"] });
  let parentStdout = "", parentStderr = "";
  parent.stdout.on("data", (chunk) => { parentStdout += chunk.toString(); });
  parent.stderr.on("data", (chunk) => { parentStderr += chunk.toString(); });
  const parentClosed = new Promise<void>((resolve) => parent.once("close", () => resolve()));
  let recovered = false;
  try {
    await waitFor(() => parentStdout.includes("R0_PARENT_READY"), `SIGKILL parent ready: ${parentStderr}`, 5000);
    assert.equal(fs.existsSync(lateFile), false);
    parent.kill("SIGKILL");
    await parentClosed;
    const recovery = await processRegistry.reapOrphanedMissionProcessGroups(missionId, { graceMs: 100, timeoutMs: 5000 });
    recovered = recovery.quiesced;
    assert.equal(recovery.quiesced, true, JSON.stringify({ recovery, parentStderr }));
    assert.equal(recovery.reclaimed.length, 1);
    assert.equal(fs.existsSync(lateFile), false);
    await tick(1400); // safely beyond any surviving descendant write deadline
    assert.equal(fs.existsSync(lateFile), false, "hard-death reaper prevented late side effect before recovery returned");
  } finally {
    if (parent.exitCode === null && parent.signalCode === null) parent.kill("SIGKILL");
    if (!recovered) await processRegistry.reapOrphanedMissionProcessGroups(missionId, { graceMs: 0, timeoutMs: 2000 });
  }
});

test("process: malformed records fail closed without signalling or deleting evidence", async () => {
  const missionId = `malformed-${crypto.randomUUID()}`;
  const registry = path.join(isolatedData, "process-groups");
  fs.mkdirSync(registry, { recursive: true });
  const file = path.join(registry, `${missionId}--${crypto.randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify({ version: 1, mission_id: missionId, pgid: 1, owner_pid: 1 }));
  const result = await processRegistry.reapOrphanedMissionProcessGroups(missionId, { graceMs: 0, timeoutMs: 100 });
  assert.equal(result.quiesced, false);
  assert.match(result.blocked[0].reason, /Malformed|cross-mission/);
  assert.equal(fs.existsSync(file), true, "malformed ownership evidence is preserved for inspection");
});
