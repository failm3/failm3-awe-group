# Observation Digest - Lumen Harbor field pilot (2026-W45)

## Method

Produced by the local procedure `observation-digest-v1` (Node.js built-ins only).

- Input fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/input/pilot.observations.json`
- Input SHA-256: `412c65c3e20f2154045686615f37a5f905a88598a3c2c08149db51fda8523766`
- row_count: number of entries in the `observations` array.
- scheduled, completed, incidents: plain integer sums over all entries.
- completion_percent: `100 * completed / scheduled`, rounded half-up to 2 decimals; `0` when scheduled is `0`.
- Site totals: the same four sums plus row_count, grouped by the exact `site` string, sorted by site name.
- Reproduce exactly: `node /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/probe/probe-copy.js /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/input/pilot.observations.json /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/probe/out-real2`

## Overall totals

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 30 |
| completed | 26 |
| incidents | 6 |
| completion_percent | 86.67 |

## Site totals

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| North | 2 | 22 | 18 | 5 | 81.82 |
| South | 1 | 8 | 8 | 1 | 100.00 |
| **TOTAL** | 3 | 30 | 26 | 6 | 86.67 |

Row sums reconcile with the TOTAL row above; the TOTAL row is the sum of the site rows.
