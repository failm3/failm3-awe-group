# Stage 2: OpenCode Tool Enhancement — Analysis

**Objective:** Identify ≤3 tool candidates from Codex audit, integrate ≥1 safely, measure baseline vs enhanced on identical control task.

**Source:** PR #31 Codex audit (`failm3/nivict-ai-academy`, branch `codex/awe-catalog-forensic-audit-01`)

---

## Audit Summary

### Coverage
- **4504 NIVICT source rows** (all preserved)
- **3415 Manus TI v2 records** exported
- **50 desk reviews** (R01-R50 technical reviews)
- **32 reviews linked to shortlist** for architectural recommendations
- **0 runtime-approved, 0 integrated** — audit was forensic inventory only

### Top 10 Reuse Priorities (PRIORITY-BACKLOG.md)
1. **Playwright MCP + DevTools** (R13, R14) — browser automation, screenshots, console/network
2. **Official GitHub MCP** (R16) — repo operations, PR/issue management
3. **Workspace CLI/MCP** (R17, R18) — Gmail/Calendar/Drive OAuth clients
4. **Figma MCP + image diff** (R41, R44) — design RPC, visual diffs
5. **Manus discovery + ToolHive/FastMCP** (R10) — catalog/MCP plumbing
6. **Relational memory + pgvector** (R25) — vector search on existing DB
7. **Langfuse/OTel** (R22) — tracing/telemetry
8. **Promptfoo + eval methodology** (R23, R42) — test harness
9. **Agent Zero/Hermes primitives** (R01, R02) — execution/delegation patterns
10. **Mastra Head + workflows** (R03) — orchestration

---

## OpenCode Workflow Gaps

### Current OpenCode Tools (this session)
- File read/write/edit
- Shell execution
- Grep/glob search
- Web search/fetch
- Subagents
- Skills (none configured in this environment)
- MCP servers (none configured in this environment)

### Observed Workflow Pain Points
1. **Browser automation is indirect:** `scripts/awe-screenshot.sh` wrapper required; no DOM inspection, no network/console capture, no multi-viewport testing
2. **No native GitHub operations:** Can shell to `gh` CLI but no structured PR/issue/code search
3. **No observability:** No trace/span capture for debugging multi-step workflows
4. **No visual regression:** Screenshot diff requires external tools
5. **No structured document parsing:** MarkItDown/Unstructured would help with PDF/DOCX analysis

---

## Stage 2 Candidates (≤3)

### Candidate 1: Playwright MCP (R13) — **RECOMMENDED**
- **Capability:** Browser automation via MCP protocol (screenshot, DOM, network, console)
- **Relevance:** Replaces custom `awe-screenshot.sh` wrapper; enables visual QA, frontend testing, DOM assertions
- **Safety:** Dedicated profile, no logged-in sessions, redirect/file/cookie denial
- **Integration:** MCP server config in OpenCode; test with isolated profile
- **Measurement:** Control task = "Screenshot example.com at 1280x720 and 375x667, verify both PNGs exist"
  - **Baseline:** Via `scripts/awe-screenshot.sh` (current)
  - **Enhanced:** Via Playwright MCP `browser_take_screenshot`
  - **Metrics:** Time, reliability, artifact quality, DOM access
- **Risk:** Browser binaries (already resolved for AWE via Playwright-bundled Chromium)

### Candidate 2: GitHub MCP (R16) — **RECOMMENDED**
- **Capability:** Structured GitHub operations (search code, list PRs/issues, read file contents, list commits)
- **Relevance:** Enables code exploration, PR review, issue triage without shell gymnastics
- **Safety:** Read-only initially; write operations require separate approval
- **Integration:** MCP server config; test with public repo first
- **Measurement:** Control task = "Find all TypeScript files in `src/agents/` that mention 'QA'"
  - **Baseline:** Via `grep -r "QA" src/agents/*.ts`
  - **Enhanced:** Via GitHub MCP code search (if repo is on GitHub) or fallback to grep
  - **Metrics:** Query expressiveness, result structure, performance
- **Risk:** Requires repo to be on GitHub; token/auth for private repos

### Candidate 3: Langfuse (R22) — **DEFER**
- **Capability:** Tracing/observability for LLM calls and tool chains
- **Relevance:** Helps debug multi-agent workflows, track token usage, identify bottlenecks
- **Safety:** Passive observer; requires hosted instance or local deployment
- **Integration:** OpenCode would need to emit traces; not a tool but instrumentation
- **Measurement:** Hard to measure "baseline vs enhanced" on a single task
- **Risk:** Infrastructure overhead; secrets in traces; not directly improving task completion
- **Decision:** Useful but not a task-improving tool; focus on Playwright + GitHub first

---

## Integration Plan

### Phase 1: Playwright MCP (Candidate 1)
1. **Install:** `npm install -g @modelcontextprotocol/server-playwright` (or equivalent)
2. **Configure:** Add MCP server to OpenCode config (isolated profile, check where OpenCode reads MCP config)
3. **Test:** Control task "Screenshot example.com desktop + mobile"
   - Baseline: `scripts/awe-screenshot.sh https://example.com 1280 720 output1.png && scripts/awe-screenshot.sh https://example.com 375 667 output2.png`
   - Enhanced: Via MCP `browser_take_screenshot` with both viewports
4. **Measure:** Time, PNG sizes, success rate (3 runs each)
5. **Rollback:** Remove MCP config if no benefit or reliability issues

### Phase 2: GitHub MCP (Candidate 2) — if Phase 1 succeeds
1. **Install:** GitHub MCP server
2. **Configure:** Point at a public test repo (e.g., this AWE GROUP repo if pushed, or a known public repo)
3. **Test:** Control task "Find files mentioning 'delegation' in src/"
   - Baseline: `grep -r delegation src/`
   - Enhanced: GitHub MCP code search
4. **Measure:** Query power, result structure, speed

### Phase 3: Report
- Document actual measurements (no fabricated percentages)
- Keep or rollback each candidate based on real benefit
- Stage 2 acceptance: ≥1 integrated with measured advantage

---

## Acceptance Criteria (from spec)

- ✅ Max 3 candidate tool additions (Playwright, GitHub, Langfuse-deferred)
- ⬜ At least 1 safe candidate integrated in isolated profile
- ⬜ Baseline vs enhanced measured on identical control task
- ⬜ No fabricated speedup percentages
- ⬜ Rollback if no benefit
- ⬜ No modification of global OpenCode / shared service ports

---

## Next Steps

1. Determine where OpenCode reads MCP server configuration
2. Install Playwright MCP server in isolated location
3. Configure OpenCode to use it (test profile or separate config)
4. Run control task baseline (3 runs via scripts)
5. Run control task enhanced (3 runs via MCP)
6. Compare results, document measurements
7. Decide: keep, iterate, or rollback
8. If successful, consider GitHub MCP; otherwise stop at 1

---

## Notes

- Audit files `TECHNICAL-REVIEWS.json` and `TOP-50-DEEP-REVIEW.md` not locally cached; working from PRIORITY-BACKLOG and CAPABILITY-GAP-MATRIX
- R## references are from audit's technical review IDs
- Current OpenCode session has no Skills or MCP servers configured
- AWE already uses Playwright-bundled Chromium at `.chromium-deps/chrome-linux64/chrome`; no additional browser install needed for Playwright MCP
