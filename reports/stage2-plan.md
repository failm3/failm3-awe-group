# Stage 2: OpenCode Workflow Enhancement

## Objective
Evaluate PR #31 (Codex audit) recommendations and integrate ≥1 safe candidate tool to improve OpenCode developer workflow.

## Audit Top 3 Recommendations
1. **Playwright MCP** — browser engine, screenshots, DOM assertions (ALREADY INSTALLED ✓)
2. **Official GitHub MCP** — read-only repo access, write denial
3. **Workspace MCP** — Gmail/Calendar/Drive with test account isolation

## Stage 2 Requirements (from spec)
- Pick ≤3 candidate tool additions for OpenCode workflow
- Integrate ≥1 safely in an isolated profile
- Measure baseline vs enhanced on one identical control task
- No invented speedup percentages
- Roll back if no benefit
- Don't modify global OpenCode, чужой `/goal`, or shared service ports

## Selected Candidates for Testing

### Candidate 1: Playwright MCP (BASELINE)
- **Status**: Already installed in global OpenCode MCP config
- **Verification**: Stage 1 tests confirm `browser_navigate`, `browser_take_screenshot`, etc. work
- **Benefit**: Browser automation, visual QA, screenshot verification
- **Risk**: Already proven safe in Stage 1

### Candidate 2: GitHub MCP
- **Status**: Not installed
- **Potential benefit**: Read code from repos without manual clone, search issues/PRs, read documentation
- **Risk**: Must configure read-only mode, prevent writes
- **Integration**: Install in isolated OpenCode profile
- **Test task**: "Read the README from repository X and summarize its purpose" — measure time/accuracy vs manual approach

### Candidate 3: Filesystem MCP (for better code navigation)
- **Status**: Check if available
- **Potential benefit**: Better file search, directory tree visualization
- **Risk**: Must scope to project directory only
- **Test task**: "Find all TypeScript files that import 'mission-manager'" — measure vs `grep`

## Control Task Design
**Task**: "Read the AWE GROUP README.md and create a 3-sentence project summary"

**Baseline** (no MCP enhancement):
1. Agent uses `read` tool
2. Agent writes summary
3. Measure: time, token count, accuracy

**Enhanced** (with GitHub MCP or filesystem MCP):
1. Agent uses MCP tool to discover/read file
2. Agent writes summary
3. Measure: time, token count, accuracy

**Success criteria**:
- Enhanced method produces equal or better summary
- Enhanced method uses ≤ baseline tokens + 20%
- Enhanced method completes in ≤ baseline time + 30%
- No new errors or permission violations

## Implementation Steps
1. ✓ Verify Playwright MCP baseline (Stage 1)
2. Check if GitHub MCP or filesystem MCP are available
3. Create isolated OpenCode profile for testing
4. Install one candidate MCP server
5. Run control task in baseline mode (no new MCP)
6. Run control task in enhanced mode (with new MCP)
7. Compare metrics (time, tokens, accuracy, errors)
8. If beneficial: keep; if not: roll back
9. Document results with real measurements

## Current Status
- Playwright MCP: ✓ VERIFIED (Stage 1 tests pass)
- GitHub MCP: Checking availability...
- Filesystem MCP: Checking availability...
