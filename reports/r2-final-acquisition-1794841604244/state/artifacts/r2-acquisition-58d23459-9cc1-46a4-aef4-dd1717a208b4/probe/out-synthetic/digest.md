# Observation Digest - probe synthetic (2026-W00)

## Method

Produced by the local procedure `observation-digest-v1` (Node.js built-ins only).

- Input fixture: `/home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/probe/synthetic.observations.json`
- Input SHA-256: `1632591f429a3bd122890ca571967f647b6bc35b41dc2694b3056439eea86005`
- row_count: number of entries in the `observations` array.
- scheduled, completed, incidents: plain integer sums over all entries.
- completion_percent: `100 * completed / scheduled`, rounded half-up to 2 decimals; `0` when scheduled is `0`.
- Site totals: the same four sums plus row_count, grouped by the exact `site` string, sorted by site name.
- Reproduce exactly: `node /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/probe/probe-copy.js /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/probe/synthetic.observations.json /home/nox/.local/share/opencode/worktree/f08b0d/r2-final-autonomy/reports/r2-final-acquisition-1794841604244/state/artifacts/r2-acquisition-58d23459-9cc1-46a4-aef4-dd1717a208b4/probe/out-synthetic`

## Overall totals

| metric | value |
| --- | --- |
| row_count | 3 |
| scheduled | 10 |
| completed | 8 |
| incidents | 3 |
| completion_percent | 80.00 |

## Site totals

| site | row_count | scheduled | completed | incidents | completion_percent |
| --- | --- | --- | --- | --- | --- |
| Alpha | 2 | 10 | 8 | 1 | 80.00 |
| Zeta | 1 | 0 | 0 | 2 | 0.00 |
| **TOTAL** | 3 | 10 | 8 | 3 | 80.00 |

Row sums reconcile with the TOTAL row above; the TOTAL row is the sum of the site rows.
