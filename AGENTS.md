# AWE GROUP RESEARCH SNAPSHOT — REVIEWER INSTRUCTIONS

This directory is an AS-IS research and evidence snapshot, not an active R2/R3 development workspace.

- Start with `PROJECT-INDEX.md` and `AWE-RESEARCH-REPOSITORY-ASSEMBLY-REPORT.md`.
- R2 remains **REJECT / NOT CONFIRMED**; R3 remains stopped. Do not silently change historical verdicts or evidence.
- Do not run paid/live missions, external actions, deployments, or new experiments as part of source review.
- Never execute `scripts/r2-final-transfer/verifier.ts`, its repeat verifier, or generated mission artifacts on the host. The independent audit identifies unsafe generated-code execution.
- Permitted local checks are documented in `PROJECT-INDEX.md`; use isolated dependencies and offline fixtures.
- `research/external/` contains pinned historical supplementary sources, not the current R2 implementation.
- Public-copy redactions and exclusions are recorded in `SAFE-COPY-TRANSFORMATIONS.json` and `RELEASE-PROVENANCE.json`; primary originals remain in the private backup.
- Keep provider credentials, private chat logs, browser captures, working databases, and personal data out of commits.
