import * as fs from "node:fs";
const [missionId, resultFile, gateFile] = process.argv.slice(2);
const { tryAcquireMissionLease } = await import("../../agents/lifecycle.ts");
const { loadMission } = await import("../../utils/storage.js");
if (!gateFile) throw new Error("gate file is required");

// Signal only after imports are complete, then wait for the parent to open the
// gate immediately BEFORE invoking reconciliation. Reconciliation acquires the
// recovery lease synchronously before its first await, so this process cannot
// acquire the dead run lease in the pre-recovery window.
console.log("READY");
const gateDeadline = Date.now() + 10_000;
while (!fs.existsSync(gateFile) && Date.now() < gateDeadline) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
if (!fs.existsSync(gateFile)) throw new Error("recovery start gate was not opened");

// Start before recovery and contend repeatedly. An acquisition is a violation
// only while the old mission is still running. Once recovery has published
// `paused`, its quiescence work is complete and the normal handoff is allowed.
const deadline = Date.now() + 10_000;
while (Date.now() < deadline) {
  if (loadMission(missionId)?.status === "paused") {
    console.log("RECOVERY_COMPLETED_WITHOUT_OVERLAP");
    process.exit(0);
  }
  const lease = tryAcquireMissionLease(missionId, "resume");
  if (lease) {
    const status = loadMission(missionId)?.status;
    lease.release();
    if (status !== "paused") {
      fs.writeFileSync(resultFile, `replacement-overlap:${status}`);
      console.log(`ACQUIRED_DURING_${status}`);
      process.exit(1);
    }
    console.log("ACQUIRED_AFTER_PAUSED");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 5));
}
throw new Error("recovery did not publish paused before contender deadline");
