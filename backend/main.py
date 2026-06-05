import os
import urllib.parse
from typing import List, Dict
from datetime import datetime
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db import (
    init_db,
    append_transaction_db,
    append_reminders_db,
    get_admin_lendings_db,
    get_dashboard_summary_db,
    get_firestore_client,
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
    BorrowerOTPRequest,
    BorrowerOTPVerify,
    LoanMergeRequest,
)
from services.reminders import (
    WHATSAPP_REMINDER_DAY_OFFSETS,
    build_whatsapp_reminder_schedule,
    queue_whatsapp_reminders,
)

load_dotenv()

# --- APP INIT ---
app = FastAPI(title="DigiVasool API", description="3-Role Money Lending Tracker — Powered by Firebase")

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
    db = get_firestore_client()
    db.collection("audit_log").add({
        "actor": actor,
        "action": action,
        "detail": detail,
        "created_at": datetime.utcnow().isoformat(),
    })


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
        if contact.replace(" ", "") not in [p.lower() for p in collector_phones] and \
           contact not in [p.lstrip("+") for p in collector_phones]:
            if not body.collector_name:
                raise HTTPException(status_code=404, detail="Collector not found. Check your phone number.")
            collector_names = [c["name"].lower() for c in COLLECTOR_USERS]
            if body.collector_name.lower() not in collector_names:
                raise HTTPException(status_code=404, detail="Collector not found")

    elif body.role == "member":
        db = get_firestore_client()
        # Search by email or phone in Firestore loans
        found = False
        email_docs = db.collection("loans").where("customer_email", "==", contact).limit(1).get()
        if email_docs:
            found = True
        else:
            phone_docs = db.collection("loans").where("customer_phone", "==", contact).limit(1).get()
            if phone_docs:
                found = True
        if not found:
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
    db = get_firestore_client()
    member_name = None
    email_docs = db.collection("loans").where("customer_email", "==", contact).limit(1).get()
    if email_docs:
        member_name = email_docs[0].to_dict().get("customer_name")
    else:
        phone_docs = db.collection("loans").where("customer_phone", "==", contact).limit(1).get()
        if phone_docs:
            member_name = phone_docs[0].to_dict().get("customer_name")
    if not member_name:
        raise HTTPException(status_code=404, detail="Account not found")
    _write_audit(member_name, "LOGIN", f"Member logged in via {contact}")
    return {"role": "member", "name": member_name}


from schemas import MemberSignup

@app.post("/api/auth/signup")
async def signup(body: MemberSignup):
    """Register a new member."""
    db = get_firestore_client()
    loan_id = str(uuid4())
    created_at = datetime.utcnow().isoformat()

    # Check if user already exists
    email_docs = db.collection("loans").where("customer_email", "==", body.email.lower()).limit(1).get()
    phone_docs = db.collection("loans").where("customer_phone", "==", body.phone).limit(1).get()
    if email_docs or phone_docs:
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
        "created_at": created_at,
    }

    db.collection("loans").document(loan_id).set(record)
    _write_audit(body.name, "SIGNUP", f"New user signed up: {body.email}")
    return {"status": "success", "message": "Signup successful. You can now login.", "id": loan_id}


from fastapi import File, UploadFile
import shutil

@app.post("/api/auth/borrower/send-otp")
async def borrower_send_otp(body: BorrowerOTPRequest):
    """Send OTP to a borrower's phone for verification during registration."""
    phone = body.phone.strip()
    otp = otp_store.generate_and_store(phone)
    return {"message": "OTP sent", "dev_otp": otp, "dev_mode": True}


@app.post("/api/auth/borrower/verify-otp")
async def borrower_verify_otp(body: BorrowerOTPVerify):
    """Verify OTP for borrower phone verification."""
    phone = body.phone.strip()
    if not otp_store.verify(phone, body.otp):
        raise HTTPException(status_code=401, detail="Wrong or expired OTP")
    return {"verified": True, "phone": phone}


@app.post("/api/loans/upload-proof")
async def upload_proof(loan_id: str, file: UploadFile = File(...), x_user_role: str = Header(default="admin")):
    """Upload a proof document for a loan/user."""
    if x_user_role.lower() not in {"admin", "member"}:
        raise HTTPException(status_code=403, detail="Access denied for this role")
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


