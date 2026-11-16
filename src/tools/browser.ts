/**
 * Browser automation tools backed by the Playwright MCP server.
 *
 * Each tool delegates to the corresponding tool exposed by @playwright/mcp
 * (launched via the MCPClient in src/config/mcp.ts).  When Playwright or a
 * browser binary is not available, every tool returns a structured
 * `{ success: false, error }` response instead of throwing, so agents can
 * gracefully fall back to other tools (e.g. web_fetch).
 *
 * The tools are created with @mastra/core's `createTool` so they are
 * drop-in compatible with the existing allTools map.
 */

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getPlaywrightTools, isPlaywrightAvailable } from "../config/mcp.js";
import { assertToolAllowed, throwIfAborted } from "../security/tool-context.js";

// ─── Types ──────────────────────────────────────────────────────────────────

type MCPTool = {
  // Mastra MCP 2.8 forwards ToolExecutionContext.abortSignal to callTool's
  // request options (including MCP request cancellation).
  execute?: (input: unknown, context: { abortSignal?: AbortSignal }) => Promise<unknown>;
};

// ─── Availability ─────────────────────────────────────────────────────────────

let cachedAvailability = false;

/**
 * Returns true when the Playwright MCP server and a browser are available
 * on this machine. Only a positive result is cached, so transient failures
 * and missing local dependencies can recover without a process restart.
 */
export async function isBrowserAvailable(signal?: AbortSignal): Promise<boolean> {
  throwIfAborted(signal);
  if (!cachedAvailability) {
    const available = await isPlaywrightAvailable(signal);
    throwIfAborted(signal);
    // False is deliberately not memoized. It may describe only this attempt.
    cachedAvailability = available === true;
  }
  throwIfAborted(signal);
  return cachedAvailability;
}

// ─── Tool resolver ────────────────────────────────────────────────────────────

/**
 * Cached map of raw MCP tools keyed by their namespaced name
 * (e.g. `playwright_browser_navigate`).
 */
let mcpToolCache: Record<string, MCPTool> | null = null;

type SharedDiscovery = {
  controller: AbortController;
  operation: Promise<Record<string, MCPTool>>;
  waiters: Set<symbol>;
  settled: boolean;
  cancelling: Promise<void> | null;
  cancelReason?: unknown;
};
let sharedDiscovery: SharedDiscovery | null = null;

function hasTools(tools: Record<string, MCPTool>): boolean {
  return Object.keys(tools).length > 0;
}

