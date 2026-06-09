"""
In-memory database layer.
Replaces the Firebase implementation for local testing without credentials.
"""

import os
from typing import Dict, Any, List, Optional
from datetime import date
from uuid import uuid4

class MockDocument:
    def __init__(self, collection_name: str, doc_id: str):
        self.collection_name = collection_name
        self.id = doc_id

    @property
    def exists(self):
        if self.collection_name == "loans":
            return any(l["id"] == self.id for l in _loans)
        elif self.collection_name == "loan_payments":
            return any(p["id"] == self.id for p in _loan_payments)
        elif self.collection_name == "reminders":
            return any(r["id"] == self.id for r in _reminders)
        elif self.collection_name == "transactions":
            return any(t["id"] == self.id for t in _transactions)
        return False

    def get(self):
        return self

    def to_dict(self):
        if self.collection_name == "loans":
            for l in _loans:
                if l["id"] == self.id:
                    return l
        elif self.collection_name == "loan_payments":
            for p in _loan_payments:
                if p["id"] == self.id:
                    return p
        elif self.collection_name == "reminders":
            for r in _reminders:
                if r["id"] == self.id:
                    return r
        elif self.collection_name == "transactions":
            for t in _transactions:
                if t["id"] == self.id:
                    return t
        return None

    def set(self, data: dict):
        data["id"] = self.id
        if self.collection_name == "loans":
            for i, l in enumerate(_loans):
                if l["id"] == self.id:
                    _loans[i] = data
                    return
            _loans.append(data)
        elif self.collection_name == "loan_payments":
            for i, p in enumerate(_loan_payments):
                if p["id"] == self.id:
                    _loan_payments[i] = data
                    return
            _loan_payments.append(data)
        elif self.collection_name == "reminders":
            for i, r in enumerate(_reminders):
                if r["id"] == self.id:
                    _reminders[i] = data
                    return
            _reminders.append(data)
        elif self.collection_name == "transactions":
            for i, t in enumerate(_transactions):
                if t["id"] == self.id:
                    _transactions[i] = data
                    return
            _transactions.append(data)

    def update(self, data: dict):
        if self.collection_name == "loans":
            for l in _loans:
                if l["id"] == self.id:
                    l.update(data)
                    return
        elif self.collection_name == "loan_payments":
            for p in _loan_payments:
                if p["id"] == self.id:
                    p.update(data)
                    return
        elif self.collection_name == "reminders":
            for r in _reminders:
                if r["id"] == self.id:
                    r.update(data)
                    return
        elif self.collection_name == "transactions":
            for t in _transactions:
                if t["id"] == self.id:
                    t.update(data)
                    return

    def delete(self):
        if self.collection_name == "loans":
            global _loans
            _loans = [l for l in _loans if l["id"] != self.id]
        elif self.collection_name == "loan_payments":
            global _loan_payments
            _loan_payments = [p for p in _loan_payments if p["id"] != self.id]
        elif self.collection_name == "reminders":
            global _reminders
            _reminders = [r for r in _reminders if r["id"] != self.id]
        elif self.collection_name == "transactions":
            global _transactions
            _transactions = [t for t in _transactions if t["id"] != self.id]

    @property
    def reference(self):
        return self

class MockQuery:
    def __init__(self, collection_name: str, filters: list = None):
        self.collection_name = collection_name
        self.filters = filters or []
        self._limit = None

    def where(self, field: str, op: str, value: Any):
        self.filters.append((field, op, value))
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    def get(self):
        items = []
        if self.collection_name == "loans":
            items = _loans
        elif self.collection_name == "loan_payments":
            items = _loan_payments
        elif self.collection_name == "reminders":
            items = _reminders
        elif self.collection_name == "transactions":
            items = _transactions

        filtered_items = []
        for item in items:
            match = True
            for field, op, val in self.filters:
                item_val = item.get(field)
                if op == "==":
                    if item_val != val:
                        match = False
                        break
                elif op == "in":
                    if item_val not in val:
                        match = False
                        break
            if match:
                filtered_items.append(item)

        if self._limit is not None:
            filtered_items = filtered_items[:self._limit]

        return [MockDocument(self.collection_name, item["id"]) for item in filtered_items]

