import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type { QualificationReceipt } from "../utils/qualification.js";

const root = fs.mkdtempSync(path.join(process.cwd(), ".r1-qualification-test-"));
process.env.AWE_DATA_DIR = path.join(root, "state");
const { createQualificationAuthority } = await import("../utils/qualification.js");
after(() => fs.rmSync(root, { recursive: true, force: true }));
let clock = 1000;
let grants = true;
const credential = Object.freeze({ hostOnly: true });
const policy = {
  issuers: [{ principal: "independent-qa", scopes: ["csv-descriptive"] }],
  authenticateIssuer: (value: unknown) => value === credential ? "independent-qa" : null,
  authorize: () => grants,
  now: () => clock,
};
const authority = createQualificationAuthority(policy);
const expected = {
  solverId: "csv-solver", scope: "csv-descriptive", specHash: "a".repeat(64),
  capabilityHash: "b".repeat(64), profileHash: "c".repeat(64),
};
function receipt(qualificationId: string): QualificationReceipt {
  return {
    ...expected, qualificationId, receiptId: `receipt-${qualificationId}`, issuer: "independent-qa",
    evidenceHash: "d".repeat(64), evidenceRefs: ["fixture:independent-qa-v1"], issuedAt: 1000, expiresAt: 2000,
  };
}
function qualify(name: string) { return authority.qualify(receipt(name), credential, 0); }

test("host-issued receipt admits exact provenance; local dispatch and acceptance persist", () => {
  qualify("positive");
  const admission = authority.admit("positive", expected);
  const output = path.join(root, "result.csv");
  authority.withAdmission(admission, "dispatch", () => fs.writeFileSync(output, "currency,total\nUSD,12\n"));
  assert.equal(authority.withAdmission(admission, "acceptance", () => fs.readFileSync(output, "utf8")), "currency,total\nUSD,12\n");
  assert.equal(createQualificationAuthority(policy).inspect("positive")?.admissions[0].admissionId, admission.admissionId);
  assert.equal(authority.inspect("positive")?.status, "provisional");
});

test("claimed issuer, solver self-issue, wrong scope, missing evidence and absent receipt deny", () => {
  assert.throws(() => authority.qualify(receipt("forged"), { issuer: "independent-qa" }, 0), /unauthenticated/);
  assert.throws(() => authority.qualify({ ...receipt("self"), solverId: "independent-qa" }, credential, 0), /independent/);
  assert.throws(() => authority.qualify({ ...receipt("scope"), scope: "all-work" }, credential, 0), /authorized/);
  assert.throws(() => authority.qualify({ ...receipt("evidence"), evidenceRefs: [] }, credential, 0), /invalid/);
  assert.throws(() => authority.qualify({ ...receipt("hash"), profileHash: "unknown" }, credential, 0), /invalid/);
  assert.throws(() => authority.admit("absent", expected), /missing/);
  assert.equal(authority.inspect("forged"), null);
});

test("every binding and live host policy gate admission/dispatch/acceptance", () => {
  qualify("bindings");
  for (const [field, value] of Object.entries(expected)) {
    const replacement = field.endsWith("Hash") ? "f".repeat(64) : `${value}-wrong`;
    assert.throws(() => authority.admit("bindings", { ...expected, [field]: replacement }), /mismatch/);
  }
  const admission = authority.admit("bindings", expected);
  let effects = 0;
  grants = false;
  try {
    assert.throws(() => authority.admit("bindings", expected), /grants/);
    for (const phase of ["dispatch", "acceptance"] as const) {
      assert.throws(() => authority.withAdmission(admission, phase, () => ++effects), /grants/);
    }
  } finally { grants = true; }
  assert.throws(() => authority.withAdmission({ ...admission, admissionId: "invented" }, "dispatch", () => ++effects), /admission/);
  assert.throws(() => authority.withAdmission({ ...admission, expiresAt: 9999 }, "dispatch", () => ++effects), /admission/);
  assert.equal(effects, 0);
});

test("revoke increments generation; restart and requalification never resurrect old admission", () => {
  qualify("revoke");
  const old = authority.admit("revoke", expected);
  assert.throws(() => authority.revoke("revoke", 1, null, "bad credential"), /unauthenticated/);
  assert.equal(authority.revoke("revoke", 1, credential, "known bad control").generation, 2);
  const restarted = createQualificationAuthority(policy);
  let effects = 0;
  assert.throws(() => restarted.admit("revoke", expected), /revoked/);
  for (const phase of ["dispatch", "acceptance"] as const) {
    assert.throws(() => restarted.withAdmission(old, phase, () => ++effects), /revoked/);
  }
  assert.throws(() => authority.qualify(receipt("revoke"), credential, 2), /replayed/);
  const fresh = { ...receipt("revoke"), receiptId: "fresh-receipt" };
  assert.throws(() => authority.qualify(fresh, credential, 1), /generation/);
  assert.equal(authority.qualify(fresh, credential, 2).generation, 3);
  assert.throws(() => restarted.withAdmission(old, "dispatch", () => ++effects), /stale/);
  restarted.withAdmission(restarted.admit("revoke", expected), "dispatch", () => ++effects);
  assert.equal(effects, 1);
  assert.equal(restarted.inspect("revoke")?.transitions.length, 3);
});

test("expiry and withdrawn issuer policy deny after restart without effects", () => {
  qualify("expiry");
  const admission = authority.admit("expiry", expected);
  let effects = 0;
  clock = 2000;
  try {
    assert.throws(() => authority.admit("expiry", expected), /expired/);
    assert.throws(() => authority.withAdmission(admission, "dispatch", () => ++effects), /expired/);
    assert.throws(() => authority.withAdmission(admission, "acceptance", () => ++effects), /expired/);
    assert.throws(() => authority.qualify(receipt("expired-issue"), credential, 0), /validity/);
  } finally { clock = 1000; }
  const withdrawn = createQualificationAuthority({ ...policy, issuers: [] });
  assert.throws(() => withdrawn.withAdmission(admission, "dispatch", () => ++effects), /authorized/);
  assert.equal(effects, 0);
});

