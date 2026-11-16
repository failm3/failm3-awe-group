# Stage 3: Tool Intelligence Catalog Expansion

## Objective
Import full Manus 3415 catalog into separate test schema and provide capability-based search to AWE agents.

## Requirements (from spec)
- Import full Manus 3415 export into **separate test DB/schema**
- Compare counts/hash against source
- Attach read-only capability search non-destructively
- Demonstrate 3 real scenarios + 1 negative test
- No modification of production TI database
- Search by capability, not dump 4504 descriptions

## Current State
- Production TI database: 12 resources, all stage=DISCOVERED, 0 approved
- Manus export: `.audit-cache/MANUS-PUBLIC-INDEX.jsonl` — 3415 lines
- Manus search script: `ti-service/manus_search.py` (working prototype)
- Database: PostgreSQL 18 at port 5448, database `awe_ti`, user `awe_ti`

## Implementation Plan

### Step 1: Import Manus Index into Separate Schema
```sql
CREATE SCHEMA IF NOT EXISTS manus_catalog;

CREATE TABLE manus_catalog.resources (
  manus_id INTEGER PRIMARY KEY,
  source_row INTEGER NOT NULL,
  source_sha256 TEXT NOT NULL,
  name TEXT NOT NULL,
  stage TEXT NOT NULL,
  urls JSONB,
  approved_for_export BOOLEAN DEFAULT false
);

CREATE INDEX idx_manus_name ON manus_catalog.resources USING gin(to_tsvector('english', name));
CREATE INDEX idx_manus_stage ON manus_catalog.resources(stage);
```

### Step 2: Load Data from JSONL
Python script to parse JSONL and insert into `manus_catalog.resources`

### Step 3: Verify Import
- Count: 3415 records
- Verify SHA256 checksums match source
- Check distinct stages
- Sample random records

### Step 4: Create Capability Search API
RESTful endpoint (separate from production TI API):
```
GET /manus/search?q=<query>&limit=<n>
GET /manus/stats
GET /manus/{manus_id}
```

### Step 5: Test Scenarios

**Scenario 1: Find browser automation tools**
- Query: "browser automation"
- Expected: Find `microsoft/playwright-mcp`, `lackeyjb/playwright-skill`
- Verify: Results contain relevant tools, no false positives

**Scenario 2: Find specific technology by ID**
- Query: "id:86"
- Expected: Return `microsoft/playwright-mcp`
- Verify: Exact match, correct metadata

**Scenario 3: Filter by stage**
- Query: "stage:DOCUMENTED"
- Expected: Return all DOCUMENTED resources
- Verify: Count matches, no DISCOVERED/EVALUATED mixed in

**Negative Test: Malformed query**
- Query: "stage:INVALID_STATUS"
- Expected: Return empty results or error, no crash
- Verify: Graceful handling, no 500 error

### Step 6: Integration with AWE
Add `manus_search` tool to AWE's available tools:
```typescript
{
  name: "manus_search",
  description: "Search 3415 NIVICT tool catalog entries by name, capability, or ID",
  parameters: {
    query: string,
    limit?: number
  }
}
```

## Success Criteria
- ✅ 3415 records imported into `manus_catalog` schema
- ✅ SHA256 checksums verified
- ✅ Read-only search API accessible
- ✅ 3 real scenarios pass
- ✅ 1 negative test passes
- ✅ Production TI database unchanged
- ✅ AWE agents can query Manus catalog
