"""
Row-level security tested DIRECTLY in Postgres, independent of any application filtering.

    createdb rls_test
    RLS_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/rls_test .venv/bin/python -m pytest tests/test_rls_postgres.py -q

Skipped unless RLS_TEST_DATABASE_URL is set. For safety it refuses any database whose name does not
contain "test" (it drops and recreates the tables).
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
URL = os.environ.get("RLS_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.skipif(not URL, reason="set RLS_TEST_DATABASE_URL to run the Postgres RLS tests")

psycopg = pytest.importorskip("psycopg")


@pytest.fixture(scope="module")
def conn():
    c = psycopg.connect(URL, autocommit=True)
    dbname = c.execute("select current_database()").fetchone()[0]
    assert "test" in dbname, f"refusing to reset database {dbname!r}: its name must contain 'test'"
    c.execute("DROP TABLE IF EXISTS documents, files, schema_migrations CASCADE")
    from migrations import runner
    runner.create_fresh_schema(c)
    for org in ("ORG_A", "ORG_B"):
        for i in range(3):
            c.execute("INSERT INTO documents (org_id, collection, id, data) VALUES (%s,'loans',%s,%s::jsonb)",
                      (org, f"l{i}", json.dumps({"owner": org})))
        c.execute("INSERT INTO files (org_id, path, data) VALUES (%s,'x/y.png',%s)", (org, org.encode()))
    yield c
    c.close()


def as_app(conn, org):
    """Open a transaction exactly the way PostgresStore does: restricted role + transaction-local org."""
    tx = conn.transaction()
    tx.__enter__()
    conn.execute("SELECT set_config('role','digivasool_app',true), set_config('app.org_id',%s,true)", (org,))
    return tx


def test_select_sees_only_own_org_even_without_a_where_clause(conn):
    tx = as_app(conn, "ORG_A")
    rows = conn.execute("SELECT org_id FROM documents").fetchall()      # the "forgot the filter" bug
    assert rows and {r[0] for r in rows} == {"ORG_A"}
    assert conn.execute("SELECT count(*) FROM documents WHERE org_id='ORG_B'").fetchone()[0] == 0
    assert {r[0] for r in conn.execute("SELECT org_id FROM files").fetchall()} == {"ORG_A"}
    tx.__exit__(None, None, None)


def test_update_and_delete_cannot_touch_other_org(conn):
    tx = as_app(conn, "ORG_A")
    assert conn.execute("UPDATE documents SET data='{\"hacked\":1}'::jsonb WHERE org_id='ORG_B'").rowcount == 0
    assert conn.execute("DELETE FROM documents WHERE org_id='ORG_B'").rowcount == 0
    assert conn.execute("UPDATE documents SET data='{\"owner\":\"ORG_A\",\"edited\":1}'::jsonb WHERE id='l0'").rowcount == 1  # own rows still work
    tx.__exit__(None, None, None)
    assert conn.execute("SELECT count(*) FROM documents WHERE org_id='ORG_B' AND data ? 'hacked'").fetchone()[0] == 0


def test_insert_for_other_org_is_rejected(conn):
    tx = as_app(conn, "ORG_A")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        conn.execute("INSERT INTO documents (org_id, collection, id, data) VALUES ('ORG_B','loans','evil','{}'::jsonb)")
    tx.__exit__(psycopg.errors.InsufficientPrivilege, psycopg.errors.InsufficientPrivilege("x"), None)
    with conn.transaction():
        conn.execute("SELECT set_config('role','digivasool_app',true), set_config('app.org_id','ORG_A',true)")
        conn.execute("INSERT INTO documents (org_id, collection, id, data) VALUES ('ORG_A','loans','mine','{}'::jsonb)")
    assert conn.execute("SELECT count(*) FROM documents WHERE org_id='ORG_B' AND id='evil'").fetchone()[0] == 0


def test_moving_a_row_to_another_org_is_rejected(conn):
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with conn.transaction():
            conn.execute("SELECT set_config('role','digivasool_app',true), set_config('app.org_id','ORG_A',true)")
            conn.execute("UPDATE documents SET org_id='ORG_B' WHERE id='l1' AND org_id='ORG_A'")


def test_no_org_context_means_no_rows_and_no_writes(conn):
    with conn.transaction():
        conn.execute("SELECT set_config('role','digivasool_app',true)")
        assert conn.execute("SELECT count(*) FROM documents").fetchone()[0] == 0
        assert conn.execute("SELECT count(*) FROM files").fetchone()[0] == 0
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with conn.transaction():
            conn.execute("SELECT set_config('role','digivasool_app',true)")
            conn.execute("INSERT INTO documents (org_id, collection, id, data) VALUES ('ORG_A','loans','nope','{}'::jsonb)")


def test_context_does_not_leak_to_the_next_user_of_a_pooled_connection(conn):
    tx = as_app(conn, "ORG_A")
    tx.__exit__(None, None, None)
    assert (conn.execute("SELECT current_setting('app.org_id', true)").fetchone()[0] or "") == ""
    assert conn.execute("SELECT current_user").fetchone()[0] != "digivasool_app"
    with conn.transaction():        # a new request arrives with a different org on the SAME connection
        conn.execute("SELECT set_config('role','digivasool_app',true), set_config('app.org_id','ORG_B',true)")
        assert {r[0] for r in conn.execute("SELECT org_id FROM documents").fetchall()} == {"ORG_B"}


def test_app_role_is_restricted(conn):
    row = conn.execute("SELECT rolbypassrls, rolsuper, rolcanlogin FROM pg_roles WHERE rolname='digivasool_app'").fetchone()
    assert row == (False, False, False)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with conn.transaction():
            conn.execute("SELECT set_config('role','digivasool_app',true)")
            conn.execute("DROP TABLE documents")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with conn.transaction():
            conn.execute("SELECT set_config('role','digivasool_app',true)")
            conn.execute("ALTER TABLE documents DISABLE ROW LEVEL SECURITY")
    assert conn.execute("SELECT relrowsecurity FROM pg_class WHERE relname IN ('documents','files')").fetchall() == [(True,), (True,)]
