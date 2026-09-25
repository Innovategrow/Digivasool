"""
Signed session tokens.

After a successful OTP login the backend issues an HMAC-SHA256 signed token
carrying the user's role, name and phone. Every protected endpoint derives the
caller's role from this token — never from a client-supplied header.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, Optional

from dotenv import load_dotenv

load_dotenv()

_SECRET = os.environ.get("AUTH_SECRET", "")
if not _SECRET:
    # Sessions still work, but they are invalidated on every restart.
    _SECRET = secrets.token_urlsafe(48)
    print("WARNING: AUTH_SECRET is not set — using a temporary secret. Set AUTH_SECRET in backend/.env for production.")

SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_HOURS", "720")) * 3600


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _sign(payload: str) -> str:
    return _b64(hmac.new(_SECRET.encode(), payload.encode(), hashlib.sha256).digest())


def issue_token(role: str, name: str, phone: str = "") -> str:
    payload = _b64(json.dumps({
        "role": role,
        "name": name,
        "phone": phone or "",
        "exp": int(time.time()) + SESSION_TTL_SECONDS,
    }).encode())
    return f"{payload}.{_sign(payload)}"


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        payload, signature = token.split(".", 1)
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        data = json.loads(_unb64(payload))
        if int(data.get("exp", 0)) < time.time():
            return None
        return data
    except Exception:
        return None
