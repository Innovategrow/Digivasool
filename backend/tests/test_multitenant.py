"""
Multi-tenant security + regression tests (SQLite). RLS is tested separately against real Postgres
in test_rls_postgres.py.

Run:  cd backend && .venv/bin/python -m pytest tests/test_multitenant.py -q
"""
import importlib
import os
import sys
import tempfile
import threading
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ENV = {
    "DB_BACKEND": "sqlite", "SEED_DEMO_DATA": "true", "OTP_DEV_MODE": "true", "AUTH_SECRET": "test-secret-0123456789-0123456789",
    "ADMIN_USERS": "Owner One:+919000000001,Admin Two:+919000000004",
    "COLLECTOR_USERS": "Col One:+919000000002",
}


@pytest.fixture(scope="module")
def api():
    """A clean app + database for this module only (env restored afterwards)."""
    tmp = tempfile.mkdtemp()
    saved = {k: os.environ.get(k) for k in [*ENV, "DB_PATH", "UPLOAD_DIR", "DATABASE_URL"]}
    os.environ.update({**ENV, "DB_PATH": os.path.join(tmp, "mt.db"), "UPLOAD_DIR": os.path.join(tmp, "uploads")})
    if os.environ.get("MT_TEST_DATABASE_URL"):   # run the whole suite on real Postgres (fresh database, RLS on)
        os.environ.update({"DB_BACKEND": "supabase", "DATABASE_URL": os.environ["MT_TEST_DATABASE_URL"]})
    import auth, config_admins, db, identity, main, otp_store  # noqa: E401
    for m in (config_admins, auth, db, identity, main):
        importlib.reload(m)
    from fastapi.testclient import TestClient
    otp_store._hits.clear()
    with TestClient(main.app) as c:
        yield type("Api", (), {"c": c, "otp": otp_store, "auth": auth, "db": db, "identity": identity, "main": main})
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


def verify(api, phone):
    api.otp._hits.clear()    # the rate limiter has its own test; don't let it get in the way here
    r = api.c.post("/api/auth/request-otp", json={"contact": phone})
    assert r.status_code == 200, r.text
    r = api.c.post("/api/auth/verify-otp", json={"contact": phone, "otp": r.json()["dev_otp"]})
    assert r.status_code == 200, r.text
    return r.json()


def hdr(login):
    return {"Authorization": f"Bearer {login['token']}"}


def register(api, phone, org_name, admin_name="New Owner"):
    v = verify(api, phone)
    assert v["status"] == "register"
    r = api.c.post("/api/organizations/register", json={"registration_token": v["registration_token"],
                                                         "organization_name": org_name, "admin_name": admin_name})
    assert r.status_code == 200, r.text
    return r.json()


LOAN = {
    "customer_id": "C1", "customer_name": "Borrower", "customer_phone": "9876500001", "customer_email": "",
    "customer_address": "1 Main St", "zone": "Z", "loan_amount": 10000, "terms_accepted": True,
    "monthly_interest_amount": 500, "start_date": "2026-09-01", "closing_date": "2026-12-01",
    "repayment_frequency": "daily", "repayment_amount": 250, "assigned_collectors": ["Col X"],
}


def make_org(api, phone, name, borrower, borrower_phone, collector_phone):
    """Register an organisation, add a collector and create one loan. Returns (owner_login, loan)."""
    owner = register(api, phone, name)
    h = hdr(owner)
    assert api.c.post("/api/staff/", headers=h, json={"name": "Col X", "role": "collector", "phone": collector_phone}).status_code == 200
    r = api.c.post("/api/loans/", headers=h, json={**LOAN, "customer_name": borrower, "customer_phone": borrower_phone})
    assert r.status_code == 200, r.text
    return owner, r.json()["data"]


