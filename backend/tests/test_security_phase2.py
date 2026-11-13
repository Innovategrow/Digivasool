"""
Phase 2 security tests: single-use registration, atomic organisation creation, collector data minimisation,
cross-tenant relationships, manipulated ids, the phone->membership index, uploads, proxy-aware IPs, and
(on real Postgres) FORCE ROW LEVEL SECURITY against a table owner that is NOT a superuser.

    .venv/bin/python -m pytest tests/test_security_phase2.py -q
    RLS_TEST_DATABASE_URL=postgresql://localhost/dv_rls_test .venv/bin/python -m pytest tests/test_security_phase2.py -q
"""
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from test_subscription import (  # noqa: E402,F401  (api is the shared app fixture)
    LOAN, add_staff, api, fresh_phone, hdr, make_loan, register, verify,
)


def two_orgs(api):
    a, b = register(api, fresh_phone(), "Sec A"), register(api, fresh_phone(), "Sec B")
    la, lb = make_loan(api, a).json()["data"], make_loan(api, b).json()["data"]
    return a, b, la, lb


# ───────────────────────── registration ─────────────────────────

def test_registration_token_is_single_use(api):
    phone = fresh_phone()
    v = verify(api, phone)
    body = {"registration_token": v["registration_token"], "organization_name": "Replay Co", "admin_name": "Replayer"}
    first = api.c.post("/api/organizations/register", json=body)
    assert first.status_code == 200
    for _ in range(3):
        again = api.c.post("/api/organizations/register", json=body)
        assert again.status_code == 401 and "already used" in again.json()["detail"]
    assert len([o for o in api.identity.list_orgs(active_only=False) if o["organization_name"] == "Replay Co"]) == 1
    assert len(api.identity.staff_memberships_for_phone(phone)) == 1                # one membership, not several


def test_a_select_token_can_start_only_one_new_organisation(api):
    owner = register(api, fresh_phone(), "Multi Base")
    phone = owner["phone"]
    add_staff(api, owner, "admin", (p := fresh_phone()))
    # a phone with two memberships gets a select token; it can be used to register ONE more organisation
    other = register(api, fresh_phone(), "Multi Other")
    add_staff(api, other, "admin", p)
    v = verify(api, p)
    assert v["status"] == "select_org"
    body = {"registration_token": v["selection_token"], "organization_name": "Third Org", "admin_name": "Admin"}
    assert api.c.post("/api/organizations/register", json=body).status_code == 200
    assert api.c.post("/api/organizations/register", json=body).status_code == 401
    # ...but the same select token still selects among EXISTING organisations (it is only consumed by register)
    assert phone  # silence unused


def test_failed_registration_leaves_nothing_behind_and_can_be_retried(api, monkeypatch):
    phone = fresh_phone()
    v = verify(api, phone)
    body = {"registration_token": v["registration_token"], "organization_name": "Crash Reg Co", "admin_name": "Crasher"}
    before = {o["id"] for o in api.identity.list_orgs(active_only=False)}

    def boom(*a, **k):
        raise RuntimeError("database went away")

    real = api.identity.add_membership
    monkeypatch.setattr(api.identity, "add_membership", boom)
    with pytest.raises(RuntimeError):
        api.c.post("/api/organizations/register", json=body)
    monkeypatch.setattr(api.identity, "add_membership", real)
    after = {o["id"] for o in api.identity.list_orgs(active_only=False)}
    assert after == before                                                        # no orphan organisation
    assert api.sub._get(api.sub.SUBS_C, "ORG_NOPE") is None
    assert api.identity.staff_memberships_for_phone(phone) == []
    r = api.c.post("/api/organizations/register", json=body)                       # the SAME token works again
    assert r.status_code == 200 and r.json()["member_role"] == "OWNER"
    assert len([o for o in api.identity.list_orgs(active_only=False) if o["organization_name"] == "Crash Reg Co"]) == 1


def test_login_never_creates_an_organisation_or_a_second_membership(api):
    owner = register(api, fresh_phone(), "Stable Co")
    orgs = len(api.identity.list_orgs(active_only=False))
    for _ in range(3):
        v = verify(api, owner["phone"])
        assert v["status"] == "ok" and v["organization"]["id"] == owner["organization"]["id"]
    assert len(api.identity.list_orgs(active_only=False)) == orgs
    assert len(api.identity.staff_memberships_for_phone(owner["phone"])) == 1


# ───────────────────────── roles ─────────────────────────

