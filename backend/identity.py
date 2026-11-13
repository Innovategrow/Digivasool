"""
Organisations, users and memberships (the multi-tenant identity layer).

All of it lives in the reserved platform scope of the document store, so a tenant session
can never read or write it - only this module does, via platform_scope().

  organizations/<org_id>        id, organization_name, organization_code, status, created_at, updated_at
  users/<u_phone>               one global identity per verified phone number
  memberships/<org_id>:<phone>  (user, organisation, role): OWNER | ADMIN | COLLECTOR
                                one row per phone per organisation -> no duplicate memberships

A phone number may belong to several organisations. Borrowers are not stored here: their
membership is derived from the loans an organisation holds for that phone (BORROWER).
"""

import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from db import (
    LEGACY_ORG_ID, as_org, db_lock, get_db_client, list_books, normalize_phone,
    platform_scope, set_current_business, reset_current_business,
)

OWNER, ADMIN, COLLECTOR, BORROWER = "OWNER", "ADMIN", "COLLECTOR", "BORROWER"
STAFF_ROLES = (OWNER, ADMIN, COLLECTOR)
_RANK = {OWNER: 3, ADMIN: 2, COLLECTOR: 1}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db():
    return get_db_client("finance")   # platform scope is selected by the caller's `with platform_scope()`


def app_role(member_role: str) -> str:
    """Role string the rest of the app checks: OWNER/ADMIN -> admin, COLLECTOR -> collector."""
    return {OWNER: "admin", ADMIN: "admin", COLLECTOR: "collector", BORROWER: "borrower"}[member_role]


def phone_key(phone: str) -> str:
    return normalize_phone(phone or "")


def membership_id(org_id: str, phone: str) -> str:
    return f"{org_id}:{phone_key(phone)}"


# ── organisations ───────────────────────────────────────────────────────────

def get_org(org_id: str) -> Optional[Dict[str, Any]]:
    with platform_scope():
        snap = _db().collection("organizations").document(org_id).get()
        return snap.to_dict() if snap.exists else None


def list_orgs(active_only: bool = True) -> List[Dict[str, Any]]:
    with platform_scope():
        rows = [d.to_dict() for d in _db().collection("organizations").get()]
    return [o for o in rows if not active_only or o.get("status") == "active"]


def _next_org_id() -> str:
    nums = []
    for o in list_orgs(active_only=False):
        try:
            nums.append(int(o["id"].split("_")[1]))
        except Exception:
            pass
    return f"ORG_{(max(nums) + 1 if nums else 1):03d}"


def create_org(name: str, owner_phone: str, owner_name: str) -> Dict[str, Any]:
    """Create an organisation and make `owner_phone` its OWNER. Atomic id allocation (create-if-absent)."""
    name = (name or "").strip()
    if len(name) < 2:
        raise ValueError("Enter your organisation name")
    if len(name) > 80:
        raise ValueError("Organisation name is too long")
    if not phone_key(owner_phone):
        raise ValueError("A valid phone number is required")
    for _ in range(25):
        org_id = _next_org_id()
        record = {"id": org_id, "organization_name": name, "organization_code": org_id, "status": "active",
                  "created_at": _now(), "updated_at": _now(), "owner_phone": phone_key(owner_phone),
                  "subscription_managed": True}   # created after subscriptions existed (legacy orgs lack this)
        with platform_scope():
            if _db().collection("organizations").document(org_id).create(record):
                break
    else:
        raise RuntimeError("Could not allocate an organisation id")
    import subscriptions   # imported here: subscriptions imports this module
    try:
        # Trial or lifetime-free, decided on the server from the OTP-verified owner phone (never from the request).
        subscriptions.start_for_new_org(org_id, owner_phone)
        ensure_user(owner_phone, owner_name)
        add_membership(org_id, owner_phone, owner_name, OWNER, created_by="self-registration")
    except Exception:
        # All-or-nothing: never leave an organisation without an owner behind (it would be unreachable and
        # would keep its id). Nothing else can reference it yet, so removing it is safe.
        _discard_new_org(org_id, owner_phone)
        raise
    # every organisation starts with its own empty Finance / Fund books (built-in, nothing to create)
    return record


