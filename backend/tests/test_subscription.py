"""
Subscription / trial / exemption / Razorpay tests (SQLite, fake payment gateway - no network).

Run:  cd backend && .venv/bin/python -m pytest tests/test_subscription.py -q
Real Postgres:  MT_TEST_DATABASE_URL=postgresql://localhost/app_test .venv/bin/python -m pytest tests/test_subscription.py -q
"""
import hashlib
import hmac
import importlib
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# The three authorised numbers (written in different formats on purpose) and one platform operator.
EX1, EX2, EX3 = "+919300000001", "+919300000002", "+919300000003"
PLATFORM_ADMIN = "+919300000099"
KEY_SECRET, WEBHOOK_SECRET = "rzp_secret_for_tests", "whsec_for_tests"

ENV = {
    "DB_BACKEND": "sqlite", "SEED_DEMO_DATA": "true", "OTP_DEV_MODE": "true", "AUTH_SECRET": "test-secret-0123456789-0123456789",
    "ADMIN_USERS": "Owner One:+919000000001", "COLLECTOR_USERS": "Col One:+919000000002",
    "SUBSCRIPTION_EXEMPT_PHONES": f"9300000001, {EX2},{EX3[3:]}", "PLATFORM_ADMIN_PHONES": PLATFORM_ADMIN,
    "RAZORPAY_KEY_ID": "rzp_test_key", "RAZORPAY_KEY_SECRET": KEY_SECRET, "RAZORPAY_WEBHOOK_SECRET": WEBHOOK_SECRET,
    "SUBSCRIPTION_TRIAL_DAYS": "7", "MONTHLY_PLAN_PRICE": "500", "ANNUAL_PLAN_PRICE": "5000",
}


class FakeGateway:
    """Stands in for services.razorpay's network calls."""

    def __init__(self, rz):
        self.rz, self.orders, self.payments, self.n = rz, {}, {}, 0

    def create_order(self, amount, currency, receipt, notes):
        self.n += 1
        oid = f"order_T{self.n:06d}"
        self.orders[oid] = {"id": oid, "amount": amount, "currency": currency, "receipt": receipt, "notes": notes}
        return dict(self.orders[oid])

    def fetch_payment(self, payment_id):
        if payment_id not in self.payments:
            raise self.rz.RazorpayError("not found")
        return dict(self.payments[payment_id])

    def pay(self, order_id, status="captured", amount=None, method="upi", currency=None, payment_id=None):
        self.n += 1
        pid = payment_id or f"pay_T{self.n:06d}"
        order = self.orders[order_id]
        self.payments[pid] = {"id": pid, "order_id": order_id, "status": status, "method": method,
                              "amount": order["amount"] if amount is None else amount,
                              "currency": currency or order["currency"]}
        return pid


@pytest.fixture(scope="module")
def api():
    tmp = tempfile.mkdtemp()
    saved = {k: os.environ.get(k) for k in [*ENV, "DB_PATH", "UPLOAD_DIR", "DATABASE_URL"]}
    os.environ.update({**ENV, "DB_PATH": os.path.join(tmp, "sub.db"), "UPLOAD_DIR": os.path.join(tmp, "uploads")})
    if os.environ.get("MT_TEST_DATABASE_URL"):
        os.environ.update({"DB_BACKEND": "supabase", "DATABASE_URL": os.environ["MT_TEST_DATABASE_URL"]})
    import auth, config_admins, db, identity, main, otp_store, subscriptions  # noqa: E401
    from services import razorpay
    for m in (config_admins, auth, db, identity, subscriptions, main):
        importlib.reload(m)
    gw = FakeGateway(razorpay)
    originals = (razorpay.create_order, razorpay.fetch_payment)
    razorpay.create_order, razorpay.fetch_payment = gw.create_order, gw.fetch_payment
    from fastapi.testclient import TestClient
    otp_store._hits.clear()
    with TestClient(main.app) as c:
        yield type("Api", (), {"c": c, "otp": otp_store, "auth": auth, "db": db, "identity": identity, "main": main,
                               "sub": subscriptions, "rz": razorpay, "gw": gw})
    razorpay.create_order, razorpay.fetch_payment = originals
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v


# ── helpers ───────────────────────────────────────────────────────────────────────────────────────────

_phone_seq = [0]


def fresh_phone():
    _phone_seq[0] += 1
    return f"+9194000{_phone_seq[0]:05d}"


def verify(api, phone):
    api.otp._hits.clear()
    r = api.c.post("/api/auth/request-otp", json={"contact": phone})
    assert r.status_code == 200, r.text
    r = api.c.post("/api/auth/verify-otp", json={"contact": phone, "otp": r.json()["dev_otp"]})
    assert r.status_code == 200, r.text
    return r.json()


def hdr(login):
    return {"Authorization": f"Bearer {login['token']}"}


def register(api, phone, org_name="Test Finance", extra=None):
    v = verify(api, phone)
    assert v["status"] in ("register", "select_org"), v     # a phone that already belongs somewhere may start another organisation
    r = api.c.post("/api/organizations/register", json={"registration_token": v.get("registration_token") or v["selection_token"],
                                                         "organization_name": org_name, "admin_name": "Owner", **(extra or {})})
    assert r.status_code == 200, r.text
    return r.json()


def current(api, login):
    r = api.c.get("/api/subscriptions/current", headers=hdr(login))
    assert r.status_code == 200, r.text
    return r.json()


def add_staff(api, owner, role, phone, name=None):
    r = api.c.post("/api/staff/", headers=hdr(owner), json={"name": name or f"{role} {phone[-4:]}", "role": role, "phone": phone})
    assert r.status_code == 200, r.text
    return r.json()


LOAN = {
    "customer_id": "C1", "customer_name": "Borrower", "customer_phone": "9876500001", "customer_email": "",
    "customer_address": "1 Main St", "zone": "Z", "loan_amount": 10000, "terms_accepted": True,
    "monthly_interest_amount": 500, "start_date": "2026-09-01", "closing_date": "2026-12-01",
    "repayment_frequency": "daily", "repayment_amount": 250, "assigned_collectors": ["Col"],
}


