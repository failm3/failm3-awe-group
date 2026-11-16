from datetime import timedelta
import re
from psycopg.types.json import Jsonb
from .models import LiveTestInput, stable_hash, utcnow
from .config import Settings

PIPELINE = ['DISCOVERED','SOURCE_VERIFIED','DOCUMENTED','INSTALLABLE','INSTALLED_IN_SANDBOX','LIVE_TESTED','APPROVED','INTEGRATED']
EXCEPTION_STAGES = {'BROKEN','DEPRECATED','BLOCKED','REQUIRES_AUTH','REQUIRES_APPROVAL','REJECTED'}
SYNONYMS = {
 'поиск': ['search'], 'семантический': ['semantic','embedding'], 'векторный': ['vector','embedding'],
 'эмбеддинги': ['embedding','embeddings'], 'модели': ['model'], 'агент': ['agent'],
 'парсинг': ['scraping','parser'], 'база': ['database'], 'очередь': ['queue'],
 'бесплатный': ['free'], 'локальный': ['local'], 'код': ['code'],
}


def resource_detail(conn, rid):
    resource = conn.execute("SELECT * FROM resources WHERE id=%s", (rid,)).fetchone()
    if not resource:
        return None
    for field, table in (("claims", "assertions"), ("pricing_history", "pricing_snapshots"), ("license_evidence", "license_evidence"),
        ("provenance", "resource_provenance"), ("verification_runs", "verification_runs"), ("live_tests", "live_tests"), ("approvals", "approvals"), ("stage_events", "stage_events"), ("versions", "resource_versions"), ("integration_specs", "integration_specs")):
        resource[field] = conn.execute(f"SELECT * FROM {table} WHERE resource_id=%s ORDER BY id", (rid,)).fetchall()
    for field, table, relation, column in (("capabilities", "capabilities", "resource_capabilities", "capability_id"), ("integrations", "integrations", "resource_integrations", "integration_id")):
        resource[field] = [row["name"] for row in conn.execute(f"SELECT c.name FROM {table} c JOIN {relation} r ON c.id=r.{column} WHERE r.resource_id=%s ORDER BY c.name", (rid,)).fetchall()]
    resource['approved_for_export'] = bool(export_eligibility(conn, rid)[0])
    return resource


def resource_fingerprint(conn, rid):
    resource = conn.execute("SELECT official_url,repository_url,resource_type FROM resources WHERE id=%s", (rid,)).fetchone()
    if not resource:
        raise ValueError('Resource not found')
    resource['integrations'] = [r['name'] for r in conn.execute('SELECT i.name FROM integrations i JOIN resource_integrations ri ON ri.integration_id=i.id WHERE ri.resource_id=%s ORDER BY i.name', (rid,)).fetchall()]
    resource['versions'] = [r['version'] for r in conn.execute('SELECT version FROM resource_versions WHERE resource_id=%s ORDER BY id', (rid,)).fetchall()]
    for key, table, column in [('integration_spec','integration_specs','spec_hash'),('pricing','pricing_snapshots','snapshot_hash'),('license','license_evidence','snapshot_hash')]:
        latest = conn.execute(f'SELECT {column} AS value FROM {table} WHERE resource_id=%s ORDER BY id DESC LIMIT 1', (rid,)).fetchone()
        resource[key] = latest['value'] if latest else None
    return stable_hash(resource)


