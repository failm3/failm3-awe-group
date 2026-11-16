CREATE TABLE source_candidates (
 id bigserial PRIMARY KEY,
 url text NOT NULL UNIQUE,
 source_type text NOT NULL,
 handle text,
 trust_class text NOT NULL CHECK(trust_class IN ('A','B','C')),
 status text NOT NULL DEFAULT 'discovered',
 evidence jsonb NOT NULL DEFAULT '[]',
 quality jsonb NOT NULL DEFAULT '{}',
 discovered_at timestamptz NOT NULL DEFAULT now(),
 checked_at timestamptz
);
CREATE TABLE resource_versions (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 version text NOT NULL,
 evidence_url text NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}',
 observed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(resource_id,version,evidence_url)
);
CREATE TABLE integration_specs (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 spec_hash text NOT NULL,
 spec jsonb NOT NULL,
 evidence_url text,
 observed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(resource_id,spec_hash)
);
CREATE TABLE audit_events (
 id bigserial PRIMARY KEY,
 event_type text NOT NULL,
 actor text NOT NULL,
 entity_type text,
 entity_id text,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_candidates_status_idx ON source_candidates(status,id);
CREATE VIEW source_posts AS SELECT * FROM posts;
CREATE VIEW resource_mentions AS SELECT * FROM resource_provenance;
CREATE VIEW pricing_records AS SELECT * FROM pricing_snapshots;
CREATE VIEW license_records AS SELECT * FROM license_evidence;
CREATE VIEW integration_tests AS SELECT * FROM live_tests;
CREATE VIEW approval_decisions AS SELECT * FROM approvals;