class MockCollection:
    def __init__(self, name: str):
        self.name = name

    def document(self, doc_id: str):
        return MockDocument(self.name, doc_id)

    def add(self, data: dict):
        doc_id = str(uuid4())
        doc = MockDocument(self.name, doc_id)
        doc.set(data)
        return doc

    def where(self, field: str, op: str, value: Any):
        return MockQuery(self.name, [(field, op, value)])

    def limit(self, n: int):
        return MockQuery(self.name, []).limit(n)

    def get(self):
        return MockQuery(self.name, []).get()

class MockFirestore:
    def collection(self, name: str):
        return MockCollection(name)

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
    global _transactions, _reminders, _loans, _loan_payments

    # Don't re-seed if data already exists
    if _transactions or _loans:
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

    _loans = [
        {
            "id": "l-1001",
            "customer_id": "cust-001",
            "customer_name": "Rajan Kumar",
            "customer_email": "rajan@gmail.com",
            "customer_phone": "9876543210",
            "customer_address": "12 3rd Street, Gandhipuram, Coimbatore",
            "zone": "Gandhipuram",
            "alternate_phone": "9876543211",
            "shop_name": "Rajan Stores",
            "aadhaar_number": "123456789012",
            "photo_url": "",
            "guarantor_name": "Suresh K",
            "guarantor_phone": "9876543212",
            "guarantor_address": "14 Gandhi Nagar, Chennai",
            "loan_amount": 50000.0,
            "monthly_interest_amount": 2000.0,
            "field_visit_charge": 500.0,
            "document_fee": 200.0,
            "processing_fee": 300.0,
            "due_amount": 53000.0,
            "collected_amount": 15000.0,
            "pending_amount": 38000.0,
            "status": "active",
            "total_days_paid": 3,
            "total_days_not_paid": 0,
            "repayment_frequency": "daily",
            "repayment_amount": 500.0,
            "start_date": "2026-05-01",
            "closing_date": "2026-08-15",
            "created_at": "2026-05-01T10:00:00"
        },
        {
            "id": "l-1002",
            "customer_id": "cust-002",
            "customer_name": "Meena Devi",
            "customer_email": "meena@gmail.com",
            "customer_phone": "8765432109",
            "customer_address": "45 Cross Cut Rd, Gandhipuram, Coimbatore",
            "zone": "Gandhipuram",
            "alternate_phone": "",
            "shop_name": "",
            "aadhaar_number": "987654321098",
            "photo_url": "",
            "guarantor_name": "Ramesh M",
            "guarantor_phone": "8765432108",
            "guarantor_address": "46 Anna Street, Coimbatore",
            "loan_amount": 20000.0,
            "monthly_interest_amount": 1000.0,
            "field_visit_charge": 200.0,
            "document_fee": 100.0,
            "processing_fee": 200.0,
            "due_amount": 21500.0,
            "collected_amount": 21500.0,
            "pending_amount": 0.0,
            "status": "closed",
            "total_days_paid": 5,
            "total_days_not_paid": 0,
            "repayment_frequency": "weekly",
            "repayment_amount": 4300.0,
            "created_at": "2026-05-10T10:00:00"
        }
    ]

    _loan_payments = [
        {
            "id": "p-1001",
            "loan_id": "l-1001",
            "amount": 5000.0,
            "payment_method": "Cash",
            "payment_date": "2026-05-05T12:00:00",
            "collector_name": "Collector 1",
            "collector_phone": "9001234568",
            "notes": "First payment"
        },
        {
            "id": "p-1002",
            "loan_id": "l-1001",
            "amount": 10000.0,
            "payment_method": "GPay",
            "payment_date": "2026-05-12T14:30:00",
            "collector_name": "Collector 1",
            "collector_phone": "9001234568",
            "notes": "Second payment"
        },
        {
            "id": "p-1003",
            "loan_id": "l-1002",
            "amount": 21500.0,
            "payment_method": "GPay",
            "payment_date": "2026-05-15T15:00:00",
            "collector_name": "Collector 2",
            "collector_phone": "9001234569",
            "notes": "Full loan closure payment"
        }
    ]

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
    """Return the MockFirestore client."""
    return MockFirestore()
