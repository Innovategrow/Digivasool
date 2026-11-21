"""
Role access + admin-preview security tests (SQLite). The admin "preview" of the collector and borrower screens is
purely a frontend display mode: the backend only ever sees the real admin session. These tests call the API
directly and prove that no role, header, query parameter or id can widen access.

Run:  cd backend && .venv/bin/python -m pytest tests/test_role_preview.py -q
"""
from test_multitenant import LOAN, api, hdr, orgs, verify  # noqa: F401  (fixtures + helpers)


def _staff(api, owner, name, role, phone):
    r = api.c.post("/api/staff/", headers=hdr(owner), json={"name": name, "role": role, "phone": phone})
    assert r.status_code == 200, r.text


def _loan(api, owner, name, phone, collectors):
    r = api.c.post("/api/loans/", headers=hdr(owner), json={**LOAN, "customer_name": name, "customer_phone": phone,
                                                             "assigned_collectors": collectors})
    assert r.status_code == 200, r.text
    return r.json()["data"]


# ───────── admin preview reads (uses the real admin session) ─────────

def test_admin_borrower_preview_by_phone_is_org_scoped(api, orgs):
    abc, xyz = hdr(orgs["abc"]), hdr(orgs["xyz"])
    mine = api.c.get("/api/loans/by-customer?phone=9111100001", headers=abc)
    assert mine.status_code == 200 and [l["id"] for l in mine.json()] == [orgs["abc_loan"]["id"]]
    # another organisation's borrower phone returns nothing, and vice versa
    for h, phone in ((abc, "9222200002"), (xyz, "9111100001")):
        r = api.c.get(f"/api/loans/by-customer?phone={phone}", headers=h)
        assert r.status_code == 404 and "id" not in r.text


def test_two_borrowers_with_the_same_name_are_not_merged(api):
    from test_multitenant import register
    owner = register(api, "+919300000001", "Same Name Co")
    _staff(api, owner, "Col X", "collector", "+919300000011")
    a = _loan(api, owner, "Ravi Kumar", "9333300001", ["Col X"])
    b = _loan(api, owner, "Ravi Kumar", "9333300002", ["Col X"])
    got = api.c.get("/api/loans/by-customer?phone=9333300001", headers=hdr(owner)).json()
    assert [l["id"] for l in got] == [a["id"]] and b["id"] not in {l["id"] for l in got}


def test_admin_can_read_borrower_payments_and_all_collector_history(api, orgs):
    abc = hdr(orgs["abc"])
    assert api.c.get(f"/api/loans/{orgs['abc_loan']['id']}/payments", headers=abc).status_code == 200
    assert api.c.get("/api/collector/payments", headers=abc).status_code == 200


# ───────── collector stays inside its assignments ─────────

def test_collector_only_sees_assigned_and_cannot_use_admin_or_borrower_endpoints(api):
    from test_multitenant import register
    owner = register(api, "+919300000002", "Assign Co")
    _staff(api, owner, "Col A", "collector", "+919300000021")
    _staff(api, owner, "Col B", "collector", "+919300000022")
    la = _loan(api, owner, "Alpha", "9333300011", ["Col A"])
    lb = _loan(api, owner, "Beta", "9333300012", ["Col B"])
    col_a = hdr(verify(api, "+919300000021"))
    assert [l["id"] for l in api.c.get("/api/loans/", headers=col_a).json()] == [la["id"]]
    assert api.c.get(f"/api/loans/{la['id']}/payments", headers=col_a).status_code == 200
    assert api.c.get(f"/api/loans/{lb['id']}/payments", headers=col_a).status_code == 403          # unassigned borrower
    assert api.c.get(f"/api/loans/{lb['id']}/media", headers=col_a).status_code == 403
    assert api.c.post(f"/api/loans/{lb['id']}/payments", headers=col_a,
                      json={"amount": 100, "payment_method": "Cash"}).status_code == 403
    assert api.c.get("/api/loans/by-customer?phone=9333300012", headers=col_a).status_code == 403   # admin/borrower only
    assert api.c.get("/api/staff/", headers=col_a).status_code == 403
    assert api.c.get("/api/admin/app-data", headers=col_a).status_code == 403
    # a collector only ever gets its OWN collection history, whatever name it asks for
    col_b_login = verify(api, "+919300000022")
    pay = api.c.post(f"/api/loans/{lb['id']}/payments", headers=hdr(col_b_login), json={"amount": 100, "payment_method": "Cash"})
    assert pay.status_code == 200, pay.text
    mine = api.c.get("/api/collector/payments?collector_name=Col B", headers=col_a).json()
    assert mine == []
    # ...and cannot edit or delete another collector's payment
    pid = api.c.get("/api/collector/payments", headers=hdr(col_b_login)).json()[0]["id"]
    assert api.c.delete(f"/api/collector/payments/{pid}", headers=col_a).status_code == 403
    assert api.c.patch(f"/api/collector/payments/{pid}", headers=col_a,
                       json={"amount": 1, "payment_method": "Cash", "payment_date": "2026-09-02"}).status_code == 403


# ───────── borrower stays inside their own loans ─────────

def test_borrower_sees_only_own_loans_and_nothing_administrative(api):
    from test_multitenant import register
    owner = register(api, "+919300000003", "Borrower Co")
    _staff(api, owner, "Col X", "collector", "+919300000031")
    mine = _loan(api, owner, "Mine", "9333300021", ["Col X"])
    other = _loan(api, owner, "Other", "9333300022", ["Col X"])
    b = hdr(verify(api, "9333300021"))
    assert api.c.get(f"/api/loans/{mine['id']}/payments", headers=b).status_code == 200
    assert api.c.get(f"/api/loans/{other['id']}/payments", headers=b).status_code == 403
    # the by-customer lookup ignores any name/phone a borrower supplies and returns only their own loans
    got = api.c.get("/api/loans/by-customer?name=Other&phone=9333300022", headers=b).json()
    assert [l["id"] for l in got] == [mine["id"]]
    for path in ("/api/loans/", "/api/collector/payments", "/api/staff/", "/api/admin/app-data"):
        assert api.c.get(path, headers=b).status_code == 403, path


# ───────── nothing the client sends can act as a role / preview ─────────

def test_forged_role_org_and_preview_values_grant_nothing(api, orgs):
    col = hdr(verify(api, "+919100000011"))        # ABC's collector
    forged = {**col, "X-Role": "admin", "X-Preview": "collector", "X-Organization-Id": orgs["xyz"]["organization"]["id"]}
    assert api.c.get("/api/staff/?role=admin&preview=admin", headers=forged).status_code in (403, 400)
    names = {l["customer_name"] for l in api.c.get("/api/loans/", headers=forged).json()}
    assert names == {"Abc Borrower"}          # forged headers change nothing: still ABC's assigned borrowers only


def test_unauthenticated_and_garbage_tokens_are_rejected(api, orgs):
    for path in ("/api/loans/", "/api/loans/by-customer?phone=9111100001", "/api/collector/payments"):
        assert api.c.get(path).status_code == 401, path
        assert api.c.get(path, headers={"Authorization": "Bearer not-a-token"}).status_code == 401, path
