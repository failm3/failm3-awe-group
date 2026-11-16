import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR, atomicWriteJson, assertSafeMissionId } from "./storage.js";

export type Unknown = "UNKNOWN";

export interface ModelCallBinding {
  /** null explicitly identifies pre-mission Prompt Master work. */
  missionId: string | null;
  role: string;
  model: string;
  provider?: string;
  operation?: "generate" | "stream";
}

export interface ModelCallUsage {
  input_tokens: number | Unknown;
  output_tokens: number | Unknown;
  total_tokens: number | Unknown;
  reasoning_tokens: number | Unknown;
  cached_input_tokens: number | Unknown;
}

export interface ModelCallRecord {
  schema_version: 1;
  call_id: string;
  mission_id: string | null;
  role: string;
  model: string;
  provider: string | Unknown;
  operation: "generate" | "stream";
  started_at: string;
  finished_at: string | null;
  status: "started" | "completed" | "failed" | "unknown";
  outcome: "completed" | "failed" | Unknown;
  usage: ModelCallUsage;
  usage_status: "reported" | "partial" | Unknown;
  /** No trusted price feed exists. Token counts are never converted to guessed dollars. */
  cost: { status: Unknown; amount: null; currency: "USD" };
  reason?: "provider_threw" | "provider_error" | "provider_aborted" | "observation_failed" | "usage_mismatch";
}

const unknownUsage = (): ModelCallUsage => ({
  input_tokens: "UNKNOWN", output_tokens: "UNKNOWN", total_tokens: "UNKNOWN",
  reasoning_tokens: "UNKNOWN", cached_input_tokens: "UNKNOWN",
});

function directory(): string {
  const dir = path.join(DATA_DIR, "model-calls");
  fs.mkdirSync(dir, { recursive: true });
  for (const component of [DATA_DIR, dir]) {
    const stat = fs.lstatSync(component);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unsafe model ledger directory");
  }
  return dir;
}

function syncDirectory(dir: string): void {
  const fd = fs.openSync(dir, "r");
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}

