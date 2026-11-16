/**
 * MCP client configuration for AWE GROUP.
 *
 * Provides lazy-initialized access to the Playwright MCP server, which
 * exposes browser automation tools (navigate, click, type, screenshot,
 * etc.) over the Model Context Protocol.
 *
 * Uses @mastra/mcp's `MCPClient` with a stdio transport that spawns
 * `@playwright/mcp` as a subprocess. The connection is established lazily
 * on first tool discovery and reused thereafter (singleton).
 */

import { MCPClient } from "@mastra/mcp";
import type { Tool } from "@mastra/core/tools";
import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { throwIfAborted } from "../security/tool-context.js";

const execAsync = promisify(exec);

function aborted(signal: AbortSignal | undefined, error: unknown): never | void {
  if (signal?.aborted) throwIfAborted(signal);
  if (error instanceof Error && error.name === "AbortError") throw error;
}

async function awaitDiscovery<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal);
  let disconnect: Promise<void> | null = null;
  let settled: Promise<unknown> | null = null;
  const stopAndAccount = (): Promise<unknown> => {
    if (!settled) {
      // Disconnect immediately, but do not report the adapter operation as
      // stopped until both the original discovery and disconnect completed.
      // A non-cooperative listTools implementation therefore keeps this call
      // pending: there is no safe "quiesced" result to publish in that case.
      disconnect ??= disconnectPlaywrightMCP();
      settled = Promise.allSettled([operation, disconnect]);
    }
    return settled;
  };
  if (!signal) return operation;

  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      const reason = signal.reason ?? new Error("Operation aborted");
      void stopAndAccount().then(() => reject(reason));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    const result = await Promise.race([operation, cancelled]);
    if (signal.aborted) {
      await stopAndAccount();
      throwIfAborted(signal);
    }
    return result;
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      await stopAndAccount();
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

// ─── Availability check ─────────────────────────────────────────────────────

let availabilityCache: boolean | null = null;

/**
 * Check whether the Playwright MCP server and a usable browser are available
 * on this machine. Only a successful positive result is cached; transient
 * failures and missing-browser results remain retryable.
 *
 * Checks:
 *   1. `npx` is on PATH (needed to launch @playwright/mcp)
 *   2. @playwright/mcp can report its version via npx
 *   3. Playwright's bundled Chromium is installed (or a system browser exists)
 */
export async function isPlaywrightAvailable(signal?: AbortSignal): Promise<boolean> {
  throwIfAborted(signal);
  if (availabilityCache !== null) return availabilityCache;

  // Probe npx / @playwright/mcp. This is the only part allowed to fail
  // silently — cancellation itself must propagate and must not poison the
  // availability cache with a false negative.
  try {
    await execAsync("which npx", { timeout: 5000, signal });
    throwIfAborted(signal);
    await execAsync("npx @playwright/mcp --version", {
      timeout: 30000,
      env: { ...process.env },
      signal,
    });
    throwIfAborted(signal);
  } catch (error) {
    aborted(signal, error);
    // A transient probe failure is not evidence that a future process will
    // also be unavailable. Only a positive result is cached.
    return false;
  }

  // Do not resolve/start a browser after cancellation completed the last probe.
  throwIfAborted(signal);
  const available = resolveChromium() !== null;
  throwIfAborted(signal);
  if (available) availabilityCache = true;
  return available;
}

// ─── Chromium resolution ────────────────────────────────────────────────────

/**
 * Locate a usable Chromium executable and the LD_LIBRARY_PATH needed to run
 * it on this machine.  On systems where system-level NSS/NSPR libraries are
 * not installed via the package manager, we extract the .deb files into a
 * local prefix and set LD_LIBRARY_PATH at launch time.
 *
 * Returns `{ executablePath, ldLibraryPath }` or null when no browser is found.
 */
function resolveChromium(): { executablePath: string; ldLibraryPath: string } | null {
  // 1. Check the local extracted-deps directory first.
  const depsDir = path.join(process.cwd(), ".chromium-deps", "usr", "lib", "x86_64-linux-gnu");
  const ldLibraryPath = fs.existsSync(depsDir) ? depsDir : "";

  // 2. Check Playwright's bundled Chromium (project-local cache).
  const pwBrowsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH || "";
  const searchDirs = [
    pwBrowsersPath,
    path.join(process.cwd(), ".oc-isolated", "cache", "ms-playwright"),
    path.join(os.homedir(), ".cache", "ms-playwright"),
  ].filter(Boolean);

  for (const base of searchDirs) {
    try {
      const entries = fs.readdirSync(base);
      for (const entry of entries) {
        if (!entry.startsWith("chromium-")) continue;
        const candidate = path.join(base, entry, "chrome-linux64", "chrome");
        if (fs.existsSync(candidate)) {
          return { executablePath: candidate, ldLibraryPath };
        }
        // Some older builds use chrome-linux/
        const candidate2 = path.join(base, entry, "chrome-linux", "chrome");
        if (fs.existsSync(candidate2)) {
          return { executablePath: candidate2, ldLibraryPath };
        }
      }
    } catch {
      // directory doesn't exist — skip
    }
  }

  // 3. Fall back to system chromium.
  const systemPaths = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"];
  for (const p of systemPaths) {
    if (fs.existsSync(p)) {
      return { executablePath: p, ldLibraryPath };
    }
  }

  return null;
}

