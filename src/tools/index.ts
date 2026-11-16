import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as net from "net";
import * as dns from "dns";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { DATA_DIR, saveArtifactFile, withMissionWrite, loadMission, listArtifacts, reconcileArtifactFiles } from "../utils/storage.js";
import { createCsvAnalyticsTool } from "./csv-analytics.js";
import { assertApprovedSpecBinding } from "../utils/spec-binding.js";
import { browserTools } from "./browser.js";
import { tiSearchTool } from "./ti-search.js";
import { manusSearchTool } from "./manus-search.js";
import { assertToolAllowed, getToolContext, throwIfAborted } from "../security/tool-context.js";
import { sensitivePathReason } from "../security/paths.js";
import { deletedRegisteredArtifacts } from "../security/artifact-guard.js";
import { capabilityLibraryTool } from "./ucl-search.js";
import { shellSandboxArgs } from "../security/shell-sandbox.js";
import { resourceLimitedSandbox } from "../security/resource-limits.js";
import { readWorkspaceFile, writeWorkspaceFile, listWorkspaceFiles } from "../security/workspace-fs.js";
import { searchRequest } from "../security/search-request.js";
import { assertNotQualifiedExecutable, qualifiedExecutablePathsFor, shellTouchesQualifiedExecutable } from "../utils/local-capability.js";
import {
  prepareDetachedProcessGroup,
  attachDetachedProcessGroup,
  releaseDetachedProcessGroup,
  abortPreparedProcessGroup,
  quiesceRegisteredProcessGroup,
} from "../utils/process-registry.js";

/** Every irreversible effect repeats both cancellation and ownership checks. */
function assertEffectOwner(context: ReturnType<typeof getToolContext>, label: string): void {
  if (!context) throw new Error(`${label} denied: no mission tool context`);
  throwIfAborted(context.signal);
  if (context.fence && !context.fence()) throw new Error(`${label} denied: mission ownership lost for ${context.missionId}`);
  throwIfAborted(context.signal);
}

function withToolEffect<T>(tool: string, label: string, effect: () => T): T {
  const context = getToolContext();
  if (!context) throw new Error(`${label} denied: no mission tool context`);
  const run = () => { assertEffectOwner(context, label); return effect(); };
  return context.withEffect
    ? context.withEffect(run as () => never, { stage: "effect", role: context.role, tools: [tool], label }) as T
    : run();
}

// ─── Path safety ──────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(process.cwd());

/**
 * Resolve and validate that a path stays within the workspace.
 * Throws for paths that traverse outside the project directory.
 */
export function assertSafePath(inputPath: string): string {
  const resolved = path.resolve(inputPath);
  const granted = getToolContext()?.workspaceRoot;
  if (granted && resolved !== granted && !resolved.startsWith(granted + path.sep)) {
    throw new Error("Access denied: path is outside the mission workspace");
  }
  if (
    resolved !== WORKSPACE_ROOT &&
    !resolved.startsWith(WORKSPACE_ROOT + path.sep)
  ) {
    throw new Error(
      `Access denied: path '${inputPath}' is outside the workspace (${WORKSPACE_ROOT})`
    );
  }
  // Containment alone is not confidentiality: the workspace root holds the
  // process environment file and the state of every other mission. Those paths
  // are denied to agent tools even though they are inside the workspace.
  const reason = sensitivePathReason(resolved, { workspaceRoot: WORKSPACE_ROOT });
  const ownArtifacts = granted && (resolved === granted || resolved.startsWith(granted + path.sep));
  if (reason && !(ownArtifacts && reason === "mission state directory")) {
    throw new Error(`Access denied: path '${inputPath}' is a protected ${reason}`);
  }
  let parent = fs.existsSync(resolved) ? resolved : path.dirname(resolved);
  while (!fs.existsSync(parent) && parent !== path.dirname(parent)) parent = path.dirname(parent);
  const realParent = fs.realpathSync.native(parent);
  if (granted && realParent !== granted && !realParent.startsWith(granted + path.sep)) {
    throw new Error("Access denied: symlink escapes mission workspace");
  }
  if (!ownArtifacts && (realParent === DATA_DIR || realParent.startsWith(DATA_DIR + path.sep))) {
    throw new Error("Access denied: runtime control-plane state");
  }
  if (realParent !== WORKSPACE_ROOT && !realParent.startsWith(WORKSPACE_ROOT + path.sep)) {
    throw new Error(`Access denied: symlink escapes workspace: '${inputPath}'`);
  }
  return resolved;
}

function guard(tool: string) { return assertToolAllowed(tool); }

function assertSafeArtifactName(name: string): void {
  if (!name || path.isAbsolute(name) || name.split(/[\\/]/).includes("..")) {
    throw new Error(`Unsafe artifact name: ${name}`);
  }
}

