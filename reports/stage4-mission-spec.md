# Stage 4 Mission: NIVICT Landing Page with Design System Foundation

**Mission Type**: Autonomous execution via AWE GROUP  
**Priority**: Critical (Stage 4 gate for E1-PRODUCT-LAUNCH-01)  
**Complexity**: Moderate

---

## Objective

Build a working, visually polished landing page for NIVICT that demonstrates design system fundamentals: design tokens, responsive layout, component states, and visual verification across desktop and mobile viewports.

---

## Acceptance Criteria

1. **Design tokens defined** — CSS custom properties or JSON for colors, typography, spacing, radii
2. **Responsive layout** — Works at 1280×720 (desktop) and 375×667 (mobile)
3. **Component variety** — At least: hero section, feature cards, CTA buttons, footer
4. **Visual polish** — No Lorem ipsum; realistic content; intentional color palette
5. **Working HTML file** — Single-file or buildable; opens in browser locally
6. **Visual evidence** — Desktop + mobile screenshots saved
7. **Source code** — HTML/CSS/JS (if needed) committed to artifacts

---

## Scope

**IN SCOPE:**
- Single landing page (not full site)
- Design tokens (colors, typography, spacing)
- 3-5 sections (hero, features, CTA, footer)
- Responsive breakpoints
- Visual verification screenshots

**OUT OF SCOPE:**
- Backend/API integration
- Multi-page site
- Complex animations
- Form submission handling
- Authentication

---

## Suggested Approach

1. **Define design tokens** — Color palette (primary/secondary/neutral), typography scale, spacing system
2. **Create HTML structure** — Semantic sections (header, main, footer)
3. **Style with CSS** — Use tokens, implement responsive grid
4. **Verify visually** — Take screenshots at 1280×720 and 375×667
5. **Save artifacts** — HTML, CSS, screenshots, design token file

---

## Design Direction

**Brand**: NIVICT — professional tool catalog and AI agent engineering  
**Tone**: Technical, trustworthy, modern  
**Palette**: Dark mode friendly — deep blues/cyans, subtle gradients, high contrast  
**Typography**: Sans-serif, generous line-height, clear hierarchy

---

## Deliverables

1. `nivict-landing.html` — Working page (single file or with assets)
2. `tokens.css` or `tokens.json` — Design token definitions
3. `desktop-screenshot.png` — 1280×720 viewport
4. `mobile-screenshot.png` — 375×667 viewport
5. `README.md` — How to open the page, token documentation

---

## Success Criteria

- ✅ Page opens locally in browser
- ✅ Responsive at both viewports
- ✅ No broken links or missing images
- ✅ Design tokens documented
- ✅ Screenshots captured and saved
- ✅ Sources committed to git

---

## Quality Gate

Independent QA will verify:
1. File exists and is openable
2. Screenshots match actual rendered page
3. Responsive behavior works
4. No placeholder content
5. Design tokens are used consistently

---

## Resources

- AWE tools: `file_write`, `shell`, `browser_screenshot`, `save_artifact`
- Design inspiration: modern SaaS landing pages
- No external dependencies required (pure HTML/CSS acceptable)

---

## Handover

This mission will be handed to AWE via:

```bash
npx tsx src/index.ts run "Build the NIVICT landing page as specified in Stage 4"
```

AWE will:
1. Form a team (designer, frontend developer, QA)
2. Define visual concept and design tokens
3. Implement HTML/CSS
4. Verify across viewports
5. Save artifacts and provide local URL/file

---

## Constraints

- No external API calls required
- Work in project workspace only
- Use existing AWE browser automation
- Commit to `feature/awe-e1-product-launch-01` branch

---

## Timeline

Expected: 10-15 minutes autonomous execution  
Maximum: 30 minutes with repairs
