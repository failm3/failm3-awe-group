# R1 filesystem independent review

**Verdict: FAIL the finite grant-containment acceptance. One P0 containment defect has two reproduced effect windows.** The new tests pass but do not exercise either window. No new cancellation/owner regression was found in the tested write boundaries.

Reviewed `src/security/workspace-fs.ts`, its `src/tools/index.ts` integration, and `src/tests/r1-workspace-fs.test.ts`. All attack fixtures contained synthetic bytes in disposable directories inside this repository; no secrets or personal files were inspected. Only this report is retained; no commit was made.

## P0 — an opened directory can move outside the grant and still receive writes

**Locations:** `src/security/workspace-fs.ts:13–29,55–75`; integration at `src/tools/index.ts:383–394`.

`O_NOFOLLOW` prevents following a replacement symlink, but an open directory descriptor pins an inode, not its ancestry. Renaming that inode outside the grant changes where subsequent descriptor-relative effects happen. Synchronous Node execution does not exclude another process from performing that rename. The mission lock does not serialize arbitrary filesystem mutation.

**Prerequisite:** a concurrent actor can rename the traversed directory across the grant boundary (write permission on source/destination parents, on the same filesystem). This review does not claim that a shell already confined to an immutable grant mount can itself perform that cross-boundary rename. The implementation, however, does not enforce such immutability for these host-side file operations.

Two deterministic syscall-boundary schedules were reproduced first against the helper, then against the actual exported `fileWriteTool`, with a genuine `workspaceRoot` grant, `assertSafePath`, mission lock, and an always-valid owner fence:

### A. Initial mkdir leaves an unauthorized side effect even when the call fails

1. Set up `work/nested`, a sibling synthetic `host`, and grant only `work`.
2. Request `work/nested/newdir/output`.
3. Immediately after `openSync` successfully opens `nested`, rename `work/nested` to `host/moved` and put a symlink to `host` at the old pathname.
4. Traversal uses its already-open descriptor to execute `mkdirSync(.../newdir)` in `host/moved` (lines 19–22).
5. The eventual parent check at line 60 rejects the moved directory, but `host/moved/newdir` already exists.

Actual tool result:

```json
{"phase":"mkdir","swapped":true,"result":{"success":false,"error":"Error: Access denied: path is outside the mission workspace"},"outsideDirectoryCreated":true}
```

This is not a report-only false positive: the directory creation happened in the real filesystem and remained present after rejection.

### B. Rename after the last check allows successful replacement outside the grant

1. Set up `work/nested/output` with synthetic `original` bytes.
2. Let traversal, line 60's parent check, target `lstat`, and temporary-file open complete normally.
3. Immediately before line 69's descriptor write, rename `work/nested` to `host/moved` and install a symlink at the old pathname.
4. The temporary file and target now live outside the grant. `writeFileSync`, `renameSync`, and `fsyncSync` continue through the pinned descriptor.
5. The tool returns success; `host/moved/output` contains `escaped` instead of `original`.

Actual tool result, with the disposable absolute pathname abbreviated:

```json
{"phase":"commit","swapped":true,"result":{"success":true,"path":"<fixture>/commit/work/nested/output"},"outsideDirectoryCreated":false,"outsideBytes":"escaped"}
```

The overwritten file is the file in the directory moved out of the grant. This does **not** demonstrate overwriting an unrelated preexisting file through the replacement symlink: descriptor pinning correctly prevents that particular redirection.

### Reproduction method and repair acceptance

The probes wrapped the real built-in syscall methods, used `syncBuiltinESMExports()` so the imported helper saw the wrapper, performed real `renameSync`/`symlinkSync` operations at the selected boundary, and then called the original syscall. No permission check or filesystem result was stubbed. This deterministically schedules an interleaving another process can produce; it is not a probabilistic stress-test result.

The core schedules are:

```js
// Schedule A: wrapper around fs.openSync.
const fd = originalOpen(p, ...args);
if (!swapped && p.startsWith('/proc/self/fd/') && p.endsWith('/nested')) {
  swapped = true;
  fs.renameSync(nested, moved);
  fs.symlinkSync(host, nested);
}
return fd;

// Schedule B: wrapper around fs.writeFileSync.
if (!swapped && typeof p === 'number') {
  swapped = true;
  fs.renameSync(nested, moved);
  fs.symlinkSync(host, nested);
}
return originalWrite(p, ...args);
```