def _discard_new_org(org_id: str, owner_phone: str):
    mid = membership_id(org_id, owner_phone)
    with platform_scope():
        for coll, doc in (("memberships", mid), ("organization_subscriptions", org_id), ("organizations", org_id)):
            try:
                _db().collection(coll).document(doc).delete()
            except Exception:
                pass
    _index_remove(phone_key(owner_phone), mid)
    _cache.pop(mid, None)


# ── requests to join an organisation (need an admin's approval) ─────────────
# A verified phone that is not (yet) in an organisation can ASK to join one. It gets no access until an
# admin/owner of that organisation approves; approval creates the ordinary membership. One request per
# (organisation, phone): asking twice never duplicates it.

JOIN_REQUESTS = "join_requests"


def join_request_id(org_id: str, phone: str) -> str:
    return f"{org_id}:{phone_key(phone)}"


def create_join_request(org_id: str, phone: str, name: str) -> Dict[str, Any]:
    org = get_org(org_id)
    if not org or org.get("status") != "active":
        raise ValueError("No organisation found with that code")
    name = (name or "").strip()
    if len(name) < 2:
        raise ValueError("Enter your name")
    if not phone_key(phone):
        raise ValueError("A valid phone number is required")
    m = get_membership(membership_id(org_id, phone))
    if m and m.get("status") == "active":
        raise ValueError("You are already a member of this organisation. Sign in to continue.")
    rid = join_request_id(org_id, phone)
    with db_lock, platform_scope():
        ref = _db().collection(JOIN_REQUESTS).document(rid)
        snap = ref.get()
        if snap.exists and snap.to_dict().get("status") == "pending":
            return {**snap.to_dict(), "organization_name": org["organization_name"]}     # already asked: keep it
        record = {"id": rid, "org_id": org_id, "phone": phone, "phone_key": phone_key(phone), "name": name,
                  "status": "pending", "requested_at": _now(), "resolved_at": None, "resolved_by": None}
        ref.set(record)
    return {**record, "organization_name": org["organization_name"]}


def pending_join_requests(org_id: str) -> List[Dict[str, Any]]:
    with platform_scope():
        rows = [d.to_dict() for d in _db().collection(JOIN_REQUESTS).where("org_id", "==", org_id).get()]
    return sorted((r for r in rows if r.get("status") == "pending"), key=lambda r: r.get("requested_at", ""))


def pending_join_requests_for_phone(phone: str) -> List[Dict[str, Any]]:
    key = phone_key(phone)
    with platform_scope():
        rows = [d.to_dict() for d in _db().collection(JOIN_REQUESTS).where("phone_key", "==", key).get()]
    out = []
    for r in rows:
        org = get_org(r["org_id"]) if r.get("status") == "pending" else None
        if org and org.get("status") == "active":
            out.append({"organization_name": org["organization_name"], "requested_at": r["requested_at"]})
    return out


def get_join_request(org_id: str, rid: str) -> Optional[Dict[str, Any]]:
    with platform_scope():
        snap = _db().collection(JOIN_REQUESTS).document(rid).get()
        r = snap.to_dict() if snap.exists else None
    return r if r and r.get("org_id") == org_id else None      # a request of another organisation looks like "not found"


def resolve_join_request(org_id: str, rid: str, approve: bool, actor: str, role: str = COLLECTOR,
                         name: str = "") -> Dict[str, Any]:
    """Approve (creates the membership with `role`) or deny. Only a PENDING request of THIS organisation."""
    with db_lock:
        r = get_join_request(org_id, rid)
        if not r or r.get("status") != "pending":
            raise KeyError(rid)
        member = None
        if approve:
            member = add_membership(org_id, r["phone"], (name or r["name"]).strip(), role, created_by=actor)
        with platform_scope():
            _db().collection(JOIN_REQUESTS).document(rid).set(
                {**r, "status": "approved" if approve else "denied", "resolved_at": _now(), "resolved_by": actor,
                 "role": role if approve else None})
    return member or r


