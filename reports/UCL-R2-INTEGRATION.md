# UCL integration into final Nox R2

**Base:** `bd3859a550a046c16454f44ddc2648c81318f14e`

**Workspace:** isolated Git worktree `r2-ucl-integration`

**Source archive:** `ucl-nox-r2-final.tar.gz`, SHA-256 `1a5c8638007dc64ee40595a195eb9401f824e60e9da88b72c1dce7d8888d2bd7`
**Status:** implementation and verification evidence; this is not R3 acceptance.

The integration checkpoint is local branch `r2/ucl-integration`, including
`79c4e51` for linked-worktree/browser recovery. The newer verified-experience
mechanism is separately reviewed and must not be inferred from this older UCL
probe. Current evidence paths and verdicts are recorded in
`R2-ENVIRONMENT-RECOVERY.md` and the R2 experience-transfer report.

## Provenance and safe intake

The owner supplied the original archive in the R2 root. Its whole-file digest
matches the expected value. Archive inspection found 18 entries: 14 regular
files and four directories; there are no links, absolute paths or parent
traversal members. Extraction used Python's `data` filter outside Nox. All
13/13 entries in `MANIFEST.sha256` matched. Cortex's main and optional patch
hashes also match the handoff. The original Cortex documentation is retained
under `reports/ucl-source/delivery/` for audit, not imported as executable Nox
code.

The archive was never executed as an installation program. The patch was
reviewed and its dry-run succeeded against final R2, unlike Cortex's older
`68cc0ee` test snapshot. `ucl.sqlite` has SHA-256
`ef2bee5e689d484b86c2dbff0138347cb5f6e1a5f9a4dcd45c58aef51e39e1be`,
4,466 unique entities, 4,504 source rows, DELETE journal mode and SQLite
`integrity_check = ok`. The source catalogue digest is
`5a83c501b290b83a17f6ffaeb0fe9cae772e26be7a6a4c5cbcb948908fc76b56`.

## Independent engineering decision

Integrate UCL as a small optional discovery dependency of Nox's existing
capability-acquisition loop. Do not create another orchestrator, registry,
permission system, memory store or qualification issuer.

Nox already owns approved specification bindings, `assertToolAllowed`,
planning, delegation, durable evidence, QA and memory. UCL supplies only local
metadata search. `capability_library` therefore:

- uses the existing tool registry and grant context;
- is disabled unless the host sets `UCL_ENABLED=1`;
- returns `UNVETTED` candidates with `approved:false` and
  `execution_authority:false`;
- performs no network, installation, execution, qualification or writes;
- opens only a recognized, catalogue-bound SQLite index read-only;
- fails without interrupting a mission when disabled, absent or invalid.

### Changes retained from Cortex

- Deterministic FTS5/BM25 search, tag filtering and bounded progressive output.
- Lazy SQLite loading after authorization and the feature-flag check.
- Host-only hazardous-record opt-in.
- Read-only database opening and hostile-input handling.
- The idea of exposing one advisory Mastra tool.

### Changes deliberately modified

- Only `canonical`, `classify`, `db`, `librarian` and `types` are in Nox.
- Ordinary `.js` import specifiers replace `.ts` specifiers, so global
  TypeScript extension flags are unnecessary.
- Database writes, DDL and import transactions are removed from the runtime.
  Freshness verifies the delivered source digest, source/entity counts and
  schema. It also authenticates the complete SQLite bytes against the delivered
  index SHA-256, so count-preserving content or trust-state edits fail closed.
  The runtime is intentionally bound to this immutable snapshot; catalogue
  refresh requires an explicit reviewed data/code update, not an agent import.
- `candidate_id` replaces the misleading `tool_id` field (F9).
- Internal lookup failures return a generic error class rather than echoing
  host filesystem paths or database details.
- F11's one-line patch is not used. The acquisition task does consult UCL
  first when granted, but `capability_library` and `save_artifact` are excluded
  from the count of investigation tools. Thus
  `[save_artifact, capability_library]` remains blocked (F11 corrected).

### Rejected/deferred Cortex components

- `nox-adapter`, `feature`, `submission` and `qualification`: a second,
  authority-shaped control plane and an adapter for a removed runtime (F5).
- `cli` and `importer`: unnecessary write-capable production surface. Updating
  the curated snapshot is an operator/data process, not an agent capability.
- `blueprints`: it depends on that second qualification system and its schema
  is not connected to Nox's durable experience/QA model. No evidence yet
  justifies a parallel blueprint store. This is deferred, not rejected forever.
- Broad planner changes: the existing acquisition delegation is the more
  bounded and useful path. Merely listing a tool in a Head prompt is not proof
  of effective discovery (F6).

## Tests and remaining evidence

Bridge tests cover registration without eager SQLite loading, no-context and
near-grant denial, flag-off behavior, missing index, real candidates, empty
abstention, immutable lookup, hostile text, foreign/corrupt/stale stores,
failure/restoration, hazardous host gating and explicit no-authority outputs.
Acquisition tests prove the corrected F11 gate and grant-filtered wiring.
The real-model probe is isolated in `scripts/ucl-live-probe.ts`; its output is
under `reports/ucl-live-*` and must be read from actual recorded tool/model
results rather than assumed from suite completion.

Final live evidence is `reports/ucl-live-1794753593557/result.json`: all eight
probe checks passed. The researcher `deepseek-v4-flash` actually invoked
`capability_library` (recorded in mission `tools_used`), and independent QA
`claude-opus-5-5` confirmed all three research criteria. Exactly one hash-bound
observation was linked to the bounded attempt. The mission itself correctly
ended `failed` with terminal `missing`: no shell was granted, no renderer was
verified, `acquired` was omitted, and no candidate was installed or executed.
Only `capability_library`, `file_list` and `save_artifact` were used; the saved
probe script and raw query JSON are local research artifacts, not execution.
The delivered index SHA-256 remained unchanged.

Earlier live directories retain setup failures and obsolete checker failures;
they are not relabeled or counted as passing. This probe proves bounded
read-only discovery and honest failure handling, not successful candidate
reuse, blueprint transfer, portable professional competency or R3 readiness.

The original same-worktree regression comparison is retained in
`reports/ucl-regression-comparison.json`: 39/44 suites passed versus the 38/43
clean-worktree baseline, with the new UCL bridge passing and no new failure.
Its five environmental failures were subsequently repaired at `79c4e51` and
covered by focused tests; use the newer full regression summary rather than
this historical count for current readiness. The original report is not
rewritten to relabel those runs as passes.

## Disable and rollback

- Immediate disable: set `UCL_ENABLED=0` (default). No SQLite module is loaded
  by the registry, and an explicitly granted call returns `DISABLED`.
- Remove availability: revoke `capability_library` from future approved
  specifications; existing immutable approvals remain unchanged.
- Full source rollback: discard this integration worktree and use base commit
  `bd3859a550a046c16454f44ddc2648c81318f14e`. Nox memory and mission storage
  are not migrated, so no database rollback is required.

The source R2 root and its existing working-tree changes were not modified.
No push, service restart, production deployment or new external authority was
performed.