// ─── Lazy MCP client singleton ──────────────────────────────────────────────

let playwrightClient: MCPClient | null = null;
let playwrightClientPromise: Promise<MCPClient> | null = null;

/**
 * Create and return a singleton `MCPClient` configured to spawn the
 * Playwright MCP server over stdio.
 *
 * The server is launched with `npx @playwright/mcp --headless` so it runs
 * a headless Chromium instance suitable for server-side automation.
 *
 * Callers should guard with `isPlaywrightAvailable()` first; if the
 * dependency is missing this function still returns a client, but the
 * first tool-list call will fail and surface the error gracefully.
 */
export function getPlaywrightMCP(): Promise<MCPClient> {
  if (playwrightClient) return Promise.resolve(playwrightClient);
  if (playwrightClientPromise) return playwrightClientPromise;

  playwrightClientPromise = (async () => {
    const chromium = resolveChromium();
    const executableArgs = chromium
      ? ["--executable-path", chromium.executablePath]
      : [];

    // Merge LD_LIBRARY_PATH into inherited env
    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter(
        (v): v is [string, string] => v[1] !== undefined &&
          ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "DISPLAY", "XDG_RUNTIME_DIR", "PLAYWRIGHT_BROWSERS_PATH", "LD_LIBRARY_PATH"].includes(v[0])
      )
    );
    if (chromium?.ldLibraryPath) {
      const existing = baseEnv.LD_LIBRARY_PATH || "";
      baseEnv.LD_LIBRARY_PATH = existing
        ? `${chromium.ldLibraryPath}:${existing}`
        : chromium.ldLibraryPath;
    }

    const client = new MCPClient({
      id: "awe-playwright",
      servers: {
        playwright: {
          command: "npx",
          args: [
            "@playwright/mcp",
            "--headless",
            "--isolated",
            ...executableArgs,
          ],
          stderr: "pipe",
          env: baseEnv,
        },
      },
      timeout: 60_000,
    });

    playwrightClient = client;
    return client;
  })();

  return playwrightClientPromise;
}

// ─── Tool discovery helper ───────────────────────────────────────────────────

/**
 * Discovered tool map from the Playwright MCP server.
 *
 * Keys are namespaced as `playwright_<toolName>` (e.g.
 * `playwright_browser_navigate`). Returns an empty object if the server
 * is unavailable.
 */
export async function getPlaywrightTools(signal?: AbortSignal): Promise<Record<string, Tool<any, any, any, any>>> {
  throwIfAborted(signal);
  const available = await isPlaywrightAvailable(signal);
  throwIfAborted(signal);
  if (!available) return {};

  try {
    throwIfAborted(signal);
    const client = await getPlaywrightMCP();
    throwIfAborted(signal);
    const tools = await awaitDiscovery(client.listTools(), signal);
    throwIfAborted(signal);
    return tools as Record<string, Tool<any, any, any, any>>;
  } catch (err) {
    aborted(signal, err);
    // Ordinary discovery failures remain graceful. Cancellation is never
    // converted into a successful empty discovery result.
    console.error("[mcp] Failed to discover Playwright MCP tools:", err);
    return {};
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Disconnect the Playwright MCP client and clear the singleton.
 * Safe to call multiple times.
 */
let playwrightDisconnectPromise: Promise<void> | null = null;

export async function disconnectPlaywrightMCP(): Promise<void> {
  if (playwrightDisconnectPromise) return playwrightDisconnectPromise;
  const client = playwrightClient;
  if (!client) {
    playwrightClientPromise = null;
    return;
  }

  const pending = (async () => {
    try {
      await client.disconnect();
    } catch {
      // Best-effort cleanup still has a definite completion boundary. Errors
      // are intentionally not confused with cancellation of another caller.
    } finally {
      if (playwrightClient === client) {
        playwrightClient = null;
        playwrightClientPromise = null;
      }
    }
  })();
  playwrightDisconnectPromise = pending;
  try {
    await pending;
  } finally {
    if (playwrightDisconnectPromise === pending) playwrightDisconnectPromise = null;
  }
}
