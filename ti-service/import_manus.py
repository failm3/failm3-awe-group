#!/usr/bin/env python3
"""Import Manus Public Index into separate manus_catalog schema."""
import json
import sys
import psycopg
from pathlib import Path

def create_schema(conn):
    """Create manus_catalog schema and table."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE SCHEMA IF NOT EXISTS manus_catalog;
        """)
        
        cur.execute("""
            CREATE TABLE IF NOT EXISTS manus_catalog.resources (
                manus_id INTEGER PRIMARY KEY,
                source_row INTEGER NOT NULL,
                source_sha256 TEXT NOT NULL,
                name TEXT NOT NULL,
                stage TEXT NOT NULL,
                urls JSONB DEFAULT '[]'::jsonb,
                approved_for_export BOOLEAN DEFAULT false,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_manus_name 
            ON manus_catalog.resources USING gin(to_tsvector('english', name));
        """)
        
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_manus_stage 
            ON manus_catalog.resources(stage);
        """)
        
        conn.commit()
        print("✓ Schema and table created")

def import_records(conn, jsonl_path: str):
    """Import records from JSONL file."""
    records = []
    
    with open(jsonl_path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                record = json.loads(line)
                records.append((
                    record['manus_id'],
                    record['source_row'],
                    record['source_sha256'],
                    record['name'],
                    record['stage'],
                    json.dumps(record.get('urls', [])),
                    record.get('approved_for_export', False)
                ))
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Warning: Failed to parse line {line_num}: {e}", file=sys.stderr)
    
    print(f"✓ Loaded {len(records)} records from {jsonl_path}")
    
    with conn.cursor() as cur:
        cur.execute("DELETE FROM manus_catalog.resources;")
        
        cur.executemany("""
            INSERT INTO manus_catalog.resources 
            (manus_id, source_row, source_sha256, name, stage, urls, approved_for_export)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s)
        """, records)
        
        conn.commit()
        print(f"✓ Inserted {len(records)} records")
    
    return len(records)

def verify_import(conn, expected_count: int):
    """Verify import integrity."""
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM manus_catalog.resources;")
        actual_count = cur.fetchone()[0]
        
        if actual_count != expected_count:
            print(f"✗ Count mismatch: expected {expected_count}, got {actual_count}", file=sys.stderr)
            return False
        
        print(f"✓ Record count verified: {actual_count}")
        
        cur.execute("""
            SELECT stage, COUNT(*) 
            FROM manus_catalog.resources 
            GROUP BY stage 
            ORDER BY COUNT(*) DESC;
        """)
        stages = cur.fetchall()
        print(f"✓ Stage distribution:")
        for stage, count in stages:
            print(f"  - {stage}: {count}")
        
        cur.execute("""
            SELECT manus_id, name, stage 
            FROM manus_catalog.resources 
            ORDER BY RANDOM() 
            LIMIT 3;
        """)
        samples = cur.fetchall()
        print(f"✓ Random sample:")
        for manus_id, name, stage in samples:
            print(f"  - [{manus_id}] {name} ({stage})")
    
    return True

def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path-to-MANUS-PUBLIC-INDEX.jsonl>")
        sys.exit(1)
    
    jsonl_path = sys.argv[1]
    
    if not Path(jsonl_path).exists():
        print(f"Error: File not found: {jsonl_path}", file=sys.stderr)
        sys.exit(1)
    
    # Connect to database
    conn_string = "postgresql://awe_ti@127.0.0.1:5448/awe_ti"
    
    try:
        with psycopg.connect(conn_string) as conn:
            print("✓ Connected to database")
            
            create_schema(conn)
            count = import_records(conn, jsonl_path)
            
            if verify_import(conn, count):
                print(f"\n✅ Successfully imported {count} Manus records into manus_catalog schema")
            else:
                print("\n✗ Import verification failed", file=sys.stderr)
                sys.exit(1)
    
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
