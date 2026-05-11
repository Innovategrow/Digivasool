"""
In-memory database layer.
Replaces the Firebase implementation for local testing without credentials.
"""

import os
from typing import Dict, Any, List, Optional
from datetime import date

# ── In-Memory Store ──────────────────────────────────────────────────────────

_transactions = []
_reminders = []
_loan_payments = []
_loans = []

def init_db():
    """Called on app startup — initialises the mock database."""
    seed_db()

def seed_db():
    """Seed the in-memory store with demo transactions and reminders."""
    global _transactions, _reminders
    
    # Don't re-seed if data already exists
    if _transactions:
        return

    from services.reminders import build_whatsapp_reminder_schedule

    # Demo seed transactions
    _transactions = [
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

    # Build reminders for GAVE transactions
    for tx in _transactions:
        if tx["type"] == "GAVE":
            rems = build_whatsapp_reminder_schedule(
                transaction_id=tx["id"],
                customer_id=tx["customer_id"],
                due_date=tx["due_date"],
            )
            _reminders.extend(rems)

    print("🌱 Seeded in-memory store with demo data")


# ── Transaction Helpers ──────────────────────────────────────────────────────

def append_transaction_db(record: Dict[str, Any]):
    if "id" not in record:
        record["id"] = f"tx-{len(_transactions) + 1004}"
    _transactions.append(record)


def append_reminders_db(reminders: List[Dict[str, Any]]):
    _reminders.extend(reminders)


# ── Dashboard ────────────────────────────────────────────────────────────────

def get_dashboard_summary_db() -> Dict[str, Any]:
    gave_txs = [tx for tx in _transactions if tx["type"] == "GAVE"]
    got_txs = [tx for tx in _transactions if tx["type"] == "GOT"]

    you_will_give = sum(tx.get("outstanding_amount", 0) for tx in gave_txs)
    you_will_get = sum(tx.get("amount", 0) for tx in got_txs)
    active_lending_count = len(gave_txs)

    # Today's collections (mock logic)
    today_str = date.today().isoformat()
    today_collected = 0.0
    collector_totals: Dict[str, float] = {}

    for p in _loan_payments:
        pd_str = p.get("payment_date", "")
        if pd_str and pd_str.startswith(today_str):
            today_collected += p.get("amount", 0)
        cn = p.get("collector_name")
        if cn:
            collector_totals[cn] = collector_totals.get(cn, 0) + p.get("amount", 0)

    collector_breakdown = [{"name": k, "total": v} for k, v in sorted(collector_totals.items(), key=lambda x: -x[1])]

    from services.reminders import WHATSAPP_REMINDER_DAY_OFFSETS
    return {
        "you_will_give": round(you_will_give, 2),
        "you_will_get": round(you_will_get, 2),
        "active_lending_count": active_lending_count,
        "active_loans": len(_loans),
        "today_collected": round(today_collected, 2),
        "collector_breakdown": collector_breakdown,
        "reminder_day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
    }


# ── Admin Lendings ───────────────────────────────────────────────────────────

def get_admin_lendings_db() -> List[Dict[str, Any]]:
    gave_txs = [tx for tx in _transactions if tx["type"] == "GAVE"]
    lendings = []

    for tx in gave_txs:
        tx_id = tx.get("id")
        reminders = [r for r in _reminders if r.get("transaction_id") == tx_id]

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
    payments = [p for p in _loan_payments if p.get("loan_id") == loan_id]
    return sorted(payments, key=lambda x: x.get("payment_date", ""), reverse=True)


def get_collector_payments_db(collector_name: str) -> List[Dict[str, Any]]:
    payments = [p for p in _loan_payments if p.get("collector_name") == collector_name]
    
    # Mock join with loans
    for p in payments:
        loan_id = p.get("loan_id")
        loan = next((l for l in _loans if l.get("id") == loan_id), None)
        if loan:
            p["customer_name"] = loan.get("customer_name")
            p["customer_phone"] = loan.get("customer_phone")

    return sorted(payments, key=lambda x: x.get("payment_date", ""), reverse=True)

# ── Compatibility Aliases ─────────────────────────────────────────────────────

def get_db_connection():
    """Dummy connection for backward compatibility."""
    return None

def get_firestore_client():
    """Dummy client for backward compatibility."""
    return None
