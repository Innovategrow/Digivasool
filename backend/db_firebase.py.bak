"""
Firebase Firestore database layer.
Replaces the previous SQLite implementation with Cloud Firestore.
"""

import os
from typing import Dict, Any, List, Optional
from datetime import date

import firebase_admin
from firebase_admin import credentials, firestore

# ── Firebase Init ────────────────────────────────────────────────────────────

_db = None

SERVICE_ACCOUNT_PATH = os.environ.get(
    "FIREBASE_SERVICE_ACCOUNT_PATH",
    os.path.join(os.path.dirname(__file__), "firebase-service-account.json"),
)


def init_firebase():
    """Initialise the Firebase Admin SDK (idempotent)."""
    global _db
    if _db is not None:
        return

    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    print("✅ Firebase Firestore initialised")

    # Seed only if loans collection is empty
    loans_ref = _db.collection("loans").limit(1).get()
    if len(loans_ref) == 0:
        seed_db()


def get_firestore_client():
    """Return the Firestore client, initialising if needed."""
    global _db
    if _db is None:
        init_firebase()
    return _db


# Alias for backward-compatibility with main.py
def get_db_connection():
    """Returns the Firestore client (replaces SQLite connection)."""
    return get_firestore_client()


def init_db():
    """Called on app startup — initialises Firebase."""
    init_firebase()


# ── Seed Data ────────────────────────────────────────────────────────────────

def seed_db():
    """Seed Firestore with demo transactions and reminders."""
    db = get_firestore_client()
    from services.reminders import build_whatsapp_reminder_schedule

    # Demo seed transactions
    seed_transactions = [
        {
            "id": "tx-1001",
            "customer_id": "cust-001",
            "customer_name": "Ramesh Traders",
            "customer_phone": "+919999000111",
            "type": "GAVE",
            "amount": 8200.0,
            "outstanding_amount": 8200.0,
            "interest_rate_monthly": 2.5,
            "due_date": "2026-04-10",
            "notes": "Seed inventory on weekly credit",
            "created_at": "2026-03-01T10:00:00",
        },
        {
            "id": "tx-1002",
            "customer_id": "cust-002",
            "customer_name": "Priya Textiles",
            "customer_phone": "+919999000222",
            "type": "GAVE",
            "amount": 4600.0,
            "outstanding_amount": 3100.0,
            "interest_rate_monthly": 1.75,
            "due_date": "2026-04-05",
            "notes": "Festival stock top-up",
            "created_at": "2026-03-05T14:30:00",
        },
        {
            "id": "tx-1003",
            "customer_id": "cust-003",
            "customer_name": "Karan Electronics",
            "customer_phone": "+919999000333",
            "type": "GOT",
            "amount": 1500.0,
            "outstanding_amount": 0.0,
            "interest_rate_monthly": None,
            "due_date": None,
            "notes": "Partial repayment received",
            "created_at": "2026-03-08T16:45:00",
        },
    ]

    for tx in seed_transactions:
        db.collection("transactions").document(tx["id"]).set(tx)

    # Build reminders for GAVE transactions
    for tx in seed_transactions:
        if tx["type"] == "GAVE":
            reminders = build_whatsapp_reminder_schedule(
                transaction_id=tx["id"],
                customer_id=tx["customer_id"],
                due_date=tx["due_date"],
            )
            for rm in reminders:
                db.collection("reminders").add(rm)

    print("🌱 Seeded Firestore with demo data")


# ── Transaction Helpers ──────────────────────────────────────────────────────

def append_transaction_db(record: Dict[str, Any]):
    db = get_firestore_client()
    doc_id = record.get("id", None)
    if doc_id:
        db.collection("transactions").document(doc_id).set(record)
    else:
        db.collection("transactions").add(record)


def append_reminders_db(reminders: List[Dict[str, Any]]):
    db = get_firestore_client()
    for rm in reminders:
        db.collection("reminders").add(rm)


# ── Dashboard ────────────────────────────────────────────────────────────────

