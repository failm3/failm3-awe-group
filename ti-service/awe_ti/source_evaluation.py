"""Conservative automated enrollment from cross-source evidence + public sample.
Policy is explicit and reversible; does not subscribe, publish, or execute tools.
"""
import re
from psycopg.types.json import Jsonb
from .network import safe_fetch
from .collectors.public import parse_page
from .intelligence import classify_link
from .models import SourceRegistration,utcnow
from .sources import register_source


def evaluate_sources(conn,max_candidates=2,fetcher=safe_fetch):
    candidates=conn.execute("SELECT * FROM source_candidates WHERE source_type='telegram' AND status='discovered' AND quality->>'eligible_for_sample'='true' ORDER BY id LIMIT %s",(max(1,min(max_candidates,5)),)).fetchall()
    results=[]
    for candidate in candidates:
        handle=candidate['handle'];url='https://t.me/s/'+handle
        outcome={'handle':handle,'sample_url':url,'observed_at':utcnow().isoformat(),'enrolled':False}
        try:
            response=fetcher(url,timeout=20)
            if response.status!=200:raise ValueError('Non-200 public sample')
            page=parse_page(response.body.decode('utf-8',errors='replace'),handle,page_url=url)
            if not page.valid_preview or page.errors:raise ValueError('Invalid or incomplete preview sample')
            posts=page.posts
            technical=sum(any(classify_link(link) for link in p.get('links',[])) for p in posts)
            ads=sum(bool(re.search(r'реклама|erid|промокод|скидк|спонсор|advertisement|sponsored|promo code',p.get('text',''),re.I)) for p in posts)
            total=len(posts)
            allowed=total>=10 and technical/total>=.5 and ads/total<=.2
            outcome.update({'sample_posts':total,'technical_link_posts':technical,'ad_marker_posts':ads,
              'sample_precision':technical/total if total else None,'ad_marker_fraction':ads/total if total else None,
              'sample_only_not_history_metric':True,'enrolled':allowed})
            if allowed:
                row=register_source(conn,SourceRegistration(handle=handle,enabled=True,method='public_web',title=page.title,
                  evidence_urls=[url]+[e['post_url'] for e in candidate['evidence'][:2]]))
                conn.execute('UPDATE sources SET metadata=metadata || %s WHERE id=%s',(Jsonb({'auto_enrolled_by':'cross_source_sample_policy_v1','measured_sample':outcome,'trust':'B'}),row['id']))
            conn.execute('UPDATE source_candidates SET status=%s,quality=quality || %s,checked_at=now() WHERE id=%s',
              ('enrolled' if allowed else 'sampled_not_enrolled',Jsonb(outcome),candidate['id']))
        except Exception as exc:
            outcome['error_type']=type(exc).__name__
            conn.execute("UPDATE source_candidates SET status='sample_blocked',quality=quality || %s,checked_at=now() WHERE id=%s",(Jsonb(outcome),candidate['id']))
        results.append(outcome)
        conn.execute("INSERT INTO audit_events(event_type,actor,entity_type,entity_id,details) VALUES ('source_sample','cross_source_sample_policy_v1','source_candidate',%s,%s)",(str(candidate['id']),Jsonb(outcome)))
    return results
