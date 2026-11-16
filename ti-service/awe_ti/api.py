"""Private API: Bearer tokens are environment-only, never persisted or returned."""
from contextlib import asynccontextmanager
import hmac
from typing import Any
import psycopg
from fastapi import FastAPI, Depends, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from .config import Settings
from .db import connect, migrate
from .models import ResourceImport, PostImport, SourceRegistration, LiveTestInput
from .ingest import ingest_post, ingest_resource, add_provenance
from .registry import list_resources, resource_detail, record_live_test, approve_resource, transition_stage, acknowledge_integration
from .queue import enqueue
from .sources import register_source
from .exporting import integration_manifest


class JobInput(BaseModel):
    kind: str
    payload: dict[str, Any]
    dedup_key: str | None = None


class ApprovalInput(BaseModel):
    approved: bool
    actor: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    live_test_id: int | None = None


class StageInput(BaseModel):
    stage: str
    actor: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    evidence_url: str | None = None
    evidence_hash: str | None = None


class CandidateResolution(BaseModel):
    resource_id: int | None = None
    discard: bool = False


def require_admin(request: Request):
    if getattr(request.state, 'role', None) != 'admin':
        raise HTTPException(status_code=403, detail='Administrative token required')


def create_app(database_url=None, initialize=True):
    @asynccontextmanager
    async def lifespan(app):
        if initialize:
            migrate(database_url)
        yield
    app = FastAPI(title='AWE Tool Intelligence — private registry', version='0.1.0', lifespan=lifespan)

    @app.middleware('http')
    async def authentication(request, call_next):
        settings = Settings.from_env()
        if not settings.api_token:
            return JSONResponse({'detail': 'API_TOKEN must be configured'}, status_code=503)
        header = request.headers.get('Authorization', '')
        token = header[7:] if header.startswith('Bearer ') else ''
        def equal(expected):
            return bool(expected) and hmac.compare_digest(token.encode(), expected.encode())
        if equal(settings.admin_api_token):
            request.state.role = 'admin'
        elif equal(settings.api_token):
            request.state.role = 'reader'
        else:
            return JSONResponse({'detail': 'Authentication required'}, status_code=401, headers={'WWW-Authenticate': 'Bearer'})
        try:
            length = int(request.headers.get('content-length', '0') or 0)
        except ValueError:
            return JSONResponse({'detail': 'Invalid Content-Length'}, status_code=400)
        if length < 0:
            return JSONResponse({'detail': 'Invalid Content-Length'}, status_code=400)
        if length > 5_000_000:
            return JSONResponse({'detail': 'Request body too large'}, status_code=413)
        if request.method in {'POST', 'PUT', 'PATCH'}:
            body = bytearray()
            async for chunk in request.stream():
                if len(body) + len(chunk) > 5_000_000:
                    return JSONResponse({'detail': 'Request body too large'}, status_code=413)
                body.extend(chunk)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        return response

    @app.exception_handler(ValueError)
    async def invalid_input(request, error):
        return JSONResponse({'detail': str(error)}, status_code=422)

    @app.exception_handler(psycopg.Error)
    async def database_error(request, error):
        return JSONResponse({'detail': 'Database operation unavailable'}, status_code=503)

    @app.get('/health')
    def health():
        with connect(database_url) as conn:
            conn.execute('SELECT 1')
        return {'status': 'ok', 'database': 'reachable', 'deployment_claim': False}

    @app.get('/v1/resources')
    def resources(q: str | None = Query(None, max_length=500), limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), stage: str | None = None, resource_type: str | None = None, semantic: bool = False, approved_only: bool = False):
        with connect(database_url) as conn:
            return list_resources(conn, q, limit, offset, stage, resource_type, semantic, approved_only)

    @app.get('/v1/search')
    def search(q: str = Query(..., min_length=1, max_length=500), limit: int = Query(10, ge=1, le=200), semantic: bool = False, approved_only: bool = False):
        with connect(database_url) as conn:
            result = list_resources(conn, q, limit, semantic=semantic, approved_only=approved_only)
        result['not_a_recommendation_to_execute'] = True
        return result

    @app.get('/v1/metrics')
    def metrics():
        with connect(database_url) as conn:
            return {'schema_version':'1.0',
                'resources_by_stage':conn.execute('SELECT stage,count(*) AS count FROM resources GROUP BY stage ORDER BY stage').fetchall(),
                'queue_by_state':conn.execute('SELECT state,count(*) AS count FROM queue_jobs GROUP BY state ORDER BY state').fetchall(),
                'candidate_states':conn.execute('SELECT kind,state,count(*) AS count FROM extraction_candidates GROUP BY kind,state ORDER BY kind,state').fetchall(),
                'source_observation_lag_seconds':conn.execute('SELECT s.handle,extract(epoch FROM now()-max(p.collected_at)) AS lag_seconds,count(p.id) AS posts FROM sources s LEFT JOIN posts p ON p.source_id=s.id GROUP BY s.id ORDER BY s.id').fetchall(),
                'verified_runs_by_outcome':conn.execute('SELECT method,outcome,count(*) AS count FROM verification_runs GROUP BY method,outcome ORDER BY method,outcome').fetchall(),
                'not_a_24_7_uptime_claim':True}

    @app.get('/v1/resources/{rid}')
    def resource(rid: int):
        with connect(database_url) as conn:
            result = resource_detail(conn, rid)
        if not result:
            raise HTTPException(404, 'Resource not found')
        return result

    @app.post('/v1/import/posts', dependencies=[Depends(require_admin)])
    def import_posts(posts: list[PostImport]):
        if len(posts) > 1000:
            raise HTTPException(413, 'At most 1000 records per request')
        with connect(database_url) as conn:
            return {'results': [ingest_post(conn, p) for p in posts]}

    @app.post('/v1/import/resources', dependencies=[Depends(require_admin)])
    def import_resources(records: list[ResourceImport]):
        if len(records) > 1000:
            raise HTTPException(413, 'At most 1000 records per request')
        with connect(database_url) as conn:
            return {'results': [ingest_resource(conn, r) for r in records]}

    @app.get('/v1/posts')
    def posts(request: Request, source_handle: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), include_raw: bool = False):
        if include_raw:
            require_admin(request)
        columns = 'p.*' if include_raw else 'p.id,p.source_id,p.message_id,p.url,p.published_at,p.text,p.forwarded_from,p.raw_hash,p.collected_at,p.updated_at'
        with connect(database_url) as conn:
            return {'items': conn.execute('SELECT ' + columns + ',s.handle FROM posts p JOIN sources s ON s.id=p.source_id WHERE (%s::text IS NULL OR s.handle=%s) ORDER BY p.id LIMIT %s OFFSET %s', (source_handle, source_handle, limit, offset)).fetchall()}

    @app.get('/v1/posts/{pid}/versions', dependencies=[Depends(require_admin)])
    def post_versions(pid: int):
        with connect(database_url) as conn:
            return {'items': conn.execute('SELECT * FROM post_versions WHERE post_id=%s ORDER BY id', (pid,)).fetchall()}

    @app.get('/v1/sources')
    def sources():
        with connect(database_url) as conn:
            return {'items': conn.execute('SELECT * FROM sources ORDER BY id').fetchall()}

    @app.post('/v1/sources', dependencies=[Depends(require_admin)])
    def add_source(source: SourceRegistration):
        with connect(database_url) as conn:
            return register_source(conn, source)

    @app.get('/v1/sources/{sid}/coverage')
    def coverage(sid: int):
        with connect(database_url) as conn:
            return {'runs': conn.execute('SELECT * FROM collection_runs WHERE source_id=%s ORDER BY observed_at DESC LIMIT 100', (sid,)).fetchall(),
                'cursors': conn.execute('SELECT * FROM source_cursors WHERE source_id=%s ORDER BY method', (sid,)).fetchall()}

    @app.get('/v1/candidates')
    def candidates(state: str = 'pending', limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0)):
        with connect(database_url) as conn:
            return {'items': conn.execute('SELECT * FROM extraction_candidates WHERE state=%s ORDER BY id LIMIT %s OFFSET %s', (state, limit, offset)).fetchall(), 'extraction_method': 'heuristic_not_complete_semantic'}

    @app.post('/v1/candidates/{cid}/resolve', dependencies=[Depends(require_admin)])
    def resolve(cid: int, resolution: CandidateResolution):
        if resolution.discard == bool(resolution.resource_id):
            raise ValueError('Choose resource_id OR discard')
        with connect(database_url) as conn:
            candidate = conn.execute('SELECT * FROM extraction_candidates WHERE id=%s FOR UPDATE', (cid,)).fetchone()
            if not candidate:
                raise HTTPException(404, 'Candidate not found')
            if resolution.resource_id:
                if not conn.execute('SELECT 1 FROM resources WHERE id=%s', (resolution.resource_id,)).fetchone():
                    raise ValueError('Resource not found')
                post = conn.execute('SELECT p.*,s.url AS source_url FROM posts p JOIN sources s ON s.id=p.source_id WHERE p.id=%s', (candidate['post_id'],)).fetchone()
                add_provenance(conn, resolution.resource_id, {'source_url': post['source_url'], 'post_url': post['url'], 'message_id': post['message_id']}, post['id'])
            state = 'discarded' if resolution.discard else 'resolved'
            conn.execute('UPDATE extraction_candidates SET state=%s,resource_id=%s WHERE id=%s', (state, resolution.resource_id, cid))
            return {'id': cid, 'state': state}

    @app.get('/v1/jobs')
    def jobs(limit: int = Query(50, ge=1, le=200)):
        with connect(database_url) as conn:
            return {'items': conn.execute('SELECT id,kind,payload,state,attempts,max_attempts,available_at,lease_until,result,last_error,created_at,updated_at FROM queue_jobs ORDER BY id DESC LIMIT %s', (limit,)).fetchall()}

    @app.post('/v1/jobs', dependencies=[Depends(require_admin)])
    def add_job(job: JobInput):
        with connect(database_url) as conn:
            row = enqueue(conn, job.kind, job.payload, job.dedup_key)
        row.pop('lease_token', None)
        return row

    @app.post('/v1/resources/{rid}/stage', dependencies=[Depends(require_admin)])
    def stage(rid: int, request: StageInput):
        with connect(database_url) as conn:
            return transition_stage(conn, rid, request.stage, request.actor, request.reason, request.evidence_url, request.evidence_hash)

    @app.post('/v1/resources/{rid}/live-tests', dependencies=[Depends(require_admin)])
    def live_test(rid: int, test: LiveTestInput):
        with connect(database_url) as conn:
            return record_live_test(conn, rid, test)

    @app.post('/v1/resources/{rid}/approvals', dependencies=[Depends(require_admin)])
    def approval(rid: int, request: ApprovalInput):
        with connect(database_url) as conn:
            return approve_resource(conn, rid, request.approved, request.actor, request.reason, request.live_test_id)

    @app.post('/v1/resources/{rid}/integration-ack', dependencies=[Depends(require_admin)])
    def integration(rid: int, request: StageInput):
        if not request.evidence_url:
            raise ValueError('Integration evidence URL required')
        with connect(database_url) as conn:
            return acknowledge_integration(conn, rid, request.actor, request.reason, request.evidence_url, request.evidence_hash)

    @app.get('/v1/exports/integration', dependencies=[Depends(require_admin)])
    def export_integration():
        with connect(database_url) as conn:
            return integration_manifest(conn)

    return app


app = create_app()
