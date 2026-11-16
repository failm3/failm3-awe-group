# AWE R1 authenticated release

**Status: PASS DOCUMENTARY / EVIDENCE HANDOFF.** This release combines the original final research package with authenticated source provenance and the independent authenticated re-review. It is suitable for a bounded engineering design/evidence handoff only. It is not patch-ready, implementation GO, compatibility PASS, production PASS, or permission to execute AWE changes.

The independent review covers the immutable candidate manifest SHA256 `523d9e79302b4eaeffd6b2cc5793dfa528cc065049714d0b857fbd4decb20e96` with 148 entries. It verified 27 authenticated source blobs, 68 unchanged baseline files, 11 prior review hashes, and two direct authenticated samples. The review is included at `authenticated/independent-review/INDEPENDENT-AUTHENTICATED-REVIEW.md`; its machine verification is `authenticated/independent-review/VERIFICATION.json` and its reviewed hash list is `authenticated/independent-review/REVIEWED-HASHES.json`.

This release ZIP has its own hash and is not covered by the reviewer’s candidate verdict except for the embedded files whose hashes are listed above. Historical Node/E0/E1 runtime evidence is not the current Mastra R0. Observer telemetry is not a frozen source release. Current R0 source identity, locks, environment, restore, isolation, provider compatibility, and application tests remain unknown or not run.

No GitHub/AWE writes, deployments, installations, live provider calls, or paid tests were performed.
