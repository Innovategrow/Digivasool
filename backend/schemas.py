import re
from typing import Any, Literal, Optional, List, Dict

from pydantic import BaseModel, Field, field_validator

LanguageCode = Literal["en", "hi", "ta", "te", "kn", "ml"]

_PHONE_RE = re.compile(r"^\+?[0-9]{10,15}$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MAX_PHOTO_CHARS = 3_000_000  # ~2 MB image as a data URL

_TEXT_LIMITS = {
    "customer_address": 300, "guarantor_address": 300, "shop_name": 120,
    "zone": 80, "guarantor_name": 100, "customer_email": 120,
}


def _clean_phone(value: Optional[str], label: str) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return ""
    compact = re.sub(r"[\s\-()]", "", value)
    if not _PHONE_RE.match(compact):
        raise ValueError(f"{label} must be a valid mobile number (10-15 digits)")
    return compact


class BorrowerFieldsMixin:
    """Shared validation for borrower profile fields (used on create and edit)."""

    @field_validator("customer_name", mode="before", check_fields=False)
    @classmethod
    def _v_name(cls, v):
        if v is None:
            return v
        v = str(v).strip()
        if len(v) < 2:
            raise ValueError("Full name must be at least 2 characters")
        if len(v) > 100:
            raise ValueError("Full name must be at most 100 characters")
        return v

    @field_validator("customer_phone", mode="before", check_fields=False)
    @classmethod
    def _v_phone(cls, v):
        return _clean_phone(v, "Primary mobile")

    @field_validator("alternate_phone", mode="before", check_fields=False)
    @classmethod
    def _v_alt_phone(cls, v):
        return _clean_phone(v, "Alternate mobile")

    @field_validator("guarantor_phone", mode="before", check_fields=False)
    @classmethod
    def _v_guarantor_phone(cls, v):
        return _clean_phone(v, "Guarantor phone")

    @field_validator("customer_email", mode="before", check_fields=False)
    @classmethod
    def _v_email(cls, v):
        if v is None:
            return v
        v = str(v).strip()
        if v and not _EMAIL_RE.match(v):
            raise ValueError("Email address is not valid")
        return v

    @field_validator("aadhaar_number", mode="before", check_fields=False)
    @classmethod
    def _v_aadhaar(cls, v):
        if v is None:
            return v
        digits = re.sub(r"[\s\-]", "", str(v))
        if digits and not re.fullmatch(r"[0-9]{12}", digits):
            raise ValueError("Aadhaar number must be 12 digits")
        return digits

    @field_validator("photo_url", mode="before", check_fields=False)
    @classmethod
    def _v_photo(cls, v):
        if v is None:
            return v
        v = str(v)
        if len(v) > _MAX_PHOTO_CHARS:
            raise ValueError("Photo is too large. Please use a smaller image")
        if v and not (v.startswith("data:image/") or v.startswith("http") or v.startswith("/uploads/")):
            raise ValueError("Photo must be an image")
        return v

    @field_validator("customer_address", "guarantor_address", "shop_name", "zone", "guarantor_name",
                     mode="before", check_fields=False)
    @classmethod
    def _v_text(cls, v, info):
        if v is None:
            return v
        v = str(v).strip()
        limit = _TEXT_LIMITS.get(info.field_name, 200)
        if len(v) > limit:
            raise ValueError(f"{info.field_name.replace('_', ' ').capitalize()} must be at most {limit} characters")
        return v


class TransactionCreate(BaseModel):
    customer_id: str
    customer_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    customer_phone: Optional[str] = None
    type: Literal["GAVE", "GOT"] = Field(..., description="Must be 'GAVE' or 'GOT'")
    amount: float = Field(..., gt=0)
    due_date: Optional[str] = None
    notes: Optional[str] = None
    interest_rate_monthly: Optional[float] = Field(
        default=None,
        ge=0,
        le=100,
        description="Monthly interest rate used only for admin-side lending views.",
    )


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    phone_number: Optional[str] = None


class ReminderScheduleEntry(BaseModel):
    transaction_id: str
    customer_id: str
    channel: Literal["whatsapp"]
    day_offset: int
    scheduled_for: str
    status: Literal["scheduled", "queued", "sent", "failed"] = "scheduled"


class DashboardSummaryResponse(BaseModel):
    you_will_give: float
    you_will_get: float
    active_lending_count: int
    active_loans: int
    today_collected: float
    collector_breakdown: List[Dict[str, Any]]
    reminder_day_offsets: List[int]


class TransactionResponse(BaseModel):
    status: str
    data: Dict[str, Any]
    reminders: List[ReminderScheduleEntry]


class AdminLendingRecord(BaseModel):
    transaction_id: str
    customer_id: str
    customer_name: str
    customer_phone: Optional[str] = None
    amount: float
    outstanding_amount: float
    interest_rate_monthly: float
    due_date: Optional[str] = None
    notes: Optional[str] = None
    reminder_schedule: List[ReminderScheduleEntry]


class VoiceToLedgerResponse(BaseModel):
    action: str
    amount: float
    name: str
    confidence: float


class LoanCreate(BorrowerFieldsMixin, BaseModel):
    customer_id: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    # New fields
    alternate_phone: Optional[str] = None
    shop_name: Optional[str] = None
    aadhaar_number: Optional[str] = None
    photo_url: Optional[str] = None
    zone: Optional[str] = None
    guarantor_name: Optional[str] = None
    guarantor_phone: Optional[str] = None
    guarantor_address: Optional[str] = None
    # Loan amounts
    loan_amount: float
    # Flat ₹ interest & fee breakdown (replaces interest_document + interest_rate_monthly %)
    monthly_interest_amount: float = Field(default=0.0, description="Monthly interest in flat ₹ (not %)")
    field_visit_charge: float = Field(default=0.0, description="Field visit / verification charge ₹")
    document_fee: float = Field(default=0.0, description="Document fee ₹")
    processing_fee: float = Field(default=0.0, description="Processing / admin fee ₹")
    # Dates & repayment
    start_date: str
    closing_date: str
    repayment_frequency: Literal["daily", "weekly", "monthly", "custom"] = "monthly"
    repayment_amount: Optional[float] = 0.0
    # Preferred language for the post-disbursement SMS
    preferred_language: LanguageCode = "en"


class LoanPaymentCreate(BaseModel):
    amount: float = Field(ge=0)
    payment_method: Literal["Cash", "GPay"]
    payment_date: Optional[str] = None
    collector_name: Optional[str] = None
    collector_phone: Optional[str] = None
    notes: Optional[str] = None


class LoanPaymentRecord(BaseModel):
    id: str
    loan_id: str
    amount: float
    payment_method: str
    payment_date: str
    collector_name: Optional[str] = None
    collector_phone: Optional[str] = None
    notes: Optional[str] = None
    proof_url: Optional[str] = None
    proof_filename: Optional[str] = None
    created_at: Optional[str] = None
    created_by: Optional[str] = None


class LoanPaymentWithBorrower(LoanPaymentRecord):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None


class LoanStatsResponse(BaseModel):
    total_days_paid: int
    total_days_not_paid: int
    total_paid_amount: float
    total_balance_due: float


class LoanRecord(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    # New fields
    alternate_phone: Optional[str] = None
    shop_name: Optional[str] = None
    aadhaar_number: Optional[str] = None
    photo_url: Optional[str] = None
    zone: Optional[str] = None
    guarantor_name: Optional[str] = None
    guarantor_phone: Optional[str] = None
    guarantor_address: Optional[str] = None
    # Unique borrower account number, assigned at disbursement
    account_number: Optional[str] = None
    preferred_language: Optional[str] = "en"
    # Amounts
    loan_amount: float
    monthly_interest_amount: Optional[float] = 0.0
    field_visit_charge: Optional[float] = 0.0
    document_fee: Optional[float] = 0.0
    processing_fee: Optional[float] = 0.0
    due_amount: float
    collected_amount: float
    pending_amount: float
    status: str
    previous_status: Optional[str] = None
    is_deleted: Optional[bool] = False
    deleted_at: Optional[str] = None
    deleted_by: Optional[str] = None
    created_by: Optional[str] = None
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None
    total_days_paid: int
    total_days_not_paid: int
    created_at: str
    start_date: Optional[str] = None
    closing_date: Optional[str] = None
    repayment_frequency: Optional[str] = "monthly"
    repayment_amount: Optional[float] = 0.0
    reminder_schedule: Optional[List[ReminderScheduleEntry]] = []


class OTPRequest(BaseModel):
    contact: str  # email or phone
    role: Literal["admin", "collector", "borrower"]
    admin_name: Optional[str] = None   # required for admin
    collector_name: Optional[str] = None  # required for collector


class OTPVerify(BaseModel):
    contact: str
    otp: str
    role: Literal["admin", "collector", "borrower"]
    admin_name: Optional[str] = None
    collector_name: Optional[str] = None


class AdminNotifyLink(BaseModel):
    name: str
    phone: str
    url: str


class WhatsAppLinks(BaseModel):
    notify_admin_urls: List[AdminNotifyLink] = []
    notify_borrower_url: Optional[str] = None
    message_preview: str


class SMSLinks(BaseModel):
    send_sms_url: Optional[str] = None
    message_preview: str
    language: str


class PaymentResponse(BaseModel):
    status: str
    data: Dict[str, Any]
    whatsapp: WhatsAppLinks
    payment: LoanPaymentRecord


class LoanCreateResponse(BaseModel):
    status: str
    data: LoanRecord
    sms: SMSLinks


class BorrowerOTPRequest(BaseModel):
    phone: str


class BorrowerOTPVerify(BaseModel):
    phone: str
    otp: str


class LoanMergeRequest(BaseModel):
    primary_loan_id: str
    secondary_loan_id: str


class LoanUpdate(BorrowerFieldsMixin, BaseModel):
    """Editable borrower profile fields. All optional — only fields the admin changed are sent.
    Financial fields (amounts, status, payments) are deliberately not editable here."""
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    alternate_phone: Optional[str] = None
    shop_name: Optional[str] = None
    aadhaar_number: Optional[str] = None
    photo_url: Optional[str] = None
    zone: Optional[str] = None
    guarantor_name: Optional[str] = None
    guarantor_phone: Optional[str] = None
    guarantor_address: Optional[str] = None
    preferred_language: Optional[LanguageCode] = None


class ExpenseCreate(BaseModel):
    category: str = Field(..., min_length=1, max_length=60)
    amount: float = Field(..., gt=0)
    date: str
    description: Optional[str] = Field(default="", max_length=300)


class CapitalCreate(BaseModel):
    amount: float = Field(..., gt=0)
    date: str
    note: Optional[str] = Field(default="", max_length=300)


class StaffCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    role: Literal["admin", "manager", "collector"] = "collector"
    phone: Optional[str] = ""
    email: Optional[str] = ""
    target: float = Field(default=0, ge=0)

    @field_validator("phone", mode="before")
    @classmethod
    def _v_phone(cls, v):
        return _clean_phone(v, "Phone")