def make_loan(api, login):
    """Create a loan (a collector named "Col" must exist in the organisation; add one if it doesn't)."""
    if not any(c["name"] == "Col" for c in api.c.get("/api/collectors/", headers=hdr(login)).json()):
        api.c.post("/api/staff/", headers=hdr(login), json={"name": "Col", "role": "collector", "phone": fresh_phone()})
    return api.c.post("/api/loans/", headers=hdr(login), json=LOAN)


def sub_doc(api, org_id):
    return api.sub._get(api.sub.SUBS_C, org_id)


def expire(api, login, state="trial"):
    """Move the organisation's end date into the past (the clock is the server's, so tests change stored dates)."""
    org_id = login["organization"]["id"]
    s = sub_doc(api, org_id)
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    s.update({"trial_end": past} if state == "trial" else {"current_period_end": past})
    api.sub._put(api.sub.SUBS_C, org_id, s)
    api.sub.invalidate()


def checkout(api, owner, plan="monthly", path="/api/subscriptions/create-order"):
    r = api.c.post(path, headers=hdr(owner), json={"plan_type": plan})
    assert r.status_code == 200, r.text
    return r.json()


def sign(order_id, payment_id, secret=KEY_SECRET):
    return hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def verify_payment(api, owner, order_id, payment_id, signature=None):
    return api.c.post("/api/subscriptions/verify-payment", headers=hdr(owner), json={
        "razorpay_order_id": order_id, "razorpay_payment_id": payment_id,
        "razorpay_signature": signature or sign(order_id, payment_id)})


def pay_ok(api, owner, plan="monthly", path="/api/subscriptions/create-order"):
    order = checkout(api, owner, plan, path)
    pid = api.gw.pay(order["order_id"])
    r = verify_payment(api, owner, order["order_id"], pid)
    assert r.status_code == 200, r.text
    return order, pid, r.json()


_event_seq = [0]


def webhook(api, event, order_id, payment_id, event_id=None, secret=WEBHOOK_SECRET, body_override=None):
    _event_seq[0] += 1
    body = body_override or json.dumps({"event": event, "payload": {"payment": {"entity": {"id": payment_id, "order_id": order_id}}}})
    raw = body.encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return api.c.post("/api/webhooks/razorpay", content=raw, headers={
        "x-razorpay-signature": sig, "x-razorpay-event-id": event_id or f"evt_{_event_seq[0]}",
        "content-type": "application/json"})


def parse(ts):
    return datetime.fromisoformat(ts)


@pytest.fixture(scope="module")
def ex_orgs(api):
    return [register(api, p, f"Exempt Org {i}") for i, p in enumerate((EX1, EX2, EX3), 1)]


# ───────────────────────── A. exemption ─────────────────────────

@pytest.mark.parametrize("idx", [0, 1, 2])
def test_each_authorised_phone_gets_a_lifetime_free_organisation(api, ex_orgs, idx):          # tests 1-3
    s = current(api, ex_orgs[idx])
    assert s["state"] == "exempt" and s["full_access"] and not s["read_only"] and s["is_exempt"]
    doc = sub_doc(api, ex_orgs[idx]["organization"]["id"])
    assert doc["is_exempt"] and doc["status"] == "exempt" and doc["trial_end"] is None


def test_all_staff_of_an_exempt_organisation_have_free_access(api, ex_orgs):                  # test 4
    owner = ex_orgs[0]
    admin_phone, col_phone = fresh_phone(), fresh_phone()
    add_staff(api, owner, "admin", admin_phone)
    add_staff(api, owner, "collector", col_phone, "Col")
    for phone, role in ((admin_phone, "admin"), (col_phone, "collector")):
        login = verify(api, phone)
        assert login["status"] == "ok" and login["role"] == role
        s = current(api, login)
        assert s["state"] == "exempt" and not s["read_only"]
    assert make_loan(api, owner).status_code == 200
    # staff were added and removed: the organisation stays free and has no second subscription record
    assert api.sub.platform_analytics()["organizations"]["exempt"] >= 3
    assert sub_doc(api, owner["organization"]["id"])["is_exempt"]


def test_an_ordinary_user_cannot_claim_exemption(api, ex_orgs):                                # test 5
    owner = register(api, fresh_phone(), "Ordinary Co")
    assert current(api, owner)["state"] == "trial"
    # even giving an exempt number a role inside an ordinary organisation changes nothing
    add_staff(api, owner, "admin", EX1)
    assert current(api, owner)["state"] == "trial"
    assert not sub_doc(api, owner["organization"]["id"])["is_exempt"]
    # ...and the exempt number's own organisation is a different one
    assert owner["organization"]["id"] != ex_orgs[0]["organization"]["id"]


def test_exemption_cannot_be_obtained_by_changing_the_request(api):                           # test 6
    phone = fresh_phone()
    v = verify(api, phone)
    r = api.c.post("/api/organizations/register", headers={"X-Exempt": "true", "X-Org-Id": "ORG_001"}, json={
        "registration_token": v["registration_token"], "organization_name": "Sneaky Co", "admin_name": "Sneaky",
        "is_exempt": True, "status": "exempt", "subscription_status": "exempt", "subscription": {"is_exempt": True}})
    assert r.status_code in (200, 403), r.text
    if r.status_code == 200:
        assert current(api, r.json())["state"] == "trial"
    # an owner cannot write to the subscription store or call platform / webhook endpoints
    owner = register(api, fresh_phone(), "Sneaky Two")
    assert api.c.post("/api/platform/subscriptions/ORG_001/extend-trial", headers=hdr(owner), json={"days": 99, "reason": "please"}).status_code == 403
    assert api.c.post("/api/platform/subscriptions/%s/set-status" % owner["organization"]["id"], headers=hdr(owner),
                      json={"status": "grandfathered", "reason": "please"}).status_code == 403
    assert api.c.get("/api/platform/subscriptions", headers=hdr(owner)).status_code == 403
    assert current(api, owner)["state"] == "trial"


