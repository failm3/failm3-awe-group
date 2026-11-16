# R2 environment recovery checkpoint

Date: 2026-11-16

## Starting state

The UCL integration remained at `974da8692d7b2c290ac1f84c804d249b1c408513`, now
protected by local branch `r2/ucl-integration`. Canonical R2 remains unchanged.
The previous 39/44 comparison had five environmental failures, not UCL bridge
failures.

## Verified changes

- `shellSandboxArgs()` distinguishes a linked-worktree `.git` file from a
  control directory. It overlays the file with read-only `/dev/null`; directory
  masking remains `--tmpfs`. A new negative test proves the target control
  directory is absent, the file is empty/read-only inside the sandbox, and host
  bytes remain unchanged.
- Restored the untracked project-local Chromium 1148/1254 payload and existing
  shared libraries from the canonical project's isolated cache. No download,
  package installation or change to the canonical runtime was made.
- Chromium executable SHA-256 values match their sources:
  - 1148: `bb209cb7fab190b8ad04cc1057e0bf9aeb3df3096d5069b9b0ce64ff4a6c3a3c`
  - 1254: `76bcde21a2f8c9d4fbbf42afbeab011817d000552d093e5f5e89c9b8808f4231`

## Current test evidence

- `npm run typecheck`: PASS.
- `/tmp/opencode/r2-linked-git-fix/summary.json`: 3/3 suites, 32/32 tests:
  closure adapters 23, request/adapters 3, shell isolation 6.
- `/tmp/opencode/r2-browser-restored/summary.json`: 2/2 suites, 27/27 tests:
  web product 26 and host web QA 1.
- The real production shell generated a 1280x720 PNG inside its granted
  workspace while `.oc-isolated` control state and other project files remained
  hidden and the browser cache remained read-only.
- The missing-browser control still returns `BLOCKED`, not PASS.

## Restart recovery

An infrastructure restart interrupted the first focused test invocation. On
return, the local branch ref and worktree index were empty and two files held
partial stale content. The committed object remained readable. Only these two
working files were restored from `974da86` before reapplying the intended edits;
Git metadata was rebuilt by writing the known branch SHA and `git read-tree`.
Pre-recovery bytes and both indexes are preserved in
`/tmp/opencode/r2-restart-preservation/`. No historical artifacts were deleted.

This checkpoint fixes the five known environmental suite failures. It is not a
substitute for a complete post-change regression or the six broad R2 criteria.
