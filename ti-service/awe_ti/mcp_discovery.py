"""Official MCP Registry metadata feed; never install or invoke a server."""
import json
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlencode, quote
from psycopg.types.json import Jsonb
from .config import ROOT
from .db import connect
from .models import ResourceImport, PostImport, Claim, utcnow, stable_hash, canonical_url
from .ingest import ingest_resource, ingest_post, add_assertion
from .network import safe_fetch

HANDLE='official_mcp_registry'
BASE='https://registry.modelcontextprotocol.io/v0.1/servers'


def refresh_registry(database_url=None,max_pages=2,fetcher=safe_fetch):
    with connect(database_url) as conn:
        row=conn.execute('''INSERT INTO sources(handle,url,title,source_type,metadata) VALUES (%s,%s,'Official MCP Registry','registry',%s)
          ON CONFLICT(handle) DO UPDATE SET updated_at=now() RETURNING id''',
          (HANDLE,BASE,Jsonb({'trust':'A','collector':'read_only_mcp_registry','not_tool_safety_certification':True}))).fetchone()
        sid=row['id']
        old=conn.execute("SELECT cursor FROM source_cursors WHERE source_id=%s AND method='mcp_registry'",(sid,)).fetchone()
        cursor=old['cursor'] if old else {}
    next_cursor=cursor.get('next_cursor')
    scan_start=cursor.get('scan_start') or utcnow().isoformat()
    since=cursor.get('updated_since')
    examined=created=pages=0
    errors=[]
    for _ in range(max(1,min(max_pages,20))):
        query={'limit':100}
        if next_cursor:query['cursor']=next_cursor
        if since:query['updated_since']=since
        url=BASE+'?'+urlencode(query)
        try:
            response=fetcher(url,max_bytes=4_000_000,timeout=30)
            if response.status!=200:raise ValueError('Registry HTTP '+str(response.status))
            payload=response.json()
            if not isinstance(payload,dict) or not isinstance(payload.get('servers'),list):raise ValueError('Registry contract mismatch')
            items=payload['servers']
            observed=utcnow()
            folder=ROOT/'evidence/mcp_registry';folder.mkdir(parents=True,exist_ok=True)
            raw=folder/(stable_hash(payload)+'.json')
            if not raw.exists():raw.write_text(json.dumps({'url':url,'observed_at':observed.isoformat(),'payload':payload},ensure_ascii=False,indent=2)+'\n')
            with connect(database_url) as conn:
                for item in items:
                    server=item.get('server') or {};meta=(item.get('_meta') or {}).get('io.modelcontextprotocol.registry/official') or {}
                    name=server.get('name');version=str(server.get('version') or 'unknown')
                    if not isinstance(name,str) or not name or len(name)>512:continue
                    evidence_url=BASE+'/'+quote(name,safe='')+'/versions/'+quote(version,safe='')
                    repository=(server.get('repository') or {}).get('url')
                    if repository:
                        try:repository=canonical_url(repository)
                        except ValueError:repository=None
                    resource=ResourceImport(name=name,official_url='https://registry.modelcontextprotocol.io/?search='+quote(name,safe=''),
                        repository_url=repository,resource_type='mcp_server',description=str(server.get('description') or '')[:12000],
                        capabilities=['mcp'],integrations=['MCP'],verification_status='DISCOVERED',decision='candidate',
                        claims=[{'field':'mcp_registry_metadata','value':server,'evidence_url':evidence_url,'checked_at':observed},
                                {'field':'mcp_registry_status','value':meta.get('status'),'evidence_url':evidence_url,'checked_at':observed}],
                        provenance=[{'source_url':BASE,'post_url':evidence_url,'message_id':name+'@'+version}],
                        limitations=['Registry metadata is a publisher claim and namespace record, not proof of safety, functionality, licensing or executable approval.'])
                    # Multiple distinct MCP names may share a monorepo. Do not collapse
                    # a package identity merely because its repository is shared.
                    existing=conn.execute('SELECT resource_id FROM resource_urls WHERE url=%s',(resource.repository_url,)).fetchone() if resource.repository_url else None
                    if existing:
                        resource.repository_url=None
                        resource.claims.append(Claim(field='repository_url_claimed',value=repository,evidence_url=evidence_url,checked_at=observed))
                    rid=ingest_resource(conn,resource);created+=int(rid['created'])
                    conn.execute('''INSERT INTO resource_versions(resource_id,version,evidence_url,metadata) VALUES (%s,%s,%s,%s)
                      ON CONFLICT(resource_id,version,evidence_url) DO UPDATE SET metadata=EXCLUDED.metadata,observed_at=now()''',
                      (rid['id'],version,evidence_url,Jsonb(meta)))
                    spec={'schema_version':'1.0','kind':'MCP','packages':server.get('packages',[]),'remotes':server.get('remotes',[]),
                          'permissions':'unknown','executable_approved':False}
                    conn.execute('INSERT INTO integration_specs(resource_id,spec_hash,spec,evidence_url) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING',
                      (rid['id'],stable_hash(spec),Jsonb(spec),evidence_url))
                    ingest_post(conn,PostImport(source_handle=HANDLE,source_url=BASE,source_title='Official MCP Registry',
                      message_id=name+'@'+version,url=evidence_url,published_at=meta.get('publishedAt'),
                      text=server.get('description') or name,links=[repository] if repository else [],
                      collected_at=observed,raw={'registry_record':item}))
                    examined+=1
                next_cursor=(payload.get('metadata') or {}).get('nextCursor')
                pages+=1
                new_cursor={'next_cursor':next_cursor,'scan_start':scan_start,'updated_since':since,
                  'history_boundary_reached':not bool(next_cursor),'completeness':'registry_api_visible_only',
                  'last_observed_at':observed.isoformat(),'initial_scan_complete':cursor.get('initial_scan_complete',False) or (not bool(next_cursor) and since is None)}
                if not next_cursor:
                    new_cursor['updated_since']=(__import__('datetime').datetime.fromisoformat(scan_start)-timedelta(minutes=5)).isoformat()
                    new_cursor['scan_start']=None
                conn.execute('''INSERT INTO source_cursors(source_id,method,cursor) VALUES (%s,'mcp_registry',%s)
                  ON CONFLICT(source_id,method) DO UPDATE SET cursor=EXCLUDED.cursor,updated_at=now()''',(sid,Jsonb(new_cursor)))
            if not next_cursor:break
        except Exception as exc:
            errors.append({'error_type':type(exc).__name__,'page':pages+1});break
    result={'source':HANDLE,'pages':pages,'records_observed':examined,'created_resources':created,
      'next_cursor_present':bool(next_cursor),'initial_history_complete':bool(new_cursor.get('initial_scan_complete')) if pages else False,
      'errors':errors,'metadata_only':True,'observed_at':utcnow().isoformat()}
    with connect(database_url) as conn:
        conn.execute("INSERT INTO audit_events(event_type,actor,entity_type,entity_id,details) VALUES ('mcp_registry_poll','read_only_collector','source',%s,%s)",(str(sid),Jsonb(result)))
    return result
