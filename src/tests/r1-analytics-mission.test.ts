import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

test('R1 offline production analytics: bound spec, independent QA, fresh-process lesson reuse and revocation fence', async () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/r1-analytics-mission.ts'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 180_000,
    env: { PATH: process.env.PATH, AWE_DATA_DIR: '/must-not-use-inherited-state', AWE_OFFLINE_TEST: '1' },
  });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const summary = JSON.parse(run.stdout);
  const sandbox = path.dirname(summary.dataDir);
  assert.match(path.basename(sandbox), /^\.r1-analytics-mission-/);
  try {
    // Select the child's isolated store before importing the production host QA gate.
    process.env.AWE_DATA_DIR = summary.dataDir;
    const { csvEvidenceDefects } = await import('../agents/csv-qa.js');
    const storage = await import('../utils/storage.js');
    assert.equal(storage.DATA_DIR, summary.dataDir);
    assert.match(summary.mode, /not-live-llm/);
    assert.match(summary.authorization, /engineering-fixture-only/);
    assert.deepEqual(summary.freshProcesses, ['first', 'second', 'revoke']);
    assert.equal(summary.llmCalls, 0);
    assert.equal(summary.networkCalls, 0);
    assert.notEqual(summary.first.inputSha256, summary.second.inputSha256);
    assert.notEqual(summary.first.admission.specHash, summary.second.admission.specHash);
    assert.deepEqual(summary.first.netCents, { USD: '12000', EUR: '2345' });
    assert.deepEqual(summary.second.netCents, { USD: '777', EUR: '-500' });
    assert.deepEqual(summary.second.usedLessonRefs, [summary.first.lessonRef.artifactId]);
    const read = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const phase of ['first', 'second']) {
      const result = summary[phase];
      const mission = read(path.join(summary.dataDir, 'missions', `${result.missionId}.json`));
      assert.equal(mission.status, 'completed');
      assert.equal(mission.metadata.authorization.userApprovalClaimed, false);
      assert.equal(mission.metadata.acceptedGeneration, 1);
      assert.deepEqual(mission.metadata.toolsUsed, ['csv_analytics']);
      assert.equal(mission.metadata.approved_spec_binding.spec_hash, result.admission.specHash);
      assert.deepEqual(mission.metadata.specification.csv_input, { path: result.inputPath, sha256: result.inputSha256 });
      assert.deepEqual(csvEvidenceDefects(storage.loadMission(result.missionId)!), []);
      const qa = read(result.qaPath);
      assert.notEqual(qa.issuer, qa.solver);
      assert.equal(qa.comparison.outcome, 'MATCH');
      assert.equal(qa.comparison.qualification, 'NOT_ASSESSED');
      assert.equal(qa.comparison.input_sha256, createHash('sha256').update(fs.readFileSync(result.inputPath)).digest('hex'));
      assert.equal(qa.tamperedComparison.outcome, 'MISMATCH');
      const qualification = read(path.join(summary.dataDir, 'qualifications', `${result.qualificationId}.json`));
      assert.equal(qualification.receipt.evidenceHash, createHash('sha256').update(fs.readFileSync(result.qaPath)).digest('hex'));
      assert.ok(qualification.receipt.evidenceRefs.includes(result.artifactId));
      if (phase === 'second') {
        assert.equal(qa.appliedLessonChecks.length, 3);
        assert.ok(qa.appliedLessonChecks.every((check: { passed: boolean; lessonRef: string }) => check.passed && check.lessonRef === summary.first.lessonRef.artifactId));
        assert.ok(qualification.receipt.evidenceRefs.includes(summary.first.lessonRef.artifactId));
      }
    }
    assert.equal(summary.revoke.forbiddenEffects, 0);
    assert.equal(summary.revoke.revokedDispatchDenied, true);
    assert.equal(summary.revoke.revokedAcceptanceDenied, true);
    assert.equal(summary.revoke.staleAdmissionDeniedAfterRequalification, true);
    assert.equal(summary.revoke.finalGeneration, 4);
    assert.equal(summary.revoke.finalStatus, 'revoked');
    const mission = storage.loadMission(summary.second.missionId)!;
    const originalInput = fs.readFileSync(summary.second.inputPath);
    try {
      fs.appendFileSync(summary.second.inputPath, 'changed');
      assert.match(csvEvidenceDefects(mission).join('\n'), /Approved CSV input changed/);
    } finally { fs.writeFileSync(summary.second.inputPath, originalInput); }
    const originalBundle = fs.readFileSync(summary.second.artifactPath);
    try {
      const bundle = JSON.parse(originalBundle.toString('utf8'));
      const altered = JSON.parse(bundle.result_json);
      altered.metrics.USD.net_cents = '0';
      bundle.result_json = JSON.stringify(altered);
      fs.writeFileSync(summary.second.artifactPath, JSON.stringify(bundle));
      assert.match(csvEvidenceDefects(mission).join('\n'), /recomputation disagrees|bytes differ from saved identity/);
    } finally { fs.writeFileSync(summary.second.artifactPath, originalBundle); }
    assert.deepEqual(csvEvidenceDefects(mission), []);
    // A good bundle must not hide a second inconsistent registered CSV artifact.
    const { createApprovedSpecBinding } = await import('../utils/spec-binding.js');
    const negative = structuredClone(mission);
    negative.id = 'r1-analytics-inconsistent-fixture';
    negative.status = 'pending_approval';
    negative.artifacts = [];
    delete negative.metadata.approved_spec_binding;
    const spec = negative.metadata.specification as import('../types/index.js').Specification;
    const negativeRoot = storage.prepareMissionWorkspace(negative.id);
    spec.csv_input = { path: path.join(negativeRoot, 'input.csv'), sha256: summary.second.inputSha256 };
    fs.writeFileSync(spec.csv_input.path, originalInput);
    storage.saveMission(negative);
    storage.updateMissionAtomic(negative.id, current => ({ status: 'approved', metadata: {
      ...current.metadata, approved_spec_binding: createApprovedSpecBinding(current),
    } }));
    storage.updateMission(negative.id, { status: 'running' });
    storage.saveArtifactFile(negative.id, 'consistent-bundle.json', originalBundle.toString('utf8'), 'data');
    assert.deepEqual(csvEvidenceDefects(storage.loadMission(negative.id)!), []);
    const bad = JSON.parse(originalBundle.toString('utf8'));
    bad.result_json = '{}';
    storage.saveArtifactFile(negative.id, 'inconsistent-bundle.json', JSON.stringify(bad), 'data');
    assert.match(csvEvidenceDefects(storage.loadMission(negative.id)!).join('\n'), /recomputation disagrees/);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
