import os
import re
import shutil
import urllib.parse
from typing import Any, Dict, List, Optional
from datetime import datetime
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

from auth import decode_token, issue_token
from db import (
    db_lock,
    init_db,
    append_transaction_db,
    append_reminders_db,
    get_admin_lendings_db,
    get_backend_name,
    get_dashboard_summary_db,
    get_firestore_client,
    get_idempotent_response,
    get_loan_payments_db,
    get_collector_payments_db,
    is_admin_phone_allowed_db,
    get_admin_display_name_db,
    create_admin_access_request_db,
    get_pending_admin_access_requests_db,
    normalize_phone,
    resolve_admin_access_request_db,
    save_idempotent_response,
)
from schemas import (
    AdminLendingRecord,
    CapitalCreate,
    DashboardSummaryResponse,
    ExpenseCreate,
    StaffCreate,
    TransactionCreate,
    TransactionResponse,
    VoiceToLedgerResponse,
    LoanCreate,
    LoanCreateResponse,
    LoanPaymentCreate,
    LoanPaymentRecord,
    LoanPaymentWithBorrower,
    LoanStatsResponse,
    LoanRecord,
    LoanUpdate,
    OTPRequest,
    OTPVerify,
    PaymentResponse,
    WhatsAppLinks,
    SMSLinks,
    BorrowerOTPRequest,
    BorrowerOTPVerify,
    LoanMergeRequest,
)
from services.reminders import (
    WHATSAPP_REMINDER_DAY_OFFSETS,
    build_whatsapp_reminder_schedule,
    queue_whatsapp_reminders,
)
from services.sms import build_disbursement_sms, queue_disbursement_sms, send_otp_sms
import otp_store
from config_admins import ADMIN_USERS, COLLECTOR_USERS

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def _env_flag(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


# When true, OTPs are returned in the API response (for local testing only).
OTP_DEV_MODE = _env_flag("OTP_DEV_MODE", False)

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "uploads")
if not os.path.isabs(UPLOAD_DIR):
    UPLOAD_DIR = os.path.join(BACKEND_DIR, UPLOAD_DIR)
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

# --- APP INIT ---
app = FastAPI(title="DigiVasool API", description="3-Role Money Lending Tracker")

_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def on_startup():
    init_db()
    print(f"DigiVasool API ready — storage={get_backend_name()} otp_dev_mode={OTP_DEV_MODE}")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return validation errors as one readable sentence so the mobile UI can show it directly."""
    messages = []
    for err in exc.errors():
        msg = str(err.get("msg", "Invalid value")).removeprefix("Value error, ")
        field = err.get("loc", [])[-1] if err.get("loc") else ""
        if msg.startswith("Field required") and field:
            msg = f"{str(field).replace('_', ' ').capitalize()} is required"
        messages.append(msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(dict.fromkeys(messages)) or "Invalid request"})


def _now() -> str:
    return datetime.utcnow().isoformat()


# ==============================
# AUTH
# ==============================

def get_current_user(authorization: Optional[str] = Header(default=None)):
    """Identify the caller from the signed session token issued at OTP login."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    data = decode_token(authorization.split(" ", 1)[1].strip())
    if not data:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    return {
        "merchant_id": "00000000-0000-0000-0000-000000000000",
        "role": data.get("role", ""),
        "name": data.get("name", ""),
        "phone": data.get("phone", ""),
    }


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_role(*allowed_roles: str):
    """Allow only specified roles."""
    allowed = {r.lower() for r in allowed_roles}

    def _dep(user=Depends(get_current_user)):
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Access denied for this role")
        return user

    return _dep


def _write_audit(actor: str, action: str, detail: str = ""):
    db = get_firestore_client()
    db.collection("audit_log").add({
        "actor": actor or "system",
        "action": action,
        "detail": detail,
        "created_at": _now(),
    })


def _build_whatsapp_url(phone: str, message: str) -> str:
    """Build a wa.me deep-link with a pre-filled message."""
    clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
    return f"https://wa.me/{clean_phone}?text={urllib.parse.quote(message)}"


def _build_sms_url(phone: str, message: str) -> str:
    """Build an sms: deep-link that opens the phone's messaging app with the text pre-filled."""
    return f"sms:{phone}?body={urllib.parse.quote(message)}"


def _generate_unique_account_number(db) -> str:
    """3-digit unique borrower account number, checked against existing loans."""
    import random

    existing = {doc.to_dict().get("account_number") for doc in db.collection("loans").get()}
    candidates = [f"{n:03d}" for n in range(1000) if f"{n:03d}" not in existing]
    if not candidates:
        raise HTTPException(status_code=400, detail="All 3-digit account numbers are in use")
    return random.choice(candidates)


def _staff_members(role: Optional[str] = None) -> List[Dict[str, Any]]:
    rows = []
    for doc in get_firestore_client().collection("staff").get():
        s = doc.to_dict()
        s.setdefault("id", doc.id)
        if s.get("is_active", True) and (role is None or s.get("role") == role):
            rows.append(s)
    return rows


