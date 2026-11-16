/**
 * AWE Manus Catalog search tool.
 *
 * Queries the Stage 3 read-only Manus Public Index API — 3415 NIVICT tool
 * catalog entries imported into a separate `manus_catalog` schema.
 *
 * This is a *research index*: it tells agents what tooling exists in the
 * wild. Nothing here is approved for automatic execution — the entry's
 * `stage` field reflects where the entry is in the Manus curation pipeline.
 *
 * Query forms:
 *   - keyword   "browser automation"   → full-text search over resource names
 *   - id lookup "id:86"                → exact resource by Manus ID
 *   - stage     "stage:DOCUMENTED"      → all resources at a given stage
 */
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { assertToolAllowed, getToolContext } from "../security/tool-context.js";

const MANUS_API_URL = process.env.AWE_MANUS_API_URL || "http://127.0.0.1:8872";

export const manusSearchTool = createTool({
  id: "manus_search",
  description:
    "Search the 3415-entry NIVICT/Manus tool catalog for existing open-source tooling. " +
    "Use it to discover reusable libraries, MCP servers, skills and SDKs instead of " +
    "reinventing them. Query forms: 'browser automation' (keyword), 'id:86' (exact " +
    "lookup), 'stage:DOCUMENTED' (filter by curation stage). " +
    "Returned entries are research candidates only — none are approved for " +
    "automatic execution.",
  inputSchema: z.object({
    query: z
      .string()
      .describe(
        "Search query. Keyword for full-text search, 'id:N' for exact lookup, 'stage:X' to filter by stage.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Max results to return (default 10)"),
  }),
  outputSchema: z.object({
    items: z.array(
      z.object({
        manus_id: z.number(),
        name: z.string(),
        stage: z.string(),
        source_row: z.number(),
        source_sha256: z.string(),
        urls: z.array(
          z.object({
            field: z.string(),
            url: z.string(),
            canonical_url: z.string(),
            entity_id: z.string(),
          })
        ),
      })
    ),
    total: z.number(),
    catalog_note: z.string(),
  }),
  execute: async (input) => {
    assertToolAllowed("manus_search");
    const { query, limit = 10 } = input;

    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const url = `${MANUS_API_URL}/search?${params}`;

    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(getToolContext()?.signal ? [getToolContext()!.signal!] : [])]),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          items: [],
          total: 0,
          catalog_note: `Manus catalog API error ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {
        results?: unknown[];
        count?: number;
      };

      const items = (data.results || []) as Array<{
        manus_id: number;
        name: string;
        stage: string;
        source_row: number;
        source_sha256: string;
        urls?: Array<{
          field: string;
          url: string;
          canonical_url: string;
          entity_id: string;
        }>;
      }>;

      return {
        items: items.map((item) => ({
          manus_id: item.manus_id,
          name: item.name,
          stage: item.stage || "UNKNOWN",
          source_row: item.source_row,
          source_sha256: item.source_sha256,
          urls: item.urls || [],
        })),
        total: data.count ?? items.length,
        catalog_note:
          "Results from the 3415-entry NIVICT/Manus tool index (read-only). " +
          "stage reflects the Manus curation pipeline, not AWE approval. " +
          "No entry is approved for automatic execution.",
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        items: [],
        total: 0,
        catalog_note: `Manus catalog API unreachable at ${MANUS_API_URL}: ${message}`,
      };
    }
  },
});