@pytest.fixture(scope="module")
def orgs(api):
    abc, abc_loan = make_org(api, "+919100000001", "ABC Finance", "Abc Borrower", "9111100001", "+919100000011")
    xyz, xyz_loan = make_org(api, "+919100000002", "XYZ Finance", "Xyz Borrower", "9222200002", "+919100000012")
    return {"abc": abc, "xyz": xyz, "abc_loan": abc_loan, "xyz_loan": xyz_loan}


# ───────────────────────── A. existing data keeps working ─────────────────────────

def test_existing_admin_phone_opens_legacy_org(api):
    v = verify(api, "+919000000001")
    assert v["status"] == "ok" and v["organization"]["id"] == "ORG_001"
    assert v["member_role"] == "OWNER" and v["role"] == "admin"
    claims = api.auth.decode_token(v["token"])
    assert claims["org_id"] == "ORG_001" and claims["membership_id"] and claims["phone_number"] and claims["sub"]
    assert claims["exp"] > claims["iat"]


def test_second_existing_admin_and_collector_migrated_without_duplicates(api):
    assert verify(api, "+919000000004")["member_role"] == "ADMIN"
    c = verify(api, "+919000000002")
    assert c["role"] == "collector" and c["organization"]["id"] == "ORG_001"
    ms = api.identity.org_memberships("ORG_001")
    assert sorted(m["phone_key"] for m in ms) == sorted(set(m["phone_key"] for m in ms))   # no duplicates
    api.identity.seed_legacy_org()  # idempotent
    assert len(api.identity.org_memberships("ORG_001")) == len(ms)


def test_existing_loans_payments_and_books_intact(api):
    h = hdr(verify(api, "+919000000001"))
    loans = {l["id"]: l for l in api.c.get("/api/loans/", headers=h).json()}
    assert {"l-1001", "l-1002"} <= set(loans)
    assert loans["l-1001"]["collected_amount"] == 15000 and loans["l-1001"]["pending_amount"] == 38000
    pays = api.c.get("/api/loans/l-1001/payments", headers=h).json()
    assert sorted(p["amount"] for p in pays) == [5000.0, 10000.0]
    # Finance and Fund stay separate
    assert api.c.get("/api/loans/", headers={**h, "X-Business": "fund"}).json() == []


# ───────────────────────── B. organisation isolation ─────────────────────────

def test_new_orgs_get_unique_ids_and_cannot_see_legacy_data(api, orgs):
    assert orgs["abc"]["organization"]["id"] != orgs["xyz"]["organization"]["id"]
    assert orgs["abc"]["member_role"] == "OWNER"
    names = {l["customer_name"] for l in api.c.get("/api/loans/", headers=hdr(orgs["abc"])).json()}
    assert names == {"Abc Borrower"}          # not the legacy borrowers, not XYZ's


def test_admin_cannot_read_or_change_other_org_loans(api, orgs):
    abc, xyz_loan = hdr(orgs["abc"]), orgs["xyz_loan"]["id"]
    r = api.c.get(f"/api/loans/{xyz_loan}/payments", headers=abc)
    assert r.status_code in (403, 404) or r.json() == []         # nothing of XYZ's is ever returned
    assert api.c.get(f"/api/loans/{xyz_loan}/media", headers=abc).status_code == 404
    assert api.c.patch(f"/api/loans/{xyz_loan}", headers=abc, json={"customer_name": "Hacked"}).status_code == 404
    assert api.c.delete(f"/api/loans/{xyz_loan}", headers=abc).status_code == 404
    assert api.c.delete(f"/api/loans/{xyz_loan}/permanent", headers=abc).status_code == 404
    assert api.c.post(f"/api/loans/{xyz_loan}/close", headers=abc).status_code == 404
    pay = api.c.post(f"/api/loans/{xyz_loan}/payments", headers=abc, json={"amount": 100, "payment_method": "Cash"})
    assert pay.status_code == 404
    # ...and XYZ's data is untouched
    got = api.c.get("/api/loans/", headers=hdr(orgs["xyz"])).json()
    assert got[0]["customer_name"] == "Xyz Borrower" and got[0]["collected_amount"] == 0


