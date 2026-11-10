-- 001_multitenant_down.sql  -  ROLLBACK of the multi-tenant migration.
-- Restores the pre-migration shape. Refuses to run if any organisation other than the
-- legacy one holds data (that data would otherwise be merged into / lost from ORG_001).
-- Always take a fresh backup first; the runner insists on it.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM documents WHERE org_id NOT IN ('ORG_001', '__platform__'))
     OR EXISTS (SELECT 1 FROM files WHERE org_id <> 'ORG_001') THEN
    RAISE EXCEPTION 'Rollback refused: other organisations already hold data. Restore from backup instead.';
  END IF;
END $$;

DROP POLICY IF EXISTS tenant_isolation ON documents;
DROP POLICY IF EXISTS tenant_isolation ON files;

-- identity rows were created by this migration; they did not exist before
DELETE FROM documents WHERE org_id = '__platform__';

DROP INDEX IF EXISTS documents_org_collection_seq;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE documents ADD CONSTRAINT documents_pkey PRIMARY KEY (collection, id);
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_pkey;
ALTER TABLE files ADD CONSTRAINT files_pkey PRIMARY KEY (path);
ALTER TABLE documents DROP COLUMN org_id;
ALTER TABLE files     DROP COLUMN org_id;

-- the original schema kept RLS enabled with no policies (locks out Supabase's public API)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE files     ENABLE ROW LEVEL SECURITY;

DELETE FROM schema_migrations WHERE version = '001_multitenant';
-- the digivasool_app role is left in place (harmless, NOLOGIN)
