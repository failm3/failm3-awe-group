/**
 * R2-UCL-MCP — the second consumer of the Unified Capability Library.
 *
 * The library has two independent readers over ONE index:
 *   - AWE GROUP, in-process, through `src/tools/ucl-search.ts` during a mission;
 *   - OpenCode (or any MCP client), out-of-process, through `src/ucl-mcp/main.ts`.
 *
 * This suite drives the MCP server the way a client actually does: a real child
 * process speaking JSON-RPC over stdin/stdout. It proves the handshake, the tool
 * surface, that both consumers return the same ranking from the same bytes, that
 * the index is never written, that hazardous rows stay hidden unless the server
 * operator opted in, and that a missing index degrades to a payload instead of a
 * crash. It asserts no execution authority anywhere.
 *
 * Run: node scripts/run-offline-tests.mjs src/tests/r2-ucl-mcp.test.ts
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const entry = path.join(root, "src/ucl-mcp/main.ts");
const tsx = path.join(root, "node_modules/.bin/tsx");
const index = process.env.UCL_TEST_DB ?? path.join(root, "data/db/ucl.sqlite");
if (!fs.existsSync(index)) {
  throw new Error(`No capability index at ${index}. This suite must not report a pass without executing against the real library.`);
}
const digestOfIndex = () => crypto.createHash("sha256").update(fs.readFileSync(index)).digest("hex");
const before = digestOfIndex();

interface Session {
  child: ChildProcessWithoutNullStreams;
  request(method: string, params?: unknown): Promise<any>;
  notify(method: string, params?: unknown): void;
  close(): Promise<void>;
}

/** A real MCP client: newline-delimited JSON-RPC over the server's stdio. */
function connect(env: Record<string, string>, dbPath: string = index): Session {
  const child = spawn(tsx, [entry], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, UCL_DB: dbPath, ...env },
  });
  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const waiting = new Map<number, (message: any) => void>();
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    for (let cut = buffer.indexOf("\n"); cut >= 0; cut = buffer.indexOf("\n")) {
      const line = buffer.slice(0, cut).trim();
      buffer = buffer.slice(cut + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const resolve = message.id !== undefined ? waiting.get(message.id) : undefined;
      if (resolve) { waiting.delete(message.id); resolve(message); }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  const raw = new Promise<number>((resolve) => child.on("exit", (code) => resolve(code ?? -1)));
  return {
    child,
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        waiting.set(id, resolve);
        child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) }) + "\n");
        const timer = setTimeout(() => reject(new Error(`timeout on ${method}; stderr: ${stderr.slice(-300)}`)), 30000);
        timer.unref?.();
        const settle = waiting.get(id)!;
        waiting.set(id, (message) => { clearTimeout(timer); settle(message); });
      });
    },
    notify(method, params) {
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) }) + "\n");
    },
    async close() {
      child.stdin.end();
      await raw;
    },
  };
}

async function handshake(session: Session): Promise<any> {
  const init = await session.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "r2-ucl-mcp-test", version: "0" },
  });
  session.notify("notifications/initialized");
  return init;
}

/** Tool payloads arrive as text and as structuredContent; prefer the object. */
function payload(result: any): any {
  if (result?.structuredContent) return result.structuredContent;
  const text = result?.content?.[0]?.text ?? "";
  try { return JSON.parse(text); } catch { return { text }; }
}

