# R1 live CSV mission — independent evidence and source review

## Verdict and scope

**PASS for the arithmetic, persisted artifact identity, and internal evidence consistency of this one engineering CSV run. PARTIAL for the end-to-end product chain; NOT a T2 completion, qualification admission, broad professional certification, or independently authenticated provider billing claim.**

Reviewed mission: `r1-live-237dbc13-6c96-4221-b268-a53e7457e629`.

Evidence root: `reports/r1-live-1794605930179` (abbreviated **R** below). Mission execution timestamps in the evidence are 2026-11-13 21:38:50–21:39:35 UTC. This report reviews the currently saved evidence and current working-tree source; it does not assert that current source hashes identify the exact source used at execution time.

Review method: read the six CSV lines directly, manually calculate the expected result, then separately recompute using Python standard-library CSV parsing and integer arithmetic. Read-only Python assertions checked saved file hashes, artifact registrations, canonical spec/receipt hash links, and all three ledger start/finish pairs. No application storage module was imported, no mission or test suite was rerun, and no provider request was made. Only this report was written. No `.env`, real `.awe-data`, memory database contents, or sealed-state contents were inspected. No commit was made.

Independence here means arithmetic and hash checks did not call the product solver or verifier and the reviewer did not generate this live run's output. This session previously implemented the qualification utility; this is not an organizationally separate certification of that utility.

## 1. Independent calculation from raw CSV

Raw source: `R/state/artifacts/r1-live-237dbc13-6c96-4221-b268-a53e7457e629/transactions.csv`.

| CSV line | Event | Observation | Contribution |
|---|---|---|---|
| 2 | `s1,o1,USD,sale,10500,settled` | First `s1` | USD settled sales +10,500 cents |
| 3 | Same complete `s1` row | Exact duplicate | Exclude once; duplicate count +1 |
| 4 | `r1,o1,USD,refund,1500,settled` | Unique refund | USD settled refunds +1,500 cents |
| 5 | `s2,o2,EUR,sale,7200,settled` | Unique EUR sale | EUR settled sales +7,200 cents |
| 6 | `p1,o3,USD,sale,9900,pending` | Unique pending sale | USD pending sales +9,900 cents; exclude from settled net |

Therefore:

- **USD net = 10,500 − 1,500 = 9,000 cents (USD 90.00).** One settled sale, one settled refund, one pending sale; no pending refund. Pending sales = 9,900 cents (USD 99.00).
- **EUR net = 7,200 − 0 = 7,200 cents (EUR 72.00).** One settled sale, no refunds or pending events. EUR pending group is empty; its totals/counts are zero.
- Five data rows, four unique event IDs, one duplicate row (`s1`); nonempty input. Both settled groups and the USD pending group are nonempty.
- No cross-currency sum or conversion is appropriate.

**Outcome: every metric, count, decimal-string type, and empty-group flag in `result_json` matches the independent calculation.** The human-readable `report` also agrees with these figures and states deduplication, pending exclusion, integer-cent units, separate currencies, and no causal/financial-audit claim.

## 2. Artifact identity and binding checks

Both IDs appear in the persisted mission's `artifacts` array. Each registration points to the expected file inside this mission's artifact directory and names this mission ID.

| Artifact | Registered ID | Exact bytes | SHA-256 | Outcome |
|---|---|---:|---|---|
| `transactions.csv` | `0a267d13-629b-4c00-af60-faa6f65c6e7d` | 196 | `dc8688503d27d1b45303147b8e2fe2cf8ef98f2e1d807e38112a1cfe8e9bd645` | PASS: bytes/size/path/mission match metadata and approved input hash |
| `csv-analytics.json` | `f84ab38e-18af-452f-9f5d-7f0d49d0082e` | 2,871 | `e784f5be5d09f341fe7eab4d3b6dcc93b05567e0a63cc4880a220edc1cca1d8c` | PASS: bytes/size/path/mission match metadata; inline registration content is byte-identical |

The raw input was registered by reconciliation at `21:39:25.281Z`; the output registration is timestamped `21:39:16.407Z`. Thus the two artifacts are one provided input plus one produced output, not two newly generated analytical deliverables. Log lines 5–7 agree: one new specialist artifact, then one reconciled input.

Independently recomputed hash links:

