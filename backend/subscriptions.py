"""
Organisation subscriptions: lifetime-free (exempt) organisations, 7-day trials, paid plans,
Razorpay payments and the access rules built on them.

Everything is kept in the reserved PLATFORM scope of the document store (like identity.py), so a
tenant session can never read or write it directly - only this module does, via database.platform_scope().
The document id plays the role of the unique key:

  subscription_plans/<plan id>              id, name, plan_type, price (paise), currency, billing_interval,
                                            duration_days, is_active
  organization_subscriptions/<org_id>       one per organisation: status, is_exempt, trial_*, current_period_*,
                                            cancelled_at, gateway_subscription_id
  subscription_payments/<razorpay order id> one per checkout order (the order id is unique by construction)
  subscription_payment_ids/<payment id>     claims a Razorpay payment id for ONE order (a payment can never
                                            activate two orders)
  payment_webhook_events/<event id>         one per webhook delivery -> duplicate deliveries are ignored
  subscription_audit/<auto>                 manual changes made by platform administrators

Money is always an integer number of paise. All timestamps are UTC ISO-8601 strings produced here on the
server; the browser's clock is never consulted.

Status stored on an organisation:   exempt | grandfathered | trial | active | cancelled
Access state derived at request time (evaluate()):
    exempt | grandfathered | trial | trial_expired | active | cancelled | expired
Only trial_expired and expired are read-only; every other state has full access.
"""

import hashlib
import json
import logging
import math
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple

import db as database   # module-attribute access (not `from db import`) so a reloaded db module is always the one used
import identity
from services import razorpay

log = logging.getLogger("digivasool.subscriptions")

EXEMPT, GRANDFATHERED, TRIAL, ACTIVE, CANCELLED = "exempt", "grandfathered", "trial", "active", "cancelled"
READ_ONLY_STATES = ("trial_expired", "expired")
MAX_EXEMPT_NUMBERS = 3

PLANS_C = "subscription_plans"
SUBS_C = "organization_subscriptions"
PAYMENTS_C = "subscription_payments"
PAYMENT_IDS_C = "subscription_payment_ids"
EVENTS_C = "payment_webhook_events"
AUDIT_C = "subscription_audit"


class SubscriptionError(Exception):
    """A business-rule failure the API turns into an HTTP error with a readable message."""

    def __init__(self, status: int, detail: str, code: str = ""):
        super().__init__(detail)
        self.status, self.detail, self.code = status, detail, code


# ── configuration (read lazily so tests / Render env changes apply without re-importing) ─────────────

def _phones_from_env(name: str, limit: Optional[int] = None) -> List[str]:
    out: List[str] = []
    for raw in os.environ.get(name, "").split(","):
        if not raw.strip():
            continue
        key = database.normalize_phone(raw)
        if len(key) != 10:
            log.warning("%s: ignoring an entry that is not a valid 10-digit number", name)
        elif key not in out:
            out.append(key)
    if limit is not None and len(out) > limit:
        log.error("%s lists %d numbers but at most %d are allowed; only the first %d are used",
                  name, len(out), limit, limit)
        out = out[:limit]
    return out


def exempt_phones() -> frozenset:
    """The (at most three) phones allowed to create lifetime-free organisations. Never sent to any client."""
    return frozenset(_phones_from_env("SUBSCRIPTION_EXEMPT_PHONES", MAX_EXEMPT_NUMBERS))


def is_exempt_phone(phone: str) -> bool:
    key = database.normalize_phone(phone or "")
    return bool(key) and key in exempt_phones()


def platform_admin_phones() -> frozenset:
    """DigiVasool operators who may open the platform dashboard. Deliberately NOT the exempt numbers."""
    return frozenset(_phones_from_env("PLATFORM_ADMIN_PHONES"))


def is_platform_admin(phone: str) -> bool:
    key = database.normalize_phone(phone or "")
    return bool(key) and key in platform_admin_phones()


def trial_days() -> int:
    try:
        return max(1, int(os.environ.get("SUBSCRIPTION_TRIAL_DAYS", "7")))
    except ValueError:
        return 7


def currency() -> str:
    return (os.environ.get("SUBSCRIPTION_CURRENCY", "INR").strip() or "INR").upper()


def _rupees_to_paise(raw: str, default_rupees: str) -> int:
    for candidate in (raw, default_rupees):
        try:
            paise = int((Decimal(str(candidate).strip()) * 100).to_integral_value())
            if paise > 0:
                return paise
        except (InvalidOperation, ValueError):
            pass
    return int(Decimal(default_rupees) * 100)


