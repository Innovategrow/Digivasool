import sqlite3
import os
from typing import Dict, Any, List

DB_PATH = "digital_khata.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()

    # Transactions table
    c.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id TEXT PRIMARY KEY,
            customer_id TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            type TEXT,
            amount REAL,
            outstanding_amount REAL,
            interest_rate_monthly REAL,
            due_date TEXT,
            notes TEXT,
            created_at TEXT,
            shopkeeper_id TEXT
        )
    """)

    # Reminders table
    c.execute("""
        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT,
            customer_id TEXT,
            channel TEXT,
            day_offset INTEGER,
            scheduled_for TEXT,
            status TEXT
        )
    """)

    # Loans table
    c.execute("""
        CREATE TABLE IF NOT EXISTS loans (
            id TEXT PRIMARY KEY,
            customer_id TEXT,
            customer_name TEXT,
            loan_amount REAL,
            interest_document REAL,
            start_date TEXT,
            closing_date TEXT,
            due_amount REAL,
            collected_amount REAL,
            pending_amount REAL,
            status TEXT,
            total_days_paid INTEGER,
            total_days_not_paid INTEGER,
            created_at TEXT
        )
    """)

    # Loan Payments table
    c.execute("""
        CREATE TABLE IF NOT EXISTS loan_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            loan_id TEXT,
            amount REAL,
            payment_method TEXT,
            payment_date TEXT,
            collector_name TEXT,
            collector_phone TEXT,
            notes TEXT,
            FOREIGN KEY(loan_id) REFERENCES loans(id)
        )
    """)

    # Audit log table
    c.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT,
            action TEXT,
            detail TEXT,
            created_at TEXT
        )
    """)

    # ── Safe migrations for new columns on existing DB ──────────────────────────
    loan_new_cols = [
        ("customer_email",        "TEXT"),
        ("customer_phone",        "TEXT"),
        ("customer_address",      "TEXT"),
        ("repayment_frequency",   "TEXT DEFAULT 'monthly'"),
        ("repayment_amount",      "REAL DEFAULT 0"),
    ]
    for col, coltype in loan_new_cols:
        try:
            c.execute(f"ALTER TABLE loans ADD COLUMN {col} {coltype}")
        except Exception:
            pass  # column already exists

    payment_new_cols = [
        ("collector_name",  "TEXT"),
        ("collector_phone", "TEXT"),
        ("notes",           "TEXT"),
    ]
    for col, coltype in payment_new_cols:
        try:
            c.execute(f"ALTER TABLE loan_payments ADD COLUMN {col} {coltype}")
        except Exception:
            pass

    conn.commit()

    # Seed only if transactions are empty
    c.execute("SELECT COUNT(*) FROM transactions")
    if c.fetchone()[0] == 0:
        seed_db(conn)

    conn.close()


