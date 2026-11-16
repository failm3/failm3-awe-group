#!/usr/bin/env python3
"""Manus catalog search API - read-only REST API over manus_catalog schema."""
import json
import os
from typing import Any, Optional
from fastapi import FastAPI, Query, HTTPException
from fastapi.responses import JSONResponse
import psycopg
import uvicorn

# Database connection
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://awe_ti@127.0.0.1:5448/awe_ti"
)

app = FastAPI(
    title="Manus Catalog Search API",
    description="Read-only search over 3415 NIVICT tool catalog entries",
    version="1.0.0"
)

def get_conn():
    """Get database connection."""
    return psycopg.connect(DATABASE_URL)

@app.get("/health")
def health():
    """Health check endpoint."""
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM manus_catalog.resources;")
                count = cur.fetchone()[0]
        return {"status": "healthy", "catalog_size": count}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )

@app.get("/stats")
def stats():
    """Get catalog statistics."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 
                    COUNT(*) as total,
                    COUNT(DISTINCT stage) as stages,
                    COUNT(DISTINCT source_sha256) as sources
                FROM manus_catalog.resources;
            """)
            row = cur.fetchone()
            
            cur.execute("""
                SELECT stage, COUNT(*) as count
                FROM manus_catalog.resources
                GROUP BY stage
                ORDER BY count DESC;
            """)
            stage_dist = {row[0]: row[1] for row in cur.fetchall()}
    
    return {
        "total_resources": row[0],
        "stages": row[1],
        "sources": row[2],
        "stage_distribution": stage_dist
    }

@app.get("/search")
def search(
    q: str = Query(..., description="Search query (keyword, 'id:N', or 'stage:X')"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results")
):
    """Search catalog by keyword, ID, or stage."""
    query_lower = q.strip().lower()
    
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Handle structured queries
            if query_lower.startswith("id:"):
                try:
                    manus_id = int(query_lower[3:])
                    cur.execute("""
                        SELECT manus_id, name, stage, source_row, source_sha256, urls
                        FROM manus_catalog.resources
                        WHERE manus_id = %s;
                    """, (manus_id,))
                except ValueError:
                    raise HTTPException(status_code=400, detail="Invalid ID format")
            
            elif query_lower.startswith("stage:"):
                stage = query_lower[6:].upper()
                cur.execute("""
                    SELECT manus_id, name, stage, source_row, source_sha256, urls
                    FROM manus_catalog.resources
                    WHERE stage = %s
                    ORDER BY manus_id
                    LIMIT %s;
                """, (stage, limit))
            
            else:
                # Full-text search on name
                cur.execute("""
                    SELECT manus_id, name, stage, source_row, source_sha256, urls
                    FROM manus_catalog.resources
                    WHERE to_tsvector('english', name) @@ plainto_tsquery('english', %s)
                       OR name ILIKE %s
                    ORDER BY 
                        CASE WHEN name ILIKE %s THEN 0 ELSE 1 END,
                        manus_id
                    LIMIT %s;
                """, (query_lower, f"%{query_lower}%", f"%{query_lower}%", limit))
            
            results = []
            for row in cur.fetchall():
                results.append({
                    "manus_id": row[0],
                    "name": row[1],
                    "stage": row[2],
                    "source_row": row[3],
                    "source_sha256": row[4],
                    "urls": row[5] if row[5] else []
                })
    
    return {
        "query": q,
        "count": len(results),
        "results": results
    }

@app.get("/resources/{manus_id}")
def get_resource(manus_id: int):
    """Get resource by ID."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT manus_id, name, stage, source_row, source_sha256, urls, approved_for_export
                FROM manus_catalog.resources
                WHERE manus_id = %s;
            """, (manus_id,))
            
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"Resource {manus_id} not found")
            
            return {
                "manus_id": row[0],
                "name": row[1],
                "stage": row[2],
                "source_row": row[3],
                "source_sha256": row[4],
                "urls": row[5] if row[5] else [],
                "approved_for_export": row[6]
            }

if __name__ == "__main__":
    port = int(os.getenv("MANUS_API_PORT", "8872"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
