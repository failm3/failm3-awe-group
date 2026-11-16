# R2 — final checkpoint status

**Status: R2 NOT CONFIRMED — professional run 5 passed full offline readback; DoD 6 is a preserved invalid/negative result.**

Current development checkpoint: `e1bb6f9` on `r2/final-autonomy` (plus this final status commit). The model used
for development is Kimi K3.1 Pro High (`routercheap/kimi-k3.1-pro#high`), confirmed
as active through the Router.Cheap model catalogue. No Nox agent model, key, budget,
permission or approved acceptance criterion was changed.

No frozen experiment is rerun or edited. In particular,
`reports/r2-final-transfer-1794798010397/` retains its original negative/invalid
result and its pre-existing modified/untracked continuation evidence is deliberately
excluded from commits.

## OWNER R2 DoD — evidence map

| # | Criterion | Evidence | Verdict |
|---|---|---|---|
| 1 | A real end-to-end mission on a previously unknown task | acquisition run `1794846721863`, `passed: true`; professional run 5 completed both real missions through production QA and passed full offline readback | **PASS** |
| 2 | Autonomous capability acquisition with an invocation receipt | acquisition run `1794846721863`: unknown `observation-digest-v1` caused acquire + replan, one qualification was published/reused, actual receipt bound to mission, attempt, executable and command, exact independently recomputed outputs and final bytes passed | **PASS — 12/12 checks** |
| 3 | Parallel delegation with independent acceptance under unchanged criteria | professional run 5: exactly one top-level coordinator, two distinct children, one shared parallel reservation, host-observed overlap and attributed artifacts; both missions concurrently completed through independent QA | **PASS — full saved-evidence readback** |
| 4 | Self-detected defect and bounded repair | acquisition run `1794846721863` completed after diagnosed acquisition/replan repairs; professional runs 2–5 drove bounded recursion and document fixes; R10/R11/R12 regressions and 61 verifier controls pass | **PASS — defects preserved and minimally repaired** |
| 5 | Experience reuse across missions | frozen transfer `1794798010397` remains invalid and unchanged; independent run `1794858271974` completed 40 arms / 40 calls but is invalid (`t05-on` API failure, `t18-off` empty terminal result); 18 valid pairs: ON 12, OFF 11, McNemar p=1 | **FAIL / NO SIGNIFICANT BENEFIT — preserved without retry** |
| 6 | Product usable by its owner, with observable artifacts and independent QA | green acquisition and professional run 5, real artifacts/model ledger/receipts, complete offline readback, UCL read by AWE GROUP and OpenCode/MCP | **PASS for usability/observability; overall R2 remains blocked by DoD 5 and publication** |

No criterion is redefined, relaxed, or replaced. Professional run 5's original
`summary.json` remains FAIL under its original parser; `reverification.json` is a
separate offline PASS after format-only verifier fixes, with the original summary
hash, all saved bytes, production QA and delegation evidence checked. DoD 6 remains
invalid/negative and is not retried.

## Repairs and regressions since the stale checkpoint

### Acquisition loop — green run 18

`a127843` fixed the corrective observation task so a proposed `local_target` also
carries the required `acquired` rule. Earlier fixes in this chain include exposing
host invocation receipts to independent QA, one bounded corrective observation
write, strict qualified-target evidence and fail-closed artifact integrity. Live
run `1794846721863` passed every check with provider monetary cost still `UNKNOWN`.

### Delegation artifact production

`42c1d27` addressed professional run 1's real failure: the coordinator granted its
children only `file_read` and told them not to write. The delegate contract and Head
plan now require every child to persist its own artifact; a read-only child grant is
warned about without changing the explicit empty-grant denial contract. Regression
R10 passes and the following live run produced both child artifacts.

### Nested host attribution

`88d08ee` fixed professional run 2's observation defect: nested children rebuilt
the module executor instead of inheriting the host executor injected into
MissionManager. The trusted executor now passes through specialist options, tool
context, recursive delegation and bounded repair. R11 proves both parallel children
reach the injected executor and fails on pre-fix code. This is a product fix, not a
verifier relaxation.

### Spec-neutral professional document formats

`a53cf43` and `c90f724` fixed verifier parsing only where the approved specification
imposes no notation: source tables, bounded median wording, labelled provenance,
header-bound team metrics, exact recomputed differences, accepted same-name
revisions, lettered Sources headings, digit-free directive recommendations,
completion percentages following their own counts, and `/`/`÷` formula notation.
Exact values, source paths, citations for factual claims, artifact attribution and
input immutability remain mandatory.

The corrected parser was applied directly to the persisted run-2 documents: both
research and analytics now pass every text/numeric check. This does not retroactively
make run 2 PASS because its original host attribution evidence was incomplete.

