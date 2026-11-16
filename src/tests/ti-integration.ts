/**
 * Integration test: Head Agent calls ti_search against the live Manus v2 catalog.
 *
 * Run with:
 *   npx tsx src/tests/ti-integration.ts
 *
 * Success criteria:
 *   - Direct ti_search call returns real catalog records
 *   - Head Agent's generate() invokes ti_search
 *   - Agent produces a final summary acknowledging the catalog data
 */
import "dotenv/config";
import { headAgent } from "../agents/head-agent.js";
import { allTools } from "../tools/index.js";

const PASS = "\x1b[32m✓ PASS\x1b[0m";
const FAIL = "\x1b[31m✗ FAIL\x1b[0m";

async function main() {
  console.log("=== AWE Tool Intelligence Integration Test ===\n");

  // ── Step 1: Direct API call (no LLM) ─────────────────────────────────────
  console.log("Step 1: Direct ti_search call — query: 'browser automation'");

  const tiSearch = allTools.ti_search;
  if (!tiSearch.execute) {
    console.error(`  ${FAIL} ti_search has no execute function`);
    process.exit(1);
  }

  // Mastra tools accept (input, context) — context can be a minimal object
  const directResult = (await tiSearch.execute(
    { query: "browser automation", limit: 5, approved_only: false },
    {} as never
  )) as {
    items: Array<{ id: number; name: string; stage: string; capabilities?: string[] }>;
    total: number;
    catalog_note: string;
  };

  console.log(`  Catalog note: ${directResult.catalog_note}`);
  console.log(`  Items returned: ${directResult.items.length}`);
  if (directResult.items.length > 0) {
    directResult.items.forEach((item) => {
      const caps = item.capabilities?.slice(0, 3).join(", ") || "none";
      console.log(`    [${item.id}] ${item.name} (${item.stage}) — caps: ${caps}`);
    });
    console.log(`\n  ${PASS} Direct call returned ${directResult.items.length} real catalog records\n`);
  } else {
    console.log(`  ${FAIL} No items — catalog empty or API unreachable\n`);
    process.exit(1);
  }

  // ── Step 2: Verify catalog note is from real API (not fallback) ───────────
  console.log("Step 2: Verify API response is real (not error fallback)");
  const isRealResponse = directResult.catalog_note.includes("DISCOVERED") ||
    directResult.catalog_note.includes("lifecycle review");
  console.log(
    `  ${isRealResponse ? PASS : FAIL}  Catalog note references lifecycle status (real API response)\n`
  );

  // ── Step 3: Head Agent call with tool use ─────────────────────────────────
  console.log(
    "Step 3: Head Agent generate — asking it to use ti_search\n" +
    "  (LLM call via Router.Cheap — charges apply)\n"
  );

  const prompt =
    "Use the ti_search tool to look up what tools are available in the AWE " +
    "Tool Intelligence catalog for 'browser automation'. Then give a 2-3 sentence " +
    "summary of what you found: include tool names, their research stage, and whether " +
    "any are approved for use.";

  const response = await headAgent.generate([{ role: "user", content: prompt }]);

  // Extract tool call names using the pattern from mission-manager.ts
  const toolCallNames: string[] = (response.toolCalls ?? []).map(
    (tc) => (tc as unknown as { payload?: { toolName?: string }; toolName?: string })
      .payload?.toolName ?? (tc as unknown as { toolName?: string }).toolName ?? ""
  ).filter(Boolean);

  const calledTiSearch = toolCallNames.includes("ti_search");

  console.log(`  Tool calls made: [${toolCallNames.join(", ") || "none"}]`);
  console.log(`  ti_search invoked: ${calledTiSearch ? "yes" : "no"}`);
  console.log(`\n  Agent response:\n  "${response.text.trim()}"\n`);

  // ── Step 4: Checks ───────────────────────────────────────────────────────
  console.log("Step 4: Verification summary");

  const checks = [
    {
      name: "Direct ti_search returned catalog records",
      pass: directResult.items.length > 0,
    },
    {
      name: "API response is real (not error fallback)",
      pass: isRealResponse,
    },
    {
      name: "AWE_TI_API_TOKEN is set",
      pass: Boolean(process.env.AWE_TI_API_TOKEN),
    },
    {
      name: "Head Agent called ti_search",
      pass: calledTiSearch,
    },
    {
      name: "Agent produced a non-empty response",
      pass: response.text.trim().length > 0,
    },
  ];

  let allPassed = true;
  for (const check of checks) {
    const icon = check.pass ? PASS : FAIL;
    console.log(`  ${icon}  ${check.name}`);
    if (!check.pass) allPassed = false;
  }

  console.log("\n" + (allPassed ? "=== ALL CHECKS PASSED ===" : "=== SOME CHECKS FAILED ==="));
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
