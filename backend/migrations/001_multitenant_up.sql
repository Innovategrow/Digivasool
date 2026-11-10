-- 001_multitenant_up.sql  -  DigiVasool multi-tenant migration (UP)
--
-- Staged and additive. Runs in ONE transaction (the runner wraps it), so a failure
-- changes nothing. No row is deleted or rewritten except that org_id is filled in.
-- Existing primary identities (collection, id) are kept; they now live inside an
-- organisation:  PRIMARY KEY (org_id, collection, id).
--
--   Stage 1  add nullable org_id columns
--   Stage 2  backfill every existing row with the legacy organisation ORG_001
--   Stage 3  NOT NULL + new primary key + index
--   Stage 4  restricted role + row-level security (the second isolation layer)
--   Stage 5  register ORG_001 and record the migration version

-- ── Stage 1 ────────────────────────────────────────────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS org_id text;
ALTER TABLE files     ADD COLUMN IF NOT EXISTS org_id text;

-- ── Stage 2 ────────────────────────────────────────────────────────────────
UPDATE documents SET org_id = 'ORG_001' WHERE org_id IS NULL;
UPDATE files     SET org_id = 'ORG_001' WHERE org_id IS NULL;

-- ── Stage 3 ────────────────────────────────────────────────────────────────
ALTER TABLE documents ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE files     ALTER COLUMN org_id SET NOT NULL;

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE documents ADD CONSTRAINT documents_pkey PRIMARY KEY (org_id, collection, id);
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_pkey;
ALTER TABLE files ADD CONSTRAINT files_pkey PRIMARY KEY (org_id, path);

CREATE INDEX IF NOT EXISTS documents_org_collection_seq ON documents (org_id, collection, seq);

-- ── Stage 4: restricted application role + RLS ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'digivasool_app') THEN
    CREATE ROLE digivasool_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO digivasool_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents, files TO digivasool_app;
GRANT USAGE, SELECT ON SEQUENCE documents_seq_seq TO digivasool_app;
-- the connecting user may SET ROLE digivasool_app for each transaction
DO $$ BEGIN EXECUTE format('GRANT digivasool_app TO %I', current_user); END $$;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE files     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON documents;
CREATE POLICY tenant_isolation ON documents FOR ALL TO digivasool_app
  USING      (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));

DROP POLICY IF EXISTS tenant_isolation ON files;
CREATE POLICY tenant_isolation ON files FOR ALL TO digivasool_app
  USING      (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));

-- ── Stage 5 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY, description text, applied_at timestamptz NOT NULL DEFAULT now());

INSERT INTO documents (org_id, collection, id, data)
VALUES ('__platform__', 'organizations', 'ORG_001',
        jsonb_build_object('id', 'ORG_001', 'organization_name', 'Existing Finance Organisation',
                           'organization_code', 'ORG_001', 'status', 'active',
                           'created_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'),
                           'updated_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"+00:00"'),
                           'legacy', true))
ON CONFLICT (org_id, collection, id) DO NOTHING;

INSERT INTO schema_migrations (version, description)
VALUES ('001_multitenant', 'org_id on documents/files, composite PK, RLS, ORG_001')
ON CONFLICT (version) DO NOTHING;
