# R1 resource isolation: per-execution Linux limits

## Result

Implemented `src/security/resource-limits.ts` and `src/tests/r1-resource-limits.test.ts`. **13/13 real-child checks passed**, without provider calls, installation/configuration changes, stress tests, or access to secrets/product state. At original component handoff no commit was made and the task did not edit `tools/index.ts` or `shell-sandbox.ts`.

Parent continuation disposition: the component is now integrated with the
gated shell launch. Construction failures clean durable launch records;
normalized fractional wall limits cannot fail after durable prepare. Final
whole-project typecheck/build and **39/39** offline suites pass, including
resource limits **13/13** and shell isolation **4/4**. See
`R1-P0-ACCEPTANCE.md` for the retained final evidence. The typecheck issue and
parent wiring statements later in this component report are historical
handoff context, not current blockers.

This is an executable resource-isolation component, not a blanket coding denial: a real Node process generated a JSON coding artifact under the sandbox and limits.

## Read-only host investigation

Observed during this task:

- Linux UID 1000; the session itself belongs to `/non-systemd`.
- `/sys/fs/cgroup/cgroup.controllers`: `cpuset cpu io memory hugetlb pids rdma`.
- Root cgroup is not writable to this UID.
- `systemctl --user show --property=ControlGroup`: `/user.slice/user-1000.slice/user@1000.service`.
- That user-manager subtree is delegated `cpu memory pids`; `cgroup.subtree_control` also contains those controllers.
- Existing tools: `/usr/bin/systemd-run`, `/usr/bin/systemctl`, `/usr/bin/prlimit`, `/usr/bin/python3`, `/usr/bin/bwrap`, `/usr/bin/unshare`. No C compiler was found/installed.
- systemd `259.5-0ubuntu3.4`; bubblewrap `0.11.1`.
- `prlimit` showed initially unbounded CPU, file size and address space; `RLIMIT_NPROC` would apply to the shared host UID and is deliberately **not used**.

Runtime experiments created only automatically collected transient user scopes for our own short-lived children. They did not change host/user-manager configuration, install packages, or alter any preexisting unit. `systemd-run --scope` execs its command with the same PID and detached PGID; this was measured and then asserted in the suite. A first harmless property probe rejected unsupported `MemoryOOMGroup=yes`; supported `OOMPolicy=kill` was then verified to set the actual kernel `memory.oom.group=1`.

## Enforcement and limits

One fresh UUID-named systemd user scope is created per execution. It contains the preflight verifier, bubblewrap, shell and all descendants:

| Boundary | Default | Mechanism |
|---|---:|---|
| Aggregate memory | 1 GiB | cgroup v2 `memory.max` |
| Aggregate swap | 0 | `memory.swap.max` |
| OOM behavior | whole scope killed | `memory.oom.group=1` via `OOMPolicy=kill` |
| Aggregate processes + threads | 64 | `pids.max` / `TasksMax` |
| Aggregate CPU bandwidth | one CPU | `cpu.max` / `CPUQuota=100%` |
| Per-process CPU consumption | 30 seconds | inherited hard/soft `RLIMIT_CPU` |
| Per-file maximum size | 64 MiB | inherited hard/soft `RLIMIT_FSIZE` |
| Per-process descriptors | 256 | inherited hard/soft `RLIMIT_NOFILE` |
| Core / locked memory | 0 | hard/soft `RLIMIT_CORE`, `RLIMIT_MEMLOCK` |
| Elapsed time | 30 seconds | manager `RuntimeMaxSec`, then 500 ms stop grace and SIGKILL |

The trusted Python verifier runs in isolated interpreter mode before bubblewrap or the release gate. It reads **its actual cgroup membership and kernel controller values**, checks the unique unit identity, bounded memory/swap/tasks/CPU bandwidth, and whole-group OOM behavior. Missing manager/controller or a bound exceeding policy rejects execution; no unbounded fallback exists. `prlimit` must successfully set both hard and soft limits before exec. CPU bandwidth plus the independent wall deadline bounds execution-wide CPU consumption even when the per-process CPU clock is reset by new children.

`inspectResourceIsolation()` is an optional read-only diagnostic; launch safety does not depend on trusting a cached positive diagnostic.

### Exact parent integration

Keep the existing bubblewrap argument list (PID namespace, die-with-parent, filesystem isolation, private proc/dev, dropped capabilities, and stdin release gate). Wrap it instead of spawning `bwrap` directly:

```ts
import { resourceLimitedSandbox } from "../security/resource-limits.js";

// Normalize the finite tool timeout for the integer resource-launch policy.
// Construction is also wrapped by durable-launch cleanup after prepare().
const wallMs = Math.max(100, Math.min(Math.ceil(Number.isFinite(timeout_ms) ? timeout_ms : 30_000), 120_000));
const launch = resourceLimitedSandbox(existingBwrapArgs, childEnv, { wallMs });
const child = spawn(launch.executable, launch.args, {
  cwd: workdir,
  detached: true,
  env: launch.env,
  stdio: ["pipe", "pipe", "pipe"],
});
```

Construct/validate `launch` before durable prepare when practical, or clean up any prepared record if constructing it throws. The original process-registry attach/release, pipe ownership gate, abort handling, process-group quiescence and output limits remain necessary. Keep the current parent timeout as an additional cancellation path. Systemd's independent wall deadline is also enforced if the parent stops processing timers.