async function waitForPriorDiscovery(prior: SharedDiscovery, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (prior.settled) return;
  if (!signal) return prior.operation.then(() => undefined, () => undefined);
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason ?? new Error("Operation aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([prior.operation.then(() => undefined, () => undefined), aborted]);
    throwIfAborted(signal);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function cancelLastWaiter(shared: SharedDiscovery): Promise<void> {
  if (shared.cancelling) return shared.cancelling;
  shared.controller.abort(shared.cancelReason ?? new Error("Operation aborted"));
  // getPlaywrightTools owns MCP disconnect and accounts for both listTools and
  // disconnect completion before rejecting. We additionally await its public
  // operation here, so a non-cooperative implementation cannot masquerade as
  // quiesced. No cache transition is allowed from this cancelled generation.
  shared.cancelling = shared.operation.then(() => undefined, () => undefined);
  return shared.cancelling;
}

async function getMCPToolMap(signal?: AbortSignal): Promise<Record<string, MCPTool>> {
  throwIfAborted(signal);
  if (mcpToolCache) {
    throwIfAborted(signal);
    return mcpToolCache;
  }

  let shared = sharedDiscovery;
  if (shared?.cancelling) {
    // Do not attach a new mission to an already-aborted controller or inherit
    // its rejection. Its unrelated waiter settles independently and promptly;
    // a fresh generation starts only after the old work is actually accounted.
    await waitForPriorDiscovery(shared, signal);
    throwIfAborted(signal);
    if (sharedDiscovery === shared) sharedDiscovery = null;
    shared = null;
  }
  if (!shared) {
    const controller = new AbortController();
    const created = {} as SharedDiscovery;
    const operation = getPlaywrightTools(controller.signal).then(
      (tools) => {
        const map = tools as unknown as Record<string, MCPTool>;
        // Positive maps are useful immutable discovery results. Empty maps and
        // failures remain retryable; an aborted generation never fills cache.
        if (hasTools(map) && !controller.signal.aborted) mcpToolCache = map;
        return map;
      },
    );
    created.controller = controller;
    created.operation = operation;
    created.waiters = new Set();
    created.settled = false;
    created.cancelling = null;
    shared = created;
    sharedDiscovery = created;
    void operation.then(
      () => { created.settled = true; },
      () => { created.settled = true; },
    ).then(() => {
      if (sharedDiscovery === created && (created.settled && !created.cancelling)) {
        sharedDiscovery = null;
      }
    });
  }

  const current = shared;
  const waiter = Symbol("mcp-discovery-waiter");
  current.waiters.add(waiter);
  return new Promise<Record<string, MCPTool>>((resolve, reject) => {
    let done = false;
    const remove = () => {
      current.waiters.delete(waiter);
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (done) return;
      remove();
      const reason = signal?.reason ?? new Error("Operation aborted");
      if (current.waiters.size > 0 || current.settled) {
        // Other active callers retain the shared operation and its MCP client.
        done = true;
        reject(reason);
        return;
      }
      current.cancelReason = reason;
      const quiesced = cancelLastWaiter(current);
      void quiesced.then(() => {
        if (done) return;
        done = true;
        if (sharedDiscovery === current) sharedDiscovery = null;
        reject(reason);
      });
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    void current.operation.then(
      (tools) => {
        if (done) return;
        remove();
        done = true;
        if (signal?.aborted) {
          reject(signal.reason ?? new Error("Operation aborted"));
          return;
        }
        resolve(tools);
      },
      (error) => {
        if (done) return;
        remove();
        done = true;
        if (signal?.aborted) reject(signal.reason ?? new Error("Operation aborted"));
        else reject(error);
      },
    );
  });
}

/**
 * Look up a single Playwright MCP tool by its short name (without the
 * `playwright_` prefix).  Returns undefined when unavailable.
 */
async function resolveTool(name: string, signal?: AbortSignal): Promise<MCPTool | undefined> {
  const map = await getMCPToolMap(signal);
  throwIfAborted(signal);
  // Namespaced key is `playwright_<name>`, but the tool may also exist
  // under just `<name>` depending on the server version.
  return map[`playwright_${name}`] ?? map[name];
}

/**
 * Execute a Playwright MCP tool by short name, returning the raw result
 * or a structured error when the tool or browser is unavailable.
 */
async function callMCPTool(
  name: string,
  input: unknown,
  permission: string
): Promise<{ success: boolean; error?: string; data?: unknown }> {
  let context: ReturnType<typeof assertToolAllowed>;
  try { context = assertToolAllowed(permission); } catch (err) { return { success: false, error: String(err) }; }
  try {
    const available = await isBrowserAvailable(context.signal);
    throwIfAborted(context.signal);
    if (!available) {
      return { success: false, error: "Browser unavailable — Playwright MCP or Chromium not installed" };
    }
    throwIfAborted(context.signal);
    const tool = await resolveTool(name, context.signal);
    throwIfAborted(context.signal);
    if (!tool || typeof tool.execute !== "function") {
      return { success: false, error: `Browser tool '${name}' not found in Playwright MCP` };
    }
    // Availability/discovery may be cold and asynchronous. Recheck ownership
    // at the actual invocation boundary, not only before discovery.
    context = assertToolAllowed(permission);
    throwIfAborted(context.signal);
    const result = await tool.execute(input, { abortSignal: context.signal });
    throwIfAborted(context.signal);
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── Output schemas ─────────────────────────────────────────────────────────

const browserNavSchema = z.object({
  success: z.boolean(),
  url: z.string().optional(),
  title: z.string().optional(),
  error: z.string().optional(),
});

const browserScreenshotSchema = z.object({
  success: z.boolean(),
  image_base64: z.string().optional(),
  error: z.string().optional(),
});

const browserActionSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});

const browserTextSchema = z.object({
  success: z.boolean(),
  text: z.string().optional(),
  error: z.string().optional(),
});

// ─── Tools ───────────────────────────────────────────────────────────────────

/** Navigate the browser to a URL. Delegates to playwright `browser_navigate`. */
export const browserNavigateTool = createTool({
  id: "browser_navigate",
  description:
    "Navigate the browser to a URL. Opens a new page if none is open. Returns the page URL and title.",
  inputSchema: z.object({
    url: z.string().url().describe("URL to navigate to"),
  }),
  outputSchema: browserNavSchema,
  execute: async (input) => {
    const res = await callMCPTool("browser_navigate", { url: input.url }, "browser_navigate");
    if (!res.success) return { success: false, error: res.error };
    const data = res.data as { url?: string; title?: string } | undefined;
    return { success: true, url: data?.url ?? input.url, title: data?.title };
  },
});

/** Capture a screenshot of the current page. Delegates to playwright `browser_take_screenshot`. */
export const browserScreenshotTool = createTool({
  id: "browser_screenshot",
  description:
    "Take a screenshot of the current browser page. Returns a base64-encoded PNG image.",
  inputSchema: z.object({
    raw: z.boolean().optional().default(false).describe("If true, capture the full page without compression"),
  }),
  outputSchema: browserScreenshotSchema,
  execute: async (input) => {
    // Playwright MCP >= 0.0.85 requires an explicit `scale` argument
    // ("css" or "device"); omitting it fails schema validation.
    const res = await callMCPTool("browser_take_screenshot", {
      scale: "css",
      type: "png",
      fullPage: input.raw,
    }, "browser_screenshot");
    if (!res.success) return { success: false, error: res.error };
    const data = res.data as
      | {
          image_base64?: string;
          content?: Array<{ data?: string; type?: string; mimeType?: string }>;
        }
      | undefined;
    const imageBase64 =
      data?.image_base64 ??
      data?.content?.find((c) => c.type === "image" && c.data)?.data ??
      data?.content?.find((c) => c.data)?.data ??
      undefined;
    if (!imageBase64) {
      return { success: false, error: "Screenshot returned no image data" };
    }
    return { success: true, image_base64: imageBase64 };
  },
});

/** Click an element on the page. Delegates to playwright `browser_click`. */
export const browserClickTool = createTool({
  id: "browser_click",
  description:
    "Click an element on the current browser page by CSS selector or text.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector or text of the element to click"),
  }),
  outputSchema: browserActionSchema,
  execute: async (input) => {
    const res = await callMCPTool("browser_click", { selector: input.selector }, "browser_click");
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: res.data };
  },
});

