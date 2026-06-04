from typing import Any, Literal, Optional, List, Dict

from pydantic import BaseModel, Field


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


class LoanCreate(BaseModel):
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


class LoanPaymentCreate(BaseModel):
    amount: float
    payment_method: Literal["Cash", "GPay"]
    payment_date: Optional[str] = None
    collector_name: Optional[str] = None
    collector_phone: Optional[str] = None
    notes: Optional[str] = None


class LoanPaymentRecord(BaseModel):
    id: int
    loan_id: str
    amount: float
    payment_method: str
    payment_date: str
    collector_name: Optional[str] = None
    collector_phone: Optional[str] = None
    notes: Optional[str] = None


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
    guarantor_name: Optional[str] = None
    guarantor_phone: Optional[str] = None
    guarantor_address: Optional[str] = None
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
    total_days_paid: int
    total_days_not_paid: int
    created_at: str
    repayment_frequency: Optional[str] = "monthly"
    repayment_amount: Optional[float] = 0.0
    reminder_schedule: Optional[List[ReminderScheduleEntry]] = []


class OTPRequest(BaseModel):
    contact: str  # email or phone
    role: Literal["admin", "member", "collector"]
    admin_name: Optional[str] = None   # required for admin
    member_name: Optional[str] = None  # used to look up member
    collector_name: Optional[str] = None  # required for collector


class OTPVerify(BaseModel):
    contact: str
    otp: str
    role: Literal["admin", "member", "collector"]
    admin_name: Optional[str] = None
    member_name: Optional[str] = None
    collector_name: Optional[str] = None


class MemberSignup(BaseModel):
    name: str
    email: str
    phone: str
    address: str


class WhatsAppLinks(BaseModel):
    notify_admin_url: str
    notify_borrower_url: Optional[str] = None
    message_preview: str


class PaymentResponse(BaseModel):
    status: str
    data: Dict[str, Any]
    whatsapp: WhatsAppLinks


class BorrowerOTPRequest(BaseModel):
    phone: str


class BorrowerOTPVerify(BaseModel):
    phone: str
    otp: str


class LoanMergeRequest(BaseModel):
    primary_loan_id: str
    secondary_loan_id: str

