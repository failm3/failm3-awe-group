import re
from urllib.parse import urlsplit
from psycopg.types.json import Jsonb
from .db import connect
from .config import Settings
from .network import safe_fetch
from .models import utcnow, stable_hash
from .ingest import add_assertion


def github_repository(url):
    if not url:
        return None
    parsed = urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname != "github.com" or parsed.query or parsed.fragment:
        return None
    parts = parsed.path.strip("/").removesuffix(".git").split("/")
    if len(parts) != 2 or not all(re.fullmatch(r"[A-Za-z0-9_.-]+", p) and p not in {".", ".."} for p in parts):
        return None
    return "/".join(parts)


def log_run(conn, resource_id, method, url, outcome, status=None, details=None):
    return conn.execute("""INSERT INTO verification_runs(resource_id,method,target_url,outcome,http_status,details)
        VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""", (resource_id, method, url, outcome, status, Jsonb(details or {}))).fetchone()["id"]


def verify_resource(resource_id, database_url=None, fetcher=safe_fetch):
    with connect(database_url) as conn:
        resource = conn.execute("SELECT * FROM resources WHERE id=%s", (resource_id,)).fetchone()
    if not resource:
        raise ValueError("Resource not found")
    result = {"resource_id": resource_id, "reachability": None, "github_metadata": None, "license": None}
    if resource["official_url"]:
        try:
            response = fetcher(resource["official_url"])
            outcome = "reachable" if 200 <= response.status < 400 else "http_error"
            with connect(database_url) as conn:
                log_run(conn, resource_id, "url_reachability", resource["official_url"], outcome, response.status,
                    {"final_url": response.url, "redirects": response.redirects, "not_a_functional_test": True})
            result["reachability"] = outcome
        except Exception as error:
            with connect(database_url) as conn:
                log_run(conn, resource_id, "url_reachability", resource["official_url"], "blocked_or_unreachable", details={"error_type": type(error).__name__, "not_a_functional_test": True})
            result["reachability"] = "blocked_or_unreachable"
    repo = github_repository(resource["repository_url"])
    if not repo:
        return result
    endpoint = f"https://api.github.com/repos/{repo}"
    token = Settings.from_env().github_token
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        response = fetcher(endpoint, headers=headers)
        metadata = response.json() if response.status == 200 else {}
        if not isinstance(metadata, dict) or str(metadata.get("full_name", "")).casefold() != repo.casefold():
            metadata = {}
        confirmed = response.status == 200 and bool(metadata)
        now = utcnow()
        with connect(database_url) as conn:
            log_run(conn, resource_id, "github_api_metadata", endpoint, "metadata_observed" if confirmed else "http_error_or_mismatch", response.status,
                {"official_api": True, "does_not_prove_vendor_ownership": True, "not_a_functional_test": True})
            if confirmed:
                for field in ("full_name", "description", "homepage", "archived", "disabled", "default_branch", "pushed_at", "stargazers_count", "forks_count"):
                    if field in metadata:
                        add_assertion(conn, resource_id, "github." + field, metadata[field], endpoint, now, "github_api_metadata")
                # Source-hosting evidence is distinct from a software license.
                source = {"repository_url": metadata.get("html_url"), "default_branch": metadata.get("default_branch"),
                    "contents_url": metadata.get("contents_url"), "git_url": metadata.get("git_url"), "code_was_not_executed": True}
                add_assertion(conn, resource_id, "source_hosting", source, endpoint, now, "github_source_metadata")
                conn.execute("UPDATE resources SET verification_status='official_metadata_observed',updated_at=now() WHERE id=%s AND verification_status='research_only'", (resource_id,))
        result["github_metadata"] = "observed" if confirmed else "unavailable"
        if not confirmed:
            return result
    except Exception as error:
        with connect(database_url) as conn:
            log_run(conn, resource_id, "github_api_metadata", endpoint, "blocked_or_unreachable", details={"error_type": type(error).__name__})
        result["github_metadata"] = "unavailable"
        return result
    license_endpoint = endpoint + "/license"
    try:
        response = fetcher(license_endpoint, headers=headers)
        data = response.json() if response.status == 200 else {}
        license_data = data.get("license") or {} if isinstance(data, dict) else {}
        spdx = license_data.get("spdx_id")
        if spdx in {"NOASSERTION", "OTHER"}:
            spdx = None
        now = utcnow()
        with connect(database_url) as conn:
            observed = response.status == 200 and bool(data)
            log_run(conn, resource_id, "github_api_license", license_endpoint, "license_file_observed" if observed else "license_unknown", response.status,
                {"separate_from_source_hosting": True, "legal_approval_not_implied": True})
            if observed:
                # Do not save or decode source/license code content; metadata suffices.
                value = {"spdx": spdx, "name": license_data.get("name"), "path": data.get("path"), "html_url": data.get("html_url"), "sha": data.get("sha")}
                add_assertion(conn, resource_id, "license", value, license_endpoint, now, "github_api_license")
                conn.execute("""INSERT INTO license_evidence(resource_id,spdx,details,evidence_url,checked_at,evidence_kind,snapshot_hash)
                    VALUES (%s,%s,%s,%s,%s,'github_api_license',%s) ON CONFLICT DO NOTHING""",
                    (resource_id, spdx, license_data.get("name"), license_endpoint, now, stable_hash(value)))
        result["license"] = "observed" if response.status == 200 else "unknown"
    except Exception as error:
        with connect(database_url) as conn:
            log_run(conn, resource_id, "github_api_license", license_endpoint, "license_unknown", details={"error_type": type(error).__name__})
        result["license"] = "unknown"
    release_endpoint = endpoint + '/releases?per_page=5'
    try:
        response = fetcher(release_endpoint, headers=headers)
        releases = response.json() if response.status == 200 else None
        valid = isinstance(releases, list)
        with connect(database_url) as conn:
            log_run(conn, resource_id, 'github_recent_releases', release_endpoint, 'recent_release_metadata_observed' if valid else 'release_metadata_unavailable', response.status,
                {'maximum_recent_releases':5,'complete_release_history':False,'code_or_assets_downloaded':False})
            if valid:
                for release in releases[:5]:
                    tag = release.get('tag_name') if isinstance(release, dict) else None
                    if not isinstance(tag, str) or not tag:
                        continue
                    observed = {key:release.get(key) for key in ('tag_name','name','published_at','created_at','prerelease','draft','html_url')}
                    conn.execute('''INSERT INTO resource_versions(resource_id,version,evidence_url,metadata) VALUES (%s,%s,%s,%s)
                        ON CONFLICT(resource_id,version,evidence_url) DO UPDATE SET metadata=EXCLUDED.metadata,observed_at=now()''',
                        (resource_id,tag,release_endpoint,Jsonb(observed)))
                    add_assertion(conn,resource_id,'github.release_observed',observed,release_endpoint,utcnow(),'github_release_metadata')
        result['recent_releases'] = 'observed' if valid else 'unavailable'
    except Exception as error:
        with connect(database_url) as conn:
            log_run(conn,resource_id,'github_recent_releases',release_endpoint,'release_metadata_unavailable',details={'error_type':type(error).__name__})
        result['recent_releases']='unavailable'
    return result
