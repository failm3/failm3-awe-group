# Filesystem boundary disposition

The independent report `r1-p0-fs-review.md` remains preserved. Its reproductions
are valid when an unrestricted actor on the host can rename a workspace ancestor
across grants. A file descriptor pins the inode; it does not enforce that the
host directory's name stays under the grant. Host-side `readlink`/`realpath`
checks after the mutation would only narrow, not eliminate, that race.

For the supported tool attacker, the concrete boundary is the mission's mounted
filesystem tree. The outside destination directory is not mounted and the
bubblewrapped executable has no host mount permissions or writable host parent.
`r1-shell-isolation.test.ts` therefore additionally exercises an actual confined
process with an open directory: it cannot rename that directory to a sibling
outside the mounted tree and existing bytes remain intact.

This deliberately narrows the confidentiality/write guarantee to:

- trusted host preparation owns the grant root and does not concurrently move
  its directories across host grants;
- untrusted executable work sees only the allowlisted mounted objects; and
- direct host tools reject preexisting symlinks/hardlinks and retain descriptors,
  bounded IO, ownership and cancellation checks.

It is **not** a guarantee against an already privileged host process that can
mutate AWE's directory parents. No claim is made that such an actor can be
constrained by pathname policy in the same account.

The reviewer also identified unbounded `readdirSync` enumeration. Listing now
uses incremental `opendir`/`readSync` with global visited/output limits and
cancellation between entries, instead of first allocating all entries.

The shell bind-source replacement window noted by the reviewer is a separate,
existing host-preparation concern. It is not counted as cleared by the direct
file-operation tests. Aggregate persistent disk quota is also not implemented;
resource evidence covers per-file size, RAM/swap, tasks, CPU, descriptors and
wall deadline only.
