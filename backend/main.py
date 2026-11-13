import contextvars
import logging
import mimetypes
import os
import re
import shutil
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.concurrency import run_in_threadpool

load_dotenv()

from auth import decode_token, issue_short_token, issue_token
import identity
import subscriptions
from subscriptions import SubscriptionError
from db import (
    LEGACY_ORG_ID,
    OrgContextError,
    as_org,
    get_current_org,
    reset_current_org,
    set_current_org,
    db_lock,
    init_db,
    append_transaction_db,
    append_reminders_db,
    get_admin_lendings_db,
    get_backend_name,
    get_dashboard_summary_db,
    get_db_client,
    load_file,
    save_file,
    set_current_business,
    reset_current_business,
    get_current_business,
    list_books,
    create_book,
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
    StaffUpdate,
    TransactionCreate,
    TransactionResponse,
    VoiceToLedgerResponse,
    LoanCreate,
    LoanCreateResponse,
    LoanPaymentCreate,
    LoanPaymentRecord,
    LoanPaymentUpdate,
    LoanPaymentWithBorrower,
    LoanStatsResponse,
    LoanRecord,
    LoanUpdate,
    OTPRequest,
    RegisterOrgRequest,
    SelectOrgRequest,
    SwitchOrgRequest,
    JoinRequestCreate,
    JoinRequestApprove,
    OTPVerify,
    PaymentResponse,
    WhatsAppLinks,
    SMSLinks,
    BorrowerOTPRequest,
    BorrowerOTPVerify,
    LoanMergeRequest,
    CreateOrderRequest,
    RenewRequest,
    VerifyPaymentRequest,
    ExtendTrialRequest,
    SetSubscriptionStatusRequest,
)
from services.reminders import (
    WHATSAPP_REMINDER_DAY_OFFSETS,
    build_whatsapp_reminder_schedule,
    queue_whatsapp_reminders,
)
from services import sheets_backup
from services.media import is_data_url, make_thumb, split_media
from services.sms import build_disbursement_sms, queue_disbursement_sms_batch, send_otp_sms
import otp_store

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


# ── Private uploads ──────────────────────────────────────────────────────────
# Files are never public. A request must carry EITHER a valid session token whose organisation
# owns the file, OR a short-lived signed link (?o=<org>&e=<expiry>&s=<signature>) that the API
# attaches to every upload URL it returns (needed because <img src> cannot send headers).

import hashlib
import hmac as _hmac

import auth as _auth

UPLOAD_LINK_TTL = 3600
_UPLOAD_URL_RE = re.compile(rb'(/uploads/[A-Za-z0-9_\-./]+)(\?[A-Za-z0-9_=&.\-]*)?')


def _upload_sig(org: str, path: str, exp: int) -> str:
    return _hmac.new(_auth._SECRET.encode(), f"upload|{org}|{path}|{exp}".encode(), hashlib.sha256).hexdigest()[:40]


def sign_upload_url(url_path: str, org: str) -> str:
    """`/uploads/x/y.png` -> same path plus a signed, expiring query string for `org`."""
    path = url_path[len("/uploads/"):]
    exp = int(time.time()) + UPLOAD_LINK_TTL
    return f"{url_path}?o={org}&e={exp}&s={_upload_sig(org, path, exp)}"


def _path_belongs_to(org: str, path: str) -> bool:
    """New uploads live under <org_id>/...; legacy un-prefixed files belong to the legacy organisation."""
    first = path.split("/", 1)[0]
    if re.fullmatch(r"ORG_\d{3,}", first):
        return first == org
    return org == LEGACY_ORG_ID


@app.get("/uploads/{file_path:path}", include_in_schema=False)
def serve_upload(file_path: str, request: Request):
    org = None
    q = request.query_params
    if q.get("s") and q.get("o") and q.get("e", "").isdigit():
        if int(q["e"]) >= time.time() and _hmac.compare_digest(q["s"], _upload_sig(q["o"], file_path, int(q["e"]))):
            org = q["o"]
    if org is None:
        try:
            org = get_current_org()  # set by TenantMiddleware from a verified Bearer token
        except OrgContextError:
            raise HTTPException(status_code=401, detail="Please log in to view this file.")
    if not _path_belongs_to(org, file_path):
        raise HTTPException(status_code=404, detail="Not found")
    with as_org(org):
        stored = load_file(file_path)
    if stored:
        data, content_type = stored
        return Response(content=data, media_type=content_type,
                        headers={"Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff"})
    candidate = os.path.abspath(os.path.join(UPLOAD_DIR, file_path))
    if candidate.startswith(os.path.abspath(UPLOAD_DIR) + os.sep) and os.path.isfile(candidate):
        return FileResponse(candidate, headers={"Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff"})
    raise HTTPException(status_code=404, detail="Not found")


# The loan list is read on nearly every screen and costs a full database scan, so keep it for a few
# seconds. Any successful write clears it; the TTL covers background writes (reminders, media migration).
LOANS_CACHE_TTL = 20
_loans_cache: Dict[str, Any] = {}
_loans_cache_gen = 0


def invalidate_loans_cache():
    global _loans_cache_gen
    _loans_cache_gen += 1
    _loans_cache.clear()


def _forbidden(detail: str, status: int = 403):
    return JSONResponse(status_code=status, content={"detail": detail})


class TenantMiddleware:
    """Pure-ASGI middleware. The ONLY place the active organisation is chosen: from the verified
    session token. An organisation id supplied by the client (header or query string) is never
    used - if it disagrees with the token the request is rejected."""

    def __init__(self, app):
        self.inner = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        auth_header = headers.get("authorization", "")
        claims = decode_token(auth_header.split(" ", 1)[1].strip()) if auth_header.lower().startswith("bearer ") else None
        if claims:
            query = urllib.parse.parse_qs(scope.get("query_string", b"").decode())
            supplied = [headers.get("x-org-id", "")] + [v for k in ("org_id", "organization_id", "org") for v in query.get(k, [])]
            if any(v and v != claims["org_id"] for v in supplied):
                return await _forbidden("Organisation mismatch: the request names a different organisation than your session.")(scope, receive, send)
        token = set_current_org(claims["org_id"] if claims else None)
        try:
            await self.inner(scope, receive, send)
        finally:
            reset_current_org(token)


class UploadSigningMiddleware:
    """Adds a short-lived signed query string to every /uploads/... URL in JSON API responses,
    so the app can show private images/PDFs. Runs inside TenantMiddleware (the org is known)."""

    def __init__(self, app):
        self.inner = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            return await self.inner(scope, receive, send)
        try:
            org = get_current_org()
        except OrgContextError:
            return await self.inner(scope, receive, send)
        start, chunks = {}, []

        async def capture(message):
            if message["type"] == "http.response.start":
                start["m"] = message
                return
            if message["type"] == "http.response.body":
                chunks.append(message.get("body", b""))
                if message.get("more_body"):
                    return
                body = b"".join(chunks)
                ctype = dict(start["m"].get("headers", [])).get(b"content-type", b"")
                if b"json" in ctype and b"/uploads/" in body:
                    body = _UPLOAD_URL_RE.sub(lambda m: sign_upload_url(m.group(1).decode(), org).encode(), body)
                headers = [(k, v) for k, v in start["m"].get("headers", []) if k.lower() != b"content-length"]
                headers.append((b"content-length", str(len(body)).encode()))
                await send({**start["m"], "headers": headers})
                await send({"type": "http.response.body", "body": body})

        await self.inner(scope, receive, capture)


