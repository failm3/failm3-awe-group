# INDEPENDENT QA R2 - Nox R2 bridge patch (nox-r2-ucl-bridge.patch)

**Verdict: PASS_WITH_FINDINGS.** The central safety claim holds: I could not make the tool execute, grant or approve anything. Three packaging defects (MAJOR) need fixing before the owner is told this is clean: the bridge suite fails under Nox's own runner, the registry now hard-depends on node:sqlite at import time, and the tool is unreachable from the capability-acquisition loop it claims to feed.

Compatibility is proven against snapshot 68cc0ee2 (r1/dev, captured 2026-11-15T04:01:39Z) only. R2 may have moved since.

## Provenance of what I tested

| Artifact | sha256 |
| --- | --- |
| ucl-qa-r2.tar.gz | c5f333bad2ded22cd64042c169e3c0d4e44ed9b03a8ca1284fbcd348b115eda1 |
| nox-r2-ucl-bridge.patch (3344 lines, 16 files) | a7afa280a0d49ed96501b910b053c2179d4d9515118b1ffa078b1e901edd9a53 |
| nox-r2-integration-snapshot.tar.gz (inner) | 9b9702b56bd3e44dcaa41307a5a25a55882e8bf59bc31f5dd991735a8d951ea7 (matches sidecar SHA256SUMS) |

Snapshot: 190 of 190 archived files re-hashed OK against SHA256SUMS; the 3 sidecars (tar.gz, MANIFEST.json, README.md) also OK.

Delivery defect: ucl-qa-r2.tar.gz contains only the patch and the library copy. The Nox snapshot the patch applies to was NOT in it. I recovered it with `kortix sessions cp` from the author's inbox upload. Without that, items A-F were unrunnable.

Also: the brief says to read src/ucl/README.md; the patch does not ship one.

All work was done on fresh copies (/tmp/nox-a patched, /tmp/nox-basebuild pristine). The patch file was never modified.

## Results per item

| Item | Result | Evidence |
| --- | --- | --- |
| A. apply + typecheck | **PASS** | `patch -p1 --dry-run` and real apply both exit 0; no .orig/.rej. `diff -rq` vs pristine = exactly 16 paths: 2 edited (src/tools/index.ts, tsconfig.json), 14 new (src/tools/ucl-search.ts, src/tests/ucl-bridge.test.ts, 12 files in src/ucl/). `tsc --noEmit` (TS 5.8.3): exactly 1 error, src/index.ts(432,50) TS2307 ./missions/career-01.js; byte-identical error on the pristine snapshot. |
| B. no weakened Nox behavior | **PASS_WITH_FINDINGS** | index.ts diff is only +import at line 18 and +`capability_library: capabilityLibraryTool` at line 986; adding a key grants nothing (see claim 1). Findings F1 (static node:sqlite load) and F6 (planner prompt exposure unverified). |
| C. bridge suite | **FAIL as shipped** | Direct run with UCL_TEST_DB set: 10/10. Under Nox's own `node scripts/run-offline-tests.mjs`: 5/10 (tests 6-10 fail, UNAVAILABLE) because the default /tmp/ucl-smoke.sqlite is never created. Full suite patched: 32 passed / 12 failed vs 32/11 baseline; the 12th is ucl-bridge. With the db pre-copied: 10/10 under the runner. |
| D. central safety claim | **PASS** | approved and execution_authority are literal false in every return path (ucl-search.ts:112-113, 125-126, 138-139, 171-172, 180-181). Probed with include_hazardous:true, bogus kinds/capabilities, hostile need text: never true; default call leaked 0 of 20 hazardous rows; bogus kind/capability -> status ERROR, not widened. |
| E. never writes Nox state | **PASS_WITH_FINDINGS** | Valid index: sha256 unchanged after 4 lookups; no -wal/-shm left behind. But pointed at a foreign SQLite file the tool created 28 tables in it (F2). |
| F. baseline 32/11 | **PASS (reading confirmed, with caveats)** | Reproduced exactly 32/11 once /tmp/opencode exists. Without it I got 26/17. See section F below. |

## Results per claim (1-6)

