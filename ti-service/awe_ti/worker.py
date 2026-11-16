import json
import signal
import time
from .db import connect
from .queue import claim, complete, schedule_sources, validate_job
from .adapters import adapter_for
from .ingest import ingest_file, ingest_coverage
from .verification import verify_resource
from .intelligence import normalize_candidates, discover_sources


def execute_job(job, database_url=None):
    payload = validate_job(job["kind"], job["payload"])
    if job["kind"] == "verify_resource":
        return verify_resource(payload["resource_id"], database_url)
    with connect(database_url) as conn:
        source = conn.execute("SELECT collection_enabled FROM sources WHERE handle=%s", (payload["handle"],)).fetchone()
    if not source or not source["collection_enabled"]:
        raise ValueError("Source no longer enrolled")
    output = adapter_for(payload["method"]).collect(payload)
    if not output.posts_path.is_file() or not output.coverage_path.is_file():
        raise RuntimeError("Collector output incomplete")
    coverage = json.loads(output.coverage_path.read_text(encoding="utf-8"))
    if coverage.get("handle", "").lstrip("@").lower() != payload["handle"]:
        raise RuntimeError("Collector output source mismatch")
    with connect(database_url) as conn:
        imported = ingest_file(conn, output.posts_path, "posts")
        snapshots = None
        if output.snapshots_path and output.snapshots_path.is_file():
            snapshots = ingest_file(conn, output.snapshots_path, "posts")
        ingest_coverage(conn, coverage)
        normalized = normalize_candidates(conn)
        discovered_sources = discover_sources(conn)
    return {"import": imported, "snapshot_import": snapshots, "coverage": coverage, "collector_returncode": output.returncode,
        "normalization": normalized, "source_discovery": discovered_sources,
        "semantic_extraction": "exact_registry_links_resolved_other_heuristic_candidates_pending"}


def worker_once(database_url=None, schedule=True):
    with connect(database_url) as conn:
        if schedule:
            schedule_sources(conn)
        job = claim(conn)
    if not job:
        return {"state": "idle"}
    try:
        result = execute_job(job, database_url)
        with connect(database_url) as conn:
            owned = complete(conn, job, result)
        return {"state": "succeeded" if owned else "lease_lost", "job_id": job["id"], "result": result}
    except Exception as error:
        # Exception messages from network/libs may contain tokens; store class only.
        with connect(database_url) as conn:
            complete(conn, job, error=type(error).__name__)
        return {"state": "retry_or_failed", "job_id": job["id"], "error_type": type(error).__name__}


def run_worker(database_url=None, poll_seconds=10):
    stopping = False
    def stop(*_):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while not stopping:
        try:
            result = worker_once(database_url)
            print(json.dumps({k: v for k, v in result.items() if k != "result"}), flush=True)
        except Exception as error:
            print(json.dumps({"state": "database_or_worker_error", "error_type": type(error).__name__}), flush=True)
        if not stopping:
            time.sleep(poll_seconds)
