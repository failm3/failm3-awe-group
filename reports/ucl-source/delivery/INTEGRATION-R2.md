# Integration instructions — Capability Library into Nox R2

Everything here is reversible, off by default, and touches Nox in exactly four
places. Read §1 before doing anything.

**Scope of validity:** the R2 snapshot at HEAD `68cc0ee2`, captured
2026-11-15T04:01:39Z. Not a promise about later revisions — see
`COMPATIBILITY-REPORT.md` §7 to re-check.

---

## 1. What this changes in Nox

| File | Change | Lines |
| --- | --- | --- |
| `src/tools/index.ts` | one import, one entry in `allTools` | +2 |
| `tsconfig.json` | `allowImportingTsExtensions`, `rewriteRelativeImportExtensions` | +2 |
| `src/tools/ucl-search.ts` | new: the `capability_library` tool | new file |
| `src/ucl/` | new: the library, unmodified apart from location | 12 files |
| `src/tests/ucl-bridge.test.ts` | new: contract + negative suite | new file |

Nothing else. No change to Mission Manager, Head, Prompt Master, the tool context,
qualification, storage, `.env`, mission state, checkpoints or grants.

**It grants nothing.** `capability_library` is gated by the same
`assertToolAllowed()` as every other tool, so only a mission whose approved
specification lists `capability_library` can call it — and only after the owner
approved that specification. Adding it to the registry does not approve it for
anyone.

---

## 2. Prerequisites

- Node ≥ 22.18 (for `node:sqlite` + FTS5). Nox pins no `engines` field; verify on
  your host's actual Node, because `node:sqlite` is still Stability 1.2 (RC).
- TypeScript ≥ 5.7 (Nox pins 5.8.3 — fine).
- `npm ci` will need to run; the library adds **no** runtime dependencies.

---

## 3. Install

```bash
# Never against the live tree. Copy first:
cp -a /home/nox/awe-group-cleanroom-20261112 /tmp/nox-integration-check
cd /tmp/nox-integration-check

patch -p1 --dry-run < nox-r2-ucl-bridge.patch   # review first
patch -p1          < nox-r2-ucl-bridge.patch

npm ci
npx tsc --noEmit        # only the pre-existing ./missions/career-01.js error
```

Build the index. Two options — the first needs no data at all, the second rebuilds
from source. Neither runs a model or touches the network.

```bash
# Option A (recommended): use the pre-built index shipped with this package
mkdir -p data/db && cp /path/to/delivery/data/db/ucl.sqlite data/db/ucl.sqlite

# Option B: rebuild it yourself from the catalogue
mkdir -p data/db
node src/ucl/cli.ts import \
  --db data/db/ucl.sqlite \
  --catalog /path/to/delivery/data/source/all-records-classified.json \
  --expect-sha 5a83c501b290b83a17f6ffaeb0fe9cae772e26be7a6a4c5cbcb948908fc76b56
```

Option B prints `IMPORTED` with `4504` rows and `4466` unique entities, and
`REPLAY` on a second run. The `--catalog` flag is required: Nox's tree has no
`data/source/`, and the importer's default path assumes it does.

Run the bridge suite:

```bash
node scripts/run-offline-tests.mjs src/tests/ucl-bridge.test.ts
```

Expected: 10 passing, with no environment variables and no pre-built index —
the suite resolves the shipped index or builds one from the shipped catalogue.

---

## 4. Feature flag

Off by default. Two variables, both read per call:

| Variable | Default | Meaning |
| --- | --- | --- |
| `UCL_ENABLED` | `0` | `1`/`true`/`yes`/`on` enables the tool |
| `UCL_DB` | `data/db/ucl.sqlite` | path to the index; also checked at `data/ucl.sqlite` |
| `UCL_ALLOW_HAZARDOUS` | `0` | host opt-in: without it, a model's `include_hazardous` is ignored |

