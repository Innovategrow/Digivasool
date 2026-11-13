"""A new user asking to join an organisation needs an admin's approval first."""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_subscription import add_staff, api, fresh_phone, hdr, make_loan, register, verify  # noqa: E402,F401


def ask(api, phone, org_code, name="New Person", token=None):
    v = None if token else verify(api, phone)
    tok = token or v.get("registration_token") or v.get("selection_token")
    return api.c.post("/api/organizations/join-request", json={"registration_token": tok, "organization_code": org_code, "name": name}), v


def pending(api, owner):
    r = api.c.get("/api/organizations/join-requests", headers=hdr(owner))
    assert r.status_code == 200, r.text
    return r.json()


def test_a_join_request_gives_no_access_until_approved(api):
    owner = register(api, fresh_phone(), "Join Co")
    org = owner["organization"]["id"]
    phone = fresh_phone()
    r, v = ask(api, phone, org, "Raju")
    assert r.status_code == 200 and r.json()["status"] == "pending" and r.json()["organization_name"] == "Join Co"
    # still no membership: signing in again does NOT get them in (they are offered "register", plus a "pending" note)
    again = verify(api, phone)
    assert again["status"] == "register" and again["pending_requests"][0]["organization_name"] == "Join Co"
    assert api.identity.staff_memberships_for_phone(phone) == []
    # the admin sees it
    rows = pending(api, owner)
    assert len(rows) == 1 and rows[0]["name"] == "Raju" and rows[0]["phone"] == phone


def test_asking_twice_does_not_duplicate_the_request(api):
    owner = register(api, fresh_phone(), "Dup Join Co")
    org, phone = owner["organization"]["id"], fresh_phone()
    v = verify(api, phone)
    for _ in range(3):
        assert ask(api, phone, org, "Same Person", token=v["registration_token"])[0].status_code == 200
    assert len(pending(api, owner)) == 1


def test_admin_approves_as_collector_and_the_person_can_then_sign_in(api):
    owner = register(api, fresh_phone(), "Approve Co")
    org, phone = owner["organization"]["id"], fresh_phone()
    ask(api, phone, org, "Meena")
    rid = pending(api, owner)[0]["id"]
    r = api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(owner), json={"role": "collector"})
    assert r.status_code == 200 and r.json()["role"] == "collector"
    assert pending(api, owner) == []
    login = verify(api, phone)
    assert login["status"] == "ok" and login["role"] == "collector" and login["organization"]["id"] == org and login["name"] == "Meena"
    assert any(s["phone"] == phone for s in api.c.get("/api/staff/", headers=hdr(owner)).json())     # shows in Staff too
    assert make_loan(api, owner).status_code == 200                                                # org still healthy


def test_only_the_owner_can_approve_someone_as_admin(api):
    owner = register(api, fresh_phone(), "Role Join Co")
    org = owner["organization"]["id"]
    admin_phone = fresh_phone()
    add_staff(api, owner, "admin", admin_phone)
    admin = verify(api, admin_phone)
    ask(api, fresh_phone(), org, "Wants Admin")
    rid = pending(api, owner)[0]["id"]
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(admin), json={"role": "admin"}).status_code == 403
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(admin), json={"role": "collector"}).status_code == 200   # admins may add collectors
    ask(api, fresh_phone(), org, "Second Person")
    rid2 = pending(api, owner)[0]["id"]
    assert api.c.post(f"/api/organizations/join-requests/{rid2}/approve", headers=hdr(owner), json={"role": "admin"}).status_code == 200


def test_collectors_cannot_see_or_approve_requests(api):
    owner = register(api, fresh_phone(), "Collector Join Co")
    org, col_phone = owner["organization"]["id"], fresh_phone()
    add_staff(api, owner, "collector", col_phone, "Col")
    col = verify(api, col_phone)
    ask(api, fresh_phone(), org, "Someone")
    rid = pending(api, owner)[0]["id"]
    assert api.c.get("/api/organizations/join-requests", headers=hdr(col)).status_code == 403
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(col), json={}).status_code == 403
    assert api.c.post(f"/api/organizations/join-requests/{rid}/deny", headers=hdr(col)).status_code == 403
    assert len(pending(api, owner)) == 1