Add regression tests at both boundaries using actual tool context. Assert **no out-of-grant directories or bytes**, not just `success:false`. Exercise a parent-only rename as well as rename-plus-symlink replacement; the symlink is not necessary for this defect.

A further realpath check before mutation only narrows the race. Closing this acceptance requires an enforced namespace/ancestry invariant against concurrent renames, or equivalent isolation with a clearly defined inode-based grant that is actually the accepted security contract. In particular, do not describe `O_NOFOLLOW` plus a proc-fd path as proving continuing lexical containment.

## Other finite-acceptance results

| Requirement | Evidence / result |
| --- | --- |
| Ancestor symlink before traversal | New test passes; component `O_NOFOLLOW` rejects it. |
| Final symlink/hardlink already present | New tests reject reads/writes; original synthetic host bytes remain unchanged. |
| Final link swapped after target `lstat` | Additional deterministic probes for both symlink and hardlink pass host-integrity checks. Atomic rename replaces the directory entry, not the linked host inode. A raced-in hardlink is replaced rather than literally refused; distinguish refusal semantics from host-overwrite safety. |
| Read/write byte limit | Additional probes confirm 2,000,001-byte reads and writes are rejected; rejected oversized write creates no target. Existing test also checks a custom 4-byte read limit. |
| Special-file read | Directory rejection passes. FIFO/device-specific cases are not covered by the new test; `O_NONBLOCK` and regular-file validation are present. |
| List cancellation | Existing entry-time cancellation test passes; extra probe aborting at the second active callback also rejects. |
| Write owner/cancellation/seal regression | All three existing `D1:` tests pass, including fence loss under lock, no directories/bytes on refusal, normal opt-in artifact behavior, and abort/seal before raw creation. |

### Bounded listing is not fully established (not a separate demonstrated P0)

`workspace-fs.ts:89` calls `readdirSync(..., {withFileTypes:true})`, materializing **all** entries before applying the 2,000-visited / 200-output limits at line 91. A single large directory therefore has unbounded enumeration/allocation relative to those caps, and cancellation cannot run during that synchronous enumeration. The shared visited counter also does not globally unwind recursion once exhausted. Use bounded incremental directory reads and propagate the exhausted budget; test a directory larger than the visit limit with an instrumented count of entries actually consumed. No service-exhaustion attack was run, and this is not promoted to a second P0 without impact evidence.

## Why the new race test is insufficient

`r1-workspace-fs.test.ts:26–31` performs its swap in the **first** `check(file)` call, before any directory descriptor is opened. It proves refusal of an already-present ancestor symlink, not safety after directory opening or after the final ancestry check. Static final symlinks and hardlinks are useful coverage, but do not test a final-component swap. The second test checks one small read cap and initial cancellation, not bounded directory I/O or write size limits.

## Existing shell sandbox source-path race — confirmation only

`src/security/shell-sandbox.ts:23–24,36,45–46` resolves source paths and emits string `--ro-bind`/`--bind` arguments. `src/tools/index.ts:265–282` later spawns bubblewrap, which resolves those source paths again. These are not pinned descriptors: replacement between validation and bind-source resolution is a remaining source-path race. The recursive mask scan also precedes those mounts. This is existing code, not introduced by the workspace-fs integration; classify it as confirmation of the existing sandbox finding, **not a new regression or additional independently reproduced P0 here**. No bubblewrap escape was attempted in this review.

## Checks executed

```text
node --import tsx --test src/tests/r1-workspace-fs.test.ts
  PASS: 2 tests

env AWE_OFFLINE_TEST=1 ROUTER_CHEAP_API_KEY=offline-test-only \
  OPENAI_API_KEY=offline-test-only TAVILY_API_KEY= \
  node --import tsx --test --test-name-pattern='D1:' src/tests/r0-final-tools.test.ts
  PASS: 3 tests

Disposable inline helper and actual-tool probes:
  REPRODUCED: mkdir outside grant before rejection
  REPRODUCED: successful replacement after pinned parent moves outside grant
  PASS: final symlink and hardlink swaps preserve synthetic host bytes
  PASS: default read/write byte limits and between-entry list cancellation
```

No source/test edits were made. All disposable fixture directories were removed.
