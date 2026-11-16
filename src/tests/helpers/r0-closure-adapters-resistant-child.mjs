import * as fs from "node:fs";

const [readyFile, lateFile, delayRaw] = process.argv.slice(2);
if (!readyFile || !lateFile) throw new Error("ready and late files are required");
const delayMs = Number(delayRaw ?? 1200);
// Deliberately survive ordinary group termination so SIGKILL escalation and
// post-settlement side-effect fencing are exercised with a real OS process.
process.on("SIGTERM", () => {});
fs.writeFileSync(readyFile, `${process.pid}\n`);
setTimeout(() => {
  fs.writeFileSync(lateFile, `late effect from ${process.pid}\n`);
}, delayMs);
setInterval(() => {}, 1000);