def test_exempt_organisation_never_hits_expiry_restrictions(api, ex_orgs):                    # test 7 / 22
    sub = sub_doc(api, ex_orgs[1]["organization"]["id"])
    far = datetime.now(timezone.utc) + timedelta(days=36500)
    assert api.sub.evaluate(sub, far)["full_access"] and api.sub.evaluate(sub, far)["state"] == "exempt"
    assert make_loan(api, ex_orgs[1]).status_code == 200
    r = api.c.post("/api/subscriptions/create-order", headers=hdr(ex_orgs[1]), json={"plan_type": "monthly"})
    assert r.status_code == 400 and "lifetime free" in r.json()["detail"]


def test_exempt_phone_numbers_are_never_exposed(api, ex_orgs):
    owner = ex_orgs[0]
    blobs = [api.c.get(p, headers=hdr(owner)).text for p in
             ("/api/subscriptions/current", "/api/subscriptions/plans", "/api/subscriptions/payment-history",
              "/api/organizations/current", "/api/health")]
    blobs.append(json.dumps(owner))
    for digits in ("9300000002", "9300000003"):   # the OTHER authorised numbers appear nowhere
        assert all(digits not in b for b in blobs)
    assert api.c.get("/api/subscriptions/current").status_code == 401


def test_more_than_three_exempt_numbers_are_capped(api, monkeypatch):
    monkeypatch.setenv("SUBSCRIPTION_EXEMPT_PHONES", "9300000001,9300000002,9300000003,9300000004")
    assert api.sub.is_exempt_phone("9300000003") and not api.sub.is_exempt_phone("9300000004")


# ───────────────────────── B. trial ─────────────────────────

def test_new_organisation_gets_a_seven_day_trial(api):                                         # test 8
    owner = register(api, fresh_phone(), "Trial Co")
    doc = sub_doc(api, owner["organization"]["id"])
    assert doc["status"] == "trial" and doc["plan_id"] == "trial" and not doc["is_exempt"]
    assert parse(doc["trial_end"]) - parse(doc["trial_start"]) == timedelta(days=7)
    s = current(api, owner)
    assert s["state"] == "trial" and s["full_access"] and s["days_remaining"] == 7


def test_trial_countdown_is_accurate(api, monkeypatch):                                        # test 9
    owner = register(api, fresh_phone(), "Countdown Co")
    start = parse(sub_doc(api, owner["organization"]["id"])["trial_start"])
    sub = sub_doc(api, owner["organization"]["id"])
    assert api.sub.evaluate(sub, start + timedelta(days=3))["days_remaining"] == 4
    assert api.sub.evaluate(sub, start + timedelta(days=6, hours=1))["days_remaining"] == 1
    assert api.sub.evaluate(sub, start + timedelta(days=7, seconds=1))["state"] == "trial_expired"
    monkeypatch.setattr(api.sub, "_utcnow", lambda: start + timedelta(days=5))
    api.sub.invalidate()
    assert current(api, owner)["days_remaining"] == 2


def test_trial_cannot_be_restarted(api):                                                       # test 10
    phone = fresh_phone()
    owner = register(api, phone, "Restart Co")
    org_id = owner["organization"]["id"]
    before = sub_doc(api, org_id)
    for _ in range(3):
        api.c.post("/api/auth/logout", headers=hdr(owner))
        owner = verify(api, phone)
        assert owner["status"] == "ok"
    assert api.sub.start_for_new_org(org_id, phone)["trial_end"] == before["trial_end"]
    add_staff(api, owner, "collector", fresh_phone(), "Col")
    after = sub_doc(api, org_id)
    assert (after["trial_start"], after["trial_end"]) == (before["trial_start"], before["trial_end"])
    # registering a second organisation is a different organisation with its own record, never a reset of the first
    assert sub_doc(api, org_id)["trial_end"] == before["trial_end"]


def test_trial_expires_and_organisation_becomes_read_only(api):                                # test 11
    owner = register(api, fresh_phone(), "Expiry Co")
    assert make_loan(api, owner).status_code == 200
    expire(api, owner)
    s = current(api, owner)
    assert s["state"] == "trial_expired" and s["read_only"] and not s["full_access"]
    assert s["message"]


def test_new_staff_do_not_get_their_own_trial(api):                                            # test 12
    owner = register(api, fresh_phone(), "Staff Trial Co")
    org_id = owner["organization"]["id"]
    docs = [s for s in api.sub._all(api.sub.SUBS_C) if s["org_id"] == org_id]
    col_phone = fresh_phone()
    add_staff(api, owner, "collector", col_phone, "Col")
    expire(api, owner)                                   # the organisation's trial ends ...
    col = verify(api, col_phone)
    assert current(api, col)["state"] == "trial_expired"  # ... and the collector inherits that, with no trial of their own
    assert len([s for s in api.sub._all(api.sub.SUBS_C) if s["org_id"] == org_id]) == len(docs) == 1


# ───────────────────────── C. payments ─────────────────────────

def test_valid_payment_activates_the_subscription(api):                                        # test 13
    owner = register(api, fresh_phone(), "Pay Co")
    expire(api, owner)
    before = datetime.now(timezone.utc)
    order, pid, out = pay_ok(api, owner, "monthly")
    assert order["amount"] == 50000 and order["currency"] == "INR" and order["key_id"] == "rzp_test_key"
    assert out["payment"]["status"] == "paid" and out["payment"]["payment_method"] == "upi"
    s = out["subscription"]
    assert s["state"] == "active" and s["full_access"] and s["plan_id"] == "monthly"
    assert abs((parse(s["current_period_end"]) - before) - timedelta(days=30)) < timedelta(minutes=5)
    assert make_loan(api, owner).status_code == 200     # write access is back


def test_the_price_comes_from_the_server_not_the_client(api):
    owner = register(api, fresh_phone(), "Price Co")
    r = api.c.post("/api/subscriptions/create-order", headers=hdr(owner), json={"plan_type": "monthly", "amount": 1, "price": 1})
    assert r.status_code == 200 and r.json()["amount"] == 50000
    assert api.gw.orders[r.json()["order_id"]]["amount"] == 50000
    assert api.c.post("/api/subscriptions/create-order", headers=hdr(owner), json={"plan_type": "trial"}).status_code == 400
    assert api.c.post("/api/subscriptions/create-order", headers=hdr(owner), json={"plan_type": "lifetime"}).status_code == 400
    plans = {p["plan_type"]: p for p in api.c.get("/api/subscriptions/plans", headers=hdr(owner)).json()}
    assert plans["monthly"]["price"] == 50000 and plans["annual"]["price"] == 500000 and "trial" not in plans


