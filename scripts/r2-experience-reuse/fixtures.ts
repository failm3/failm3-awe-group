import {
  ALL_TARGETS as FROZEN_TARGETS, CONTROLS as FROZEN_CONTROLS, HIDDEN_CASES_PER_TARGET,
  MODEL_ID, SOURCE_ARTIFACT, SOURCE_CONTRACT, TOOLS, duplicateMutant, escapeMutant,
  formatSpec, hiddenCases, rangeMutant, sha256, sourceEdgeCorpus, splitOnlyMutant,
  stubSource, targetSource, visibleTest, type TargetConfig,
} from "../r2-final-transfer/fixtures.js";

export const TARGET_COUNT = 20;
export const CONCURRENCY = 4;
export const ALL_TARGETS: readonly TargetConfig[] = Object.freeze(FROZEN_TARGETS.slice(0, TARGET_COUNT));
export const CONTROLS = Object.freeze({ ...FROZEN_CONTROLS, wallCapMs: 900_000, concurrency: CONCURRENCY });
export {
  HIDDEN_CASES_PER_TARGET, MODEL_ID, SOURCE_ARTIFACT, SOURCE_CONTRACT, TOOLS,
  duplicateMutant, escapeMutant, formatSpec, hiddenCases, rangeMutant, sha256,
  sourceEdgeCorpus, splitOnlyMutant, stubSource, targetSource, visibleTest,
};

export function manifest() {
  return ALL_TARGETS.map(config => ({
    index: config.index, config,
    format_sha256: sha256(formatSpec(config)), visible_sha256: sha256(visibleTest(config)),
    stub_sha256: sha256(stubSource(config)), reference_sha256: sha256(targetSource(config)),
    hidden_sha256: sha256(JSON.stringify(hiddenCases(config))), hidden_cases: HIDDEN_CASES_PER_TARGET,
  }));
}