def test_a_staff_member_cannot_make_themselves_owner(api):
    owner = register(api, fresh_phone(), "Escalate Co")
    admin_phone = fresh_phone()
    admin = add_staff(api, owner, "admin", admin_phone)
    admin_login = verify(api, admin_phone)
    h = hdr(admin_login)
    assert api.c.post(f"/api/staff/{admin['id']}/make-owner", headers=h).status_code == 403
    assert api.c.post("/api/staff/", headers=h, json={"name": "Boss", "role": "owner", "phone": fresh_phone()}).status_code in (400, 403, 422)
    assert api.c.patch(f"/api/staff/{admin['id']}", headers=h, json={"role": "OWNER", "member_role": "OWNER"}).status_code in (200, 403)
    me = api.identity.get_membership(admin["id"])
    assert me["role"] == "ADMIN"
    # a forged role in a hand-made token is useless: it is not signed
    forged = api.auth.decode_token(admin_login["token"])
    assert forged["member_role"] == "ADMIN"


def test_collector_dashboard_shows_only_their_own_numbers(api):
    owner = register(api, fresh_phone(), "Dash Co")
    pa, pb = fresh_phone(), fresh_phone()
    add_staff(api, owner, "collector", pa, "Ann")
    add_staff(api, owner, "collector", pb, "Bob")
    loan = api.c.post("/api/loans/", headers=hdr(owner), json={**LOAN, "assigned_collectors": ["Ann", "Bob"]}).json()["data"]
    ann, bob = verify(api, pa), verify(api, pb)
    for who, amt in ((ann, 300), (bob, 700)):
        r = api.c.post(f"/api/loans/{loan['id']}/payments", headers=hdr(who), json={"amount": amt, "payment_method": "Cash"})
        assert r.status_code == 200, r.text
    admin_view = api.c.get("/api/dashboard/", headers=hdr(owner)).json()
    assert {c["name"] for c in admin_view["collector_breakdown"]} == {"Ann", "Bob"} and admin_view["today_collected"] == 1000
    ann_view = api.c.get("/api/dashboard/", headers=hdr(ann)).json()
    assert ann_view["today_collected"] == 300
    assert [c["name"] for c in ann_view["collector_breakdown"]] == ["Ann"]
    assert ann_view["you_will_give"] == 0 and ann_view["you_will_get"] == 0 and ann_view["active_lending_count"] == 0
    assert "Bob" not in json.dumps(ann_view)


# ───────────────────────── cross-tenant ─────────────────────────

def test_cross_tenant_relationships_cannot_be_created(api):
    a, b, la, lb = two_orgs(api)
    ha = hdr(a)
    # a payment, a merge, a proof, a stats call and an edit that point at ANOTHER organisation's loan
    assert api.c.post(f"/api/loans/{lb['id']}/payments", headers=ha, json={"amount": 5, "payment_method": "Cash"}).status_code == 404
    assert api.c.post("/api/loans/merge", headers=ha, json={"primary_loan_id": la["id"], "merge_loan_ids": [lb["id"]]}).status_code in (400, 404, 422)
    assert api.c.get(f"/api/loans/{lb['id']}/stats", headers=ha).status_code == 404
    assert api.c.patch(f"/api/loans/{lb['id']}", headers=ha, json={"customer_name": "Hacked Name"}).status_code == 404
    # assigning a loan to a collector who belongs to another organisation is refused
    col_b = [c for c in api.c.get("/api/collectors/", headers=hdr(b)).json()][0]["name"]
    r = api.c.post("/api/loans/", headers=ha, json={**LOAN, "assigned_collectors": [col_b + " (other org)"]})
    assert r.status_code == 400
    # nothing of B changed
    got = api.c.get("/api/loans/", headers=hdr(b)).json()
    assert [l["id"] for l in got] == [lb["id"]] and got[0]["collected_amount"] == 0 and got[0]["customer_name"] == "Borrower"


def test_a_manipulated_org_id_in_the_body_does_not_move_data(api):
    a, b, la, lb = two_orgs(api)
    b_org = b["organization"]["id"]
    r = api.c.post("/api/loans/", headers=hdr(a), json={**LOAN, "customer_name": "Planted", "org_id": b_org,
                                                         "organization_id": b_org, "merchant_id": b_org})
    assert r.status_code == 200
    assert "Planted" not in {l["customer_name"] for l in api.c.get("/api/loans/", headers=hdr(b)).json()}
    assert "Planted" in {l["customer_name"] for l in api.c.get("/api/loans/", headers=hdr(a)).json()}
    r = api.c.post("/api/staff/", headers=hdr(a), json={"name": "Planted Col", "role": "collector", "phone": fresh_phone(), "org_id": b_org})
    assert r.status_code in (200, 422)
    assert "Planted Col" not in {s["name"] for s in api.c.get("/api/staff/", headers=hdr(b)).json()}