def _plan_definitions() -> List[Dict[str, Any]]:
    """Central plan configuration. Prices come from MONTHLY_PLAN_PRICE / ANNUAL_PLAN_PRICE (in rupees);
    the defaults are PLACEHOLDERS until the real pricing is decided."""
    cur = currency()
    return [
        {"id": "trial", "name": "Free Trial", "plan_type": "trial", "price": 0, "currency": cur,
         "billing_interval": "trial", "duration_days": trial_days(), "is_active": True},
        {"id": "monthly", "name": "Monthly", "plan_type": "monthly", "billing_interval": "month",
         "price": _rupees_to_paise(os.environ.get("MONTHLY_PLAN_PRICE", ""), "499"),
         "currency": cur, "duration_days": 30, "is_active": True},
        {"id": "annual", "name": "Annual", "plan_type": "annual", "billing_interval": "year",
         "price": _rupees_to_paise(os.environ.get("ANNUAL_PLAN_PRICE", ""), "4999"),
         "currency": cur, "duration_days": 365, "is_active": True},
    ]


# ── helpers ──────────────────────────────────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.astimezone(timezone.utc).isoformat() if dt else None


def _parse(ts: Any) -> Optional[datetime]:
    if not ts:
        return None
    try:
        d = datetime.fromisoformat(str(ts))
    except ValueError:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def _db():
    return database.get_db_client("finance")   # the platform scope is selected by the caller's `with database.platform_scope()`


