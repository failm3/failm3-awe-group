from psycopg.types.json import Jsonb
from .models import SourceRegistration, canonical_url


def source_score(source: SourceRegistration):
    # Administrative inputs, not an inferred trust or truth label.
    return round(.35*source.authority + .35*source.relevance + .20*source.activity + .10*source.diversity)


def register_source(conn, source: SourceRegistration):
    score = source_score(source)
    evidence = sorted({canonical_url(u) for u in source.evidence_urls})
    # Public web collection only may be automatically enrolled, and only after
    # an administrator explicitly requests auto_enroll with two evidence links.
    auto_eligible = source.auto_enroll and source.method == "public_web" and score >= 80 and len(evidence) >= 2
    enabled = source.enabled or auto_eligible
    metadata = {
        "method": source.method, "evidence_urls": evidence,
        "score_components": {key: getattr(source, key) for key in ("authority", "relevance", "activity", "diversity")},
        "score_is_admin_assessment": True, "auto_enroll_requested": source.auto_enroll,
        "auto_enroll_eligible": auto_eligible,
    }
    row = conn.execute("""INSERT INTO sources(handle,url,title,metadata,collection_enabled,recommendation_score)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT(handle) DO UPDATE SET
        title=coalesce(EXCLUDED.title,sources.title), metadata=EXCLUDED.metadata,
        collection_enabled=EXCLUDED.collection_enabled,recommendation_score=EXCLUDED.recommendation_score,updated_at=now()
        RETURNING *""", (source.handle, f"https://t.me/{source.handle}", source.title, Jsonb(metadata), enabled, score)).fetchone()
    return row
