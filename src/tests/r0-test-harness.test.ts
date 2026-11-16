import assert from "node:assert/strict";
import { getModel } from "../config/models.js";

assert.equal(process.env.AWE_OFFLINE_TEST, "1", "offline runner must set its guard");
const model = getModel("offline-probe");
assert.equal(model.url, "http://127.0.0.1:9/v1");
assert.equal(model.apiKey, "offline-test-only");
console.log("offline test harness: PASS — model endpoint is local and credential is synthetic");