| Binding | Expected/recomputed SHA-256 | Outcome |
|---|---|---|
| Approved spec: SHA-256 of `awe-approved-spec-v1\n` plus recursively key-sorted compact snapshot JSON | `a8180aaefe2d846e5547b0d9bd761b5a627ac79bcf4061c1709d15fed4b5e465` | PASS; current specification equals bound snapshot specification |
| Exact embedded `result_json` UTF-8 bytes | `0a230910c0c67ca710910401fd8405f872dc8b405d13f59108e8fc85bb2bf76f` | PASS |
| Canonical limits `{maxBytes:100000,maxRows:1000}` | `b8d8d2a27b5a9d9601283c433e5058a6ca2805e54be64b9595a99d5f4db152f9` | PASS |
| Canonical independently calculated `{status:"PASS_DATA",metrics:…}` | `e61f3cc81957aba61d467dd5c35d2496f54cdcbd34e81bc42c8620c39273e720` | PASS |
| Canonical verifier receipt excluding `receipt_sha256` | `7dc04e04956c515530f03f227b55f73fb05ba68519d5b87cc82513e56653d4c6` | PASS |
| Exact `research/r1-kortix/ANALYTICS-CONTRACT.md` bytes | `ee21de150b9c8101aa5ab8a275b80ccdf0dccfb982ecf26d61d83f217ea1ba0c` | PASS; equals solver, verifier, and result pins |

These are consistency/integrity checks, not signatures or independent authentication of the writer, issuer, or provider.

## 3. QA verdict and chain completeness

Persisted mission evidence reports `status: completed`, `qa_score: 9`, `qa_passed: true`, zero repairs, and `qa_gate.passed: true` with no blockers. Its criterion explanation enumerates the same independently verified values. The bundle reports reference verifier `r1-csv-reference-v1`, `outcome: MATCH`, and explicitly **`qualification: NOT_ASSESSED`**.

Current implementation supports a substantive deterministic check: `src/agents/csv-qa.ts:31–60` reopens approved raw input, checks its approved digest, validates saved output identity, and recomputes `result_json` through the separate verifier. `src/agents/qa-agent.ts:135–138,209–217` makes resulting defects critical and binding. The verifier has a separate parsing/grouping algorithm and no runtime import of the solver (`src/capabilities/csv-verifier.ts:1–5,33–128`). This reviewer independently checked the actual bytes rather than relying on the bundle's own MATCH field.

| Chain link | Evidence-supported conclusion |
|---|---|
| User request → Prompt Master | **Not exercised in this live run.** `scripts/r1-live-analytics.ts:20–42` constructs input/spec and approves them directly. No Prompt Master ledger entry exists in this bundle. |
| Explicit approval | Persisted approval binding exists and validates. The script records engineering authorization, not a separately captured interactive user approval receipt. It is not evidence of the normal UI/CLI approval interaction. |
| Head planning | Log lines 2–3, persisted analyst task, and a completed Head SDK invocation agree. |
| Manager → specialist → real tools | One analyst node, depth zero, with `file_read` and `csv_analytics`; persisted output and input identities corroborate useful execution. No nested/parallel delegation is demonstrated. Per-tool argument/result transcripts are not included. |
| Independent QA → saved result | Deterministic comparison receipt, persisted LLM/gate verdict, and independently checked output agree for this input. There is no separate persisted host-QA attestation binding the final spec/output hash beyond these records and current source. |
| Qualification admission/revoke | **Absent from this live evidence.** No qualification/admission records are present in the enumerated bundle; the script expressly says “no product admission.” |
| Learning/transfer | No second mission, reused lesson, measured transfer, or revoke/restart experiment is shown by this run. |

Consequently, “Head → analyst tools → QA → correct saved CSV artifact” is supported. “Complete user → Prompt Master → approval → qualified recursive multi-agent → verified production result, with no missing links” is not supported.

Head's persisted task additionally requested the input path and duplicate event IDs inside the output artifact. The artifact contains the input hash and aggregate duplicate count but not the path or the ID `s1`. Those can be recovered from the linked spec/raw CSV, so the stated mission criterion is met, but strict fulfillment of every Head-authored output detail should not be claimed. Its promised hash-mismatch/limit blocker behavior also exceeds the current tool contract (finding F2).