/** Type text into a field. Delegates to playwright `browser_type`. */
export const browserTypeTool = createTool({
  id: "browser_type",
  description:
    "Type text into an input field on the current browser page.",
  inputSchema: z.object({
    selector: z.string().describe("CSS selector of the input field"),
    text: z.string().describe("Text to type into the field"),
    submit: z.boolean().optional().default(false).describe("If true, press Enter after typing"),
  }),
  outputSchema: browserActionSchema,
  execute: async (input) => {
    const res = await callMCPTool("browser_type", {
      selector: input.selector,
      text: input.text,
      submit: input.submit,
    }, "browser_type");
    if (!res.success) return { success: false, error: res.error };
    return { success: true, data: res.data };
  },
});

/** Extract readable text from the current page. Delegates to playwright `browser_snapshot`. */
export const browserGetTextTool = createTool({
  id: "browser_get_text",
  description:
    "Get the visible text content of the current browser page. Useful for reading page content after navigation.",
  inputSchema: z.object({
    selector: z.string().optional().describe("CSS selector to limit text extraction to a specific element"),
  }),
  outputSchema: browserTextSchema,
  execute: async (input) => {
    // Playwright MCP's `browser_snapshot` returns an accessibility tree
    // snapshot; we use it as a text source.  If a selector is given we
    // delegate to browser_click's cousin — but the snapshot itself is the
    // most reliable text source.
    const res = await callMCPTool("browser_snapshot", input.selector ? { selector: input.selector } : {}, "browser_get_text");
    if (!res.success) return { success: false, error: res.error };

    // The snapshot result may contain structured content; coerce to string.
    const data = res.data;
    let text: string | undefined;
    if (typeof data === "string") {
      text = data;
    } else if (data && typeof data === "object") {
      // Try common fields
      const obj = data as Record<string, unknown>;
      text =
        (typeof obj.text === "string" ? obj.text : undefined) ??
        (Array.isArray(obj.content) ? obj.content.map((c) => (typeof c === "string" ? c : (c as { text?: string })?.text ?? "")).join("\n") : undefined) ??
        JSON.stringify(data).slice(0, 20000);
    }

    if (!text) {
      return { success: false, error: "Page snapshot returned no text content" };
    }
    return { success: true, text: text.slice(0, 20000) };
  },
});

// ─── Aggregate export ──────────────────────────────────────────────────────────

/**
 * All browser tools, keyed by their tool id.  These can be merged into
 * an agent's tool map alongside the core tools from ./index.js.
 *
 * Each tool internally checks browser availability and returns a graceful
 * error when Playwright/Chromium is not installed, so it is always safe
 * to include them in the tool map.
 */
export const browserTools = {
  browser_navigate: browserNavigateTool,
  browser_screenshot: browserScreenshotTool,
  browser_click: browserClickTool,
  browser_type: browserTypeTool,
  browser_get_text: browserGetTextTool,
};
