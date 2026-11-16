import { constants } from 'node:fs';
import { open, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { analyzeCsvAnalytics, renderCsvAnalyticsReport, type CsvAnalyticsLimits } from '../capabilities/csv-analytics.js';
import { verifyCsvAnalytics } from '../capabilities/csv-verifier.js';
import { assertToolAllowed, throwIfAborted, type ToolContext } from '../security/tool-context.js';

export interface CsvAnalyticsDependencies {
  safePath: (inputPath: string) => string;
  /** Trusted approved mission specification; never take limits from model input. */
  approvedLimits: (context: ToolContext) => CsvAnalyticsLimits;
  approvedInput?: (context: ToolContext) => { path: string; sha256: string };
  /** Must persist under the mission write lock, checking fence/signal atomically. */
  save: (request: { missionId: string; name: string; content: string; context: ToolContext }) =>
    { id: string; path: string } | Promise<{ id: string; path: string }>;
}

const inputSchema = z.object({
  path: z.string().min(1).describe('CSV input path inside the granted mission workspace'),
  artifact_name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.json$/).default('csv-analytics.json'),
}).strict();
export type CsvAnalyticsToolInput = z.input<typeof inputSchema>;

function owner(context: ToolContext): void {
  throwIfAborted(context.signal);
  if (context.fence && !context.fence()) throw new Error('CSV analytics denied: mission ownership lost');
}

/** Bounded file read; never read even one byte beyond the approved byte bound. */
async function readInput(path: string, limits: CsvAnalyticsLimits, deps: CsvAnalyticsDependencies, context: ToolContext): Promise<Buffer> {
  const safe = deps.safePath(path);
  const resolved = deps.safePath(await realpath(safe));
  owner(context);
  const file = await open(resolved, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    owner(context);
    const before = await file.stat({ bigint: true });
    if (!before.isFile()) throw new Error('CSV input must be a regular file');
    if (before.size > BigInt(limits.maxBytes)) throw new Error('CSV_READ_BYTE_LIMIT_EXCEEDED');
    // Validate the opened descriptor target as well as the pre-open path. Linux
    // procfs resolves parent-symlink swaps; fail closed if unavailable.
    const descriptorPath = await realpath(`/proc/self/fd/${file.fd}`);
    if (deps.safePath(descriptorPath) !== resolved) throw new Error('CSV input path changed during open');
    owner(context);
    const bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      owner(context);
      const count = Math.min(64 * 1024, bytes.length - offset);
      const { bytesRead } = await file.read(bytes, offset, count, offset);
      if (!bytesRead) throw new Error('CSV input changed during read');
      offset += bytesRead;
    }
    owner(context);
    const after = await file.stat({ bigint: true });
    const current = await stat(deps.safePath(resolved), { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || current.dev !== after.dev || current.ino !== after.ino) throw new Error('CSV input changed during read');
    return bytes;
  } finally { await file.close(); }
}

/** Real read → solver → separate verifier → one saved evidence artifact. */
export async function executeCsvAnalytics(input: CsvAnalyticsToolInput, deps: CsvAnalyticsDependencies) {
  const context = assertToolAllowed('csv_analytics');
  const parsed = inputSchema.parse(input);
  const supplied = deps.approvedLimits(context);
  if (!supplied || !Number.isSafeInteger(supplied.maxBytes) || supplied.maxBytes < 0
    || !Number.isSafeInteger(supplied.maxRows) || supplied.maxRows < 0) throw new Error('Approved CSV limits are required');
  const limits = { maxBytes: supplied.maxBytes, maxRows: supplied.maxRows };
  const bytes = await readInput(parsed.path, limits, deps, context);
  if (deps.approvedInput) {
    const approved = deps.approvedInput(context);
    if (deps.safePath(parsed.path) !== deps.safePath(approved.path) ||
        createHash('sha256').update(bytes).digest('hex') !== approved.sha256) {
      throw new Error('CSV input differs from explicit approved identity');
    }
  }
  owner(context);
  const result = analyzeCsvAnalytics(bytes, limits);
  const resultJson = JSON.stringify(result);
  const verification = verifyCsvAnalytics(bytes, resultJson, limits);
  // A mismatch must remain visible, but no success report is published for it.
  const bundle = {
    schema: 'r1-csv-evidence-v1', result_json: resultJson, verification,
    ...(verification.outcome === 'MATCH' ? { report: renderCsvAnalyticsReport(result) } : {}),
  };
  const content = JSON.stringify(bundle, null, 2) + '\n';
  owner(context);
  const artifact = await deps.save({ missionId: context.missionId, name: parsed.artifact_name, content, context });
  context.artifactIds?.add(artifact.id);
  owner(context);
  return {
    success: verification.outcome === 'MATCH', status: result.status,
    verification: verification.outcome, qualification: verification.qualification,
    artifact_id: artifact.id, path: artifact.path,
    artifact_sha256: createHash('sha256').update(content).digest('hex'),
    input_sha256: result.input_sha256, result_sha256: verification.result_sha256,
    receipt_sha256: verification.receipt_sha256,
  };
}

/** Factory avoids importing tools/index.ts or initializing application storage. */
export function createCsvAnalyticsTool(deps: CsvAnalyticsDependencies) {
  return createTool({
    id: 'csv_analytics',
    description: 'Analyze a bounded approved CSV with exact integer amounts, independently recompute it, and save a hash-bound evidence artifact. BLOCKED_INPUT can be a correct verified outcome; a comparison match is not QA qualification.',
    inputSchema,
    execute: async input => executeCsvAnalytics(input, deps),
  });
}
