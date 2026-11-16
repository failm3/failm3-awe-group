import assert from "node:assert/strict";
import net from "node:net";

globalThis.fetch = async () => { throw new Error("Offline: fetch prohibited"); };
net.Socket.prototype.connect = function () { throw new Error("Offline: network prohibited"); };
const rec = await import("../agents/recursion.js");
const [action, id] = process.argv.slice(2);
rec.resetSession(id);
if (action === "resume") {
  assert.equal(rec.getSession(id).spawned, rec.RECURSION_LIMITS.maxTotalAgents);
  assert.throws(() => rec.registerTopLevelNode(id, "worker", "effect 13"), /spawn budget exhausted/);
  const result = await rec.runDelegateCall(id, null, 0, { role: "leaf", task: "no effect" });
  assert.match(result.refused_reason!, /spawn budget exhausted/);
} else {
  assert.equal(action, "race");
  let reserved = 0;
  for (let i = 0; i < 8; i++) {
    try {
      rec.registerTopLevelNode(id, "worker", `effect ${process.pid}-${i}`);
      reserved++;
    } catch (error) {
      assert.match(String(error), /spawn budget exhausted/);
    }
  }
  console.log(`RESERVED ${reserved}`);
}
console.log("ASSERTIONS_COMPLETED");
