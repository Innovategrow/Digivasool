from __future__ import annotations

"""
Live backup of the database into one Google Sheet.

After any loan or payment change the sheet is rewritten from the database (a
short debounce batches rapid changes), so it always mirrors the DB and can be
used as an emergency copy. Each book (Finance, Fund, ...) gets its own
"<Book> Borrowers" and "<Book> Payments" tabs.

Setup (one time):
  1. Google Cloud console -> create a service account, download its JSON key.
  2. Enable the Google Sheets API and Google Drive API for the project.
  3. Create a Google Sheet and share it (Editor) with the service account's email.
  4. Set GOOGLE_SHEET_ID (the long id in the sheet URL) and
     GOOGLE_SHEETS_CREDENTIALS (path to the JSON key, or the JSON itself).
If either variable is missing the backup is simply off.
"""

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List

DEBOUNCE_SECONDS = 8
_MAX_CELL = 1000  # Sheets caps cells at 50k chars; long values are photos/signatures, not data

_BORROWER_COLUMNS = [
    "id", "account_number", "customer_name", "customer_phone", "alternate_phone", "customer_email",
    "shop_name", "zone", "customer_address", "aadhaar_number",
    "guarantor_name", "guarantor_phone", "guarantor_address",
    "loan_amount", "monthly_interest_amount", "field_visit_charge", "document_fee", "processing_fee",
    "due_amount", "pending_amount", "repayment_frequency", "repayment_amount",
    "start_date", "closing_date", "status", "terms_accepted", "terms_accepted_at", "signature_on_file", "is_deleted", "created_at",
]

_lock = threading.Lock()
_timer: threading.Timer | None = None
_last_status: Dict[str, Any] = {"last_sync": None, "error": None}


def is_enabled() -> bool:
    return bool(os.environ.get("GOOGLE_SHEET_ID") and os.environ.get("GOOGLE_SHEETS_CREDENTIALS"))


def _cell(v: Any) -> Any:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, (dict, list)):
        v = json.dumps(v, ensure_ascii=False, default=str)
    v = str(v)
    return "[file]" if v.startswith("data:") else v[:_MAX_CELL]


def _table(docs: List[Dict[str, Any]], preferred: List[str]) -> List[List[Any]]:
    extra = sorted({k for d in docs for k in d} - set(preferred) - {"photo_url", "signature_url", "reminder_schedule"})
    cols = preferred + [c for c in extra if c not in preferred]
    rows = [cols]
    for d in docs:
        row = dict(d)
        if "signature_url" in d:
            row["signature_on_file"] = bool(d.get("signature_url"))
        rows.append([_cell(row.get(c)) for c in cols])
    return rows


def _client():
    import gspread

    raw = os.environ["GOOGLE_SHEETS_CREDENTIALS"].strip()
    info = json.loads(raw) if raw.startswith("{") else json.load(open(raw))
    return gspread.service_account_from_dict(info)


def _write(sh, title: str, rows: List[List[Any]]) -> None:
    import gspread

    try:
        ws = sh.worksheet(title)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=title, rows=max(len(rows) + 50, 100), cols=max(len(rows[0]) + 2, 10))
    ws.clear()
    ws.resize(rows=max(len(rows) + 50, 100), cols=max(len(rows[0]) + 2, 10))
    ws.update(range_name="A1", values=rows)
    ws.freeze(rows=1)


def sync_now() -> Dict[str, Any]:
    """Rewrite every book's tabs from the database. Safe to call from any thread."""
    from db import get_firestore_client, list_books

    with _lock:
        try:
            sh = _client().open_by_key(os.environ["GOOGLE_SHEET_ID"])
            counts = {}
            for book in list_books():
                db = get_firestore_client(book["id"])
                loans = [d.to_dict() for d in db.collection("loans").get()]
                pays = [d.to_dict() for d in db.collection("loan_payments").get()]
                name = book["name"]
                _write(sh, f"{name} Borrowers", _table(loans, _BORROWER_COLUMNS))
                _write(sh, f"{name} Payments", _table(pays, ["id", "loan_id", "amount", "payment_date", "created_at"]))
                counts[name] = {"borrowers": len(loans), "payments": len(pays)}
            _last_status.update(last_sync=datetime.now(timezone.utc).isoformat(), error=None)
            return {"ok": True, "counts": counts, **_last_status}
        except Exception as e:  # never let a backup problem touch the app
            _last_status["error"] = str(e)[:300]
            print("Google Sheets backup failed:", e)
            return {"ok": False, **_last_status}


def request_sync() -> None:
    """Schedule a sync shortly from now; repeated calls within the window collapse into one."""
    global _timer
    if not is_enabled():
        return
    if _timer:
        _timer.cancel()
    _timer = threading.Timer(DEBOUNCE_SECONDS, sync_now)
    _timer.daemon = True
    _timer.start()


def status() -> Dict[str, Any]:
    return {"enabled": is_enabled(), **_last_status}