const BINARY_TEXT_TOOL_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".pdf"]);
function assertTextToolTarget(inputPath: string): void {
  if (BINARY_TEXT_TOOL_EXTENSIONS.has(path.extname(inputPath).toLowerCase())) {
    throw new Error("Text tools cannot create or overwrite binary artifacts; use the approved shell procedure and preserve its bytes");
  }
}

function forbiddenIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  return parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255) ||
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 0 && parts[2] === 2) || (a === 192 && b === 88 && parts[2] === 99) ||
    (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113) || a >= 224;
}

function parseIPv6(address: string): number[] | null {
  let value = address.toLowerCase();
  if (value.includes("%")) return null; // scoped/link-local and ambiguous forms fail closed
  if (value.includes(".")) {
    const colon = value.lastIndexOf(":");
    if (colon < 0) return null;
    const v4 = value.slice(colon + 1).split(".").map(Number);
    if (v4.length !== 4 || v4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    value = `${value.slice(0, colon)}:${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const read = (raw: string) => raw ? raw.split(":").map((part) => {
    if (!/^[\da-f]{1,4}$/.test(part)) throw new Error("invalid IPv6");
    return parseInt(part, 16);
  }) : [];
  try {
    const left = read(halves[0]);
    const right = halves.length === 2 ? read(halves[1]) : [];
    const missing = 8 - left.length - right.length;
    if (missing < 0 || (halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
    return [...left, ...Array(missing).fill(0), ...right];
  } catch { return null; }
}

function forbiddenAddress(rawAddress: string): boolean {
  const address = rawAddress.replace(/^\[|\]$/g, "");
  const family = net.isIP(address);
  if (family === 4) return forbiddenIPv4(address.split(".").map(Number));
  if (family !== 6) return true;
  const words = parseIPv6(address);
  if (!words) return true;
  // IPv4-mapped and compatible addresses inherit the complete IPv4 policy.
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return forbiddenIPv4([words[6] >> 8, words[6] & 255, words[7] >> 8, words[7] & 255]);
  }
  if (words.slice(0, 6).every((word) => word === 0)) return true; // ::/96, including :: and ::1
  if ((words[0] & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((words[0] & 0xffc0) === 0xfe80) return true; // link local fe80::/10
  if ((words[0] & 0xff00) === 0xff00) return true; // multicast ff00::/8
  if (words[0] === 0x2001 && words[1] === 0x0db8) return true; // documentation
  if (words[0] === 0x3fff && (words[1] & 0xf000) === 0) return true; // documentation 3fff::/20
  if (words[0] === 0x100 && words[1] === 0 && words[2] === 0 && words[3] === 0) return true; // discard 100::/64
  if (words[0] === 0x2001 && (words[1] === 0 || words[1] === 2 || (words[1] >= 0x10 && words[1] <= 0x2f))) return true;
  if (words[0] === 0x2002) return true; // deprecated 6to4 transition network
  if (words[0] === 0x64 && words[1] === 0xff9b) return true; // NAT64 translation boundary: fail closed
  return false;
}

function assertSafeUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http/https URLs are allowed");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      host.endsWith(".internal") || net.isIP(host) !== 0 && forbiddenAddress(host)) {
    throw new Error("Local/private network destinations are not allowed");
  }
  return url;
}

// ─── Output schemas ───────────────────────────────────────────────────────────

const shellOutputSchema = z.object({
  success: z.boolean(),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number(),
});

const fileReadOutputSchema = z.object({
  success: z.boolean(),
  content: z.string().optional(),
  size: z.number().optional(),
  error: z.string().optional(),
});

const fileWriteOutputSchema = z.object({
  success: z.boolean(),
  path: z.string().optional(),
  artifact_id: z.string().optional(),
  error: z.string().optional(),
});

const fileListOutputSchema = z.object({
  success: z.boolean(),
  entries: z.array(z.union([z.string(), z.object({ name: z.string(), type: z.string() })])).optional(),
  error: z.string().optional(),
});

const webFetchOutputSchema = z.object({
  success: z.boolean(),
  status: z.number().optional(),
  body: z.string().optional(),
  error: z.string().optional(),
});

const webSearchOutputSchema = z.object({
  success: z.boolean(),
  query: z.string().optional(),
  results: z.array(z.object({ title: z.string(), url: z.string(), snippet: z.string() })).optional(),
  error: z.string().optional(),
});

const artifactOutputSchema = z.object({
  success: z.boolean(),
  artifact_id: z.string().optional(),
  path: z.string().optional(),
  error: z.string().optional(),
});

// ─── Shell execution ──────────────────────────────────────────────────────────

// A shared artifact directory has no OS-level producer identity. Serialize only
// the shell effect + registration critical section (not model generation), so
// concurrent specialists cannot reconcile and claim one another's files.
const missionShellTails = new Map<string, Promise<void>>();

async function withMissionShellAttribution<T>(missionId: string, effect: () => Promise<T>): Promise<T> {
  const previous = missionShellTails.get(missionId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const result = await effect();
    const context = getToolContext();
    if (!context || context.missionId !== missionId) throw new Error("Shell artifact attribution lost its mission context");
    const register = () => reconcileArtifactFiles(missionId, {
      fence: context.fence, signal: context.signal, reviseChanged: true,
    });
    const registered = context.withEffect
      ? context.withEffect(register, { stage: "effect", role: context.role, tools: ["shell"], label: "shell artifact registration" })
      : register();
    for (const artifact of registered) context.artifactIds?.add(artifact.id);
    return result;
  });
  const tail = run.then(() => undefined, () => undefined);
  missionShellTails.set(missionId, tail);
  try {
    return await run;
  } finally {
    if (missionShellTails.get(missionId) === tail) missionShellTails.delete(missionId);
  }
}

export const shellTool = createTool({
  id: "shell",
  description:
    "Run a shell command. Returns stdout, stderr, and exit code. Use for file manipulation, git, running scripts, build tools, etc.",
  inputSchema: z.object({
    command: z.string().describe("Shell command to run"),
    cwd: z.string().optional().describe("Working directory (default: project root)"),
    timeout_ms: z.number().optional().default(30000).describe("Timeout in ms (default 30s)"),
  }),
  outputSchema: shellOutputSchema,
  execute: async (input) => {
    const { command, cwd, timeout_ms } = input;
    guard("shell");
    if (!cwd) return { success: false, stdout: "", stderr: "cwd is required", exit_code: 2 };
    let workdir: string;
    try {
      workdir = assertSafePath(cwd);
      if (/\b(sudo|su|doas|mkfs|shutdown|reboot|mount|umount|iptables|useradd|userdel|chmod\s+[0-7]*[247]|chown)\b|:\s*\(\)\s*\{/i.test(command)) {
        throw new Error("Command denied by conservative shell policy");
      }
    } catch (err: unknown) {
      return { success: false, stdout: "", stderr: String(err), exit_code: 2 };
    }
    const context = getToolContext();
    assertEffectOwner(context, "shell");
    const signal = context?.signal;
    const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
      ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TERM", "NODE_ENV", "CI", "LD_LIBRARY_PATH"].includes(key)
    )) as NodeJS.ProcessEnv;
    // AWE-aware child tests/verifiers must keep the same isolated state root.
    // Resolve it in the parent because the shell may have a different cwd, and
    // continue to exclude every provider credential from the filtered env.
    childEnv.AWE_DATA_DIR = DATA_DIR;

    const missionId = context?.missionId;
    if (!missionId) return { success: false, stdout: "", stderr: "shell requires mission ownership", exit_code: 2 };
    // A qualified executable may only be named by the exact gated command.
    // Otherwise any shell can rewrite the pinned procedure's bytes.
    if (shellTouchesQualifiedExecutable(missionId, command) && command !== context?.localCapability?.command) {
      return { success: false, stdout: "", stderr: "qualified executable is immutable; only its exact gated command may name it", exit_code: 2 };
    }
    // A registered artifact's bytes are evidence QA reviewed. Deleting them
    // leaves a record pointing at nothing and fails the mission at the terminal
    // gate, so refuse the deletion now and name the fix.
    const doomed = deletedRegisteredArtifacts(command, workdir, listArtifacts(missionId));
    if (doomed.length > 0) {
      return {
        success: false, stdout: "", exit_code: 2,
        stderr: `registered artifact(s) cannot be deleted: ${doomed.join(", ")}. Registered bytes are evidence; a new revision through save_artifact or a rewrite supersedes them. Use hidden or .tmp scratch paths, which are never registered.`,
      };
    }
    return withMissionShellAttribution(missionId, async () => {
    // A PGID is not a descendant-tree boundary: setsid can escape it. The
    // mandatory PID-namespace supervisor owns PID 1 and reaps every descendant
    // when the gated shell closes, including after an owner is SIGKILLed.
    // Refuse execution if this containment boundary is unavailable.
    if (process.platform !== "linux") {
      return { success: false, stdout: "", stderr: "Contained shell execution requires Linux", exit_code: 2 };
    }
    assertEffectOwner(context, "shell durable launch");
    const prepared = prepareDetachedProcessGroup(missionId);
    // The gate waits before executing the user's command. This closes the
    // ordinary spawn/registration gap: the durable active PID/PGID record is
    // written before any requested executable work can begin.
    // Supervisor-owned pipe: EOF is denial, and no shared registry mount is
    // needed. Durable release still precedes the byte enabling execution.
    const gate = "IFS= read -r permit && [ \"$permit\" = released ] || exit 125; exec /bin/sh -lc \"$2\"";
    const wallMs = Math.max(100, Math.min(Math.ceil(Number.isFinite(timeout_ms) ? timeout_ms! : 30000), 120000));
    let child: ChildProcessWithoutNullStreams | undefined;
    let group: ReturnType<typeof attachDetachedProcessGroup>;
    try {
      const launch = resourceLimitedSandbox([
        "--unshare-pid", "--die-with-parent",
        ...shellSandboxArgs({
          workdir,
          scratchDirs: [path.join(DATA_DIR, "tmp")],
          artifactsDir: path.join(DATA_DIR, "artifacts"),
          missionArtifactDir: path.join(DATA_DIR, "artifacts", missionId),
          dataDir: DATA_DIR,
          runtimeRoot: WORKSPACE_ROOT,
        }, context?.workspaceRoot ?? WORKSPACE_ROOT),
        "--proc", "/proc", "--dev", "/dev",
        "--chdir", workdir,
        "--", "/bin/sh", "-c", gate, "awe-process-gate", prepared.releasePath, command,
      ], childEnv, { wallMs, tasks: 128 });
      child = spawn(launch.executable, launch.args, {
        cwd: workdir, detached: process.platform === "linux", env: launch.env, stdio: ["pipe", "pipe", "pipe"],
      });
      group = attachDetachedProcessGroup(prepared, child.pid);
    } catch (error) {
      // A construction/spawn/attach failure cannot leave an unstarted launch
      // permanently blocking cancellation and orphan recovery.
      abortPreparedProcessGroup(prepared, child?.pid);
      return { success: false, stdout: "", stderr: String(error), exit_code: 1 };
    }

    let stdout = "", stderr = "", settled = false, terminationReason = "";
    child!.stdin.on("error", () => { /* early sandbox failure is reported by close */ });
    let exitCode = 1, spawnError = "", closeResolve!: () => void;
    const closed = new Promise<void>((resolve) => { closeResolve = resolve; });
    let quiescence: ReturnType<typeof quiesceRegisteredProcessGroup> | null = null;
    return new Promise((resolve) => {
      const finish = (quiesced: boolean, quiescenceError = "") => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        const detail = terminationReason || spawnError || stderr.trim();
        resolve({
          success: !terminationReason && !spawnError && exitCode === 0 && quiesced,
          stdout: stdout.trim().slice(0, 100000),
          stderr: [detail, quiescenceError].filter(Boolean).join("\n").slice(0, 100000),
          exit_code: exitCode,
        });
      };
      const requestQuiescence = () => {
        if (!quiescence) {
          quiescence = quiesceRegisteredProcessGroup(group, { close: closed });
          void quiescence.then((result) => finish(result.quiesced, result.quiesced ? "" : result.reason));
        }
        return quiescence;
      };
      const kill = (reason: string) => {
        if (!terminationReason) terminationReason = reason;
        void requestQuiescence();
      };
      const abort = () => kill("Operation cancelled");
      const timer = setTimeout(() => kill("Command timed out"), Math.max(1, Math.min(timeout_ms ?? 30000, 120000)));
      child!.stdout.on("data", (chunk) => { stdout += chunk.toString(); if (stdout.length > 100000) kill("Output limit exceeded"); });
      child!.stderr.on("data", (chunk) => { stderr += chunk.toString(); if (stderr.length > 100000) kill("Output limit exceeded"); });
      child!.on("error", (err) => {
        spawnError = String(err);
        exitCode = 1;
        void requestQuiescence();
      });
      child!.on("close", (code) => {
        exitCode = code ?? 1;
        closeResolve();
        // Shell close does not prove redirected/background descendants are
        // gone. Quiesce the whole registered group before reporting completion.
        void requestQuiescence();
      });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        assertEffectOwner(context, "shell executable release");
        withToolEffect("shell", "shell executable release", () => {
          const release = () => releaseDetachedProcessGroup(group);
          if (context?.localCapability) {
            // The trusted gate rehashes/requalifies and durably receipts the
            // exact fixed target command immediately before executable release.
            context.localCapability.authorizeAndRelease(command, release);
          } else {
            release();
          }
          child!.stdin.end("released\n");
        });
      } catch (error) {
        kill(String(error));
      }
    });
    });
  },
});

// ─── File operations ──────────────────────────────────────────────────────────

export const fileReadTool = createTool({
  id: "file_read",
  description: "Read file contents from disk.",
  inputSchema: z.object({
    path: z.string().describe("Absolute or relative file path"),
  }),
  outputSchema: fileReadOutputSchema,
  execute: async (input) => {
    try {
      guard("file_read");
      const safePath = assertSafePath(input.path);
      const content = withToolEffect("file_read", "workspace file read", () => readWorkspaceFile(safePath, assertSafePath));
      return { success: true, content, size: content.length };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const fileWriteTool = createTool({
  id: "file_write",
  description: "Write content to a file, creating directories as needed.",
  inputSchema: z.object({
    path: z.string(),
    content: z.string(),
    mission_id: z.string().optional().describe("If provided, registers as artifact"),
  }),
  outputSchema: fileWriteOutputSchema,
  execute: async (input) => {
    try {
      const context = guard("file_write");
      if (input.mission_id && input.mission_id !== context.missionId) throw new Error("Cross-mission artifact write denied");
      const safePath = assertSafePath(input.path);
      assertTextToolTarget(safePath);
      assertNotQualifiedExecutable(qualifiedExecutablePathsFor(context.missionId), safePath);
      // guard() already persists durable intent. Keep qualification around the
      // write, but leave its final owner/cancel/seal check to withMissionWrite:
      // repeating the owner fence before acquiring that lock would reopen the
      // exact check-to-write gap this boundary is required to close.
      const write = () => withMissionWrite(context.missionId, () => {
        writeWorkspaceFile(safePath, input.content, assertSafePath);
        if (input.mission_id) {
          // The outer lock and fence cover both writes; do not defer the
          // ownership check until after the requested file has been written.
          const artifact = saveArtifactFile(input.mission_id, path.relative(context.workspaceRoot ?? WORKSPACE_ROOT, safePath), input.content, "file");
          context.artifactIds?.add(artifact.id);
          return { success: true, path: safePath, artifact_id: artifact.id };
        }
        return { success: true, path: safePath };
      }, { fence: context.fence, signal: context.signal });
      return context.withEffect
        ? context.withEffect(write, { stage: "effect", role: context.role, tools: ["file_write"], label: "workspace file write" })
        : write();
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

export const fileListTool = createTool({
  id: "file_list",
  description: "List files and directories at a path.",
  inputSchema: z.object({
    path: z.string(),
    recursive: z.boolean().optional().default(false),
  }),
  outputSchema: fileListOutputSchema,
  execute: async (input) => {
    try {
      guard("file_list");
      const safePath = assertSafePath(input.path);
      const entries = withToolEffect("file_list", "workspace listing", () =>
        listWorkspaceFiles(safePath, !!input.recursive, assertSafePath, () => assertEffectOwner(getToolContext(), "file list")));
      return { success: true, entries };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── Web fetch ────────────────────────────────────────────────────────────────

type SafeAddress = { address: string; family: number };
type TextTransportResult = {
  success: boolean;
  status?: number;
  body?: string;
  final_url?: string;
  error?: string;
};

function lookupPublicAddress(host: string): Promise<SafeAddress[]> {
  return new Promise((resolve, reject) => {
    dns.lookup(host, { all: true, verbatim: true }, (error, addresses) => {
      if (error) reject(error);
      else resolve(addresses.map(({ address }) => ({ address, family: net.isIP(address) })));
    });
  });
}

async function resolveSafeAddress(raw: string, signal?: AbortSignal, context?: ReturnType<typeof getToolContext>): Promise<{ url: URL; address: SafeAddress }> {
  const url = assertSafeUrl(raw);
  throwIfAborted(signal);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal?.reason ?? new Error("Operation aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
  try {
    const addresses = net.isIP(host)
      ? [{ address: host, family: net.isIP(host) }]
      : await Promise.race([lookupPublicAddress(host), cancelled]);
    assertEffectOwner(context, "network DNS completion");
    if (addresses.length === 0 || addresses.some(({ address, family }) => family === 0 || forbiddenAddress(address))) {
      throw new Error("Local/private, reserved, or invalid DNS destinations are not allowed");
    }
    // Every returned answer is checked and only this selected address can be
    // exposed to the transport lookup callback. There is no unchecked fallback.
    return { url, address: addresses[0] };
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

function requestValidatedUrl(
  url: URL,
  address: SafeAddress,
  init: { method: string; headers: Record<string, string>; body?: string },
  signal?: AbortSignal,
  context?: ReturnType<typeof getToolContext>,
): Promise<TextTransportResult & { redirect?: string }> {
  return new Promise((resolve) => {
    let done = false;
    let response: http.IncomingMessage | null = null;
    const lib = url.protocol === "https:" ? https : http;
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    // Pin DNS for this exact connection. Even a rebinding between the earlier
    // lookup and socket establishment cannot introduce an unchecked address.
    const lookup: NonNullable<http.RequestOptions["lookup"]> = (_host, _options, callback) => {
      if (signal?.aborted) callback(signal.reason ?? new Error("Operation cancelled"), address.address, address.family);
      else callback(null, address.address, address.family);
    };
    const options: http.RequestOptions = {
      hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: init.method,
      headers: init.headers,
      lookup,
      // TLS authenticates the original DNS name even though the socket is pinned.
      ...(url.protocol === "https:" && net.isIP(hostname) === 0 ? { servername: hostname } : {}),
      signal,
    };
    let req: http.ClientRequest;
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (result: TextTransportResult & { redirect?: string }) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(result);
    };
    const onAbort = () => {
      const reason = signal?.reason ?? new Error("Operation cancelled");
      finish({ success: false, error: String(reason) });
      // Destroy both sides after marking the logical operation done. Late
      // transport callbacks become no-ops and can never append or resolve.
      try { response?.destroy(); } catch { /* best effort */ }
      try { req?.destroy(); } catch { /* best effort */ }
    };
    try {
      assertEffectOwner(context, "network transport creation");
      req = lib.request(options, (res) => {
        if (done || signal?.aborted) { onAbort(); return; }
        response = res;
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if ([301, 302, 303, 307, 308].includes(status) && location) {
          try {
            finish({ success: false, redirect: new URL(location, url).href, status });
          } catch (error) {
            finish({ success: false, error: `Invalid redirect URL: ${String(error)}` });
          }
          try { res.destroy(); } catch { /* best effort */ }
          return;
        }
        let data = "";
        let bytes = 0;
        res.on("data", (chunk) => {
          if (done || signal?.aborted) { onAbort(); return; }
          bytes += Buffer.byteLength(chunk);
          if (bytes > 1024 * 1024) {
            finish({ success: false, error: "Response exceeds 1 MiB" });
            try { res.destroy(); } catch { /* best effort */ }
            try { req.destroy(); } catch { /* best effort */ }
            return;
          }
          data += chunk.toString();
        });
        res.on("end", () => {
          if (done || signal?.aborted) { onAbort(); return; }
          finish({ success: true, status, body: data, final_url: url.href });
        });
        res.on("aborted", () => {
          if (!done && !signal?.aborted) finish({ success: false, error: "Response aborted" });
        });
        res.on("error", (error) => {
          if (!done && !signal?.aborted) finish({ success: false, error: String(error) });
        });
      });
    } catch (error) {
      finish({ success: false, error: String(error) });
      return;
    }
    req.on("error", (error) => {
      if (!done && !signal?.aborted) finish({ success: false, error: String(error) });
    });
    req.setTimeout(15000, () => {
      finish({ success: false, error: "Request timed out" });
      try { req.destroy(); } catch { /* best effort */ }
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    try {
      assertEffectOwner(context, "network request submission");
      if (init.body) req.write(init.body);
      assertEffectOwner(context, "network request submission");
      req.end();
    } catch (error) {
      finish({ success: false, error: String(error) });
      try { req.destroy(); } catch { /* best effort */ }
    }
  });
}

async function fetchTextSafely(
  rawUrl: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  signal?: AbortSignal,
  context?: ReturnType<typeof getToolContext>,
): Promise<TextTransportResult> {
  let current = rawUrl;
  let requestInit = { ...init, headers: { ...init.headers } };
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      assertEffectOwner(context, "network redirect boundary");
      const { url, address } = await resolveSafeAddress(current, signal, context);
      assertEffectOwner(context, "network request boundary");
      const result = await requestValidatedUrl(url, address, requestInit, signal, context);
      if (signal?.aborted) return { success: false, error: String(signal.reason ?? "Operation cancelled") };
      if (!result.redirect) return result;
      if (redirects === 5) return { success: false, error: "Too many redirects" };
      if (!result.success && result.redirect) {
        const previous = new URL(current);
        const next = new URL(result.redirect);
        // Validate lexical restrictions immediately, and resolve/pin on the next
        // loop before any connection to the redirect target is created.
        assertSafeUrl(next.href);
        current = next.href;
        requestInit = { ...requestInit, headers: { ...requestInit.headers } };
        if (previous.origin !== next.origin) {
          for (const name of Object.keys(requestInit.headers)) {
            if (["authorization", "proxy-authorization", "cookie"].includes(name.toLowerCase())) {
              delete requestInit.headers[name];
            }
          }
        }
        if (result.status === 301 || result.status === 302 || result.status === 303) {
          requestInit.method = "GET";
          delete requestInit.body;
          for (const name of Object.keys(requestInit.headers)) {
            if (["content-length", "content-type", "transfer-encoding"].includes(name.toLowerCase())) {
              delete requestInit.headers[name];
            }
          }
        }
        continue;
      }
    }
    return { success: false, error: "Redirect handling failed" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

export const webFetchTool = createTool({
  id: "web_fetch",
  description: "Fetch content from a URL. Returns the response body as text.",
  inputSchema: z.object({
    url: z.string().url(),
    method: z.enum(["GET", "POST"]).optional().default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
  }),
  outputSchema: webFetchOutputSchema,
  execute: async (input) => {
    let signal: AbortSignal | undefined;
    let context: ReturnType<typeof getToolContext>;
    try {
      context = guard("web_fetch");
      signal = context.signal;
      assertSafeUrl(input.url);
    } catch (err) { return { success: false, error: String(err) }; }
    const result = await fetchTextSafely(input.url, {
      method: input.method ?? "GET",
      headers: { "User-Agent": "AWE-Group/1.0", ...input.headers },
      body: input.body,
    }, signal, context);
    return {
      success: result.success,
      status: result.status,
      body: result.body?.slice(0, 50000),
      error: result.error,
    };
  },
});

// ─── Web search (Tavily API — primary; DDG JSON fallback) ─────────────────────

export const webSearchTool = createTool({
  id: "web_search",
  description:
    "Search the web and return relevant results with titles, URLs, and snippets. " +
    "Use for research, finding current information, job listings, documentation, news, etc.",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    max_results: z.number().optional().default(8),
    search_depth: z.enum(["basic", "advanced"]).optional().default("basic"),
  }),
  outputSchema: webSearchOutputSchema,
  execute: async (input) => {
    guard("web_search");
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      const result = await tryTavilySearch(input.query, input.max_results ?? 8, input.search_depth ?? "basic", tavilyKey);
      throwIfAborted();
      if (result.success && (result.results?.length ?? 0) > 0) {
        return result;
      }
    }
    // Fallback to DDG if Tavily unavailable
    throwIfAborted();
    const result = await tryDDGSearch(input.query, input.max_results ?? 8);
    throwIfAborted();
    return result;
  },
});

async function tryTavilySearch(
  query: string,
  maxResults: number,
  searchDepth: string,
  apiKey: string
): Promise<{ success: boolean; query?: string; results?: Array<{ title: string; url: string; snippet: string }>; error?: string }> {
  const signal = getToolContext()?.signal;
  try {
    const body = JSON.stringify({
      api_key: apiKey,
      query,
      max_results: maxResults,
      search_depth: searchDepth,
      include_answer: false,
    });
    const response = await searchRequest(
      {
        hostname: "api.tavily.com",
        path: "/search",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      }, 15000, signal, body
    );
    throwIfAborted(signal);
    const json = JSON.parse(response.body);
    if (json.error || response.status !== 200) {
      return { success: false, error: json.error ?? `HTTP ${response.status}` };
    }
    const results = (json.results ?? []).slice(0, maxResults).map((r: { title: string; url: string; content: string }) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 400),
    }));
    return { success: true, query, results };
  } catch (e) {
    throwIfAborted(signal);
    return { success: false, error: `Tavily search error: ${e}` };
  }
}

async function tryDDGSearch(
  query: string,
  maxResults: number
): Promise<{ success: boolean; query?: string; results?: Array<{ title: string; url: string; snippet: string }>; error?: string }> {
  const signal = getToolContext()?.signal;
  try {
    const q = encodeURIComponent(query);
    const response = await searchRequest(
      {
        hostname: "api.duckduckgo.com",
        path: `/?q=${q}&format=json&no_html=1&skip_disambig=1&no_redirect=1`,
        method: "GET",
        headers: { "User-Agent": "AWE-Group/1.0" },
      }, 8000, signal
    );
    throwIfAborted(signal);
    const json = JSON.parse(response.body);
    const results: Array<{ title: string; url: string; snippet: string }> = [];
    for (const item of json.RelatedTopics ?? []) {
      if (results.length >= maxResults) break;
      if (item.FirstURL && item.Text) {
        results.push({
          title: item.Text.split(" - ")[0]?.slice(0, 100) ?? item.Text.slice(0, 100),
          url: item.FirstURL,
          snippet: item.Text.slice(0, 300),
        });
      } else if (item.Topics) {
        for (const sub of item.Topics) {
          if (results.length >= maxResults) break;
          if (sub.FirstURL && sub.Text) {
            results.push({
              title: sub.Text.split(" - ")[0]?.slice(0, 100) ?? sub.Text.slice(0, 100),
              url: sub.FirstURL,
              snippet: sub.Text.slice(0, 300),
            });
          }
        }
      }
    }
    if (json.AbstractURL && json.AbstractText && results.length < maxResults) {
      results.unshift({ title: json.Heading ?? query, url: json.AbstractURL, snippet: json.AbstractText.slice(0, 400) });
    }
    return { success: true, query, results };
  } catch (e) {
    throwIfAborted(signal);
    return { success: false, error: `DDG search error: ${e}` };
  }
}

// ─── Web extract — readable text from HTML URL ───────────────────────────────

const webExtractOutputSchema = z.object({
  success: z.boolean(),
  url: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
});

export const webExtractTool = createTool({
  id: "web_extract",
  description: "Fetch a URL and extract readable text content from the HTML. Better than web_fetch for reading articles, documentation, and web pages.",
  inputSchema: z.object({
    url: z.string().url(),
    max_chars: z.number().optional().default(20000),
  }),
  outputSchema: webExtractOutputSchema,
  execute: async (input) => {
    let signal: AbortSignal | undefined;
    let context: ReturnType<typeof getToolContext>;
    try {
      context = guard("web_extract");
      signal = context.signal;
      assertSafeUrl(input.url);
    } catch (err) { return { success: false, error: String(err) }; }
    const result = await fetchTextSafely(input.url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }, signal, context);
    if (!result.success) return { success: false, error: result.error };
    const data = result.body ?? "";
    if (signal?.aborted) return { success: false, error: String(signal.reason ?? "Operation cancelled") };
    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(data);
    const title = titleMatch ? titleMatch[1].trim() : "";
    const text = data
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#\d+;/g, " ")
      .replace(/\s{3,}/g, "\n\n")
      .trim();
    if (signal?.aborted) return { success: false, error: String(signal.reason ?? "Operation cancelled") };
    return {
      success: true,
      url: result.final_url ?? input.url,
      title,
      text: text.slice(0, input.max_chars ?? 20000),
    };
  },
});



export const artifactTool = createTool({
  id: "save_artifact",
  description: "Save a named UTF-8 text artifact for a mission. Binary extensions such as PNG/JPEG/PDF are rejected; create binary files with shell.",
  inputSchema: z.object({
    mission_id: z.string(),
    name: z.string().describe("Filename, e.g. 'report.md' or 'result.json'"),
    content: z.string(),
    type: z.enum(["file", "text", "code", "data", "url"]).optional().default("text"),
  }),
  outputSchema: artifactOutputSchema,
  execute: async (input) => {
    try {
      const context = guard("save_artifact");
      if (input.mission_id !== context.missionId) throw new Error("Cross-mission artifact write denied");
      assertSafeArtifactName(input.name);
      assertTextToolTarget(input.name);
      assertNotQualifiedExecutable(qualifiedExecutablePathsFor(context.missionId),
        path.join(DATA_DIR, "artifacts", context.missionId, input.name));
      throwIfAborted(context.signal);
      const artifact = withToolEffect("save_artifact", "artifact save", () =>
        saveArtifactFile(input.mission_id, input.name, input.content, input.type ?? "text", { fence: context.fence }));
      context.artifactIds?.add(artifact.id);
      return { success: true, artifact_id: artifact.id, path: artifact.path };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});

// ─── All tools export ─────────────────────────────────────────────────────────

export const csvAnalyticsTool = createCsvAnalyticsTool({
  safePath: assertSafePath,
  approvedInput: (context) => {
    const mission = loadMission(context.missionId);
    if (!mission) throw new Error("CSV mission not found");
    const input = assertApprovedSpecBinding(mission).snapshot.specification.csv_input;
    if (!input) throw new Error("CSV execution requires approved input identity");
    return input;
  },
  approvedLimits: (context) => {
    const mission = loadMission(context.missionId);
    if (!mission) throw new Error("CSV mission not found");
    const spec = assertApprovedSpecBinding(mission).snapshot.specification;
    if (!spec.suggested_tools.includes("csv_analytics") || !spec.csv_limits) {
      throw new Error("CSV execution requires explicitly approved tool and limits");
    }
    return spec.csv_limits;
  },
  save: ({ missionId, name, content, context }) => {
    const artifact = context.withEffect?.(() => saveArtifactFile(missionId, name, content, "data", {
      fence: context.fence, signal: context.signal,
    }), { stage: "effect", tools: ["csv_analytics"] }) ?? saveArtifactFile(missionId, name, content, "data", {
      fence: context.fence, signal: context.signal,
    });
    if (!artifact.path) throw new Error("CSV artifact missing persisted path");
    return { id: artifact.id, path: artifact.path };
  },
});

export const allTools = {
  csv_analytics: csvAnalyticsTool,
  shell: shellTool,
  file_read: fileReadTool,
  file_write: fileWriteTool,
  file_list: fileListTool,
  web_fetch: webFetchTool,
  web_search: webSearchTool,
  web_extract: webExtractTool,
  save_artifact: artifactTool,
  ti_search: tiSearchTool,
  manus_search: manusSearchTool,
  capability_library: capabilityLibraryTool,
  ...browserTools,
};

// ─── Browser tools (Playwright MCP) ───────────────────────────────────────────
//
// Re-exported separately so the integrator can include them conditionally
// (only when isBrowserAvailable() returns true).  Each browser tool also
// checks availability internally and returns a graceful error when
// Playwright/Chromium is not installed, so they are safe to add to an
// agent's tool map unconditionally.
export { browserTools, isBrowserAvailable } from "./browser.js";
