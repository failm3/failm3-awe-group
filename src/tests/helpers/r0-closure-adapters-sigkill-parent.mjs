import * as fs from "node:fs";

const [missionId, command, cwd, readyFile] = process.argv.slice(2);
if (!missionId || !command || !cwd || !readyFile) throw new Error("fixture arguments required");
const { shellTool } = await import(new URL("../../tools/index.ts", import.meta.url).href);
const { runWithToolContext } = await import(new URL("../../security/tool-context.ts", import.meta.url).href);

const execution = runWithToolContext(
  { missionId, allowedTools: new Set(["shell"]) },
  () => shellTool.execute({ command, cwd, timeout_ms: 30000 }, {}),
);
// A potentially completed command is an error in this fixture; its whole job
// is to leave a running resistant process group when this owner is SIGKILLed.
void execution.then((result) => {
  console.error(`fixture shell unexpectedly settled: ${JSON.stringify(result)}`);
  process.exitCode = 1;
});

for (let attempt = 0; attempt < 500; attempt++) {
  if (fs.existsSync(readyFile)) {
    console.log("R0_PARENT_READY");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 10));
}
setInterval(() => {}, 1000);