Exact executable nesting:

```text
/usr/bin/systemd-run --user --scope --quiet --collect
  --expand-environment=no --unit=awe-exec-<uuid>.scope
  --property=MemoryMax=<bytes> --property=MemorySwapMax=0
  --property=OOMPolicy=kill --property=TasksMax=<count>
  --property=CPUQuota=<percent>% --property=RuntimeMaxSec=<ms>ms
  --property=TimeoutStopSec=500ms --property=SendSIGKILL=yes --
  /usr/bin/python3 -I -c <trusted verifier> <policy JSON>
  /usr/bin/prlimit --cpu=N:N --fsize=N:N --nofile=N:N
  --core=0:0 --memlock=0:0 --
  /usr/bin/env -i <allowlisted child environment>
  /usr/bin/bwrap <existing trusted sandbox arguments>
```

Use the returned **host-only** environment for spawn: fixed `PATH=/usr/bin:/bin`, `LANG=C.UTF-8`, `XDG_RUNTIME_DIR=/run/user/<uid>`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/<uid>/bus`. Never pass those manager-access variables through to the sandbox. The wrapper removes them and all other unapproved variables with `env -i` before bubblewrap. It also excludes `NODE_OPTIONS`, Python injection variables, dynamic-loader hooks, and credentials. Child allowlist: PATH, HOME, TMPDIR, TMP, TEMP, LANG, LC_ALL, TERM, NODE_ENV, CI, AWE_DATA_DIR. The last is merely an existing path string; its state must remain masked by the filesystem sandbox.

The wrapper requires a **trusted bwrap profile**: no host `/sys` controller mounts or `/run` manager sockets, isolated `/proc`, PID containment and capability dropping. It is not an arbitrary-command resource API. Otherwise a same-UID child could access the user manager/controller interfaces and undo its own scope controls. The current fresh-filesystem sandbox meets these specific prerequisites; changes granting host control sockets must preserve this boundary.

## Verification evidence

Command: `./node_modules/.bin/tsx src/tests/r1-resource-limits.test.ts`

Final run: TAP `tests 13`, `pass 13`, `fail 0`, `skipped 0`; approximately 4.12 seconds.

1. Real read-only delegated-controller discovery.
2. Positive Node coding artifact generation; canary credential/loader/manager environment excluded.
3. Original detached PID/PGID retained; actual `memory.max=67108864`, `memory.swap.max=0`, `pids.max=8`, `cpu.max=100000 100000` inspected; EOF on unreleased gate denies filesystem effects.
4. A single bounded 96 MiB allocation cannot escape a 64 MiB scope cap.
5. Aggregate 24 MiB parent plus 48 MiB `setsid` child allocation cannot escape that cap; whole-group OOM prevents the canary effect.
6. At most twelve fork attempts, only a few concurrent children: kernel `EAGAIN` proves per-scope tasks rejection; cleanup explicitly kills and waits for fixture children.
7. Two-KiB attempted write against one-KiB hard file limit: `EFBIG`, file exactly 1024 bytes.
8. At most forty open attempts against 32 descriptors: `EMFILE`; attempted hard-limit increase rejected.
9. Real worker receives one-second hard CPU limit and is killed.
10. Sleeping child stopped by the systemd deadline without parent cancellation; delayed effect absent.
11. Both manager bus/runtime endpoints pointed to nonexistent fixture locations: launch fails with no command effects. Setting only the bus address was insufficient on this system because systemd uses its private runtime endpoint; the corrected test exercises genuine manager absence.
12. MemoryMax deliberately omitted from a real transient scope: kernel-file verifier exits 125 before command effects. This is an actual unsupported-policy negative, not a mocked capability check.
13. Invalid host policy rejected before launch.

Targeted compile passed:

```text
./node_modules/.bin/tsc --noEmit --target es2022 --module nodenext \
  --moduleResolution nodenext --skipLibCheck \
  src/security/resource-limits.ts src/tests/r1-resource-limits.test.ts
```

At the time of this task, `npm run typecheck` reported an unrelated concurrently edited `src/capabilities/web-product.ts:189` receipt `verifier_version` literal-type error. No error was reported for the two resource files. Parent should rerun whole-project typecheck after integration/concurrent changes settle.

## Honest scope limits

- `RLIMIT_FSIZE` bounds **each file**, not total file count or aggregate persistent disk usage. This does not close the independent aggregate filesystem-growth finding; a quota-backed writable workspace or separately bounded storage layer is still needed for that claim. Cgroup memory does account private tmpfs memory, but cannot stand in for a disk quota.
- Descriptor and CPU-time rlimits are per process; scope tasks/bandwidth/deadline supply execution-wide bounds. No RSS polling or shared-UID process limit is claimed as hard isolation.
- Kernel memory controllers can have small accounting/reclaim transients; this is the kernel's hard cgroup OOM containment, not a promise of mathematically zero overshoot.
- Tests prove this host's working systemd/cgroup path. Hosts without the required existing delegation fail closed and need operator-provisioned support; this task made no such system changes.
- This component alone does not establish full T2 acceptance, filesystem race closure, manager cancellation integration, or production admission. The parent must run the existing process-lifecycle/shell integration checks after wiring it into the launch path.
