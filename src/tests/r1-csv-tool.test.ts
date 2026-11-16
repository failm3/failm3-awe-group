import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, symlink } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { executeCsvAnalytics, createCsvAnalyticsTool, type CsvAnalyticsDependencies } from '../tools/csv-analytics.js';
import { runWithToolContext, type ToolContext } from '../security/tool-context.js';
import { verifyCsvAnalytics } from '../capabilities/csv-verifier.js';

const CSV = 'event_id,order_id,currency,kind,amount_cents,status\ne,o,USD,sale,25,settled\n';
const LIMITS = { maxBytes: 10_000, maxRows: 20 };
const sha = (value: string) => createHash('sha256').update(value).digest('hex');

async function fixture(run: (value: {
  root: string; input: string; context: ToolContext; deps: CsvAnalyticsDependencies; saves: string[];
}) => Promise<void>) {
  const root = await mkdtemp('/tmp/opencode/r1-csv-tool-');
  try {
    const input = join(root, 'input.csv');
    await writeFile(input, CSV);
    const saves: string[] = [];
    const context: ToolContext = { missionId: 'csv-test', workspaceRoot: root, allowedTools: new Set(['csv_analytics']),
      invokedTools: new Set(), artifactIds: new Set(), fence: () => true };
    const deps: CsvAnalyticsDependencies = {
      safePath: value => {
        const full = resolve(value);
        if (!full.startsWith(root + sep)) throw new Error('outside test workspace');
        return full;
      },
      approvedLimits: () => LIMITS,
      save: async request => {
        request.context.signal?.throwIfAborted();
        if (request.context.fence && !request.context.fence()) throw new Error('stale write');
        const path = join(root, request.name);
        await writeFile(path, request.content, { flag: 'wx' });
        saves.push(path);
        return { id: `artifact-${saves.length}`, path };
      },
    };
    await run({ root, input, context, deps, saves });
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('CSV tool performs real file read, independent check and saved hash-bound evidence artifact', async () => {
  await fixture(async ({ input, context, deps, saves }) => {
    const output = await runWithToolContext(context, () => executeCsvAnalytics({ path: input }, deps));
    assert.equal(output.success, true);
    assert.equal(output.status, 'PASS_DATA');
    assert.equal(output.verification, 'MATCH');
    assert.equal(output.qualification, 'NOT_ASSESSED');
    assert.equal(saves.length, 1);
    assert.ok(context.invokedTools?.has('csv_analytics'));
    assert.ok(context.artifactIds?.has(output.artifact_id));
    const content = await readFile(output.path, 'utf8');
    assert.equal(output.artifact_sha256, sha(content));
    const bundle = JSON.parse(content);
    assert.equal(JSON.parse(bundle.result_json).metrics.USD.net_cents, '25');
    assert.equal(output.result_sha256, sha(bundle.result_json));
    assert.equal(bundle.verification.receipt_sha256, output.receipt_sha256);
    assert.deepEqual(verifyCsvAnalytics(await readFile(input), bundle.result_json, LIMITS), bundle.verification);
    assert.match(bundle.report, /USD: net_cents=25/);
  });
});

test('CSV tool saves correctly verified BLOCKED input without partial totals or success report', async () => {
  await fixture(async ({ input, context, deps }) => {
    await writeFile(input, CSV + 'e,o,USD,sale,26,settled\n');
    const output = await runWithToolContext(context, () => executeCsvAnalytics({ path: input }, deps));
    assert.equal(output.success, true); // correct processing, not a PASS_DATA claim
    assert.equal(output.status, 'BLOCKED_INPUT');
    const bundle = JSON.parse(await readFile(output.path, 'utf8'));
    assert.equal(bundle.verification.expected_status, 'BLOCKED_INPUT');
    assert.equal(Object.hasOwn(JSON.parse(bundle.result_json), 'metrics'), false);
    assert.doesNotMatch(bundle.report, /net_cents|settled sales/);
    assert.match(bundle.report, /CONFLICTING_EVENT/);
  });
});

test('CSV factory creates a Mastra tool and executes with the same guards', async () => {
  await fixture(async ({ input, context, deps }) => {
    const tool = createCsvAnalyticsTool(deps);
    assert.equal(tool.id, 'csv_analytics');
    assert.ok(tool.execute);
    const result = await runWithToolContext(context, () => tool.execute!({ path: input, artifact_name: 'factory.json' }, {} as never));
    assert.equal((result as { success: boolean }).success, true);
  });
});

test('CSV tool fails before reading or saving without grant, approved limits, or safe path', async () => {
  await fixture(async ({ root, input, context, deps, saves }) => {
    let paths = 0;
    const monitored = { ...deps, safePath: (value: string) => { paths++; return deps.safePath(value); } };
    await assert.rejects(executeCsvAnalytics({ path: input }, monitored), /no mission tool context/);
    await assert.rejects(runWithToolContext({ ...context, allowedTools: new Set() }, () => executeCsvAnalytics({ path: input }, monitored)), /not granted/);
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: input }, {
      ...monitored, approvedLimits: () => ({ maxBytes: Infinity, maxRows: 1 }),
    })), /Approved CSV limits/);
    assert.equal(paths, 0);
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: resolve(root, '..', 'forbidden.csv') }, deps)), /outside test workspace/);
    for (const artifact_name of ['../escape.json', '/absolute.json', 'bad/name.json']) {
      await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: input, artifact_name }, deps)));
    }
    // A model cannot supply a mission id, limits override or precomputed answer.
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: input, maxBytes: 999999 } as any, deps)));
    assert.equal(saves.length, 0);
  });
});

