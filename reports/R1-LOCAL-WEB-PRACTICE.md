# R1 local agent-built web practice

## Procurement and execution boundary

Local engineering practice only. No deployment, external publication, package
purchase, model qualification or broad WCAG/security certification was
authorized or performed. The approved tool set is `file_write`, `file_read`,
`file_list`, and `save_artifact`; permitted specialist roles are `coder` and
`executor`. Shell, browser and network capabilities were not granted to the
product-building agents. Browser verification is a trusted host activity.

The finite verifier contract and its behavioral checks were not weakened or
replaced. Provider dollar cost is **UNKNOWN** for every attempt. A verifier
receipt is hash-binding evidence, not issuer authentication or qualification.

## Attempt 1 — retained FAIL

- Run: `r1-local-web-1794613269671-46a6b8dd/`
- Mission: `r1-web-fca8d1ca-5530-4737-b27d-af18c15f5989`
- Original P0 checkpoint: `d682c897882c78a4c55b0a17c1401f0c4e83d821`
- Final mission status: **paused**, timed out after 600000 ms; checkpoint
  `elapsed_ms=600104`, with no in-flight delegations and two completed repairs.
- Admitted executed path: Head `claude-opus-5-5` -> coder `claude-fable-5-2`
  (194110 ms) -> independent host/browser and model QA -> executor repair 1
  (23:45:27.377Z–23:49:07.986Z in the model ledger) -> fresh QA ->
  executor repair 2 (23:49:33.632Z–23:50:56.990Z)
  -> final QA interrupted at the deadline.
- Actual specialist tools were limited to the four approved file/artifact
  operations. No shell, externally visible, deployment or publication action
  was authorized or observed.
- The persisted candidate contains real task tracker logic and four source
  files (HTML, CSS, JavaScript and SVG). Its independent browser checks for
  loading, accessible empty state, blank rejection, add/keyboard input,
  filtering/toggle, persistence, deletion, reverse toggle and responsive layout
  passed. This is not a product PASS: `index.html` retained `<link rel="icon"
  href="data:,">`, which Chromium's snapshot CSP blocked. The independent
  receipt therefore records **FAIL**, a browser console issue and
  `BEHAVIOR: dom-url-contract`, on tree
  `f339e1604779762fff6f2f11023c75f10f329d282756d2f86447b28f8aa6a6a1`.
- Candidate files and their SHA-256 values are recorded in the independent
  receipt. That receipt is outside `product/`. Extra root-level duplicate files
  also caused incomplete QA evidence during the run; no historical bytes were
  removed to conceal this.
- Two separately generated QA receipts are not byte-identical: their
  syntax-command argv retains different ephemeral sandbox paths, so their
  receipt hashes differ. Their product file/tree hashes, verdicts, checks and
  command results agree. `persisted-byte-audit.json` records this expected
  difference rather than conflating receipt identity with product identity.
- Seven model invocations are retained in the durable ledger. Six completed
  invocations report an input subtotal of 353494, an output subtotal of 70109,
  a total subtotal of 423603, reasoning subtotal 0 and cached-input subtotal
  197125. The third QA invocation was aborted and remains `UNKNOWN`. Therefore
  **complete mission token usage is UNKNOWN**; these subtotals are neither the
  complete usage nor evidence of zero usage. All recorded dollar costs are
  `UNKNOWN`/null.

The failed artifacts, checkpoint, mission record, ledger, logs and browser
receipt remain in the run tree. No output was designated accepted.

### Defects exposed by the real run

1. `MissionManager` restored elapsed checkpoint time but started a fresh
   timeout. It now subtracts elapsed time, uses zero as an immediate timeout,
   records elapsed/budget metadata, and starts no new provider/tool effect when
   the cumulative budget is gone. The synthetic offline regression checks that
   an already exhausted resume invokes no Head, specialist, QA or route.
2. The repair instruction previously contained defect prose, objective and
   criteria, but not the original complete description/accepted delivery paths.
   It now includes those, and the immutable approved specification when bound,
   without changing the established repair prefix. A production-admission
   regression checks this context and completes only a real registered repair.
3. For a separately authorized single replacement only, the host-bound scope
   prohibits unnecessary reports/root-level duplicate artifacts. It explicitly
   explains the already binding resource rule and requires a relative local
   `favicon.svg` reference, with no `data:`, `blob:`, external or
   protocol-relative resource URL. This clarifies rather than weakens the same
   `r1-static-task-tracker-v1` verifier and its acceptance criteria.

The failed attempt was not resumed after these discoveries. The operator
explicitly chose exactly **one final fresh attempt**, not unlimited retries.
The fixes must pass a fresh complete offline regression before that attempt.

## Frozen originals