def _merge_people(configured: List[Dict[str, Any]], stored: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    people, seen = [], set()
    for p in list(configured) + list(stored):
        key = normalize_phone(p.get("phone", "")) or p.get("name", "").lower()
        if key in seen:
            continue
        seen.add(key)
        people.append({"name": p["name"], "phone": p.get("phone", ""), "email": p.get("email", "")})
    return people


def _all_admins() -> List[Dict[str, Any]]:
    return _merge_people(ADMIN_USERS, _staff_members("admin"))


def _all_collectors() -> List[Dict[str, Any]]:
    return _merge_people(COLLECTOR_USERS, _staff_members("collector"))


def _is_archived(loan: Dict[str, Any]) -> bool:
    return bool(loan.get("is_deleted")) or loan.get("status") in {"deleted", "merged"}


def _borrower_loans_for_phone(phone: str) -> List[Dict[str, Any]]:
    target = normalize_phone(phone)
    if not target:
        return []
    matches = []
    for doc in get_firestore_client().collection("loans").get():
        l = doc.to_dict()
        l.setdefault("id", doc.id)
        if _is_archived(l):
            continue
        if target in {normalize_phone(l.get("customer_phone", "")), normalize_phone(l.get("alternate_phone", ""))}:
            matches.append(l)
    return matches


def _assert_borrower_owns_loan(user: Dict[str, Any], loan_id: str):
    if user["role"] == "borrower" and loan_id not in {l["id"] for l in _borrower_loans_for_phone(user["phone"])}:
        raise HTTPException(status_code=403, detail="You can only view your own loan")


def _otp_key(role: str, contact: str) -> str:
    return f"{role}:{normalize_phone(contact) or contact.strip().lower()}"


def _otp_response(otp: str, contact: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    send_otp_sms(contact, otp)
    body = {"status": "otp_sent", "message": "OTP sent", "dev_mode": OTP_DEV_MODE}
    if OTP_DEV_MODE:
        body["dev_otp"] = otp
    if extra:
        body.update(extra)
    return body


def _find_collector(contact: str) -> Optional[Dict[str, Any]]:
    target = normalize_phone(contact)
    if not target:
        return None
    return next((c for c in _all_collectors() if normalize_phone(c.get("phone", "")) == target), None)


# ==============================
# OTP AUTH ROUTES
# ==============================

@app.post("/api/auth/request-otp")
async def request_otp(body: OTPRequest):
    """Step 1 of login: generate OTP (returned in the response only when OTP_DEV_MODE is on)."""
    contact = body.contact.strip()
    admins = _all_admins()

    if body.role == "admin":
        if not is_admin_phone_allowed_db(contact, admins):
            if not body.admin_name or not body.admin_name.strip():
                raise HTTPException(status_code=400, detail="Please enter your name so an admin can review your request.")
            create_admin_access_request_db(body.admin_name.strip(), contact)
            _write_audit(body.admin_name.strip(), "ADMIN_ACCESS_REQUESTED", f"Access requested from {contact}")
            return {"status": "pending_approval", "message": "Your request has been sent to the admin for approval. You'll be notified once approved."}

    elif body.role == "collector":
        collector = _find_collector(contact)
        if not collector:
            raise HTTPException(status_code=404, detail="Collector not found. Check your phone number.")
        if body.collector_name and body.collector_name.strip().lower() != collector["name"].lower():
            raise HTTPException(status_code=400, detail="This phone number is not registered to the selected collector.")

    elif body.role == "borrower":
        if not _borrower_loans_for_phone(contact):
            raise HTTPException(status_code=404, detail="No loan account found for this mobile number.")

    otp = otp_store.generate_and_store(_otp_key(body.role, contact))
    return _otp_response(otp, contact)


@app.post("/api/auth/verify-otp")
async def verify_otp(body: OTPVerify):
    """Step 2 of login: verify OTP and return a signed session token."""
    contact = body.contact.strip()
    if not otp_store.verify(_otp_key(body.role, contact), body.otp):
        raise HTTPException(status_code=401, detail="Wrong or expired OTP. Please try again.")

    if body.role == "admin":
        admins = _all_admins()
        if not is_admin_phone_allowed_db(contact, admins):
            raise HTTPException(status_code=403, detail="This number is not yet approved for admin access.")
        name = get_admin_display_name_db(contact, admins) or (body.admin_name or "Admin").strip()
        _write_audit(name, "LOGIN", f"Admin logged in via {contact}")
        return {"role": "admin", "name": name, "phone": contact, "token": issue_token("admin", name, contact)}

    if body.role == "borrower":
        loans = _borrower_loans_for_phone(contact)
        if not loans:
            raise HTTPException(status_code=404, detail="No loan account found for this mobile number.")
        name = loans[0]["customer_name"]
        _write_audit(name, "LOGIN", f"Borrower logged in via {contact}")
        return {"role": "borrower", "name": name, "phone": contact, "token": issue_token("borrower", name, contact)}

    collector = _find_collector(contact)
    if not collector:
        raise HTTPException(status_code=404, detail="Collector not found")
    _write_audit(collector["name"], "LOGIN", f"Collector logged in via {contact}")
    return {
        "role": "collector",
        "name": collector["name"],
        "phone": collector["phone"],
        "token": issue_token("collector", collector["name"], collector["phone"]),
    }


@app.post("/api/auth/borrower/send-otp")
async def borrower_send_otp(body: BorrowerOTPRequest, user=Depends(require_admin)):
    """Send OTP to a borrower's phone for verification during registration."""
    phone = body.phone.strip()
    otp = otp_store.generate_and_store(_otp_key("verify", phone))
    return _otp_response(otp, phone)


@app.post("/api/auth/borrower/verify-otp")
async def borrower_verify_otp(body: BorrowerOTPVerify, user=Depends(require_admin)):
    """Verify OTP for borrower phone verification."""
    phone = body.phone.strip()
    if not otp_store.verify(_otp_key("verify", phone), body.otp):
        raise HTTPException(status_code=401, detail="Wrong or expired OTP")
    return {"verified": True, "phone": phone}


# ==============================
# FILE UPLOADS
# ==============================

ALLOWED_PROOF_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"}


def _save_upload(file: UploadFile, folder: str) -> str:
    """Store an upload under UPLOAD_DIR/folder with a safe, unique file name. Returns the public URL."""
    original = os.path.basename(file.filename or "file")
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", original)[-80:] or "file"
    filename = f"{uuid4().hex[:8]}_{safe}"
    target_dir = os.path.join(UPLOAD_DIR, folder)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    if os.path.getsize(path) > MAX_UPLOAD_BYTES:
        os.remove(path)
        raise HTTPException(status_code=400, detail="File is too large (maximum 10 MB)")
    return f"/uploads/{folder}/{filename}"


@app.post("/api/loans/upload-proof")
async def upload_proof(loan_id: str, file: UploadFile = File(...), user=Depends(require_role("admin", "collector"))):
    """Upload a proof document for a loan/user."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", loan_id or ""):
        raise HTTPException(status_code=400, detail="Invalid loan id")
    url = _save_upload(file, loan_id)
    _write_audit(user["name"], "UPLOAD_PROOF", f"Document uploaded for loan {loan_id}: {os.path.basename(url)}")
    return {"status": "success", "file_path": url}


@app.post("/api/payments/{payment_id}/proof")
async def upload_payment_proof(payment_id: str, file: UploadFile = File(...), user=Depends(require_role("admin", "collector"))):
    """Attach a proof image/PDF (e.g. a GPay screenshot the borrower shared) to a specific payment."""
    db = get_firestore_client()
    payment_ref = db.collection("loan_payments").document(payment_id)
    payment_doc = payment_ref.get()
    if not payment_doc.exists:
        raise HTTPException(status_code=404, detail="Payment not found")
    payment = payment_doc.to_dict()
    if user["role"] == "collector" and payment.get("collector_name") != user["name"]:
        raise HTTPException(status_code=403, detail="You can only attach proof to your own collections")
    if file.content_type not in ALLOWED_PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Only image or PDF files are allowed")

    proof_url = _save_upload(file, f"payments/{payment_id}")
    payment_ref.update({
        "proof_url": proof_url,
        "proof_filename": os.path.basename(file.filename or "proof"),
        "proof_uploaded_at": _now(),
        "proof_uploaded_by": user["name"],
    })
    _write_audit(user["name"], "PAYMENT_PROOF_UPLOADED", f"Proof uploaded for payment {payment_id}")
    return {"status": "success", "data": payment_ref.get().to_dict()}


# ==============================
# ADMIN ACCESS REQUESTS
# ==============================

@app.get("/api/admin/access-requests")
async def list_admin_access_requests(user=Depends(require_admin)):
    """Pending admin-login requests from unrecognized phone numbers, awaiting approval."""
    return get_pending_admin_access_requests_db()


@app.post("/api/admin/access-requests/{request_id}/approve")
async def approve_admin_access_request(request_id: str, user=Depends(require_admin)):
    record = resolve_admin_access_request_db(request_id, approve=True, resolved_by=user["name"])
    if not record:
        raise HTTPException(status_code=404, detail="Request not found")
    _write_audit(user["name"], "ADMIN_ACCESS_APPROVED", f"Approved admin access for {record['name']} ({record['phone']})")
    return {"status": "success", "data": record}


@app.post("/api/admin/access-requests/{request_id}/deny")
async def deny_admin_access_request(request_id: str, user=Depends(require_admin)):
    record = resolve_admin_access_request_db(request_id, approve=False, resolved_by=user["name"])
    if not record:
        raise HTTPException(status_code=404, detail="Request not found")
    _write_audit(user["name"], "ADMIN_ACCESS_DENIED", f"Denied admin access for {record['name']} ({record['phone']})")
    return {"status": "success", "data": record}


# ==============================
# CORE LEDGER ROUTES
# ==============================

@app.post("/api/transactions/", response_model=TransactionResponse)
async def create_transaction(
    tx: TransactionCreate,
    background_tasks: BackgroundTasks,
    user=Depends(require_admin)
):
    """Record an Udhaar or Pagar entry and schedule WhatsApp reminders."""
    created_at = datetime.utcnow()
    transaction_id = str(uuid4())
    transaction_record = {
        "id": transaction_id,
        "customer_id": tx.customer_id,
        "customer_name": tx.customer_name or "Unknown customer",
        "customer_phone": tx.customer_phone,
        "type": tx.type,
        "amount": tx.amount,
        "outstanding_amount": tx.amount if tx.type == "GAVE" else 0.0,
        "interest_rate_monthly": tx.interest_rate_monthly if tx.type == "GAVE" else None,
        "due_date": tx.due_date,
        "notes": tx.notes,
        "created_at": created_at.isoformat(),
        "created_by": user["name"],
        "shopkeeper_id": user["merchant_id"],
    }

    reminders = (
        build_whatsapp_reminder_schedule(
            transaction_id=transaction_id,
            customer_id=tx.customer_id,
            due_date=tx.due_date,
            created_at=created_at,
        )
        if tx.type == "GAVE"
        else []
    )

    append_transaction_db(transaction_record)
    append_reminders_db(reminders)

    if reminders:
        background_tasks.add_task(queue_whatsapp_reminders, reminders)

    return TransactionResponse(status="success", data=transaction_record, reminders=reminders)


@app.get("/api/dashboard/", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(user=Depends(require_role("admin", "collector"))):
    """Return overview summary including today's collections and by-collector breakdown."""
    return DashboardSummaryResponse(**get_dashboard_summary_db())


@app.get("/api/admin/lendings/", response_model=List[AdminLendingRecord])
async def get_admin_lending_view(admin_user=Depends(require_admin)):
    """Admin-only lending view with interest rate and reminder schedules."""
    return [AdminLendingRecord(**row) for row in get_admin_lendings_db()]


@app.get("/api/collectors/")
async def get_collectors():
    """Registered collector names (public, used for the login dropdown — phone numbers are not exposed)."""
    return [{"name": c["name"]} for c in _all_collectors()]


@app.get("/api/admin/audit-log")
async def get_audit_log(limit: int = 30, user=Depends(require_admin)):
    """Most recent audit entries (who did what, when)."""
    rows = [d.to_dict() for d in get_firestore_client().collection("audit_log").get()]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows[: max(1, min(limit, 200))]


# ==============================
# STAFF, EXPENSES & CAPITAL
# ==============================

@app.get("/api/staff/")
async def list_staff(user=Depends(require_admin)):
    """Admins and collectors from configuration plus staff added in the app."""
    configured = (
        [{"id": f"cfg-admin-{i}", "name": a["name"], "role": "admin", "phone": a.get("phone", ""), "email": a.get("email", ""), "target": 0, "source": "config"}
         for i, a in enumerate(ADMIN_USERS)]
        + [{"id": f"cfg-collector-{i}", "name": c["name"], "role": "collector", "phone": c.get("phone", ""), "email": "", "target": 0, "source": "config"}
           for i, c in enumerate(COLLECTOR_USERS)]
    )
    stored = [{**s, "source": "app"} for s in _staff_members()]
    return configured + sorted(stored, key=lambda s: s.get("created_at", ""))


@app.post("/api/staff/")
async def create_staff(body: StaffCreate, user=Depends(require_admin)):
    target_phone = normalize_phone(body.phone or "")
    if target_phone and any(normalize_phone(p.get("phone", "")) == target_phone for p in _all_admins() + _all_collectors()):
        raise HTTPException(status_code=400, detail="A staff member with this phone number already exists")
    record = {
        "id": str(uuid4()),
        "name": body.name.strip(),
        "role": body.role,
        "phone": body.phone or "",
        "email": (body.email or "").strip(),
        "target": body.target,
        "is_active": True,
        "created_at": _now(),
        "created_by": user["name"],
    }
    get_firestore_client().collection("staff").document(record["id"]).set(record)
    _write_audit(user["name"], "STAFF_ADDED", f"Added {body.role} {record['name']}")
    return {**record, "source": "app"}


def _list_collection(name: str, sort_field: str) -> List[Dict[str, Any]]:
    rows = []
    for doc in get_firestore_client().collection(name).get():
        r = doc.to_dict()
        r.setdefault("id", doc.id)
        rows.append(r)
    return sorted(rows, key=lambda r: (r.get(sort_field) or "", r.get("created_at") or ""), reverse=True)


@app.get("/api/expenses/")
async def list_expenses(user=Depends(require_admin)):
    return _list_collection("expenses", "date")


@app.post("/api/expenses/")
async def create_expense(body: ExpenseCreate, user=Depends(require_admin)):
    record = {"id": str(uuid4()), **body.model_dump(), "created_at": _now(), "created_by": user["name"]}
    get_firestore_client().collection("expenses").document(record["id"]).set(record)
    _write_audit(user["name"], "EXPENSE_ADDED", f"₹{body.amount} {body.category}")
    return record


@app.get("/api/capital/")
async def list_capital(user=Depends(require_admin)):
    return _list_collection("capital", "date")


@app.post("/api/capital/")
async def create_capital(body: CapitalCreate, user=Depends(require_admin)):
    record = {"id": str(uuid4()), **body.model_dump(), "created_at": _now(), "created_by": user["name"]}
    get_firestore_client().collection("capital").document(record["id"]).set(record)
    _write_audit(user["name"], "CAPITAL_ADDED", f"₹{body.amount}")
    return record


# ==============================
# LOANS & COLLECTIONS ROUTES
# ==============================

def _loan_out(l: Dict[str, Any], doc_id: str, reminders: Optional[List[Dict[str, Any]]] = None) -> LoanRecord:
    """Fill defaults for older records and convert to the API model."""
    l.setdefault("id", doc_id)
    l.setdefault("repayment_frequency", "monthly")
    l.setdefault("repayment_amount", 0.0)
    l.setdefault("total_days_paid", 0)
    l.setdefault("total_days_not_paid", 0)
    for key in ("alternate_phone", "shop_name", "zone", "aadhaar_number", "photo_url",
                "guarantor_name", "guarantor_phone", "guarantor_address"):
        l.setdefault(key, "")
    if "monthly_interest_amount" not in l:
        l["monthly_interest_amount"] = l.pop("interest_document", 0.0)
    l.setdefault("field_visit_charge", 0.0)
    l.setdefault("document_fee", 0.0)
    l.setdefault("processing_fee", 0.0)
    l.setdefault("preferred_language", "en")
    l.setdefault("created_at", "")
    l["reminder_schedule"] = reminders or []
    return LoanRecord(**l)


def _reminders_by_loan() -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for doc in get_firestore_client().collection("reminders").get():
        r = doc.to_dict()
        grouped.setdefault(r.get("transaction_id"), []).append(r)
    return grouped


def _get_loan_or_404(loan_id: str):
    ref = get_firestore_client().collection("loans").document(loan_id)
    doc = ref.get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Loan not found")
    return ref, doc.to_dict()


@app.post("/api/loans/", response_model=LoanCreateResponse)
async def create_loan(
    loan: LoanCreate,
    background_tasks: BackgroundTasks,
    user=Depends(require_admin),
    idempotency_key: Optional[str] = Header(default=None),
):
    if not loan.customer_id:
        raise HTTPException(status_code=400, detail="Customer ID is required")
    if loan.loan_amount <= 0:
        raise HTTPException(status_code=400, detail="Loan amount must be greater than 0")
    if not loan.start_date:
        raise HTTPException(status_code=400, detail="Start date is required")
    if not loan.closing_date:
        raise HTTPException(status_code=400, detail="Closing date is required")
    if loan.closing_date < loan.start_date:
        raise HTTPException(status_code=400, detail="Due date cannot be before the start date")

    with db_lock:
        if idempotency_key:
            cached = get_idempotent_response("loan", idempotency_key)
            if cached:
                return cached
        try:
            db = get_firestore_client()
            loan_id = str(uuid4())
            create_time = datetime.utcnow()
            created_at = create_time.isoformat()

            # Field verification/document/processing are a breakdown of the single
            # Charges amount. Charges are deducted upfront once, so the repayable due
            # remains the principal amount: principal + charges - upfront charges.
            total_charges = loan.monthly_interest_amount
            due_amount = loan.loan_amount
            cash_disbursed = max(0.0, loan.loan_amount - total_charges)

            account_number = _generate_unique_account_number(db)

            record = {
                "id": loan_id,
                "customer_id": loan.customer_id,
                "customer_name": loan.customer_name,
                "customer_email": loan.customer_email,
                "customer_phone": loan.customer_phone,
                "customer_address": loan.customer_address,
                "alternate_phone": loan.alternate_phone or "",
                "shop_name": loan.shop_name or "",
                "aadhaar_number": loan.aadhaar_number or "",
                "photo_url": loan.photo_url or "",
                "zone": loan.zone or "",
                "guarantor_name": loan.guarantor_name or "",
                "guarantor_phone": loan.guarantor_phone or "",
                "guarantor_address": loan.guarantor_address or "",
                "account_number": account_number,
                "preferred_language": loan.preferred_language,
                "loan_amount": loan.loan_amount,
                "monthly_interest_amount": loan.monthly_interest_amount,
                "field_visit_charge": loan.field_visit_charge,
                "document_fee": loan.document_fee,
                "processing_fee": loan.processing_fee,
                "due_amount": due_amount,
                "collected_amount": 0.0,
                "pending_amount": due_amount,
                "status": "active",
                "is_deleted": False,
                "total_days_paid": 0,
                "total_days_not_paid": 0,
                "repayment_frequency": loan.repayment_frequency,
                "repayment_amount": loan.repayment_amount or 0.0,
                "start_date": loan.start_date,
                "closing_date": loan.closing_date,
                "created_at": created_at,
                "created_by": user["name"],
                "updated_at": created_at,
                "updated_by": user["name"],
            }

            db.collection("loans").document(loan_id).set(record)

            _write_audit(user["name"], "LOAN_CREATED", f"Loan ₹{loan.loan_amount} created for {loan.customer_name}, freq={loan.repayment_frequency}, total_due=₹{due_amount}, account={account_number}")

            reminders = build_whatsapp_reminder_schedule(
                transaction_id=loan_id,
                customer_id=loan.customer_id,
                due_date=loan.closing_date,
                created_at=create_time,
            )
            append_reminders_db(reminders)
            if reminders:
                background_tasks.add_task(queue_whatsapp_reminders, reminders)

            # Post-disbursement SMS to the borrower, in their preferred Indian language
            sms_message = build_disbursement_sms(
                language=loan.preferred_language,
                name=loan.customer_name,
                account_number=account_number,
                loan_amount=loan.loan_amount,
                cash_disbursed=cash_disbursed,
                installment=loan.repayment_amount or 0.0,
                due_date=loan.closing_date,
            )
            sms_url = _build_sms_url(loan.customer_phone, sms_message) if loan.customer_phone else None
            if loan.customer_phone:
                background_tasks.add_task(queue_disbursement_sms, loan.customer_phone, sms_message)

            response = LoanCreateResponse(
                status="success",
                data=_loan_out(dict(record), loan_id, reminders),
                sms=SMSLinks(send_sms_url=sms_url, message_preview=sms_message, language=loan.preferred_language),
            ).model_dump()
            if idempotency_key:
                save_idempotent_response("loan", idempotency_key, response)
            return response
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error creating loan: {str(e)}")


@app.post("/api/loans/merge")
async def merge_loans(body: LoanMergeRequest, user=Depends(require_admin)):
    if body.primary_loan_id == body.secondary_loan_id:
        raise HTTPException(status_code=400, detail="Choose two different borrowers to merge")
    db = get_firestore_client()
    with db_lock:
        primary_ref = db.collection("loans").document(body.primary_loan_id)
        primary_doc = primary_ref.get()
        secondary_ref = db.collection("loans").document(body.secondary_loan_id)
        secondary_doc = secondary_ref.get()

        if not primary_doc.exists or not secondary_doc.exists:
            raise HTTPException(status_code=404, detail="One or both loans not found")

        p_data = primary_doc.to_dict()
        s_data = secondary_doc.to_dict()
        if _is_archived(p_data) or _is_archived(s_data):
            raise HTTPException(status_code=400, detail="Archived borrowers cannot be merged")

        for field in ("loan_amount", "monthly_interest_amount", "field_visit_charge", "document_fee",
                      "processing_fee", "due_amount", "collected_amount", "pending_amount"):
            p_data[field] = (p_data.get(field, 0.0) or 0.0) + (s_data.get(field, 0.0) or 0.0)
        p_data["updated_at"] = _now()
        p_data["updated_by"] = user["name"]
        primary_ref.set(p_data)

        # Reassign payments — history is kept and remembers where it came from
        for doc in db.collection("loan_payments").where("loan_id", "==", body.secondary_loan_id).get():
            doc.reference.update({"loan_id": body.primary_loan_id, "merged_from_loan_id": body.secondary_loan_id})

        # Archive (not erase) the secondary record
        secondary_ref.update({
            "status": "merged",
            "previous_status": s_data.get("status", "active"),
            "merged_into": body.primary_loan_id,
            "is_deleted": True,
            "deleted_at": _now(),
            "deleted_by": user["name"],
        })

    _write_audit(user["name"], "LOAN_MERGED", f"Merged loan {body.secondary_loan_id} into {body.primary_loan_id}")
    return {"status": "success", "message": "Loans merged successfully"}


@app.post("/api/loans/{loan_id}/close")
async def close_loan(loan_id: str, user=Depends(require_admin)):
    """Mark a fully paid loan as closed without deleting its history."""
    loan_ref, loan = _get_loan_or_404(loan_id)
    if _is_archived(loan):
        raise HTTPException(status_code=400, detail="Loan is archived")
    if float(loan.get("pending_amount", 0) or 0) > 0:
        raise HTTPException(status_code=400, detail="Loan still has a pending amount")

    changes = {"status": "closed", "pending_amount": 0, "updated_at": _now(), "updated_by": user["name"]}
    loan_ref.update(changes)
    _write_audit(user["name"], "LOAN_CLOSED", f"Marked loan {loan_id} closed for {loan.get('customer_name', 'unknown borrower')}")
    return {"status": "success", "data": {**loan, **changes}, "message": "Loan marked as closed"}


@app.patch("/api/loans/{loan_id}", response_model=LoanRecord)
async def update_loan(loan_id: str, updates: LoanUpdate, user=Depends(require_admin)):
    """Edit a borrower's profile details (name, phone, address, guarantor, etc.). Financial fields are not editable."""
    with db_lock:
        loan_ref, loan = _get_loan_or_404(loan_id)
        if _is_archived(loan):
            raise HTTPException(status_code=400, detail="Cannot edit a borrower in the recycle bin")

        update_data = updates.model_dump(exclude_unset=True)
        if "customer_name" in update_data and not update_data["customer_name"]:
            raise HTTPException(status_code=400, detail="Full name cannot be empty")
        if "customer_phone" in update_data and not update_data["customer_phone"]:
            raise HTTPException(status_code=400, detail="Primary mobile cannot be empty")
        update_data = {k: v for k, v in update_data.items() if v is not None}

        changed = [k for k, v in update_data.items() if loan.get(k) != v]
        if not changed:
            return _loan_out(loan, loan_id)

        update_data["updated_at"] = _now()
        update_data["updated_by"] = user["name"]
        loan_ref.update(update_data)

    _write_audit(
        user["name"],
        "BORROWER_UPDATED",
        f"Updated {', '.join(changed)} for {loan.get('customer_name', 'unknown borrower')} (loan {loan_id})",
    )
    return _loan_out({**loan, **update_data}, loan_id)


@app.delete("/api/loans/{loan_id}")
async def delete_loan(loan_id: str, user=Depends(require_admin)):
    """Archive a borrower (soft delete). Loans, payments, receipts and audit history are preserved."""
    with db_lock:
        loan_ref, loan = _get_loan_or_404(loan_id)
        if _is_archived(loan):
            raise HTTPException(status_code=400, detail="Borrower is already deleted")

        deleted_at = _now()
        loan_ref.update({
            "status": "deleted",
            "previous_status": loan.get("status", "active"),
            "is_deleted": True,
            "deleted_at": deleted_at,
            "deleted_by": user["name"],
        })

    pending = float(loan.get("pending_amount", 0) or 0)
    _write_audit(
        user["name"],
        "BORROWER_DELETED",
        f"Archived {loan.get('customer_name', 'unknown borrower')} (loan {loan_id}); outstanding ₹{pending:,.0f} preserved",
    )
    return {"status": "success", "message": "Borrower deleted. Financial history is preserved.", "deleted_at": deleted_at}


@app.get("/api/loans/deleted", response_model=List[LoanRecord])
async def get_deleted_loans(user=Depends(require_admin)):
    """List loans currently in the recycle bin."""
    loans = []
    for doc in get_firestore_client().collection("loans").get():
        l = doc.to_dict()
        if l.get("status") == "deleted":
            loans.append(_loan_out(l, doc.id))
    loans.sort(key=lambda l: l.deleted_at or "", reverse=True)
    return loans


@app.post("/api/loans/{loan_id}/restore", response_model=LoanRecord)
async def restore_loan(loan_id: str, user=Depends(require_admin)):
    """Restore a loan out of the recycle bin back to its previous status."""
    with db_lock:
        loan_ref, loan = _get_loan_or_404(loan_id)
        if loan.get("status") != "deleted":
            raise HTTPException(status_code=400, detail="Loan is not in the recycle bin")

        loan_ref.update({
            "status": loan.get("previous_status") or "active",
            "previous_status": None,
            "is_deleted": False,
            "deleted_at": None,
            "deleted_by": None,
            "restored_at": _now(),
            "restored_by": user["name"],
        })
        updated = loan_ref.get().to_dict()

    _write_audit(user["name"], "LOAN_RESTORED", f"Restored loan {loan_id} for {loan.get('customer_name', 'unknown borrower')}")
    return _loan_out(updated, loan_id)


@app.delete("/api/loans/{loan_id}/permanent")
async def permanently_delete_loan(loan_id: str, user=Depends(require_admin)):
    """Erase a recycle-bin record that has no financial history (e.g. created by mistake).
    Records with payments are kept forever so money history can never be destroyed."""
    db = get_firestore_client()
    with db_lock:
        loan_ref, loan = _get_loan_or_404(loan_id)
        if loan.get("status") != "deleted":
            raise HTTPException(status_code=400, detail="Only loans in the recycle bin can be permanently deleted")

        if db.collection("loan_payments").where("loan_id", "==", loan_id).limit(1).get():
            raise HTTPException(
                status_code=409,
                detail="This borrower has payment history, so it cannot be erased. It stays safely archived in the Recycle Bin.",
            )

        for r in db.collection("reminders").where("transaction_id", "==", loan_id).get():
            r.reference.delete()
        loan_ref.delete()

    _write_audit(user["name"], "LOAN_PERMANENTLY_DELETED", f"Permanently deleted loan {loan_id} (no payments) for {loan.get('customer_name', 'unknown borrower')}")
    return {"status": "success", "message": "Loan permanently deleted"}


@app.get("/api/loans/", response_model=List[LoanRecord])
async def get_loans(user=Depends(require_role("admin", "collector"))):
    db = get_firestore_client()
    reminders = _reminders_by_loan()
    loans = []
    for doc in db.collection("loans").get():
        l = doc.to_dict()
        if _is_archived(l):
            continue
        if not l.get("account_number"):
            with db_lock:
                l["account_number"] = _generate_unique_account_number(db)
                doc.reference.update({"account_number": l["account_number"]})
        loans.append(_loan_out(l, doc.id, reminders.get(l.get("id", doc.id))))
    return loans


@app.post("/api/loans/{loan_id}/payments", response_model=PaymentResponse)
async def record_payment(
    loan_id: str,
    payment: LoanPaymentCreate,
    user=Depends(require_role("admin", "collector")),
    idempotency_key: Optional[str] = Header(default=None),
):
    db = get_firestore_client()

    with db_lock:
        # A repeated tap / network retry with the same key returns the original result
        if idempotency_key:
            cached = get_idempotent_response(f"payment:{loan_id}", idempotency_key)
            if cached:
                return cached

        loan_ref, loan = _get_loan_or_404(loan_id)
        if _is_archived(loan):
            raise HTTPException(status_code=400, detail="This borrower has been deleted. Payments cannot be recorded.")

        payment_date = payment.payment_date or _now()
        # Collectors always record under their own identity
        collector_name = user["name"] if user["role"] == "collector" else (payment.collector_name or user["name"])
        collector_phone = user["phone"] if user["role"] == "collector" else payment.collector_phone

        payment_id = str(uuid4())
        payment_record = {
            "id": payment_id,
            "loan_id": loan_id,
            "amount": payment.amount,
            "payment_method": payment.payment_method,
            "payment_date": payment_date,
            "collector_name": collector_name,
            "collector_phone": collector_phone,
            "notes": payment.notes,
            "created_at": _now(),
            "created_by": user["name"],
        }
        db.collection("loan_payments").document(payment_id).set(payment_record)

        # Update loan totals
        is_paid_day = payment.amount > 0
        new_collected = (loan.get("collected_amount", 0) or 0) + payment.amount
        new_pending = (loan.get("due_amount", 0) or 0) - new_collected
        new_days_paid = (loan.get("total_days_paid", 0) or 0) + (1 if is_paid_day else 0)
        new_days_not_paid = (loan.get("total_days_not_paid", 0) or 0) + (0 if is_paid_day else 1)
        new_not_paid_amount = new_days_not_paid * (loan.get("repayment_amount", 0) or 0)
        new_status = "closed" if new_pending <= 0 else loan.get("status", "active")

        loan_ref.update({
            "collected_amount": new_collected,
            "pending_amount": new_pending,
            "total_days_paid": new_days_paid,
            "total_days_not_paid": new_days_not_paid,
            "status": new_status,
            "updated_at": _now(),
            "updated_by": user["name"],
        })

        updated_loan = loan_ref.get().to_dict()
        updated_loan.setdefault("repayment_frequency", "monthly")
        updated_loan.setdefault("repayment_amount", 0.0)

        _write_audit(
            user["name"],
            "PAYMENT_RECORDED",
            f"₹{payment.amount} collected from {loan['customer_name']} by {collector_name}",
        )

        # Build WhatsApp deep-link messages
        date_str = datetime.utcnow().strftime("%d %b %Y, %I:%M %p")
        collector_tag = collector_name or "Collector"

        if is_paid_day:
            admin_msg = (
                f"✅ *Payment Received*\n"
                f"👤 Borrower: {loan['customer_name']}\n"
                f"💰 Amount: ₹{payment.amount:,.0f}\n"
                f"💳 Method: {payment.payment_method}\n"
                f"👷 Collected by: {collector_tag}\n"
                f"🗒 Notes: {payment.notes or 'None'}\n"
                f"📅 Date: {date_str}\n"
                f"📊 Total Paid Days: {new_days_paid}\n"
                f"❌ Not Paid Days: {new_days_not_paid}\n"
                f"🟠 Not Paid Amount: ₹{new_not_paid_amount:,.0f}\n"
                f"💵 Total Paid Amount: ₹{new_collected:,.0f}\n"
                f"🔴 Remaining Amount: ₹{max(new_pending, 0):,.0f}"
            )
            borrower_msg = (
                f"✅ *Payment Confirmation*\n"
                f"Hello {loan['customer_name']},\n"
                f"Your payment of ₹{payment.amount:,.0f} ({payment.payment_method}) has been received.\n"
                f"📅 Date: {date_str}\n"
                f"📊 Total Paid Days: {new_days_paid}\n"
                f"❌ Not Paid Days: {new_days_not_paid}\n"
                f"🟠 Not Paid Amount: ₹{new_not_paid_amount:,.0f}\n"
                f"💵 Total Paid Amount: ₹{new_collected:,.0f}\n"
                f"💰 Remaining Amount: ₹{max(new_pending, 0):,.0f}\n"
                f"Thank you! — DigiVasool"
            )
        else:
            admin_msg = (
                f"⚠️ *Not Paid Today*\n"
                f"👤 Borrower: {loan['customer_name']}\n"
                f"👷 Visited by: {collector_tag}\n"
                f"🗒 Notes: {payment.notes or 'None'}\n"
                f"📅 Date: {date_str}\n"
                f"📊 Total Paid Days: {new_days_paid}\n"
                f"❌ Not Paid Days: {new_days_not_paid}\n"
                f"🟠 Not Paid Amount: ₹{new_not_paid_amount:,.0f}\n"
                f"💵 Total Paid Amount: ₹{new_collected:,.0f}\n"
                f"🔴 Remaining Amount: ₹{max(new_pending, 0):,.0f}"
            )
            borrower_msg = (
                f"⚠️ *Payment Reminder*\n"
                f"Hello {loan['customer_name']},\n"
                f"We noted no payment was collected from you today.\n"
                f"📅 Date: {date_str}\n"
                f"📊 Total Paid Days: {new_days_paid}\n"
                f"❌ Not Paid Days: {new_days_not_paid}\n"
                f"🟠 Not Paid Amount: ₹{new_not_paid_amount:,.0f}\n"
                f"💵 Total Paid Amount: ₹{new_collected:,.0f}\n"
                f"💰 Remaining Amount: ₹{max(new_pending, 0):,.0f}\n"
                f"Thank you! — DigiVasool"
            )

        borrower_phone = loan.get("customer_phone") or ""
        borrower_url = _build_whatsapp_url(borrower_phone, borrower_msg) if borrower_phone else None

        admin_urls = [
            {"name": a["name"], "phone": a["phone"], "url": _build_whatsapp_url(a["phone"], admin_msg)}
            for a in _all_admins() if a.get("phone")
        ]

        response = PaymentResponse(
            status="success",
            data=updated_loan,
            whatsapp=WhatsAppLinks(
                notify_admin_urls=admin_urls,
                notify_borrower_url=borrower_url,
                message_preview=admin_msg,
            ),
            payment=LoanPaymentRecord(**payment_record),
        ).model_dump()
        if idempotency_key:
            save_idempotent_response(f"payment:{loan_id}", idempotency_key, response)
        return response


@app.get("/api/loans/{loan_id}/payments", response_model=List[LoanPaymentRecord])
async def get_loan_payment_history(loan_id: str, user=Depends(require_role("admin", "collector", "borrower"))):
    """Return full payment history for a loan."""
    _assert_borrower_owns_loan(user, loan_id)
    return [LoanPaymentRecord(**p) for p in get_loan_payments_db(loan_id)]


@app.get("/api/loans/by-customer", response_model=List[LoanRecord])
async def get_loans_by_customer(name: Optional[str] = None, user=Depends(require_role("admin", "borrower"))):
    """Admins look up loans by customer name; borrowers always get their own loans (matched by phone)."""
    reminders = _reminders_by_loan()
    if user["role"] == "borrower":
        loans = _borrower_loans_for_phone(user["phone"])
    else:
        target = (name or "").strip()
        loans = []
        for doc in get_firestore_client().collection("loans").where("customer_name", "==", target).get():
            l = doc.to_dict()
            l.setdefault("id", doc.id)
            if not _is_archived(l):
                loans.append(l)

    if not loans:
        raise HTTPException(status_code=404, detail="No loans found")
    return [_loan_out(l, l["id"], reminders.get(l["id"])) for l in loans]


@app.get("/api/loans/stats")
async def get_loans_overview(user=Depends(require_role("admin", "collector"))):
    """Portfolio-wide aggregate stats for the dashboard."""
    active_loans = 0
    total_outstanding = 0.0
    total_collected = 0.0
    total_disbursed = 0.0
    total_due = 0.0
    closed_loans = 0

    for doc in get_firestore_client().collection("loans").get():
        l = doc.to_dict()
        status = l.get("status", "active")
        if status == "merged":
            continue  # its amounts were folded into the primary loan
        collected = l.get("collected_amount", 0) or 0
        pending = l.get("pending_amount", 0) or 0
        total_collected += collected
        total_disbursed += l.get("loan_amount", 0) or 0
        total_due += l.get("due_amount", 0) or 0
        if status == "active":
            active_loans += 1
            total_outstanding += pending
        elif status == "closed":
            closed_loans += 1

    recovery_rate = round((total_collected / total_due) * 100, 1) if total_due > 0 else 0.0

    return {
        "active_loans": active_loans,
        "closed_loans": closed_loans,
        "total_outstanding": round(total_outstanding, 2),
        "total_collected": round(total_collected, 2),
        "total_disbursed": round(total_disbursed, 2),
        "total_due": round(total_due, 2),
        "recovery_rate": recovery_rate,
    }


@app.get("/api/loans/{loan_id}/stats", response_model=LoanStatsResponse)
async def get_loan_stats(loan_id: str, user=Depends(require_role("admin", "collector", "borrower"))):
    _assert_borrower_owns_loan(user, loan_id)
    _, loan = _get_loan_or_404(loan_id)
    return LoanStatsResponse(
        total_days_paid=loan.get("total_days_paid", 0),
        total_days_not_paid=loan.get("total_days_not_paid", 0),
        total_paid_amount=loan.get("collected_amount", 0),
        total_balance_due=loan.get("pending_amount", 0),
    )


@app.get("/api/collector/payments")
async def get_collector_history(collector_name: Optional[str] = None, user=Depends(require_role("admin", "collector"))):
    """Payments logged by a collector. Collectors only see their own; admins may omit the name to get all payments."""
    if user["role"] == "collector":
        collector_name = user["name"]
    rows = get_collector_payments_db(collector_name or None)
    return [LoanPaymentWithBorrower(**r) for r in rows]


# ==============================
# AI FEATURE ROUTES
# ==============================

@app.post("/api/ai/voice-to-ledger/", response_model=VoiceToLedgerResponse)
async def process_voice_ledger(user=Depends(require_admin)):
    mock_parsed_data = {"action": "GOT", "amount": 500.0, "name": "Ramesh", "confidence": 0.95}
    return VoiceToLedgerResponse(**mock_parsed_data)


@app.get("/api/ai/forecasting/")
async def get_cashflow_forecast(user=Depends(require_admin)):
    return {
        "forecast_dates": ["2024-05-01", "2024-05-02"],
        "expected_inflows": [1200, 1500],
        "expected_outflows": [400, 200]
    }


@app.get("/api/reminders/policy/")
async def get_reminder_policy():
    return {
        "channel": "whatsapp",
        "day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
        "description": "Reminders are scheduled on day 5, 7, 10, and 60 from the due date.",
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "storage": get_backend_name()}


# ==============================
# FRONTEND (production build)
# ==============================
# When web/dist exists the API also serves the mobile web app, so one URL
# gives the whole application. Must be registered after every API route.

FRONTEND_DIST = os.environ.get("FRONTEND_DIST", os.path.join(BACKEND_DIR, "..", "web", "dist"))
if os.path.isdir(FRONTEND_DIST):
    _dist = os.path.abspath(FRONTEND_DIST)
    if os.path.isdir(os.path.join(_dist, "assets")):
        app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        if full_path.startswith(("api/", "uploads/")):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = os.path.abspath(os.path.join(_dist, full_path))
        if full_path and candidate.startswith(_dist) and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"), headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), reload=False)