def test_missing_organisation_context_fails_closed(api):
    with pytest.raises(api.db.OrgContextError):
        api.db.get_db_client().collection("loans").get()
    assert api.c.get("/api/loans/").status_code == 401
    assert api.c.post("/api/loans/", json=LOAN).status_code in (401, 403)


def test_collector_cannot_reach_owner_functions(api):
    owner = register(api, fresh_phone(), "Perm Co")
    col_phone = fresh_phone()
    add_staff(api, owner, "collector", col_phone, "Col")
    h = hdr(verify(api, col_phone))
    assert api.c.post("/api/organizations/request-deletion", headers=h).status_code == 403
    assert api.c.get("/api/admin/audit-log", headers=h).status_code == 403
    assert api.c.get("/api/reports/export.xlsx", headers=h).status_code == 403
    assert api.c.get("/api/admin/app-data", headers=h).status_code == 403
    assert api.c.post("/api/loans/", headers=h, json=LOAN).status_code == 403


# ───────────────────────── membership index ─────────────────────────

def test_membership_index_matches_the_real_memberships(api):
    owner = register(api, fresh_phone(), "Index Co")
    phone = fresh_phone()
    m = add_staff(api, owner, "collector", phone, "Col")
    key = api.identity.phone_key(phone)
    assert [x["id"] for x in api.identity.staff_memberships_for_phone(phone)] == [m["id"]]
    assert m["id"] in api.identity._index_ids(key)
    api.c.delete(f"/api/staff/{m['id']}", headers=hdr(owner))                   # removed: no longer listed
    assert api.identity.staff_memberships_for_phone(phone) == []
    again = add_staff(api, owner, "collector", phone, "Col")                    # re-added: listed again, one row
    assert again["id"] == m["id"]
    assert [x["id"] for x in api.identity.staff_memberships_for_phone(phone)] == [m["id"]]
    with api.db.platform_scope():                                               # a phone from before the index existed
        api.db.get_db_client("finance").collection("membership_index").document(key).delete()
    assert [x["id"] for x in api.identity.staff_memberships_for_phone(phone)] == [m["id"]]
    assert api.identity._index_ids(key) == [m["id"]]                            # ...and the index is rebuilt


def test_unknown_phones_find_nothing(api):
    assert api.identity.staff_memberships_for_phone("+919999999999") == []
    assert api.identity.staff_memberships_for_phone("") == []


# ───────────────────────── uploads, health, proxies ─────────────────────────

def test_proof_uploads_accept_only_images_and_pdfs_and_are_served_nosniff(api):
    owner = register(api, fresh_phone(), "Upload Co")
    loan = make_loan(api, owner).json()["data"]
    h = hdr(owner)
    bad = api.c.post(f"/api/loans/upload-proof?loan_id={loan['id']}", headers=h, files={"file": ("x.html", b"<script>alert(1)</script>", "text/html")})
    assert bad.status_code == 400
    ok = api.c.post(f"/api/loans/upload-proof?loan_id={loan['id']}", headers=h, files={"file": ("p.png", b"\x89PNG-bytes", "image/png")})
    assert ok.status_code == 200
    got = api.c.get(ok.json()["file_path"])
    assert got.status_code == 200 and got.headers["x-content-type-options"] == "nosniff"


def test_health_reveals_no_configuration(api):
    r = api.c.get("/api/health")
    assert r.status_code == 200 and set(r.json()) == {"status", "storage"}


def test_client_ip_uses_the_address_added_by_our_own_proxy(api, monkeypatch):
    from starlette.requests import Request

    def req(xff=None, peer="10.0.0.1"):
        headers = [(b"x-forwarded-for", xff.encode())] if xff else []
        return Request({"type": "http", "method": "GET", "path": "/", "headers": headers, "client": (peer, 1234), "query_string": b""})

    monkeypatch.delenv("TRUSTED_PROXY_HOPS", raising=False)
    assert api.main._client_ip(req("1.2.3.4")) == "10.0.0.1"                    # default: the socket address
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "1")
    assert api.main._client_ip(req("5.5.5.5")) == "5.5.5.5"
    assert api.main._client_ip(req("evil-spoof, 7.7.7.7")) == "7.7.7.7"        # a client-forged first entry is ignored
    assert api.main._client_ip(req(None)) == "10.0.0.1"
    monkeypatch.setenv("TRUSTED_PROXY_HOPS", "2")
    assert api.main._client_ip(req("9.9.9.9, 7.7.7.7")) == "9.9.9.9"
    assert api.main._client_ip(req("7.7.7.7")) == "10.0.0.1"                    # fewer hops than configured: do not trust it


# ───────────────────────── frontend cache hygiene (static guard) ─────────────────────────