def require_role(*allowed_roles: str):
    """Allow only specified roles (admin/collector/member)."""
    allowed = {r.lower() for r in allowed_roles}

    def _dep(user=Depends(get_current_user)):
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail="Access denied for this role")
        return user

    return _dep


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

    # Store in Firestore
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
    db = get_firestore_client()
    loan_id = str(uuid4())
    create_time = datetime.utcnow()
    created_at = create_time.isoformat()

    # Compute total due from flat fee breakdown
    total_fees = (
        loan.monthly_interest_amount +
        loan.field_visit_charge +
        loan.document_fee +
        loan.processing_fee
    )
    due_amount = loan.loan_amount + total_fees

    record = {
        "id": loan_id,
        "customer_id": loan.customer_id,
        "customer_name": loan.customer_name,
        "customer_email": loan.customer_email,
        "customer_phone": loan.customer_phone,
        "customer_address": loan.customer_address,
        # New fields
        "alternate_phone": loan.alternate_phone or "",
        "shop_name": loan.shop_name or "",
        "aadhaar_number": loan.aadhaar_number or "",
        "photo_url": loan.photo_url or "",
        "guarantor_name": loan.guarantor_name or "",
        "guarantor_phone": loan.guarantor_phone or "",
        "guarantor_address": loan.guarantor_address or "",
        # Amounts
        "loan_amount": loan.loan_amount,
        "monthly_interest_amount": loan.monthly_interest_amount,
        "field_visit_charge": loan.field_visit_charge,
        "document_fee": loan.document_fee,
        "processing_fee": loan.processing_fee,
        "due_amount": due_amount,
        "collected_amount": 0.0,
        "pending_amount": due_amount,
        "status": "active",
        "total_days_paid": 0,
        "total_days_not_paid": 0,
        "repayment_frequency": loan.repayment_frequency,
        "repayment_amount": loan.repayment_amount or 0.0,
        "created_at": created_at,
    }

    db.collection("loans").document(loan_id).set(record)

    _write_audit(loan.customer_name, "LOAN_CREATED", f"Loan ₹{loan.loan_amount} created, freq={loan.repayment_frequency}, total_due=₹{due_amount}")

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


@app.post("/api/loans/merge")
async def merge_loans(body: LoanMergeRequest, user=Depends(require_admin)):
    db = get_firestore_client()

    primary_ref = db.collection("loans").document(body.primary_loan_id)
    primary_doc = primary_ref.get()

    secondary_ref = db.collection("loans").document(body.secondary_loan_id)
    secondary_doc = secondary_ref.get()

    if not primary_doc.exists or not secondary_doc.exists:
        raise HTTPException(status_code=404, detail="One or both loans not found")

    p_data = primary_doc.to_dict()
    s_data = secondary_doc.to_dict()

    # Merge numeric fields
    p_data["loan_amount"] = p_data.get("loan_amount", 0.0) + s_data.get("loan_amount", 0.0)
    p_data["monthly_interest_amount"] = p_data.get("monthly_interest_amount", 0.0) + s_data.get("monthly_interest_amount", 0.0)
    p_data["field_visit_charge"] = p_data.get("field_visit_charge", 0.0) + s_data.get("field_visit_charge", 0.0)
    p_data["document_fee"] = p_data.get("document_fee", 0.0) + s_data.get("document_fee", 0.0)
    p_data["processing_fee"] = p_data.get("processing_fee", 0.0) + s_data.get("processing_fee", 0.0)
    p_data["due_amount"] = p_data.get("due_amount", 0.0) + s_data.get("due_amount", 0.0)
    p_data["collected_amount"] = p_data.get("collected_amount", 0.0) + s_data.get("collected_amount", 0.0)
    p_data["pending_amount"] = p_data.get("pending_amount", 0.0) + s_data.get("pending_amount", 0.0)

    # Save primary loan
    primary_ref.set(p_data)

    # Reassign payments
    payment_docs = db.collection("loan_payments").where("loan_id", "==", body.secondary_loan_id).get()
    for doc in payment_docs:
        doc.reference.update({"loan_id": body.primary_loan_id})

    # Delete secondary loan
    secondary_ref.delete()

    # Write audit log
    _write_audit(
        p_data.get("customer_name", "system"),
        "LOAN_MERGED",
        f"Merged loan {body.secondary_loan_id} into {body.primary_loan_id}"
    )

    return {"status": "success", "message": "Loans merged successfully"}


