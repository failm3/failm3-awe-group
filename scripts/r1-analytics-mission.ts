#!/usr/bin/env node
/** Run with: npx tsx scripts/r1-analytics-mission.ts
 * Three fresh offline processes; evidence retained in a new workspace directory.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Socket } from 'node:net';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '..');
process.chdir(root);
const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 3 || args[0] !== '--phase' || !['first', 'second', 'revoke'].includes(args[1])) {
    throw new Error('Usage: npx tsx scripts/r1-analytics-mission.ts');
  }
  // No application imports until isolation is selected; no dotenv bootstrap.
  process.env.AWE_DATA_DIR = path.resolve(args[2]);
  let attemptedNetworkCalls = 0;
  const denyNetwork = (): never => {
    attemptedNetworkCalls++;
    throw new Error('Network forbidden in offline analytics fixture');
  };
  globalThis.fetch = async () => denyNetwork();
  Socket.prototype.connect = denyNetwork;
  const { runAnalyticsQualificationFixture } = await import('../src/capabilities/analytics-mission.js');
  await runAnalyticsQualificationFixture(args[2], args[1] as 'first' | 'second' | 'revoke');
  if (attemptedNetworkCalls) throw new Error('Offline fixture attempted network access');
} else {
  const sandbox = fs.mkdtempSync(path.join(root, '.r1-analytics-mission-'));
  const state = path.join(sandbox, 'state');
  const phases = ['first', 'second', 'revoke'];
  for (const phase of phases) {
    // No provider credentials or inherited state directory reach these children.
    const child = spawnSync(process.execPath, ['--import', 'tsx', script, '--phase', phase, state], {
      cwd: root, encoding: 'utf8', timeout: 60_000,
      env: { PATH: process.env.PATH, AWE_DATA_DIR: state, AWE_OFFLINE_TEST: '1' },
    });
    if (child.error || child.status !== 0) throw new Error(`Fixture ${phase} failed; evidence: ${sandbox}\n${child.error ?? ''}\n${child.stdout}\n${child.stderr}`);
  }
  const summary = { mode: 'deterministic-offline-integration-not-live-llm-orchestration',
    authorization: 'engineering-fixture-only; no user approval claimed', freshProcesses: phases,
    dataDir: state, networkCalls: 0, llmCalls: 0,
    ...Object.fromEntries(phases.map(phase => [phase, JSON.parse(fs.readFileSync(path.join(state, `${phase}.json`), 'utf8'))])) };
  fs.writeFileSync(path.join(sandbox, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}