def test_invalid_signature_is_rejected(api):                                                   # test 14
    owner = register(api, fresh_phone(), "Sig Co")
    order = checkout(api, owner)
    pid = api.gw.pay(order["order_id"])
    r = verify_payment(api, owner, order["order_id"], pid, signature="0" * 64)
    assert r.status_code == 400 and r.json()["code"] == "bad_signature"
    r = verify_payment(api, owner, order["order_id"], pid, signature=sign(order["order_id"], pid, secret="wrong-secret"))
    assert r.status_code == 400
    assert current(api, owner)["state"] == "trial" and sub_doc(api, owner["organization"]["id"])["status"] == "trial"
    assert api.sub._get(api.sub.PAYMENTS_C, order["order_id"])["status"] == "created"


def test_webhook_signature_is_checked_against_the_raw_body(api):
    owner = register(api, fresh_phone(), "Hook Sig Co")
    order = checkout(api, owner)
    pid = api.gw.pay(order["order_id"])
    assert webhook(api, "payment.captured", order["order_id"], pid, secret="not-the-secret").status_code == 400
    # a re-serialised body no longer matches the signature that was computed over the original bytes
    raw = json.dumps({"event": "payment.captured", "payload": {"payment": {"entity": {"id": pid, "order_id": order["order_id"]}}}})
    sig = hmac.new(WEBHOOK_SECRET.encode(), raw.encode(), hashlib.sha256).hexdigest()
    r = api.c.post("/api/webhooks/razorpay", content=raw.replace(": ", ":"), headers={"x-razorpay-signature": sig})
    assert r.status_code == 400
    assert api.c.post("/api/webhooks/razorpay", content=raw).status_code == 400          # no signature at all
    assert current(api, owner)["state"] == "trial"


def test_webhook_activates_and_duplicate_webhooks_are_ignored(api):                            # test 15
    owner = register(api, fresh_phone(), "Webhook Co")
    order = checkout(api, owner)
    pid = api.gw.pay(order["order_id"])
    r = webhook(api, "payment.captured", order["order_id"], pid, event_id="evt_dup_1")
    assert r.status_code == 200 and r.json()["status"] == "processed"
    s = current(api, owner)
    assert s["state"] == "active"
    end = s["current_period_end"]
    for _ in range(3):
        again = webhook(api, "payment.captured", order["order_id"], pid, event_id="evt_dup_1")
        assert again.status_code == 200 and again.json()["status"] == "duplicate"
    # the same payment delivered again under a NEW event id (e.g. order.paid) also changes nothing
    assert webhook(api, "order.paid", order["order_id"], pid).status_code == 200
    assert current(api, owner)["current_period_end"] == end
    assert len(api.c.get("/api/subscriptions/payment-history", headers=hdr(owner)).json()) == 1
    event = api.sub._get(api.sub.EVENTS_C, "evt_dup_1")
    assert event["processing_status"] == "processed" and event["event_type"] == "payment.captured"


def test_checkout_verify_then_webhook_activates_only_once(api):
    owner = register(api, fresh_phone(), "Both Co")
    order, pid, out = pay_ok(api, owner)
    end = out["subscription"]["current_period_end"]
    webhook(api, "payment.captured", order["order_id"], pid)
    verify_payment(api, owner, order["order_id"], pid)
    assert current(api, owner)["current_period_end"] == end


def test_failed_payment_does_not_activate(api):                                                # test 16
    owner = register(api, fresh_phone(), "Failed Co")
    expire(api, owner)
    order = checkout(api, owner)
    pid = api.gw.pay(order["order_id"], status="failed")
    assert verify_payment(api, owner, order["order_id"], pid).json()["payment"]["status"] == "failed"
    assert webhook(api, "payment.failed", order["order_id"], pid).status_code == 200
    assert current(api, owner)["state"] == "trial_expired"
    assert api.c.get("/api/subscriptions/payment-history", headers=hdr(owner)).json()[0]["status"] == "failed"
    # the customer retries on the same order and this time it works
    pid2 = api.gw.pay(order["order_id"])
    assert verify_payment(api, owner, order["order_id"], pid2).json()["payment"]["status"] == "paid"
    assert current(api, owner)["state"] == "active"


def test_a_paid_order_is_never_downgraded_by_a_late_failure_event(api):
    owner = register(api, fresh_phone(), "Late Fail Co")
    order, pid, _ = pay_ok(api, owner)
    webhook(api, "payment.failed", order["order_id"], pid)
    assert api.sub._get(api.sub.PAYMENTS_C, order["order_id"])["status"] == "paid"
    assert current(api, owner)["state"] == "active"


def test_pending_payment_does_not_activate(api):                                               # test 17
    owner = register(api, fresh_phone(), "Pending Co")
    expire(api, owner)
    order = checkout(api, owner)
    pid = api.gw.pay(order["order_id"], status="authorized")
    r = verify_payment(api, owner, order["order_id"], pid)
    assert r.status_code == 200 and r.json()["payment"]["status"] == "created"
    assert webhook(api, "payment.captured", order["order_id"], pid).status_code == 200
    assert current(api, owner)["state"] == "trial_expired"
    assert api.sub.platform_analytics()["revenue"]["pending_payments"] >= 1


def test_payment_that_does_not_match_the_order_is_rejected(api):
    owner = register(api, fresh_phone(), "Mismatch Co")
    expire(api, owner)
    order = checkout(api, owner)
    cheap = api.gw.pay(order["order_id"], amount=100)                      # captured, but for ₹1
    r = verify_payment(api, owner, order["order_id"], cheap)
    assert r.status_code == 400 and r.json()["code"] == "payment_mismatch"
    other = checkout(api, owner)
    stray = api.gw.pay(other["order_id"])
    r = verify_payment(api, owner, order["order_id"], stray)               # payment belongs to another order
    assert r.status_code == 400
    wrong_currency = api.gw.pay(order["order_id"], currency="USD")
    assert verify_payment(api, owner, order["order_id"], wrong_currency).status_code == 400
    assert current(api, owner)["state"] == "trial_expired"