def get_dashboard_summary_db() -> Dict[str, Any]:
    db = get_firestore_client()

    # Aggregate transactions
    gave_docs = db.collection("transactions").where("type", "==", "GAVE").get()
    got_docs = db.collection("transactions").where("type", "==", "GOT").get()

    you_will_give = sum(doc.to_dict().get("outstanding_amount", 0) for doc in gave_docs)
    you_will_get = sum(doc.to_dict().get("amount", 0) for doc in got_docs)
    active_lending_count = len(gave_docs)

    # Today's collections
    today_str = date.today().isoformat()
    payment_docs = db.collection("loan_payments").get()
    today_collected = 0.0
    collector_totals: Dict[str, float] = {}

    for doc in payment_docs:
        p = doc.to_dict()
        pd_str = p.get("payment_date", "")
        if pd_str and pd_str.startswith(today_str):
            today_collected += p.get("amount", 0)
        cn = p.get("collector_name")
        if cn:
            collector_totals[cn] = collector_totals.get(cn, 0) + p.get("amount", 0)

    collector_breakdown = [{"name": k, "total": v} for k, v in sorted(collector_totals.items(), key=lambda x: -x[1])]

    # Active loans count
    active_loan_docs = db.collection("loans").where("status", "==", "active").get()

    from services.reminders import WHATSAPP_REMINDER_DAY_OFFSETS
    return {
        "you_will_give": round(you_will_give, 2),
        "you_will_get": round(you_will_get, 2),
        "active_lending_count": active_lending_count,
        "active_loans": len(active_loan_docs),
        "today_collected": round(today_collected, 2),
        "collector_breakdown": collector_breakdown,
        "reminder_day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
    }


# ── Admin Lendings ───────────────────────────────────────────────────────────

def get_admin_lendings_db() -> List[Dict[str, Any]]:
    db = get_firestore_client()

    gave_docs = db.collection("transactions").where("type", "==", "GAVE").get()
    lendings = []

    for doc in gave_docs:
        tx = doc.to_dict()
        tx_id = tx.get("id", doc.id)

        # Get reminders for this transaction
        reminder_docs = db.collection("reminders").where("transaction_id", "==", tx_id).get()
        reminders = [r.to_dict() for r in reminder_docs]

        lendings.append({
            "transaction_id": tx_id,
            "customer_id": tx.get("customer_id"),
            "customer_name": tx.get("customer_name"),
            "customer_phone": tx.get("customer_phone"),
            "amount": tx.get("amount"),
            "outstanding_amount": tx.get("outstanding_amount"),
            "interest_rate_monthly": tx.get("interest_rate_monthly") or 0.0,
            "due_date": tx.get("due_date"),
            "notes": tx.get("notes"),
            "reminder_schedule": reminders,
        })

    return lendings


# ── Loan Payments ────────────────────────────────────────────────────────────

def get_loan_payments_db(loan_id: str) -> List[Dict[str, Any]]:
    """Return all payment records for a given loan, newest first."""
    db = get_firestore_client()
    docs = (
        db.collection("loan_payments")
        .where("loan_id", "==", loan_id)
        .order_by("payment_date", direction=firestore.Query.DESCENDING)
        .get()
    )
    rows = []
    for doc in docs:
        d = doc.to_dict()
        d["id"] = d.get("id", doc.id)
        rows.append(d)
    return rows


def get_collector_payments_db(collector_name: str) -> List[Dict[str, Any]]:
    """Return all payments logged by a specific collector, newest first."""
    db = get_firestore_client()

    # Firestore is case-sensitive, so we search as-is (collector names are stored consistently)
    docs = (
        db.collection("loan_payments")
        .where("collector_name", "==", collector_name)
        .order_by("payment_date", direction=firestore.Query.DESCENDING)
        .get()
    )

    rows = []
    for doc in docs:
        p = doc.to_dict()
        p["id"] = p.get("id", doc.id)
        loan_id = p.get("loan_id")

        # Join with loan to get borrower info
        if loan_id:
            loan_doc = db.collection("loans").document(loan_id).get()
            if loan_doc.exists:
                loan = loan_doc.to_dict()
                p["customer_name"] = loan.get("customer_name")
                p["customer_phone"] = loan.get("customer_phone")

        rows.append(p)

    return rows