With the flag off, the tool answers `status: "DISABLED"` and Nox behaves exactly as
before. The index module is imported lazily **after** the flag check, so a disabled
library never loads `node:sqlite` — verified by importing the whole registry with
the flag unset and checking that no sqlite module appears in `process.moduleLoadList`. With the flag on but no index, it answers `status: "UNAVAILABLE"`. **Neither
throws**, so an optional index can never break a mission.

To grant it to missions, list it in the approved specification's `suggested_tools`:

```json
"suggested_tools": ["web_search", "file_read", "capability_library", "save_artifact"]
```

That is the owner's approval surface, unchanged. There is no second grant path.

---

## 5. Rollback

```bash
cd /tmp/nox-integration-check
patch -R -p1 -E < nox-r2-ucl-bridge.patch
rmdir src/ucl 2>/dev/null; rm -f data/db/ucl.sqlite
```

Verified: applying then reverting the patch returns the tree **byte-identical** to
the snapshot (`diff -rq` empty). Or simply unset `UCL_ENABLED` — the tool then
reports `DISABLED` and nothing else changes, which is the faster rollback if a
mission is running.

---

## 6. Staged rollout

**Stage 0 — zero risk.** Install with `UCL_ENABLED` unset. Confirm `npm test`
shows the same FAIL set as before the patch (see the compatibility report §6). No
behaviour change is possible in this stage.

**Stage 1 — shadow.** Set `UCL_ENABLED=1`, leave `suggested_tools` alone. No
mission can call the tool yet, because no mission has the grant. This only proves
the index loads.

**Stage 2 — one mission.** Approve one non-critical mission whose specification
lists `capability_library`. Check in the mission log that the tool is called only
inside that mission and that its output is quoted as *unvetted candidates*, never
as an approved tool.

**Stage 3 — broader.** Add the grant to more specifications if Stage 2 read well.

Stop and roll back if any mission shows a tool grant that was not in its approved
specification, or if any candidate from the library is executed without a separate
Nox qualification.

---

## 7. What to expect in mission behaviour

The library does not change the acquisition loop. It gives the Head better
information when diagnosing a gap: instead of only `acquire` with a free-text
capability name, the plan can cite a named candidate with provenance.

What it will **not** do: install anything, widen a grant, skip qualification, or
make a candidate executable. A candidate at `status: "OK"` is still `UNVETTED`.
The path from "the catalogue knows this exists" to "Nox may run it" is unchanged
and remains entirely Nox's: qualification, PEP review, scoped grant, admission.

---

## 8. Known limitations

1. **The tool is in the acquisition probe only if you apply the opt-in patch.**
   The default patch leaves `mission-manager.ts:2216` untouched: the library is
   consulted while *planning*, not inside the probe. To wire it in:

   ```bash
   patch -p1 < optional-acquisition-wiring.patch   # one line, adds capability_library
   ```

   Verified with it applied: `capability-loop` passes 23/23, `tsc` clean, and the
   whole suite stays at 33/11. It is separate because it changes Nox behaviour,
   which is your decision, not a packaging detail.
2. **Hazardous rows need a host opt-in.** `UCL_ALLOW_HAZARDOUS=1` is required for
   a model's `include_hazardous` to have any effect; otherwise the request is
   ignored. A model cannot unlock security-review material by itself.
3. **The tool refuses a foreign database.** `UCL_DB` pointing at a non-UCL SQLite
   file yields `ERROR` with `UCL_NOT_A_UCL_INDEX`; no tables are created in it and
   its bytes are unchanged.
4. **`capability_library` must be in the approved specification** to be callable.
   Prompt Master's example list does not include it, so a fresh mission will not
   have it unless the owner adds it. That is intended.
5. **Index staleness.** The index is a snapshot of the catalogue at import time.
   Re-run the importer to refresh; it is idempotent.
6. **Node version.** Verified on 22.23.1. Re-verify on the host's Node before
   production.
