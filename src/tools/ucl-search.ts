/**
 * Cortex Unified Capability Library — Nox bridge tool.
 *
 * WHAT THIS IS
 * A read-only discovery tool. It answers "what tooling exists for capability X"
 * from a local, deterministic index of 4,504 catalogued candidates, and returns
 * evidence for the EXISTING capability-acquisition loop in the Mission Manager.
 *
 * WHAT THIS IS NOT
 * - Not a permission system. It never grants, admits, approves or installs.
 * - Not an executor. It returns metadata; nothing is downloaded or run.
 * - Not a second orchestrator. The Manager still decides, plans and acts.
 *
 * Every effect boundary in Nox already enforces `assertToolAllowed`, so this
 * tool is gated exactly like `web_search` or `ti_search`: a mission that was not
 * granted `capability_library` cannot call it. That is the whole authorization
 * story, on purpose — a second one would be a second source of truth.
 *
 * Entries returned here are UNVETTED research candidates. Nox's own admission
 * (qualification + grants + PEP) remains the only path from "exists" to "runs".
 *
 * Feature flag: UCL_ENABLED=1 enables it. Off by default. With the flag off, or
 * with no database present, the tool answers with a clear "unavailable" payload
 * rather than throwing — a host must never be broken by an optional index.
 */
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertToolAllowed, throwIfAborted } from "../security/tool-context.js";
// Type-only: erased at compile time. The runtime modules (node:sqlite) are
// imported lazily inside execute(), after the flag check, so merely loading the
// tool registry never touches node:sqlite when the library is disabled.
import type { Store } from "../ucl/db.js";

/** Resolved per call so host flag, recovery and replacement tests are honest. */
function resolveDbPath(): string | null {
  const configured = process.env.UCL_DB;
  const candidates = configured
    ? [configured]
    : [
        path.resolve(process.cwd(), "data/db/ucl.sqlite"),
        path.resolve(process.cwd(), "data/ucl.sqlite"),
      ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // An unreadable path is treated like a missing one.
    }
  }
  return null;
}

function enabled(): boolean {
  const raw = (process.env.UCL_ENABLED ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Hazard-flagged rows are a security-review trigger. A model-supplied
 * `include_hazardous` is only honoured when the HOST has opted in; otherwise the
 * request is ignored and hazardous rows stay hidden. */
function hazardousAllowed(): boolean {
  const raw = (process.env.UCL_ALLOW_HAZARDOUS ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export const capabilityLibraryTool = createTool({
  id: "capability_library",
  description:
    "Search the Cortex Unified Capability Library: a local, deterministic index of " +
    "4,504 catalogued tools, MCP servers, skills and services, each tagged with " +
    "capabilities, hazards and provenance. Use it to discover reusable tooling for a " +
    "capability the mission needs, instead of inventing one. Returns short metadata " +
    "plus evidence and an explicit NOT-APPROVED marker. Results are research " +
    "candidates only: this tool never installs, executes, grants or qualifies anything, " +
    "and its output must not be treated as an approved tool grant. No model calls, no " +
    "network, no LLM.",
  inputSchema: z.object({
    need: z
      .string()
      .max(512)
      .optional()
      .describe("Free-text description of the capability needed, e.g. 'compare two screenshots pixel by pixel'"),
    capabilities: z
      .array(z.string())
      .max(8)
      .optional()
      .describe("Exact capability tags to filter on, e.g. ['browser.screenshot','code.test']"),
    kinds: z
      .array(z.string())
      .max(8)
      .optional()
      .describe("Restrict to record kinds, e.g. ['mcp_server','api','agent_skill']"),
    limit: z.number().int().min(1).max(20).optional().default(5).describe("Max candidates (default 5)"),
    include_hazardous: z
      .boolean()
      .optional()
      .default(false)
      .describe("Include records carrying a hazard flag. Off by default; hazardous rows are security-review triggers."),
  }),
  outputSchema: z.object({
    status: z.enum(["OK", "NOT_FOUND", "DISABLED", "UNAVAILABLE", "ERROR"]),
    candidates: z.array(
      z.object({
        candidate_id: z.string(),
        title: z.string(),
        url: z.string(),
        kind: z.string(),
        capabilities: z.array(z.string()),
        hazards: z.array(z.string()),
        trust_state: z.string(),
        score: z.number(),
        rationale: z.string(),
        evidence: z.array(z.string()),
      }),
    ),
    examined: z.number(),
    note: z.string(),
    /** Structurally impossible to be true. Present so a consumer that greps for a
     * grant field finds an explicit denial rather than an absent one. */
    approved: z.literal(false),
    execution_authority: z.literal(false),
  }),
  execute: async (input) => {
    assertToolAllowed("capability_library");
    throwIfAborted();

    if (!enabled()) {
      return {
        status: "DISABLED" as const,
        candidates: [],
        examined: 0,
        note: "Capability Library is disabled (UCL_ENABLED is not set). This is the default; the host is unaffected.",
        approved: false as const,
        execution_authority: false as const,
      };
    }

    const dbPath = resolveDbPath();
    if (!dbPath) {
      return {
        status: "UNAVAILABLE" as const,
        candidates: [],
        examined: 0,
        note: "No Capability Library index found. The host may restore the read-only index or set UCL_DB to its path. Missions continue normally.",
        approved: false as const,
        execution_authority: false as const,
      };
    }

    let store: Store | null = null;
    try {
      const { openStore, assertIndexFresh } = await import("../ucl/db.js");
      const { search } = await import("../ucl/librarian.js");
      // readOnly: no DDL, no writes, and a non-UCL SQLite file is refused.
      store = openStore({ path: dbPath, readOnly: true });
      assertIndexFresh(store);
      const result = search(store, {
        need: input.need,
        capabilities: input.capabilities as never,
        kinds: input.kinds as never,
        limit: input.limit ?? 5,
        hazards: input.include_hazardous && hazardousAllowed() ? "include" : "exclude",
      });
      return {
        status: result.status === "OK" ? ("OK" as const) : ("NOT_FOUND" as const),
        candidates: result.hits.map((hit) => ({
          candidate_id: hit.canonical_id,
          title: hit.title,
          url: hit.url,
          kind: hit.kind,
          capabilities: hit.capabilities as string[],
          hazards: hit.hazards as string[],
          trust_state: hit.trust_state,
          score: hit.score,
          rationale: hit.rationale,
          evidence: hit.evidence as string[],
        })),
        examined: result.examined,
        note:
          result.status === "OK"
            ? `${result.hits.length} candidate(s) from ${result.examined} examined. UNVETTED research metadata: not approved, not installed, not executed. Any real use requires a Nox tool grant and Nox qualification first.`
            : "No candidate matched. This is an honest abstain: the library does not invent candidates. Widen the query or treat the capability as missing.",
        approved: false as const,
        execution_authority: false as const,
      };
    } catch (error) {
      return {
        status: "ERROR" as const,
        candidates: [],
        examined: 0,
        note: `Capability Library lookup failed (${error instanceof Error ? error.name : "Error"}). The mission is unaffected; continue without it.`,
        approved: false as const,
        execution_authority: false as const,
      };
    } finally {
      try {
        store?.close();
      } catch {
        // Closing a read-only index must never surface as a mission failure.
      }
    }
  },
});