function persist(record: ModelCallRecord, phase: "started" | "finished"): void {
  const dir = directory();
  atomicWriteJson(path.join(dir, `${record.call_id}.${phase}.json`), record);
  // The storage primitive fsyncs file contents; also persist the renamed entry.
  syncDirectory(dir);
  syncDirectory(DATA_DIR);
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

function count(value: unknown): number | Unknown {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : "UNKNOWN";
}

/** Only explicit aggregate SDK/provider counts; never sum overlapping steps or fill absent fields with zero. */
export function modelCallUsage(value: unknown): ModelCallUsage {
  const raw = object(value);
  const inputDetails = object(raw.inputTokenDetails);
  const outputDetails = object(raw.outputTokenDetails);
  const inputProviderDetails = object(raw.prompt_tokens_details);
  const outputProviderDetails = object(raw.completion_tokens_details);
  return {
    input_tokens: count(raw.inputTokens ?? raw.promptTokens ?? raw.input_tokens ?? raw.prompt_tokens),
    output_tokens: count(raw.outputTokens ?? raw.completionTokens ?? raw.output_tokens ?? raw.completion_tokens),
    total_tokens: count(raw.totalTokens ?? raw.total_tokens),
    reasoning_tokens: count(raw.reasoningTokens ?? outputDetails.reasoningTokens ?? outputProviderDetails.reasoning_tokens ?? raw.reasoning_tokens),
    cached_input_tokens: count(raw.cachedInputTokens ?? inputDetails.cacheReadTokens ?? inputProviderDetails.cached_tokens ?? raw.cached_input_tokens),
  };
}

/**
 * One record per explicit SDK invocation (which may contain provider retries or
 * multiple tool-loop steps). This is not an invoice or a per-HTTP-request ledger.
 *
 * The callback must return the settled response. For streaming, enclose stream
 * consumption in the callback and return its final getFullOutput() result; merely
 * acquiring a stream handle does not establish provider completion.
 *
 * Start persistence failure prevents invocation. Terminal persistence failure is
 * propagated, leaving the immutable start record with outcome UNKNOWN. Do not
 * automatically retry an UNKNOWN call: the provider may already have charged it.
 */
export async function withModelCall<T>(binding: ModelCallBinding, invoke: () => Promise<T>): Promise<T> {
  if (binding.missionId !== null) assertSafeMissionId(binding.missionId);
  if (!binding.role.trim() || !binding.model.trim()) throw new Error("Model ledger requires role and model");
  const started: ModelCallRecord = {
    schema_version: 1,
    call_id: randomUUID(),
    mission_id: binding.missionId,
    role: binding.role,
    model: binding.model,
    provider: binding.provider ?? "UNKNOWN",
    operation: binding.operation ?? "generate",
    started_at: new Date().toISOString(),
    finished_at: null,
    status: "started",
    outcome: "UNKNOWN",
    usage: unknownUsage(),
    usage_status: "UNKNOWN",
    cost: { status: "UNKNOWN", amount: null, currency: "USD" },
  };
  persist(started, "started");
  let response: T;
  try {
    response = await invoke();
  } catch (error) {
    // A thrown call failed locally, but provider completion/billing is unknown.
    // Do not persist error messages: providers may include keys, prompts or URLs.
    persist({ ...started, status: "failed", reason: "provider_threw", finished_at: new Date().toISOString() }, "finished");
    throw error;
  }

  let finished: ModelCallRecord;
  try {
    const result = object(response);
    const aggregate = await result.totalUsage;
    const rawUsage = aggregate !== undefined && Object.keys(object(aggregate)).length
      ? aggregate : await result.usage;
    const usage = modelCallUsage(rawUsage);
    const values = Object.values(usage);
    const finishReason = await result.finishReason;
    const failed = Boolean(result.error) || finishReason === "error";
    const aborted = finishReason === "abort" || finishReason === "aborted";
    const contradictory = typeof usage.input_tokens === "number" && typeof usage.output_tokens === "number" &&
      typeof usage.total_tokens === "number" && usage.input_tokens + usage.output_tokens !== usage.total_tokens;
    finished = {
      ...started,
      status: aborted ? "unknown" : failed ? "failed" : "completed",
      outcome: aborted ? "UNKNOWN" : failed ? "failed" : "completed",
      finished_at: new Date().toISOString(),
      usage,
      usage_status: contradictory ? "partial" : values.every((v) => v === "UNKNOWN") ? "UNKNOWN"
        : values.some((v) => v === "UNKNOWN") ? "partial" : "reported",
      ...(contradictory ? { reason: "usage_mismatch" as const } : {}),
      ...(failed ? { reason: "provider_error" as const } : aborted ? { reason: "provider_aborted" as const } : {}),
    };
  } catch {
    finished = { ...started, status: "unknown", reason: "observation_failed", finished_at: new Date().toISOString() };
  }
  persist(finished, "finished");
  return response;
}

/** Durable projection, including starts orphaned by crashes. Corruption fails loudly. */
export function listModelCalls(missionId?: string | null): ModelCallRecord[] {
  const dir = directory();
  return fs.readdirSync(dir).filter((name) => name.endsWith(".started.json")).map((name) => {
    const startPath = path.join(dir, name);
    const finishPath = path.join(dir, name.replace(/\.started\.json$/, ".finished.json"));
    const file = fs.existsSync(finishPath) ? finishPath : startPath;
    if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error("Unsafe model ledger record");
    const record = JSON.parse(fs.readFileSync(file, "utf8")) as ModelCallRecord;
    if (record.schema_version !== 1 || `${record.call_id}.started.json` !== name) throw new Error("Corrupt model ledger record");
    return record;
  }).filter((record) => missionId === undefined || record.mission_id === missionId)
    .sort((a, b) => a.started_at.localeCompare(b.started_at) || a.call_id.localeCompare(b.call_id));
}
