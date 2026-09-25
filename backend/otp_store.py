"""
In-memory OTP store with 5-minute expiry and a small attempt limit.
OTPs are short-lived by design, so they intentionally do not need persistence.
"""
import secrets
import time
from typing import Dict, List

_store: Dict[str, List] = {}  # key → [otp, expires_at, attempts_left]

OTP_TTL = 300  # 5 minutes
MAX_ATTEMPTS = 5


def generate_and_store(key: str) -> str:
    otp = f"{secrets.randbelow(900000) + 100000}"
    _store[key] = [otp, time.time() + OTP_TTL, MAX_ATTEMPTS]
    return otp


def verify(key: str, otp: str) -> bool:
    entry = _store.get(key)
    if not entry:
        return False
    stored_otp, expires_at, attempts_left = entry
    if time.time() > expires_at or attempts_left <= 0:
        _store.pop(key, None)
        return False
    if secrets.compare_digest(stored_otp, (otp or "").strip()):
        _store.pop(key, None)
        return True
    entry[2] = attempts_left - 1
    if entry[2] <= 0:
        _store.pop(key, None)
    return False


def cleanup_expired():
    now = time.time()
    for k in [k for k, v in _store.items() if now > v[1]]:
        _store.pop(k, None)
