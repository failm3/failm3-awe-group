/**
 * AWE Tool Intelligence search tool.
 * Queries the Manus AWE Tool Intelligence v2 catalog API for researched tools.
 * Resources returned are DISCOVERED/DOCUMENTED candidates — not approved for auto-execution.
 */
import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { assertToolAllowed, getToolContext, throwIfAborted } from "../security/tool-context.js";

const TI_API_URL = process.env.AWE_TI_API_URL || "http://127.0.0.1:8871";
const TI_API_TOKEN = process.env.AWE_TI_API_TOKEN || "";

export const tiSearchTool = createTool({
  id: "ti_search",
  description:
    "Search the AWE Tool Intelligence catalog for researched tools and libraries. " +
    "Returns tools that have been researched by Manus with their capabilities, stage, " +
    "limitations, and integration status. DISCOVERED/DOCUMENTED resources are research " +
    "candidates only — they are not approved for automatic execution.",
  inputSchema: z.object({
    query: z.string().describe("Search query, e.g. 'browser automation', 'web scraping', 'MCP server'"),
    limit: z.number().int().min(1).max(20).optional().default(10).describe("Max results to return"),
    approved_only: z.boolean().optional().default(false).describe("If true, return only APPROVED resources (currently 0 in catalog)"),
  }),
  outputSchema: z.object({
    items: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        resource_type: z.string().optional(),
        description: z.string().optional(),
        stage: z.string(),
        capabilities: z.array(z.string()).optional(),
        integrations: z.array(z.string()).optional(),
        official_url: z.string().optional(),
        repository_url: z.string().optional(),
        limitations: z.array(z.string()).optional(),
        decision: z.string().optional(),
      })
    ),
    total: z.number(),
    catalog_note: z.string(),
  }),
  execute: async (input) => {
    assertToolAllowed("ti_search");
    const { query, limit = 10, approved_only = false } = input;

    if (!TI_API_TOKEN) {
      return {
        items: [],
        total: 0,
        catalog_note: "AWE_TI_API_TOKEN not set — Tool Intelligence catalog unavailable",
      };
    }

    const params = new URLSearchParams({
      q: query,
      semantic: "false",
      limit: String(limit),
    });
    if (approved_only) {
      params.set("approved_only", "true");
    }

    const url = `${TI_API_URL}/v1/search?${params}`;

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${TI_API_TOKEN}`,
          Accept: "application/json",
        },
        signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(getToolContext()?.signal ? [getToolContext()!.signal!] : [])]),
      });

      if (!res.ok) {
        const text = await res.text();
        return {
          items: [],
          total: 0,
          catalog_note: `Tool Intelligence API error ${res.status}: ${text.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {
        items?: unknown[];
        total?: number;
      };

      const items = (data.items || []) as Array<{
        id: number;
        name: string;
        resource_type?: string;
        description?: string;
        stage?: string;
        capabilities?: string[];
        integrations?: string[];
        official_url?: string;
        repository_url?: string;
        limitations?: string[];
        decision?: string;
      }>;

      return {
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          resource_type: item.resource_type,
          description: item.description,
          stage: item.stage || "UNKNOWN",
          capabilities: item.capabilities || [],
          integrations: item.integrations || [],
          official_url: item.official_url,
          repository_url: item.repository_url,
          limitations: item.limitations || [],
          decision: item.decision,
        })),
        total: data.total ?? items.length,
        catalog_note:
          "Results from AWE Tool Intelligence v2 catalog. Stage DISCOVERED/DOCUMENTED = research candidate only. No resource is approved for automatic execution without full lifecycle review.",
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        items: [],
        total: 0,
        catalog_note: `Tool Intelligence API unreachable: ${message}`,
      };
    }
  },
});
