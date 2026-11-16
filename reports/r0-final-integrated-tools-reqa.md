# R0 final integrated tools re-QA

**Date:** 2026-11-13  
**Verdict (frozen offline scope): PASS**  
**Production readiness: NOT ESTABLISHED.**

## Scope and method

This was an independent re-QA of the frozen source snapshot, with no production-code, existing-test, package-script, README, Git-history, deployment, or real `.awe-data` edits. All probes and fresh state were under `.r0-work/final-integrated-reqa-20261113/tools/` (apart from the deliberately external temporary directory used to adjudicate one test fixture).

Provider credentials were unset for the runs, `AWE_OFFLINE_TEST=1` was used, and no live provider, browser, MCP server, PostgreSQL, external HTTP service, paid test, deployment, or publication was exercised. MCP/browser/DNS/HTTP transports in the original adapter probe are explicitly **protocol doubles**, not live-service evidence. The shell probe used real `bwrap` child processes and real process groups.

## Decisive original probes

Each probe was run from the isolated audit working directory with `node --import node_modules/tsx/dist/loader.mjs --test ...`; the exact command and output are in the corresponding log/command file.

| Probe | Result | Evidence |
|---|---:|---|
| `original-tool-security.test.ts` | **7/7 passed, exit 0** | Deny-by-default, unknown/cross-mission grants, registered-only specialist ceilings, absolute/traversal/symlink fencing, stale-owner and durable-marker write prevention, artifact name fencing, abort/fence behavior. `logs/original-tool-security-rerun.log` |
| `original-shell-lifecycle.test.ts` | **7/7 passed, exit 0** | Normal/nonzero/policy-denied commands; mandatory `--unshare-pid --die-with-parent`; timeout; resistant-group abort/SIGKILL escalation; detached descendant containment; SIGKILL orphan recovery; no late writes. `logs/original-shell-lifecycle.log` |
| `original-adapters.test.ts` | **8/8 passed, exit 0** | MCP cold abort accounting/retry, shared browser discovery cancellation, in-flight browser abort, DNS cancellation, late HTTP response suppression, SSRF/private/reserved/redirect denial, pinned redirect credential stripping, search primary/fallback cancellation. `logs/original-adapters.log` |
| `original-interfaces.test.ts` | **5/5 passed, exit 0** | CLI pending/explicit approval/resume, no hidden execution for no-approve/contradictory/recovery commands, API auth and redaction, lease conflict, strict resume/recovery/cancel, loopback binding and exact-origin CORS. `logs/original-interfaces.log` |

**Original probe total: 27/27 passing tests.**

The shell probe recorded real bwrap launches and checked their arguments; it did not treat a mocked shell as containment evidence. Its resistant and detached descendants were cleaned up, and the post-run process check found no remaining test child (the only matches were the cleanup command itself).

## Focused existing suites

These are independent executions, not assertions based on historical reports.

| Suite | Exact result | Log |
|---|---:|---|
| `r0-closure-adapters.test.ts` | **23/23 tests passed, exit 0** | `logs/focused-closure-adapters.log` (independent absolute-path rerun: `logs/focused-r0-closure-adapters.log`, also 23/23) |
| `r0-final-tools.test.ts` | **12/12 tests passed, exit 0** | `logs/focused-final-tools.log` |
| `r0-closure-interfaces.test.ts` | **93 checks passed, exit 0** | `logs/focused-closure-interfaces.log` |
| `r0-security-tools.test.ts` | **5/5 tests passed, exit 0** with external `TMPDIR` | `logs/focused-security-tools-external.log` |
| `r0-final-recursion.test.ts` | **8/8 tests passed, exit 0** | `logs/focused-final-recursion.log` |
| `r0-final-production-intent.test.ts` | **4/4 tests passed, exit 0** | `logs/focused-production-intent.log` |
| `r0-closure-core.test.ts` | **13/13 tests passed, exit 0** | `logs/focused-r0-closure-core.log` |
| `r0-closure-process-lifecycle.test.ts` | **9/9 tests passed, exit 0** | `logs/focused-process-lifecycle.log`; independent rerun `logs/focused-r0-closure-process-lifecycle.log`, also 9/9 |
| `r0-runtime-storage-lease.test.ts` | **53 checks passed; TAP 1/1, exit 0** | `logs/focused-r0-runtime-storage-lease.log` |

### Earlier security-test failure adjudication

The first isolated run of `r0-security-tools.test.ts` recorded **4/5 passing**, with `workspace path rejects traversal and symlink escape` failing (`Missing expected exception`). The audit `TMPDIR` was inside the workspace, so the test's supposed outside symlink target was not actually outside the workspace; this was a fixture/environment error, not evidence of a containment bypass. Re-running with a genuinely external disposable `TMPDIR` produced **5/5 passing**. No source or test file was changed to obtain that result.

Two initial harness attempts used nonexistent loader paths and were discarded as command-harness errors; the retained `*-invalid-loader-path.log` and `*-missing-loader-helper.log` files document them. They are not product test failures and were followed by successful executions using the repository's actual `tsx` loader.

## Integrity and cleanup

- `logs/source-hashes-before.txt` and `logs/source-hashes-after.txt`: **123/123 source/script hashes unchanged**.
- `logs/manifest-hashes-before.txt` and `logs/manifest-hashes-after.txt`: **3/3 manifest/config hashes unchanged**.
- `logs/hash-comparison.txt`: unchanged source and manifests.
- `logs/git-status-after.txt` records the pre-existing dirty worktree; no claim of a clean Git tree is made, and no Git mutation was performed.
- Fresh state roots were used for each probe/suite. Real child process groups were terminated/reaped; no orphan test process remained.

## Explicit limitations

This PASS is limited to the tested offline adapters, local process containment, cancellation, filesystem/artifact guards, and API/CLI governance. It does **not** establish live browser/MCP teardown, live provider or external API behavior, hostile untrusted-code sandboxing beyond these probes, Windows computer-use, PostgreSQL behavior, deployment safety, or production readiness. Those require separately authorized live/integration validation.