Run 3 (`2026-11-16T19-44-16-972Z-3162655`) then produced real host-observed nested
children with overlapping intervals. It failed for two independently demonstrated
reasons: the coordinator issued two separate delegate calls rather than one parallel
reservation, and its factual Markdown table rows contained no citations. Neither
check was weakened. `238f773` makes the one-call `parallel: true` contract explicit
and R12 covers it; the specification now states explicitly that every factual table
row needs a citation.

`5a5f369` admits only bold citation notation, labelled input-basis provenance,
floating-point-safe exact two-decimal differences, and exact aggregate remainders.
Each has positive and negative controls. The persisted run-3 research artifact still
fails its uncited-table check, while its bold Sources map now passes; its analytics
artifact passes all text/numeric checks. Run 4 is the new independent live trial.

### Professional run 5 — verified readback

`0a97f58` preserves professional run `2026-11-16T20-21-29-437Z-3269230`.
Both missions reached completed through production independent QA. Research has
exactly one top-level coordinator, exactly two distinct child researchers, a shared
parallel reservation, overlapping host-observed intervals and attributed evidence
notes. Analytics has distinct analyst/writer delegations and exact metrics.

The original summary failed only three document-notation checks. `326d46d` adds
bounded parsing for plain source mappings, plain labelled provenance and the exact
independently recomputed immutable-input size, with negative controls. The separate
`reverification.json` now passes every check, records the original summary hash and
performs zero model/network calls. It does not overwrite the original FAIL summary.

## New independent DoD 6 experiment

`826f493` preregisters 20 deterministic pairs (40 fresh arms), 900-second per-arm cap
and host concurrency 4, exactly as approved. It reuses the frozen harness's target
fixtures and independent verifier through imports but does not modify that harness.

Offline preflight `1794858224019` passed:

- 20 reference targets and 880 hidden cases;
- all 80 seeded mutants rejected by their intended detector;
- source artifact verification and paired-analysis negative control;
- zero network calls and zero model calls.

The separate live run `1794858271974` is complete and committed at `2a53bf7`.
Exactly 40 unique attempts and 40 pinned-model calls were recorded with zero retries
and intact harness hashes. The experiment is invalid under its preregistered
protocol: pair 5 ON had a provider API failure, and pair 18 OFF returned an empty
terminal specialist result even though its artifact independently passed all 44
cases. No failed arm was retried or hidden.

Among the 18 valid pairs, ON passed 12 and OFF 11; discordant pairs were b=2, c=1,
with exact two-sided McNemar p=1. There is no statistically significant measured
benefit. Provider cost remains `UNKNOWN`. This result does not replace or modify the
frozen invalid transfer.

## Unified Capability Library — two consumers

One read-only UNVETTED index (`data/db/ucl.sqlite`, 4 466 records / 4 504 source
rows), two independent readers:

- AWE GROUP: `src/tools/ucl-search.ts`, tool `capability_library`, in-process,
  gated by `UCL_ENABLED` plus a mission grant.
- OpenCode / any MCP client: `src/ucl-mcp/main.ts`, stdio server `awe-ucl`,
  tools `capability_search` and `capability_inventory`, over the same unmodified
  `src/ucl` librarian.

Neither consumer can install, execute, grant or qualify. Both return metadata only
(`permissions: NONE`, `execution_authority: false`). Credentials remain separate.
The index stays byte-identical after reads; see `docs/ucl-two-consumers.md`.

## Verification at final checkpoint

- Final full offline suite: **53 passed, 0 failed** (`offline-after-run5-fixes.log`).
- TypeScript `tsc --noEmit`: **clean**.
- Professional `--validate-only`: **passed**, all three references and **61 controls**.
- Professional run 5 offline readback: **passed**, both missions, zero new calls.
- New experience-reuse offline preflight: **passed**.
- Saved run-2 research and analytics documents: all text/numeric checks pass under
  the corrected verifier (historical run verdict unchanged).

## Remaining blockers / active work

1. Professional run 5 is verified. Run 4 remains failed for its actual delegation
   topology and attribution; no historical result is rewritten.
2. DoD 6 is complete and invalid/negative; do not retry or rewrite it to obtain a
   preferred result.
3. Provider balance and monetary per-call cost remain unknown (`provider_cost:
   UNKNOWN`); no balance or purchase action is inferred.
4. GitHub publication is not complete: this worktree has no configured remote and
   no concrete target repository URL/name has been supplied. Commits and evidence
   are retained locally; no external publication is fabricated.
5. R3 does not start until all six criteria have verified evidence and the accepted
   core is frozen.
