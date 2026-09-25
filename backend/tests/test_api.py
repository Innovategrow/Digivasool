"""
End-to-end API tests against a throw-away SQLite database.

Run:  cd backend && .venv/bin/python -m pytest tests -q
  or: cd backend && .venv/bin/python tests/test_api.py
"""
import importlib
import os
import sys
import tempfile

TMP = tempfile.mkdtemp()
os.environ.update({
    "DB_BACKEND": "sqlite",
    "DB_PATH": os.path.join(TMP, "test.db"),
    "UPLOAD_DIR": os.path.join(TMP, "uploads"),
    "SEED_DEMO_DATA": "true",
    "OTP_DEV_MODE": "true",
    "AUTH_SECRET": "test-secret",
    "ADMIN_USERS": "Test Admin:+919000000001",
    "COLLECTOR_USERS": "Collector 1:+919000000002,Collector 2:+919000000003",
    "FRONTEND_DIST": os.path.join(TMP, "no-dist"),
})
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402


def _fresh_client():
    import db
    import main
    importlib.reload(db)
    importlib.reload(main)
    return TestClient(main.app)


client_ctx = _fresh_client()
client = client_ctx.__enter__()


def login(role, phone, **extra):
    r = client.post("/api/auth/request-otp", json={"contact": phone, "role": role, **extra})
    assert r.status_code == 200, r.text
    otp = r.json()["dev_otp"]
    r = client.post("/api/auth/verify-otp", json={"contact": phone, "otp": otp, "role": role, **extra})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


ADMIN = login("admin", "+919000000001", admin_name="Test Admin")
COLLECTOR = login("collector", "+919000000002", collector_name="Collector 1")

NEW_LOAN = {
    "customer_id": "CUST-T1", "customer_name": "Rahul Kumar", "customer_phone": "9876500001",
    "customer_email": "", "customer_address": "1 Main St", "zone": "Peelamedu",
    "loan_amount": 12500, "monthly_interest_amount": 500, "start_date": "2026-09-01",
    "closing_date": "2026-12-01", "repayment_frequency": "daily", "repayment_amount": 250,
}


def create_loan(**overrides):
    r = client.post("/api/loans/", json={**NEW_LOAN, **overrides}, headers=ADMIN)
    assert r.status_code == 200, r.text
    return r.json()["data"]


def test_requires_login():
    assert client.get("/api/loans/").status_code == 401
    # The old spoofable header no longer grants access
    assert client.get("/api/loans/", headers={"X-User-Role": "admin"}).status_code == 401
    assert client.get("/api/loans/", headers={"Authorization": "Bearer forged.token"}).status_code == 401


def test_collector_login_requires_registered_phone():
    r = client.post("/api/auth/request-otp", json={"contact": "+919999999999", "role": "collector", "collector_name": "Collector 1"})
    assert r.status_code == 404
    r = client.post("/api/auth/request-otp", json={"contact": "+919000000003", "role": "collector", "collector_name": "Collector 1"})
    assert r.status_code == 400


def test_otp_attempt_limit():
    client.post("/api/auth/request-otp", json={"contact": "+919000000002", "role": "collector"})
    for _ in range(5):
        client.post("/api/auth/verify-otp", json={"contact": "+919000000002", "otp": "000000", "role": "collector"})
    # OTP is burned after too many wrong attempts
    r = client.post("/api/auth/verify-otp", json={"contact": "+919000000002", "otp": "000000", "role": "collector"})
    assert r.status_code == 401


def test_add_borrower_appears_in_list():
    loan = create_loan()
    ids = [l["id"] for l in client.get("/api/loans/", headers=ADMIN).json()]
    assert loan["id"] in ids
    assert loan["created_by"] == "Test Admin"


