import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Mission, Specification } from '../types/index.js';
import { writeStaticTaskTracker } from './helpers/r1-static-product-fixture.js';

test('production host QA gate verifies real product behavior and binds saved receipt', async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.r1-web-qa-'));
  process.env.AWE_DATA_DIR = path.join(root, 'state');
  try {
    const storage = await import('../utils/storage.js');
    const { createApprovedSpecBinding } = await import('../utils/spec-binding.js');
    const { webEvidenceDefects } = await import('../agents/web-qa.js');
    const id = randomUUID();
    const workspace = storage.prepareMissionWorkspace(id);
    const specification: Specification = {
      title: 'Independent web QA fixture', objective: 'Exercise task interactions',
      scope: 'Synthetic local product validation only; not solver-authored mission output',
      acceptance_criteria: ['Real interactive browser behavior passes'],
      suggested_tools: ['file_write'], suggested_agents: ['coder'], estimated_complexity: 'simple', risks: [],
      web_product: { directory: 'product', verifier: 'r1-static-task-tracker-v1' },
    };
    const mission: Mission = { id, title: specification.title, description: specification.scope,
      objective: specification.objective, acceptance_criteria: specification.acceptance_criteria,
      status: 'running', priority: 'normal', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), artifacts: [], metadata: { specification } };
    mission.metadata.approved_spec_binding = createApprovedSpecBinding(mission);
    storage.saveMission(mission);
    assert.ok((await webEvidenceDefects(mission)).some(issue => issue.includes('FAIL')), 'missing product never passes');
    writeStaticTaskTracker(path.join(workspace, 'product'));
    assert.deepEqual(await webEvidenceDefects(mission), []);
    const receipts = storage.listArtifacts(id).filter(a => a.name === path.join('.independent-qa', 'web-verification.json'));
    assert.equal(receipts.length, 1);
    const receipt = JSON.parse(fs.readFileSync(receipts[0].path!, 'utf8'));
    assert.equal(receipt.outcome, 'PASS');
    assert.equal(receipt.tree_sha256.length, 64);
    assert.equal(receipt.qualification, 'NOT_ASSESSED');
    const files = fs.readdirSync(workspace);
    assert.ok(files.includes('product') && files.includes('.independent-qa'));
    assert.deepEqual(await webEvidenceDefects(mission), [], 'the evidence write itself must not change product acceptance');
    let current = true;
    assert.ok((await webEvidenceDefects(mission, { fence: () => current = false })).some(issue => issue.includes('ownership/admission')));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