def test_denied_requests_give_no_access_and_can_be_asked_again(api):
    owner = register(api, fresh_phone(), "Deny Co")
    org, phone = owner["organization"]["id"], fresh_phone()
    ask(api, phone, org, "Nope")
    rid = pending(api, owner)[0]["id"]
    assert api.c.post(f"/api/organizations/join-requests/{rid}/deny", headers=hdr(owner)).status_code == 200
    assert pending(api, owner) == [] and verify(api, phone)["status"] == "register"
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(owner), json={}).status_code == 404   # already resolved
    assert ask(api, phone, org, "Nope Again")[0].status_code == 200
    assert len(pending(api, owner)) == 1


def test_one_organisation_cannot_approve_another_organisations_request(api):
    a, b = register(api, fresh_phone(), "Org A Join"), register(api, fresh_phone(), "Org B Join")
    phone = fresh_phone()
    ask(api, phone, a["organization"]["id"], "For A")
    rid = pending(api, a)[0]["id"]
    assert pending(api, b) == []
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(b), json={}).status_code == 404
    assert api.c.post(f"/api/organizations/join-requests/{rid}/deny", headers=hdr(b)).status_code == 404
    assert api.identity.staff_memberships_for_phone(phone) == []


def test_bad_requests_are_rejected(api):
    owner = register(api, fresh_phone(), "Bad Join Co")
    org = owner["organization"]["id"]
    assert ask(api, fresh_phone(), "ORG_9999")[0].status_code == 400                       # no such organisation
    assert api.c.post("/api/organizations/join-request", json={"registration_token": "garbage", "organization_code": org, "name": "X Y"}).status_code == 401
    session_token = owner["token"]                                                        # a session token is not proof of a fresh OTP
    assert api.c.post("/api/organizations/join-request", json={"registration_token": session_token, "organization_code": org, "name": "X Y"}).status_code == 401
    other = register(api, fresh_phone(), "Other Join Co")                                 # a person in two organisations...
    add_staff(api, other, "admin", owner["phone"])
    r, _ = ask(api, owner["phone"], org)                                                  # ...asking for one they are already in
    assert r.status_code == 400 and "already a member" in r.json()["detail"]
    # lower-case code works; a locked (deletion requested) organisation does not accept requests
    assert ask(api, fresh_phone(), org.lower())[0].status_code == 200
    api.identity.set_org_status(org, "deletion_requested")
    assert ask(api, fresh_phone(), org)[0].status_code == 400


def test_approving_is_blocked_while_the_subscription_is_read_only_but_denying_is_not(api):
    from test_subscription import expire
    owner = register(api, fresh_phone(), "RO Join Co")
    org = owner["organization"]["id"]
    ask(api, fresh_phone(), org, "Waiting One")
    ask(api, fresh_phone(), org, "Waiting Two")
    expire(api, owner)
    rows = pending(api, owner)
    assert api.c.post(f"/api/organizations/join-requests/{rows[0]['id']}/approve", headers=hdr(owner), json={}).status_code == 402
    assert api.c.post(f"/api/organizations/join-requests/{rows[1]['id']}/deny", headers=hdr(owner)).status_code == 200


def test_a_duplicate_collector_name_asks_the_admin_to_rename(api):
    owner = register(api, fresh_phone(), "Name Clash Co")
    org = owner["organization"]["id"]
    add_staff(api, owner, "collector", fresh_phone(), "Ravi")
    ask(api, fresh_phone(), org, "Ravi")
    rid = pending(api, owner)[0]["id"]
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(owner), json={}).status_code == 400
    assert api.c.post(f"/api/organizations/join-requests/{rid}/approve", headers=hdr(owner), json={"name": "Ravi Kumar"}).status_code == 200