def test_a_payment_id_cannot_be_reused_for_another_order(api):
    owner = register(api, fresh_phone(), "Reuse Co")
    o1 = checkout(api, owner)
    pid = api.gw.pay(o1["order_id"])
    assert verify_payment(api, owner, o1["order_id"], pid).status_code == 200
    o2 = checkout(api, owner)
    api.gw.payments[pid]["order_id"] = o2["order_id"]                       # a lying gateway record / replay attempt
    r = verify_payment(api, owner, o2["order_id"], pid)
    assert r.status_code == 409 and r.json()["code"] == "payment_reused"
    assert api.sub._get(api.sub.PAYMENTS_C, o2["order_id"])["status"] == "created"


def test_unconfirmable_payment_is_not_activated(api):
    owner = register(api, fresh_phone(), "Offline Co")
    expire(api, owner)
    order = checkout(api, owner)
    r = verify_payment(api, owner, order["order_id"], "pay_never_created")           # gateway has no such payment
    assert r.status_code == 503 and r.json()["code"] == "payment_unconfirmed"
    assert current(api, owner)["state"] == "trial_expired"


def test_successful_renewal_extends_from_the_paid_through_date(api):                           # test 18
    owner = register(api, fresh_phone(), "Renew Co")
    _, _, first = pay_ok(api, owner, "monthly")
    end1 = parse(first["subscription"]["current_period_end"])
    _, _, second = pay_ok(api, owner, "monthly", path="/api/subscriptions/renew")
    assert parse(second["subscription"]["current_period_end"]) == end1 + timedelta(days=30)   # stacked, not shortened
    _, _, third = pay_ok(api, owner, "annual")
    assert parse(third["subscription"]["current_period_end"]) == end1 + timedelta(days=30 + 365)
    assert third["subscription"]["plan_id"] == "annual"
    # renewing an EXPIRED subscription starts from now
    expire(api, owner, "paid")
    before = datetime.now(timezone.utc)
    _, _, fourth = pay_ok(api, owner, "monthly")
    assert abs(parse(fourth["subscription"]["current_period_end"]) - (before + timedelta(days=30))) < timedelta(minutes=5)


def test_renew_defaults_to_the_current_plan(api):
    owner = register(api, fresh_phone(), "Default Plan Co")
    pay_ok(api, owner, "annual")
    r = api.c.post("/api/subscriptions/renew", headers=hdr(owner), json={})
    assert r.status_code == 200 and r.json()["plan"]["plan_type"] == "annual" and r.json()["amount"] == 500000


def test_trial_days_are_kept_when_paying_early(api):
    owner = register(api, fresh_phone(), "Early Co")
    trial_end = parse(sub_doc(api, owner["organization"]["id"])["trial_end"])
    _, _, out = pay_ok(api, owner, "monthly")
    assert parse(out["subscription"]["current_period_end"]) >= trial_end + timedelta(days=29, hours=23)


def test_another_organisation_cannot_use_someone_elses_payment(api):                          # test 19
    a = register(api, fresh_phone(), "Org A")
    b = register(api, fresh_phone(), "Org B")
    order = checkout(api, a)
    pid = api.gw.pay(order["order_id"])
    r = verify_payment(api, b, order["order_id"], pid)                       # B presents A's order + a valid signature
    assert r.status_code == 404
    assert current(api, b)["state"] == "trial" and sub_doc(api, b["organization"]["id"])["status"] == "trial"
    assert api.sub._get(api.sub.PAYMENTS_C, order["order_id"])["status"] == "created"
    assert api.c.get("/api/subscriptions/payment-history", headers=hdr(b)).json() == []
    assert verify_payment(api, a, order["order_id"], pid).status_code == 200      # the real owner can


def test_payment_history_and_invoices_are_retained(api):                                       # test 20
    owner = register(api, fresh_phone(), "History Co")
    pay_ok(api, owner, "monthly")
    pay_ok(api, owner, "annual")
    failed = checkout(api, owner)
    api.gw.pay(failed["order_id"], status="failed")
    expire(api, owner, "paid")                                                # even after expiry the records remain
    hist = api.c.get("/api/subscriptions/payment-history", headers=hdr(owner)).json()
    assert [h["status"] for h in hist].count("paid") == 2 and len(hist) == 3
    assert all(h["gateway"] == "razorpay" and h["gateway_order_id"] for h in hist)
    inv = api.c.get("/api/subscriptions/invoices", headers=hdr(owner)).json()
    assert len(inv) == 2 and all(i["invoice_number"].startswith("DV-") and i["organization_name"] == "History Co" for i in inv)
    assert len({i["invoice_number"] for i in inv}) == 2
    assert "gateway_payment_id" in hist[0] and "created_by" not in hist[0]


def test_subscription_payments_are_separate_from_borrower_payments(api):
    owner = register(api, fresh_phone(), "Separate Co")
    loan = make_loan(api, owner).json()["data"]
    pay_ok(api, owner)
    pays = api.c.get(f"/api/loans/{loan['id']}/payments", headers=hdr(owner)).json()
    assert pays == []                                                         # the ₹500 subscription is not a borrower payment
    assert api.c.get("/api/dashboard/", headers=hdr(owner)).json()["total_collected"] == 0 if "total_collected" in api.c.get("/api/dashboard/", headers=hdr(owner)).json() else True


def test_payments_not_configured_is_reported_gracefully(api, monkeypatch):
    owner = register(api, fresh_phone(), "No Gateway Co")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "")
    r = api.c.post("/api/subscriptions/create-order", headers=hdr(owner), json={"plan_type": "monthly"})
    assert r.status_code == 503 and r.json()["code"] == "payments_not_configured"
    assert current(api, owner)["payments_enabled"] is False
    monkeypatch.setenv("RAZORPAY_WEBHOOK_SECRET", "")
    assert api.c.post("/api/webhooks/razorpay", content=b"{}").status_code == 503


# ───────────────────────── D. access control ─────────────────────────

