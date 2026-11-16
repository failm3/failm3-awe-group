"""Transactional, idempotent contract ingestion. Imports never grant approval."""
from datetime import datetime, timezone
from pathlib import Path
import json
from psycopg.types.json import Jsonb
from .models import PostImport, ResourceImport, stable_hash, canonical_url, utcnow
from .extraction import extract_candidates


def json_value(value):
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def text_value(value):
    if value is None or isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def add_assertion(conn, resource_id, field, value, evidence_url=None, checked_at=None, kind="imported_claim"):
    payload = json_value({"field": field, "value": value, "evidence_url": evidence_url, "checked_at": checked_at, "kind": kind})
    row = conn.execute("""INSERT INTO assertions(resource_id,field,value,evidence_url,checked_at,evidence_kind,assertion_hash)
        VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(resource_id,assertion_hash) DO NOTHING RETURNING id""",
        (resource_id, field, Jsonb(json_value(value)), evidence_url, checked_at, kind, stable_hash(payload))).fetchone()
    return row["id"] if row else None


def ingest_post(conn, post: PostImport):
    source = conn.execute("""INSERT INTO sources(handle,url,title) VALUES (%s,%s,%s)
        ON CONFLICT(handle) DO UPDATE SET url=coalesce(EXCLUDED.url,sources.url),title=coalesce(EXCLUDED.title,sources.title),updated_at=now() RETURNING id""",
        (post.source_handle, post.source_url or f"https://t.me/{post.source_handle}", post.source_title)).fetchone()
    payload = post.model_dump(mode="json")
    content = {k: v for k, v in payload.items() if k not in {"collected_at", "raw_hash"}}
    digest = stable_hash(content)
    supplied_hash = post.raw_hash or stable_hash(post.raw or content)
    row = conn.execute("""INSERT INTO posts(source_id,message_id,url,published_at,text,forwarded_from,raw_hash,raw,collected_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(source_id,message_id) DO UPDATE SET
        url=EXCLUDED.url,published_at=EXCLUDED.published_at,text=EXCLUDED.text,forwarded_from=EXCLUDED.forwarded_from,
        raw_hash=EXCLUDED.raw_hash,raw=EXCLUDED.raw,collected_at=EXCLUDED.collected_at,updated_at=now()
        WHERE EXCLUDED.collected_at >= posts.collected_at RETURNING id""",
        (source["id"], post.message_id, post.url, post.published_at, post.text, post.forwarded_from, supplied_hash, Jsonb(post.raw), post.collected_at)).fetchone()
    if row is None:
        row = conn.execute("SELECT id FROM posts WHERE source_id=%s AND message_id=%s", (source["id"], post.message_id)).fetchone()
    post_id = row["id"]
    version = conn.execute("""INSERT INTO post_versions(post_id,content_hash,payload,observed_at) VALUES (%s,%s,%s,%s)
        ON CONFLICT(post_id,content_hash) DO NOTHING RETURNING id""", (post_id, digest, Jsonb(payload), post.collected_at)).fetchone()
    for link in post.links:
        try:
            url = canonical_url(link)
        except ValueError:
            continue
        conn.execute("INSERT INTO post_links(post_id,url) VALUES (%s,%s) ON CONFLICT DO NOTHING", (post_id, url))
    for media in post.media:
        conn.execute("INSERT INTO post_media(post_id,content_hash,metadata) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (post_id, stable_hash(media), Jsonb(media)))
    for candidate in extract_candidates(post):
        conn.execute("""INSERT INTO extraction_candidates(post_id,version_hash,candidate_hash,kind,name,url,excerpt)
            VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (post_id, digest, candidate["candidate_hash"], candidate["kind"], candidate["name"], candidate["url"], candidate["excerpt"]))
        if candidate["url"]:
            resource = conn.execute("SELECT resource_id FROM resource_urls WHERE url=%s", (candidate["url"],)).fetchone()
            if resource:
                add_provenance(conn, resource["resource_id"], {"source_url": post.source_url or f"https://t.me/{post.source_handle}", "post_url": post.url, "message_id": post.message_id}, post_id)
    conn.execute("""UPDATE resource_provenance SET post_id=%s WHERE post_id IS NULL
        AND ((post_url IS NOT NULL AND post_url=%s) OR (source_url=%s AND message_id=%s))""",
        (post_id, post.url, post.source_url or f"https://t.me/{post.source_handle}", post.message_id))
    conn.execute("""INSERT INTO source_cursors(source_id,method,cursor) VALUES (%s,'ingest',%s)
        ON CONFLICT(source_id,method) DO UPDATE SET cursor=source_cursors.cursor || EXCLUDED.cursor,updated_at=now()""",
        (source["id"], Jsonb({"last_ingested_message_id": post.message_id, "last_ingested_at": post.collected_at.isoformat(), "history_complete": False})))
    return {"id": post_id, "new_version": bool(version), "source_id": source["id"]}


def add_provenance(conn, resource_id, provenance, post_id=None):
    data = {key: str(provenance[key]) if provenance.get(key) is not None else None for key in ("source_url", "post_url", "message_id")}
    if post_id is None:
        post = conn.execute("""SELECT p.id FROM posts p JOIN sources s ON s.id=p.source_id
            WHERE (p.url=%s AND %s::text IS NOT NULL) OR (s.url=%s AND p.message_id=%s) ORDER BY p.id LIMIT 1""",
            (data["post_url"], data["post_url"], data["source_url"], data["message_id"])).fetchone()
        post_id = post["id"] if post else None
    conn.execute("""INSERT INTO resource_provenance(resource_id,source_url,post_url,message_id,post_id,provenance_hash)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(resource_id,provenance_hash) DO UPDATE SET
        post_id=coalesce(resource_provenance.post_id,EXCLUDED.post_id)""",
        (resource_id, data["source_url"], data["post_url"], data["message_id"], post_id, stable_hash(data)))


def ingest_resource(conn, resource: ResourceImport):
    # Serializes alias reconciliation across repository and official identities.
    conn.execute("SELECT pg_advisory_xact_lock(824019733)")
    payload = resource.model_dump(mode="json")
    digest = stable_hash(payload)
    urls = sorted({u for u in (resource.official_url, resource.repository_url) if u})
    identity = "url:" + urls[0] if urls else "name:" + resource.name.strip().casefold()
    matches = conn.execute("SELECT DISTINCT resource_id FROM resource_urls WHERE url=ANY(%s)", (urls,)).fetchall() if urls else []
    if len(matches) > 1:
        raise ValueError("Conflicting identities: URLs belong to different resources; manual merge required")
    row = conn.execute("SELECT * FROM resources WHERE id=%s", (matches[0]["resource_id"],)).fetchone() if matches else conn.execute("SELECT * FROM resources WHERE identity_key=%s", (identity,)).fetchone()
    if row and conn.execute("SELECT 1 FROM resource_imports WHERE resource_id=%s AND content_hash=%s", (row["id"], digest)).fetchone():
        return {"id": row["id"], "created": False, "changed": False}
    created = row is None
    if created:
        row = conn.execute("""INSERT INTO resources(identity_key,name,official_url,repository_url,resource_type,description,decision,limitations)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (identity, resource.name.strip(), resource.official_url, resource.repository_url, resource.resource_type, resource.description, resource.decision, Jsonb(resource.limitations))).fetchone()
    else:
        conn.execute("""UPDATE resources SET name=%s,official_url=coalesce(%s,official_url),repository_url=coalesce(%s,repository_url),
            resource_type=coalesce(%s,resource_type),description=coalesce(%s,description),decision=coalesce(%s,decision),limitations=%s,updated_at=now() WHERE id=%s""",
            (resource.name.strip(), resource.official_url, resource.repository_url, resource.resource_type, resource.description, resource.decision, Jsonb(resource.limitations), row["id"]))
    rid = row["id"]
    for role, url in (("official", resource.official_url), ("repository", resource.repository_url)):
        if url:
            conn.execute("INSERT INTO resource_urls(url,resource_id,role) VALUES (%s,%s,%s) ON CONFLICT(url) DO NOTHING", (url, rid, role))
    for field in ("name", "official_url", "repository_url", "resource_type", "description", "verification_status", "decision", "limitations"):
        value = getattr(resource, field)
        if value is not None:
            add_assertion(conn, rid, field, value)
    for table, relation, column, values in (("capabilities", "resource_capabilities", "capability_id", resource.capabilities), ("integrations", "resource_integrations", "integration_id", resource.integrations)):
        for value in values:
            label = value if isinstance(value, str) else value.get("name") or value.get("type") or value.get("label")
            if not label:
                add_assertion(conn, rid, table, value)
                continue
            label = str(label).strip().casefold()
            if not label:
                continue
            item = conn.execute(f"INSERT INTO {table}(name) VALUES (%s) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id", (label,)).fetchone()
            conn.execute(f"INSERT INTO {relation}(resource_id,{column}) VALUES (%s,%s) ON CONFLICT DO NOTHING", (rid, item["id"]))
            add_assertion(conn, rid, table, value)
    for claim in resource.claims:
        add_assertion(conn, rid, claim.field, claim.value, claim.evidence_url, claim.checked_at)
    if resource.pricing:
        price = resource.pricing
        conn.execute("""INSERT INTO pricing_snapshots(resource_id,category,details,evidence_url,checked_at,snapshot_hash)
            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (rid, price.get("category"), text_value(price.get("details")), price.get("evidence_url"), price.get("checked_at"), stable_hash(price)))
        add_assertion(conn, rid, "pricing", price, price.get("evidence_url"), price.get("checked_at"))
    if resource.license:
        license = resource.license
        conn.execute("""INSERT INTO license_evidence(resource_id,spdx,details,evidence_url,checked_at,snapshot_hash)
            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
            (rid, license.get("spdx"), text_value(license.get("details")), license.get("evidence_url"), license.get("checked_at"), stable_hash(license)))
        add_assertion(conn, rid, "license", license, license.get("evidence_url"), license.get("checked_at"))
    for provenance in resource.provenance:
        add_provenance(conn, rid, provenance)
    # Back-link already ingested exact URL candidates, but never mark heuristics complete.
    for post in conn.execute("""SELECT DISTINCT p.id,p.url,p.message_id,s.url AS source_url FROM extraction_candidates e
        JOIN posts p ON e.post_id=p.id JOIN sources s ON s.id=p.source_id WHERE e.url=ANY(%s)""", (urls,)).fetchall():
        add_provenance(conn, rid, {"source_url": post["source_url"], "post_url": post["url"], "message_id": post["message_id"]}, post["id"])
    conn.execute("INSERT INTO resource_imports(resource_id,content_hash,payload) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING", (rid, digest, Jsonb(payload)))
    return {"id": rid, "created": created, "changed": True}


def ingest_coverage(conn, coverage):
    handle = coverage.get("handle", "").lstrip("@").lower()
    from .models import handle_name
    handle = handle_name(handle)
    method = coverage.get("method") or "unknown"
    observed = coverage.get("observed_at") or utcnow()
    source = conn.execute("INSERT INTO sources(handle,url) VALUES (%s,%s) ON CONFLICT(handle) DO UPDATE SET updated_at=now() RETURNING id", (handle, f"https://t.me/{handle}")).fetchone()
    conn.execute("""INSERT INTO collection_runs(source_id,method,coverage_hash,coverage,observed_at) VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING""", (source["id"], method, stable_hash(coverage), Jsonb(json_value(coverage)), observed))
    cursor = {"earliest_id": coverage.get("earliest_id"), "latest_id": coverage.get("latest_id"),
        "history_boundary_reached": coverage.get("corpus_history_boundary_reached", coverage.get("history_boundary_reached", False)),
        "current_scan_boundary_reached": coverage.get("history_boundary_reached", False), "completeness": coverage.get("completeness", "blocked"),
        "next_before": coverage.get("next_before"), "not_before": coverage.get("not_before"),
        "stop_reason": coverage.get("stop_reason"), "state_file": coverage.get("state_file"), "observed_at": str(observed)}
    conn.execute("""INSERT INTO source_cursors(source_id,method,cursor) VALUES (%s,%s,%s)
        ON CONFLICT(source_id,method) DO UPDATE SET cursor=EXCLUDED.cursor,updated_at=now()""", (source["id"], method, Jsonb(cursor)))
    return source["id"]


def iter_records(path, kind):
    path = Path(path)
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            data = data.get(kind, data.get("resources", [data]))
        if not isinstance(data, list):
            raise ValueError("JSON import must contain a list or a resource object")
        yield from data
    else:
        with path.open(encoding="utf-8") as stream:
            for number, line in enumerate(stream, 1):
                if line.strip():
                    try:
                        yield json.loads(line)
                    except json.JSONDecodeError as error:
                        raise ValueError(f"Invalid JSONL at line {number}") from error


def ingest_file(conn, path, kind):
    count, changes, ids = 0, 0, []
    for record in iter_records(path, kind):
        result = ingest_post(conn, PostImport.model_validate(record)) if kind == "posts" else ingest_resource(conn, ResourceImport.model_validate(record))
        count += 1
        changes += int(result.get("new_version", result.get("changed", False)))
        ids.append(result["id"])
    return {"records": count, "changes": changes, "ids": sorted(set(ids))}