| Claim | Result | Evidence |
| --- | --- | --- |
| 1. assertToolAllowed is the authorization surface | **PARTIAL** | Confirmed: src/security/tool-context.ts:40-43 (allowedTools from AsyncLocalStorage); src/agents/mission-manager.ts:521-525 approvedToolGrants reads only specification.suggested_tools. NOT the only enforcement layer: specialists.ts:280-283 (immutable approved-spec binding), recursion.ts:488 (parent grants), head-agent.ts:118, mission-manager.ts:1812. All derive from suggested_tools; none is bypassable by the new tool. |
| 2. allTools is the only integration point | **PASS** | src/tools/index.ts:974-987. Consumers: mission-manager.ts:2214-2217, head-agent.ts:10/119, specialists.ts:152, analytics-mission.ts:168. |
| 3. advisory index feeding the acquisition loop | **FAIL (not realised)** | mission-manager.ts:2216 hard-codes the loop tool list to web_search, web_fetch, file_read, file_write, file_list, shell, save_artifact. `grep -rn capability_library src` outside the patch files finds only the registry key. The loop can never call it (F3). |
| 4. does not duplicate Nox qualification | **PARTIAL** | The tool does not import src/ucl/qualification.ts, but the patch ships a second Ed25519 receipt system inside Nox's src/ (compiled into dist). Dead code today; I did not read utils/qualification.ts beyond its QualificationHostPolicy shape (lines 66-137). |
| 5. what persists | **PASS** | @mastra/libsql 1.29.0 used only in src/memory/index.ts:1,15-16. UCL uses its own node:sqlite file; no shared file. I did not inspect utils/storage.ts. |
| 6. two tsconfig flags, zero source edits | **PASS** | src/ucl is byte-identical to ucl-src-copy/src (12/12 cmp). TS 5.8.3 and 5.7.3: clean. TS 5.6.3: `tsconfig.json(17,5) TS5023 Unknown compiler option rewriteRelativeImportExtensions`, so the 5.7 floor is real. Emitted .js: 0 relative .ts specifiers; emitted ucl/*.js load under plain node. Emitted .d.ts in 8 files still say './x.ts' (F8). |

## Findings

**F1 - MAJOR - the registry now loads node:sqlite statically.** src/tools/index.ts:18 imports ucl-search.ts, which imports ../ucl/db.js (ucl-search.ts:31), which imports node:sqlite (src/ucl/db.ts:1). Probe: importing only the registry loads node:sqlite (`process.moduleLoadList` contains sqlite) and prints an ExperimentalWarning, even with UCL_ENABLED unset. Every Nox process that imports allTools now needs a Node build with node:sqlite, and Nox declares no engines or Node floor (package.json, README.md and AGENTS.md have none). The 'flag off = host unaffected' claim is false at import time. Fix: lazy `await import('../ucl/db.js')` inside execute() after the flag check.

**F2 - MINOR - 'read-only at query time' is false for a non-UCL file.** src/ucl/db.ts:153-158 runs the DDL on every open; the `readOnly` option (db.ts:144) is declared and never used (`grep readOnly` finds only that line). ucl-search.ts:144 calls openStore without it. Probe: UCL_DB pointed at a foreign SQLite file -> status NOT_FOUND, file bytes changed, 28 UCL tables created inside it. A valid index stays byte-identical across lookups (checked by sha256; no -wal/-shm left). UCL_DB is host-set, not model-set, hence MINOR. Fix: open with `{ readOnly: true }` and skip the DDL for lookups.

**F3 - MAJOR - the tool is unreachable from the loop it claims to feed.** mission-manager.ts:2216 hard-codes the acquisition delegation tools to web_search, web_fetch, file_read, file_write, file_list, shell and save_artifact. `grep -rn capability_library src` outside the patch files finds only the registry key (index.ts:986). So claim 3 ('advisory index feeding that loop') is not realised: the tool is a registry entry only reachable if an owner puts capability_library into suggested_tools by hand. Nothing here is unsafe, but nothing is wired either.

**F4 - MAJOR - the shipped bridge suite fails under Nox's own runner.** src/tests/ucl-bridge.test.ts:9 defaults to /tmp/ucl-smoke.sqlite, which nothing creates. `node scripts/run-offline-tests.mjs` on the patched tree: 32 passed / 12 failed (baseline 32/11); ucl-bridge 5/10, tests 6-10 fail with UNAVAILABLE or ENOENT. With the db copied to that path: 10/10 under the runner. The author's 10/10 needs UCL_TEST_DB and a hand-built index. `npm test` now has a new red suite. Fix: have the test build its own index in a tmp dir from the catalog, or skip with a clear reason.

**F5 - MINOR - a second Ed25519 receipt system now lives in Nox's src/.** src/ucl/qualification.ts, submission.ts and nox-adapter.ts are compiled into dist but unused by the tool. They target the dead createDiscovery port and sit beside src/utils/qualification.ts (QualificationHostPolicy, lines 66-137). Not an active bypass, but dead authority-shaped code in the host. Ship only librarian, db, classify, canonical and types.

**F6 - NIT - planner exposure unverified.** head-agent.ts:144 lists REGISTERED CAPABILITIES from availableCapabilities(Object.keys(allTools)) (capability-plane.ts, not read). Adding the key likely makes the planner see capability_library as registered. I did not confirm this or its effect on capability decisions.

**F7 - MINOR - missing negative cases.** Tests do not cover: a non-UCL file as UCL_DB (F2); a granted mission with a different tool name spelled near-miss; limit bounds beyond the zod schema (max 20); invalid kinds/capabilities (I probed: status ERROR, not widened); include_hazardous being model-settable with no host gate (tool input, ucl-search.ts:86-90). Test 10 asserts only that hazard rows are reachable when asked.

**F8 - NIT - emitted .d.ts keep './x.ts' specifiers** in 8 files under dist/ucl (blueprints, classify, feature, importer, librarian, nox-adapter, qualification, submission). The emitted .js are clean (0 .ts specifiers) and load under plain node. Harmless today.

**F9 - NIT - id namespace.** The tool returns tool_id = canonical_id ('cap_...', ucl-search.ts:155), not 'tool_...'. These ids are not Nox grant names, which avoids confusion, but the field name suggests otherwise.

## Item F detail (baseline 32/11)

Reproduced exactly 32 passed / 11 failed on the pristine snapshot, but only after `mkdir /tmp/opencode`. Without it I got 26/17: six more suites fail on a hard-coded mkdtemp under /tmp/opencode (r0-closure-core, r1-csv-tool, r1-model-ledger, r1-p1-ledger-evaluation, r1-p1-lesson-comparison, r1-spec-binding). That hard-coded host path is a small Nox portability defect; the author's environment had the directory.

The 11 remaining failures:
- `command -v bwrap` and `command -v systemd-run`: both MISSING; /usr/bin/systemd-run absent.
- Confirmed environmental: r0-closure-process-lifecycle, r0-independent-contracts, r0-security-tools (spawn /usr/bin/systemd-run ENOENT), r1-resource-limits (access systemd-run ENOENT), r1-web-product and r1-web-qa (SANDBOX_UNAVAILABLE), r1-csv-analytics (open research/r1-kortix/ANALYTICS-CONTRACT.md ENOENT; research/ is excluded from the snapshot).
- Probable but NOT proven: r0-closure-adapters, r0-reqa-adapters, r1-parallel-artifacts ('Detached child has no usable PID') and r1-shell-isolation (null !== 0). They exercise the shell sandbox, so a missing sandbox binary fits, but I did not trace the code path. I found no failure that points to a Nox logic defect, and I cannot exclude one for these four. Tell the owner 'consistent with environment', not 'proven'.

## What I could NOT verify

- Anything newer than snapshot 68cc0ee2 (04:01 UTC); the snapshot is a dirty working tree, not a clean HEAD.
- src/missions/ is absent (the career-01 import), so any behaviour that depends on it.
- capability-plane.ts and head-agent availableCapabilities; utils/qualification.ts beyond its policy shape; utils/storage.ts persistence; mission lifecycle paths other than those cited.
- Behaviour under a real model: whether a planner ever asks for capability_library, or what it does with the candidates.
- The four 'probable' suites above; Windows/macOS; Node versions other than 22.23.1.

## Commands run (tails)

```
patch -p1 --dry-run < nox-r2-ucl-bridge.patch   -> exit 0 ; real apply -> exit 0
tsc --noEmit (5.8.3 and 5.7.3) -> src/index.ts(432,50): error TS2307 ./missions/career-01.js   (1 error, same on pristine)
tsc --noEmit (5.6.3) -> tsconfig.json(17,5): error TS5023 Unknown compiler option 'rewriteRelativeImportExtensions'
UCL_TEST_DB=/tmp/ucl-r2.sqlite tsx src/tests/ucl-bridge.test.ts -> # tests 10 # pass 10 # fail 0
node scripts/run-offline-tests.mjs (patched) -> Offline suites: 32 passed, 12 failed   (ucl-bridge: pass 5 / fail 5)
node scripts/run-offline-tests.mjs (pristine, /tmp/opencode present) -> Offline suites: 32 passed, 11 failed
node scripts/run-offline-tests.mjs (pristine, /tmp/opencode absent)  -> Offline suites: 26 passed, 17 failed
probe: foreign.sqlite -> status NOT_FOUND | bytes changed true | tables after 28
probe: default hazards leaked 0 of 20 | approved/execution_authority true anywhere: false
```


---

# RE-VERIFICATION of fixes (package ucl-nox-r2-final.tar.gz, sha256 cc6eec9a1de78377def2de9bbf6af2ca344a3afd803a2b5c0c2f1005f2b99ed2)

**Re-verification verdict: PASS_WITH_FINDINGS. F1, F2 and F7 are fixed. F4 is NOT fixed as claimed. F3 wiring patch is sound but changes a gate.**

Integrity: MANIFEST.sha256 12/12 OK (re-hashed with sha256sum -c); only MANIFEST.sha256 itself is unlisted. Main patch sha256 41b5c5d399ce28d8b5558646f0b12009f49efa76f7f070f2d94f115e5ea1d535 and wiring patch fb963e0122db3ebb038d397c2a3d2b48b39562160e38c9681f99d316f8b83dcf match the quoted values. Main patch applies to a fresh snapshot extraction (dry-run 0, apply 0, 16 files, no .orig/.rej, same 16 paths as before). tsc --noEmit: exactly the pre-existing career-01.js error. The shipped INDEPENDENT-QA-R2.md is byte-identical to the round-1 file.

| Item | Result | Evidence |
| --- | --- | --- |
| F1 static node:sqlite | **FIXED** | Clean import of allTools with UCL_ENABLED and UCL_DB unset: registered true, node:sqlite loaded false, no ExperimentalWarning printed. Emitted ucl-search.js loads db.js and librarian.js lazily inside execute (emit lines 142-143); ucl-search.ts:34 is import type only. |
| F2 DDL in foreign file | **FIXED (claim wording slightly wrong)** | Foreign file with a notes table: status ERROR, sha256 unchanged, tables = notes only, no sidecar files. Garbage file: ERROR file is not a database. A file that has ucl_meta but no schema_version row gives UCL_NOT_A_UCL_INDEX (db.ts:162). A typical foreign file without ucl_meta gives no such table: ucl_meta, not UCL_NOT_A_UCL_INDEX, so the claim of that code on anything else is inaccurate. Still refused, so cosmetic. |
| F4 suite red under runner | **NOT FIXED AS CLAIMED** | See F10. |
| F7 hazard gate | **FIXED** | include_hazardous true with UCL_ALLOW_HAZARDOUS unset, 0, 2 or empty: 0 hazard rows of 20. With 1, true, yes, on or  1 : 1 hazard row. Flag omitted: always 0. Gate is host-env only (ucl-search.ts:63-66, 163). |
| Failure set vs baseline | **IDENTICAL** | Fresh patched tree, /tmp/opencode present: 33 passed / 11 failed; diff of FAIL suite names against pristine baseline is empty. But the 33rd pass is the bridge suite with 10 tests skipped (F10). |
| F3 optional wiring patch | **PASS_WITH_NOTE** | Applies cleanly to a fresh snapshot with the main patch; tsc unchanged; capability-loop 23/23. I did not re-run the whole suite with it applied. See F11. |

**F10 - MAJOR - the bridge suite runs nothing on a fresh extraction.** On a fresh snapshot plus main patch, with env -u UCL_TEST_DB -u UCL_ENABLED -u UCL_DB, node scripts/run-offline-tests.mjs src/tests/ucl-bridge.test.ts gives # tests 10, # pass 0, # skipped 10, and the runner prints Offline suites: 1 passed, 0 failed. Cause: ucl-bridge.test.ts:15-34 looks for data/db/ucl.sqlite, ucl-delivery/data/..., /tmp/ucl-smoke.sqlite or a catalogue under data/source, and the patch ships no data/ and no catalogue. So VERIFICATION-OF-FIXES.md (lines 87-94, # skipped 0) and COMPATIBILITY-REPORT.md:126 (PASS 10/10, self-builds its index) are wrong for a fresh extraction with only the patch applied; README.md:74 and :90 (zero setup) likewise. The 10/10 is true only after copying data/source or data/db/ucl.sqlite into the Nox tree: I confirmed 10/10 with only data/source present (self-build, writes /tmp/ucl-bridge-selftest.sqlite) and with data/db present. The headline 33 passed / 11 failed therefore counts a suite that executed no assertions as a pass. Fix: skip should be reported as skipped by the runner, or the test must fail loudly when the index is missing, or the instructions must state the data copy as a required step.

**F12 - MINOR (new) - read-only open still touches the filesystem.** After a tool lookup against a copy of the index in a writable directory, idx-check.sqlite-shm (32768 B) and -wal (0 B) appeared next to the file; the main file is byte-identical. In a read-only directory with a 0444 index, the lookup returns ERROR attempt to write a readonly database and leaves no files. The index is built in WAL mode, so a read-only deployment needs either a writable directory or a journal_mode switch at build time. The claim that lookups do not write is true for the index file bytes, not for the directory.

**F11 - NOTE - wiring patch changes one gate.** mission-manager.ts:2216 after the patch includes capability_library in the acquisition tool list. Simulated gate for approved sets: [save_artifact, capability_library] was BLOCKED before and now PROCEEDS, because capability_library satisfies the tools.length > 1 guard. A mission approved with only those two tools would now start an acquisition delegation that has no network, file or shell tool. Not an authority escalation (capability_library is still gated by approvedToolGrants and assertToolAllowed), but it is a behaviour change the owner should know about, beyond adding an advisory lookup. Other tested sets are unchanged.

Still unfixed by choice, no change in my assessment: F5, F6, F8, F9.

Could not verify here: whole suite with the wiring patch applied; behaviour under a real model; anything newer than snapshot 68cc0ee2.

---

# Round 3 re-verification (ucl-nox-r2-round3.tar.gz, sha256 b15e891c1d17738268bafb229ecbd8fc45d484da5c9e55ebdbd258f14da18bfd)

**Round 3 verdict: PASS_WITH_FINDINGS.** All five claimed items verified true. F10 and F12 are fixed and I reproduced every stated state. Two NIT-level documentation residues remain (D1, D2 below). Nothing in the round-3 claims was wrong.

Integrity and setup:
- Package sha256 b15e891c... matches. MANIFEST.sha256: 12/12 OK by `sha256sum -c`; only MANIFEST.sha256 itself is unlisted. Main patch 878af216... and wiring patch fb963e01... match the quoted values.
- Snapshot rebuilt from nox-snap.zip (sha256 78ab1f3a...) on a fresh machine (my /tmp had been recycled since round 2, so I re-extracted rather than trust stale trees). Inner tarball 9b9702b5... matches its sidecar; 190/190 source files OK against SHA256SUMS. The one non-matching entry is the sidecar README.md preference: the checksum file lists Nox's project README.md (67e62936...) which matches, while the zip's own snapshot README is a separate file (899c5808...). Not a Nox file, not a patch input; no effect.
- Clean-room conditions honoured: UCL_TEST_DB, UCL_ENABLED, UCL_DB all unset via `env -u`; `/tmp` swept of ucl-*.sqlite before each run. Main patch applied in dry-run then real mode to three separate extractions: 16 files each, no .orig/.rej, same 16 paths as rounds 1-2.

| Claim | Result | Evidence |
| --- | --- | --- |
| F10 state 1: no data/ | **FIXED** | `# tests 11 / # pass 0 / # fail 1 / # skipped 10`; the guard test throws "bridge suite needs an index: copy delivery data/ into this tree"; runner prints `Offline suites: 0 passed, 1 failed`, exit 1. No ucl-*.sqlite left in /tmp. |
| F10 state 2: data/source only | **FIXED** | `# tests 10 / # pass 10 / # fail 0 / # skipped 0`, exit 0. Self-builds /tmp/ucl-bridge-selftest.sqlite (journal_mode=delete). |
| F10 state 3: data/db only | **FIXED** | `# tests 10 / # pass 10 / # fail 0 / # skipped 0`, exit 0. |
| F12 DELETE journal mode | **FIXED** | Shipped index `pragma journal_mode` = delete; 4466 capabilities / 4504 source rows. Lookup in a 0555 dir with a 0444 index: status OK, 3 candidates (microsoft/playwright-mcp), file sha256 identical, dir contains only i.sqlite. Lookup in a writable dir: same, and no -shm/-wal created. |
| Docs: no "zero setup"/"# skipped 0" without data | **FIXED** | `grep -rn -i 'zero setup|no setup needed|without setup|# skipped 0'` over *.md (excluding my QA file): none. README.md:58 "Quick check (data required)", :72 "the data copy is REQUIRED, the patch does not ship data/", :93 "after copying data/ (required step)", :76 "Without data/ the suite FAILS loudly". COMPATIBILITY-REPORT.md:126 same. VERIFICATION-OF-FIXES.md:99-106 tabulates the three states with the same numbers I measured. |
| Docs: F11 described | **FIXED** | VERIFICATION-OF-FIXES.md:137-145 states that `[save_artifact, capability_library]` now proceeds at mission-manager.ts:2216 where it was blocked, that the delegation has no network/file/shell tool, that it is a behaviour change the owner must accept knowingly, and that other sets are unchanged. README.md:118-119 and COMPATIBILITY-REPORT.md:143-153 describe the wiring as an opt-in one-line patch not applied by default. Wording matches my round-2 finding exactly. |
| Regression: manifest | **PASS** | 12/12. |
| Regression: tsc | **PASS** | Exactly 1 error, src/index.ts(432,50) TS2307 ./missions/career-01.js; nothing new. tsconfig and src/tools/index.ts diffs are still the two-flag / two-line changes. |
| Regression: suite + failure set | **PASS** | Patched tree with data: 33 passed / 11 failed, ucl-bridge 10/10 0 skipped. Pristine baseline rebuilt on the same machine: 32 passed / 11 failed. `diff` of the FAIL suite names: identical (the 11 named suites match exactly). |

Bonus, previously unverified:
- **Whole suite with the wiring patch applied: PASS.** 33 passed / 11 failed, FAIL set identical to baseline; `capability-loop` 23/23; tsc still 1 pre-existing error. This closes the one item I could not verify in round 2.

**Findings (both NIT, neither changes a verdict):**

- **D1 - NIT - one stale line in COMPATIBILITY-REPORT.md:211:** the step-5 command block ends `node scripts/run-offline-tests.mjs src/tests/ucl-bridge.test.ts   # 10/10, no env needed`. "no env needed" is true; the data copy is step 5 of the same block, so a careful reader gets it, and §8 (line 126) says "required" explicitly. But the inline comment does not repeat the requirement, which is the exact phrasing that misled in round 2. Suggest: `# 10/10, after step 5 (data copy)`.
- **D2 - NIT - README.md:95 still reads "Independent QA round 3 (F10, F12 fixes) | **not yet re-checked independently**".** True when written; this section is that re-check. Update to PASS_WITH_FINDINGS (only D1/D2 open) once this is folded in.

Everything else I previously found holds, re-checked on the round-3 tree rather than assumed. F1: importing allTools with UCL_ENABLED/UCL_DB unset gives registered true, node:sqlite loaded false, no ExperimentalWarning. F2: a foreign SQLite file is refused read-only with the file byte-identical and no tables added (bridge test 8 plus my own probe shape). F7: the suite's hazard test asserts both directions, and my round-2 value matrix still applies since the gate code is unchanged. The bridge suite does not assert F1 (that is inherently an import-time property, so I check it directly). F5/F6/F8/F9 unchanged and accepted as unfixed by choice.

Could not verify: behaviour under a real model (F6); anything newer than snapshot 68cc0ee2 (04:01 UTC); the four baseline suites I classified "probable-but-unproven environmental" in round 2 (unchanged this round).