def test_other_org_staff_reports_and_audit_are_invisible(api, orgs):
    abc = hdr(orgs["abc"])
    staff_phones = {s["phone"] for s in api.c.get("/api/staff/", headers=abc).json()}
    assert "+919100000012" not in staff_phones and "+919100000002" not in staff_phones
    assert all("Xyz" not in str(l) for l in api.c.get("/api/admin/app-data", headers=abc).json()["loans"])
    audit = api.c.get("/api/admin/audit-log?limit=200", headers=abc).json()
    assert audit and all("XYZ" not in str(a) and "Xyz" not in str(a) for a in audit)
    assert api.c.get("/api/reports/export.xlsx", headers=abc).status_code == 200
    # the legacy-org Google-Sheet backup endpoints are not exposed to other organisations
    assert api.c.get("/api/admin/sheet-backup", headers=abc).json()["enabled"] is False


def test_other_org_collector_cannot_reach_data(api, orgs):
    col = hdr(verify(api, "+919100000012"))        # XYZ's collector
    mine = api.c.get("/api/loans/", headers=col).json()
    assert [l["customer_name"] for l in mine] == ["Xyz Borrower"]
    r = api.c.get(f"/api/loans/{orgs['abc_loan']['id']}/payments", headers=col)
    assert r.status_code in (403, 404) or r.json() == []
    assert api.c.get("/api/staff/", headers=col).status_code == 403            # collectors never manage staff
    assert api.c.post("/api/staff/", headers=col, json={"name": "Evil", "role": "admin", "phone": "+919888888888"}).status_code == 403


def test_documents_are_private_and_organisation_scoped(api, orgs):
    abc, xyz = hdr(orgs["abc"]), hdr(orgs["xyz"])
    up = api.c.post(f"/api/loans/upload-proof?loan_id={orgs['xyz_loan']['id']}", headers=xyz,
                    files={"file": ("proof.png", b"\x89PNG-secret-bytes", "image/png")})
    assert up.status_code == 200, up.text
    url = up.json()["file_path"]                       # the API hands back a signed, expiring link
    assert "?o=" in url and "&s=" in url and url.startswith("/uploads/ORG_")
    bare = url.split("?")[0]
    assert api.c.get(url).content == b"\x89PNG-secret-bytes"             # signed link works (for <img src>)
    assert api.c.get(bare).status_code == 401                           # no token, no signature
    assert api.c.get(bare, headers=xyz).content == b"\x89PNG-secret-bytes"
    assert api.c.get(bare, headers=abc).status_code == 404              # other organisation
    tampered = url.replace(orgs["xyz"]["organization"]["id"], orgs["abc"]["organization"]["id"])
    assert api.c.get(tampered).status_code in (401, 404)
    expired = bare + "?o=%s&e=1&s=%s" % (orgs["xyz"]["organization"]["id"], "0" * 40)
    assert api.c.get(expired).status_code in (401, 404)
    # legacy un-prefixed files belong to the legacy organisation only
    assert api.c.get("/uploads/l-1001/old.png", headers=abc).status_code == 404


def test_client_supplied_org_is_rejected(api, orgs):
    abc = hdr(orgs["abc"])
    other = orgs["xyz"]["organization"]["id"]
    assert api.c.get("/api/loans/", headers={**abc, "X-Org-Id": other}).status_code == 403
    assert api.c.get(f"/api/loans/?org_id={other}", headers=abc).status_code == 403
    assert api.c.get(f"/api/loans/?organization_id={other}", headers=abc).status_code == 403
    mine = orgs["abc"]["organization"]["id"]
    assert api.c.get("/api/loans/", headers={**abc, "X-Org-Id": mine}).status_code == 200   # matching value is harmless


# ───────────────────────── C. authentication ─────────────────────────

