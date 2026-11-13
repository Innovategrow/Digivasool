"""
Persistent storage layer.

Two interchangeable backends expose the same small document API that main.py
uses (collection -> document -> get/set/update/delete, where/limit/add):

* Supabase Postgres - the default and the only backend used in production.
  Requires DATABASE_URL (Supabase "Session pooler" connection string). If it is
  missing, startup fails loudly instead of silently falling back to a local
  file that disappears on every redeploy/sleep cycle.
* SQLite    - opt-in only, via DB_BACKEND=sqlite. Used by the test suite for
  a throwaway, isolated database - never used unless explicitly requested.

Nothing here keeps business data only in process memory.
"""

import json
import os
import re
import sqlite3
import threading
from contextvars import ContextVar
from datetime import date, datetime
from typing import Any, Dict, List, Optional
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Serialises read-modify-write sequences (payment totals, account numbers,
# idempotency checks) inside one server process.
db_lock = threading.RLock()


# ── Tenant (organisation) context ────────────────────────────────────────────
# Every record belongs to exactly one organisation. The active organisation lives in
# a ContextVar (safe across concurrent async requests and worker threads - never a
# plain global). It is set ONLY from a verified session token (see TenantMiddleware in
# main.py) or explicitly by trusted server code via as_org()/platform_scope().
# Touching tenant data with no organisation selected fails closed.

LEGACY_ORG_ID = "ORG_001"          # the pre-multi-tenant business; all old data lives here
PLATFORM_ORG = "__platform__"      # organisations / users / memberships (identity.py only)


class OrgContextError(RuntimeError):
    """Raised when tenant data is touched without an authenticated organisation."""


_current_org: ContextVar[Optional[str]] = ContextVar("current_org", default=None)


def get_current_org() -> str:
    org = _current_org.get()
    if not org:
        raise OrgContextError("No organisation selected for this request")
    return org


def set_current_org(org_id: Optional[str]):
    return _current_org.set(org_id or None)


def reset_current_org(token):
    _current_org.reset(token)


class as_org:
    """Context manager: run trusted server code (background jobs, login discovery) inside one organisation."""

    def __init__(self, org_id: str):
        self._org = org_id

    def __enter__(self):
        self._tok = _current_org.set(self._org)
        return self

    def __exit__(self, *exc):
        _current_org.reset(self._tok)


def platform_scope():
    """Scope for identity data (organisations, users, memberships). Not reachable with a tenant token."""
    return as_org(PLATFORM_ORG)


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
    def __init__(self, store: "SQLiteStore", org: str, collection: str, doc_id: str):
        self._store = store
        self._org = org
        self.collection_name = collection
        self.id = doc_id

    def get(self) -> _Snapshot:
        return _Snapshot(self, self._store._read(self._org, self.collection_name, self.id))

    def set(self, data: Dict[str, Any], merge: bool = False):
        if merge:
            current = self._store._read(self._org, self.collection_name, self.id) or {}
            current.update(data)
            data = current
        self._store._write(self._org, self.collection_name, self.id, data)

    def create(self, data: Dict[str, Any]) -> bool:
        """Insert only if the document does not exist yet (atomic). Returns False when it already exists."""
        return self._store._create(self._org, self.collection_name, self.id, data)

    def update(self, data: Dict[str, Any]):
        with self._store.lock:
            current = self._store._read(self._org, self.collection_name, self.id)
            if current is None:
                raise KeyError(f"{self.collection_name}/{self.id} does not exist")
            current.update(data)
            self._store._write(self._org, self.collection_name, self.id, current)

    def delete(self):
        self._store._delete(self._org, self.collection_name, self.id)


class _Query:
    def __init__(self, store: "SQLiteStore", org: str, collection: str, filters=None, limit=None):
        self._store = store
        self._org = org
        self._collection = collection
        self._filters = list(filters or [])
        self._limit = limit

    def where(self, field: str, op: str, value: Any) -> "_Query":
        return _Query(self._store, self._org, self._collection, self._filters + [(field, op, value)], self._limit)

    def limit(self, n: int) -> "_Query":
        return _Query(self._store, self._org, self._collection, self._filters, n)

    def get(self) -> List[_Snapshot]:
        rows = self._store._scan(self._org, self._collection)
        results = []
        for doc_id, data in rows:
            if all(_matches(data.get(f), op, v) for f, op, v in self._filters):
                results.append(_Snapshot(_DocRef(self._store, self._org, self._collection, doc_id), data))
                if self._limit is not None and len(results) >= self._limit:
                    break
        return results

    # Convenience alias
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
    def __init__(self, store: "SQLiteStore", org: str, name: str):
        super().__init__(store, org, name)

    def document(self, doc_id: Optional[str] = None) -> _DocRef:
        return _DocRef(self._store, self._org, self._collection, doc_id or str(uuid4()))

    def add(self, data: Dict[str, Any]):
        ref = self.document()
        ref.set(data)
        return None, ref


class SQLiteStore:
    """Throwaway/test backend. Same (org_id, collection, id) layout as Postgres."""

    def __init__(self, path: str):
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        self.path = path
        self.lock = threading.RLock()
        self._conn = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        cols = [r[1] for r in self._conn.execute("PRAGMA table_info(documents)").fetchall()]
        if cols and "org_id" not in cols:
            # A pre-multi-tenant local file: keep every row, assign it to the legacy organisation.
            self._conn.execute("ALTER TABLE documents RENAME TO documents_legacy")
            self._create_table()
            self._conn.execute(
                "INSERT INTO documents (org_id, collection, id, data) "
                "SELECT ?, collection, id, data FROM documents_legacy ORDER BY rowid", (LEGACY_ORG_ID,))
            self._conn.execute("DROP TABLE documents_legacy")
        else:
            self._create_table()

    def _create_table(self):
        self._conn.execute(
            "CREATE TABLE IF NOT EXISTS documents ("
            " org_id TEXT NOT NULL, collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,"
            " PRIMARY KEY (org_id, collection, id))"
        )

    def collection(self, name: str, org: Optional[str] = None) -> _Collection:
        return _Collection(self, org or get_current_org(), name)

    def _read(self, org: str, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        with self.lock:
            row = self._conn.execute(
                "SELECT data FROM documents WHERE org_id=? AND collection=? AND id=?", (org, collection, doc_id)
            ).fetchone()
        return json.loads(row[0]) if row else None

    def _write(self, org: str, collection: str, doc_id: str, data: Dict[str, Any]):
        payload = json.dumps(data, default=str)
        with self.lock:
            self._conn.execute(
                "INSERT INTO documents (org_id, collection, id, data) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(org_id, collection, id) DO UPDATE SET data=excluded.data",
                (org, collection, doc_id, payload),
            )

    def _create(self, org: str, collection: str, doc_id: str, data: Dict[str, Any]) -> bool:
        with self.lock:
            cur = self._conn.execute(
                "INSERT OR IGNORE INTO documents (org_id, collection, id, data) VALUES (?, ?, ?, ?)",
                (org, collection, doc_id, json.dumps(data, default=str)),
            )
            return cur.rowcount == 1

    def _delete(self, org: str, collection: str, doc_id: str):
        with self.lock:
            self._conn.execute(
                "DELETE FROM documents WHERE org_id=? AND collection=? AND id=?", (org, collection, doc_id))

    def _scan(self, org: str, collection: str):
        with self.lock:
            rows = self._conn.execute(
                "SELECT id, data FROM documents WHERE org_id=? AND collection=? ORDER BY rowid", (org, collection)
            ).fetchall()
        return [(doc_id, json.loads(data)) for doc_id, data in rows]


APP_ROLE = "digivasool_app"   # restricted, non-bypass role every tenant query runs as (see migrations/)


class PostgresStore:
    """Same document API on Postgres (Supabase). One shared `documents` table; non-Finance
    books are separated by a "<book>_" collection prefix and every row carries its org_id.

    Isolation is enforced twice: every statement filters on org_id, AND each statement runs
    in its own transaction as the restricted APP_ROLE with `app.org_id` set, so Postgres
    row-level security rejects any row of another organisation even if a filter were missed.
    """

    def __init__(self, url: str):
        self.url = url
        self.lock = threading.RLock()
        self._conn = None
        self._ensure()
        with self.lock:
            has_table = self._conn.execute("SELECT to_regclass('public.documents')").fetchone()[0] is not None
            if not has_table:
                from migrations import runner  # fresh install: create the multi-tenant schema directly
                runner.create_fresh_schema(self._conn)
            else:
                has_org = self._conn.execute(
                    "SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='org_id'"
                ).fetchone()
                if not has_org:
                    raise RuntimeError(
                        "The database has not been migrated to multi-tenant yet. Take a backup, then run "
                        "`python scripts/migrate_multitenant.py apply` (see docs/MULTI_TENANT_MIGRATION.md) "
                        "before starting this version.")
                self._ensure_rls_ready()

    def _ensure_rls_ready(self):
        row = self._conn.execute(
            "SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.documents')").fetchone()
        if not row or not row[0]:
            raise RuntimeError("Row-level security is not enabled on documents; run the multi-tenant migration.")
        if not self._conn.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (APP_ROLE,)).fetchone():
            raise RuntimeError(f"Database role {APP_ROLE} is missing; run the multi-tenant migration.")

    def _ensure(self):
        import psycopg

        if self._conn is None or self._conn.closed:
            self._conn = psycopg.connect(self.url, autocommit=True, prepare_threshold=None)

    def _run(self, org: str, sql: str, params=(), fetch: Optional[str] = None):
        """Run one statement as APP_ROLE inside a transaction that carries the organisation context.
        Retries once on a dropped connection (Supabase pooler drops idle connections)."""
        import psycopg

        if not org:
            raise OrgContextError("No organisation selected for this request")
        with self.lock:
            for attempt in (0, 1):
                try:
                    self._ensure()
                    with self._conn.transaction():
                        # set_config(..., true) = transaction-local: nothing leaks into the next request
                        # that reuses this pooled connection.
                        self._conn.execute(
                            "SELECT set_config('role', %s, true), set_config('app.org_id', %s, true)", (APP_ROLE, org))
                        cur = self._conn.execute(sql, params)
                        if fetch == "one":
                            return cur.fetchone()
                        if fetch == "all":
                            return cur.fetchall()
                        return cur.rowcount
                except psycopg.OperationalError:
                    try:
                        self._conn.close()
                    except Exception:
                        pass
                    self._conn = None
                    if attempt:
                        raise

    def collection(self, name: str, org: Optional[str] = None) -> _Collection:
        return _Collection(self, org or get_current_org(), name)

    def _read(self, org: str, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        row = self._run(org, "SELECT data FROM documents WHERE org_id=%s AND collection=%s AND id=%s",
                        (org, collection, doc_id), "one")
        return row[0] if row else None

    def _write(self, org: str, collection: str, doc_id: str, data: Dict[str, Any]):
        self._run(
            org,
            "INSERT INTO documents (org_id, collection, id, data) VALUES (%s, %s, %s, %s::jsonb) "
            "ON CONFLICT (org_id, collection, id) DO UPDATE SET data = EXCLUDED.data",
            (org, collection, doc_id, json.dumps(data, default=str)),
        )

    def _create(self, org: str, collection: str, doc_id: str, data: Dict[str, Any]) -> bool:
        n = self._run(
            org,
            "INSERT INTO documents (org_id, collection, id, data) VALUES (%s, %s, %s, %s::jsonb) "
            "ON CONFLICT (org_id, collection, id) DO NOTHING",
            (org, collection, doc_id, json.dumps(data, default=str)),
        )
        return n == 1

    def _delete(self, org: str, collection: str, doc_id: str):
        self._run(org, "DELETE FROM documents WHERE org_id=%s AND collection=%s AND id=%s", (org, collection, doc_id))

    def _scan(self, org: str, collection: str):
        rows = self._run(org, "SELECT id, data FROM documents WHERE org_id=%s AND collection=%s ORDER BY seq",
                         (org, collection), "all")
        return [(doc_id, data) for doc_id, data in rows]

    def put_file(self, org: str, path: str, data: bytes, content_type: str):
        self._run(
            org,
            "INSERT INTO files (org_id, path, content_type, data) VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (org_id, path) DO UPDATE SET content_type=EXCLUDED.content_type, data=EXCLUDED.data",
            (org, path, content_type, data),
        )

    def get_file(self, org: str, path: str):
        row = self._run(org, "SELECT data, content_type FROM files WHERE org_id=%s AND path=%s", (org, path), "one")
        return (bytes(row[0]), row[1]) if row else None


# ── Backend selection ────────────────────────────────────────────────────────

_raw_stores: Dict[str, Any] = {}
_backend_name = None


def _sqlite_path(business: str) -> str:
    path = os.environ.get("DB_PATH", "data/digivasool.db")
    if not os.path.isabs(path):
        path = os.path.join(BACKEND_DIR, path)
    if business != DEFAULT_BUSINESS:  # every other book gets its own file: <name>_<book>.db
        root, ext = os.path.splitext(path)
        path = f"{root}_{business}{ext}"
    return path


def _connect(business: str):
    global _backend_name
    choice = (os.environ.get("DB_BACKEND") or "").strip().lower()
    if choice == "sqlite":
        path = _sqlite_path(business)
        _raw_stores[business] = SQLiteStore(path)
        _backend_name = "sqlite"
        print(f"Storage [{business}]: SQLite ({path})")
        return

    # Supabase Postgres is the default - including when DB_BACKEND is unset or
    # mistyped - so a misconfigured deploy fails loudly here instead of quietly
    # running on an ephemeral local file.
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL is required (Supabase Session pooler connection string)")
    if "_postgres" not in _raw_stores:
        _raw_stores["_postgres"] = PostgresStore(url)
    _raw_stores[business] = _raw_stores["_postgres"]
    _backend_name = "postgres"
    print(f"Storage [{business}]: Supabase Postgres")


# ── Business scoping (Finance vs Fund) ───────────────────────────────────────

# active business is set per request (X-Business header). SQLite uses one
# database file per book; Postgres prefixes non-Finance collections with "<book>_".

# Books: "finance" always exists; "fund" is the original second book; admins can
# create more, each with its own storage. Only the book registry is shared.
DEFAULT_BUSINESS = "finance"
_BUILTIN_BOOKS = [{"id": "finance", "name": "Finance"}, {"id": "fund", "name": "Fund"}]
_SHARED_COLLECTIONS = {"books"}

_current_business: ContextVar[str] = ContextVar("current_business", default=DEFAULT_BUSINESS)


def slugify_book(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (name or "").lower())[:30]


def list_books() -> List[Dict[str, str]]:
    books = list(_BUILTIN_BOOKS)
    known = {b["id"] for b in books}
    for snap in _store("finance").collection("books").get():
        data = snap.to_dict() or {}
        if snap.id not in known and data.get("name"):
            books.append({"id": snap.id, "name": data["name"]})
    return books


def create_book(name: str) -> Dict[str, str]:
    name = (name or "").strip()[:40]
    book_id = slugify_book(name)
    if not name or not book_id:
        raise ValueError("Enter a name for the book")
    if any(b["id"] == book_id or b["name"].lower() == name.lower() for b in list_books()):
        raise ValueError("A book with this name already exists")
    _store("finance").collection("books").document(book_id).set({"name": name})
    return {"id": book_id, "name": name}


def normalize_business(value: Optional[str]) -> str:
    value = (value or "").strip().lower()
    if value in ("", DEFAULT_BUSINESS) or not re.fullmatch(r"[a-z0-9]{1,30}", value):
        return DEFAULT_BUSINESS
    if any(b["id"] == value for b in _BUILTIN_BOOKS):
        return value
    if _current_org.get() in (None, PLATFORM_ORG):  # custom books are per organisation; none selected yet
        return DEFAULT_BUSINESS
    return value if any(b["id"] == value for b in list_books()) else DEFAULT_BUSINESS


def set_current_business(value: Optional[str]):
    return _current_business.set(normalize_business(value))


def reset_current_business(token):
    _current_business.reset(token)


def get_current_business() -> str:
    return _current_business.get()


class _ScopedClient:
    """Routes collection access to the active business's storage."""

    def __init__(self, business: str):
        self._business = business

    def collection(self, name: str):
        if name in _SHARED_COLLECTIONS:
            return _store(DEFAULT_BUSINESS).collection(name)
        store = _store(self._business)
        if self._business != DEFAULT_BUSINESS and _backend_name == "postgres":
            name = f"{self._business}_{name}"
        return store.collection(name)


def _store(business: str):
    if business not in _raw_stores:
        with db_lock:
            if business not in _raw_stores:
                _connect(business)
    return _raw_stores[business]


def get_db_client(business: Optional[str] = None):
    """Return the document store scoped to the active (or given) business."""
    return _ScopedClient(normalize_business(business) if business else get_current_business())


def save_file(path: str, data: bytes, content_type: str = "application/octet-stream") -> bool:
    """Store an uploaded file in Supabase. Returns False on SQLite (caller saves to disk instead)."""
    store = _store("finance")
    if isinstance(store, PostgresStore):
        store.put_file(get_current_org(), path, data, content_type)
        return True
    return False


def load_file(path: str):
    """Return (bytes, content_type) for a stored upload, or None."""
    store = _store("finance")
    return store.get_file(get_current_org(), path) if isinstance(store, PostgresStore) else None


def get_backend_name() -> str:
    _store("finance")
    return _backend_name


def get_db_connection():
    return get_db_client()


def _env_flag(name: str, default: bool = False) -> bool:
    return (os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"})


def init_db():
    """Called on app startup — connects storage and optionally seeds demo data (into the legacy org)."""
    _store("fund")  # connect Fund storage at startup so misconfiguration fails loudly
    if _env_flag("SEED_DEMO_DATA"):
        with as_org(LEGACY_ORG_ID):
            if len(get_db_client("finance").collection("loans").limit(1).get()) == 0:
                seed_db()


# ── Demo seed (only when SEED_DEMO_DATA=true and the store is empty) ────────

def seed_db():
    db = get_db_client()
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
    db = get_db_client()
    record.setdefault("id", str(uuid4()))
    db.collection("transactions").document(record["id"]).set(record)


def append_reminders_db(reminders: List[Dict[str, Any]]):
    db = get_db_client()
    for r in reminders:
        r.setdefault("id", str(uuid4()))
        db.collection("reminders").document(r["id"]).set(r)


# ── Dashboard ────────────────────────────────────────────────────────────────

def get_dashboard_summary_db(collector_name: Optional[str] = None) -> Dict[str, Any]:
    """Organisation-wide summary for admins. With `collector_name` (a collector's own view) only that person's
    collections and assigned borrowers are counted and the ledger totals / other collectors are left out."""
    db = get_db_client()
    txs = [] if collector_name else [d.to_dict() for d in db.collection("transactions").get()]
    gave = [t for t in txs if t.get("type") == "GAVE"]
    got = [t for t in txs if t.get("type") == "GOT"]

    today_str = date.today().isoformat()
    today_collected = 0.0
    collector_totals: Dict[str, float] = {}
    for doc in db.collection("loan_payments").get():
        p = doc.to_dict()
        if collector_name and p.get("collector_name") != collector_name:
            continue
        if (p.get("payment_date") or "").startswith(today_str):
            today_collected += p.get("amount", 0) or 0
        cn = p.get("collector_name")
        if cn:
            collector_totals[cn] = collector_totals.get(cn, 0) + (p.get("amount", 0) or 0)

    def _mine(loan: Dict[str, Any]) -> bool:
        return not collector_name or collector_name in (loan.get("assigned_collectors") or [])

    active_loans = sum(1 for d in db.collection("loans").get()
                       if d.to_dict().get("status") == "active" and _mine(d.to_dict()))

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
    db = get_db_client()
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
    db = get_db_client()
    rows = []
    for doc in db.collection("loan_payments").where("loan_id", "==", loan_id).get():
        p = doc.to_dict()
        p.setdefault("id", doc.id)
        rows.append(p)
    return sorted(rows, key=lambda x: x.get("payment_date", ""), reverse=True)


def get_collector_payments_db(collector_name: Optional[str], loans: Optional[Dict[str, Dict[str, Any]]] = None) -> List[Dict[str, Any]]:
    """Payments logged by one collector (or all payments when collector_name is None), newest first."""
    db = get_db_client()
    query = db.collection("loan_payments")
    if collector_name:
        query = query.where("collector_name", "==", collector_name)
    if loans is None:
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
    db = get_db_client()
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
    get_db_client().collection("admin_access_requests").document(record["id"]).set(record)
    return record


def get_pending_admin_access_requests_db() -> List[Dict[str, Any]]:
    return [r for r in _access_requests() if r["status"] == "pending"]


def resolve_admin_access_request_db(request_id: str, approve: bool, resolved_by: str = "") -> Optional[Dict[str, Any]]:
    ref = get_db_client().collection("admin_access_requests").document(request_id)
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
    snap = get_db_client().collection("idempotency_keys").document(f"{scope}:{key}").get()
    return snap.to_dict().get("response") if snap.exists else None


def save_idempotent_response(scope: str, key: str, response: Dict[str, Any]):
    get_db_client().collection("idempotency_keys").document(f"{scope}:{key}").set({
        "scope": scope,
        "key": key,
        "response": response,
        "created_at": datetime.utcnow().isoformat(),
    })