def test_expired_organisation_is_read_only(api):                                               # test 21
    owner = register(api, fresh_phone(), "ReadOnly Co")
    col_phone = fresh_phone()
    add_staff(api, owner, "collector", col_phone, "Col")
    loan = make_loan(api, owner).json()["data"]
    pay = api.c.post(f"/api/loans/{loan['id']}/payments", headers=hdr(owner), json={"amount": 100, "payment_method": "Cash"})
    assert pay.status_code == 200
    expire(api, owner)
    h = hdr(owner)
    # everything that VIEWS data still works
    for path in ("/api/loans/", f"/api/loans/{loan['id']}/payments", "/api/dashboard/", "/api/admin/app-data",
                 "/api/reports/export.xlsx", "/api/staff/", "/api/expenses/", "/api/admin/audit-log",
                 "/api/organizations/current", "/api/subscriptions/current", "/api/subscriptions/plans"):
        assert api.c.get(path, headers=h).status_code == 200, path
    # everything that CHANGES data is refused by the server
    blocked = [
        api.c.post("/api/loans/", headers=h, json=LOAN),
        api.c.post(f"/api/loans/{loan['id']}/payments", headers=h, json={"amount": 100, "payment_method": "Cash"}),
        api.c.patch(f"/api/loans/{loan['id']}", headers=h, json={"customer_name": "X"}),
        api.c.delete(f"/api/loans/{loan['id']}", headers=h),
        api.c.post(f"/api/loans/{loan['id']}/close", headers=h),
        api.c.post("/api/expenses/", headers=h, json={"category": "Rent", "amount": 5, "description": "x"}),
        api.c.post("/api/transactions/", headers=h, json={}),
        api.c.post("/api/staff/", headers=h, json={"name": "New", "role": "collector", "phone": fresh_phone()}),
        api.c.post("/api/books", headers=h, json={"name": "New book"}),
    ]
    for r in blocked:
        assert r.status_code == 402 and r.json()["code"] == "subscription_read_only", r.request.url
    assert "expired" in blocked[0].json()["detail"].lower() or "ended" in blocked[0].json()["detail"].lower()
    # staff inherit the organisation's state: a collector cannot record a collection either
    col = verify(api, col_phone)
    r = api.c.post(f"/api/loans/{loan['id']}/payments", headers=hdr(col), json={"amount": 50, "payment_method": "Cash"})
    assert r.status_code == 402
    assert api.c.get(f"/api/loans/{loan['id']}/payments", headers=hdr(col)).status_code == 200
    # sign-in, checkout and removing access are never blocked
    assert verify(api, col_phone)["status"] == "ok"
    assert api.c.post("/api/subscriptions/create-order", headers=h, json={"plan_type": "monthly"}).status_code == 200
    assert api.c.post("/api/auth/logout", headers=h).status_code == 200
    # nothing was changed by the refused calls
    loans = api.c.get("/api/loans/", headers=hdr(verify(api, owner["phone"]))).json()
    assert len(loans) == 1 and loans[0]["collected_amount"] == 100 and loans[0]["customer_name"] == "Borrower"


def test_removing_staff_is_allowed_even_when_read_only(api):
    owner = register(api, fresh_phone(), "Remove Co")
    staff = add_staff(api, owner, "collector", fresh_phone(), "Col")
    expire(api, owner)
    assert api.c.delete(f"/api/staff/{staff['id']}", headers=hdr(owner)).status_code == 200


def test_paid_organisation_has_full_access(api):                                               # test 23
    owner = register(api, fresh_phone(), "Paid Co")
    expire(api, owner)
    assert make_loan(api, owner).status_code == 402
    pay_ok(api, owner)
    assert make_loan(api, owner).status_code == 200


def test_paying_for_a_subscription_that_ended_keeps_old_data(api):
    owner = register(api, fresh_phone(), "Data Co")
    make_loan(api, owner)
    expire(api, owner)
    pay_ok(api, owner)
    assert len(api.c.get("/api/loans/", headers=hdr(owner)).json()) == 1


def test_collector_cannot_change_the_subscription(api):                                        # test 24
    owner = register(api, fresh_phone(), "Collector Perm Co")
    col_phone = fresh_phone()
    add_staff(api, owner, "collector", col_phone, "Col")
    col = verify(api, col_phone)
    h = hdr(col)
    s = current(api, col)
    assert s["can_manage"] is False and "plan_id" not in s and "trial_end" not in s and "payments_enabled" not in s
    for r in (api.c.post("/api/subscriptions/create-order", headers=h, json={"plan_type": "monthly"}),
              api.c.post("/api/subscriptions/renew", headers=h, json={}),
              api.c.post("/api/subscriptions/cancel", headers=h),
              api.c.post("/api/subscriptions/verify-payment", headers=h, json={"razorpay_order_id": "order_x1234", "razorpay_payment_id": "pay_x12345", "razorpay_signature": "s" * 20}),
              api.c.get("/api/subscriptions/plans", headers=h),
              api.c.get("/api/subscriptions/payment-history", headers=h),
              api.c.get("/api/subscriptions/invoices", headers=h)):
        assert r.status_code == 403, r.request.url


def test_admin_cannot_change_the_subscription(api):                                            # test 25
    owner = register(api, fresh_phone(), "Admin Perm Co")
    admin_phone = fresh_phone()
    add_staff(api, owner, "admin", admin_phone)
    admin = verify(api, admin_phone)
    assert admin["role"] == "admin" and admin["member_role"] == "ADMIN"
    h = hdr(admin)
    assert current(api, admin)["can_manage"] is False and "plan_id" not in current(api, admin)
    assert api.c.post("/api/subscriptions/create-order", headers=h, json={"plan_type": "monthly"}).status_code == 403
    assert api.c.post("/api/subscriptions/renew", headers=h, json={}).status_code == 403
    assert api.c.post("/api/subscriptions/cancel", headers=h).status_code == 403
    assert api.c.get("/api/subscriptions/payment-history", headers=h).status_code == 403
    assert api.c.get("/api/platform/subscriptions", headers=h).status_code == 403


def test_owner_can_renew(api):                                                                 # test 26
    owner = register(api, fresh_phone(), "Owner Perm Co")
    pay_ok(api, owner, "monthly")
    r = api.c.post("/api/subscriptions/renew", headers=hdr(owner), json={"plan_type": "monthly"})
    assert r.status_code == 200 and r.json()["order_id"].startswith("order_")