## 4. Model ledger: what is and is not established

All three summary entries exactly match their persisted `.finished.json` records. Each has a corresponding `.started.json` with matching call ID, mission, role, model, provider, and start time.

| Role | Model label | Input | Output | Total | Cached input |
|---|---|---:|---:|---:|---:|
| Head | `claude-opus-5-5` | 2,312 | 1,487 | 3,799 | 0 |
| Analyst | `deepseek-v4-flash` | 12,183 | 1,147 | 13,330 | 7,936 |
| QA | `claude-opus-5-5` | 4,907 | 824 | 5,731 | 0 |
| **Recorded SDK aggregate** | | **19,402** | **3,458** | **22,860** | **7,936** |

All records report zero reasoning tokens and `usage_status: reported`; actual dollar cost remains **UNKNOWN**, as the summary says. Cached tokens are a reported subset, not added again to totals.

`src/utils/model-ledger.ts:94–104,139` explicitly records one SDK invocation using aggregate `totalUsage`/`usage`. Tool-loop requests and provider retries can occur inside that invocation. Three records do **not** prove exactly three HTTP requests, per-retry accounting, invoice reconciliation, provider model identity, or complete embedding/memory billing coverage. No provider-side receipt or independent network observation is in this bundle.

The mission's legacy `metadata.execution.totals.total_tokens = 13,330` covers the analyst delegation only, excluding the Head and QA. This is consistent with `mission-manager.ts:2556–2585`, but must not be presented as whole-mission usage. The ledger sum is 22,860 reported tokens for the three observed SDK invocations. Ledger entries do not themselves carry the approved spec hash, qualification generation, or checkpoint/attempt ID.

## 5. Prioritized current-source findings

These are source-confirmed gaps or explicitly identified risk schedules, not newly executed exploit reproductions. They do not change the verified numbers in this saved run.

### F1 — High: qualification is not globally mandatory

`createQualificationAuthority` is integrated into `src/capabilities/analytics-mission.ts`, whose first line identifies it as a deterministic offline integration fixture. It gates that fixture's publication and acceptance (lines 233–261). The live script invokes `MissionManager` directly; production tool context, `executeSpecialist`, and manager finalization do not require a qualification admission or recheck its generation. A qualification revoke therefore is not a universal dispatch/completion fence.

**Action:** wire a host-issued admission into the normal Manager/tool ownership protocol and final acceptance, with explicit restricted candidate/practice execution. Keep the existing engineering-only label until that route is enforced. Do not treat an internally computed comparison receipt as issuer authority.

### F2 — High: CSV tool execution does not enforce approved input identity

`src/tools/index.ts:909–919` supplies approved limits and checks tool inclusion, but does not pass/enforce `spec.csv_input.path` or `.sha256`. `src/tools/csv-analytics.ts:65–84` reads the model-selected granted path and computes/persists totals without comparing those bytes with the approved input digest. Host QA later catches a wrong input (`csv-qa.ts:37–55`), which protects this completion route, but it is not pre-execution prevention and does not fulfill the Head plan's “hash mismatch → do not compute/report totals” promise.

Oversized files are rejected before read at tool line 40 by throwing; this path does not persist the blocker artifact promised by the Head plan. Malformed in-bound input can produce a matched `BLOCKED_INPUT` result with `success: true` (comparison success); production QA subsequently rejects it as successful analytics. Consumers must distinguish these statuses.

**Action:** inject the approved input path/digest alongside limits, compare the bounded descriptor snapshot before analysis/save, and define one documented blocker-output contract. Add wrong-but-valid CSV input tests at the production tool boundary, asserting no successful totals artifact is published.

### F3 — High: deterministic CSV QA verifies machine metrics, not the complete owner-facing bundle

`csvEvidenceDefects` recomputes only `bundle.result_json`; it neither validates `bundle.report` against those metrics nor compares the saved `bundle.verification` object with the fresh receipt. A registered bundle with correct machine metrics but misleading human text or invented receipt fields can pass this deterministic seam; the LLM is then the remaining protection. This saved bundle's text and receipt are correct, independently checked here.

