"""
In-memory OTP store with 5-minute expiry.
"""
import random
import time
from typing import Optional

_store: dict[str, tuple[str, float]] = {}  # key → (otp, expires_at)

OTP_TTL = 300  # 5 minutes


def generate_and_store(key: str) -> str:
    otp = str(random.randint(100000, 999999))
    _store[key] = (otp, time.time() + OTP_TTL)
    return otp


def verify(key: str, otp: str) -> bool:
    entry = _store.get(key)
    if not entry:
        return False
    stored_otp, expires_at = entry
    if time.time() > expires_at:
        _store.pop(key, None)
        return False
    if stored_otp == otp.strip():
        _store.pop(key, None)
        return True
    return False


def cleanup_expired():
    now = time.time()
    expired = [k for k, (_, exp) in _store.items() if now > exp]
    for k in expired:
        _store.pop(k, None)