def _get(collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
    with database.platform_scope():
        snap = _db().collection(collection).document(doc_id).get()
        return snap.to_dict() if snap.exists else None


def _put(collection: str, doc_id: str, data: Dict[str, Any]):
    with database.platform_scope():
        _db().collection(collection).document(doc_id).set(data)


def _create(collection: str, doc_id: str, data: Dict[str, Any]) -> bool:
    with database.platform_scope():
        return _db().collection(collection).document(doc_id).create(data)


def _all(collection: str) -> List[Dict[str, Any]]:
    with database.platform_scope():
        return [d.to_dict() for d in _db().collection(collection).get()]


# ── plans ────────────────────────────────────────────────────────────────────────────────────────────

def sync_plans():
    """Mirror the configured plans into the database (startup). Prices of past payments are never touched:
    each payment stores the amount that was actually charged."""
    now = _iso(_utcnow())
    for plan in _plan_definitions():
        existing = _get(PLANS_C, plan["id"]) or {}
        _put(PLANS_C, plan["id"], {**plan, "created_at": existing.get("created_at", now), "updated_at": now})


def get_plans(paid_only: bool = True) -> List[Dict[str, Any]]:
    plans = [p for p in _all(PLANS_C) if p.get("is_active")] or _plan_definitions()
    return [p for p in plans if not paid_only or p.get("price", 0) > 0]


def get_plan(plan_type: str) -> Optional[Dict[str, Any]]:
    return next((p for p in get_plans() if p["plan_type"] == plan_type), None)


# ── subscription records ─────────────────────────────────────────────────────────────────────────────

_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_cache_lock = threading.Lock()
_CACHE_TTL = 10


def invalidate(org_id: Optional[str] = None):
    with _cache_lock:
        if org_id:
            _cache.pop(org_id, None)
        else:
            _cache.clear()


def _save_sub(sub: Dict[str, Any]):
    sub["updated_at"] = _iso(_utcnow())
    _put(SUBS_C, sub["org_id"], sub)
    invalidate(sub["org_id"])


def _new_sub(org_id: str, **fields) -> Dict[str, Any]:
    now = _iso(_utcnow())
    return {"id": org_id, "org_id": org_id, "plan_id": None, "status": TRIAL, "is_exempt": False,
            "trial_start": None, "trial_end": None, "current_period_start": None, "current_period_end": None,
            "cancelled_at": None, "gateway_subscription_id": None, "created_at": now, "updated_at": now, **fields}


def start_for_new_org(org_id: str, owner_phone: str) -> Dict[str, Any]:
    """Called once when an organisation is created (identity.create_org). The owner's phone was verified by OTP
    on the server; the client has no say. Exempt number -> lifetime free, otherwise a 7-day trial.
    Idempotent: an existing record is returned untouched, so a trial can never be restarted."""
    now = _utcnow()
    if is_exempt_phone(owner_phone):
        sub = _new_sub(org_id, status=EXEMPT, is_exempt=True)
    else:
        sub = _new_sub(org_id, status=TRIAL, plan_id="trial", trial_start=_iso(now),
                       trial_end=_iso(now + timedelta(days=trial_days())))
    if _create(SUBS_C, org_id, sub):
        invalidate(org_id)
        return sub
    return _get(SUBS_C, org_id) or sub


def _owner_phone(org_id: str) -> str:
    for m in identity.org_memberships(org_id):
        if m.get("role") == identity.OWNER:
            return m.get("phone", "")
    return (identity.get_org(org_id) or {}).get("owner_phone", "")


def get_subscription(org_id: str) -> Dict[str, Any]:
    """The organisation's subscription record.

    * Organisations created by this version always have one.
    * An organisation created by this version whose record is missing (creation was interrupted) starts its trial now.
    * An organisation that existed BEFORE subscriptions were introduced has no record: it is `grandfathered`
      (full access, no expiry) and nothing is written to the database. If its owner is one of the exempt numbers
      it is exempt. Operators can pin a deadline later (scripts/migrate_subscriptions.py or the platform dashboard)."""
    sub = _get(SUBS_C, org_id)
    if sub:
        if sub.get("status") == GRANDFATHERED and not sub.get("is_exempt") and is_exempt_phone(_owner_phone(org_id)):
            sub = {**sub, "status": EXEMPT, "is_exempt": True}      # the owner is an authorised number
            _save_sub(sub)
        return sub
    org = identity.get_org(org_id) or {}
    if org.get("subscription_managed"):
        return start_for_new_org(org_id, org.get("owner_phone", ""))
    if is_exempt_phone(_owner_phone(org_id)):
        return _new_sub(org_id, status=EXEMPT, is_exempt=True)
    return _new_sub(org_id, status=GRANDFATHERED)


def evaluate(sub: Dict[str, Any], now: Optional[datetime] = None) -> Dict[str, Any]:
    """Turn a stored record into the access decision, using the server clock only."""
    now = now or _utcnow()
    status = sub.get("status")
    state, ends_at, full = "expired", None, False
    if sub.get("is_exempt") or status == EXEMPT:
        state, full = "exempt", True
    elif status == GRANDFATHERED:
        state, full = "grandfathered", True
    elif status == TRIAL:
        ends_at = _parse(sub.get("trial_end"))
        full = bool(ends_at and now < ends_at)
        state = "trial" if full else "trial_expired"
    elif status in (ACTIVE, CANCELLED):
        ends_at = _parse(sub.get("current_period_end"))
        full = bool(ends_at and now < ends_at)
        state = status if full else "expired"
    # anything unrecognised fails closed (read-only)
    days = max(0, math.ceil((ends_at - now).total_seconds() / 86400)) if (ends_at and full) else 0
    return {"state": state, "full_access": full, "read_only": not full, "ends_at": _iso(ends_at),
            "days_remaining": days}


def access_for_org(org_id: str) -> Dict[str, Any]:
    """Cached (10 s) access decision used by the request middleware."""
    now = time.time()
    with _cache_lock:
        hit = _cache.get(org_id)
        if hit and hit[0] > now:
            return hit[1]
    ev = evaluate(get_subscription(org_id))
    with _cache_lock:
        _cache[org_id] = (now + _CACHE_TTL, ev)
    return ev


def read_only_message(state: str) -> str:
    if state == "trial_expired":
        return "Your free trial has ended. Your records are still available to view. Ask the owner to subscribe to continue adding or changing data."
    return "Your DigiVasool subscription has expired. Your records are still available to view. Ask the owner to renew to continue adding or changing data."


def describe(org_id: str, *, owner: bool, phone: str = "") -> Dict[str, Any]:
    """What the app shows. Staff only get the access state; the owner also gets the commercial details."""
    sub = get_subscription(org_id)
    ev = evaluate(sub)
    out = {"state": ev["state"], "full_access": ev["full_access"], "read_only": ev["read_only"],
           "can_manage": owner, "is_platform_admin": is_platform_admin(phone),
           "message": read_only_message(ev["state"]) if ev["read_only"] else ""}
    if not owner:
        return out
    plan = next((p for p in get_plans(paid_only=False) if p["id"] == sub.get("plan_id")), None)
    out.update({
        "organization_name": (identity.get_org(org_id) or {}).get("organization_name", ""),
        "is_exempt": ev["state"] == "exempt",
        "plan_id": sub.get("plan_id"), "plan_name": (plan or {}).get("name", ""),
        "trial_start": sub.get("trial_start"), "trial_end": sub.get("trial_end"),
        "current_period_start": sub.get("current_period_start"), "current_period_end": sub.get("current_period_end"),
        "cancelled_at": sub.get("cancelled_at"), "ends_at": ev["ends_at"], "days_remaining": ev["days_remaining"],
        "payments_enabled": razorpay.configured(), "currency": currency(),
    })
    return out


# ── ownership transfer policy ────────────────────────────────────────────────────────────────────────
# Exemption is a property of the ORGANISATION, granted once at creation because a verified exempt number
# created it. It is never granted later and never granted by merely being staff.
#   * Ownership moves to another exempt number  -> still exempt.
#   * Ownership moves to a non-exempt number    -> refused unless the owner explicitly confirms; on confirmation the
#     exemption ends and the organisation gets a fresh trial (no surprise lock-out, no free ride for the new owner).
#   * A non-exempt organisation handed to an exempt number stays non-exempt.

def check_ownership_transfer(org_id: str, new_owner_phone: str, confirmed: bool):
    sub = get_subscription(org_id)
    if sub.get("is_exempt") and not is_exempt_phone(new_owner_phone) and not confirmed:
        raise SubscriptionError(
            409, "This organisation has lifetime free access because of its current owner. If you give ownership to someone "
                 "who is not authorised for free access, the free access ends and a new free trial starts. Confirm to continue.",
            code="exemption_loss_confirmation_required")


def on_ownership_transferred(org_id: str, new_owner_phone: str, actor: str = ""):
    with database.db_lock:
        sub = get_subscription(org_id)
        if sub.get("is_exempt") and not is_exempt_phone(new_owner_phone):
            now = _utcnow()
            before = dict(sub)
            sub.update({"status": TRIAL, "is_exempt": False, "plan_id": "trial", "trial_start": _iso(now),
                        "trial_end": _iso(now + timedelta(days=trial_days())), "exemption_revoked_at": _iso(now)})
            _save_sub(sub)
            _audit(org_id, actor or "owner", "EXEMPTION_ENDED", "Ownership moved to a non-exempt number", before, sub)


# ── checkout (Razorpay Orders) ───────────────────────────────────────────────────────────────────────

def _public_payment(p: Dict[str, Any]) -> Dict[str, Any]:
    keys = ("id", "amount", "currency", "gateway", "gateway_order_id", "gateway_payment_id", "status",
            "payment_method", "paid_at", "created_at", "plan_id", "plan_name", "period_start", "period_end", "invoice_number")
    return {k: p.get(k) for k in keys}


def create_payment_order(org_id: str, plan_type: str, actor: str) -> Dict[str, Any]:
    """Step 1 of checkout. The price comes from the server's plan, never from the client."""
    sub = get_subscription(org_id)
    if evaluate(sub)["state"] == "exempt":
        raise SubscriptionError(400, "Your organisation has lifetime free access, so no payment is needed.")
    if not razorpay.configured():
        raise SubscriptionError(503, "Online payments are not set up yet. Please contact support.", code="payments_not_configured")
    plan = get_plan(plan_type)
    if not plan:
        raise SubscriptionError(400, "Choose the monthly or the annual plan.")
    receipt = "dv" + hashlib.sha1(f"{org_id}{time.time()}".encode()).hexdigest()[:30]
    try:
        order = razorpay.create_order(plan["price"], plan["currency"], receipt,
                                      {"org_id": org_id, "plan_id": plan["id"]})
    except razorpay.RazorpayError as exc:
        log.warning("order creation failed: %s", exc)
        raise SubscriptionError(502, "The payment gateway is not responding. Please try again in a moment.")
    if int(order.get("amount", -1)) != plan["price"] or order.get("currency") != plan["currency"] or not order.get("id"):
        log.error("gateway returned an unexpected order for org %s", org_id)
        raise SubscriptionError(502, "The payment gateway returned an unexpected order. Please try again.")
    record = {"id": order["id"], "org_id": org_id, "subscription_id": org_id, "plan_id": plan["id"],
              "plan_name": plan["name"], "duration_days": plan["duration_days"], "amount": plan["price"],
              "currency": plan["currency"], "gateway": "razorpay", "gateway_order_id": order["id"],
              "gateway_payment_id": None, "status": "created", "payment_method": None, "paid_at": None,
              "created_at": _iso(_utcnow()), "created_by": actor, "applied": False}
    if not _create(PAYMENTS_C, order["id"], record):
        raise SubscriptionError(502, "Could not record the payment order. Please try again.")
    return {"order_id": order["id"], "amount": plan["price"], "currency": plan["currency"],
            "key_id": razorpay.key_id(), "plan": {"id": plan["id"], "name": plan["name"], "plan_type": plan["plan_type"]},
            "organization_name": (identity.get_org(org_id) or {}).get("organization_name", "")}


def _get_payment(order_id: str) -> Optional[Dict[str, Any]]:
    return _get(PAYMENTS_C, order_id) if order_id else None


def _renewal_base(sub: Dict[str, Any], now: datetime) -> datetime:
    """A renewal extends from the paid-through date (or the end of a running trial), never from `now` when that
    would shorten what the organisation already has."""
    candidates = [now]
    end = _parse(sub.get("current_period_end"))
    if end and end > now:
        candidates.append(end)
    trial_end = _parse(sub.get("trial_end"))
    if sub.get("status") == TRIAL and trial_end and trial_end > now:
        candidates.append(trial_end)
    return max(candidates)


def _apply_period(pay: Dict[str, Any]):
    """Idempotent: sets the subscription to cover the payment's period (max, never a shorter one)."""
    sub = get_subscription(pay["org_id"])
    if not sub.get("is_exempt"):
        new_end, cur_end = _parse(pay["period_end"]), _parse(sub.get("current_period_end"))
        if cur_end is None or new_end > cur_end:
            sub.update({"current_period_start": pay["period_start"], "current_period_end": pay["period_end"]})
        sub.update({"status": ACTIVE, "plan_id": pay["plan_id"], "cancelled_at": None})
        _save_sub(sub)
    pay["applied"] = True
    _put(PAYMENTS_C, pay["id"], pay)


def _claim_payment_id(payment_id: str, order_id: str, org_id: str):
    ok = _create(PAYMENT_IDS_C, payment_id, {"payment_id": payment_id, "order_id": order_id, "org_id": org_id,
                                             "claimed_at": _iso(_utcnow())})
    if not ok and (_get(PAYMENT_IDS_C, payment_id) or {}).get("order_id") != order_id:
        log.error("payment %s was already used for a different order", payment_id)
        raise SubscriptionError(409, "This payment has already been used.", code="payment_reused")


def mark_failed(order_id: str, payment_id: str = ""):
    with database.db_lock:
        pay = _get_payment(order_id)
        if pay and pay["status"] != "paid":          # a paid order is never downgraded
            pay.update({"status": "failed", "failed_payment_id": payment_id or pay.get("failed_payment_id"),
                        "failed_at": _iso(_utcnow())})
            _put(PAYMENTS_C, order_id, pay)
        return pay


def settle_payment(order_id: str, payment_id: str, *, expected_org: Optional[str] = None) -> Dict[str, Any]:
    """Confirm a payment with Razorpay itself and, only if it is captured for exactly the expected order, amount and
    currency, activate / extend the subscription. Safe to call any number of times (checkout verify, webhook, retry)."""
    pay = _get_payment(order_id)
    if not pay or (expected_org and pay["org_id"] != expected_org):
        raise SubscriptionError(404, "Payment not found.")      # same answer for "unknown" and "someone else's"
    if pay["status"] == "paid":
        if not pay.get("applied"):
            with database.db_lock:
                _apply_period(_get_payment(order_id))
        return _public_payment(_get_payment(order_id))
    try:
        remote = razorpay.fetch_payment(payment_id)              # network call: outside database.db_lock
    except razorpay.RazorpayError as exc:
        log.warning("could not confirm payment %s: %s", payment_id, exc)
        raise SubscriptionError(503, "We could not confirm this payment yet. If money was deducted, your subscription "
                                     "will switch on automatically within a few minutes.", code="payment_unconfirmed")
    try:
        amount_ok = int(remote.get("amount", -1)) == int(pay["amount"])
    except (TypeError, ValueError):
        amount_ok = False
    if remote.get("order_id") != order_id or not amount_ok or remote.get("currency") != pay["currency"]:
        log.error("payment %s does not match order %s (amount/currency/order)", payment_id, order_id)
        raise SubscriptionError(400, "This payment does not match the order.", code="payment_mismatch")
    gateway_status = remote.get("status")
    if gateway_status == "failed":
        return _public_payment(mark_failed(order_id, payment_id))
    if gateway_status != "captured":                              # created / authorized: not money yet
        return _public_payment(pay)

    with database.db_lock:
        pay = _get_payment(order_id)
        if pay["status"] == "paid":
            if not pay.get("applied"):
                _apply_period(pay)
            return _public_payment(_get_payment(order_id))
        _claim_payment_id(payment_id, order_id, pay["org_id"])
        now = _utcnow()
        start = _renewal_base(get_subscription(pay["org_id"]), now)
        end = start + timedelta(days=int(pay["duration_days"]))
        paid_at = _iso(now)
        pay.update({"status": "paid", "gateway_payment_id": payment_id, "payment_method": remote.get("method"),
                    "paid_at": paid_at, "period_start": _iso(start), "period_end": _iso(end), "applied": False,
                    "invoice_number": f"DV-{now:%Y%m}-{order_id[-6:].upper()}"})
        _put(PAYMENTS_C, order_id, pay)                           # 1) record the money first ...
        _apply_period(pay)                                        # 2) ... then extend (idempotent if interrupted)
    return _public_payment(_get_payment(order_id))


def verify_checkout(org_id: str, order_id: str, payment_id: str, signature: str) -> Dict[str, Any]:
    pay = _get_payment(order_id)
    if not pay or pay["org_id"] != org_id:
        raise SubscriptionError(404, "Payment not found.")
    if not razorpay.verify_checkout_signature(order_id, payment_id, signature):
        log.warning("bad checkout signature for order %s", order_id)
        raise SubscriptionError(400, "Payment verification failed.", code="bad_signature")
    return settle_payment(order_id, payment_id, expected_org=org_id)


# ── webhook ──────────────────────────────────────────────────────────────────────────────────────────

def handle_webhook(raw_body: bytes, signature: str, event_id_header: str) -> Dict[str, Any]:
    if not razorpay.webhook_configured():
        raise SubscriptionError(503, "Webhook is not configured.")
    if not razorpay.verify_webhook_signature(raw_body, signature):
        raise SubscriptionError(400, "Invalid signature.")
    try:
        event = json.loads(raw_body.decode("utf-8"))
        event_type = str(event.get("event", ""))
    except (ValueError, AttributeError, UnicodeDecodeError):
        raise SubscriptionError(400, "Invalid payload.")
    event_id = (event_id_header or "").strip() or hashlib.sha256(raw_body).hexdigest()
    record = {"id": event_id, "gateway_event_id": event_id, "event_type": event_type,
              "processing_status": "received", "received_at": _iso(_utcnow()), "processed_at": None}
    if not _create(EVENTS_C, event_id, record):
        record = _get(EVENTS_C, event_id) or record
        if record.get("processing_status") in ("processed", "ignored"):
            return {"status": "duplicate"}                         # a repeat delivery: nothing to do
    outcome = "ignored"
    try:
        payment = (((event.get("payload") or {}).get("payment") or {}).get("entity")) or {}
        order_id, payment_id = payment.get("order_id"), payment.get("id")
        if event_type in ("payment.captured", "order.paid") and order_id and payment_id and _get_payment(order_id):
            settle_payment(order_id, payment_id)
            outcome = "processed"
        elif event_type == "payment.failed" and order_id and _get_payment(order_id):
            mark_failed(order_id, payment_id or "")
            outcome = "processed"
    except SubscriptionError as exc:
        # A mismatch or a payment we cannot confirm: remember it. 5xx lets Razorpay retry; a 4xx would not help.
        record.update({"processing_status": "failed", "error": exc.detail, "processed_at": _iso(_utcnow())})
        _put(EVENTS_C, event_id, record)
        if exc.status >= 500:
            raise
        return {"status": "rejected"}
    record.update({"processing_status": outcome, "processed_at": _iso(_utcnow())})
    _put(EVENTS_C, event_id, record)
    return {"status": outcome}


# ── owner actions ────────────────────────────────────────────────────────────────────────────────────

def payments_for_org(org_id: str) -> List[Dict[str, Any]]:
    rows = [p for p in _all(PAYMENTS_C) if p.get("org_id") == org_id]
    return sorted(rows, key=lambda p: p.get("created_at") or "", reverse=True)


def payment_history(org_id: str) -> List[Dict[str, Any]]:
    return [_public_payment(p) for p in payments_for_org(org_id)]


def invoices(org_id: str) -> List[Dict[str, Any]]:
    org = identity.get_org(org_id) or {}
    return [{**_public_payment(p), "organization_name": org.get("organization_name", ""), "organization_id": org_id}
            for p in payments_for_org(org_id) if p.get("status") == "paid"]


def cancel(org_id: str, actor: str) -> Dict[str, Any]:
    """Turn off renewal. Access continues until the paid-through date (renewals are manual orders, so there is no
    gateway mandate to cancel)."""
    with database.db_lock:
        sub = get_subscription(org_id)
        ev = evaluate(sub)
        if sub.get("is_exempt"):
            raise SubscriptionError(400, "Your organisation has lifetime free access; there is nothing to cancel.")
        if sub.get("status") not in (ACTIVE, CANCELLED) or ev["state"] not in ("active", "cancelled"):
            raise SubscriptionError(400, "There is no active paid subscription to cancel.")
        if sub.get("status") != CANCELLED:
            sub.update({"status": CANCELLED, "cancelled_at": _iso(_utcnow())})
            _save_sub(sub)
    return describe(org_id, owner=True)


# ── platform administration ──────────────────────────────────────────────────────────────────────────

def _audit(org_id: str, actor: str, action: str, detail: str, before: Optional[dict] = None, after: Optional[dict] = None):
    pick = ("status", "is_exempt", "plan_id", "trial_end", "current_period_end")
    with database.platform_scope():
        _db().collection(AUDIT_C).add({
            "org_id": org_id, "actor": actor, "action": action, "detail": detail, "created_at": _iso(_utcnow()),
            "before": {k: (before or {}).get(k) for k in pick}, "after": {k: (after or {}).get(k) for k in pick}})


def _org_rows() -> List[Dict[str, Any]]:
    subs = {s["org_id"]: s for s in _all(SUBS_C)}
    owners: Dict[str, str] = {}
    for m in _platform_memberships():
        if m.get("role") == identity.OWNER and m.get("status") == "active":
            owners[m["org_id"]] = m.get("phone", "")
    pays: Dict[str, List[Dict[str, Any]]] = {}
    for p in _all(PAYMENTS_C):
        pays.setdefault(p["org_id"], []).append(p)
    now, rows = _utcnow(), []
    for org in identity.list_orgs(active_only=False):
        oid = org["id"]
        sub = subs.get(oid)
        if sub is None:
            if org.get("subscription_managed"):
                sub = _new_sub(oid, status=TRIAL, plan_id="trial", trial_end=_iso(now + timedelta(days=trial_days())))
            else:
                owner = owners.get(oid) or org.get("owner_phone", "")
                sub = _new_sub(oid, status=EXEMPT, is_exempt=True) if is_exempt_phone(owner) else _new_sub(oid, status=GRANDFATHERED)
        ev = evaluate(sub, now)
        paid = [p for p in pays.get(oid, []) if p["status"] == "paid"]
        rows.append({
            "org_id": oid, "organization_name": org.get("organization_name", ""), "org_status": org.get("status", ""),
            "owner_phone": owners.get(oid) or org.get("owner_phone", ""), "plan_id": sub.get("plan_id"),
            "state": ev["state"], "is_exempt": ev["state"] == "exempt", "trial_end": sub.get("trial_end"),
            "current_period_end": sub.get("current_period_end"), "days_remaining": ev["days_remaining"],
            "payments_total": sum(p["amount"] for p in paid), "payments_count": len(paid),
            "created_at": org.get("created_at"), "_pays": pays.get(oid, []), "_sub": sub})
    return rows


def _platform_memberships() -> List[Dict[str, Any]]:
    return _all("memberships")


def platform_list(query: str = "") -> List[Dict[str, Any]]:
    q = (query or "").strip().lower()
    rows = [{k: v for k, v in r.items() if not k.startswith("_")} for r in _org_rows()]
    if q:
        digits = database.normalize_phone(q)
        rows = [r for r in rows if q in r["organization_name"].lower() or q in r["org_id"].lower()
                or (digits and digits in database.normalize_phone(r["owner_phone"]))]
    return sorted(rows, key=lambda r: r["org_id"])


def platform_analytics() -> Dict[str, Any]:
    rows = _org_rows()
    counts = {"total": len(rows), "exempt": 0, "grandfathered": 0, "trial": 0, "active": 0, "expired": 0}
    mrr = 0
    for r in rows:
        s = r["state"]
        if s == "exempt":
            counts["exempt"] += 1
        elif s == "grandfathered":
            counts["grandfathered"] += 1
        elif s == "trial":
            counts["trial"] += 1
        elif s in ("active", "cancelled"):
            counts["active"] += 1
            paid = sorted([p for p in r["_pays"] if p["status"] == "paid"], key=lambda p: p.get("paid_at") or "")
            if paid and s == "active":
                last = paid[-1]
                mrr += round(last["amount"] / 12) if last.get("plan_id") == "annual" else last["amount"]
        else:
            counts["expired"] += 1
    pays = [p for r in rows for p in r["_pays"]]
    paid = [p for p in pays if p["status"] == "paid"]
    return {
        "currency": currency(), "organizations": counts,
        "revenue": {
            "total_paise": sum(p["amount"] for p in paid), "successful_payments": len(paid),
            "monthly_plan_paise": sum(p["amount"] for p in paid if p.get("plan_id") == "monthly"),
            "annual_plan_paise": sum(p["amount"] for p in paid if p.get("plan_id") == "annual"),
            "monthly_recurring_paise": mrr,
            "failed_payments": sum(1 for p in pays if p["status"] == "failed"),
            "pending_payments": sum(1 for p in pays if p["status"] == "created"),
            "refunds": None,           # refunds are not tracked by this version
        }}


def platform_detail(org_id: str) -> Dict[str, Any]:
    org = identity.get_org(org_id)
    if not org:
        raise SubscriptionError(404, "Organisation not found.")
    row = next(r for r in _org_rows() if r["org_id"] == org_id)
    audit = sorted([a for a in _all(AUDIT_C) if a.get("org_id") == org_id], key=lambda a: a.get("created_at") or "", reverse=True)
    return {**{k: v for k, v in row.items() if not k.startswith("_")}, "subscription": row["_sub"],
            "payments": [_public_payment(p) for p in sorted(row["_pays"], key=lambda p: p.get("created_at") or "", reverse=True)],
            "audit": audit}


def extend_trial(org_id: str, days: int, actor: str, reason: str) -> Dict[str, Any]:
    with database.db_lock:
        if not identity.get_org(org_id):
            raise SubscriptionError(404, "Organisation not found.")
        sub = get_subscription(org_id)
        ev = evaluate(sub)
        if sub.get("is_exempt"):
            raise SubscriptionError(400, "Exempt organisations have no trial to extend.")
        if ev["state"] in ("active", "cancelled"):
            raise SubscriptionError(400, "This organisation has a paid subscription; use 'correct status' instead.")
        before, now = dict(sub), _utcnow()
        trial_end = _parse(sub.get("trial_end")) if sub.get("status") == TRIAL else None
        base = max(now, trial_end) if trial_end else now
        sub.update({"status": TRIAL, "plan_id": "trial", "trial_start": sub.get("trial_start") or _iso(now),
                    "trial_end": _iso(base + timedelta(days=days))})
        _save_sub(sub)
        _audit(org_id, actor, "TRIAL_EXTENDED", f"+{days} days. Reason: {reason}", before, sub)
    return platform_detail(org_id)


def set_status(org_id: str, status: str, end_at: Optional[str], actor: str, reason: str) -> Dict[str, Any]:
    """Operator correction. Cannot create or remove exemption (that is decided only by the owner-number rule)."""
    with database.db_lock:
        if not identity.get_org(org_id):
            raise SubscriptionError(404, "Organisation not found.")
        sub = get_subscription(org_id)
        if sub.get("is_exempt"):
            raise SubscriptionError(400, "Exempt organisations cannot be changed here.")
        end = _parse(end_at) if end_at else None
        if status != GRANDFATHERED and not end:
            raise SubscriptionError(400, "An end date is required for this status.")
        before = dict(sub)
        if status == GRANDFATHERED:
            sub.update({"status": GRANDFATHERED})
        elif status == TRIAL:
            sub.update({"status": TRIAL, "plan_id": "trial", "trial_start": sub.get("trial_start") or _iso(_utcnow()),
                        "trial_end": _iso(end)})
        else:
            sub.update({"status": status, "current_period_start": sub.get("current_period_start") or _iso(_utcnow()),
                        "current_period_end": _iso(end), "plan_id": sub.get("plan_id") if sub.get("plan_id") not in (None, "trial") else "monthly",
                        "cancelled_at": _iso(_utcnow()) if status == CANCELLED else None})
        _save_sub(sub)
        _audit(org_id, actor, "STATUS_CORRECTED", f"{before.get('status')} -> {status}. Reason: {reason}", before, sub)
    return platform_detail(org_id)