def test_invalid_otp_and_rate_limits(api):
    api.c.post("/api/auth/request-otp", json={"contact": "+919555555555"})
    assert api.c.post("/api/auth/verify-otp", json={"contact": "+919555555555", "otp": "000000"}).status_code == 401
    assert api.c.post("/api/auth/request-otp", json={"contact": "123"}).status_code == 400
    codes = [api.c.post("/api/auth/request-otp", json={"contact": "+919666666666"}).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and 429 in codes[5:]


def test_bad_tokens_are_rejected(api, orgs):
    good = orgs["abc"]["token"]
    head, body, sig = good.split(".")
    now = int(time.time())
    expired = api.auth._encode({"typ": "session", "org_id": "ORG_001", "role": "admin", "phone_number": "1", "name": "x", "iat": now - 99, "exp": now - 1})
    no_org = api.auth._encode({"typ": "session", "role": "admin", "phone_number": "1", "name": "x", "iat": now, "exp": now + 99})
    forged = f"{head}.{body}.{'A' * len(sig)}"
    import base64, json
    none_alg = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode() + f".{body}."
    reg = api.auth.issue_short_token("register", "+919123456789")
    sel = api.auth.issue_short_token("select", "+919123456789")
    for bad in (expired, no_org, forged, none_alg, reg, sel, "garbage"):
        assert api.c.get("/api/loans/", headers={"Authorization": f"Bearer {bad}"}).status_code == 401, bad[:30]
    # a token naming an organisation that does not exist is useless
    ghost = api.auth.issue_token("admin", "x", "+919000000099", org_id="ORG_999", membership_id="ORG_999:9000000099")
    assert api.c.get("/api/loans/", headers={"Authorization": f"Bearer {ghost}"}).status_code == 401


def test_multiple_memberships_trigger_org_selection_and_are_verified(api, orgs):
    phone = "+919100000012"   # already XYZ's collector; make them ABC's collector as well
    assert api.c.post("/api/staff/", headers=hdr(orgs["abc"]), json={"name": "Shared Person", "role": "collector", "phone": phone}).status_code == 200
    v = verify(api, phone)
    assert v["status"] == "select_org" and len(v["organizations"]) == 2
    abc_id, xyz_id = orgs["abc"]["organization"]["id"], orgs["xyz"]["organization"]["id"]
    assert {o["organization_id"] for o in v["organizations"]} == {abc_id, xyz_id}
    pick = api.c.post("/api/organizations/select", json={"selection_token": v["selection_token"], "organization_id": abc_id})
    assert pick.status_code == 200 and pick.json()["organization"]["id"] == abc_id
    assert api.auth.decode_token(pick.json()["token"])["org_id"] == abc_id
    # an organisation they do NOT belong to
    assert api.c.post("/api/organizations/select", json={"selection_token": v["selection_token"], "organization_id": "ORG_001"}).status_code == 403
    # a session token is not a selection token
    assert api.c.post("/api/organizations/select", json={"selection_token": pick.json()["token"], "organization_id": xyz_id}).status_code == 401
    # switching needs a real membership too
    h = {"Authorization": f"Bearer {pick.json()['token']}"}
    assert api.c.post("/api/organizations/switch", headers=h, json={"organization_id": xyz_id}).status_code == 200
    assert api.c.post("/api/organizations/switch", headers=h, json={"organization_id": "ORG_001"}).status_code == 403
    assert len(api.c.get("/api/organizations/my-memberships", headers=h).json()) == 2


def test_removed_collector_loses_access_immediately_and_logout_revokes(api, orgs):
    owner = hdr(orgs["xyz"])
    api.c.post("/api/staff/", headers=owner, json={"name": "Temp Col", "role": "collector", "phone": "+919100000077"})
    tmp = verify(api, "+919100000077")
    assert api.c.get("/api/loans/", headers=hdr(tmp)).status_code == 200
    staff = next(s for s in api.c.get("/api/staff/", headers=owner).json() if s["phone"] == "+919100000077")
    assert api.c.delete(f"/api/staff/{staff['id']}", headers=owner).status_code == 200
    assert api.c.get("/api/loans/", headers=hdr(tmp)).status_code == 401
    # logout ends the session on the server
    me = verify(api, "+919100000001")
    assert api.c.get("/api/loans/", headers=hdr(me)).status_code == 200
    assert api.c.post("/api/auth/logout", headers=hdr(me)).status_code == 200
    assert api.c.get("/api/loans/", headers=hdr(me)).status_code == 401
    assert api.c.get("/api/loans/", headers=hdr(verify(api, "+919100000001"))).status_code == 200   # fresh login works
    # refresh keeps a valid session going
    fresh = verify(api, "+919100000001")
    r = api.c.post("/api/auth/refresh", headers=hdr(fresh))
    assert r.status_code == 200 and api.c.get("/api/loans/", headers=hdr(r.json())).status_code == 200


def test_borrower_login_is_scoped_to_the_lenders_org(api, orgs):
    v = verify(api, "9111100001")                      # ABC's borrower
    assert v["role"] == "borrower" and v["organization"]["id"] == orgs["abc"]["organization"]["id"]
    h = hdr(v)
    assert api.c.get(f"/api/loans/{orgs['abc_loan']['id']}/payments", headers=h).status_code == 200
    r = api.c.get(f"/api/loans/{orgs['xyz_loan']['id']}/payments", headers=h)
    assert r.status_code in (403, 404) or r.json() == []
    assert api.c.get("/api/loans/", headers=h).status_code == 403


def test_role_rules_owner_admin_collector(api, orgs):
    owner = hdr(verify(api, "+919100000001"))        # fresh login: an earlier test logged this owner out everywhere
    assert api.c.post("/api/staff/", headers=owner, json={"name": "Admin B", "role": "admin", "phone": "+919100000088"}).status_code == 200
    admin_b = hdr(verify(api, "+919100000088"))
    assert api.c.post("/api/staff/", headers=admin_b, json={"name": "Admin C", "role": "admin", "phone": "+919100000089"}).status_code == 403   # only the owner adds admins
    assert api.c.post("/api/staff/", headers=admin_b, json={"name": "Col Y", "role": "collector", "phone": "+919100000090"}).status_code == 200
    rows = api.c.get("/api/staff/", headers=owner).json()
    owner_row = next(s for s in rows if s["member_role"] == "OWNER")
    assert api.c.delete(f"/api/staff/{owner_row['id']}", headers=admin_b).status_code in (400, 403)
    assert api.c.delete(f"/api/staff/{owner_row['id']}", headers=owner).status_code == 400          # owner can't remove self
    assert api.c.post("/api/staff/", headers=owner, json={"name": "Col Y", "role": "collector", "phone": "+919100000090"}).status_code == 400   # duplicate
    # ownership transfer
    b_row = next(s for s in rows if s["phone"] == "+919100000088")
    assert api.c.post(f"/api/staff/{b_row['id']}/make-owner", headers=admin_b).status_code == 403
    assert api.c.post(f"/api/staff/{b_row['id']}/make-owner", headers=owner).status_code == 200
    assert verify(api, "+919100000088")["member_role"] == "OWNER" and verify(api, "+919100000001")["member_role"] == "ADMIN"
    # the OLD owner's still-unexpired token must not keep owner powers (role comes from the database, not the token)
    assert api.c.post(f"/api/staff/{b_row['id']}/make-owner", headers=owner).status_code == 403
    assert api.c.post("/api/organizations/request-deletion", headers=owner).status_code == 403
    # ...and the new owner's pre-transfer token (issued while ADMIN) now works as owner
    me_row = next(s for s in api.c.get("/api/staff/", headers=admin_b).json() if s["phone"] == "+919100000001")
    assert api.c.post(f"/api/staff/{me_row['id']}/make-owner", headers=admin_b).status_code == 200   # hand it back


def test_account_and_organisation_deletion_paths(api, orgs):
    zed = register(api, "+919100000003", "Zed Finance")
    h = hdr(zed)
    api.c.post("/api/staff/", headers=h, json={"name": "Leaver", "role": "collector", "phone": "+919100000044"})
    leaver = hdr(verify(api, "+919100000044"))
    assert api.c.post("/api/account/delete", headers=h).status_code == 400          # owner must delete the org instead
    assert api.c.post("/api/account/delete", headers=leaver).status_code == 200
    assert api.c.get("/api/loans/", headers=leaver).status_code == 401
    assert api.c.post("/api/organizations/request-deletion", headers=leaver).status_code in (401, 403)
    r = api.c.post("/api/organizations/request-deletion", headers=h)
    assert r.status_code == 200 and r.json()["status"] == "deletion_requested"
    assert api.c.get("/api/loans/", headers=h).status_code == 401                    # locked, nothing erased
    assert api.identity.get_org(zed["organization"]["id"])["status"] == "deletion_requested"


# ───────────────────────── E. concurrency, background work, fail-closed ─────────────────────────

def test_concurrent_requests_never_leak_context(api, orgs):
    # fresh logins: earlier tests logged some of these owners out
    heads = {"abc": hdr(verify(api, "+919100000001")), "xyz": hdr(verify(api, "+919100000002"))}
    expect = {"abc": "Abc Borrower", "xyz": "Xyz Borrower"}
    errors, rounds = [], []

    def worker(which):
        try:
            for _ in range(25):
                r = api.c.get("/api/loans/", headers=heads[which])
                if r.status_code != 200:
                    errors.append((which, r.status_code, r.text[:80]))
                    return
                names = {l["customer_name"] for l in r.json()}
                if names != {expect[which]}:
                    errors.append((which, names))
                rounds.append(1)
        except Exception as e:  # a crashed worker must fail the test, not vanish
            errors.append((which, repr(e)))

    threads = [threading.Thread(target=worker, args=(w,)) for w in ("abc", "xyz") * 4]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not errors, errors[:3]
    assert len(rounds) == 8 * 25


def test_context_is_per_thread_and_fails_closed(api):
    db = api.db
    seen = {}

    def other():
        with db.as_org("ORG_001"):
            time.sleep(0.05)
            seen["other"] = db.get_current_org()

    t = threading.Thread(target=other)
    with db.as_org("ORG_123"):
        t.start()
        time.sleep(0.01)
        assert db.get_current_org() == "ORG_123"
        t.join()
    assert seen["other"] == "ORG_001"
    with pytest.raises(db.OrgContextError):
        db.get_db_client().collection("loans").get()          # no organisation -> refuses, never "all orgs"


def test_background_media_migration_stays_inside_its_org(api, orgs):
    main, db = api.main, api.db
    abc_id, xyz_id = orgs["abc"]["organization"]["id"], orgs["xyz"]["organization"]["id"]
    from tests_helpers import tiny_photo_data_url
    photo = tiny_photo_data_url()
    with db.as_org(abc_id):
        db.get_db_client().collection("loans").document(orgs["abc_loan"]["id"]).update({"photo_url": photo})
    main._migrate_loan_media(abc_id, "finance", [orgs["abc_loan"]["id"]])        # runs on a worker, no request context
    with db.as_org(abc_id):
        assert db.get_db_client().collection("loan_media").document(orgs["abc_loan"]["id"]).get().exists
    with db.as_org(xyz_id):
        assert not db.get_db_client().collection("loan_media").document(orgs["abc_loan"]["id"]).get().exists


def test_unauthenticated_endpoints_expose_nothing(api):
    for path in ("/api/loans/", "/api/staff/", "/api/collectors/", "/api/books", "/api/admin/app-data", "/api/organizations/current"):
        assert api.c.get(path).status_code == 401, path
    assert api.c.get("/api/health").status_code == 200
