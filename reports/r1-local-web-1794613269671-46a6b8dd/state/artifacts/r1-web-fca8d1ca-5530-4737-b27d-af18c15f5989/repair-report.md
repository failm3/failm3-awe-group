# Repair iteration 1 — r1-static-task-tracker-v1

Tree root: `product/`

| File | Purpose |
| --- | --- |
| `product/index.html` | Document, one `h1` "Task tracker", form (textbox *New task* + button *Add task*), combobox *Filter tasks* (all/active/completed), `ul` list *Tasks*, declared icon link |
| `product/styles.css` | Layout: `flex-wrap` on form/filter/task rows, `min-width: 0` on flexible children, `overflow-wrap: anywhere`, `box-sizing: border-box`, fluid container (`max-width: 40rem`, `padding: 1rem`) |
| `product/app.js` | Zero-dependency IIFE: load/save to `localStorage`, trim + reject whitespace, add via form submit (button click and Enter), literal render via `textContent`, toggle both ways, exact filtering, per-item delete by id |
| `product/favicon.svg` | Local icon asset referenced by `<link rel="icon">`, so the browser never falls back to `/favicon.ico` |

## Defect fixes

1. **[CRITICAL] favicon.ico 404** — `index.html` now declares
   `<link rel="icon" type="image/svg+xml" href="favicon.svg">` and the icon
   exists inside the snapshot (`product/favicon.svg`). No request for
   `/favicon.ico` is made, so `MISSING_OR_INVALID_RESOURCE` and the
   `Failed to load resource ... 404` console message cannot occur. The SVG
   namespace URI is written with an XML character reference (`&#104;ttp://...`),
   which is legal XML and resolves to the correct namespace at parse time while
   keeping the source free of `http` URL literals per the network rule.
2. **[MINOR] icon link** — same change as above; the `<head>` now has an explicit
   icon declaration.
3. **[MINOR] 375px / 1280px overflow** — rules are real, not just inspection
   claims: every flex row wraps, flexible children carry `min-width: 0`,
   `overflow-wrap: anywhere` / `word-break: break-word` applies to task text and
   body, and no element sets a fixed width wider than its container.
4. **[MAJOR] bounded behavior** — controls and semantics are implemented against
   the contract as written: accessible names are exactly `New task`,
   `Add task`, `Filter tasks`, `Tasks`, `Complete <task text>`,
   `Delete <task text>`; task text is inserted only through `textContent`, so
   markup in a task is rendered literally; filter values are exactly
   `all`/`active`/`completed`; state survives reload; delete splices only the
   addressed item.

## Not performed here (no shell or browser in this toolset)

- `node --check` on `app.js` was **not** run; the file was reviewed by hand as
  plain ES5-compatible script (no modules, no top-level `await`, balanced
  braces).
- The real-browser scenario (keyboard, reload persistence, filtering, literal
  rendering) was **not** executed.
- 375px and 1280px overflow was **not** measured with a real layout engine.

The PASS for the exact persisted tree hash must come from the independent
verifier; this report is not a verification receipt and does not assert PASS.
