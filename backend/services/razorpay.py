"""
Thin Razorpay client (Orders API + signature checks). Uses plain HTTPS so no extra SDK is needed.

Secrets come only from the environment and never leave the server:
  RAZORPAY_KEY_ID          public id (this one IS sent to the browser for Checkout)
  RAZORPAY_KEY_SECRET      signs/verifies checkout payments and authenticates API calls
  RAZORPAY_WEBHOOK_SECRET  verifies webhook deliveries

Docs: https://razorpay.com/docs/api/orders/  https://razorpay.com/docs/webhooks/validate-test/
"""

import hashlib
import hmac
import os
from typing import Any, Dict, Optional

import httpx

API_BASE = "https://api.razorpay.com/v1"
TIMEOUT = 15


class RazorpayError(Exception):
    """The gateway could not be reached or rejected the request."""


def key_id() -> str:
    return os.environ.get("RAZORPAY_KEY_ID", "").strip()


def _key_secret() -> str:
    return os.environ.get("RAZORPAY_KEY_SECRET", "").strip()


def _webhook_secret() -> str:
    return os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()


def configured() -> bool:
    """Can we take payments? (order creation + checkout verification)"""
    return bool(key_id() and _key_secret())


def webhook_configured() -> bool:
    return bool(_webhook_secret())


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_checkout_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Razorpay Checkout returns signature = HMAC_SHA256(order_id|payment_id, key_secret)."""
    secret = _key_secret()
    if not (secret and order_id and payment_id and signature):
        return False
    expected = _hmac_hex(secret, f"{order_id}|{payment_id}".encode())
    return hmac.compare_digest(expected, str(signature))


def verify_webhook_signature(raw_body: bytes, signature: str) -> bool:
    """Webhook signature = HMAC_SHA256(raw request body, webhook_secret). Must use the RAW bytes."""
    secret = _webhook_secret()
    if not (secret and signature):
        return False
    return hmac.compare_digest(_hmac_hex(secret, raw_body), str(signature))


def _request(method: str, path: str, json_body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    try:
        resp = httpx.request(method, f"{API_BASE}{path}", json=json_body, auth=(key_id(), _key_secret()), timeout=TIMEOUT)
    except httpx.HTTPError as exc:
        raise RazorpayError(f"Could not reach the payment gateway: {exc.__class__.__name__}")
    if resp.status_code >= 400:
        raise RazorpayError(f"Payment gateway error {resp.status_code}")
    try:
        return resp.json()
    except ValueError:
        raise RazorpayError("Payment gateway returned an unreadable response")


def create_order(amount_paise: int, currency: str, receipt: str, notes: Dict[str, str]) -> Dict[str, Any]:
    return _request("POST", "/orders", {"amount": int(amount_paise), "currency": currency,
                                       "receipt": receipt, "notes": notes})


def fetch_payment(payment_id: str) -> Dict[str, Any]:
    return _request("GET", f"/payments/{payment_id}")