// ── 1. The default server: handshake, surface, real answers ──────────────────
const session = connect({});
try {
  const init = await handshake(session);
  check("server identifies itself", init.result?.serverInfo?.name === "awe-ucl", JSON.stringify(init.result?.serverInfo));
  check("protocol version is negotiated", typeof init.result?.protocolVersion === "string", String(init.result?.protocolVersion));
  check("tools capability is advertised", !!init.result?.capabilities?.tools, JSON.stringify(init.result?.capabilities));

  const listed = await session.request("tools/list");
  const names = (listed.result?.tools ?? []).map((tool: any) => tool.name).sort();
  check("exactly the two read-only tools are exposed", JSON.stringify(names) === JSON.stringify(["capability_inventory", "capability_search"]), JSON.stringify(names));
  const searchTool = (listed.result?.tools ?? []).find((tool: any) => tool.name === "capability_search");
  check("search schema advertises its arguments", ["need", "capabilities", "kinds", "limit", "include_hazardous"].every((key) => key in (searchTool?.inputSchema?.properties ?? {})), JSON.stringify(Object.keys(searchTool?.inputSchema?.properties ?? {})));

  const inventory = payload((await session.request("tools/call", { name: "capability_inventory", arguments: {} })).result);
  const librarianStats = await import("../ucl/librarian.js");
  const { openStore } = await import("../ucl/db.js");
  const store = openStore({ path: index, readOnly: true });
  const direct = librarianStats.stats(store);
  store.close();
  check("inventory matches the library's own counts", JSON.stringify(inventory.counts) === JSON.stringify(direct), `${JSON.stringify(inventory.counts)} vs ${JSON.stringify(direct)}`);
  check("inventory reports the index it read", path.resolve(inventory.index ?? "") === path.resolve(index), String(inventory.index));
  check("inventory carries no execution authority", inventory.permissions === "NONE" && inventory.approved === false && inventory.execution_authority === false, JSON.stringify(inventory).slice(0, 200));

  const found = payload((await session.request("tools/call", { name: "capability_search", arguments: { need: "compare two screenshots pixel by pixel", limit: 5 } })).result);
  check("a real query returns candidates", found.status === "OK" && found.candidates.length > 0, `${found.status} ${found.candidates?.length}`);
  check("candidates are marked unvetted and unapproved", found.candidates.every((c: any) => c.trust_state === "UNVETTED") && found.approved === false && found.execution_authority === false, JSON.stringify(found.candidates?.[0]).slice(0, 200));
  check("candidate carries evidence for why it matched", found.candidates.every((c: any) => Array.isArray(c.evidence) && c.rationale.length > 0));

  // ── 2. Two consumers, one library: identical input must rank identically ──
  const { search } = await import("../ucl/librarian.js");
  const store2 = openStore({ path: index, readOnly: true });
  const inProcess = search(store2, { need: "compare two screenshots pixel by pixel", limit: 5 });
  store2.close();
  const viaMcp = found.candidates.map((c: any) => c.candidate_id);
  const viaTool = inProcess.hits.map((hit) => hit.canonical_id);
  check("MCP server and AWE GROUP's in-process tool return the same ranking", JSON.stringify(viaMcp) === JSON.stringify(viaTool), `${JSON.stringify(viaMcp)} vs ${JSON.stringify(viaTool)}`);

  // ── 3. Policy: hazardous rows need the operator's opt-in ─────────────────
  const asked = payload((await session.request("tools/call", { name: "capability_search", arguments: { need: "exploit vulnerability", include_hazardous: true, limit: 12 } })).result);
  check("hazardous rows stay hidden when the server operator has not opted in", asked.candidates.every((c: any) => c.hazards.length === 0), JSON.stringify(asked.candidates.map((c: any) => c.hazards)));

  // ── 4. Input contract ───────────────────────────────────────────────────
  const tooMany = await session.request("tools/call", { name: "capability_search", arguments: { need: "screenshot", limit: 999 } });
  check("an out-of-range limit is rejected, not clamped", tooMany.result?.isError === true && /limit/.test(JSON.stringify(tooMany.result)), JSON.stringify(tooMany.result).slice(0, 200));
  const unknownTool = await session.request("tools/call", { name: "definitely_not_a_tool", arguments: {} });
  check("an unknown tool is an error, not an empty success", unknownTool.error?.code === -32602, JSON.stringify(unknownTool).slice(0, 160));
  const empty = payload((await session.request("tools/call", { name: "capability_search", arguments: { need: "the" } })).result);
  check("a query with nothing to match on abstains honestly", empty.status === "NOT_FOUND" && empty.candidates.length === 0, `${empty.status} ${empty.candidates?.length}`);
} finally {
  await session.close();
}

// ── 5. Opt-in changes the answer, and only then ─────────────────────────────
const optedIn = connect({ UCL_ALLOW_HAZARDOUS: "1" });
try {
  await handshake(optedIn);
  const asked = payload((await optedIn.request("tools/call", { name: "capability_search", arguments: { need: "exploit vulnerability", include_hazardous: true, limit: 12 } })).result);
  check("with the operator's opt-in, hazard flags are returned for review", asked.candidates.some((c: any) => c.hazards.length > 0), JSON.stringify(asked.candidates.map((c: any) => c.hazards)));
  check("hazard flags are still not an approval", asked.approved === false && asked.execution_authority === false && asked.permissions === "NONE");
  const silent = payload((await optedIn.request("tools/call", { name: "capability_search", arguments: { need: "exploit vulnerability", limit: 12 } })).result);
  check("opt-in alone does not surface hazards without the request asking", silent.candidates.every((c: any) => c.hazards.length === 0));
} finally {
  await optedIn.close();
}

// ── 6. No index: a payload, not a crash ───────────────────────────────────
const missing = connect({}, path.join(root, "data/db/does-not-exist.sqlite"));
try {
  const init = await handshake(missing);
  check("server starts without an index", init.result?.serverInfo?.name === "awe-ucl", JSON.stringify(init.error));
  const answer = payload((await missing.request("tools/call", { name: "capability_search", arguments: { need: "screenshot" } })).result);
  check("a missing index answers UNAVAILABLE with the remedy", answer.status === "UNAVAILABLE" && /UCL_DB/.test(answer.note ?? ""), JSON.stringify(answer).slice(0, 200));
  const inv = payload((await missing.request("tools/call", { name: "capability_inventory", arguments: {} })).result);
  check("inventory degrades the same way", inv.status === "UNAVAILABLE", JSON.stringify(inv).slice(0, 160));
} finally {
  await missing.close();
}

// ── 7. The index was only ever read ───────────────────────────────────────
check("the delivered index is byte-identical after every call", digestOfIndex() === before, "index bytes changed");

console.log(`\npassed: ${passed}, failed: ${failed}`);
if (failed) process.exit(1);
console.log("UCL MCP consumer passed.");