**Action:** validate the complete envelope and report consistency, or generate the accepted human report from fresh host-verified data. Persist the fresh host comparison tied to spec hash, exact input/output hashes, and verifier version. Test correct metrics plus deliberately false report/receipt.

### F4 — High: T2 resource and general filesystem race closure is incomplete

The current shell profile is materially stronger than the earlier broad-host mount: fresh filesystem, private temp/home, network/IPC/UTS isolation, dropped capabilities, system runtime mounts, mission workspace and masked control state (`shell-sandbox.ts:22–47`). The shell release uses a supervisor pipe, not a shared registry mount (`tools/index.ts:280–299`). These are source observations; this CSV run used no shell and cannot demonstrate their behavior.

However, the launch has no visible cgroup/rlimit controls for memory, CPU, process count, or filesystem growth. Time/output limits are not equivalent. General `assertSafePath` followed by ordinary filesystem access remains a check-then-use pattern; concurrent symlink/parent replacement can occur between checks and reads/writes/mount setup. Optional `workspaceRoot` permits broader fallback for callers that omit the grant. Credential-file scanning is a launch-time name filter and explicitly skips descent into `node_modules` and `.r0-*`; it is not a universal secret-free input guarantee.

The CSV reader improves this with `O_NOFOLLOW`, nonblocking regular-file checks, descriptor-path validation, metadata/inode checks, and approved bounds (`tools/csv-analytics.ts:30–61`). That does not establish race freedom for every file tool or artifact path. Manager final artifact checks precede the terminal write, and a mission write lock alone cannot prevent an independent OS writer changing bytes.

**Action:** require explicit mission workspace grants, enforce resource quotas, and use descriptor-relative or isolated-worker filesystem operations plus immutable verified artifact snapshots. Test adversarial swaps and resource exhaustion with synthetic canaries and a host-side effect observer. **T2 acceptance remains unproven by this review.**

### F5 — Medium/high observability: whole-mission cost and attempt provenance remain partial

The new ledger preserves started/finished SDK observations and honestly leaves dollars UNKNOWN. Legacy execution totals still omit Head/QA and default absent delegation usage to zero. There is no call-level spec/generation/attempt link, and SDK-internal retries are aggregated.

**Action:** label legacy totals as delegation-only, use the ledger projection for mission-wide reported usage, add spec/attempt provenance, retain UNKNOWN semantics, and obtain trustworthy provider-level observations before claiming full spending/retry coverage.

## 6. Reproducible evidence/source identity

Paths below are relative to the workspace except those beginning `R/`, which use the evidence-root abbreviation above. SHA-256 was computed directly from bytes using Python `hashlib.sha256(Path(...).read_bytes())`. Arithmetic verification used only `csv.DictReader`, exact duplicate comparison by event ID, and Python integers. Canonical hash verification used recursively sorted compact JSON, preserving arrays/scalars; no production verifier code was executed.