@app.get("/api/loans/", response_model=List[LoanRecord])
async def get_loans(user=Depends(require_role("admin", "collector"))):
    db = get_firestore_client()
    docs = db.collection("loans").get()
    loans = []

    for doc in docs:
        l = doc.to_dict()
        l.setdefault("id", doc.id)
        l.setdefault("repayment_frequency", "monthly")
        l.setdefault("repayment_amount", 0.0)
        # New fields defaults for old records
        l.setdefault("alternate_phone", "")
        l.setdefault("shop_name", "")
        l.setdefault("aadhaar_number", "")
        l.setdefault("photo_url", "")
        l.setdefault("guarantor_name", "")
        l.setdefault("guarantor_phone", "")
        l.setdefault("guarantor_address", "")
        l.setdefault("monthly_interest_amount", l.pop("interest_document", 0.0))
        l.setdefault("field_visit_charge", 0.0)
        l.setdefault("document_fee", 0.0)
        l.setdefault("processing_fee", 0.0)

        # Get reminders
        reminder_docs = db.collection("reminders").where("transaction_id", "==", l["id"]).get()
        l["reminder_schedule"] = [r.to_dict() for r in reminder_docs]

        loans.append(l)

    return [LoanRecord(**l) for l in loans]


@app.post("/api/loans/{loan_id}/payments", response_model=PaymentResponse)
async def record_payment(loan_id: str, payment: LoanPaymentCreate, user=Depends(require_role("admin", "collector"))):
    db = get_firestore_client()

    loan_ref = db.collection("loans").document(loan_id)
    loan_doc = loan_ref.get()
    if not loan_doc.exists:
        raise HTTPException(status_code=404, detail="Loan not found")

    loan = loan_doc.to_dict()
    payment_date = payment.payment_date or datetime.utcnow().isoformat()

    # Create a unique payment ID
    payment_id = str(uuid4())

    # Insert payment into Firestore
    payment_record = {
        "id": payment_id,
        "loan_id": loan_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "payment_date": payment_date,
        "collector_name": payment.collector_name,
        "collector_phone": payment.collector_phone,
        "notes": payment.notes,
    }
    db.collection("loan_payments").document(payment_id).set(payment_record)

    # Update loan totals
    new_collected = loan["collected_amount"] + payment.amount
    new_pending = loan["due_amount"] - new_collected
    new_days_paid = loan["total_days_paid"] + 1
    new_status = "closed" if new_pending <= 0 else loan["status"]

    loan_ref.update({
        "collected_amount": new_collected,
        "pending_amount": new_pending,
        "total_days_paid": new_days_paid,
        "status": new_status,
    })

    # Read updated loan
    updated_loan = loan_ref.get().to_dict()
    updated_loan.setdefault("repayment_frequency", "monthly")
    updated_loan.setdefault("repayment_amount", 0.0)

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
        f"Thank you! — DigiVasool"
    )

    admin_url = _build_whatsapp_url(ADMIN_WHATSAPP, admin_msg)
    borrower_url = None
    borrower_phone = loan.get("customer_phone") or ""
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
async def get_loan_payment_history(loan_id: str, user=Depends(require_role("admin", "collector", "member"))):
    """Return full payment history for a loan."""
    return [LoanPaymentRecord(**p) for p in get_loan_payments_db(loan_id)]


@app.get("/api/loans/by-customer", response_model=List[LoanRecord])
async def get_loans_by_customer(name: str, user=Depends(require_role("admin", "member"))):
    """Member-facing: returns loans matching the given customer name."""
    db = get_firestore_client()
    docs = db.collection("loans").where("customer_name", "==", name.strip()).get()

    if not docs:
        raise HTTPException(status_code=404, detail="No loans found for this name")

    loans = []
    for doc in docs:
        l = doc.to_dict()
        l.setdefault("id", doc.id)
        l.setdefault("repayment_frequency", "monthly")
        l.setdefault("repayment_amount", 0.0)

        reminder_docs = db.collection("reminders").where("transaction_id", "==", l["id"]).get()
        l["reminder_schedule"] = [r.to_dict() for r in reminder_docs]
        loans.append(l)

    return [LoanRecord(**l) for l in loans]


@app.get("/api/loans/{loan_id}/stats", response_model=LoanStatsResponse)
async def get_loan_stats(loan_id: str):
    db = get_firestore_client()
    loan_doc = db.collection("loans").document(loan_id).get()
    if not loan_doc.exists:
        raise HTTPException(status_code=404, detail="Loan not found")

    loan = loan_doc.to_dict()
    return LoanStatsResponse(
        total_days_paid=loan.get("total_days_paid", 0),
        total_days_not_paid=loan.get("total_days_not_paid", 0),
        total_paid_amount=loan.get("collected_amount", 0),
        total_balance_due=loan.get("pending_amount", 0),
    )


@app.get("/api/collector/payments")
async def get_collector_history(collector_name: str, user=Depends(require_role("admin", "collector"))):
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
