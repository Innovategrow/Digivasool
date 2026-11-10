"""
Signed tokens (standard HS256 JWT, no third-party dependency).

Three token types, told apart by the `typ` claim so one can never be used as another:

  session   - org-scoped login. Carries user id, org_id, membership_id, role, phone, iat, exp.
              The ONLY source of the organisation for every protected endpoint.
  select    - proves a phone number passed OTP and has several memberships; exchanged for a
              session token at POST /organizations/select. Short-lived.
  register  - proves a phone number passed OTP and has no organisation yet; exchanged for a
              session token at POST /organizations/register. Short-lived.
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
elif len(_SECRET) < 32:
    print("WARNING: AUTH_SECRET is shorter than 32 characters. Use a long random value in production.")

SESSION_TTL_SECONDS = int(os.environ.get("SESSION_TTL_HOURS", "168")) * 3600   # default 7 days
SHORT_TTL_SECONDS = 10 * 60                                                     # select / register tokens

_HEADER = {"alg": "HS256", "typ": "JWT"}


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _sign(signing_input: str) -> str:
    return _b64(hmac.new(_SECRET.encode(), signing_input.encode(), hashlib.sha256).digest())


def _encode(claims: Dict[str, Any]) -> str:
    head = _b64(json.dumps(_HEADER, separators=(",", ":")).encode())
    body = _b64(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{head}.{body}"
    return f"{signing_input}.{_sign(signing_input)}"


def issue_token(role: str, name: str, phone: str = "", *, org_id: str, membership_id: str = "",
                user_id: str = "", member_role: str = "", ttl: Optional[int] = None) -> str:
    """Org-scoped session token. `role` is the app role (admin / collector / borrower);
    `member_role` is the stored membership role (OWNER / ADMIN / COLLECTOR / BORROWER)."""
    if not org_id:
        raise ValueError("A session token must carry an org_id")
    now = time.time()
    return _encode({
        "typ": "session",
        "sub": user_id or phone or name,
        "org_id": org_id,
        "membership_id": membership_id,
        "role": role,
        "member_role": member_role or role.upper(),
        "phone_number": phone or "",
        "name": name,
        "iat": round(now, 3),
        "exp": int(now) + (ttl or SESSION_TTL_SECONDS),
    })


def issue_short_token(typ: str, phone: str, name: str = "") -> str:
    """Proof that `phone` just passed OTP verification (typ = 'select' | 'register')."""
    if typ not in ("select", "register"):
        raise ValueError("Unknown token type")
    now = int(time.time())
    return _encode({"typ": typ, "sub": phone, "phone_number": phone, "name": name,
                    "iat": now, "exp": now + SHORT_TTL_SECONDS})


def decode_token(token: str, expected_typ: str = "session") -> Optional[Dict[str, Any]]:
    """Return the claims if the signature, algorithm, type and expiry are all valid; otherwise None."""
    try:
        head, body, signature = token.split(".")
        if not hmac.compare_digest(signature, _sign(f"{head}.{body}")):
            return None
        if json.loads(_unb64(head)).get("alg") != "HS256":   # never accept alg=none or others
            return None
        data = json.loads(_unb64(body))
        if int(data.get("exp", 0)) < time.time():
            return None
        if data.get("typ") != expected_typ:
            return None
        if expected_typ == "session" and not data.get("org_id"):   # a session without an org is invalid
            return None
        return data
    except Exception:
        return None
