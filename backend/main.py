import os
import urllib.parse
from typing import List, Dict
from datetime import datetime
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from dotenv import load_dotenv

from db import (
    init_db,
    append_transaction_db,
    append_reminders_db,
    get_admin_lendings_db,
    get_dashboard_summary_db,
    get_db_connection,
    get_loan_payments_db,
    get_collector_payments_db,
)
from schemas import (
    AdminLendingRecord,
    DashboardSummaryResponse,
    TransactionCreate,
    TransactionResponse,
    VoiceToLedgerResponse,
    LoanCreate,
    LoanPaymentCreate,
    LoanPaymentRecord,
    LoanPaymentWithBorrower,
    LoanStatsResponse,
    LoanRecord,
    OTPRequest,
    OTPVerify,
    PaymentResponse,
    WhatsAppLinks,
)
from services.reminders import (
    WHATSAPP_REMINDER_DAY_OFFSETS,
    build_whatsapp_reminder_schedule,
    queue_whatsapp_reminders,
)

load_dotenv()

# --- ENVIRONMENT CONFIG ---
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://mock.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "mock_key")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
except Exception as e:
    print(f"Warning: Could not initialize Supabase client. Set SUPABASE_URL and SUPABASE_KEY. Error: {e}")
    supabase = None

# --- APP INIT ---
app = FastAPI(title="DigitKhata Pro API", description="3-Role Money Lending Tracker")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()


# ==============================
# OTP AUTH ROUTES
# ==============================

import otp_store
from config_admins import ADMIN_USERS, ADMIN_SECRET_KEYWORD, COLLECTOR_USERS, ADMIN_WHATSAPP


def _write_audit(actor: str, action: str, detail: str = ""):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT INTO audit_log (actor, action, detail, created_at) VALUES (?, ?, ?, ?)",
        (actor, action, detail, datetime.utcnow().isoformat()),
    )
    conn.commit()
    conn.close()


def _build_whatsapp_url(phone: str, message: str) -> str:
    """Build a wa.me deep-link with a pre-filled message."""
    clean_phone = phone.replace("+", "").replace(" ", "").replace("-", "")
    return f"https://wa.me/{clean_phone}?text={urllib.parse.quote(message)}"


@app.post("/api/auth/request-otp")
async def request_otp(body: OTPRequest):
    """Step 1 of login: generate OTP. Returns OTP in dev mode."""
    contact = body.contact.strip().lower()

    if body.role == "admin":
        admin_names = [a["name"].lower() for a in ADMIN_USERS]
        if not body.admin_name or body.admin_name.lower() not in admin_names:
            raise HTTPException(status_code=404, detail="Admin not found")

    elif body.role == "collector":
        collector_phones = [c["phone"].replace(" ", "") for c in COLLECTOR_USERS]
        # Contact can be phone for collectors
        if contact.replace(" ", "") not in [p.lower() for p in collector_phones] and \
           contact not in [p.lstrip("+") for p in collector_phones]:
            # Also allow matching by name if collector_name provided
            if not body.collector_name:
                raise HTTPException(status_code=404, detail="Collector not found. Check your phone number.")
            collector_names = [c["name"].lower() for c in COLLECTOR_USERS]
            if body.collector_name.lower() not in collector_names:
                raise HTTPException(status_code=404, detail="Collector not found")

    elif body.role == "member":
        conn = get_db_connection()
        c = conn.cursor()
        c.execute(
            "SELECT id FROM loans WHERE LOWER(customer_email)=? OR LOWER(customer_phone)=? LIMIT 1",
            (contact, contact),
        )
        row = c.fetchone()
        conn.close()
        if not row:
            raise HTTPException(status_code=404, detail="No account found with this email/phone")

    otp = otp_store.generate_and_store(contact)
    return {"message": "OTP generated", "dev_otp": otp, "dev_mode": True}


@app.post("/api/auth/verify-otp")
async def verify_otp(body: OTPVerify):
    """Step 2 of login: verify OTP and return session info."""
    contact = body.contact.strip().lower()
    if not otp_store.verify(contact, body.otp):
        raise HTTPException(status_code=401, detail="Wrong or expired OTP. Please try again.")

    if body.role == "admin":
        _write_audit(body.admin_name or "admin", "LOGIN", f"Admin logged in via {contact}")
        return {"role": "admin", "name": body.admin_name}

    if body.role == "collector":
        # Match by name from collector_name param
        matched = None
        for col in COLLECTOR_USERS:
            if body.collector_name and col["name"].lower() == body.collector_name.lower():
                matched = col
                break
            if col["phone"].replace(" ", "").lstrip("+") in contact.replace(" ", "").lstrip("+") or \
               contact in col["phone"].lower():
                matched = col
                break
        if not matched:
            raise HTTPException(status_code=404, detail="Collector not found")
        _write_audit(matched["name"], "LOGIN", f"Collector logged in via {contact}")
        return {"role": "collector", "name": matched["name"], "phone": matched["phone"]}

    # Member login
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT customer_name, customer_phone FROM loans WHERE LOWER(customer_email)=? OR LOWER(customer_phone)=? LIMIT 1",
        (contact, contact),
    )
    row = c.fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Account not found")
    member_name = row["customer_name"]
    _write_audit(member_name, "LOGIN", f"Member logged in via {contact}")
    return {"role": "member", "name": member_name}


