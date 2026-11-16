ALTER TABLE resources ADD COLUMN stage text NOT NULL DEFAULT 'DISCOVERED'
 CHECK(stage IN ('DISCOVERED','SOURCE_VERIFIED','DOCUMENTED','INSTALLABLE','INSTALLED_IN_SANDBOX','LIVE_TESTED','APPROVED','INTEGRATED','BROKEN','DEPRECATED','BLOCKED','REQUIRES_AUTH','REQUIRES_APPROVAL','REJECTED'));
CREATE TABLE stage_events (
 id bigserial PRIMARY KEY,
 resource_id bigint NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
 from_stage text NOT NULL,
 to_stage text NOT NULL,
 evidence_url text,
 evidence_hash text,
 recorded_by text NOT NULL,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