test("corrupt state fails closed and remains intact; binding cannot change under same id", () => {
  qualify("corrupt");
  const file = path.join(process.env.AWE_DATA_DIR!, "qualifications", "corrupt.json");
  fs.writeFileSync(file, "{broken");
  assert.throws(() => authority.admit("corrupt", expected), /corrupt/);
  assert.throws(() => authority.qualify(receipt("corrupt"), credential, 0), /corrupt/);
  assert.equal(fs.readFileSync(file, "utf8"), "{broken");
  qualify("immutable");
  assert.throws(() => authority.qualify({ ...receipt("immutable"), receiptId: "new", specHash: "f".repeat(64) }, credential, 1), /binding/);
  assert.throws(() => authority.inspect("../escape"), /invalid/);
});

test("fence rejects reentrant revoke and async callbacks before async effect starts", () => {
  qualify("reentry");
  const admission = authority.admit("reentry", expected);
  const other = createQualificationAuthority(policy);
  authority.withAdmission(admission, "dispatch", () => {
    assert.throws(() => other.revoke("reentry", 1, credential, "inside callback"), /reentrant/);
  });
  let effects = 0;
  // Deliberately bypass the compile-time synchronous callback contract.
  assert.throws(() => authority.withAdmission(admission, "dispatch", (async () => { effects++; }) as never), /synchronous/);
  assert.equal(effects, 0);
});

const moduleUrl = new URL("../utils/qualification.ts", import.meta.url).href;
function child(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const processChild = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
      cwd: process.cwd(), env: { PATH: process.env.PATH, AWE_DATA_DIR: process.env.AWE_DATA_DIR }, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    const timeout = setTimeout(() => processChild.kill("SIGKILL"), 15000);
    processChild.stdout.on("data", (chunk) => { stdout += chunk; });
    processChild.stderr.on("data", (chunk) => { stderr += chunk; });
    processChild.on("error", reject);
    processChild.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout.trim()); else reject(new Error(`child ${code}: ${stderr}`));
    });
  });
}
const childSetup = `
  import { createQualificationAuthority } from ${JSON.stringify(moduleUrl)};
  const authority = createQualificationAuthority({
    issuers: [{ principal: 'independent-qa', scopes: ['csv-descriptive'] }],
    authenticateIssuer: value => value === 'host-fixture' ? 'independent-qa' : null,
    authorize: () => true, now: () => 1000,
  });
`;

test("real concurrent writers CAS exactly once; fresh process denies stale admission", async () => {
  qualify("race");
  const admission = authority.admit("race", expected);
  const writer = `${childSetup}
    try { authority.revoke('race', 1, 'host-fixture', 'concurrent revoke'); console.log('revoked'); }
    catch (error) { if (!/stale generation/.test(String(error))) throw error; console.log('stale'); }
  `;
  assert.deepEqual((await Promise.all([child(writer), child(writer)])).sort(), ["revoked", "stale"]);
  assert.equal(authority.inspect("race")?.generation, 2);
  const marker = path.join(root, "forbidden-effect");
  const output = await child(`${childSetup}
    import fs from 'node:fs';
    try {
      authority.withAdmission(${JSON.stringify(admission)}, 'dispatch', () => fs.writeFileSync(${JSON.stringify(marker)}, 'bad'));
      throw new Error('unexpected admission');
    } catch (error) { if (!/revoked/.test(String(error))) throw error; console.log('denied'); }
  `);
  assert.equal(output, "denied");
  assert.equal(fs.existsSync(marker), false);
});

test("dispatch and revoke serialize across processes; final acceptance rechecks generation", async () => {
  qualify("dispatch-race");
  const admission = authority.admit("dispatch-race", expected);
  const entered = path.join(root, "dispatch-entered");
  const attempting = path.join(root, "revoke-attempting");
  const completed = path.join(root, "dispatch-completed");
  const dispatch = child(`${childSetup}
    import fs from 'node:fs';
    authority.withAdmission(${JSON.stringify(admission)}, 'dispatch', () => {
      fs.writeFileSync(${JSON.stringify(entered)}, 'inside locked effect');
      const deadline = Date.now() + 5000;
      while (!fs.existsSync(${JSON.stringify(attempting)})) {
        if (Date.now() > deadline) throw new Error('revoker never started');
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      fs.writeFileSync(${JSON.stringify(completed)}, 'authorized effect completed');
    });
    console.log('dispatched');
  `);
  // Observe entry into the actual critical section before starting the revoker.
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(entered) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!fs.existsSync(entered)) {
    await dispatch;
    assert.fail("dispatch did not enter critical section");
  }
  const revoke = child(`${childSetup}
    import fs from 'node:fs';
    fs.writeFileSync(${JSON.stringify(attempting)}, 'attempt revoke');
    authority.revoke('dispatch-race', 1, 'host-fixture', 'revoke during dispatch');
    if (!fs.existsSync(${JSON.stringify(completed)})) throw new Error('revoke overtook locked effect');
    console.log('revoked-after-dispatch');
  `);
  assert.deepEqual(await Promise.all([dispatch, revoke]), ["dispatched", "revoked-after-dispatch"]);
  const accepted = path.join(root, "forbidden-acceptance");
  assert.throws(() => authority.withAdmission(admission, "acceptance", () => fs.writeFileSync(accepted, "bad")), /revoked/);
  assert.equal(fs.existsSync(accepted), false);
});