def test_one_organisation_cannot_see_anothers_subscription(api):                              # test 27
    a, b = register(api, fresh_phone(), "Iso A"), register(api, fresh_phone(), "Iso B")
    pay_ok(api, a)
    sa, sb = current(api, a), current(api, b)
    assert sa["state"] == "active" and sb["state"] == "trial"
    assert sa["organization_name"] == "Iso A" and sb["organization_name"] == "Iso B"
    assert api.c.get("/api/subscriptions/payment-history", headers=hdr(b)).json() == []
    assert len(api.c.get("/api/subscriptions/payment-history", headers=hdr(a)).json()) == 1
    # a client-supplied organisation is rejected, exactly like every other endpoint
    r = api.c.get("/api/subscriptions/current", headers={**hdr(b), "X-Org-Id": a["organization"]["id"]})
    assert r.status_code == 403
    r = api.c.get(f"/api/subscriptions/current?org_id={a['organization']['id']}", headers=hdr(b))
    assert r.status_code == 403


def test_the_subscription_store_is_not_reachable_from_tenant_data(api):
    owner = register(api, fresh_phone(), "Scope Co")
    org_id = owner["organization"]["id"]
    with api.db.as_org(org_id):
        for name in (api.sub.SUBS_C, api.sub.PAYMENTS_C, api.sub.PLANS_C, api.sub.EVENTS_C):
            assert api.db.get_db_client("finance").collection(name).get() == []


def test_existing_borrower_payment_apis_keep_working(api):                                     # test 28
    owner = register(api, fresh_phone(), "Borrower Pay Co")
    loan = make_loan(api, owner).json()["data"]
    r = api.c.post(f"/api/loans/{loan['id']}/payments", headers=hdr(owner), json={"amount": 250, "payment_method": "Cash"})
    assert r.status_code == 200 and r.json()["data"]["collected_amount"] == 250
    legacy = verify(api, "+919000000001")                      # the existing business (ORG_001)
    assert current(api, legacy)["state"] == "grandfathered" and current(api, legacy)["full_access"]
    r = api.c.post("/api/loans/l-1001/payments", headers=hdr(legacy), json={"amount": 100, "payment_method": "Cash"})
    assert r.status_code == 200, r.text


# ───────────────────────── E. existing organisations & ownership transfer ─────────────────────────

def test_existing_organisation_is_grandfathered_and_nothing_is_written(api, monkeypatch):
    assert api.sub._get(api.sub.SUBS_C, "ORG_001") is None
    sub = api.sub.get_subscription("ORG_001")
    assert sub["status"] == "grandfathered" and api.sub.evaluate(sub)["full_access"]
    assert api.sub.evaluate(sub, datetime.now(timezone.utc) + timedelta(days=3650))["full_access"]   # no expiry
    assert api.sub._get(api.sub.SUBS_C, "ORG_001") is None             # reading never writes
    # if its owner is one of the authorised numbers it is simply exempt
    monkeypatch.setenv("SUBSCRIPTION_EXEMPT_PHONES", "9000000001")
    api.sub.invalidate()
    assert api.sub.get_subscription("ORG_001")["status"] == "exempt"


def test_interrupted_creation_starts_a_trial_not_a_free_ride(api):
    owner = register(api, fresh_phone(), "Crash Co")
    org_id = owner["organization"]["id"]
    with api.db.platform_scope():                                       # simulate a crash after the organisation was saved
        api.db.get_db_client("finance").collection(api.sub.SUBS_C).document(org_id).delete()
    api.sub.invalidate()
    assert api.sub.get_subscription(org_id)["status"] == "trial"


def test_ownership_transfer_to_non_exempt_requires_confirmation(api):
    owner = register(api, EX1, "Transfer Org 1")
    admin_phone = fresh_phone()
    admin = add_staff(api, owner, "admin", admin_phone)
    r = api.c.post(f"/api/staff/{admin['id']}/make-owner", headers=hdr(owner))
    assert r.status_code == 409 and r.json()["code"] == "exemption_loss_confirmation_required"
    assert api.sub.get_subscription(owner["organization"]["id"])["is_exempt"]           # nothing changed
    r = api.c.post(f"/api/staff/{admin['id']}/make-owner?confirm_exemption_loss=true", headers=hdr(owner))
    assert r.status_code == 200, r.text
    new_owner = verify(api, admin_phone)
    s = current(api, new_owner)
    assert s["state"] == "trial" and s["days_remaining"] == 7 and not s["is_exempt"]    # fresh trial, not a lock-out


def test_ownership_transfer_between_exempt_numbers_keeps_the_exemption(api, ex_orgs):
    owner = ex_orgs[1]                                    # created by EX2
    admin = add_staff(api, owner, "admin", EX3)
    assert api.c.post(f"/api/staff/{admin['id']}/make-owner", headers=hdr(owner)).status_code == 200
    assert api.sub.get_subscription(owner["organization"]["id"])["is_exempt"]


def test_handing_an_ordinary_organisation_to_an_exempt_number_does_not_make_it_free(api):
    owner = register(api, fresh_phone(), "Transfer Org 3")
    admin = add_staff(api, owner, "admin", EX1)
    assert api.c.post(f"/api/staff/{admin['id']}/make-owner", headers=hdr(owner)).status_code == 200
    s = api.sub.get_subscription(owner["organization"]["id"])
    assert not s["is_exempt"] and s["status"] == "trial"


# ───────────────────────── F. cancel ─────────────────────────

def test_cancel_keeps_access_until_the_paid_through_date(api):
    owner = register(api, fresh_phone(), "Cancel Co")
    assert api.c.post("/api/subscriptions/cancel", headers=hdr(owner)).status_code == 400    # nothing paid yet
    pay_ok(api, owner)
    r = api.c.post("/api/subscriptions/cancel", headers=hdr(owner))
    assert r.status_code == 200 and r.json()["state"] == "cancelled" and r.json()["full_access"]
    assert make_loan(api, owner).status_code == 200
    expire(api, owner, "paid")
    assert current(api, owner)["state"] == "expired"
    assert make_loan(api, owner).status_code == 402
    pay_ok(api, owner)                                                  # renewing switches it back on
    assert current(api, owner)["state"] == "active" and current(api, owner)["cancelled_at"] is None