from schemas import MemberSignup

@app.post("/api/auth/signup")
async def signup(body: MemberSignup):
    """Register a new member."""
    loan_id = str(uuid4())
    created_at = datetime.utcnow().isoformat()

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "SELECT id FROM loans WHERE LOWER(customer_email)=? OR LOWER(customer_phone)=? LIMIT 1",
        (body.email.lower(), body.phone),
    )
    if c.fetchone():
        conn.close()
        raise HTTPException(status_code=400, detail="User with this email or phone already exists")

    record = {
        "id": loan_id,
        "customer_id": f"CUST-{uuid4().hex[:6].upper()}",
        "customer_name": body.name,
        "customer_email": body.email,
        "customer_phone": body.phone,
        "customer_address": body.address,
        "loan_amount": 0.0,
        "interest_document": 0.0,
        "start_date": "",
        "closing_date": "",
        "due_amount": 0.0,
        "collected_amount": 0.0,
        "pending_amount": 0.0,
        "status": "new",
        "total_days_paid": 0,
        "total_days_not_paid": 0,
        "repayment_frequency": "monthly",
        "repayment_amount": 0.0,
        "created_at": created_at
    }

    c.execute("""
        INSERT INTO loans (id, customer_id, customer_name, customer_email, customer_phone, customer_address,
            loan_amount, interest_document, start_date, closing_date, due_amount, collected_amount,
            pending_amount, status, total_days_paid, total_days_not_paid,
            repayment_frequency, repayment_amount, created_at)
        VALUES (:id, :customer_id, :customer_name, :customer_email, :customer_phone, :customer_address,
            :loan_amount, :interest_document, :start_date, :closing_date, :due_amount, :collected_amount,
            :pending_amount, :status, :total_days_paid, :total_days_not_paid,
            :repayment_frequency, :repayment_amount, :created_at)
    """, record)
    conn.commit()
    conn.close()

    _write_audit(body.name, "SIGNUP", f"New user signed up: {body.email}")
    return {"status": "success", "message": "Signup successful. You can now login.", "id": loan_id}


from fastapi import File, UploadFile
import shutil

@app.post("/api/loans/upload-proof")
async def upload_proof(loan_id: str, file: UploadFile = File(...)):
    """Upload a proof document for a loan/user."""
    os.makedirs(f"uploads/{loan_id}", exist_ok=True)
    file_path = f"uploads/{loan_id}/{file.filename}"
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    _write_audit("system", "UPLOAD_PROOF", f"Document uploaded for loan {loan_id}: {file.filename}")
    return {"status": "success", "file_path": file_path}


# --- AUTH DEPENDENCIES ---
def get_current_user(x_user_role: str = Header(default="admin")):
    return {
        "merchant_id": "00000000-0000-0000-0000-000000000000",
        "role": x_user_role.lower(),
    }


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ==============================
# CORE LEDGER ROUTES
# ==============================

