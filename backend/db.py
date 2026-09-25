"""
Persistent storage layer.

Two interchangeable backends expose the same small Firestore-style API that
main.py uses (collection -> document -> get/set/update/delete, where/limit/add):

* Firestore - used when DB_BACKEND=firestore, or when DB_BACKEND is unset and
  FIREBASE_SERVICE_ACCOUNT_PATH points at an existing service-account file.
* SQLite    - the default. One file (DB_PATH) that survives restarts without
  any cloud setup.

Nothing here keeps business data only in process memory.
"""

import json
import os
import sqlite3
import threading
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Serialises read-modify-write sequences (payment totals, account numbers,
# idempotency checks) inside one server process.
db_lock = threading.RLock()


# ── SQLite document store ────────────────────────────────────────────────────

class _Snapshot:
    def __init__(self, ref: "_DocRef", data: Optional[Dict[str, Any]]):
        self.reference = ref
        self.id = ref.id
        self._data = data

    @property
    def exists(self) -> bool:
        return self._data is not None

    def to_dict(self) -> Optional[Dict[str, Any]]:
        return dict(self._data) if self._data is not None else None


class _DocRef:
    def __init__(self, store: "SQLiteStore", collection: str, doc_id: str):
        self._store = store
        self.collection_name = collection
        self.id = doc_id

    def get(self) -> _Snapshot:
        return _Snapshot(self, self._store._read(self.collection_name, self.id))

    def set(self, data: Dict[str, Any], merge: bool = False):
        if merge:
            current = self._store._read(self.collection_name, self.id) or {}
            current.update(data)
            data = current
        self._store._write(self.collection_name, self.id, data)

    def update(self, data: Dict[str, Any]):
        with self._store.lock:
            current = self._store._read(self.collection_name, self.id)
            if current is None:
                raise KeyError(f"{self.collection_name}/{self.id} does not exist")
            current.update(data)
            self._store._write(self.collection_name, self.id, current)

    def delete(self):
        self._store._delete(self.collection_name, self.id)


class _Query:
    def __init__(self, store: "SQLiteStore", collection: str, filters=None, limit=None):
        self._store = store
        self._collection = collection
        self._filters = list(filters or [])
        self._limit = limit

    def where(self, field: str, op: str, value: Any) -> "_Query":
        return _Query(self._store, self._collection, self._filters + [(field, op, value)], self._limit)

    def limit(self, n: int) -> "_Query":
        return _Query(self._store, self._collection, self._filters, n)

    def get(self) -> List[_Snapshot]:
        rows = self._store._scan(self._collection)
        results = []
        for doc_id, data in rows:
            if all(_matches(data.get(f), op, v) for f, op, v in self._filters):
                results.append(_Snapshot(_DocRef(self._store, self._collection, doc_id), data))
                if self._limit is not None and len(results) >= self._limit:
                    break
        return results

    # Firestore-compatible alias
    stream = get


def _matches(actual: Any, op: str, expected: Any) -> bool:
    if op == "==":
        return actual == expected
    if op == "!=":
        return actual != expected
    if op == "in":
        return actual in expected
    raise ValueError(f"Unsupported query operator: {op}")


class _Collection(_Query):
    def __init__(self, store: "SQLiteStore", name: str):
        super().__init__(store, name)

    def document(self, doc_id: Optional[str] = None) -> _DocRef:
        return _DocRef(self._store, self._collection, doc_id or str(uuid4()))

    def add(self, data: Dict[str, Any]):
        ref = self.document()
        ref.set(data)
        return None, ref


class SQLiteStore:
    def __init__(self, path: str):
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS documents ("
            " collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,"
            " PRIMARY KEY (collection, id))"
        )

    def collection(self, name: str) -> _Collection:
        return _Collection(self, name)

    def _read(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            row = self._conn.execute(
                "SELECT data FROM documents WHERE collection=? AND id=?", (collection, doc_id)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def _write(self, collection: str, doc_id: str, data: Dict[str, Any]):
        payload = json.dumps(data, default=str)
        with self.lock:
            self._conn.execute(
                "INSERT INTO documents (collection, id, data) VALUES (?, ?, ?) "
                "ON CONFLICT(collection, id) DO UPDATE SET data=excluded.data",
                (collection, doc_id, payload),
            )

    def _delete(self, collection: str, doc_id: str):
        with self.lock:
            self._conn.execute("DELETE FROM documents WHERE collection=? AND id=?", (collection, doc_id))

    def _scan(self, collection: str):
        with self.lock:
            rows = self._conn.execute(
                "SELECT id, data FROM documents WHERE collection=? ORDER BY rowid", (collection,)
            ).fetchall()
        return [(doc_id, json.loads(data)) for doc_id, data in rows]


# ── Backend selection ────────────────────────────────────────────────────────

_db = None
_backend_name = None


def _service_account_path() -> str:
    path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-service-account.json")
    return path if os.path.isabs(path) else os.path.join(BACKEND_DIR, path)


def _connect():
    global _db, _backend_name
    choice = (os.environ.get("DB_BACKEND") or "").strip().lower()
    sa_path = _service_account_path()
    if choice == "firestore" or (not choice and os.path.exists(sa_path)):
        import firebase_admin
        from firebase_admin import credentials, firestore

        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(sa_path))
        _db = firestore.client()
        _backend_name = "firestore"
        print("Storage: Firebase Firestore")
    else:
        path = os.environ.get("DB_PATH", "data/digivasool.db")
        if not os.path.isabs(path):
            path = os.path.join(BACKEND_DIR, path)
        _db = SQLiteStore(path)
        _backend_name = "sqlite"
        print(f"Storage: SQLite ({path})")


def get_firestore_client():
    """Return the active document store (Firestore client or SQLite store)."""
    if _db is None:
        with db_lock:
            if _db is None:
                _connect()
    return _db


def get_backend_name() -> str:
    get_firestore_client()
    return _backend_name


def get_db_connection():
    return get_firestore_client()


def _env_flag(name: str, default: bool = False) -> bool:
    return (os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"})


def init_db():
    """Called on app startup — connects storage and optionally seeds demo data."""
    db = get_firestore_client()
    if _env_flag("SEED_DEMO_DATA") and len(db.collection("loans").limit(1).get()) == 0:
        seed_db()


# ── Demo seed (only when SEED_DEMO_DATA=true and the store is empty) ────────

def seed_db():
    db = get_firestore_client()
    from services.reminders import build_whatsapp_reminder_schedule

    transactions = [
        {"id": "tx-1001", "customer_id": "cust-001", "customer_name": "Ramesh Traders", "customer_phone": "+919999000111",
         "type": "GAVE", "amount": 8200.0, "outstanding_amount": 8200.0, "interest_rate_monthly": 2.5,
         "due_date": "2026-04-10", "notes": "Seed inventory on weekly credit", "created_at": "2026-03-01T10:00:00"},
        {"id": "tx-1002", "customer_id": "cust-002", "customer_name": "Priya Textiles", "customer_phone": "+919999000222",
         "type": "GAVE", "amount": 4600.0, "outstanding_amount": 3100.0, "interest_rate_monthly": 1.75,
         "due_date": "2026-04-05", "notes": "Festival stock top-up", "created_at": "2026-03-05T14:30:00"},
        {"id": "tx-1003", "customer_id": "cust-003", "customer_name": "Karan Electronics", "customer_phone": "+919999000333",
         "type": "GOT", "amount": 1500.0, "outstanding_amount": 0.0, "interest_rate_monthly": None,
         "due_date": None, "notes": "Partial repayment received", "created_at": "2026-03-08T16:45:00"},
    ]
    for tx in transactions:
        db.collection("transactions").document(tx["id"]).set(tx)
        if tx["type"] == "GAVE":
            append_reminders_db(build_whatsapp_reminder_schedule(
                transaction_id=tx["id"], customer_id=tx["customer_id"], due_date=tx["due_date"]))

    loans = [
        {"id": "l-1001", "customer_id": "cust-001", "customer_name": "Rajan Kumar", "customer_email": "rajan@gmail.com",
         "customer_phone": "9876543210", "customer_address": "12 3rd Street, Gandhipuram, Coimbatore", "zone": "Gandhipuram",
         "alternate_phone": "9876543211", "shop_name": "Rajan Stores", "aadhaar_number": "123456789012", "photo_url": "",
         "guarantor_name": "Suresh K", "guarantor_phone": "9876543212", "guarantor_address": "14 Gandhi Nagar, Chennai",
         "account_number": "101", "preferred_language": "en",
         "loan_amount": 50000.0, "monthly_interest_amount": 2000.0, "field_visit_charge": 500.0, "document_fee": 200.0,
         "processing_fee": 300.0, "due_amount": 53000.0, "collected_amount": 15000.0, "pending_amount": 38000.0,
         "status": "active", "total_days_paid": 2, "total_days_not_paid": 0, "repayment_frequency": "daily",
         "repayment_amount": 500.0, "start_date": "2026-05-01", "closing_date": "2026-12-15",
         "created_at": "2026-05-01T10:00:00", "created_by": "seed"},
        {"id": "l-1002", "customer_id": "cust-002", "customer_name": "Meena Devi", "customer_email": "meena@gmail.com",
         "customer_phone": "8765432109", "customer_address": "45 Cross Cut Rd, Gandhipuram, Coimbatore", "zone": "Gandhipuram",
         "alternate_phone": "", "shop_name": "", "aadhaar_number": "987654321098", "photo_url": "",
         "guarantor_name": "Ramesh M", "guarantor_phone": "8765432108", "guarantor_address": "46 Anna Street, Coimbatore",
         "account_number": "102", "preferred_language": "ta",
         "loan_amount": 21500.0, "monthly_interest_amount": 1000.0, "field_visit_charge": 200.0, "document_fee": 100.0,
         "processing_fee": 200.0, "due_amount": 21500.0, "collected_amount": 21500.0, "pending_amount": 0.0,
         "status": "closed", "total_days_paid": 1, "total_days_not_paid": 0, "repayment_frequency": "weekly",
         "repayment_amount": 4300.0, "start_date": "2026-05-10", "closing_date": "2026-07-10",
         "created_at": "2026-05-10T10:00:00", "created_by": "seed"},
    ]
    for loan in loans:
        db.collection("loans").document(loan["id"]).set(loan)

    payments = [
        {"id": "p-1001", "loan_id": "l-1001", "amount": 5000.0, "payment_method": "Cash", "payment_date": "2026-05-05T12:00:00",
         "collector_name": "Collector 1", "collector_phone": "", "notes": "First payment"},
        {"id": "p-1002", "loan_id": "l-1001", "amount": 10000.0, "payment_method": "GPay", "payment_date": "2026-05-12T14:30:00",
         "collector_name": "Collector 1", "collector_phone": "", "notes": "Second payment"},
        {"id": "p-1003", "loan_id": "l-1002", "amount": 21500.0, "payment_method": "GPay", "payment_date": "2026-05-15T15:00:00",
         "collector_name": "Collector 2", "collector_phone": "", "notes": "Full loan closure payment"},
    ]
    for p in payments:
        db.collection("loan_payments").document(p["id"]).set(p)

    print("Seeded storage with demo data (SEED_DEMO_DATA=true)")


# ── Transaction Helpers ──────────────────────────────────────────────────────

def append_transaction_db(record: Dict[str, Any]):
    db = get_firestore_client()
    record.setdefault("id", str(uuid4()))
    db.collection("transactions").document(record["id"]).set(record)


def append_reminders_db(reminders: List[Dict[str, Any]]):
    db = get_firestore_client()
    for r in reminders:
        r.setdefault("id", str(uuid4()))
        db.collection("reminders").document(r["id"]).set(r)


# ── Dashboard ────────────────────────────────────────────────────────────────

def get_dashboard_summary_db() -> Dict[str, Any]:
    db = get_firestore_client()
    txs = [d.to_dict() for d in db.collection("transactions").get()]
    gave = [t for t in txs if t.get("type") == "GAVE"]
    got = [t for t in txs if t.get("type") == "GOT"]

    today_str = date.today().isoformat()
    today_collected = 0.0
    collector_totals: Dict[str, float] = {}
    for doc in db.collection("loan_payments").get():
        p = doc.to_dict()
        if (p.get("payment_date") or "").startswith(today_str):
            today_collected += p.get("amount", 0) or 0
        cn = p.get("collector_name")
        if cn:
            collector_totals[cn] = collector_totals.get(cn, 0) + (p.get("amount", 0) or 0)

    active_loans = sum(1 for d in db.collection("loans").get() if d.to_dict().get("status") == "active")

    from services.reminders import WHATSAPP_REMINDER_DAY_OFFSETS
    return {
        "you_will_give": round(sum(t.get("outstanding_amount", 0) or 0 for t in gave), 2),
        "you_will_get": round(sum(t.get("amount", 0) or 0 for t in got), 2),
        "active_lending_count": len(gave),
        "active_loans": active_loans,
        "today_collected": round(today_collected, 2),
        "collector_breakdown": [{"name": k, "total": v} for k, v in sorted(collector_totals.items(), key=lambda x: -x[1])],
        "reminder_day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
    }


# ── Admin Lendings ───────────────────────────────────────────────────────────

def get_admin_lendings_db() -> List[Dict[str, Any]]:
    db = get_firestore_client()
    lendings = []
    for doc in db.collection("transactions").where("type", "==", "GAVE").get():
        tx = doc.to_dict()
        tx_id = tx.get("id", doc.id)
        reminders = [r.to_dict() for r in db.collection("reminders").where("transaction_id", "==", tx_id).get()]
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
    db = get_firestore_client()
    rows = []
    for doc in db.collection("loan_payments").where("loan_id", "==", loan_id).get():
        p = doc.to_dict()
        p.setdefault("id", doc.id)
        rows.append(p)
    return sorted(rows, key=lambda x: x.get("payment_date", ""), reverse=True)


def get_collector_payments_db(collector_name: Optional[str]) -> List[Dict[str, Any]]:
    """Payments logged by one collector (or all payments when collector_name is None), newest first."""
    db = get_firestore_client()
    query = db.collection("loan_payments")
    if collector_name:
        query = query.where("collector_name", "==", collector_name)
    loans = {d.id: d.to_dict() for d in db.collection("loans").get()}
    rows = []
    for doc in query.get():
        p = doc.to_dict()
        p.setdefault("id", doc.id)
        loan = loans.get(p.get("loan_id"))
        if loan:
            p["customer_name"] = loan.get("customer_name")
            p["customer_phone"] = loan.get("customer_phone")
        rows.append(p)
    return sorted(rows, key=lambda x: x.get("payment_date", ""), reverse=True)


# ── Admin Access Requests ─────────────────────────────────────────────────────
# Anyone whose phone isn't a configured admin must be approved by an existing
# admin before they can log in. Requests and approvals are persisted.

def _normalize_phone(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    # Treat "+91 98765 43210", "919876543210" and "9876543210" as the same number
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    return digits


normalize_phone = _normalize_phone


def _access_requests() -> List[Dict[str, Any]]:
    db = get_firestore_client()
    rows = []
    for d in db.collection("admin_access_requests").get():
        r = d.to_dict()
        r.setdefault("id", d.id)
        rows.append(r)
    return sorted(rows, key=lambda r: r.get("requested_at", ""))


def is_admin_phone_allowed_db(phone: str, admin_users: List[Dict[str, Any]]) -> bool:
    normalized = _normalize_phone(phone)
    if not normalized:
        return False
    allowed = {_normalize_phone(a.get("phone", "")) for a in admin_users if a.get("phone")}
    if normalized in allowed:
        return True
    return any(r["status"] == "approved" and _normalize_phone(r["phone"]) == normalized for r in _access_requests())


def get_admin_display_name_db(phone: str, admin_users: List[Dict[str, Any]]) -> Optional[str]:
    normalized = _normalize_phone(phone)
    for a in admin_users:
        if _normalize_phone(a.get("phone", "")) == normalized:
            return a["name"]
    for r in reversed(_access_requests()):
        if r["status"] == "approved" and _normalize_phone(r["phone"]) == normalized:
            return r["name"]
    return None


def create_admin_access_request_db(name: str, phone: str) -> Dict[str, Any]:
    normalized = _normalize_phone(phone)
    for r in _access_requests():
        if r["status"] == "pending" and _normalize_phone(r["phone"]) == normalized:
            return r
    record = {
        "id": str(uuid4()),
        "name": name,
        "phone": phone,
        "status": "pending",
        "requested_at": datetime.utcnow().isoformat(),
    }
    get_firestore_client().collection("admin_access_requests").document(record["id"]).set(record)
    return record


def get_pending_admin_access_requests_db() -> List[Dict[str, Any]]:
    return [r for r in _access_requests() if r["status"] == "pending"]


def resolve_admin_access_request_db(request_id: str, approve: bool, resolved_by: str = "") -> Optional[Dict[str, Any]]:
    ref = get_firestore_client().collection("admin_access_requests").document(request_id)
    snap = ref.get()
    if not snap.exists:
        return None
    record = snap.to_dict()
    if record.get("status") == "pending":
        record.update({
            "status": "approved" if approve else "denied",
            "resolved_at": datetime.utcnow().isoformat(),
            "resolved_by": resolved_by,
        })
        ref.set(record)
    return record


# ── Idempotency (duplicate-submit protection) ────────────────────────────────

def get_idempotent_response(scope: str, key: str) -> Optional[Dict[str, Any]]:
    snap = get_firestore_client().collection("idempotency_keys").document(f"{scope}:{key}").get()
    return snap.to_dict().get("response") if snap.exists else None


def save_idempotent_response(scope: str, key: str, response: Dict[str, Any]):
    get_firestore_client().collection("idempotency_keys").document(f"{scope}:{key}").set({
        "scope": scope,
        "key": key,
        "response": response,
        "created_at": datetime.utcnow().isoformat(),
    })