# ── one-time tokens ─────────────────────────────────────────────────────────

def consume_token(claims: Dict[str, Any]) -> bool:
    """Mark a short-lived register/select token as used. False if it was already used (replay)."""
    key = claims.get("jti") or f"{claims.get('phone_number', '')}:{claims.get('iat', '')}"   # tokens issued before jti existed
    with platform_scope():
        return _db().collection("used_tokens").document(f"register:{key}").create(
            {"used_at": _now(), "phone_key": phone_key(claims.get("phone_number", "")), "exp": claims.get("exp")})


def release_token(claims: Dict[str, Any]):
    key = claims.get("jti") or f"{claims.get('phone_number', '')}:{claims.get('iat', '')}"
    with platform_scope():
        _db().collection("used_tokens").document(f"register:{key}").delete()


def set_org_status(org_id: str, status: str):
    with platform_scope():
        _db().collection("organizations").document(org_id).update({"status": status, "updated_at": _now()})
    _cache.clear()


# ── users & memberships ─────────────────────────────────────────────────────

def ensure_user(phone: str, name: str = "") -> Dict[str, Any]:
    uid = f"u_{phone_key(phone)}"
    with platform_scope():
        ref = _db().collection("users").document(uid)
        snap = ref.get()
        if snap.exists:
            return snap.to_dict()
        record = {"id": uid, "phone_key": phone_key(phone), "phone": phone, "name": name, "created_at": _now()}
        if not ref.create(record):
            return ref.get().to_dict()
        return record


def add_membership(org_id: str, phone: str, name: str, role: str, created_by: str = "",
                   only_if_missing: bool = False) -> Dict[str, Any]:
    """Create (or re-activate / upgrade) the single membership of `phone` in `org_id`. Never duplicates.
    only_if_missing=True leaves an existing row untouched (even a removed one) - used by the legacy seed."""
    if role not in STAFF_ROLES:
        raise ValueError("Unknown role")
    if not phone_key(phone):
        raise ValueError("A valid phone number is required")
    user = ensure_user(phone, name)
    mid = membership_id(org_id, phone)
    record = {"id": mid, "org_id": org_id, "user_id": user["id"], "phone": phone, "phone_key": phone_key(phone),
              "name": name.strip() or user.get("name") or "User", "role": role, "status": "active",
              "created_at": _now(), "created_by": created_by, "sessions_revoked_before": 0}
    with platform_scope():
        ref = _db().collection("memberships").document(mid)
        if ref.create(record):
            _cache.pop(mid, None)
            _index_add(phone_key(phone), mid)
            return record
        existing = ref.get().to_dict()
        _index_add(phone_key(phone), mid)
        if only_if_missing:
            return existing
        # already there: reactivate if removed, never silently downgrade an existing higher role
        keep_role = role if _RANK[role] > _RANK.get(existing.get("role"), 0) or existing.get("status") != "active" else existing["role"]
        existing.update({"status": "active", "role": keep_role, "name": record["name"], "updated_at": _now()})
        ref.set(existing)
    _cache.pop(mid, None)
    return existing


def get_membership(mid: str) -> Optional[Dict[str, Any]]:
    with platform_scope():
        snap = _db().collection("memberships").document(mid).get()
        return snap.to_dict() if snap.exists else None


def org_memberships(org_id: str, active_only: bool = True) -> List[Dict[str, Any]]:
    with platform_scope():
        rows = [d.to_dict() for d in _db().collection("memberships").where("org_id", "==", org_id).get()]
    return [m for m in rows if not active_only or m.get("status") == "active"]


def update_membership(mid: str, **fields):
    with platform_scope():
        ref = _db().collection("memberships").document(mid)
        if not ref.get().exists:
            raise KeyError(mid)
        ref.update({**fields, "updated_at": _now()})
    _cache.pop(mid, None)


def revoke_sessions(mid: str):
    """Invalidate every session token issued to this membership before now (logout everywhere)."""
    update_membership(mid, sessions_revoked_before=time.time())