```text
1155a7cb5728be2119b2a2d047ad48fd8b62026efa5b8e948a379e8739ad2e83  R/summary.json
82ca9eaacefb0f9b1774d110ba3bfbc11dd2f14717f6c78c15d51471e658f1c4  R/state/missions/r1-live-237dbc13-6c96-4221-b268-a53e7457e629.json
9b3dc0a0da17b386c8ff06872fe9beeac0157283447eb4a4ac6b2a69886ef18d  R/state/r1-live-237dbc13-6c96-4221-b268-a53e7457e629.log
c9cb869b9c80a0a0f251c96a15a23b08bb4daf298c305651e76e0bc6caf98ea2  R/state/delegation-trees/r1-live-237dbc13-6c96-4221-b268-a53e7457e629.json
89a264ba7abc0a454992d080923bbd8adac4a2dc96eeb71c8893bc48d2a6f717  R/state/artifacts/0a267d13-629b-4c00-af60-faa6f65c6e7d.json
b3731268ec09f254eabc080ebf5ac4c9f5935149e13f6da998185e0232aaf0df  R/state/artifacts/f84ab38e-18af-452f-9f5d-7f0d49d0082e.json
b45c7e6024980f06004cc3cd58d6a016a1b743c8cb81bc255d80a6fff4e8585b  R/state/model-calls/00f0fb4a-75cd-4721-807f-6eec8b2e215b.started.json
451dce31fbbccc9ba84c223b34d58673a95f2c04452e688f73c2ccb6d7cb562c  R/state/model-calls/00f0fb4a-75cd-4721-807f-6eec8b2e215b.finished.json
d35047f1f35650cd2fe4072108499cdff82b7a5f26ac87b0f710d35adf1fa2de  R/state/model-calls/4dfe3c5a-275b-4b44-92d1-ea87af3b5f3c.started.json
993fd5e9ba1c2fc736b828fa67f1d556854924339c437a996be0c721912f0227  R/state/model-calls/4dfe3c5a-275b-4b44-92d1-ea87af3b5f3c.finished.json
8122c2b72f2fe8fcf0d1d6ce18a001f36455ef22006fad53e065cdc55ccae4d1  R/state/model-calls/c4a432ad-e95c-4e99-b087-77cfb54e3210.started.json
8702f519c833884850e0aa6cc357e9f794ed6a77c7ae0fbcba690dcc59bc2921  R/state/model-calls/c4a432ad-e95c-4e99-b087-77cfb54e3210.finished.json
8fd66979c5cf7843a03c14cb49203d1b9e28f75334078710380863796588aeda  src/agents/csv-qa.ts
2ee05f03ecfda3d474bbe9bab3dd08579dbd58e67242598cd8379ae6f6d49e43  src/tools/csv-analytics.ts
24aa9be0a8395acc47f0b03a4ea94ed3cdf9f1a57918050fd97d985cc22512b8  src/tools/index.ts
524fb0232ca33aa6b005434de4ce0b5f35548d9040188fa03a3adc4308ae9979  src/capabilities/csv-analytics.ts
a663cee200fd23347c95a11cf968bee537a5386daaaf6504423c3289d6d5dc04  src/capabilities/csv-verifier.ts
39d9704e19819329c7fe285921cd40b7941d5bbcafdfeefc66fb18e2426f4a6c  src/capabilities/analytics-mission.ts
37e7d6a66d8378fc6791e84c0c1a0cfea60c60d589149643d555a90da503573c  src/agents/mission-manager.ts
b45e8aebbcbc4c0f5a66e83c495b30887f90ba1870e5b4a33617c3196585b355  src/agents/qa-agent.ts
f8b8b6c884b8bd7c13b5e19387246948abe7589eb8132c5e3224f8a0262782d5  src/agents/specialists.ts
f6d3b901b93bac54c8f1802bbca6e5c890b8b3be7344cb1f1f4d643d1f64c55d  src/agents/head-agent.ts
8b4bd31a31c7fd6aa3ef316b64fe7f4b38a52b501b28a596711fcf6356f7a008  src/agents/prompt-master.ts
26757301630d2f17288428eab91e4a2e343c990491be8b75ce2aea32167e2cfe  src/utils/spec-binding.ts
e0164ae9dbc2cefe7953ea4ef6e5096fd8b61a0fe5944be6e1a97661e18ba171  src/utils/model-ledger.ts
5cd73931ce7eb995fa4b6d88a2a8a22a7873166e3379983dc7a225f1a8b0ca77  src/utils/qualification.ts
aa12e2b6a855ff6be7d0dd65a0bc0e0268e77b1de31f8cef22166e7c850423d0  src/utils/storage.ts
7f6753bf02c85a5ffef2558f3e0541425e9b0f676bfbe15c0d2f3de0c0704780  src/security/shell-sandbox.ts
10a01499719adc8dc9c843973777ec13168eaf4c22cb7280eeddf1af5e25261f  src/security/paths.ts
90dd53241ae665a949958231593b16930e821eeb4d6c61d84a82669a8886ccf0  src/security/tool-context.ts
54902238ed8f77cc3106dda53fd1045d75afba1fd04778a041d218d8da8ae513  scripts/r1-live-analytics.ts
```

## Final assessment

The saved live mission demonstrates a useful and numerically correct engineering vertical slice with real persisted artifacts, internally consistent model invocation records, approved-spec binding, and an independently reproducible QA result. It does not demonstrate the missing Prompt Master/interactive approval/mandatory qualification/recursive execution/transfer links. Current source retains the high-impact gaps above. The recommended next gate is production admission wiring plus negative input/report/finalization tests and T2 resource/race qualification, not a broader readiness claim from this single five-row example.