test('CSV tool enforces byte limits before allocation and row limits before totals', async () => {
  await fixture(async ({ input, context, deps, saves }) => {
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: input }, {
      ...deps, approvedLimits: () => ({ maxBytes: Buffer.byteLength(CSV) - 1, maxRows: 20 }),
    })), /CSV_READ_BYTE_LIMIT_EXCEEDED/);
    assert.equal(saves.length, 0);
    const output = await runWithToolContext(context, () => executeCsvAnalytics({ path: input }, {
      ...deps, approvedLimits: () => ({ maxBytes: Buffer.byteLength(CSV), maxRows: 0 }),
    }));
    assert.equal(output.status, 'BLOCKED_INPUT');
    assert.equal(output.verification, 'MATCH');
    const bundle = JSON.parse(await readFile(output.path, 'utf8'));
    assert.equal(JSON.parse(bundle.result_json).errors[0].code, 'ROW_LIMIT_EXCEEDED');
  });
});

test('CSV tool rejects nonregular files and symlink escapes', async () => {
  await fixture(async ({ root, input, context, deps, saves }) => {
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: root }, {
      ...deps, safePath: value => value === root ? root : deps.safePath(value),
    })), /regular file/);
    const link = join(root, 'escape.csv');
    await symlink(resolve(root, '..'), link);
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: link }, deps)), /outside test workspace/);
    // Legitimate internal link resolves to the same approved regular-file bytes.
    const internal = join(root, 'internal.csv');
    await symlink(input, internal);
    assert.equal((await runWithToolContext(context, () => executeCsvAnalytics({ path: internal }, deps))).success, true);
    assert.equal(saves.length, 1);
  });
});

test('CSV tool honors cancellation and loss of owner before read and before save', async () => {
  await fixture(async ({ input, context, deps, saves }) => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled CSV'));
    await assert.rejects(runWithToolContext({ ...context, signal: controller.signal }, () => executeCsvAnalytics({ path: input }, deps)), /cancelled CSV/);
    await assert.rejects(runWithToolContext({ ...context, fence: () => false }, () => executeCsvAnalytics({ path: input }, deps)), /ownership lost/);
    let active = true;
    let checks = 0;
    await assert.rejects(runWithToolContext({ ...context, fence: () => active }, () => executeCsvAnalytics({ path: input }, {
      ...deps, safePath: value => {
        const safe = deps.safePath(value);
        // Fourth check is immediately after the read, before final stat/save.
        if (++checks === 4) active = false;
        return safe;
      },
    })), /ownership lost/);
    assert.equal(saves.length, 0);
  });
});

test('CSV tool does not report success or register an artifact when saving fails', async () => {
  await fixture(async ({ input, context, deps }) => {
    await assert.rejects(runWithToolContext(context, () => executeCsvAnalytics({ path: input }, {
      ...deps, save: () => { throw new Error('disk failure'); },
    })), /disk failure/);
    assert.equal(context.artifactIds?.size, 0);
  });
});