class BusinessMiddleware:
    """Pure-ASGI middleware: scopes every request to Finance or Fund via the X-Business header
    (a secondary filter inside the authenticated organisation)."""

    def __init__(self, app):
        self.inner = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.inner(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        token = set_current_business(headers.get("x-business"))
        mutating = scope["method"] in ("POST", "PUT", "PATCH", "DELETE") and scope["path"].startswith(
            ("/api/loans", "/api/collector/payments", "/api/payments", "/api/transactions")
        )
        writes = scope["method"] in ("POST", "PUT", "PATCH", "DELETE")
        ok = {"v": False}

        async def watch(message):
            if message["type"] == "http.response.start":
                ok["v"] = 200 <= message["status"] < 300
            await send(message)

        try:
            await self.inner(scope, receive, watch if writes else send)
            if writes and ok["v"]:
                invalidate_loans_cache()
                if mutating and sheets_backup.backup_org() == _safe_org():
                    sheets_backup.request_sync()
        finally:
            reset_current_business(token)


def _safe_org():
    try:
        return get_current_org()
    except OrgContextError:
        return None


class SubscriptionMiddleware:
    """Read-only mode, enforced on the server for EVERY write.

    When an organisation's trial or subscription has ended, any POST/PUT/PATCH/DELETE under /api/ is refused
    (HTTP 402) - GETs keep working so records, reports and exports stay viewable. It is deny-by-default: a new
    write endpoint is blocked in read-only mode unless it is listed here. Runs inside TenantMiddleware (the
    organisation comes from the verified token) and outside the business/upload middlewares."""

    WRITES = ("POST", "PUT", "PATCH", "DELETE")
    # login/OTP/organisation selection, subscription checkout + renewal, the payment webhook, platform admin,
    # and leaving / deleting your own account must keep working when the subscription has ended.
    ALWAYS_ALLOWED = ("/api/auth/", "/api/organizations/", "/api/subscriptions/", "/api/webhooks/",
                      "/api/platform/", "/api/account/")

    def __init__(self, app):
        self.inner = app

    @classmethod
    def _exempt_path(cls, method: str, path: str) -> bool:
        if path.startswith("/api/organizations/join-requests/") and path.endswith("/approve"):
            return False                                                       # adding a person is a write
        return (path.startswith(cls.ALWAYS_ALLOWED)
                or path == "/api/admin/sheet-backup/sync"                      # a backup, not a financial write
                or (method == "DELETE" and path.startswith("/api/staff/")))    # removing someone's access is always allowed

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["method"] in self.WRITES and scope["path"].startswith("/api/") \
                and not self._exempt_path(scope["method"], scope["path"]):
            org = _safe_org()
            if org:
                access = await run_in_threadpool(subscriptions.access_for_org, org)
                if access["read_only"]:
                    resp = JSONResponse(status_code=402, content={
                        "detail": subscriptions.read_only_message(access["state"]),
                        "code": "subscription_read_only", "state": access["state"]})
                    return await resp(scope, receive, send)
        await self.inner(scope, receive, send)


app.add_middleware(UploadSigningMiddleware)
app.add_middleware(BusinessMiddleware)
app.add_middleware(SubscriptionMiddleware)
app.add_middleware(TenantMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.on_event("startup")
def on_startup():
    if _env_flag("OTP_DEV_MODE") and os.environ.get("ENVIRONMENT", "").lower() == "production":
        raise RuntimeError("OTP_DEV_MODE must be false when ENVIRONMENT=production (it returns OTPs to the caller).")
    init_db()
    subscriptions.sync_plans()  # mirror the configured plan prices into the database (no organisation data touched)
    identity.seed_legacy_org()  # idempotent: gives every existing admin/collector a membership in ORG_001
    sheets_backup.request_sync()  # fill/refresh the Google Sheet backup shortly after every start
    print(f"DigiVasool API ready — storage={get_backend_name()} otp_dev_mode={OTP_DEV_MODE}")


@app.exception_handler(SubscriptionError)
async def subscription_error_handler(request: Request, exc: SubscriptionError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.detail, "code": exc.code})


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
    return datetime.now(timezone.utc).isoformat()


# ==============================
# AUTH
# ==============================

def get_current_user(authorization: Optional[str] = Header(default=None)):
    """Identify the caller from the signed, organisation-scoped session token. Also re-checks that the
    membership and organisation are still active, so removing a collector takes effect immediately."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Please log in to continue.")
    data = decode_token(authorization.split(" ", 1)[1].strip())
    if not data:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    if data["org_id"] != _safe_org():  # the middleware sets the org from this same token
        raise HTTPException(status_code=403, detail="Organisation mismatch")
    state = identity.membership_state(data)
    if state is None:
        raise HTTPException(status_code=401, detail="Your access has been removed or your session ended. Please log in again.")
    return {
        "merchant_id": data["org_id"],
        "org_id": data["org_id"],
        "membership_id": data.get("membership_id", ""),
        "member_role": state["role"],   # from the database, not the token
        "role": data.get("role", ""),
        "name": data.get("name", ""),
        "phone": data.get("phone_number", ""),
        "iat": data.get("iat", 0),
    }


def require_admin(user=Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def require_owner(user=Depends(get_current_user)):
    if user["member_role"] != identity.OWNER:
        raise HTTPException(status_code=403, detail="Only the organisation owner can do this")
    return user


def require_platform_admin(user=Depends(get_current_user)):
    """DigiVasool operators only (PLATFORM_ADMIN_PHONES, separate from the exempt numbers). The phone in the
    session was verified by OTP; an organisation Owner/Admin is NOT a platform admin."""
    if not subscriptions.is_platform_admin(user["phone"]):
        raise HTTPException(status_code=403, detail="Platform administrator access required")
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
    db = get_db_client()
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
    """Profile rows (email, monthly target) added from the Staff screen for the active book."""
    rows = []
    for doc in get_db_client().collection("staff").get():
        s = doc.to_dict()
        s.setdefault("id", doc.id)
        if s.get("is_active", True) and (role is None or s.get("role") == role):
            rows.append(s)
    return rows


def _people(roles) -> List[Dict[str, Any]]:
    """People of the CURRENT organisation, from its memberships (the database, not environment variables)."""
    return [{"name": m["name"], "phone": m.get("phone", ""), "email": ""}
            for m in identity.org_memberships(get_current_org()) if m["role"] in roles]


def _all_admins() -> List[Dict[str, Any]]:
    return _people((identity.OWNER, identity.ADMIN))


def _all_collectors() -> List[Dict[str, Any]]:
    return _people((identity.COLLECTOR,))


def _is_archived(loan: Dict[str, Any]) -> bool:
    return bool(loan.get("is_deleted")) or loan.get("status") in {"deleted", "merged"}


def _borrower_loans_for_phone(phone: str) -> List[Dict[str, Any]]:
    target = normalize_phone(phone)
    if not target:
        return []
    matches = []
    for doc in get_db_client().collection("loans").get():
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


MAX_COLLECTORS_PER_BORROWER = 3


def _clean_collectors(names: Optional[List[str]], required: bool = False) -> List[str]:
    """Validate a borrower's collector assignment: known collectors only, no repeats, at most 3."""
    known = {c["name"].strip().lower(): c["name"] for c in _all_collectors()}
    cleaned: List[str] = []
    for raw in names or []:
        key = (raw or "").strip().lower()
        if not key:
            continue
        if key not in known:
            raise HTTPException(status_code=400, detail=f"'{raw}' is not a registered collector")
        if known[key] not in cleaned:
            cleaned.append(known[key])
    if len(cleaned) > MAX_COLLECTORS_PER_BORROWER:
        raise HTTPException(status_code=400, detail=f"At most {MAX_COLLECTORS_PER_BORROWER} collectors can be assigned to a borrower")
    if required and not cleaned:
        raise HTTPException(status_code=400, detail="Assign at least one collector to this borrower")
    return sorted(cleaned, key=str.lower)


def _is_assigned(loan: Dict[str, Any], user: Dict[str, Any]) -> bool:
    mine = (user.get("name") or "").strip().lower()
    return mine in {(n or "").strip().lower() for n in loan.get("assigned_collectors") or []}


def _assert_collector_assigned(user: Dict[str, Any], loan: Dict[str, Any]):
    if user["role"] == "collector" and not _is_assigned(loan, user):
        raise HTTPException(status_code=403, detail="This borrower is not assigned to you")


def _otp_key(purpose: str, contact: str) -> str:
    return f"{purpose}:{normalize_phone(contact) or contact.strip().lower()}"


def _otp_response(otp: str, contact: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    send_otp_sms(contact, otp)
    body = {"status": "otp_sent", "message": "OTP sent", "dev_mode": OTP_DEV_MODE}
    if OTP_DEV_MODE:
        body["dev_otp"] = otp
    if extra:
        body.update(extra)
    return body


# ==============================
# OTP LOGIN, ORGANISATIONS & MEMBERSHIPS
# ==============================
# Phone -> OTP -> (one organisation: straight in | several: choose | none: register a new organisation).
# The session token is organisation-scoped; the organisation is only ever taken from it.

def _org_summary(m: Dict[str, Any]) -> Dict[str, Any]:
    return {"organization_id": m["org_id"], "organization_name": m["organization_name"],
            "role": m["role"], "name": m.get("name", "")}


def _login_response(member: Dict[str, Any], phone: str) -> Dict[str, Any]:
    """Issue the org-scoped session for one verified membership."""
    role = identity.app_role(member["role"])
    org_id = member["org_id"]
    name = member.get("name") or "User"
    token = issue_token(role, name, phone, org_id=org_id, membership_id=member["id"],
                        user_id=f"u_{identity.phone_key(phone)}", member_role=member["role"])
    with as_org(org_id):
        _write_audit(name, "LOGIN", f"{member['role'].title()} logged in")
    out = {"status": "ok", "role": role, "member_role": member["role"], "name": name, "phone": phone,
           "token": token, "organization": {"id": org_id, "name": member["organization_name"]}}
    if role == "borrower":
        out["business"] = member.get("business", "finance")
    return out


def _matching_member(phone: str, organization_id: str, role: Optional[str]) -> Dict[str, Any]:
    """Backend membership check: the phone must really belong to that organisation (and role)."""
    matches = [m for m in identity.all_memberships_for_phone(phone) if m["org_id"] == organization_id
               and (not role or m["role"] == role.upper())]
    if not matches:
        raise HTTPException(status_code=403, detail="You are not a member of that organisation.")
    if len(matches) > 1:
        raise HTTPException(status_code=400, detail="Choose which role to continue as.")
    return matches[0]


def _client_ip(request: Request) -> str:
    """The caller's IP for rate limiting. Behind a reverse proxy (Render) the socket address is the proxy's, which
    would make every user share one limit. TRUSTED_PROXY_HOPS=N (default 0 = use the socket address) takes the N-th
    entry from the RIGHT of X-Forwarded-For, i.e. the one added by your own proxy, which a client cannot forge."""
    peer = request.client.host if request.client else "?"
    try:
        hops = int(os.environ.get("TRUSTED_PROXY_HOPS", "0") or 0)
    except ValueError:
        hops = 0
    if hops > 0:
        parts = [p.strip() for p in request.headers.get("x-forwarded-for", "").split(",") if p.strip()]
        if len(parts) >= hops:
            return parts[-hops]
    return peer


@app.post("/api/auth/request-otp")
async def request_otp(body: OTPRequest, request: Request):
    """Step 1: send an OTP to any valid mobile number (an unknown number may register a new organisation)."""
    contact = body.contact.strip()
    if len(normalize_phone(contact)) != 10:
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number.")
    ip = _client_ip(request)
    if not (otp_store.allow(f"otp-phone:{normalize_phone(contact)}", 5) and otp_store.allow(f"otp-ip:{ip}", 150)):
        raise HTTPException(status_code=429, detail="Too many OTP requests. Please wait a few minutes and try again.")
    otp = otp_store.generate_and_store(_otp_key("login", contact))
    return _otp_response(otp, contact)


@app.post("/api/auth/verify-otp")
async def verify_otp(body: OTPVerify, request: Request):
    """Step 2: verify the OTP. Returns a session (one membership), an organisation choice (several),
    or a registration token (none)."""
    contact = body.contact.strip()
    ip = _client_ip(request)
    if not otp_store.allow(f"verify-ip:{ip}", 300):
        raise HTTPException(status_code=429, detail="Too many attempts. Please wait a few minutes.")
    if not otp_store.verify(_otp_key("login", contact), body.otp):
        raise HTTPException(status_code=401, detail="Wrong or expired OTP. Please try again.")
    members = identity.all_memberships_for_phone(contact)
    pending = identity.pending_join_requests_for_phone(contact)    # asked to join somewhere, waiting for approval
    if not members:
        return {"status": "register", "registration_token": issue_short_token("register", contact),
                "pending_requests": pending}
    if len(members) == 1:
        return _login_response(members[0], contact)
    return {"status": "select_org", "selection_token": issue_short_token("select", contact),
            "organizations": [_org_summary(m) for m in members], "pending_requests": pending}


@app.post("/api/organizations/select")
async def select_organization(body: SelectOrgRequest):
    """Choose one of the organisations the verified phone belongs to (membership re-checked here)."""
    claims = decode_token(body.selection_token, "select")
    if not claims:
        raise HTTPException(status_code=401, detail="This step expired. Please log in again.")
    phone = claims["phone_number"]
    return _login_response(_matching_member(phone, body.organization_id, body.role), phone)


@app.post("/api/organizations/register")
async def register_organization(body: RegisterOrgRequest):
    """Create a new organisation; the verified phone becomes its OWNER (first admin)."""
    claims = decode_token(body.registration_token, "register") or decode_token(body.registration_token, "select")
    if not claims:
        raise HTTPException(status_code=401, detail="This step expired. Please verify your number again.")
    phone = claims["phone_number"]
    if not identity.consume_token(claims):      # one verified phone = one registration (no replaying the token)
        raise HTTPException(status_code=401, detail="This step was already used. Please verify your number again.")
    try:
        org = identity.create_org(body.organization_name, phone, body.admin_name)
    except ValueError as e:
        identity.release_token(claims)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        identity.release_token(claims)           # nothing was created (create_org rolls back): let them retry
        raise
    member = identity.get_membership(identity.membership_id(org["id"], phone))
    return _login_response({**member, "organization_name": org["organization_name"]}, phone)


@app.post("/api/organizations/join-request")
async def request_to_join(body: JoinRequestCreate):
    """A verified phone asks to join an existing organisation. It gets NO access: an admin/owner of that
    organisation must approve it first (they see it under Notifications)."""
    claims = decode_token(body.registration_token, "register") or decode_token(body.registration_token, "select")
    if not claims:
        raise HTTPException(status_code=401, detail="This step expired. Please verify your number again.")
    phone = claims["phone_number"]
    if not otp_store.allow(f"join:{normalize_phone(phone)}", 5, 3600):
        raise HTTPException(status_code=429, detail="Too many requests. Please try again later.")
    try:
        req = identity.create_join_request(body.organization_code.strip().upper(), phone, body.name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "pending", "organization_name": req["organization_name"],
            "message": f"Your request was sent to {req['organization_name']}. You can sign in once an admin approves it."}


@app.get("/api/organizations/join-requests")
async def list_join_requests(user=Depends(require_admin)):
    """People waiting for approval to join YOUR organisation."""
    return [{"id": r["id"], "name": r["name"], "phone": r["phone"], "requested_at": r["requested_at"]}
            for r in identity.pending_join_requests(user["org_id"])]


@app.post("/api/organizations/join-requests/{request_id}/approve")
async def approve_join_request(request_id: str, body: JoinRequestApprove, user=Depends(require_admin)):
    """Approve as a collector (any admin) or as an admin (owner only). Creates the normal membership."""
    role = identity.ADMIN if body.role == "admin" else identity.COLLECTOR
    _assert_can_manage(user, role)
    req = identity.get_join_request(user["org_id"], request_id)
    if not req or req.get("status") != "pending":
        raise HTTPException(status_code=404, detail="Request not found")
    name = (body.name or req["name"]).strip()
    if role == identity.COLLECTOR and any(p["name"].strip().lower() == name.lower() for p in _all_collectors()):
        raise HTTPException(status_code=400, detail="A collector with this name already exists. Give them a different name.")
    try:
        member = identity.resolve_join_request(user["org_id"], request_id, True, user["name"], role, name)
    except KeyError:
        raise HTTPException(status_code=404, detail="Request not found")
    get_db_client().collection("staff").document(member["id"]).set({
        "id": member["id"], "name": name, "role": body.role, "phone": req["phone"], "email": "", "target": 0,
        "is_active": True, "created_at": _now(), "created_by": user["name"]})
    identity.clear_cache()
    _write_audit(user["name"], "JOIN_APPROVED", f"Approved {name} ({req['phone']}) as {body.role}")
    return {"status": "approved", "role": body.role}


@app.post("/api/organizations/join-requests/{request_id}/deny")
async def deny_join_request(request_id: str, user=Depends(require_admin)):
    try:
        req = identity.resolve_join_request(user["org_id"], request_id, False, user["name"])
    except KeyError:
        raise HTTPException(status_code=404, detail="Request not found")
    _write_audit(user["name"], "JOIN_DENIED", f"Denied {req['name']} ({req['phone']})")
    return {"status": "denied"}


@app.get("/api/organizations/my-memberships")
async def my_memberships(user=Depends(get_current_user)):
    """Every organisation this phone belongs to (powers the Switch organisation screen)."""
    return [{**_org_summary(m), "current": m["org_id"] == user["org_id"] and identity.app_role(m["role"]) == user["role"]}
            for m in identity.all_memberships_for_phone(user["phone"])]


@app.post("/api/organizations/switch")
async def switch_organization(body: SwitchOrgRequest, user=Depends(get_current_user)):
    """Move to another organisation you belong to - verified on the server from your session's phone."""
    return _login_response(_matching_member(user["phone"], body.organization_id, body.role), user["phone"])


@app.get("/api/organizations/current")
async def current_organization(user=Depends(get_current_user)):
    org = identity.get_org(user["org_id"]) or {}
    return {"id": user["org_id"], "organization_name": org.get("organization_name", ""),
            "status": org.get("status", ""), "role": user["role"], "member_role": user["member_role"],
            "name": user["name"], "phone": user["phone"]}


@app.post("/api/auth/refresh")
async def refresh_session(user=Depends(get_current_user)):
    """Swap a still-valid session for a fresh one (sliding expiry); membership is re-verified."""
    member = _matching_member(user["phone"], user["org_id"], user["member_role"])
    org = identity.get_org(user["org_id"]) or {}
    return _login_response({**member, "organization_name": org.get("organization_name", "")}, user["phone"])


@app.post("/api/auth/logout")
async def logout(user=Depends(get_current_user)):
    """End this membership's sessions on the server (every device signed in as it)."""
    if user["role"] != "borrower" and user["membership_id"]:
        identity.revoke_sessions(user["membership_id"])
        identity.clear_cache()
    _write_audit(user["name"], "LOGOUT", "Logged out")
    return {"status": "ok"}


@app.post("/api/organizations/request-deletion")
async def request_organization_deletion(user=Depends(require_owner)):
    """Owner asks for the organisation to be deleted. Nothing is erased: the organisation is locked
    (nobody can log in) and the operator completes the deletion after the retention period."""
    identity.set_org_status(user["org_id"], "deletion_requested")
    _write_audit(user["name"], "ORG_DELETION_REQUESTED", "Organisation locked pending deletion")
    return {"status": "deletion_requested",
            "message": "Your organisation is locked. Contact support to restore it within 30 days, after which its data is erased."}


@app.post("/api/account/delete")
async def delete_my_account(user=Depends(get_current_user)):
    """Remove YOUR access to this organisation (Play Store account-deletion path). The owner must
    transfer ownership or delete the organisation instead. Business records are kept (they belong to the organisation)."""
    if user["member_role"] == identity.OWNER:
        raise HTTPException(status_code=400, detail="You are the owner. Delete the organisation instead, or make someone else the owner first.")
    if user["role"] == "borrower":
        raise HTTPException(status_code=400, detail="Borrower records belong to the lender. Ask them to remove your data.")
    identity.update_membership(user["membership_id"], status="inactive", removed_at=_now(), removed_by="self")
    identity.clear_cache()
    _write_audit(user["name"], "ACCOUNT_DELETED", "Member removed their own access")
    return {"status": "ok"}


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
    if get_current_business() != "finance":  # other books' uploads are stored apart from Finance
        folder = f"{get_current_business()}/{folder}"
    folder = f"{get_current_org()}/{folder}"  # every upload lives under its organisation
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File is too large (maximum 10 MB)")
    content_type = file.content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
    if save_file(f"{folder}/{filename}", data, content_type):
        return f"/uploads/{folder}/{filename}"
    target_dir = os.path.join(UPLOAD_DIR, folder)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "wb") as buffer:
        buffer.write(data)
    return f"/uploads/{folder}/{filename}"


@app.post("/api/loans/upload-proof")
async def upload_proof(loan_id: str, file: UploadFile = File(...), user=Depends(require_role("admin", "collector"))):
    """Upload a proof document for a loan/user."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", loan_id or ""):
        raise HTTPException(status_code=400, detail="Invalid loan id")
    if file.content_type not in ALLOWED_PROOF_TYPES:
        raise HTTPException(status_code=400, detail="Only image or PDF files are allowed")
    url = _save_upload(file, loan_id)
    _write_audit(user["name"], "UPLOAD_PROOF", f"Document uploaded for loan {loan_id}: {os.path.basename(url)}")
    return {"status": "success", "file_path": url}


@app.post("/api/payments/{payment_id}/proof")
async def upload_payment_proof(payment_id: str, file: UploadFile = File(...), user=Depends(require_role("admin", "collector"))):
    """Attach a proof image/PDF (e.g. a GPay screenshot the borrower shared) to a specific payment."""
    db = get_db_client()
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
# BOOKS (Finance, Fund, and any admin-created book)
# ==============================

@app.get("/api/books")
async def get_books(user=Depends(require_role("admin", "collector"))):
    return list_books()


@app.get("/api/reports/export.xlsx")
def export_excel(user=Depends(require_admin)):
    from fastapi.responses import Response
    data = sheets_backup.export_workbook_bytes()
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="digivasool-report.xlsx"'},
    )


@app.get("/api/admin/sheet-backup")
def sheet_backup_status(user=Depends(require_admin)):
    return {**sheets_backup.status(), "enabled": sheets_backup.is_enabled() and sheets_backup.backup_org() == user["org_id"]}


@app.post("/api/admin/sheet-backup/sync")
def sheet_backup_sync(force: bool = False, user=Depends(require_admin)):
    """Rewrite the Google Sheet from the database right now."""
    if not sheets_backup.is_enabled() or sheets_backup.backup_org() != user["org_id"]:
        raise HTTPException(status_code=400, detail="Google Sheets backup is not configured for your organisation")
    return sheets_backup.sync_now(force=force)


@app.post("/api/books")
async def add_book(body: dict, user=Depends(require_admin)):
    try:
        book = create_book(body.get("name", ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _write_audit(user["name"], "BOOK_CREATED", f"Created book {book['name']}")
    return book


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
    # A collector only ever sees their own numbers, never other collectors' totals or the organisation ledger.
    return DashboardSummaryResponse(**get_dashboard_summary_db(user["name"] if user["role"] == "collector" else None))


@app.get("/api/admin/lendings/", response_model=List[AdminLendingRecord])
async def get_admin_lending_view(admin_user=Depends(require_admin)):
    """Admin-only lending view with interest rate and reminder schedules."""
    return [AdminLendingRecord(**row) for row in get_admin_lendings_db()]


@app.get("/api/collectors/")
async def get_collectors(user=Depends(require_role("admin", "collector"))):
    """Collector names in your organisation (phone numbers are not exposed)."""
    return sorted(({"name": c["name"]} for c in _all_collectors()), key=lambda c: c["name"].lower())


@app.get("/api/admin/audit-log")
async def get_audit_log(limit: int = 30, user=Depends(require_admin)):
    """Most recent audit entries (who did what, when)."""
    rows = [d.to_dict() for d in get_db_client().collection("audit_log").get()]
    rows.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    return rows[: max(1, min(limit, 200))]


# ==============================
# STAFF, EXPENSES & CAPITAL
# ==============================

def _profile_for(m: Dict[str, Any], profiles: List[Dict[str, Any]]) -> Dict[str, Any]:
    key = identity.phone_key(m.get("phone", ""))
    return next((p for p in profiles if p.get("id") == m["id"] or (key and identity.phone_key(p.get("phone", "")) == key)), {})


def _staff_row(m: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": m["id"], "name": m["name"], "role": identity.app_role(m["role"]), "member_role": m["role"],
            "phone": m.get("phone", ""), "email": profile.get("email", ""), "target": profile.get("target", 0),
            "created_at": m.get("created_at", ""), "source": "app"}


@app.get("/api/staff/")
def list_staff(user=Depends(require_admin)):
    """Everyone in YOUR organisation: owner, admins, collectors (from memberships) plus profile-only managers."""
    profiles = _staff_members()
    rows = [_staff_row(m, _profile_for(m, profiles)) for m in identity.org_memberships(get_current_org())]
    rows.sort(key=lambda r: ({"OWNER": 0, "ADMIN": 1, "COLLECTOR": 2}[r["member_role"]], r.get("created_at", "")))
    managers = [{**p, "member_role": "MANAGER", "source": "app"} for p in profiles if p.get("role") == "manager"]
    return rows + sorted(managers, key=lambda s: s.get("created_at", ""))


def _member_in_org(staff_id: str) -> Optional[Dict[str, Any]]:
    m = identity.get_membership(staff_id)
    return m if m and m.get("org_id") == get_current_org() and m.get("status") == "active" else None


def _assert_can_manage(user: Dict[str, Any], target_role: str):
    """Owners manage everyone; admins manage collectors only."""
    if user["member_role"] != identity.OWNER and target_role in (identity.OWNER, identity.ADMIN):
        raise HTTPException(status_code=403, detail="Only the organisation owner can add, edit or remove admins")


@app.post("/api/staff/")
async def create_staff(body: StaffCreate, user=Depends(require_admin)):
    phone = body.phone or ""
    role = {"admin": identity.ADMIN, "collector": identity.COLLECTOR}.get(body.role)
    record = {"id": str(uuid4()), "name": body.name.strip(), "role": body.role, "phone": phone,
              "email": (body.email or "").strip(), "target": body.target, "is_active": True,
              "created_at": _now(), "created_by": user["name"]}
    if role is None:  # "manager": a profile entry only - managers have never had a login
        get_db_client().collection("staff").document(record["id"]).set(record)
        _write_audit(user["name"], "STAFF_ADDED", f"Added manager {record['name']}")
        return {**record, "member_role": "MANAGER", "source": "app"}
    _assert_can_manage(user, role)
    if not identity.phone_key(phone):
        raise HTTPException(status_code=400, detail="A phone number is required - they log in with it")
    existing = identity.get_membership(identity.membership_id(get_current_org(), phone))
    if existing and existing.get("status") == "active":
        raise HTTPException(status_code=400, detail="A staff member with this phone number already exists")
    member = identity.add_membership(get_current_org(), phone, record["name"], role, created_by=user["name"])
    get_db_client().collection("staff").document(member["id"]).set({**record, "id": member["id"]})
    _write_audit(user["name"], "STAFF_ADDED", f"Added {body.role} {record['name']}")
    return {**_staff_row(member, record)}


@app.patch("/api/staff/{staff_id}")
async def update_staff(staff_id: str, body: StaffUpdate, user=Depends(require_admin)):
    """Edit a staff member. Renaming a collector moves their borrower assignments to the new name."""
    with db_lock:
        member = _member_in_org(staff_id)
        updates = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
        if "name" in updates:
            updates["name"] = updates["name"].strip()
        if member is None:  # profile-only manager
            ref = get_db_client().collection("staff").document(staff_id)
            doc = ref.get()
            if not doc.exists or not doc.to_dict().get("is_active", True):
                raise HTTPException(status_code=404, detail="Staff member not found")
            ref.update({**updates, "updated_at": _now(), "updated_by": user["name"]})
            return {**doc.to_dict(), **updates, "member_role": "MANAGER", "source": "app"}
        if member["id"] != user["membership_id"]:
            _assert_can_manage(user, member["role"])
        old_name, new_name = member["name"], updates.get("name", member["name"])
        renamed = member["role"] == identity.COLLECTOR and new_name != old_name
        if renamed and any(p["name"].strip().lower() == new_name.lower() for p in _all_collectors() if p["name"] != old_name):
            raise HTTPException(status_code=400, detail="Another collector already has this name")
        new_phone = updates.get("phone")
        if new_phone and identity.phone_key(new_phone) != identity.phone_key(member["phone"]):
            clash = identity.get_membership(identity.membership_id(get_current_org(), new_phone))
            if clash and clash.get("status") == "active":
                raise HTTPException(status_code=400, detail="A staff member with this phone number already exists")
            if member["id"] == user["membership_id"]:
                raise HTTPException(status_code=400, detail="Change your own phone number by asking the owner to add the new number")
            moved = identity.add_membership(get_current_org(), new_phone, new_name, member["role"], created_by=user["name"])
            identity.update_membership(member["id"], status="inactive", removed_at=_now(), removed_by=user["name"])
            member = moved
        else:
            identity.update_membership(member["id"], name=new_name)
            member = {**member, "name": new_name}
        identity.clear_cache()
        profile = {"id": member["id"], "role": "admin" if member["role"] != identity.COLLECTOR else "collector", "is_active": True,
                   "name": new_name, "phone": member.get("phone", ""), "email": updates.get("email", ""),
                   "target": updates.get("target", 0), "updated_at": _now(), "updated_by": user["name"]}
        get_db_client().collection("staff").document(member["id"]).set(profile, merge=True)
        if renamed:
            for loan_doc in get_db_client().collection("loans").get():
                names = loan_doc.to_dict().get("assigned_collectors") or []
                if old_name in names:
                    loan_doc.reference.update({"assigned_collectors": sorted({new_name if n == old_name else n for n in names}, key=str.lower)})
    _write_audit(user["name"], "STAFF_UPDATED", f"Updated {member['role'].lower()} {old_name}" + (f" (now {new_name})" if renamed else ""))
    return _staff_row({**member, "name": new_name}, profile)


@app.delete("/api/staff/{staff_id}")
async def delete_staff(staff_id: str, user=Depends(require_admin)):
    """Remove someone's access. A collector who is the only one on a borrower can't be removed until that borrower is reassigned."""
    with db_lock:
        member = _member_in_org(staff_id)
        if member is None:  # profile-only manager
            ref = get_db_client().collection("staff").document(staff_id)
            doc = ref.get()
            if not doc.exists or not doc.to_dict().get("is_active", True):
                raise HTTPException(status_code=404, detail="Staff member not found")
            ref.update({"is_active": False, "deleted_at": _now(), "deleted_by": user["name"]})
            return {"status": "success", "message": "Staff member removed"}
        if member["id"] == user["membership_id"]:
            raise HTTPException(status_code=400, detail="You can't remove your own account")
        if member["role"] == identity.OWNER:
            raise HTTPException(status_code=400, detail="The owner can't be removed. Transfer ownership first.")
        _assert_can_manage(user, member["role"])
        name_key = member["name"].strip().lower()
        if member["role"] == identity.COLLECTOR:
            affected = [(d, d.to_dict().get("assigned_collectors") or []) for d in get_db_client().collection("loans").get()]
            affected = [(d, names) for d, names in affected if any((n or "").strip().lower() == name_key for n in names)]
            stuck = [d.to_dict().get("customer_name", d.id) for d, names in affected if len(names) == 1]
            if stuck:
                shown = ", ".join(stuck[:3]) + (f" and {len(stuck) - 3} more" if len(stuck) > 3 else "")
                raise HTTPException(status_code=400, detail=f"Reassign these borrowers to another collector first: {shown}")
            for loan_doc, names in affected:
                loan_doc.reference.update({"assigned_collectors": [n for n in names if (n or "").strip().lower() != name_key]})
        identity.update_membership(member["id"], status="inactive", removed_at=_now(), removed_by=user["name"])
        identity.revoke_sessions(member["id"])
        identity.clear_cache()
        pref = get_db_client().collection("staff").document(member["id"])
        if pref.get().exists:
            pref.update({"is_active": False, "deleted_at": _now(), "deleted_by": user["name"]})
    _write_audit(user["name"], "STAFF_DELETED", f"Removed {member['role'].lower()} {member['name']}")
    return {"status": "success", "message": "Staff member removed"}


@app.post("/api/staff/{staff_id}/make-owner")
async def transfer_ownership(staff_id: str, confirm_exemption_loss: bool = False, user=Depends(require_owner)):
    """Owner hands ownership to another ADMIN of the organisation (the previous owner becomes an admin).
    A lifetime-free organisation can only go to a non-exempt number if the owner confirms that its free access ends."""
    target = _member_in_org(staff_id)
    if target is None or target["role"] != identity.ADMIN:
        raise HTTPException(status_code=400, detail="Ownership can only be given to one of your admins")
    subscriptions.check_ownership_transfer(user["org_id"], target.get("phone", ""), confirm_exemption_loss)
    identity.update_membership(target["id"], role=identity.OWNER)
    identity.update_membership(user["membership_id"], role=identity.ADMIN)
    identity.clear_cache()
    subscriptions.on_ownership_transferred(user["org_id"], target.get("phone", ""), actor=user["name"])
    _write_audit(user["name"], "OWNERSHIP_TRANSFERRED", f"Ownership given to {target['name']}")
    return {"status": "ok", "message": f"{target['name']} is now the owner. Sign in again to refresh your permissions."}


def _list_collection(name: str, sort_field: str) -> List[Dict[str, Any]]:
    rows = []
    for doc in get_db_client().collection(name).get():
        r = doc.to_dict()
        r.setdefault("id", doc.id)
        rows.append(r)
    return sorted(rows, key=lambda r: (r.get(sort_field) or "", r.get("created_at") or ""), reverse=True)


@app.get("/api/expenses/")
def list_expenses(user=Depends(require_admin)):
    return _list_collection("expenses", "date")


@app.post("/api/expenses/")
async def create_expense(body: ExpenseCreate, user=Depends(require_admin)):
    record = {"id": str(uuid4()), **body.model_dump(), "created_at": _now(), "created_by": user["name"]}
    get_db_client().collection("expenses").document(record["id"]).set(record)
    _write_audit(user["name"], "EXPENSE_ADDED", f"₹{body.amount} {body.category}")
    return record


@app.get("/api/capital/")
def list_capital(user=Depends(require_admin)):
    return _list_collection("capital", "date")


@app.post("/api/capital/")
async def create_capital(body: CapitalCreate, user=Depends(require_admin)):
    record = {"id": str(uuid4()), **body.model_dump(), "created_at": _now(), "created_by": user["name"]}
    get_db_client().collection("capital").document(record["id"]).set(record)
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
    l.setdefault("assigned_collectors", [])
    for key in ("alternate_phone", "shop_name", "zone", "aadhaar_number", "photo_url", "signature_url",
                "guarantor_name", "guarantor_phone", "guarantor_address"):
        l.setdefault(key, "")
    if "monthly_interest_amount" not in l:
        l["monthly_interest_amount"] = l.pop("interest_document", 0.0)
    l.setdefault("field_visit_charge", 0.0)
    l.setdefault("document_fee", 0.0)
    l.setdefault("processing_fee", 0.0)
    l.setdefault("preferred_language", "en")
    l.setdefault("created_at", "")
    # Full base64 images live in `loan_media`; never ship them with the loan itself.
    for key, flag in (("photo_url", "has_photo"), ("signature_url", "has_signature")):
        if is_data_url(l.get(key)):
            l[key] = ""
            l[flag] = True
    l["reminder_schedule"] = reminders or []
    return LoanRecord(**l)


_migrating: set = set()
_migrating_lock = threading.Lock()


def _migrate_loan_media(org: str, business: str, loan_ids: List[str]):
    """One-time move of legacy inline base64 photos/signatures into `loan_media` (+ a small thumbnail)."""
    with as_org(org):
        _migrate_loan_media_in_org(org, business, loan_ids)


def _migrate_loan_media_in_org(org: str, business: str, loan_ids: List[str]):
    db = get_db_client(business)
    for loan_id in loan_ids:
        try:
            with db_lock:
                ref = db.collection("loans").document(loan_id)
                doc = ref.get()
                if not doc.exists:
                    continue
                loan = doc.to_dict()
                if not (is_data_url(loan.get("photo_url")) or is_data_url(loan.get("signature_url"))):
                    continue
                fields, media = split_media({k: loan[k] for k in ("photo_url", "signature_url") if is_data_url(loan.get(k))})
                db.collection("loan_media").document(loan_id).set(
                    {k: v for k, v in media.items() if v}, merge=True)
                ref.update(fields)
        except Exception:
            logging.getLogger(__name__).exception("Could not migrate media for loan %s", loan_id)
        finally:
            with _migrating_lock:
                _migrating.discard((org, business, loan_id))


def _schedule_media_migration(background_tasks: BackgroundTasks, legacy_ids: List[str]):
    org, business = get_current_org(), get_current_business()
    with _migrating_lock:
        fresh = [i for i in legacy_ids if (org, business, i) not in _migrating]
        _migrating.update((org, business, i) for i in fresh)
    if fresh:
        background_tasks.add_task(_migrate_loan_media, org, business, fresh)


def _loans_out_from_docs(docs, reminders) -> tuple:
    """Build LoanRecords from loan docs. Returns (records, ids of legacy docs still holding inline images)."""
    db = get_db_client()
    loans, legacy = [], []
    for doc in docs:
        l = doc.to_dict()
        if _is_archived(l):
            continue
        if is_data_url(l.get("photo_url")) or is_data_url(l.get("signature_url")):
            legacy.append(doc.id)
        if not l.get("account_number"):
            with db_lock:
                l["account_number"] = _generate_unique_account_number(db)
                doc.reference.update({"account_number": l["account_number"]})
        loans.append(_loan_out(l, doc.id, reminders.get(l.get("id", doc.id))))
    return loans, legacy


def _reminders_by_loan() -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for doc in get_db_client().collection("reminders").get():
        r = doc.to_dict()
        grouped.setdefault(r.get("transaction_id"), []).append(r)
    return grouped


def _get_loan_or_404(loan_id: str):
    ref = get_db_client().collection("loans").document(loan_id)
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
    if not loan.terms_accepted:
        raise HTTPException(status_code=400, detail="Borrower must accept the terms and conditions")
    if not loan.start_date:
        raise HTTPException(status_code=400, detail="Start date is required")
    if not loan.closing_date:
        raise HTTPException(status_code=400, detail="Closing date is required")
    if loan.closing_date < loan.start_date:
        raise HTTPException(status_code=400, detail="Due date cannot be before the start date")
    assigned_collectors = _clean_collectors(loan.assigned_collectors, required=True)

    with db_lock:
        if idempotency_key:
            cached = get_idempotent_response("loan", idempotency_key)
            if cached:
                return cached
        try:
            db = get_db_client()
            loan_id = str(uuid4())
            create_time = datetime.now(timezone.utc)
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
                "signature_url": loan.signature_url or "",
                "terms_accepted": True,
                "terms_accepted_at": _now(),
                "zone": loan.zone or "",
                "guarantor_name": loan.guarantor_name or "",
                "guarantor_phone": loan.guarantor_phone or "",
                "guarantor_address": loan.guarantor_address or "",
                "account_number": account_number,
                "preferred_language": loan.preferred_language,
                "assigned_collectors": assigned_collectors,
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

            record, media = split_media(record)
            if media.get("photo_url") or media.get("signature_url"):
                db.collection("loan_media").document(loan_id).set({k: v for k, v in media.items() if v})
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
            # Copy to the admin who created the loan, queued at the same time as the borrower's SMS
            admin_phone = (user or {}).get("phone") or ""
            admin_message = f"[Admin copy - {loan.customer_name}] {sms_message}"
            admin_sms_url = _build_sms_url(admin_phone, admin_message) if admin_phone else None
            recipients = [(loan.customer_phone, sms_message), (admin_phone, admin_message)]
            background_tasks.add_task(
                queue_disbursement_sms_batch, [(p, m) for p, m in recipients if p]
            )

            response = LoanCreateResponse(
                status="success",
                data=_loan_out(dict(record), loan_id, reminders),
                sms=SMSLinks(send_sms_url=sms_url, admin_sms_url=admin_sms_url, message_preview=sms_message, language=loan.preferred_language),
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
    db = get_db_client()
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
        if "assigned_collectors" in update_data:
            update_data["assigned_collectors"] = _clean_collectors(update_data["assigned_collectors"], required=True)
        update_data = {k: v for k, v in update_data.items() if v is not None}

        flags = {"photo_url": "has_photo", "signature_url": "has_signature"}
        # An image stored in `loan_media` leaves the loan's own field blank, so compare against the flag.
        changed = [k for k, v in update_data.items()
                   if loan.get(k) != v or (k in flags and (is_data_url(v) or (not v and loan.get(flags[k]))))]
        if not changed:
            return _loan_out(loan, loan_id)

        # Full images go to `loan_media`; the loan keeps only a thumbnail and flags.
        media = {}
        if "photo_url" in update_data or "signature_url" in update_data:
            update_data, media = split_media(update_data)

        update_data["updated_at"] = _now()
        update_data["updated_by"] = user["name"]
        if media:
            get_db_client().collection("loan_media").document(loan_id).set(media, merge=True)
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
    for doc in get_db_client().collection("loans").get():
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
    db = get_db_client()
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
def get_loans(background_tasks: BackgroundTasks, user=Depends(require_role("admin", "collector"))):
    business = (get_current_org(), get_current_business())   # never share a cache entry between organisations
    hit = _loans_cache.get(business)
    if hit and time.monotonic() - hit[0] < LOANS_CACHE_TTL:
        loans = hit[1]
    else:
        gen = _loans_cache_gen
        reminders = _reminders_by_loan()
        loans, legacy = _loans_out_from_docs(get_db_client().collection("loans").get(), reminders)
        _schedule_media_migration(background_tasks, legacy)
        if gen == _loans_cache_gen:  # nothing was written while we were reading
            _loans_cache[business] = (time.monotonic(), loans)
    if user["role"] == "collector":  # collectors only see the borrowers assigned to them
        loans = [l for l in loans if _is_assigned(l.model_dump(), user)]
    return loans


@app.get("/api/loans/{loan_id}/media")
def get_loan_media(loan_id: str, user=Depends(require_role("admin", "collector"))):
    """Full-size photo and signature for one borrower (kept out of the list for speed)."""
    db = get_db_client()
    _assert_collector_assigned(user, _get_loan_or_404(loan_id)[1])
    media_doc = db.collection("loan_media").document(loan_id).get()
    media = media_doc.to_dict() if media_doc.exists else {}
    out = {"photo_url": media.get("photo_url") or "", "signature_url": media.get("signature_url") or ""}
    if not (out["photo_url"] and out["signature_url"]):
        loan_doc = db.collection("loans").document(loan_id).get()
        if not loan_doc.exists:
            raise HTTPException(status_code=404, detail="Loan not found")
        loan = loan_doc.to_dict()
        out["photo_url"] = out["photo_url"] or loan.get("photo_url") or ""
        out["signature_url"] = out["signature_url"] or loan.get("signature_url") or ""
    return out


def _run_parallel(*fns):
    """Run independent blocking reads at the same time, keeping the request's business scope."""
    with ThreadPoolExecutor(max_workers=len(fns)) as pool:
        futures = [pool.submit(contextvars.copy_context().run, fn) for fn in fns]
        return [f.result() for f in futures]


@app.get("/api/admin/app-data")
def get_admin_app_data(background_tasks: BackgroundTasks, user=Depends(require_admin)):
    """Everything the admin app needs on load, in one request (loans, payments, expenses, capital, staff)."""
    db = get_db_client()
    loan_docs, reminders, payment_rows, expenses, capital, staff = _run_parallel(
        lambda: db.collection("loans").get(),
        _reminders_by_loan,
        lambda: get_collector_payments_db(None, loans={}),  # names are filled in below from the loans read
        lambda: _list_collection("expenses", "date"),
        lambda: _list_collection("capital", "date"),
        lambda: list_staff(user),
    )
    loans_by_id = {d.id: d.to_dict() for d in loan_docs}
    for p in payment_rows:
        loan = loans_by_id.get(p.get("loan_id"))
        if loan:
            p["customer_name"] = loan.get("customer_name")
            p["customer_phone"] = loan.get("customer_phone")
    loans, legacy = _loans_out_from_docs(loan_docs, reminders)
    _schedule_media_migration(background_tasks, legacy)
    return {
        "loans": [l.model_dump() for l in loans],
        "payments": [LoanPaymentWithBorrower(**r).model_dump() for r in payment_rows],
        "expenses": expenses,
        "capital": capital,
        "staff": staff,
    }


@app.post("/api/loans/{loan_id}/payments", response_model=PaymentResponse)
async def record_payment(
    loan_id: str,
    payment: LoanPaymentCreate,
    user=Depends(require_role("admin", "collector")),
    idempotency_key: Optional[str] = Header(default=None),
):
    db = get_db_client()

    with db_lock:
        # A repeated tap / network retry with the same key returns the original result
        if idempotency_key:
            cached = get_idempotent_response(f"payment:{loan_id}", idempotency_key)
            if cached:
                return cached

        loan_ref, loan = _get_loan_or_404(loan_id)
        if _is_archived(loan):
            raise HTTPException(status_code=400, detail="This borrower has been deleted. Payments cannot be recorded.")
        _assert_collector_assigned(user, loan)

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
    if user["role"] == "collector":
        _assert_collector_assigned(user, _get_loan_or_404(loan_id)[1])
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
        for doc in get_db_client().collection("loans").where("customer_name", "==", target).get():
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

    for doc in get_db_client().collection("loans").get():
        l = doc.to_dict()
        status = l.get("status", "active")
        if status == "merged":
            continue  # its amounts were folded into the primary loan
        if user["role"] == "collector" and not _is_assigned(l, user):
            continue
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
    _assert_collector_assigned(user, loan)
    return LoanStatsResponse(
        total_days_paid=loan.get("total_days_paid", 0),
        total_days_not_paid=loan.get("total_days_not_paid", 0),
        total_paid_amount=loan.get("collected_amount", 0),
        total_balance_due=loan.get("pending_amount", 0),
    )


@app.get("/api/collector/payments")
def get_collector_history(collector_name: Optional[str] = None, user=Depends(require_role("admin", "collector"))):
    """Payments logged by a collector. Collectors only see their own; admins may omit the name to get all payments."""
    if user["role"] == "collector":
        collector_name = user["name"]
    rows = get_collector_payments_db(collector_name or None)
    return [LoanPaymentWithBorrower(**r) for r in rows]


@app.patch("/api/collector/payments/{payment_id}")
async def update_collector_payment(
    payment_id: str,
    body: LoanPaymentUpdate,
    user=Depends(require_role("admin", "collector")),
):
    """Correct a mis-entered collection (wrong amount/date/method). Recomputes the loan's totals."""
    db = get_db_client()
    with db_lock:
        payment_ref = db.collection("loan_payments").document(payment_id)
        payment_doc = payment_ref.get()
        if not payment_doc.exists:
            raise HTTPException(status_code=404, detail="Payment not found")
        payment = payment_doc.to_dict()
        if user["role"] == "collector" and payment.get("collector_name") != user["name"]:
            raise HTTPException(status_code=403, detail="You can only edit your own collections")

        loan_ref, loan = _get_loan_or_404(payment["loan_id"])

        old_amount = float(payment.get("amount", 0) or 0)
        new_amount = body.amount
        was_paid_day = old_amount > 0
        is_paid_day = new_amount > 0

        new_collected = max(0.0, (loan.get("collected_amount", 0) or 0) - old_amount + new_amount)
        new_pending = (loan.get("due_amount", 0) or 0) - new_collected
        new_days_paid = (loan.get("total_days_paid", 0) or 0)
        new_days_not_paid = (loan.get("total_days_not_paid", 0) or 0)
        if was_paid_day != is_paid_day:
            new_days_paid = max(0, new_days_paid + (1 if is_paid_day else -1))
            new_days_not_paid = max(0, new_days_not_paid + (-1 if is_paid_day else 1))
        new_status = "closed" if new_pending <= 0 else "active"

        loan_ref.update({
            "collected_amount": new_collected,
            "pending_amount": new_pending,
            "total_days_paid": new_days_paid,
            "total_days_not_paid": new_days_not_paid,
            "status": new_status,
            "updated_at": _now(),
            "updated_by": user["name"],
        })

        payment_ref.update({
            "amount": new_amount,
            "payment_method": body.payment_method,
            "payment_date": body.payment_date or payment.get("payment_date"),
            "notes": body.notes if body.notes is not None else payment.get("notes"),
            "edited_at": _now(),
            "edited_by": user["name"],
        })
        updated_payment = payment_ref.get().to_dict()
        updated_loan = loan_ref.get().to_dict()

    _write_audit(user["name"], "PAYMENT_EDITED", f"Edited payment {payment_id} for {loan.get('customer_name', 'unknown borrower')}: ₹{old_amount:,.0f} → ₹{new_amount:,.0f}")
    return {
        "status": "success",
        "data": {**updated_payment, "customer_name": loan.get("customer_name"), "customer_phone": loan.get("customer_phone")},
        "loan": updated_loan,
    }


@app.delete("/api/collector/payments/{payment_id}")
async def delete_collector_payment(
    payment_id: str,
    user=Depends(require_role("admin", "collector")),
):
    """Remove a wrongly recorded collection. Recomputes the loan's totals."""
    db = get_db_client()
    with db_lock:
        payment_ref = db.collection("loan_payments").document(payment_id)
        payment_doc = payment_ref.get()
        if not payment_doc.exists:
            raise HTTPException(status_code=404, detail="Payment not found")
        payment = payment_doc.to_dict()
        if user["role"] == "collector" and payment.get("collector_name") != user["name"]:
            raise HTTPException(status_code=403, detail="You can only delete your own collections")

        loan_ref, loan = _get_loan_or_404(payment["loan_id"])

        amount = float(payment.get("amount", 0) or 0)
        was_paid_day = amount > 0
        new_collected = max(0.0, (loan.get("collected_amount", 0) or 0) - amount)
        new_pending = (loan.get("due_amount", 0) or 0) - new_collected
        new_days_paid = max(0, (loan.get("total_days_paid", 0) or 0) - (1 if was_paid_day else 0))
        new_days_not_paid = max(0, (loan.get("total_days_not_paid", 0) or 0) - (0 if was_paid_day else 1))
        new_status = "closed" if new_pending <= 0 else "active"

        loan_ref.update({
            "collected_amount": new_collected,
            "pending_amount": new_pending,
            "total_days_paid": new_days_paid,
            "total_days_not_paid": new_days_not_paid,
            "status": new_status,
            "updated_at": _now(),
            "updated_by": user["name"],
        })
        payment_ref.delete()
        updated_loan = loan_ref.get().to_dict()

    _write_audit(user["name"], "PAYMENT_DELETED", f"Deleted ₹{amount:,.0f} payment {payment_id} for {loan.get('customer_name', 'unknown borrower')}")
    return {"status": "success", "loan": updated_loan}


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


# ==============================
# SUBSCRIPTIONS (owner) + PAYMENT WEBHOOK + PLATFORM ADMIN
# ==============================
# Subscription payments are completely separate from borrower payments: different collections, different
# endpoints, and they live in the platform scope that tenant data can never reach.

@app.get("/api/subscriptions/current")
def subscription_current(user=Depends(get_current_user)):
    """Staff get the access state; the owner also gets plan, dates and payment availability."""
    return subscriptions.describe(user["org_id"], owner=user["member_role"] == identity.OWNER, phone=user["phone"])


@app.get("/api/subscriptions/plans")
def subscription_plans(user=Depends(require_owner)):
    return [{k: p[k] for k in ("id", "name", "plan_type", "price", "currency", "billing_interval", "duration_days")}
            for p in subscriptions.get_plans()]


def _start_checkout(user, plan_type: str):
    order = subscriptions.create_payment_order(user["org_id"], plan_type, user["name"])
    _write_audit(user["name"], "SUBSCRIPTION_ORDER_CREATED", f"{order['plan']['name']} plan checkout started")
    return order


@app.post("/api/subscriptions/create-order")
def subscription_create_order(body: CreateOrderRequest, user=Depends(require_owner)):
    return _start_checkout(user, body.plan_type)


@app.post("/api/subscriptions/renew")
def subscription_renew(body: RenewRequest, user=Depends(require_owner)):
    """Manual renewal = a new checkout order for the chosen plan (default: the current plan, else monthly)."""
    current = subscriptions.get_subscription(user["org_id"]).get("plan_id")
    plan_type = body.plan_type or (current if current in ("monthly", "annual") else "monthly")
    return _start_checkout(user, plan_type)


@app.post("/api/subscriptions/verify-payment")
def subscription_verify_payment(body: VerifyPaymentRequest, user=Depends(require_owner)):
    """Called by the browser after Checkout. The signature is verified here and the payment is re-checked with
    Razorpay; the browser saying "success" is never enough."""
    payment = subscriptions.verify_checkout(user["org_id"], body.razorpay_order_id, body.razorpay_payment_id,
                                            body.razorpay_signature)
    if payment["status"] == "paid":
        _write_audit(user["name"], "SUBSCRIPTION_PAID", f"{payment.get('plan_name')} plan paid, valid until {payment.get('period_end')}")
    return {"payment": payment, "subscription": subscriptions.describe(user["org_id"], owner=True, phone=user["phone"])}


@app.get("/api/subscriptions/payment-history")
def subscription_payment_history(user=Depends(require_owner)):
    return subscriptions.payment_history(user["org_id"])


@app.get("/api/subscriptions/invoices")
def subscription_invoices(user=Depends(require_owner)):
    return subscriptions.invoices(user["org_id"])


@app.post("/api/subscriptions/cancel")
def subscription_cancel(user=Depends(require_owner)):
    out = subscriptions.cancel(user["org_id"], user["name"])
    _write_audit(user["name"], "SUBSCRIPTION_CANCELLED", "Renewal turned off; access continues until the paid-through date")
    return out


@app.post("/api/webhooks/razorpay", include_in_schema=False)
async def razorpay_webhook(request: Request):
    """Razorpay -> us. No login: authenticity is the HMAC of the RAW body with the webhook secret."""
    raw = await request.body()
    return await run_in_threadpool(
        subscriptions.handle_webhook, raw, request.headers.get("x-razorpay-signature", ""),
        request.headers.get("x-razorpay-event-id", ""))


@app.get("/api/platform/subscriptions")
def platform_subscriptions(q: str = "", user=Depends(require_platform_admin)):
    return subscriptions.platform_list(q)


@app.get("/api/platform/subscriptions/analytics")
def platform_subscription_analytics(user=Depends(require_platform_admin)):
    return subscriptions.platform_analytics()


@app.get("/api/platform/subscriptions/{org_id}")
def platform_subscription_detail(org_id: str, user=Depends(require_platform_admin)):
    return subscriptions.platform_detail(org_id)


@app.post("/api/platform/subscriptions/{org_id}/extend-trial")
def platform_extend_trial(org_id: str, body: ExtendTrialRequest, user=Depends(require_platform_admin)):
    return subscriptions.extend_trial(org_id, body.days, f"{user['name']} ({user['phone']})", body.reason)


@app.post("/api/platform/subscriptions/{org_id}/set-status")
def platform_set_status(org_id: str, body: SetSubscriptionStatusRequest, user=Depends(require_platform_admin)):
    return subscriptions.set_status(org_id, body.status, body.end_at, f"{user['name']} ({user['phone']})", body.reason)


@app.get("/api/reminders/policy/")
async def get_reminder_policy():
    return {
        "channel": "whatsapp",
        "day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
        "description": "Reminders are scheduled on day 5, 7, 10, and 60 from the due date.",
    }


@app.get("/api/health")
async def health():
    # Public (used by the keep-alive ping): nothing about backups or configuration. Admins get that from
    # /api/admin/sheet-backup.
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