# Phone -> membership ids, so a login does not scan every membership of every organisation.
# Maintained by add_membership; built lazily (one scan, once per phone) for phones that existed before the index.

def _index_ids(key: str) -> Optional[List[str]]:
    with platform_scope():
        snap = _db().collection("membership_index").document(key).get()
        return list(snap.to_dict().get("ids", [])) if snap.exists else None


def _index_add(key: str, mid: str):
    with db_lock:
        ids = _index_ids(key)
        if ids is None:
            ids = _scan_membership_ids(key)
        if mid not in ids:
            ids.append(mid)
        with platform_scope():
            _db().collection("membership_index").document(key).set({"ids": ids})


def _index_remove(key: str, mid: str):
    with db_lock:
        ids = _index_ids(key)
        if ids is not None and mid in ids:
            with platform_scope():
                _db().collection("membership_index").document(key).set({"ids": [i for i in ids if i != mid]})


def _scan_membership_ids(key: str) -> List[str]:
    with platform_scope():
        return [d.to_dict()["id"] for d in _db().collection("memberships").where("phone_key", "==", key).get()]


def staff_memberships_for_phone(phone: str) -> List[Dict[str, Any]]:
    key = phone_key(phone)
    if not key:
        return []
    ids = _index_ids(key)
    if ids is None:                                   # first time for this phone: build the index from one scan
        with db_lock:
            ids = _index_ids(key)
            if ids is None:
                ids = _scan_membership_ids(key)
                with platform_scope():
                    _db().collection("membership_index").document(key).set({"ids": ids})
    rows = [m for m in (get_membership(i) for i in ids) if m]
    out = []
    for m in rows:
        if m.get("status") != "active":
            continue
        org = get_org(m["org_id"])
        if org and org.get("status") == "active":
            out.append({**m, "organization_name": org["organization_name"]})
    return out


# ── borrowers (derived, never stored) ───────────────────────────────────────

def _loans_for_phone_in_org(org_id: str, phone: str) -> List[Dict[str, Any]]:
    target, found = phone_key(phone), []
    with as_org(org_id):
        for book in (b["id"] for b in list_books()):
            tok = set_current_business(book)
            try:
                for d in get_db_client().collection("loans").get():
                    l = d.to_dict()
                    if l.get("is_deleted") or l.get("status") in {"deleted", "merged"}:
                        continue
                    if target in {phone_key(l.get("customer_phone", "")), phone_key(l.get("alternate_phone", ""))}:
                        found.append({**l, "_book": book})
            finally:
                reset_current_business(tok)
    return found


def borrower_memberships_for_phone(phone: str) -> List[Dict[str, Any]]:
    """Organisations that hold a live loan for this phone. Scans every active organisation."""
    out = []
    for org in list_orgs():
        loans = _loans_for_phone_in_org(org["id"], phone)
        if loans:
            out.append({"id": f"{org['id']}:{phone_key(phone)}:borrower", "org_id": org["id"],
                        "organization_name": org["organization_name"], "role": BORROWER,
                        "name": loans[0].get("customer_name", ""), "phone": phone, "business": loans[0]["_book"]})
    return out


def all_memberships_for_phone(phone: str) -> List[Dict[str, Any]]:
    return staff_memberships_for_phone(phone) + borrower_memberships_for_phone(phone)


# ── per-request membership check (so removing a collector takes effect at once) ──

_cache: Dict[str, Any] = {}
_CACHE_TTL = 15
_cache_lock = threading.Lock()