def test_edit_borrower_persists_and_validates():
    loan = create_loan(customer_name="Edit Me")
    r = client.patch(f"/api/loans/{loan['id']}", headers=ADMIN, json={
        "customer_name": "Edited Name", "customer_phone": "+91 98765 00002", "alternate_phone": "",
        "zone": "RS Puram", "aadhaar_number": "1234 5678 9012", "preferred_language": "ta",
        "guarantor_name": "G", "customer_address": "New address",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["customer_name"] == "Edited Name"
    assert body["customer_phone"] == "+919876500002"
    assert body["aadhaar_number"] == "123456789012"
    assert body["updated_by"] == "Test Admin"
    # financial fields untouched
    assert body["loan_amount"] == 12500 and body["pending_amount"] == 12500

    listed = next(l for l in client.get("/api/loans/", headers=ADMIN).json() if l["id"] == loan["id"])
    assert listed["zone"] == "RS Puram" and listed["preferred_language"] == "ta"

    bad = client.patch(f"/api/loans/{loan['id']}", headers=ADMIN, json={"customer_phone": "12ab"})
    assert bad.status_code == 422 and "mobile" in bad.json()["detail"].lower()
    bad = client.patch(f"/api/loans/{loan['id']}", headers=ADMIN, json={"aadhaar_number": "123"})
    assert bad.status_code == 422
    bad = client.patch(f"/api/loans/{loan['id']}", headers=ADMIN, json={"customer_name": " "})
    assert bad.status_code == 422
    # Financial fields are ignored by the edit endpoint
    client.patch(f"/api/loans/{loan['id']}", headers=ADMIN, json={"pending_amount": 1, "customer_name": "Edited Name"})
    listed = next(l for l in client.get("/api/loans/", headers=ADMIN).json() if l["id"] == loan["id"])
    assert listed["pending_amount"] == 12500


def test_only_admin_can_edit_or_delete():
    loan = create_loan()
    assert client.patch(f"/api/loans/{loan['id']}", headers=COLLECTOR, json={"customer_name": "Hacked"}).status_code == 403
    assert client.delete(f"/api/loans/{loan['id']}", headers=COLLECTOR).status_code == 403
    borrower = login("borrower", NEW_LOAN["customer_phone"])
    assert client.patch(f"/api/loans/{loan['id']}", headers=borrower, json={"customer_name": "Hacked"}).status_code == 403
    assert client.delete(f"/api/loans/{loan['id']}", headers=borrower).status_code == 403


def test_soft_delete_preserves_financial_history():
    loan = create_loan(customer_phone="9876500009")
    pay = client.post(f"/api/loans/{loan['id']}/payments", headers=COLLECTOR, json={"amount": 250, "payment_method": "Cash"})
    assert pay.status_code == 200
    r = client.delete(f"/api/loans/{loan['id']}", headers=ADMIN)
    assert r.status_code == 200
    assert loan["id"] not in [l["id"] for l in client.get("/api/loans/", headers=ADMIN).json()]
    deleted = next(l for l in client.get("/api/loans/deleted", headers=ADMIN).json() if l["id"] == loan["id"])
    assert deleted["is_deleted"] is True and deleted["deleted_by"] == "Test Admin" and deleted["deleted_at"]
    assert deleted["collected_amount"] == 250
    # payments are still there
    history = client.get(f"/api/loans/{loan['id']}/payments", headers=ADMIN).json()
    assert len(history) == 1
    # no new payments on an archived borrower
    assert client.post(f"/api/loans/{loan['id']}/payments", headers=COLLECTOR, json={"amount": 10, "payment_method": "Cash"}).status_code == 400
    # records with payments can never be erased
    assert client.delete(f"/api/loans/{loan['id']}/permanent", headers=ADMIN).status_code == 409
    assert len(client.get(f"/api/loans/{loan['id']}/payments", headers=ADMIN).json()) == 1
    # restore brings it back
    assert client.post(f"/api/loans/{loan['id']}/restore", headers=ADMIN).status_code == 200
    assert loan["id"] in [l["id"] for l in client.get("/api/loans/", headers=ADMIN).json()]


def test_permanent_delete_without_payments():
    loan = create_loan()
    client.delete(f"/api/loans/{loan['id']}", headers=ADMIN)
    assert client.delete(f"/api/loans/{loan['id']}/permanent", headers=ADMIN).status_code == 200


def test_payment_idempotency():
    loan = create_loan()
    key = {"Idempotency-Key": "tap-123", **COLLECTOR}
    first = client.post(f"/api/loans/{loan['id']}/payments", headers=key, json={"amount": 500, "payment_method": "GPay"})
    second = client.post(f"/api/loans/{loan['id']}/payments", headers=key, json={"amount": 500, "payment_method": "GPay"})
    assert first.status_code == second.status_code == 200
    assert first.json()["payment"]["id"] == second.json()["payment"]["id"]
    history = client.get(f"/api/loans/{loan['id']}/payments", headers=ADMIN).json()
    assert len(history) == 1
    listed = next(l for l in client.get("/api/loans/", headers=ADMIN).json() if l["id"] == loan["id"])
    assert listed["collected_amount"] == 500
    # zero / not-paid entry still works and collector identity is enforced
    zero = client.post(f"/api/loans/{loan['id']}/payments", headers=COLLECTOR,
                       json={"amount": 0, "payment_method": "Cash", "collector_name": "Someone Else"})
    assert zero.status_code == 200
    assert zero.json()["payment"]["collector_name"] == "Collector 1"
    assert zero.json()["data"]["total_days_not_paid"] == 1


def test_borrower_sees_only_own_loans():
    mine = create_loan(customer_phone="9876512345", customer_name="Own Borrower")
    other = create_loan(customer_phone="9876554321", customer_name="Other Borrower")
    borrower = login("borrower", "+91 98765 12345")
    loans = client.get("/api/loans/by-customer?name=Other%20Borrower", headers=borrower).json()
    assert [l["id"] for l in loans] == [mine["id"]]
    assert client.get(f"/api/loans/{mine['id']}/payments", headers=borrower).status_code == 200
    assert client.get(f"/api/loans/{other['id']}/payments", headers=borrower).status_code == 403
    assert client.get("/api/loans/", headers=borrower).status_code == 403


def test_expenses_capital_staff_persist():
    r = client.post("/api/expenses/", headers=ADMIN, json={"category": "Fuel", "amount": 300, "date": "2026-09-20", "description": "Bike"})
    assert r.status_code == 200
    assert client.post("/api/capital/", headers=ADMIN, json={"amount": 100000, "date": "2026-09-20", "note": "Seed"}).status_code == 200
    s = client.post("/api/staff/", headers=ADMIN, json={"name": "New Collector", "role": "collector", "phone": "+919000000099", "target": 1000})
    assert s.status_code == 200, s.text
    assert client.get("/api/expenses/", headers=COLLECTOR).status_code == 403
    # a collector added from the Staff screen can log in
    login("collector", "+919000000099")


def test_data_survives_restart():
    loan = create_loan(customer_name="Persistent Person")
    client.post("/api/expenses/", headers=ADMIN, json={"category": "Printing", "amount": 99, "date": "2026-09-21"})
    fresh = _fresh_client().__enter__()
    loans = fresh.get("/api/loans/", headers=ADMIN).json()
    assert any(l["id"] == loan["id"] for l in loans)
    assert any(e["amount"] == 99 for e in fresh.get("/api/expenses/", headers=ADMIN).json())


if __name__ == "__main__":
    failures = 0
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("PASS", name)
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print("FAIL", name, repr(exc))
    sys.exit(1 if failures else 0)