The practice owns only its run-specific state. Frozen R0 trace evidence remains
**55/55 hashes OK** and its state remains **252 files**, tree SHA-256
`85b9030f8bcc8b91a438b8b65fa9bf1f7647887ac631537446e8ffc4ea72ee6b`.
Attempt 1 additionally retains these checks in its run root. A focused test
command initially omitted its report destination; the affected working-tree R0
logs were restored from the local checkpoint and all 55 hashes verified again.
No `.awe-data` content changed.

## Verification after the run

`r1-local-web-followup/` retains the focused production-runtime/admission
checks, fresh typecheck/build output and the fresh complete offline suite.
The fresh complete suite passed **39/39 suites** from 00:11:52Z through
00:19:22Z on 2026-11-14. Its `full-offline/summary.json` records every suite,
exit code, duration and isolated-data setting. `typecheck.log`, `build.log` and
`source.sha256` bind the repaired source used for this gate. No live replacement
was started before this result.

The runtime/harness repair and pre-replacement evidence were committed locally
as `04121c02e783cf230e2c006e371373822a62a797`. No remote push occurred.

## Attempt 2 — final product PASS; mission NOT ACCEPTED

- Run: `r1-local-web-1794615675176-cad6b269/`
- Mission: `r1-web-fc45eff2-3378-4ebd-8682-006ac71fac0a`
- This was the one explicitly authorized fresh attempt. It did not resume or
  mutate attempt 1. No third attempt or silent resume was made.
- Head planned one coder delegation. The coder used only the approved file
  tools and saved exactly four files in `product/`. Bounded QA then exercised
  repair. The second repair invocation was aborted at the mission deadline.
- The final product's independent `r1-static-task-tracker-v1` outcome is
  **PASS**: all 13 checks passed with no issues, using Chromium
  `158.0.8127.18`. These include bounded keyboard/add/blank-input checks,
  literal rendering, bidirectional completion, filtering, persistence,
  deletion, 375px and 1280px overflow, local-resource conformance and absence
  of runtime/CSP errors. The verifier contract remains
  `4857e261da19afefcf3bcfa80879b5a1d286963a42495d8fa97f90aa30d01bb8`.
- Exact final product tree SHA-256:
  `a71660c6e6562f9542ed16013f4e24dedd3dcc179106ebc1bb9d72efe31ababe`.
  The four persisted SHA-256 values are:
  - `product/index.html`: `7ab4096b237c0ea62bd8a747209a48fe67728bf0647c45dbea834a6cbc61d6ff`
  - `product/styles.css`: `78ad22edf3eaee5bfb075286c11e36da8ec8f0761bc4ba92c97361db351a0a70`
  - `product/app.js`: `a0fd4c813b034fbebe729c567cc97c5a97230afabdb8d68d3e16a3967627d77a`
  - `product/favicon.svg`: `3c31b9291d91989fad7ac65d70b2b4fa5257a50e169cb4600411de319c9a718e`
- `final-state-audit.json` independently re-read those bytes, validates the
  receipt SHA-256 and tree manifest, confirms all 13 checks, and retains the
  paused mission and UNKNOWN accounting. All audit assertions are true.
- **The product PASS does not complete the mission.** The mission used 600111
  ms of its 600000 ms budget and remains **paused**, with two repair iterations
  consumed and an unresolved aborted repair-2 intent retained. The runtime
  confirms actual work quiesced with zero pending operations; this is not a
  claim that the recorded intent completed. `summary.json` correctly retains
  `accepted: false`. No manual acceptance, resume or recovery override occurred.
- The in-mission QA receipt is a separately preserved **FAIL** against earlier
  tree `198243a173248fd3ca8e21ff5a2cea15bc14034bdbe908f2fd3ef25b46b223c5`.
  The post-timeout independent PASS applies only to the exact final tree above.
  Four root-level duplicate registrations and the resulting over-six-artifact
  review boundary remain in the failure evidence; neither the evidence limit
  nor browser assertions was weakened to obtain the final verifier PASS.
- Six model invocations have durable start and finish records. Five completed
  invocations report an input subtotal of 293774, an output subtotal of 43240,
  a total subtotal of 337014, reasoning subtotal 0 and cached-input subtotal
  163061. The aborted repair has outcome UNKNOWN, notwithstanding its 104613
  reported tokens. **Complete mission token usage is UNKNOWN**; no subtotal is
  presented as full usage or provider billing. All dollar costs are UNKNOWN.

No deployment or publication was performed. The evidence scan detected no
configured credential values in the replacement run. `run-evidence.sha256`
records every pre-commit run file including the product, state and both QA
receipts; the separate host console is `r1-local-web-followup/
replacement-execution-console.log`. The frozen `.awe-data` tree still contains
252 files and matches its expected hash. This finite successful browser result
does not establish model-quality improvement, broad web security/WCAG
compliance, product qualification or full-R1 readiness.
