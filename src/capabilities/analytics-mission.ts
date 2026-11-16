/** Deterministic offline integration fixture, NOT live LLM orchestration. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { Mission, Specification } from '../types/index.js';
import type { QualificationAdmission } from '../utils/qualification.js';
import type { CsvAnalyticsResult } from './csv-analytics.js';

const MODE = 'deterministic-offline-integration-not-live-llm-orchestration';
const SCOPE = 'csv-descriptive';
const SOLVER = 'production-csv-analytics';
const ISSUER = 'engineering-independent-qa';
const LIMITS = { maxBytes: 32_768, maxRows: 100 };
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

export interface AnalyticsFixtureRun {
  mode: string;
  missionId: string;
  inputPath: string;
  inputSha256: string;
  artifactId: string;
  artifactPath: string;
  qaPath: string;
  qualificationId: string;
  admission: QualificationAdmission;
  lessonRef: { missionId: string; artifactId: string; sha256: string };
  usedLessonRefs: string[];
  netCents: { USD: string; EUR: string };
}

/** Entry point must select its NEW isolated data directory before any app import.
 * Each phase is run in a fresh process by scripts/r1-analytics-mission.ts.
 * No default data path, dotenv, models, or agent runtime are imported here.
 */
export async function runAnalyticsQualificationFixture(dataDir: string, phase: 'first' | 'second' | 'revoke') {
  const resolved = path.resolve(dataDir);
  const relative = path.relative(process.cwd(), resolved);
  assert.match(relative, /^\.r1-analytics-[^/]+\/state$/, 'fixture requires its isolated workspace-local state directory');
  assert.equal(fs.realpathSync(path.dirname(resolved)), path.dirname(resolved));
  process.env.AWE_DATA_DIR = resolved;
  process.env.AWE_OFFLINE_TEST = '1';
  const storage = await import('../utils/storage.js');
  assert.equal(storage.DATA_DIR, resolved, 'storage was imported before isolated AWE_DATA_DIR selection');
  const { createQualificationAuthority } = await import('../utils/qualification.js');
  const { assertApprovedSpecBinding, createApprovedSpecBinding, APPROVED_SPEC_BINDING_KEY } = await import('../utils/spec-binding.js');
  const { verifyCsvAnalytics, CSV_VERIFIER_VERSION } = await import('./csv-verifier.js');
  const { CSV_ANALYTICS_CONTRACT_DIGEST } = await import('./csv-analytics.js');
  const credential = Object.freeze({ engineeringHostCredential: true });
  const capabilityHash = sha(json({ tool: 'csv_analytics', contract: CSV_ANALYTICS_CONTRACT_DIGEST }));
  const profileHash = sha(json({ mode: MODE, limits: LIMITS, scope: SCOPE, verifier: CSV_VERIFIER_VERSION }));
  const authority = createQualificationAuthority({
    issuers: [{ principal: ISSUER, scopes: [SCOPE] }],
    authenticateIssuer: candidate => candidate === credential ? ISSUER : null,
    authorize: binding => {
      if (binding.solverId !== SOLVER || binding.scope !== SCOPE || binding.capabilityHash !== capabilityHash || binding.profileHash !== profileHash) return false;
      return storage.listMissions().some(mission => {
        const approved = assertApprovedSpecBinding(mission);
        return approved.spec_hash === binding.specHash && ['running', 'completed'].includes(mission.status)
          && approved.snapshot.specification.suggested_tools.join(',') === 'csv_analytics';
      });
    },
  });

  if (phase === 'revoke') {
    const previous = readJson(path.join(resolved, 'second.json')) as AnalyticsFixtureRun;
    const before = authority.inspect(previous.qualificationId)!;
    const revoked = authority.revoke(previous.qualificationId, before.generation, credential, 'Engineering negative control: withdraw qualification');
    let forbiddenEffects = 0;
    for (const seam of ['dispatch', 'acceptance'] as const) {
      assert.throws(() => authority.withAdmission(previous.admission, seam, () => ++forbiddenEffects), /revoked/);
    }
    assert.throws(() => authority.admit(previous.qualificationId, {
      solverId: SOLVER, scope: SCOPE, specHash: previous.admission.specHash, capabilityHash, profileHash,
    }), /revoked/);
    // A new receipt must not resurrect an old admission even after requalification.
    const requalified = authority.qualify({ ...before.receipt, receiptId: 'second-requalified-receipt', issuedAt: Date.now() }, credential, revoked.generation);
    for (const seam of ['dispatch', 'acceptance'] as const) {
      assert.throws(() => authority.withAdmission(previous.admission, seam, () => ++forbiddenEffects), /stale/);
    }
    const final = authority.revoke(previous.qualificationId, requalified.generation, credential, 'Leave negative-control qualification revoked');
    assert.equal(forbiddenEffects, 0);
    const result = { mode: MODE, qualificationId: previous.qualificationId, originalGeneration: before.generation,
      revokedGeneration: revoked.generation, requalifiedGeneration: requalified.generation,
      finalGeneration: final.generation, finalStatus: final.status, forbiddenEffects,
      revokedDispatchDenied: true, revokedAcceptanceDenied: true, staleAdmissionDeniedAfterRequalification: true };
    fs.writeFileSync(path.join(resolved, 'revoke.json'), json(result));
    return result;
  }

  const first = phase === 'second' ? readJson(path.join(resolved, 'first.json')) as AnalyticsFixtureRun : undefined;
  const usedLessonRefs: string[] = [];
  let lessonChecks: string[] = [];
  if (first) {
    const sourceMission = storage.loadMission(first.missionId)!;
    assert.equal(sourceMission.status, 'completed');
    assertApprovedSpecBinding(sourceMission, first.admission.specHash);
    const artifact = storage.listArtifacts(first.missionId).find(item => item.id === first.lessonRef.artifactId)!;
    assert.ok(artifact?.path, 'persisted scoped lesson artifact must exist');
    const bytes = fs.readFileSync(artifact.path);
    assert.equal(sha(bytes), first.lessonRef.sha256);
    const lesson = JSON.parse(bytes.toString('utf8'));
    assert.equal(lesson.scope, SCOPE);
    assert.equal(lesson.contractDigest, CSV_ANALYTICS_CONTRACT_DIGEST);
    assert.equal(lesson.capabilityHash, capabilityHash);
    assert.equal(lesson.profileHash, profileHash);
    assert.equal(lesson.sourceSpecHash, first.admission.specHash);
    assert.equal(authority.inspect(first.qualificationId)?.status, 'provisional');
    assert.deepEqual(lesson.requiredChecks, ['separate-pending', 'deduplicate-events', 'separate-currencies']);
    lessonChecks = lesson.requiredChecks;
    usedLessonRefs.push(artifact.id);
  }

  const missionId = `r1-analytics-${phase}`;
  const inputPath = path.join(storage.missionArtifactDir(missionId), 'input.csv');
  const header = 'event_id,order_id,currency,kind,amount_cents,status';
  const rows = phase === 'first' ? [
    'a1,orderA,USD,sale,12345,settled', 'a2,orderA,USD,refund,345,settled',
    'a1,orderA,USD,sale,12345,settled', 'a3,orderB,EUR,sale,2345,settled',
    'a4,orderC,USD,sale,8000,pending',
  ] : [
    'b1,orderX,EUR,refund,500,settled', 'b2,orderY,USD,sale,777,settled',
    'b3,orderZ,USD,refund,12,pending', 'b4,orderW,EUR,sale,901,pending',
    'b2,orderY,USD,sale,777,settled',
  ];
  const input = `${header}\n${rows.join('\n')}\n`;
  const inputSha256 = sha(input);
  if (first) assert.notEqual(inputSha256, first.inputSha256);
  const specification: Specification = {
    title: `R1 professional descriptive analytics ${phase} engineering fixture`,
    objective: 'Produce exact, independently checked descriptive CSV analytics with bounded local execution.',
    scope: `Engineering-fixture authorization ONLY; no actual user approval asserted. IN: input.csv sha256=${inputSha256}; `
      + `contract=${CSV_ANALYTICS_CONTRACT_DIGEST}; integer cents, USD/EUR separately, exact event deduplication, pending excluded from net. `
      + 'OUT: network, LLM calls, publishing, forecasts, causal inference, FX conversion, financial audit.',
    acceptance_criteria: [
      'Saved result binds the approved raw input bytes and contract; fresh independent verification matches PASS_DATA.',
      'Net equals settled sales minus settled refunds per currency; pending amounts and duplicates are separate.',
      'Human report states integer cents, no FX conversion, pending exclusion and no financial-audit claim.',
      `Lesson references are hash-checked and scoped before execution: ${usedLessonRefs.join(',') || 'none on first run'}.`,
      'Only host-issued independent QA qualification may admit publication and generation-fenced final acceptance.',
    ],
    suggested_tools: ['csv_analytics'], suggested_agents: ['csv-specialist', 'independent-qa'],
    estimated_complexity: 'simple', risks: ['Fixture evidence is not live LLM orchestration or broad professional certification.'],
    csv_limits: LIMITS,
    csv_input: { path: inputPath, sha256: inputSha256 },
  };
  const timestamp = new Date().toISOString();
  const mission: Mission = {
    id: missionId, title: specification.title, description: 'Deterministic integration fixture authorized by the engineering runner, not by an end user.',
    objective: specification.objective, acceptance_criteria: specification.acceptance_criteria,
    status: 'pending_approval', priority: 'normal', created_at: timestamp, updated_at: timestamp, artifacts: [],
    metadata: { specification, mode: MODE, authorization: { kind: 'engineering-fixture-only', userApprovalClaimed: false },
      usedLessonRefs, lessonChecks, inputSha256 },
  };
  assert.equal(storage.loadMission(missionId), null, 'never overwrite an earlier fixture run');
  storage.saveMission(mission);
  const approval = storage.updateMissionAtomic(missionId, current => ({ status: 'approved', metadata: {
    ...current.metadata, [APPROVED_SPEC_BINDING_KEY]: createApprovedSpecBinding(current),
  } }));
  assert.equal(approval.applied, true);
  const approved = assertApprovedSpecBinding(approval.mission!);
  const workspaceRoot = storage.prepareMissionWorkspace(missionId);
  fs.writeFileSync(inputPath, input, { flag: 'wx' });
  storage.updateMission(missionId, { status: 'running' });
  const { allTools } = await import('../tools/index.js');
  const { runWithToolContext } = await import('../security/tool-context.js');
  const invokedTools = new Set<string>();
  const artifactIds = new Set<string>();
  const fence = () => {
    const current = storage.loadMission(missionId);
    return !!current && current.status === 'running' && assertApprovedSpecBinding(current).spec_hash === approved.spec_hash;
  };
  // This is candidate evidence execution, before qualification. Do not hold the
  // synchronous qualification lock across an asynchronous production tool call.
  const toolOutput = await runWithToolContext({ missionId, workspaceRoot, allowedTools: new Set(['csv_analytics']),
    invokedTools, artifactIds, fence }, () => allTools.csv_analytics.execute!({ path: inputPath, artifact_name: 'analysis.json' }, {} as never));
  const output = z.object({ success: z.literal(true), status: z.literal('PASS_DATA'),
    artifact_id: z.string(), path: z.string(), artifact_sha256: z.string() }).parse(toolOutput);
  assert.equal(output.success, true);
  assert.equal(output.status, 'PASS_DATA');
  assert.deepEqual([...invokedTools], ['csv_analytics']);
  assert.ok(artifactIds.has(output.artifact_id));
  const artifactBytes = fs.readFileSync(output.path);
  assert.equal(sha(artifactBytes), output.artifact_sha256);
  const bundle = JSON.parse(artifactBytes.toString('utf8'));
  const result = JSON.parse(bundle.result_json) as CsvAnalyticsResult;
  assert.equal(result.status, 'PASS_DATA');
  if (result.status !== 'PASS_DATA') throw new Error('Expected valid analytics fixture');
  // QA ignores the tool's comparison verdict and reads fresh raw bytes + saved result.
  const rawForQa = fs.readFileSync(inputPath);
  assert.equal(sha(rawForQa), inputSha256);
  const comparison = verifyCsvAnalytics(rawForQa, bundle.result_json, LIMITS);
  assert.equal(comparison.outcome, 'MATCH');
  assert.equal(comparison.qualification, 'NOT_ASSESSED');
  const { csvEvidenceDefects } = await import('../agents/csv-qa.js');
  assert.deepEqual(csvEvidenceDefects(storage.loadMission(missionId)!), [], 'production host QA must pass before qualification');
  assert.equal(result.metrics.USD.net_cents, phase === 'first' ? '12000' : '777');
  assert.equal(result.metrics.EUR.net_cents, phase === 'first' ? '2345' : '-500');
  assert.equal(result.metrics.duplicate_rows, 1);
  for (const claim of ['integer cents', 'no FX conversion', 'pending events are excluded', 'no causal inference or financial-audit claim']) {
    assert.ok(bundle.report.includes(claim), `report missing ${claim}`);
  }
  const appliedLessonChecks = lessonChecks.map(check => {
    if (check === 'separate-pending') {
      assert.equal(result.metrics.USD.pending_refunds_cents, '12');
      assert.equal(result.metrics.EUR.pending_sales_cents, '901');
      assert.equal(result.metrics.EUR.net_cents, '-500');
    } else if (check === 'deduplicate-events') {
      assert.equal(result.metrics.unique_events, 4);
      assert.equal(result.metrics.raw_rows, 5);
      assert.equal(result.metrics.duplicate_rows, 1);
    } else if (check === 'separate-currencies') {
      assert.equal(result.metrics.USD.net_cents, '777');
      assert.equal(result.metrics.EUR.net_cents, '-500');
    } else throw new Error('Unknown persisted lesson check');
    return { check, passed: true, lessonRef: usedLessonRefs[0] };
  });
  // Negative QA control uses the real verifier, never a forged comparison verdict.
  const altered = structuredClone(result);
  altered.metrics.USD.net_cents = '0';
  const tamperedComparison = verifyCsvAnalytics(fs.readFileSync(inputPath), JSON.stringify(altered), LIMITS);
  assert.equal(tamperedComparison.outcome, 'MISMATCH');
  assert.ok(tamperedComparison.issues.includes('METRICS_MISMATCH'));
  const qa = storage.saveArtifactFile(missionId, 'independent-qa.json', json({
    mode: MODE, issuer: ISSUER, solver: SOLVER, specHash: approved.spec_hash, inputSha256,
    artifactSha256: output.artifact_sha256, comparison, tamperedComparison,
    appliedLessonChecks, usedLessonRefs, passed: true,
    acceptanceBoundary: 'Host qualification gates publication and completion; comparison alone is NOT qualification.',
  }), 'data', { fence });
  const binding = { solverId: SOLVER, scope: SCOPE, specHash: approved.spec_hash, capabilityHash, profileHash };
  const qualificationId = `r1-analytics-${phase}-qualification`;
  assert.throws(() => authority.admit(qualificationId, binding), /missing/);
  const issuedAt = Date.now();
  const receipt = { ...binding, qualificationId, receiptId: `${phase}-qa-receipt`, issuer: ISSUER,
    evidenceHash: sha(fs.readFileSync(qa.path!)), evidenceRefs: [qa.id, output.artifact_id, ...usedLessonRefs],
    issuedAt, expiresAt: issuedAt + 3_600_000 };
  assert.throws(() => authority.qualify(receipt, { issuer: ISSUER }, 0), /unauthenticated/);
  authority.qualify(receipt, credential, 0);
  const admission = authority.admit(qualificationId, binding);
  const publication = authority.withAdmission(admission, 'dispatch', () => storage.saveArtifactFile(missionId,
    'accepted-report.md', bundle.report, 'text', { fence }));
  const lesson = authority.withAdmission(admission, 'acceptance', () => {
    // Recheck persisted content in the actual synchronous acceptance critical section.
    assertApprovedSpecBinding(storage.loadMission(missionId)!, approved.spec_hash);
    assert.deepEqual(csvEvidenceDefects(storage.loadMission(missionId)!), [], 'production host QA rechecks final acceptance');
    assert.equal(sha(fs.readFileSync(output.path)), output.artifact_sha256);
    assert.equal(sha(fs.readFileSync(inputPath)), inputSha256);
    const saved = storage.saveArtifactFile(missionId, 'scoped-lesson.json', json({
      scope: SCOPE, contractDigest: CSV_ANALYTICS_CONTRACT_DIGEST, capabilityHash, profileHash,
      sourceSpecHash: approved.spec_hash, sourceQaArtifactId: qa.id, qualificationId,
      requiredChecks: ['separate-pending', 'deduplicate-events', 'separate-currencies'],
      lesson: 'Deduplicate event IDs, separate currencies and pending events, and independently recompute each fresh input. Never reuse old totals or approval.',
    }), 'data', { fence });
    const completed = storage.updateMissionAtomic(missionId, current => ({ status: 'completed',
      artifacts: [output.artifact_id, qa.id, publication.id, saved.id],
      metadata: { ...current.metadata, qualificationId, admission, qaArtifactId: qa.id,
        acceptedGeneration: admission.generation, toolsUsed: [...invokedTools], appliedLessonChecks },
    }), { fence });
    assert.equal(completed.applied, true);
    return saved;
  });
  const summary: AnalyticsFixtureRun = { mode: MODE, missionId, inputPath, inputSha256,
    artifactId: output.artifact_id, artifactPath: output.path, qaPath: qa.path!, qualificationId, admission,
    lessonRef: { missionId, artifactId: lesson.id, sha256: sha(fs.readFileSync(lesson.path!)) }, usedLessonRefs,
    netCents: { USD: result.metrics.USD.net_cents, EUR: result.metrics.EUR.net_cents } };
  fs.writeFileSync(path.join(resolved, `${phase}.json`), json(summary));
  return summary;
}