def membership_state(claims: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Live state of the token's membership: None if it (or its organisation) is no longer active or the
    token was revoked, else {"role": current stored role}. The role is read from the database, never
    trusted from the token, so ownership transfers and demotions apply immediately."""
    org_id, mid = claims.get("org_id"), claims.get("membership_id", "")
    key = f"{org_id}|{mid}|{claims.get('role')}|{claims.get('phone_number')}"
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        state = hit[1] if hit and hit[0] > now else None
    if state is None:
        org = get_org(org_id)
        if not org or org.get("status") != "active":
            state = {"ok": False}
        elif claims.get("role") == "borrower":
            state = {"ok": bool(_loans_for_phone_in_org(org_id, claims.get("phone_number", ""))), "revoked_before": 0, "role": BORROWER}
        else:
            m = get_membership(mid)
            state = {"ok": bool(m and m.get("status") == "active" and m.get("org_id") == org_id
                                and phone_key(m.get("phone", "")) == phone_key(claims.get("phone_number", ""))),
                     "revoked_before": (m or {}).get("sessions_revoked_before", 0), "role": (m or {}).get("role")}
        with _cache_lock:
            _cache[key] = (now + _CACHE_TTL, state)
    if not state["ok"] or float(claims.get("iat", 0)) < float(state.get("revoked_before", 0)):
        return None
    # a token for an app role the membership no longer has (e.g. admin demoted to collector) is invalid too
    if state["role"] != BORROWER and app_role(state["role"]) != claims.get("role"):
        return None
    return {"role": state["role"]}


def membership_is_valid(claims: Dict[str, Any]) -> bool:
    return membership_state(claims) is not None


def clear_cache():
    with _cache_lock:
        _cache.clear()


# ── legacy bootstrap (idempotent) ───────────────────────────────────────────

def seed_legacy_org() -> Dict[str, int]:
    """Create ORG_001 (if needed) and give every EXISTING admin / collector a membership in it.

    Sources, all read-only: ADMIN_USERS / COLLECTOR_USERS env values, staff added in the app (every
    book) and approved admin-access requests. After this the env values are no longer consulted for
    authorisation. Safe to re-run: existing memberships are left as they are."""
    from config_admins import ADMIN_USERS, COLLECTOR_USERS

    with platform_scope():
        ref = _db().collection("organizations").document(LEGACY_ORG_ID)
        if not ref.get().exists:
            ref.create({"id": LEGACY_ORG_ID, "organization_name": os.environ.get("LEGACY_ORG_NAME", "Existing Finance Organisation"),
                        "organization_code": LEGACY_ORG_ID, "status": "active", "created_at": _now(),
                        "updated_at": _now(), "legacy": True})

    admins: List[Dict[str, Any]] = [dict(a) for a in ADMIN_USERS]
    collectors: List[Dict[str, Any]] = [dict(c) for c in COLLECTOR_USERS]
    with as_org(LEGACY_ORG_ID):
        for book in (b["id"] for b in list_books()):
            tok = set_current_business(book)
            try:
                for d in get_db_client().collection("staff").get():
                    s = d.to_dict()
                    if s.get("is_active", True) and s.get("phone"):
                        if s.get("role") == "admin":
                            admins.append(s)
                        elif s.get("role") == "collector":   # "manager" rows stay profile-only (they never could log in)
                            collectors.append(s)
                for d in get_db_client().collection("admin_access_requests").get():
                    r = d.to_dict()
                    if r.get("status") == "approved" and r.get("phone"):
                        admins.append({"name": r.get("name", "Admin"), "phone": r["phone"]})
            finally:
                reset_current_business(tok)

    owner_phone = phone_key(os.environ.get("LEGACY_OWNER_PHONE", "")) or (phone_key(admins[0]["phone"]) if admins and admins[0].get("phone") else "")
    counts = {"owners": 0, "admins": 0, "collectors": 0}
    for a in admins:
        if not phone_key(a.get("phone", "")):
            continue
        role = OWNER if phone_key(a["phone"]) == owner_phone else ADMIN
        add_membership(LEGACY_ORG_ID, a["phone"], a.get("name", "Admin"), role, created_by="legacy-migration", only_if_missing=True)
        counts["owners" if role == OWNER else "admins"] += 1
    for c in collectors:
        if phone_key(c.get("phone", "")):
            add_membership(LEGACY_ORG_ID, c["phone"], c.get("name", "Collector"), COLLECTOR, created_by="legacy-migration", only_if_missing=True)
            counts["collectors"] += 1
    return counts
