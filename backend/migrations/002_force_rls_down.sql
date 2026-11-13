-- 002_force_rls_down.sql - ROLLBACK of 002_force_rls_up.sql. No data is touched.
ALTER TABLE documents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE files     NO FORCE ROW LEVEL SECURITY;

-- put back the default Supabase privileges for the public API roles (RLS still blocks every row for them,
-- because no policy applies to those roles)
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT ALL ON documents, files TO %I', r);
    END IF;
  END LOOP;
END $$;

DELETE FROM schema_migrations WHERE version = '002_force_rls';
