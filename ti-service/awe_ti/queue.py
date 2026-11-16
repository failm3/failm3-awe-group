import uuid
from datetime import timedelta
from psycopg.types.json import Jsonb
from .models import stable_hash, utcnow, handle_name
from .config import Settings


def validate_job(kind, payload):
    if kind == "verify_resource":
        rid = int(payload.get("resource_id", 0))
        if rid < 1:
            raise ValueError("resource_id required")
        return {"resource_id": rid}
    if kind == "collect":
        handle = handle_name(payload.get("handle", ""))
        method = payload.get("method", "public_web")
        if method not in {"public_web", "authorized_api"}:
            raise ValueError("Unsupported trusted collector adapter")
        pages = int(payload.get("max_pages", 5))
        if not 1 <= pages <= 2000:
            raise ValueError("max_pages must be 1..2000")
        return {"handle": handle, "method": method, "max_pages": pages, "resume": bool(payload.get("resume", False))}
    raise ValueError("Unknown job kind")


def enqueue(conn, kind, payload, dedup_key=None):
    payload = validate_job(kind, payload)
    if kind == "verify_resource" and not conn.execute("SELECT 1 FROM resources WHERE id=%s", (payload["resource_id"],)).fetchone():
        raise ValueError("Resource not found")
    if kind == "collect":
        source = conn.execute("SELECT collection_enabled,metadata FROM sources WHERE handle=%s", (payload["handle"],)).fetchone()
        if not source or not source["collection_enabled"]:
            raise ValueError("Source must be explicitly enrolled before collection")
        if source["metadata"].get("method", "public_web") != payload["method"]:
            raise ValueError("Job adapter must match registered source method")
    key = dedup_key or kind + ":" + stable_hash(payload)
    if len(key) > 256:
        raise ValueError("dedup_key too long")
    return conn.execute("""INSERT INTO queue_jobs(kind,payload,dedup_key) VALUES (%s,%s,%s)
        ON CONFLICT(dedup_key) DO UPDATE SET dedup_key=EXCLUDED.dedup_key RETURNING *""", (kind, Jsonb(payload), key)).fetchone()


def claim(conn, lease_seconds=None):
    lease_seconds = lease_seconds or Settings.from_env().collector_timeout + 120
    # Expired leases are eligible again; attempts are bounded even after crashes.
    conn.execute("""UPDATE queue_jobs SET state='failed',lease_token=NULL,lease_until=NULL,last_error='Lease expired after maximum attempts',updated_at=now()
        WHERE state='running' AND lease_until < now() AND attempts >= max_attempts""")
    token = uuid.uuid4().hex
    row = conn.execute("""WITH candidate AS (
        SELECT j.id FROM queue_jobs j WHERE
        ((j.state='pending' AND j.available_at <= now()) OR (j.state='running' AND j.lease_until < now()))
        AND j.attempts < j.max_attempts
        AND (j.kind <> 'collect' OR NOT EXISTS (
            SELECT 1 FROM queue_jobs k WHERE k.state='running' AND k.lease_until >= now()
            AND k.kind='collect' AND k.payload->>'handle'=j.payload->>'handle' AND k.id<>j.id))
        ORDER BY j.available_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1)
        UPDATE queue_jobs j SET state='running',attempts=j.attempts+1,lease_token=%s,
        lease_until=now() + %s * interval '1 second',updated_at=now()
        FROM candidate c WHERE j.id=c.id RETURNING j.*""", (token, lease_seconds)).fetchone()
    return row


def complete(conn, job, result=None, error=None):
    if error is None:
        row = conn.execute("""UPDATE queue_jobs SET state='succeeded',result=%s,last_error=NULL,lease_token=NULL,lease_until=NULL,updated_at=now()
            WHERE id=%s AND lease_token=%s RETURNING id""", (Jsonb(result or {}), job["id"], job["lease_token"])).fetchone()
    else:
        delay = min(3600, 30 * (2 ** job["attempts"]))
        row = conn.execute("""UPDATE queue_jobs SET state=CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
            last_error=%s,available_at=now() + %s * interval '1 second',lease_token=NULL,lease_until=NULL,updated_at=now()
            WHERE id=%s AND lease_token=%s RETURNING id""", (str(error)[:300], delay, job["id"], job["lease_token"])).fetchone()
    return bool(row)


def schedule_sources(conn, interval_seconds=3600):
    conn.execute("SELECT pg_advisory_xact_lock(824019734)")
    now = utcnow()
    bucket = int(now.timestamp() // max(60, interval_seconds))
    jobs = []
    for source in conn.execute("SELECT * FROM sources WHERE collection_enabled=true ORDER BY id").fetchall():
        method = source["metadata"].get("method", "public_web")
        payload = {"handle": source["handle"], "method": method, "max_pages": 5, "resume": False}
        latest = conn.execute("SELECT created_at FROM queue_jobs WHERE kind='collect' AND payload->>'handle'=%s AND payload->>'resume'='false' ORDER BY created_at DESC LIMIT 1", (source["handle"],)).fetchone()
        if not latest or (now - latest["created_at"]).total_seconds() >= interval_seconds:
            jobs.append(enqueue(conn, "collect", payload, f"scheduled:recent:{source['id']}:{bucket}"))
        cursor = conn.execute("SELECT cursor FROM source_cursors WHERE source_id=%s AND method=%s", (source["id"], method)).fetchone()
        if cursor and not cursor["cursor"].get("history_boundary_reached", False) and cursor["cursor"].get("completeness") != "blocked":
            active = conn.execute("SELECT 1 FROM queue_jobs WHERE kind='collect' AND payload->>'handle'=%s AND state IN ('pending','running')", (source["handle"],)).fetchone()
            if not active:
                # Five-minute batches continue committed historical cursor; new
                # non-resume rescans periodically revisit edits at the head.
                history_bucket = int(now.timestamp() // 300)
                jobs.append(enqueue(conn, "collect", {**payload, "resume": True}, f"scheduled:history:{source['id']}:{history_bucket}"))
    return [job["id"] for job in jobs]
