# Invocation receipt — observation-digest-v1

- **Mission**: `r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1`
- **Capability**: `observation-digest-v1`
- **Attempt ID**: `970749d1-2824-45bf-8062-ee3d9f07c59e`
- **Qualification ID**: `q-r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1`
- **Spec SHA-256**: `19c3bbe49c4aa93437b300b17eb41819f8da4d759e7d83615e13284c5c401346`
- **Invocations**: exactly 1
- **Run date (UTC)**: 2026-02-07

## Command (verbatim, unmodified)

```
node -- '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/bin/observation-digest.js' '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1/input/pilot.observations.json' '/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794822546080/state/artifacts/r2-acquisition-8ffe5cb3-6413-477c-ab25-fc72136d48c1'
```

No pipes, no redirection, no extra flags, no pre-run hash/list check.

## Executable

| Field | Value |
| --- | --- |
| Path | `<root>/bin/observation-digest.js` |
| SHA-256 | `731ab85916cc270a6518e1068556f3b947b0b4a84b400b7e96201e936b40d6ee` |
| SHA-256 provenance | qualification record (`observation.json` → `local_target.executable_sha256`); the host rehashes the executable and re-verifies its probes immediately before release of the fixed command |
| Not re-hashed by executor | the shell is host-gated to the single fixed command, which refuses any additional command |

## Fixed args (match approved spec exactly)

1. `<root>/input/pilot.observations.json`
2. `<root>` — the artifact root, **not** a probe output directory

## Result

- **Exit code**: `0`
- **Stderr**: empty (0 bytes)
- **Stdout**: captured verbatim in `run-stdout.json` (artifact `c29b5722-a022-4507-a1cb-fcbbcfc87960`)
- **Elapsed time**: not separately measured — the host-gated shell returns only stdout/stderr/exit_code for the fixed command, and wrapping it to time it would have modified the command. No value is fabricated.

Procedure-reported values:

| Field | Value |
| --- | --- |
| `fixture_sha256` | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` |
| `row_count` | 3 |
| `scheduled` | 30 |
| `completed` | 26 |
| `incidents` | 6 |
| `completion_percent` | 86.67 |

## Outputs (confirmed in artifact root by `file_list`)

| File | SHA-256 (reported by procedure) |
| --- | --- |
| `digest.json` | `95777cc31d82109e062a63d556530296ddb81de1746a1db55024b5f7894e1a80` |
| `digest.md` | `e7712379543158681d0d64923189ae3b1fe3e08a19fb3101ea69835ae39ae978` |

`digest.json` is byte-identical to the qualified probe output (`95777cc3…`). `digest.md` differs from the probe copy (`ff539722…`) only because its reproducible-method section embeds the output-directory argument, which is now the artifact root rather than `probe/out`; every metric value is identical.

## Gate events

A follow-up `sha256sum`/`stat` inspection was attempted and **refused by the host gate**. Reported verbatim, not worked around:

> QualificationDeniedError: Qualification denied: qualified target requires the exact fixed node command; in this delegation the shell accepts only node -- '<root>/bin/observation-digest.js' '<root>/input/pilot.observations.json' '<root>' and the host already rehashes the executable before release, so run that command alone

(<root> abbreviated in this quotation only; the full string is stored verbatim in `invocation-receipt.json` → `gate_events[0].verbatim_refusal`.)

## Arithmetic spot-check (hand, from fixture rows)

North/Harbor 12/11/2, South/Harbor 8/8/1, North/Ridge 10/7/3 → scheduled 12+8+10=30, completed 11+8+7=26, incidents 2+1+3=6, 26/30 = 86.666… → **86.67**; North 18/22 = 81.818… → 81.82; South 8/8 = 100.00. Consistent with the emitted digest.

Independent automated verification in this delegation: **not performed** — the gate permits only the fixed node command. The acquisition-stage Python/Decimal cross-check recorded in `observation.json` is not re-asserted as new evidence here.
