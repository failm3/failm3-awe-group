/**
 * Probe: inspect the actual runtime shape of Agent.generate() results.
 * Goal: find where token usage / model id / tool calls live so AWE can
 * record cost and model selection per delegation.
 */
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envFile = path.join(process.cwd(), ".env");
if (fs.existsSync(envFile)) dotenv.config({ path: envFile });

const { Agent } = await import("@mastra/core/agent");
const { getModel } = await import("../config/models.js");

const agent = new Agent({
  id: "probe",
  name: "Probe",
  instructions: "Reply with the single word: ok",
  model: getModel("deepseek-v4-flash"),
});

const res: any = await agent.generate([{ role: "user", content: "say ok" }]);

console.log("=== TOP-LEVEL KEYS ===");
console.log(Object.keys(res).sort().join("\n"));

console.log("\n=== usage-ish fields ===");
for (const k of ["totalUsage", "usage", "experimental_telemetry", "metrics"]) {
  console.log(`${k}:`, JSON.stringify(res[k]) ?? "undefined");
}

console.log("\n=== model info ===");
for (const k of ["model", "modelId", "providerId"]) {
  console.log(`${k}:`, JSON.stringify(res[k]) ?? "undefined");
}

console.log("\n=== steps[0] keys ===");
if (Array.isArray(res.steps) && res.steps[0]) {
  console.log(Object.keys(res.steps[0]).sort().join("\n"));
  console.log("step.usage:", JSON.stringify(res.steps[0].usage));
  console.log("step.model:", JSON.stringify(res.steps[0].model));
}