def seed_db(conn):
    c = conn.cursor()
    from data_store import FALLBACK_TRANSACTIONS, FALLBACK_REMINDERS

    for tx in FALLBACK_TRANSACTIONS:
        c.execute("""
            INSERT INTO transactions (id, customer_id, customer_name, customer_phone, type, amount, outstanding_amount, interest_rate_monthly, due_date, notes, created_at, shopkeeper_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (tx['id'], tx['customer_id'], tx['customer_name'], tx.get('customer_phone'), tx['type'], tx['amount'], tx['outstanding_amount'], tx.get('interest_rate_monthly'), tx.get('due_date'), tx.get('notes'), tx['created_at'], 'default_shop'))

    for rm in FALLBACK_REMINDERS:
        c.execute("""
            INSERT INTO reminders (transaction_id, customer_id, channel, day_offset, scheduled_for, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (rm['transaction_id'], rm['customer_id'], rm.get('channel', 'whatsapp'), rm['day_offset'], rm['scheduled_for'], rm.get('status', 'scheduled')))

    conn.commit()


# ── DB Helper Functions ──────────────────────────────────────────────────────

def append_transaction_db(record):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO transactions (id, customer_id, customer_name, customer_phone, type, amount, outstanding_amount, interest_rate_monthly, due_date, notes, created_at, shopkeeper_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (record['id'], record['customer_id'], record['customer_name'], record.get('customer_phone'), record['type'], record['amount'], record['outstanding_amount'], record.get('interest_rate_monthly'), record.get('due_date'), record.get('notes'), record['created_at'], record.get('shopkeeper_id')))
    conn.commit()
    conn.close()


def append_reminders_db(reminders):
    conn = get_db_connection()
    c = conn.cursor()
    for rm in reminders:
        c.execute("""
            INSERT INTO reminders (transaction_id, customer_id, channel, day_offset, scheduled_for, status)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (rm['transaction_id'], rm['customer_id'], rm.get('channel', 'whatsapp'), rm['day_offset'], rm['scheduled_for'], rm.get('status', 'scheduled')))
    conn.commit()
    conn.close()


def get_dashboard_summary_db():
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("SELECT SUM(outstanding_amount) FROM transactions WHERE type='GAVE'")
    you_will_give = c.fetchone()[0] or 0.0

    c.execute("SELECT SUM(amount) FROM transactions WHERE type='GOT'")
    you_will_get = c.fetchone()[0] or 0.0

    c.execute("SELECT COUNT(*) FROM transactions WHERE type='GAVE'")
    active_lending_count = c.fetchone()[0] or 0

    # Today's collections
    today = __import__('datetime').date.today().isoformat()
    c.execute("SELECT SUM(amount) FROM loan_payments WHERE payment_date LIKE ?", (f"{today}%",))
    today_collected = c.fetchone()[0] or 0.0

    # By-collector breakdown (all time)
    c.execute("""
        SELECT collector_name, SUM(amount) as total
        FROM loan_payments
        WHERE collector_name IS NOT NULL
        GROUP BY collector_name
        ORDER BY total DESC
    """)
    collector_breakdown = [{"name": row["collector_name"], "total": row["total"]} for row in c.fetchall()]

    # Total active loans
    c.execute("SELECT COUNT(*) FROM loans WHERE status='active'")
    active_loans = c.fetchone()[0] or 0

    conn.close()

    from services.reminders import WHATSAPP_REMINDER_DAY_OFFSETS
    return {
        "you_will_give": round(you_will_give, 2),
        "you_will_get": round(you_will_get, 2),
        "active_lending_count": active_lending_count,
        "active_loans": active_loans,
        "today_collected": round(today_collected, 2),
        "collector_breakdown": collector_breakdown,
        "reminder_day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
    }


def get_admin_lendings_db():
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM transactions WHERE type='GAVE'")
    transactions = [dict(row) for row in c.fetchall()]

    lendings = []
    for tx in transactions:
        c.execute("SELECT * FROM reminders WHERE transaction_id=?", (tx['id'],))
        reminders = [dict(row) for row in c.fetchall()]

        lendings.append({
            "transaction_id": tx["id"],
            "customer_id": tx["customer_id"],
            "customer_name": tx["customer_name"],
            "customer_phone": tx.get("customer_phone"),
            "amount": tx["amount"],
            "outstanding_amount": tx["outstanding_amount"],
            "interest_rate_monthly": tx.get("interest_rate_monthly") or 0.0,
            "due_date": tx.get("due_date"),
            "notes": tx.get("notes"),
            "reminder_schedule": reminders,
        })

    conn.close()
    return lendings


def get_loan_payments_db(loan_id: str):
    """Return all payment records for a given loan, newest first."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM loan_payments WHERE loan_id=? ORDER BY payment_date DESC
    """, (loan_id,))
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return rows


def get_collector_payments_db(collector_name: str):
    """Return all payments logged by a specific collector, newest first."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        SELECT lp.*, l.customer_name, l.customer_phone
        FROM loan_payments lp
        JOIN loans l ON lp.loan_id = l.id
        WHERE LOWER(lp.collector_name)=LOWER(?)
        ORDER BY lp.payment_date DESC
    """, (collector_name,))
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return rows
