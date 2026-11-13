-- 002_force_rls_up.sql - defence in depth for the tenant tables. Additive and reversible; no row is touched.
--
--   * FORCE ROW LEVEL SECURITY: the table OWNER is subject to the tenant policy as well. Without it, anything
--     that connects as the owner and forgets `SET ROLE digivasool_app` (a script, a console session, a future
--     code path) would silently see every organisation's rows.
--     (Roles with the BYPASSRLS attribute or superusers - e.g. Supabase's `postgres` - always bypass RLS;
--     that cannot be changed from here, which is why the app itself always runs as digivasool_app.)
--   * Take the tenant tables away from Supabase's public API roles (anon / authenticated). The app talks to
--     Postgres directly and never through that API.
--
-- Prerequisite: 001_multitenant applied. Rollback: 002_force_rls_down.sql.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_multitenant') THEN
    RAISE EXCEPTION '001_multitenant must be applied first';
  END IF;
END $$;

ALTER TABLE documents FORCE ROW LEVEL SECURITY;
ALTER TABLE files     FORCE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON documents, files FROM %I', r);
    END IF;
  END LOOP;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES ('002_force_rls', 'FORCE ROW LEVEL SECURITY on documents/files; revoke public API roles')
ON CONFLICT (version) DO NOTHING;
