CREATE TABLE sources (
 id bigserial PRIMARY KEY,
 handle text NOT NULL UNIQUE,
 url text,
 title text,
 source_type text NOT NULL DEFAULT 'telegram',
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE posts (
 id bigserial PRIMARY KEY,
 source_id bigint NOT NULL REFERENCES sources(id),
 message_id text NOT NULL,
 url text,
 published_at timestamptz,
 text text NOT NULL DEFAULT '',
 forwarded_from text,
 raw_hash text NOT NULL,
 raw jsonb NOT NULL DEFAULT '{}',
 collected_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_id,message_id)
);
CREATE TABLE post_versions (
 id bigserial PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 content_hash text NOT NULL,
 payload jsonb NOT NULL,
 observed_at timestamptz NOT NULL,
 UNIQUE(post_id,content_hash)
);
CREATE TABLE post_links (
 post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 url text NOT NULL,
 PRIMARY KEY(post_id,url)
);
CREATE TABLE post_media (
 id bigserial PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 content_hash text NOT NULL,
 metadata jsonb NOT NULL,
 UNIQUE(post_id,content_hash)
);
CREATE TABLE source_cursors (
 source_id bigint NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
 method text NOT NULL,
 cursor jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_id,method)
);
CREATE TABLE collection_runs (
 id bigserial PRIMARY KEY,
 source_id bigint NOT NULL REFERENCES sources(id),
 method text NOT NULL,
 coverage_hash text NOT NULL,
 coverage jsonb NOT NULL,
 observed_at timestamptz NOT NULL,
 UNIQUE(source_id,coverage_hash)
);
CREATE TABLE resources (
 id bigserial PRIMARY KEY,
 identity_key text NOT NULL UNIQUE,
 name text NOT NULL,
 official_url text,
 repository_url text,
 resource_type text,
 description text,
 verification_status text NOT NULL DEFAULT 'research_only'
   CHECK(verification_status IN ('research_only','official_metadata_observed','live_tested','rejected','deprecated')),
 decision text,
 limitations jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE resource_urls (
 url text PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 role text NOT NULL
);
CREATE TABLE capabilities (
 id bigserial PRIMARY KEY,
 name text NOT NULL UNIQUE
);
CREATE TABLE resource_capabilities (
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 capability_id bigint NOT NULL REFERENCES capabilities(id),
 PRIMARY KEY(resource_id,capability_id)
);
CREATE TABLE integrations (
 id bigserial PRIMARY KEY,
 name text NOT NULL UNIQUE
);
CREATE TABLE resource_integrations (
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 integration_id bigint NOT NULL REFERENCES integrations(id),
 PRIMARY KEY(resource_id,integration_id)
);
CREATE TABLE assertions (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 field text NOT NULL,
 value jsonb NOT NULL,
 evidence_url text,
 checked_at timestamptz,
 evidence_kind text NOT NULL DEFAULT 'imported_claim',
 assertion_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(resource_id,assertion_hash)
);
CREATE TABLE resource_provenance (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 source_url text,
 post_url text,
 message_id text,
 post_id bigint REFERENCES posts(id) ON DELETE SET NULL,
 provenance_hash text NOT NULL,
 UNIQUE(resource_id,provenance_hash)
);
CREATE TABLE pricing_snapshots (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 category text,
 details text,
 evidence_url text,
 checked_at timestamptz,
 snapshot_hash text NOT NULL,
 UNIQUE(resource_id,snapshot_hash)
);
CREATE TABLE license_evidence (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 spdx text,
 details text,
 evidence_url text,
 checked_at timestamptz,
 evidence_kind text NOT NULL DEFAULT 'imported_claim',
 snapshot_hash text NOT NULL,
 UNIQUE(resource_id,snapshot_hash)
);
CREATE TABLE resource_imports (
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 content_hash text NOT NULL,
 payload jsonb NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(resource_id,content_hash)
);
CREATE TABLE verification_runs (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 method text NOT NULL,
 target_url text,
 outcome text NOT NULL,
 http_status integer,
 details jsonb NOT NULL DEFAULT '{}',
 checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE live_tests (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 test_name text NOT NULL,
 result text NOT NULL CHECK(result IN ('passed','failed','inconclusive')),
 evidence_url text NOT NULL,
 evidence_hash text NOT NULL,
 tested_at timestamptz NOT NULL,
 recorded_by text NOT NULL,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE approvals (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 approved boolean NOT NULL,
 approved_by text NOT NULL,
 reason text NOT NULL,
 live_test_id bigint REFERENCES live_tests(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(NOT approved OR live_test_id IS NOT NULL)
);
CREATE TABLE queue_jobs (
 id bigserial PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('collect','verify_resource')),
 payload jsonb NOT NULL,
 dedup_key text NOT NULL UNIQUE,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','succeeded','failed')),
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 3,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 lease_token text,
 result jsonb,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_ready_idx ON queue_jobs(state,available_at,id);
CREATE INDEX posts_published_idx ON posts(source_id,published_at);
CREATE INDEX assertions_resource_idx ON assertions(resource_id,field);
CREATE INDEX provenance_post_idx ON resource_provenance(post_id);
CREATE INDEX resource_search_idx ON resources USING gin(to_tsvector('simple',coalesce(name,'') || ' ' || coalesce(description,'')));