def list_resources(conn, query=None, limit=50, offset=0, stage=None, resource_type=None, semantic=False, approved_only=False):
    limit = max(1, min(limit, 200))
    clauses, params = [], []
    if approved_only:
        ids = [r['id'] for r in conn.execute("SELECT id FROM resources WHERE stage IN ('APPROVED','INTEGRATED')").fetchall() if export_eligibility(conn, r['id'])[0]]
        clauses.append('r.id=ANY(%s)'); params.append(ids)
    if stage:
        clauses.append('r.stage=%s'); params.append(stage)
    if resource_type:
        clauses.append('r.resource_type=%s'); params.append(resource_type)
    base_where = ' AND '.join(clauses) or 'true'
    base = """SELECT r.*, coalesce((SELECT jsonb_agg(c.name ORDER BY c.name) FROM capabilities c JOIN resource_capabilities rc ON rc.capability_id=c.id WHERE rc.resource_id=r.id),'[]') AS capabilities,
        coalesce((SELECT jsonb_agg(i.name ORDER BY i.name) FROM integrations i JOIN resource_integrations ri ON ri.integration_id=i.id WHERE ri.resource_id=r.id),'[]') AS integrations FROM resources r"""
    if query and semantic:
        try:
            from .semantic import semantic_rank, SemanticUnavailable
            # Bounded baseline: documented first 5000 records, not global ANN.
            candidates = conn.execute(base + ' WHERE ' + base_where + ' ORDER BY r.id LIMIT 5000', params).fetchall()
            ranked = semantic_rank(query, candidates, limit=limit + offset)
            return {'items': ranked[offset:offset+limit], 'search_mode': 'semantic_local', 'candidate_limit': 5000, 'fallback_reason': None}
        except ImportError:
            fallback_reason = 'semantic_module_or_dependency_unavailable'
        except Exception as error:
            # Model/file/provider errors must not expose private filesystem or tokens.
            fallback_reason = 'semantic_unavailable:' + type(error).__name__
    else:
        fallback_reason = None
    if not query:
        items = conn.execute(base + ' WHERE ' + base_where + ' ORDER BY r.id LIMIT %s OFFSET %s', [*params, limit, offset]).fetchall()
        return {'items': items, 'search_mode': 'catalog', 'fallback_reason': fallback_reason}
    tokens = re.findall(r'[\w+.-]+', query.casefold())[:24]
    expanded = list(dict.fromkeys(tokens + [syn for token in tokens for syn in SYNONYMS.get(token, [])]))
    if not expanded:
        return {'items': [], 'search_mode': 'lexical_fallback', 'fallback_reason': fallback_reason}
    # Lexical term matching, NOT an embedding or semantic equivalence claim.
    terms = ['%' + token.replace('%', '\\%').replace('_', '\\_') + '%' for token in expanded]
    search_text = "lower(coalesce(r.name,'') || ' ' || coalesce(r.description,'') || ' ' || coalesce(r.resource_type,'') || ' ' || coalesce((SELECT string_agg(c.name,' ') FROM capabilities c JOIN resource_capabilities rc ON c.id=rc.capability_id WHERE rc.resource_id=r.id),'') || ' ' || coalesce((SELECT string_agg(i.name,' ') FROM integrations i JOIN resource_integrations ri ON i.id=ri.integration_id WHERE ri.resource_id=r.id),''))"
    sql = 'SELECT data.*, (SELECT count(*) FROM unnest(%s::text[]) term WHERE data.search_text LIKE term) AS lexical_score FROM (' + base.replace(' FROM resources r', ', ' + search_text + ' AS search_text FROM resources r') + ' WHERE ' + base_where + ') data WHERE data.search_text LIKE ANY(%s::text[]) ORDER BY lexical_score DESC,data.id LIMIT %s OFFSET %s'
    items = conn.execute(sql, [terms, *params, terms, limit, offset]).fetchall()
    for item in items:
        item.pop('search_text', None)
    return {'items': items, 'search_mode': 'lexical_fallback', 'expanded_terms': expanded, 'fallback_reason': fallback_reason}


def transition_stage(conn, rid, target, recorded_by, reason, evidence_url=None, evidence_hash=None, internal=False):
    row = conn.execute('SELECT stage FROM resources WHERE id=%s FOR UPDATE', (rid,)).fetchone()
    if not row:
        raise ValueError('Resource not found')
    old = row['stage']
    if target == old:
        return {'stage': old, 'changed': False}
    if target not in PIPELINE and target not in EXCEPTION_STAGES:
        raise ValueError('Unknown lifecycle stage')
    if not recorded_by or not reason:
        raise ValueError('Actor and reason required')
    if target in {'LIVE_TESTED','APPROVED','INTEGRATED'} and not internal:
        raise ValueError('Use live-test, approval, or integration acknowledgement endpoint')
    if target in PIPELINE:
        if old not in PIPELINE or PIPELINE.index(target) != PIPELINE.index(old) + 1:
            if not (old in EXCEPTION_STAGES and target == 'DISCOVERED'):
                raise ValueError('Forward lifecycle stages cannot be skipped')
        if target != 'DISCOVERED' and not evidence_url:
            raise ValueError('Explicit stage evidence required')
    if evidence_hash and not re.fullmatch(r'[a-fA-F0-9]{64}', evidence_hash):
        raise ValueError('Evidence hash must be SHA256')
    conn.execute('UPDATE resources SET stage=%s,updated_at=now() WHERE id=%s', (target, rid))
    conn.execute('INSERT INTO stage_events(resource_id,from_stage,to_stage,evidence_url,evidence_hash,recorded_by,reason) VALUES (%s,%s,%s,%s,%s,%s,%s)', (rid, old, target, evidence_url, evidence_hash, recorded_by, reason))
    return {'stage': target, 'changed': True}


