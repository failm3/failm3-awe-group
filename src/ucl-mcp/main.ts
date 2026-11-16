/**
 * AWE GROUP — Unified Capability Library over MCP (stdio).
 *
 * WHAT THIS IS
 * The SECOND, independent consumer of the same library `src/tools/ucl-search.ts`
 * exposes to AWE GROUP itself. AWE GROUP reads the index in-process during a
 * mission; OpenCode (or any MCP client) reads it here, as a separate process, so
 * one human can reuse the catalogue while developing AWE GROUP. One library, two
 * consumers, separate credentials: this server never touches a provider key and
 * needs none — it opens one local SQLite file read-only.
 *
 * WHAT THIS IS NOT
 * - Not a permission system, not an installer, not an executor. It returns
 *   metadata. Nothing is downloaded, granted, qualified or run.
 * - Not a second implementation of the library. Search and inventory are the
 *   existing `src/ucl/librarian` functions, unmodified; this file only adapts
 *   them to MCP's tool contract, exactly as the in-process tool does.
 * - Not a way around admission. AWE GROUP's qualification + grants remain the
 *   only path from "exists" to "runs". Every response says so structurally.
 *
 * Run: npx tsx src/ucl-mcp/main.ts   (speaks MCP on stdin/stdout; logs go to stderr)
 * Configure in OpenCode as a local MCP server with that command.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "awe-ucl";
const SERVER_VERSION = "1.0.0";

/** Resolved per call so a relocated index does not require a restart. */
function resolveDbPath(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const configured = process.env.UCL_DB;
  const candidates = configured
    ? [configured]
    : [
        path.resolve(process.cwd(), "data/db/ucl.sqlite"),
        path.resolve(here, "../../data/db/ucl.sqlite"),
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

/** A hazardous row is a security-review trigger. The client's request is only
 * honoured when the OPERATOR opted in on this server's environment. */
function hazardousAllowed(): boolean {
  const raw = (process.env.UCL_ALLOW_HAZARDOUS ?? "0").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

const NOT_APPROVED = {
  approved: false as const,
  execution_authority: false as const,
  note:
    "UNVETTED research metadata: nothing here is approved, installed, qualified or executed. " +
    "A catalogue entry grants no execution right; real use goes through AWE GROUP admission " +
    "(qualification + explicit grant) or an equivalent decision by the operator.",
};

/** Open the delivered index read-only, run the work, always close. */
async function withLibrary(
  work: (context: {
    dbPath: string;
    store: import("../ucl/db.js").Store;
    search: typeof import("../ucl/librarian.js").search;
    stats: typeof import("../ucl/librarian.js").stats;
  }) => object
) {
  const dbPath = resolveDbPath();
  if (!dbPath) {
    return {
      status: "UNAVAILABLE" as const,
      note:
        "No capability index found. Set UCL_DB to the read-only index path or place it at " +
        "data/db/ucl.sqlite relative to the server's working directory. Nothing else is affected.",
    };
  }
  // Loaded lazily: merely starting the server must not touch node:sqlite.
  const { openStore, assertIndexFresh } = await import("../ucl/db.js");
  const librarian = await import("../ucl/librarian.js");
  // readOnly: no DDL, no writes, and a foreign SQLite file is refused rather
  // than read as if it were the library.
  const store = openStore({ path: dbPath, readOnly: true });
  try {
    assertIndexFresh(store);
    return { ...work({ dbPath, store, search: librarian.search, stats: librarian.stats }), dbPath };
  } finally {
    try {
      store.close();
    } catch {
      // Closing a read-only index must never surface as a tool failure.
    }
  }
}

function buildServer(): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  server.registerTool(
    "capability_search",
    {
      title: "Search the Unified Capability Library",
      description:
        "Search a local, deterministic index of catalogued tools, MCP servers, Agent Skills, APIs, " +
        "workflows and verification references. Use it to find reusable tooling for a capability " +
        "instead of inventing one. Returns compact metadata plus evidence and a NOT-APPROVED marker. " +
        "No network, no model call, no installation. Deterministic for identical input and index.",
      inputSchema: z.object({
        need: z
          .string()
          .max(512)
          .optional()
          .describe("What capability is needed, in words, e.g. 'compare two screenshots pixel by pixel'"),
        capabilities: z
          .array(z.string())
          .max(8)
          .optional()
          .describe("Exact capability tags, e.g. ['browser.screenshot','code.test']"),
        kinds: z
          .array(z.string())
          .max(8)
          .optional()
          .describe("Restrict record kinds: mcp_server, api, agent_skill, script_cli, knowledge_source, workflow, agent_recipe, verifier, reference_or_service, unknown"),
        limit: z.number().int().min(1).max(20).optional().describe("Max candidates (default 5)"),
        include_hazardous: z
          .boolean()
          .optional()
          .describe("Ask for hazard-flagged records. Still hidden unless the server operator set UCL_ALLOW_HAZARDOUS=1."),
      }),
    },
    async (input) => {
      const outcome = await withLibrary(({ store, search }) => searchPayload(store, search, input));
      if ((outcome as any).status === "UNAVAILABLE") {
        // A missing index is a describable state, not a tool failure: the client
        // gets the same structure with an explicit status and remedy.
        return respond({ ...NOT_APPROVED, status: "UNAVAILABLE", permissions: "NONE", note: (outcome as any).note });
      }
      return respond(outcome);
    }
  );

  server.registerTool(
    "capability_inventory",
    {
      title: "Unified Capability Library inventory",
      description:
        "Counts of catalogued records, preserved source rows, hazard-flagged records and qualified " +
        "records. Use it to check the library is present and current before relying on its results.",
      inputSchema: z.object({}),
    },
    async () => {
      const outcome = await withLibrary(({ dbPath, store, stats }) => ({
        status: "OK" as const,
        index: dbPath,
        counts: stats(store),
        permissions: "NONE" as const,
        ...NOT_APPROVED,
      }));
      if ((outcome as any).status === "UNAVAILABLE") {
        // A missing index is a describable state, not a tool failure: the client
        // gets the same structure with an explicit status and remedy.
        return respond({ ...NOT_APPROVED, status: "UNAVAILABLE", permissions: "NONE", note: (outcome as any).note });
      }
      return respond(outcome);
    }
  );

  return server;
}

/** The search call itself is the librarian's, unchanged; this only shapes it. */
function searchPayload(
  store: import("../ucl/db.js").Store,
  search: typeof import("../ucl/librarian.js").search,
  input: { need?: string; capabilities?: string[]; kinds?: string[]; limit?: number; include_hazardous?: boolean }
) {
  const result = search(store, {
    need: input.need,
    capabilities: input.capabilities as never,
    kinds: input.kinds as never,
    limit: input.limit ?? 5,
    hazards: input.include_hazardous && hazardousAllowed() ? "include" : "exclude",
  });
  return {
    status: result.status,
    candidates: result.hits.map((hit: any) => ({
      candidate_id: hit.canonical_id,
      title: hit.title,
      url: hit.url,
      kind: hit.kind,
      capabilities: hit.capabilities,
      hazards: hit.hazards,
      trust_state: hit.trust_state,
      score: hit.score,
      rationale: hit.rationale,
      evidence: hit.evidence,
    })),
    examined: result.examined,
    query_digest: result.query_digest,
    library_rationale: result.rationale,
    permissions: result.permissions,
    ...NOT_APPROVED,
  };
}

/** One text block carrying the JSON, plus the same object as structured content. */
function respond(payload: unknown) {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    ...(typeof payload === "object" && payload !== null ? { structuredContent: payload as Record<string, unknown> } : {}),
  };
}

// The entry owns the transport, so the file is safe to run directly and safe to
// import from a test that only wants `buildServer`.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  serveStdio(buildServer, {
    onerror: (error: Error) => process.stderr.write(`${SERVER_NAME}: ${error.message}\n`),
  });
}

export { buildServer };
