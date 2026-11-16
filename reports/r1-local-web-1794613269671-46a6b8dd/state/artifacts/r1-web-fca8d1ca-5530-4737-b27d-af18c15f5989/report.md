# Task tracker: repair iteration 2

## Product tree (product/)
- index.html: heading Task tracker, labelled textbox New task, button Add task, labelled select Filter tasks (all/active/completed), ul labelled Tasks. Declares an inline empty icon (link rel=icon href=data:,) so the browser makes no /favicon.ico request.
- styles.css: flex layouts with wrapping, box-sizing border-box, overflow-wrap anywhere; no horizontal overflow at 375px or 1280px; visible focus outlines.
- app.js: single IIFE, no dependencies.
- favicon.svg: inert placeholder comment only, not referenced by any page. It contains no URL literal. It could not be deleted with the available tools and should be removed on the host side.

## app.js as persisted
- Storage key: r1-task-tracker-v1 (localStorage, JSON array of {text, done}); load failures fall back to an empty list.
- State: in-memory array of {id, text, done} with numeric ids assigned at load or add time.
- Functions: load, save, render, focusControl, indexOfId.
- render() rebuilds the whole list from scratch on every change (add, toggle, delete, filter change). There are no in-place DOM updates and no buildItem, toggleTask, pruneNonMatching or removeTask functions.
- Add: form submit (button click or Enter); input is trimmed, whitespace-only input is rejected. Text is inserted with textContent, so it renders literally.
- Toggle: delegated change handler on the list; each item has a checkbox with aria-label Complete <text>. Focus is restored to the same checkbox afterwards.
- Delete: delegated click handler; each item has a button with aria-label Delete <text>. Only the matching id is spliced out; focus returns to the input.
- Filter: all, active, completed, applied in render().

## Changes in this iteration
1. Removed the favicon.svg link, which depended on an obfuscated xmlns, in favour of an inline empty icon. This addresses the /favicon.ico 404 and console error and removes the literal-scan workaround.
2. Re-registered all product files under product/ names so the artifact set matches the tree.
3. Rewrote this report to match the real code.

## Verification status
No PASS is claimed. The tree changed (index.html and favicon.svg), so the independent r1-static-task-tracker-v1 verifier must be re-run on the new tree hash. Solver-side checks cannot establish PASS.

## Residual risk
The verifier's handling of a data: URL in a link href is not known from the contract. It is not a network resource, but if it is flagged, the fallback is to remove the icon link entirely and accept the default favicon request behaviour.