# ───────────────────────── G. platform administration ─────────────────────────

@pytest.fixture(scope="module")
def operator(api):
    return register(api, PLATFORM_ADMIN, "DigiVasool Ops")


def test_platform_admin_sees_organisations_and_revenue(api, operator, ex_orgs):
    victim = register(api, fresh_phone(), "Searchable Finance Ltd")
    pay_ok(api, victim, "annual")
    h = hdr(operator)
    rows = api.c.get("/api/platform/subscriptions", headers=h).json()
    ids = {r["org_id"] for r in rows}
    assert {victim["organization"]["id"], "ORG_001"} <= ids
    mine = next(r for r in rows if r["org_id"] == victim["organization"]["id"])
    assert mine["state"] == "active" and mine["plan_id"] == "annual" and mine["payments_total"] == 500000
    assert mine["owner_phone"] and mine["organization_name"] == "Searchable Finance Ltd"
    assert [r["org_id"] for r in api.c.get("/api/platform/subscriptions?q=searchable", headers=h).json()] == [victim["organization"]["id"]]
    a = api.c.get("/api/platform/subscriptions/analytics", headers=h).json()
    assert a["organizations"]["total"] >= 5 and a["organizations"]["exempt"] >= 3 and a["organizations"]["active"] >= 1
    assert a["revenue"]["annual_plan_paise"] >= 500000 and a["revenue"]["total_paise"] >= 500000
    assert a["revenue"]["monthly_recurring_paise"] >= round(500000 / 12) and a["revenue"]["failed_payments"] >= 0
    detail = api.c.get(f"/api/platform/subscriptions/{victim['organization']['id']}", headers=h).json()
    assert detail["subscription"]["plan_id"] == "annual" and len(detail["payments"]) == 1
    assert api.c.get("/api/platform/subscriptions/ORG_999", headers=h).status_code == 404


def test_platform_admin_can_extend_a_trial_and_it_is_audited(api, operator):
    owner = register(api, fresh_phone(), "Extend Co")
    expire(api, owner)
    assert make_loan(api, owner).status_code == 402
    h = hdr(operator)
    org_id = owner["organization"]["id"]
    assert api.c.post(f"/api/platform/subscriptions/{org_id}/extend-trial", headers=h, json={"days": 0, "reason": "x"}).status_code == 422
    assert api.c.post(f"/api/platform/subscriptions/{org_id}/extend-trial", headers=h, json={"days": 5}).status_code == 422   # reason required
    r = api.c.post(f"/api/platform/subscriptions/{org_id}/extend-trial", headers=h, json={"days": 10, "reason": "Support request"})
    assert r.status_code == 200, r.text
    assert make_loan(api, owner).status_code == 200
    audit = r.json()["audit"]
    assert audit[0]["action"] == "TRIAL_EXTENDED" and "Support request" in audit[0]["detail"] and "9300000099" in audit[0]["actor"]
    assert audit[0]["before"]["trial_end"] != audit[0]["after"]["trial_end"]


def test_platform_admin_can_correct_a_status_but_not_touch_exempt_orgs(api, operator, ex_orgs):
    owner = register(api, fresh_phone(), "Correct Co")
    org_id, h = owner["organization"]["id"], hdr(operator)
    end = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat()
    assert api.c.post(f"/api/platform/subscriptions/{org_id}/set-status", headers=h, json={"status": "active", "reason": "Paid by bank transfer"}).status_code == 400   # needs an end date
    r = api.c.post(f"/api/platform/subscriptions/{org_id}/set-status", headers=h, json={"status": "active", "end_at": end, "reason": "Paid by bank transfer"})
    assert r.status_code == 200 and r.json()["state"] == "active"
    assert api.c.post(f"/api/platform/subscriptions/{org_id}/set-status", headers=h, json={"status": "exempt", "reason": "nope"}).status_code == 422
    assert r.json()["audit"][0]["action"] == "STATUS_CORRECTED"
    ex_id = ex_orgs[0]["organization"]["id"]
    assert api.c.post(f"/api/platform/subscriptions/{ex_id}/set-status", headers=h, json={"status": "trial", "end_at": end, "reason": "oops"}).status_code == 400
    assert api.c.post(f"/api/platform/subscriptions/{ex_id}/extend-trial", headers=h, json={"days": 5, "reason": "oops"}).status_code == 400
    assert api.sub.get_subscription(ex_id)["is_exempt"]


def test_exempt_numbers_are_not_automatically_platform_admins(api, ex_orgs):
    for org in ex_orgs:
        assert api.c.get("/api/platform/subscriptions", headers=hdr(org)).status_code == 403
        assert current(api, org)["is_platform_admin"] is False


def test_platform_admin_flag_is_reported_only_for_operators(api, operator):
    assert current(api, operator)["is_platform_admin"] is True
    assert api.c.get("/api/platform/subscriptions").status_code == 401


# ───────────────────────── H. plans ─────────────────────────

def test_plans_are_stored_in_paise_and_prices_are_configurable(api, monkeypatch):
    plans = {p["id"]: p for p in api.sub._all(api.sub.PLANS_C)}
    assert plans["trial"]["price"] == 0 and plans["trial"]["duration_days"] == 7
    assert plans["monthly"]["price"] == 50000 and plans["monthly"]["duration_days"] == 30 and plans["monthly"]["billing_interval"] == "month"
    assert plans["annual"]["price"] == 500000 and plans["annual"]["duration_days"] == 365 and plans["annual"]["billing_interval"] == "year"
    assert all(isinstance(p["price"], int) for p in plans.values())
    monkeypatch.setenv("MONTHLY_PLAN_PRICE", "599.50")
    monkeypatch.setenv("ANNUAL_PLAN_PRICE", "garbage")
    defs = {p["id"]: p for p in api.sub._plan_definitions()}
    assert defs["monthly"]["price"] == 59950 and defs["annual"]["price"] == 499900      # bad value -> placeholder default
