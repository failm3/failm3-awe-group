# Independent verification — observation-digest-v1

Mission: `r2-acquisition-557fb9e0-941e-4346-8414-dec675500604`
Verdict: **PASS** (37/37 comparisons matched, 0 failures)

I read `input/pilot.observations.json` directly and recomputed every figure with my
own throwaway Python script (`verify/recompute.py`) using `decimal.Decimal` with
`ROUND_HALF_UP`, cross-checked against an integer formula I derived separately.
I did not use the procedure's stdout, and I did not use any probe output as input.

## Recomputed totals (independent)

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

26/30*100 = 86.666… → **86.67** (half-up, 2 decimals).

## Recomputed per-site breakdown

| site | rows | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |

North = rows (12/11/2) + (10/7/3) = 22/18/5; 18/22*100 = 81.818… → 81.82.
South = 8/8*100 = 100 → rendered 100.00. Site sums roll up to the totals exactly.

## Comparison with the delivered digests

- `digest.json`: all five scalars and every per-site field are numerically equal to
  the recomputation; `completion_percent` is a JSON **number** whose literal carries
  exactly two decimals (`86.67`, `81.82`, `100.00` — no `100` or `100.0` forms);
  `sites` is an object keyed by `North`/`South` with `rows/scheduled/completed/
  incidents/completion_percent`.
- `digest.md`: every Totals cell and every per-site cell is character-identical to
  the corresponding `digest.json` value and to my recomputation.
- `digest.md` documents a reproducible method: 5 numbered steps giving the row-list
  definition, the integer sums, the exact half-up 2-decimal rule, the per-site
  grouping/sorting, and a `Reproduce: node -- observation-digest-v1.js <input.json>
  <output-dir>` line.

Acceptance item 3: **pass** on all nine sub-items (3a–3i).

## Hashes

| file | bytes | sha256 |
| --- | --- | --- |
| `digest.json` | 470 | `4cf59af0838a32749ba9dbd951494bafa30544d0f7c36b0324d58f5714948f81` |
| `digest.md` | 1301 | `ee224a465f2568a7dcf0f4231047233cafd1b07cc20949cb14a18f5f483dc1ef` |
| `input/pilot.observations.json` | 474 | `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766` |
| `procedures/observation-digest-v1.js` | 9417 | `49cba19507c1d4e3d80ba85afdaaf75c580e442fd2939029e999a9b2479ee2e3` |
| `invocation-receipt.json` | 4055 | `4095eda633765ad3fc456164c885569382758e008b7a9d19d005234bc3805f4b` |

The executable hash equals the qualified value recorded in `observation.json`,
so the bytes run were the qualified bytes. `digest.json` also hashes identically
to `probe/out/digest.json` and `probe-digest.json`, i.e. the final run at the fixed
output directory reproduced the probe result byte-for-byte.

## Rounding boundary

| completed/scheduled | exact | half-up | half-even (banker's) | result |
| --- | --- | --- | --- | --- |
| 1/32 | 3.125 | **3.13** | 3.12 | passes, and distinguishes the two rules |
| 5/32 | 15.625 | **15.63** | 15.62 | passes, distinguishes |
| 1/800 | 0.125 | **0.13** | 0.12 | passes, distinguishes |
| 3/32 | 9.375 | 9.38 | 9.38 | agrees both ways |
| 1/8 | 12.5 | 12.50 | 12.50 | two decimals retained |
| 1/3 | 33.333… | 33.33 | 33.33 | rounds, not truncates |
| 2/3 | 66.666… | 66.67 | 66.67 | rounds up |
| 0/0 | — | 0.00 | 0.00 | no division by zero |
| 7/7 | 100 | 100.00 | 100.00 | two decimals retained |

The three tie cases separate half-up from banker's rounding, and the procedure
lands on half-up every time — matching my independent integer derivation.

## Write scope and determinism

Ran the qualified procedure with a fresh output directory outside the mission root,
from an empty working directory: exit 0, empty stderr, nothing written to the
working directory, exactly `digest.json` + `digest.md` in the output directory, no
new or changed files anywhere in the mission root, and both files byte-identical to
the delivered ones. Static audit: the only writes are `fs.mkdirSync` /
`fs.writeFileSync` beneath the resolved output-dir argument; no `child_process`, no
network modules, no writes to the input or script directory; the validation-failure
path exits 2 before writing.

## Risks carried forward, verbatim

- A model-authored observation is not qualification
- Visible examples do not replace independent arithmetic verification

## Limits

This is an independent recomputation and comparison, not Nox QA and not the host
gate's own byte verification. No deliverable was modified; no numbers were adjusted
to fit the digests.