@app.post("/api/transactions/", response_model=TransactionResponse)
async def create_transaction(
    tx: TransactionCreate,
    background_tasks: BackgroundTasks,
    user=Depends(get_current_user)
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

    if supabase:
        try:
            supabase.table("transactions").insert(transaction_record).execute()
            if reminders:
                supabase.table("reminder_jobs").insert(reminders).execute()
        except Exception as exc:
            print(f"Warning: falling back to SQLite. Error: {exc}")
            append_transaction_db(transaction_record)
            append_reminders_db(reminders)
    else:
        append_transaction_db(transaction_record)
        append_reminders_db(reminders)

    if reminders:
        background_tasks.add_task(queue_whatsapp_reminders, reminders)

    return TransactionResponse(status="success", data=transaction_record, reminders=reminders)


@app.get("/api/dashboard/", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(user=Depends(get_current_user)):
    """Return overview summary including today's collections and by-collector breakdown."""
    return DashboardSummaryResponse(**get_dashboard_summary_db())


@app.get("/api/admin/lendings/", response_model=List[AdminLendingRecord])
async def get_admin_lending_view(admin_user=Depends(require_admin)):
    """Admin-only lending view with interest rate and reminder schedules."""
    return [AdminLendingRecord(**row) for row in get_admin_lendings_db()]


@app.get("/api/collectors/")
async def get_collectors():
    """Return the list of registered collector names (public, used for login dropdown)."""
    return [{"name": c["name"], "phone": c["phone"]} for c in COLLECTOR_USERS]


# ==============================
# LOANS & COLLECTIONS ROUTES
# ==============================

@app.post("/api/loans/", response_model=LoanRecord)
async def create_loan(loan: LoanCreate, background_tasks: BackgroundTasks):
    loan_id = str(uuid4())
    create_time = datetime.utcnow()
    created_at = create_time.isoformat()
    record = {
        "id": loan_id,
        "customer_id": loan.customer_id,
        "customer_name": loan.customer_name,
        "customer_email": loan.customer_email,
        "customer_phone": loan.customer_phone,
        "customer_address": loan.customer_address,
        "loan_amount": loan.loan_amount,
        "interest_document": loan.interest_document,
        "start_date": loan.start_date,
        "closing_date": loan.closing_date,
        "due_amount": loan.loan_amount + loan.interest_document,
        "collected_amount": 0.0,
        "pending_amount": loan.loan_amount + loan.interest_document,
        "status": "active",
        "total_days_paid": 0,
        "total_days_not_paid": 0,
        "repayment_frequency": loan.repayment_frequency,
        "repayment_amount": loan.repayment_amount or 0.0,
        "created_at": created_at
    }

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO loans (id, customer_id, customer_name, customer_email, customer_phone, customer_address,
            loan_amount, interest_document, start_date, closing_date, due_amount, collected_amount,
            pending_amount, status, total_days_paid, total_days_not_paid,
            repayment_frequency, repayment_amount, created_at)
        VALUES (:id, :customer_id, :customer_name, :customer_email, :customer_phone, :customer_address,
            :loan_amount, :interest_document, :start_date, :closing_date, :due_amount, :collected_amount,
            :pending_amount, :status, :total_days_paid, :total_days_not_paid,
            :repayment_frequency, :repayment_amount, :created_at)
    """, record)
    conn.commit()
    conn.close()

    _write_audit(loan.customer_name, "LOAN_CREATED", f"Loan ₹{loan.loan_amount} created, freq={loan.repayment_frequency}")

    reminders = build_whatsapp_reminder_schedule(
        transaction_id=loan_id,
        customer_id=loan.customer_id,
        due_date=loan.closing_date,
        created_at=create_time,
    )
    append_reminders_db(reminders)
    if reminders:
        background_tasks.add_task(queue_whatsapp_reminders, reminders)

    return LoanRecord(**record)


@app.get("/api/loans/", response_model=List[LoanRecord])
async def get_loans():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM loans")
    loans = [dict(row) for row in c.fetchall()]

    for l in loans:
        c.execute("SELECT * FROM reminders WHERE transaction_id=?", (l['id'],))
        l['reminder_schedule'] = [dict(row) for row in c.fetchall()]
        # Ensure new fields have defaults for old records
        l.setdefault('repayment_frequency', 'monthly')
        l.setdefault('repayment_amount', 0.0)

    conn.close()
    return [LoanRecord(**l) for l in loans]


@app.post("/api/loans/{loan_id}/payments", response_model=PaymentResponse)
async def record_payment(loan_id: str, payment: LoanPaymentCreate):
    conn = get_db_connection()
    c = conn.cursor()

    c.execute("SELECT * FROM loans WHERE id=?", (loan_id,))
    loan = c.fetchone()
    if not loan:
        conn.close()
        raise HTTPException(status_code=404, detail="Loan not found")

    payment_date = payment.payment_date or datetime.utcnow().isoformat()

    # Insert payment with collector info
    c.execute("""
        INSERT INTO loan_payments (loan_id, amount, payment_method, payment_date, collector_name, collector_phone, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (loan_id, payment.amount, payment.payment_method, payment_date,
          payment.collector_name, payment.collector_phone, payment.notes))

    # Update loan totals
    new_collected = loan['collected_amount'] + payment.amount
    new_pending = loan['due_amount'] - new_collected
    new_days_paid = loan['total_days_paid'] + 1
    new_status = 'closed' if new_pending <= 0 else loan['status']

    c.execute("""
        UPDATE loans SET collected_amount=?, pending_amount=?, total_days_paid=?, status=? WHERE id=?
    """, (new_collected, new_pending, new_days_paid, new_status, loan_id))

    conn.commit()

    c.execute("SELECT * FROM loans WHERE id=?", (loan_id,))
    updated_loan = dict(c.fetchone())
    updated_loan.setdefault('repayment_frequency', 'monthly')
    updated_loan.setdefault('repayment_amount', 0.0)
    conn.close()

    _write_audit(
        payment.collector_name or "system",
        "PAYMENT_RECORDED",
        f"₹{payment.amount} collected from {loan['customer_name']} by {payment.collector_name or 'unknown'}"
    )

    # Build WhatsApp deep-link messages
    date_str = datetime.utcnow().strftime("%d %b %Y, %I:%M %p")
    collector_tag = payment.collector_name or "Collector"

    admin_msg = (
        f"✅ *Payment Received*\n"
        f"👤 Borrower: {loan['customer_name']}\n"
        f"💰 Amount: ₹{payment.amount:,.0f}\n"
        f"💳 Method: {payment.payment_method}\n"
        f"👷 Collected by: {collector_tag}\n"
        f"🗒 Notes: {payment.notes or 'None'}\n"
        f"📅 Date: {date_str}\n"
        f"🔴 Still Pending: ₹{max(new_pending, 0):,.0f}"
    )

    borrower_msg = (
        f"✅ *Payment Confirmation*\n"
        f"Hello {loan['customer_name']},\n"
        f"Your payment of ₹{payment.amount:,.0f} ({payment.payment_method}) has been received.\n"
        f"📅 Date: {date_str}\n"
        f"💰 Remaining Balance: ₹{max(new_pending, 0):,.0f}\n"
        f"Thank you! — DigitKhata Pro"
    )

    admin_url = _build_whatsapp_url(ADMIN_WHATSAPP, admin_msg)
    borrower_url = None
    borrower_phone = loan.get('customer_phone') or ''
    if borrower_phone:
        borrower_url = _build_whatsapp_url(borrower_phone, borrower_msg)

    return PaymentResponse(
        status="success",
        data=updated_loan,
        whatsapp=WhatsAppLinks(
            notify_admin_url=admin_url,
            notify_borrower_url=borrower_url,
            message_preview=admin_msg,
        )
    )


@app.get("/api/loans/{loan_id}/payments", response_model=List[LoanPaymentRecord])
async def get_loan_payment_history(loan_id: str):
    """Return full payment history for a loan."""
    return [LoanPaymentRecord(**p) for p in get_loan_payments_db(loan_id)]


@app.get("/api/loans/by-customer", response_model=List[LoanRecord])
async def get_loans_by_customer(name: str):
    """Member-facing: returns loans matching the given customer name."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM loans WHERE LOWER(customer_name)=LOWER(?)", (name.strip(),))
    loans = [dict(row) for row in c.fetchall()]

    for l in loans:
        c.execute("SELECT * FROM reminders WHERE transaction_id=?", (l['id'],))
        l['reminder_schedule'] = [dict(row) for row in c.fetchall()]
        l.setdefault('repayment_frequency', 'monthly')
        l.setdefault('repayment_amount', 0.0)

    conn.close()
    if not loans:
        raise HTTPException(status_code=404, detail="No loans found for this name")
    return [LoanRecord(**l) for l in loans]


@app.get("/api/loans/{loan_id}/stats", response_model=LoanStatsResponse)
async def get_loan_stats(loan_id: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM loans WHERE id=?", (loan_id,))
    loan = c.fetchone()
    if not loan:
        conn.close()
        raise HTTPException(status_code=404, detail="Loan not found")

    stats = {
        "total_days_paid": loan['total_days_paid'],
        "total_days_not_paid": loan['total_days_not_paid'],
        "total_paid_amount": loan['collected_amount'],
        "total_balance_due": loan['pending_amount']
    }
    conn.close()
    return LoanStatsResponse(**stats)


@app.get("/api/collector/payments")
async def get_collector_history(collector_name: str):
    """Return all payments logged by a specific collector."""
    rows = get_collector_payments_db(collector_name)
    return [LoanPaymentWithBorrower(**r) for r in rows]


# ==============================
# AI FEATURE ROUTES
# ==============================

@app.post("/api/ai/voice-to-ledger/", response_model=VoiceToLedgerResponse)
async def process_voice_ledger():
    mock_parsed_data = {"action": "GOT", "amount": 500.0, "name": "Ramesh", "confidence": 0.95}
    return VoiceToLedgerResponse(**mock_parsed_data)


@app.get("/api/ai/forecasting/")
async def get_cashflow_forecast(user_id: str = Depends(get_current_user)):
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


# ==============================
# BACKGROUND PROCESSES
# ==============================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