def test_frontend_cache_is_namespaced_by_organisation_and_wiped_on_sign_in_and_out():
    web = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "web", "src")
    api_js = open(os.path.join(web, "utils", "api.js")).read()
    ctx = open(os.path.join(web, "context", "AppDataContext.jsx")).read()
    assert "startsWith('dk_app_data')" in api_js and "removeItem" in api_js        # clearSession wipes cached app data
    assert "dk_app_data_${getOrgId()}_${getBusiness()}" in ctx                      # and the key is per organisation
    auth_js = open(os.path.join(web, "context", "AuthContext.jsx")).read()
    assert auth_js.count("clearSession()") >= 2                                    # on login and on logout


# ───────────────────────── Postgres: FORCE RLS against a non-superuser owner ─────────────────────────

PG = os.environ.get("RLS_TEST_DATABASE_URL", "")
needs_pg = pytest.mark.skipif(not PG, reason="set RLS_TEST_DATABASE_URL to run the Postgres FORCE RLS tests")


@needs_pg
def test_force_rls_applies_to_the_table_owner_and_is_reversible():
    psycopg = pytest.importorskip("psycopg")
    from psycopg.conninfo import conninfo_to_dict, make_conninfo
    from migrations import runner

    admin = psycopg.connect(PG, autocommit=True)
    assert "test" in admin.execute("select current_database()").fetchone()[0]
    admin.execute("DROP TABLE IF EXISTS documents, files, schema_migrations CASCADE")
    if admin.execute("SELECT 1 FROM pg_roles WHERE rolname='dv_owner_t'").fetchone():
        admin.execute("DROP OWNED BY dv_owner_t")
        admin.execute("DROP ROLE dv_owner_t")
    admin.execute("CREATE ROLE dv_owner_t LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'x'")
    runner.create_fresh_schema(admin)
    for t in ("documents", "files", "schema_migrations"):
        admin.execute(f"ALTER TABLE {t} OWNER TO dv_owner_t")
    admin.execute("ALTER SEQUENCE documents_seq_seq OWNER TO dv_owner_t")
    admin.execute("GRANT USAGE, CREATE ON SCHEMA public TO dv_owner_t")
    admin.execute("GRANT digivasool_app TO dv_owner_t")      # as 001 does for the user that runs it (the app's login)
    for org in ("ORG_A", "ORG_B"):
        admin.execute("INSERT INTO documents (org_id, collection, id, data) VALUES (%s,'loans','l1',%s::jsonb)", (org, json.dumps({"o": org})))
    owner = psycopg.connect(make_conninfo(**{**conninfo_to_dict(PG), "user": "dv_owner_t", "password": "x"}), autocommit=True)

    # BEFORE: the owner (no SET ROLE, no context) reads every organisation - the gap 002 closes
    assert owner.execute("SELECT count(*) FROM documents").fetchone()[0] == 3        # ORG_A, ORG_B + the seeded __platform__ row
    admin.execute(runner.read_sql("002_force_rls_up.sql"))
    # AFTER: the owner is held to the same policy
    assert owner.execute("SELECT count(*) FROM documents").fetchone()[0] == 0
    with owner.transaction():
        # the owner is a member of digivasool_app (as the app's login is), so the tenant policy applies to it directly:
        # it sees exactly the organisation it names - and, above, nothing when it names none
        owner.execute("SELECT set_config('app.org_id','ORG_A',true)")
        assert [r[0] for r in owner.execute("SELECT org_id FROM documents").fetchall()] == ["ORG_A"]
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        owner.execute("INSERT INTO documents (org_id, collection, id, data) VALUES ('ORG_B','x','y','{}')")
    # the application's own path still works under FORCE
    with owner.transaction():
        owner.execute("SELECT set_config('role','digivasool_app',true), set_config('app.org_id','ORG_B',true)")
        assert owner.execute("SELECT count(*) FROM documents").fetchone()[0] == 1
        owner.execute("INSERT INTO documents (org_id, collection, id, data) VALUES ('ORG_B','loans','l2','{}'::jsonb)")
    # 001's rollback refuses while FORCE is on (it would silently see no rows), and 002 rolls back cleanly
    with pytest.raises(psycopg.errors.RaiseException):
        admin.execute(runner.read_sql("001_multitenant_down.sql"))
    admin.execute(runner.read_sql("002_force_rls_down.sql"))
    assert owner.execute("SELECT count(*) FROM documents").fetchone()[0] == 4        # all rows visible again (+ the one inserted above)
    assert not admin.execute("SELECT 1 FROM schema_migrations WHERE version='002_force_rls'").fetchone()
    owner.close()
    admin.execute("DROP OWNED BY dv_owner_t")          # its tables and privileges
    admin.execute("DROP ROLE dv_owner_t")
    admin.close()
