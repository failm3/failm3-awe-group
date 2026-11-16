# R1 finite web-product verifier preparation

## Scope and status

Implemented `src/capabilities/web-product.ts`, `src/agents/web-qa.ts` and their integration/control suites.
This is independent verifier preparation and handwritten verifier-control evidence.
It does not assert an approved P2 mission, live model execution, agent-created
product, qualification, or publication. Parent P0 approval remains the prerequisite
for actual P2 execution. No dependency installation or commit was made.

## Finite product contract

`WEB_PRODUCT_CONTRACT` and `WEB_PRODUCT_CONTRACT_DIGEST` export the exact contract
to include in the approved specification. The candidate is a zero-dependency
static task tracker. Required named controls: heading **Task tracker**, textbox
**New task**, button **Add task**, combobox **Filter tasks** (`all`, `active`,
`completed`), list **Tasks**, and item-specific **Complete <text>** checkbox and
**Delete <text>** button. Task text must be an exact text node/element match.

Checks exercise random task titles, trimming, blank rejection, click and Enter
submission, literal text rendering, keyboard completion/deletion, both toggle
directions, exact filter membership, reload persistence of task/completion/deletion,
and horizontal overflow at 375px and 1280px. These are bounded functional and
accessibility checks, not broad UX or WCAG certification.

The source tree is restricted to 64 UTF-8 files, 1 MiB, eight directory levels,
128 directory entries and a small extension set. Links, hardlinks, special files,
hidden filenames and out-of-workspace roots are rejected. `index.html` is required.
External HTTP/HTTPS/WS/WSS URL literals are prohibited even in comments. The
restriction also rejects HTTP XML namespace literals in SVG: use namespace-free
local SVG or omit SVG. DOM URL checks catch entity-encoded links; Chromium CSP and
request interception prevent attempted external application requests in the
bounded scenario. This is not an OS-level network isolation claim for Chromium.

## Execution and evidence

- Uses installed `@playwright/test` and only the project-local Chromium cache.
- Chromium sandbox is explicitly enabled; failure to launch is `BLOCKED`.
- Fresh browser context and local storage for every verification.
- Immutable in-memory snapshot served on an ephemeral `127.0.0.1` port.
- Every `.js`/`.mjs` file, including unused modules, is parsed by real
  `node --input-type=module --check` inside the existing `shellSandboxArgs`
  Bubblewrap sandbox. Source arrives on stdin and is not executed by Node.
- There is no package build for this static contract: the source snapshot is the
  deployable tree. Arbitrary package scripts/framework builds are outside scope.
- Inline syntax/runtime errors are detected by real Chromium execution.
- CSP prohibits connections, workers, frames, objects and base overrides; only
  snapshot resources are served. Browser errors, missing/failed resources,
  external requests, console errors, dialogs, downloads and popups fail QA.
- Receipt includes exact per-file hashes, aggregate tree hash, contract hash,
  actual syntax-command argv/status/stderr, named check results, browser version,
  and a receipt hash. Hashes provide content binding, not issuer authentication.
- All outcomes explicitly carry `qualification: NOT_ASSESSED`.
- Server, browser and temporary workspace are closed/removed. Chromium uses the
  approved `/tmp/opencode` location to keep Unix socket paths below Linux limits.

## Integration after parent approval

Parent integration reuses the existing approval/spec-binding, Head/manager
delegation, file/shell tools, artifact persistence, and host qualification
authority. The host QA adapter saves the current receipt at
`.independent-qa/web-verification.json`, outside the candidate `product/` tree.
The solver cannot issue the receipt and evidence writes cannot alter the tested
product hash. The bounded local practice harness is
`scripts/r1-local-web-mission.ts`; it is not a product-qualification issuer.

1. Bind the finite contract digest and limits into the user-approved mission
   specification. Delegate creation of `product/` to the actual model through
   existing mission-scoped tools. The test fixture must not become solver output.
2. Host QA resolves the mission workspace from existing trusted storage and the
   candidate artifact tree from saved mission artifacts. Check current approved
   spec binding and execution fence before invocation; freeze candidate writes.
3. Invoke independently from the solver:

   ```ts
   const result = await verifyWebProduct({
     workspaceRoot: trustedMissionWorkspace,
     projectDir: path.join(trustedMissionWorkspace, 'product'),
   });
   ```

4. Save the complete JSON receipt with existing `saveArtifactFile` under the
   current fence. `FAIL` supplies named repair defects; `BLOCKED` means missing
   infrastructure and cannot be converted to PASS. Use the existing bounded
   repair loop and fresh independent verification after changes.
5. A host-authenticated QA issuer may qualify only after validating PASS against
   the approved contract and binding `tree_sha256`, spec hash, capability/profile
   hashes and saved evidence references. The receipt cannot self-qualify.
6. At acceptance, use existing generation-fenced admission and spec checks; bind
   accepted artifact bytes to the same tree manifest. Reverify if bytes changed.
   A snapshot PASS does not certify later disk mutations. Production deployment
   remains a separate authorized action.

## Reproduction

```sh
npm run typecheck
node_modules/.bin/tsx src/tests/r1-web-product.test.ts
```

The suite requires the installed local browser and Bubblewrap and never silently
skips unavailable prerequisites. It contains one positive real-browser control,
negative controls for persistence/filter/deletion/completion/literal rendering/
blank handling, unused and inline syntax, runtime errors, literal/encoded/computed
external URLs, missing stylesheets, inaccessible controls, mobile overflow,
symlinks/hardlinks/size/entry/root bounds, and unavailable browser behavior.
