"""
Apply / roll back migration 002 (FORCE ROW LEVEL SECURITY) on the Supabase database.

    python scripts/migrate_security.py status
    python scripts/migrate_security.py apply --backup-file backup.dump --yes
    python scripts/migrate_security.py rollback --yes

Needs DATABASE_URL (the same connection string the app uses). `apply` is one transaction and refuses
without --yes and a backup file name (take it with: python scripts/migrate_multitenant.py backup --out ...).
It touches no row. After applying it runs the app's own access path (SET ROLE digivasool_app + tenant
context) against the real tables to prove the application still works, and rolls everything back if not.

Order matters with the multi-tenant migration: 002 must be rolled back BEFORE 001 is rolled back, and
scripts that connect as the table owner (migrate_multitenant.py inspect/verify) see no rows while 002 is
applied unless the connecting role has BYPASSRLS (Supabase's `postgres` role does).
"""
import argparse
import os
import sys

import psycopg
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))
from migrations.runner import read_sql  # noqa: E402


def connect():
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        sys.exit("DATABASE_URL is not set")
    return psycopg.connect(url, autocommit=True)


def state(conn):
    forced = conn.execute("SELECT relforcerowsecurity FROM pg_class WHERE oid = to_regclass('public.documents')").fetchone()
    applied = conn.execute("SELECT 1 FROM schema_migrations WHERE version='002_force_rls'").fetchone()
    bypass = conn.execute("SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = current_user").fetchone()[0]
    return bool(forced and forced[0]), bool(applied), bool(bypass)


def cmd_status(_):
    forced, applied, bypass = state(connect())
    print(f"FORCE RLS on documents: {forced}; migration 002 recorded: {applied}")
    if bypass:
        print("Note: the connecting role bypasses RLS (superuser/BYPASSRLS). FORCE does not apply to it; the app "
              "itself always runs as digivasool_app, which is what matters.")


def cmd_apply(a):
    if not a.yes or not a.backup_file:
        sys.exit("Refusing: pass --backup-file <file you just made> and --yes")
    conn = connect()
    with conn.transaction():
        conn.execute(read_sql("002_force_rls_up.sql"))
        # prove the application's own access path still works against the real tables
        conn.execute("SELECT set_config('role','digivasool_app',true), set_config('app.org_id','__platform__',true)")
        conn.execute("SELECT count(*) FROM documents").fetchone()
        conn.execute("SELECT set_config('app.org_id','ORG_DOES_NOT_EXIST',true)")
        assert conn.execute("SELECT count(*) FROM documents").fetchone()[0] == 0, "tenant context is not isolating rows"
    print("Applied 002_force_rls.")
    cmd_status(a)


def cmd_rollback(a):
    if not a.yes:
        sys.exit("Refusing: pass --yes")
    conn = connect()
    with conn.transaction():
        conn.execute(read_sql("002_force_rls_down.sql"))
    print("Rolled back 002_force_rls.")
    cmd_status(a)


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    ap = sub.add_parser("apply"); ap.add_argument("--backup-file"); ap.add_argument("--yes", action="store_true"); ap.set_defaults(fn=cmd_apply)
    r = sub.add_parser("rollback"); r.add_argument("--yes", action="store_true"); r.set_defaults(fn=cmd_rollback)
    args = p.parse_args()
    args.fn(args)
