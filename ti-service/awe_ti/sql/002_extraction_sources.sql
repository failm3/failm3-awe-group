ALTER TABLE sources ADD COLUMN collection_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE sources ADD COLUMN recommendation_score integer NOT NULL DEFAULT 0 CHECK(recommendation_score BETWEEN 0 AND 100);
CREATE TABLE extraction_candidates (
 id bigserial PRIMARY KEY,
 post_id bigint NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
 version_hash text NOT NULL,
 candidate_hash text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('url','named_mention','unresolved_text')),
 name text,
 url text,
 excerpt text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','resolved','discarded')),
 resource_id bigint REFERENCES resources(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(post_id,version_hash,candidate_hash)
);
CREATE INDEX extraction_pending_idx ON extraction_candidates(state,post_id);
