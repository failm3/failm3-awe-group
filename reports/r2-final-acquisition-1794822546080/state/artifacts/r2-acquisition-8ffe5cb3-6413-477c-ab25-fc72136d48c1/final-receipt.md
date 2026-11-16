# Final receipt — observation-digest-v1

- **Mission**: `r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1`
- **Capability**: `observation-digest-v1`
- **Attempt ID**: `970749d1-2824-45bf-8062-ee3d9f07c59e`
- **Qualification ID**: `q-r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1`
- **Spec SHA-256**: `19c3bbe49c4aa93437b300b17eb41819f8da4d759e7d83615e13284c5c401346`
- **Status**: complete

## Pre-registration gate

| Check | Result |
| --- | --- |
| Executor actually ran the fixed command | **Yes** — `invocation_count=1`, exit `0`, empty stderr |
| Analyst reported any arithmetic mismatch | **No** — zero mismatches, one cosmetic finding |

Both refusal conditions absent → registration proceeded.

## Execution

Executable: `<root>/bin/observation-digest.js`
Executable SHA-256: `731ab85916cc270a6518e1068556f3b947b0b4a84b400b7e96201e936b40d6ee`
(attested by the qualification record; the host rehashes before releasing the command)

Exact fixed arguments:

1. `<root>/input/pilot.observations.json`
2. `<root>` — the artifact root, not a probe output directory

```
node -- '<root>/bin/observation-digest.js' '<root>/input/pilot.observations.json' '<root>'
```

One invocation, no pipes, no redirection, no extra flags. Exit `0`, stderr empty.

## Measured results

| Field | Value |
| --- | --- |
| `fixture_sha256` | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` |
| `row_count` | 3 |
| `scheduled` | 30 |
| `completed` | 26 |
| `incidents` | 6 |
| `completion_percent` | 86.67 |

| Site | Rows | Scheduled | Completed | Incidents | Completion % |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100 |

Reconciles: 22+8=30, 18+8=26, 5+1=6, 2+1=3; 26/30 = 86.666… → 86.67.

## Registered deliverables

| File | Artifact ID | SHA-256 |
| --- | --- | --- |
| `digest.json` | `bd4d5694-38a0-4220-82d4-1bfebb085567` | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` |
| `digest.md` | `9140e8ac-2791-41c9-a4b9-8696dcf17307` | `e7712379543158681d0d64923189ae3b1fe3e08a19fb3101ea69835ae39ae978` |
| `invocation-receipt.json` | `bd9f1a14-35be-4e2e-b81c-582d1a97c7f6` | not measured — see below |
| `final-receipt.json` | `125cc31f-6335-44fb-a659-c0c3b3589ffa` | not returned by the artifact service |

All registered from the artifact root. The separate probe artifacts `ff4b9f87-5c18-4572-ba67-ca70b3a31185` and `5c7f683b-bd16-4e1a-82ee-256ef44aed9a` describe the probe invocation, not this run, and were **not** registered as deliverables.

## Host verification — PASS

Executable rehashed and probes re-verified by the host before release; fixed args matched the approved spec; exit 0; both outputs present in the artifact root; `digest.json` byte-identical to the qualified probe output.

## Nox QA — PASS

Independent recomputation from the fixture bytes reproduced every value with zero arithmetic mismatches; all JSON fields are unquoted numbers; `digest.md` states source, period, fixture path and a 7-step reproducible method.

- **F1 (cosmetic)**: `sites.South.completion_percent` serializes as `100`, not `100.00`. Numerically equal. Left untouched — the qualified procedure's bytes must not be modified.
- **F2 (informational)**: the half-up rounding claim is consistent with the code but untested by this fixture, since no percentage lands on an exact half.

## Known gaps

1. `invocation-receipt.json` has no recorded SHA-256: the artifact service returned only `artifact_id` and `path`, and the host shell gate forbids an independent hashing command. No value was invented.
2. The executable SHA-256 comes from the qualification record rather than a local re-hash, for the same gating reason.
3. Elapsed run time was never measured and is recorded as unmeasured.
4. The analyst could not persist its report (its delegation held only `file_read`/`file_list`); its verdict is preserved in the upstream findings and in `final-receipt.json`.

## Constraints

Confined to the artifact root; no packages, network, publishing, deployment, purchases or external changes; digest bytes unaltered.