def record_live_test(conn, rid, test: LiveTestInput):
    fingerprint = resource_fingerprint(conn, rid)
    stage = conn.execute('SELECT stage FROM resources WHERE id=%s FOR UPDATE', (rid,)).fetchone()['stage']
    row = conn.execute('''INSERT INTO live_tests(resource_id,test_name,result,evidence_url,evidence_hash,tested_at,recorded_by,notes,resource_fingerprint)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *''', (rid, test.test_name, test.result, test.evidence_url, test.evidence_hash.lower(), test.tested_at, test.recorded_by, test.notes, fingerprint)).fetchone()
    if test.result == 'passed':
        conn.execute("UPDATE resources SET verification_status='live_tested',updated_at=now() WHERE id=%s", (rid,))
        if stage == 'INSTALLED_IN_SANDBOX':
            transition_stage(conn, rid, 'LIVE_TESTED', test.recorded_by, test.test_name, test.evidence_url, test.evidence_hash, internal=True)
    elif test.result == 'failed':
        transition_stage(conn, rid, 'BROKEN', test.recorded_by, test.test_name, test.evidence_url, test.evidence_hash, internal=True)
    return row


def export_eligibility(conn, rid):
    resource = conn.execute('SELECT stage FROM resources WHERE id=%s', (rid,)).fetchone()
    if not resource or resource['stage'] not in {'APPROVED', 'INTEGRATED'}:
        return False, 'not_approved_stage'
    approval = conn.execute('SELECT * FROM approvals WHERE resource_id=%s ORDER BY id DESC LIMIT 1', (rid,)).fetchone()
    if not approval or not approval['approved']:
        return False, 'explicit_approval_missing_or_revoked'
    test = conn.execute('SELECT * FROM live_tests WHERE resource_id=%s ORDER BY tested_at DESC,id DESC LIMIT 1', (rid,)).fetchone()
    if not test or test['id'] != approval['live_test_id'] or test['result'] != 'passed':
        return False, 'latest_live_test_not_the_approved_pass'
    if test['tested_at'] > utcnow() or test['tested_at'] < utcnow() - timedelta(days=Settings.from_env().live_test_max_age_days):
        return False, 'live_evidence_stale'
    if test['resource_fingerprint'] != resource_fingerprint(conn, rid):
        return False, 'resource_configuration_changed'
    return True, None


def approve_resource(conn, rid, approved, actor, reason, live_test_id=None):
    resource = conn.execute('SELECT stage FROM resources WHERE id=%s FOR UPDATE', (rid,)).fetchone()
    if not resource:
        raise ValueError('Resource not found')
    if not actor or not reason:
        raise ValueError('Explicit actor and reason required')
    test = None
    if approved:
        test = conn.execute('SELECT * FROM live_tests WHERE id=%s AND resource_id=%s', (live_test_id, rid)).fetchone()
        latest = conn.execute('SELECT id FROM live_tests WHERE resource_id=%s ORDER BY tested_at DESC,id DESC LIMIT 1', (rid,)).fetchone()
        if not test or test['result'] != 'passed' or not latest or test['id'] != latest['id']:
            raise ValueError('Approval requires the latest passing live test for this resource')
        if test['tested_at'] < utcnow() - timedelta(days=Settings.from_env().live_test_max_age_days) or test['resource_fingerprint'] != resource_fingerprint(conn, rid):
            raise ValueError('Live evidence stale or configuration changed')
        if resource['stage'] != 'LIVE_TESTED':
            raise ValueError('Complete evidenced lifecycle through LIVE_TESTED before approval')
    row = conn.execute('INSERT INTO approvals(resource_id,approved,approved_by,reason,live_test_id) VALUES (%s,%s,%s,%s,%s) RETURNING *', (rid, approved, actor, reason, live_test_id if approved else None)).fetchone()
    if approved:
        transition_stage(conn, rid, 'APPROVED', actor, reason, test['evidence_url'], test['evidence_hash'], internal=True)
    elif resource['stage'] in {'APPROVED','INTEGRATED'}:
        transition_stage(conn, rid, 'REQUIRES_APPROVAL', actor, reason, internal=True)
    return row


def acknowledge_integration(conn, rid, actor, reason, evidence_url, evidence_hash=None):
    eligible, blocker = export_eligibility(conn, rid)
    if not eligible:
        raise ValueError('Integration blocked: ' + blocker)
    return transition_stage(conn, rid, 'INTEGRATED', actor, reason, evidence_url, evidence_hash, internal=True)
