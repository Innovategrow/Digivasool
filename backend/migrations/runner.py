"""Helpers for the multi-tenant schema: used on a fresh install and by scripts/migrate_multitenant.py."""
import os

_DIR = os.path.dirname(os.path.abspath(__file__))

# The shape the tables had before multi-tenancy. A fresh install creates this and then
# applies the same UP migration, so there is exactly one path to the final schema.
LEGACY_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS documents (
  collection text NOT NULL, id text NOT NULL, data jsonb NOT NULL,
  seq bigserial, PRIMARY KEY (collection, id));
CREATE TABLE IF NOT EXISTS files (
  path text PRIMARY KEY, content_type text NOT NULL DEFAULT 'application/octet-stream',
  data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
"""


def read_sql(name: str) -> str:
    with open(os.path.join(_DIR, name), encoding="utf-8") as fh:
        return fh.read()


def create_fresh_schema(conn):
    """Create the multi-tenant schema from scratch (new database)."""
    with conn.transaction():
        conn.execute(LEGACY_TABLES_SQL)
        conn.execute(read_sql("001_multitenant_up.sql"))
