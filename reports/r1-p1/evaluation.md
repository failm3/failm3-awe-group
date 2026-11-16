# R1 P1: model routing, ledger completeness and bounded lesson comparison

## Scope and result

The initial routing task changed only `src/config/models.ts`; the later parent integration explicitly extended specialist/manager/tool types and the existing ledger. No provider calls, secrets or real mission state were used. Commits are made only by the parent after final verification.

The routing correction is usable immediately through existing `selectModelForRole` call sites. Parent integration subsequently connected the opt-in per-agent host router through top-level, repair and recursive execution.

## Actual routing versus advertised dynamic choice

Before this change, Head selected a role and tool list, not a model ID. `DelegationPlanSchema` has no model choice field. Prompt Master, Head and QA use configured static models; specialists originally called a static role lookup followed by insertion-order substring matching. That substring behavior is now replaced by segment-aware matching and explicit host-routing precedence. There remains no task-sensitive automatic model-quality evaluation, provider-availability discovery or cost optimization. Updated config comments describe this accurately rather than claiming dynamic/best-available selection or current live verification.

Concrete prior risks:

- `senior-code-reviewer` matched `code` before `code-review`, selecting Kimi instead of the planning/review model.
- `breakfast-writer` matched `fast`, selecting DeepSeek instead of the writer model.
- `decoder` matched `code` despite not being a coding-role segment.
- `research-coder` resolved by catalog insertion order instead of explicit conflict handling.
- `constructor` read an inherited object property as if it were a catalog model ID.

Now exact defaults are preserved, whitespace/underscores normalize to hyphens, role segments match at hyphen boundaries, researcher/reviewer aliases are explicit, longest compound wins, and conflicting equally specific models fall back to the planning default. This is deterministic policy correctness, not evidence that a selected model performs better. New composite labels can intentionally route differently; providers and model availability were not queried.

### Exact parent integration: trusted per-agent model choice

Export added:

```ts
createHostModelRouter({
  allowedModels: ['deepseek-v4-flash', 'claude-opus-5-5', 'gpt-6-astra'],
  byAgent: { 'stable-host-node-id': 'gpt-6-astra' },
  byRole: { analyst: 'deepseek-v4-flash' },
}) // returns (role: string, agentId?: string) => getModel-compatible config
```

1. Construct the router once from trusted host configuration, never from a Head plan, tool input, prompt, artifact or user-editable mission metadata. `allowedModels` must include every acceptable default as well as override. Unknown/unapproved selected defaults throw before a call.
2. Use a stable unique host node ID, e.g. `config.nodeId`; Mastra's existing `specialist-${role}-${depth}` is not unique for peers of the same role/depth.
3. In `executeSpecialist`, select **once** before constructing the agent. Pass that same selected model configuration to `createSpecialist`, use `selected.modelId` and `selected.providerId` in `withModelCall`, and return `selected.modelId` in the outcome. Do not resolve independently three times at construction, ledger recording and outcome.
4. Make the host route dependency explicit in specialist construction/execution, distinct from model-authored `SpecialistConfig` fields. Preserve default behavior for existing callers. Recursive execution receives the same trusted dependency through ToolContext/DelegateOptions; if only the public role resolver is used, it lacks node ID and cannot describe per-agent overrides accurately.
5. Record actual selected outcome model in manager/delegation tree. On failed calls the ledger still needs the same selected model. Pre-execution attribution must not substitute the old role resolver for a node-specific route.

Validation covers bare Router.Cheap model-ID syntax, allowlist membership, normalized duplicate role keys, invalid maps and accessor overrides. The router snapshots maps and allowlists; independent routers and concurrent selections do not share mutable state. Precedence is exact host node, exact normalized role override, default policy. There is no environment mutation or global setter. Bare IDs intentionally exclude provider prefixes/URLs. Syntax and host approval do not prove live availability, suitability or price. This host API is not a security boundary against arbitrary trusted JavaScript.

## Ledger audit

`src/utils/model-ledger.ts` was initially audited read-only; the discrepancies below are now corrected and tested by the parent integration.

Positive evidence from existing tests: durable starts before invocation; crash-orphan UNKNOWN records; terminal-write failure propagation; failure/abort handling without provider error strings; parallel attribution; explicit zero versus absent counts; Prompt Master/QA production call-site attribution. Static inspection found all four production `agents/*.ts` generate sites wrapped. Direct test/probe calls outside those host entrypoints are not globally intercepted.

Completeness limits demonstrated by new offline tests:

- Records are per explicit SDK invocation, not per HTTP request, retry or tool-loop step. A retry/step invoice cannot be reconstructed from these records alone.
- Aggregate SDK detail fields and explicit raw OpenAI-style cached/reasoning fields are retained. Initially raw nested fields remained UNKNOWN.
- Empty `totalUsage: {}` now falls back to nonempty invocation `usage`. Steps are deliberately not summed, avoiding overlap.
- Contradictory total arithmetic is retained for provenance but marked `partial` with `usage_mismatch`, rather than silently fully reported.
- Missing provider binding stays UNKNOWN. Every cost stays `{status:'UNKNOWN', amount:null, currency:'USD'}`. No price feed, billing reconciliation, account-limit enforcement or complete spend accounting was demonstrated. No prices were guessed.
- Integration aligned specialist outcomes and persisted `AgentResultSchema` with ledger semantics: absent fields are UNKNOWN, not fabricated zeroes. Totals become UNKNOWN if any constituent outcome lacks a reported count, including when the first outcome lacks usage; the positional regression first demonstrated 4 instead of UNKNOWN, then passed after the correction. Historical numeric records remain readable. Focused evidence: `reports/r1-p0/usage-unknown-fix/` (admission 14/14, ledger evaluation 3/3); another legacy-fixture failure in that invocation is retained separately and is not counted as a passing manager run.
- The ledger binds a role but no stable agent/node ID. Concurrent identical-role calls get unique call IDs, yet same-role node attribution remains incomplete. Routing selects and reports one consistent model per specialist; adding node identity to every ledger record is separate future work.
- Record read validation checks schema version and filename identity, not the entire schema; do not interpret its corruption check as complete integrity verification.

## Equal-budget lesson comparison

`src/tests/r1-p1-lesson-comparison.test.ts` first runs the existing three-fresh-process deterministic CSV integration. This creates and verifies a real scoped lesson artifact, reuses it on a changed input, and exercises qualification revocation. The comparison then uses that persisted lesson against a no-lesson baseline on **identical bytes per pair**, alternating arm order. Real CSV-tool reads, saved files and independent verifier execution are used. Temporary isolated state is removed on success/failure after a successful fixture launch.

Seven predeclared cases: fresh integration second input, maximum allowed integer cents, exact duplicate, pending/multiple currencies, conflicting duplicate, fractional cents, out-of-range cents. Correct rejection is counted as a correct outcome, not as successful data analysis.

| Metric | Baseline | Scoped lesson |
|---|---:|---:|
| Correct outcomes | 7/7 | 7/7 |
| PASS_DATA / BLOCKED_INPUT | 4 / 3 | 4 / 3 |
| Production CSV tool calls | 7 | 7 |
| External independent verifier calls | 7 | 7 |
| Input bound per call | 32,768 bytes / 100 rows | 32,768 bytes / 100 rows |
| LLM/network calls | 0 / 0 | 0 / 0 |
| Additional lesson assertions | 0 | 12 |

All seven paired result JSON values were byte-identical. Correctness delta = 0; tool-call delta = 0; tool-selection changes = 0. Both arms are assigned `csv_analytics` by the harness, so this cannot establish improved learned tool selection. The extra lesson assertions are bounded local checks, not identical CPU work; no latency, token-dollar budget or general competence comparison is claimed. The integration's first and second inputs differ and are **not** themselves used as an A/B quality comparison. The positive evidence is persisted/scoped lesson reuse and explicit QA coverage, not LLM learning, optimization or improved analytics competence.

## Reproduction and failures

```sh
TMPDIR=/tmp/opencode AWE_TEST_RESULTS_DIR=reports/r1-p1/test-results node scripts/run-offline-tests.mjs src/tests/r1-p1-model-routing.test.ts src/tests/r1-p1-ledger-evaluation.test.ts src/tests/r1-p1-lesson-comparison.test.ts src/tests/r1-model-ledger.test.ts
```

Initial run: routing 4/4, ledger characterization 3/3, existing ledger 8/8 passed. Comparison initially failed because its large-amount fixture incorrectly expected `9007199254740993` to pass: production explicitly caps individual amounts at `9007199254740991`. Corrected the positive boundary and added the larger value as a seventh BLOCKED_INPUT control. Corrected comparison passed 1/1; evidence in `reports/r1-p1/paired-rerun/`. Initial failed evidence retained in `reports/r1-p1/test-results/`.

Initial `npm run typecheck` found a concurrently edited, out-of-scope `src/capabilities/web-product.ts:189` receipt `verifier_version` inferred as string rather than the literal version type. It reported no errors in this task's files. Parent should rerun global typecheck after concurrent integration.
