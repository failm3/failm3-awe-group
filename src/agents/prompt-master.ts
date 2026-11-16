import { Agent } from "@mastra/core/agent";
import { smartModel } from "../config/models.js";
import { SpecificationSchema } from "../types/index.js";
import type { Specification } from "../types/index.js";
import { createAgentMemory } from "../memory/index.js";
import { withModelCall } from "../utils/model-ledger.js";
import { extractJson } from "../utils/json-extract.js";

/**
 * Prompt Master: turns vague user requests into structured, approved
 * mission specifications with clear acceptance criteria.
 */
export const promptMasterAgent = new Agent({
  id: "prompt-master",
  name: "PromptMaster",
  instructions: `You are the AWE GROUP Prompt Master.

Your role is to transform any user request — however vague, broad or brief —
into a precise, structured mission specification.

You must:
1. Understand the true intent and desired outcome
2. Identify what success looks like (verifiable criteria)
3. Anticipate the tools and specialist agents needed
4. Flag ambiguities and risks clearly
5. Output a complete specification in the required JSON format
6. For descriptive transaction CSV analytics, prefer csv_analytics. It implements
   ANALYTICS-CONTRACT v1: event_id,order_id,currency,kind,amount_cents,status;
   USD/EUR separately, exact integers, deduplication and pending exclusion.
   This route requires explicit csv_limits {maxBytes,maxRows} and csv_input
   {path,sha256}. Do not invent an input digest; request it from the owner/input
   acquisition step when unavailable. Unsupported schemas are blockers.

You do NOT execute missions. You define them.

Be specific. Vague acceptance criteria will be rejected.
Never invent facts about the domain — if something is unclear, say so in risks.

Return ONLY the JSON object — no explanation, no markdown, no prose before or after.`,
  model: smartModel,
  memory: createAgentMemory("prompt-master"),
});

export async function createSpecification(
  userRequest: string
): Promise<Specification> {
  const response = await withModelCall({
    missionId: null, role: "prompt-master", model: smartModel.modelId, provider: smartModel.providerId,
  }, () => promptMasterAgent.generate([
    {
      role: "user",
      content: `Transform this request into a mission specification.
Return ONLY valid JSON — no markdown, no commentary, no preamble.

REQUEST: ${userRequest}

Required JSON structure:
{
  "title": "...",
  "objective": "...",
  "scope": "...",
  "acceptance_criteria": ["...", "..."],
  "suggested_tools": ["shell", "web_search", "web_extract", "file_write"],
  "suggested_agents": ["researcher", "coder", "writer"],
  "estimated_complexity": "trivial|simple|moderate|complex",
  "risks": ["...", "..."]
}`,
    },
  ]));

  const text = response.text.trim();
  const json = extractJson(text);

  try {
    const raw = JSON.parse(json);
    // Validate with Zod — catches missing fields and wrong types
    return SpecificationSchema.parse(raw);
  } catch (err) {
    throw new Error(
      `PromptMaster returned invalid specification: ${err}\nRaw response:\n${text.slice(0, 500)}`
    );
  }
}
