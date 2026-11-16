# Acquisition report — observation-digest-v1

Mission: `r2-acquisition-b6d1cc35-021b-413b-bcea-3e0608f218bd`
Status: **available** (acquired local procedure, bytes hash-bound)
Scope: only the mission artifact workspace. No packages, no network, no web tools, no publishing/deployment/purchases, no host configuration changes.

## 1. Discovery (local options consulted first)

| Candidate | Finding | Verdict |
| --- | --- | --- |
| Registered capability `observation-digest-v1` | Not in registered capability list (task premise) | missing |
| `capability_library` registry / any candidate pool | Searched filesystem for `*capability_library*`, `*capability-library*`, `*observation-digest*`, `*observation_digest*` (maxdepth 6, excluding /proc): **no matches**; no such tool is exposed to this role | unavailable on this host |
| Existing CLI digest tool in PATH | `ls /usr/bin | grep -iE 'digest|observ'` → nothing relevant | absent |
| `jq` | Not installed | absent (and installing is out of scope) |
| `/usr/bin/node` v22.23.3 | Present, mature, already used by host tooling; stdlib `fs`/`path` suffice for JSON read + exact integer arithmetic + file write | **selected runtime** |
| `/usr/bin/python3` 3.14.4 | Present; used only as an **independent** verification path, not as the procedure | cross-check |

Because no vetted reusable candidate existed locally and network discovery was prohibited, one procedure was authored from scratch. It depends on **only** the pre-existing runtime, so nothing new is trusted into the host: `require()` calls are exclusively `fs` and `path` (verified by grep over the file).

## 2. Acquired procedure

- Path (canonical, absolute): `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794798592835/state/artifacts/r2-acquisition-b6d1cc35-021b-413b-bcea-3e0608f218bd/bin/observation-digest-v1.js`
- SHA-256 of exact executable bytes: `8fd9b2dbe037130b7ab995d0146d1cf8db66ea7595d2b5644a298fb8c43b282b`
- Mode `0755`, `node --check` clean, shebang `#!/usr/bin/env node`
- Fixed invocation shape (exactly 2 positional args, no placeholders):
  `node observation-digest-v1.js <input.json> <output_dir>` → writes `<output_dir>/digest.json` and `<output_dir>/digest.md`

Behaviour:
1. Parses JSON; requires `observations` to be a non-empty array of objects with non-empty string `site`.
2. Requires `scheduled`, `completed`, `incidents` to be non-negative safe integers; rejects `completed > scheduled` (both per row and per site).
3. `row_count` = array length; totals are exact **BigInt** integer sums over all rows.
4. Groups by trimmed `site`, sorted by name, each with own `row_count` and sums.
5. `completion_percent` = `completed*100/scheduled` rounded **half-up to 2 dp** with pure integer arithmetic: `round_half_up(completed*100*scale / scheduled)/scale`, `scale=100` — no binary floats in the output path. Also emits `completion_percent_string` for exact decimal text.
6. Asserts per-site sums equal global sums; any self-check failure → exit 2, no files written.
7. `digest.md` carries the identical values in tables plus the numbered reproducible method and the self-check list.

## 3. Feasibility evidence (probe run)

Command actually run during acquisition, with the exact fixed args (output into `probe/`, not into the mission's final deliverable paths):

```
/usr/bin/node .../bin/observation-digest-v1.js .../input/pilot.observations.json .../probe
stdout: observation-digest-v1 OK rows=3 scheduled=30 completed=26 incidents=6 completion_percent=86.67 sites=2
```

Probe artifacts (real, persisted):
- `probe/digest.json` — sha256 `7c53348b7cb5d219041016fa2ee9c17daaa797b332c7b09005ca0bf6fe25719c`
- `probe/digest.md` — sha256 `514cab0078666040ab9a46236fcf700f1bf765fa22717ebc68c758a3bee285a2`

Input fixture `input/pilot.observations.json` — sha256 `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`.

## 4. Independent verification (not model say-so, not documentation)

- **Independent arithmetic**: a separate Python 3 `Decimal(..., ROUND_HALF_UP)` implementation, written independently of the JS, recomputed from the raw input and compared field by field: `row_count`, `scheduled`, `completed`, `incidents`, `completion_percent_string`, `completion_percent`, and every per-site `{scheduled, completed, incidents, row_count}` → **all true**. Hand check: 12+8+10=30; 11+8+7=26; 2+1+3=6; 26/30*100 = 86.666… → 86.67; North 22/18/5 over 2 rows, South 8/8/1 over 1 row.
- **Determinism**: a second run into `probe2/` produced byte-identical `digest.json` and `digest.md` (`cmp` clean, same hashes). No timestamps or nondeterministic ordering in output.
- **Fail-closed robustness**: four negative cases (empty observations, `completed > scheduled`, non-integer `scheduled`, invalid JSON) and one bad-args case all exited non-zero (2) and **created no output directory**.
- **Byte stability**: executable hash re-read after all runs is unchanged (`8fd9b2db…282b`), so the hash recorded in the durable invocation receipt will bind the same bytes.

## 5. Security and scope posture

- No package installs, no network access, no web_search/web_fetch, no publishing/deployment/purchases.
- Writes strictly under the given `<output_dir>` argument; no reads outside the supplied input file; no shell-outs, no `child_process`, no `eval`.
- Only `/usr/bin/node` + stdlib are trusted; the discovered/absent alternatives were not adopted as trusted.

## 6. Honest limits (for the Head's replan)

- This file is an **acquisition observation, not a qualification result**. The proposed target was **not** executed as the proposed target and the mission's `digest.json`/`digest.md` deliverable paths were deliberately left untouched; all output lives in `probe/` and `probe2/`.
- Qualification (host verification of the bytes/hash, Nox QA), the durable invocation receipt, and the final `digest.json`/`digest.md` in the canonical output location remain for the replanned phase.
- `capability_library` was not reachable from this role; if a registry exists at host level, the Head should register this procedure there rather than re-authoring it.
- The probe `args` include `.../probe` as the output directory. If the Head prefers the canonical deliverable location, the final argument should be the intended output directory (e.g. the mission root) while `executable_path` and `executable_sha256` remain exactly as recorded.
