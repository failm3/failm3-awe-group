"""Manus catalog search service - read-only access to 3415 Manus v2 records.

This is a separate test service that provides capability-based search over
the Manus Public Index without modifying the production TI database.

Usage:
    python3 ti-service/manus_search.py <path-to-MANUS-PUBLIC-INDEX.jsonl>
"""
import json
import sys
from collections import defaultdict
from typing import Any


def load_manus_index(path: str) -> list[dict[str, Any]]:
    """Load all Manus records from JSONL file."""
    records = []
    with open(path, 'r', encoding='utf-8') as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                records.append(record)
            except json.JSONDecodeError as e:
                print(f"Warning: Failed to parse line {line_num}: {e}", file=sys.stderr)
    return records


def build_search_index(records: list[dict[str, Any]]) -> dict:
    """Build capability and keyword search indexes."""
    # Extract capabilities, integrations, and keywords from each record
    capability_index = defaultdict(list)
    keyword_index = defaultdict(list)
    
    for idx, record in enumerate(records):
        manus_id = record.get('manus_id', idx)
        name = record.get('name', '').lower()
        stage = record.get('stage', 'UNKNOWN')
        
        # Index by manus_id for fast lookup
        capability_index[f"id:{manus_id}"].append(idx)
        
        # Index by stage
        capability_index[f"stage:{stage}"].append(idx)
        
        # Index name tokens
        for token in name.split():
            if len(token) >= 2:
                keyword_index[token].append(idx)
        
        # Note: Manus v2 format doesn't have capabilities/integrations extracted yet
        # Those would require parsing the raw NIVICT source rows
        
    return {
        'records': records,
        'capability_index': dict(capability_index),
        'keyword_index': dict(keyword_index)
    }


def search_manus(index: dict, query: str, limit: int = 20) -> list[dict[str, Any]]:
    """Search Manus index by keyword or capability."""
    query_lower = query.lower().strip()
    records = index['records']
    keyword_index = index['keyword_index']
    capability_index = index['capability_index']
    
    # Check if it's a structured query
    if query_lower.startswith('id:'):
        try:
            manus_id = int(query_lower[3:])
            indices = capability_index.get(f"id:{manus_id}", [])
            return [records[i] for i in indices[:limit]]
        except ValueError:
            pass
    
    if query_lower.startswith('stage:'):
        stage = query_lower[6:].upper()
        indices = capability_index.get(f"stage:{stage}", [])
        return [records[i] for i in indices[:limit]]
    
    # Keyword search - find records where name contains query tokens
    query_tokens = query_lower.split()
    matching_indices = set()
    
    for token in query_tokens:
        if token in keyword_index:
            matching_indices.update(keyword_index[token])
    
    # If no matches, do a fallback scan
    if not matching_indices:
        for idx, record in enumerate(records):
            name = record.get('name', '').lower()
            if query_lower in name:
                matching_indices.add(idx)
    
    # Sort by manus_id and limit
    sorted_indices = sorted(matching_indices)[:limit]
    return [records[i] for i in sorted_indices]


def format_result(record: dict[str, Any]) -> dict[str, Any]:
    """Format a Manus record for display."""
    return {
        'manus_id': record.get('manus_id'),
        'name': record.get('name'),
        'stage': record.get('stage'),
        'source_row': record.get('source_row'),
        'urls': record.get('urls', []),
        'approved_for_export': record.get('approved_for_export', False),
        'source_sha256': record.get('source_sha256')
    }


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        print(f"\nUsage: {sys.argv[0]} <path-to-MANUS-PUBLIC-INDEX.jsonl>")
        sys.exit(1)
    
    jsonl_path = sys.argv[1]
    print(f"Loading Manus index from {jsonl_path}...", file=sys.stderr)
    
    records = load_manus_index(jsonl_path)
    print(f"Loaded {len(records)} records", file=sys.stderr)
    
    index = build_search_index(records)
    print(f"Built search index with {len(index['keyword_index'])} keywords", file=sys.stderr)
    
    # Interactive search
    print("\nManus Catalog Search (type 'quit' to exit)", file=sys.stderr)
    print("Query examples: 'playwright', 'id:42', 'stage:DOCUMENTED'", file=sys.stderr)
    
    while True:
        try:
            query = input("\nQuery: ").strip()
            if query.lower() in ('quit', 'exit', 'q'):
                break
            if not query:
                continue
            
            results = search_manus(index, query, limit=10)
            print(f"\nFound {len(results)} results:")
            for i, record in enumerate(results, 1):
                formatted = format_result(record)
                print(f"\n{i}. {formatted['name']} (ID: {formatted['manus_id']}, Stage: {formatted['stage']})")
                print(f"   Source row: {formatted['source_row']}, SHA: {formatted['source_sha256'][:16]}...")
                if formatted['urls']:
                    print(f"   URLs: {len(formatted['urls'])} total")
                    for url_entry in formatted['urls'][:2]:
                        print(f"     - {url_entry['field']}: {url_entry['canonical_url']}")
        
        except KeyboardInterrupt:
            print("\nInterrupted", file=sys.stderr)
            break
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)


if __name__ == '__main__':
    main()
