"""Copy every Firestore document into Supabase (Postgres) and verify the copy.

Usage (from backend/):
    export DATABASE_URL='postgresql://...'            # Supabase pooler URI
    export FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
    python scripts/migrate_firestore_to_supabase.py            # copy, then verify
    python scripts/migrate_firestore_to_supabase.py --verify   # verify only
    python scripts/migrate_firestore_to_supabase.py --dry-run  # count only, write nothing

One-off tool (needs `pip install firebase-admin`; delete it once you are fully on Supabase).
Safe to re-run: documents are upserted by (collection, id). Nothing is ever
deleted from Firestore, and extra rows in Supabase are only reported, not removed.
"""

import hashlib
import json
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin  # noqa: E402
from firebase_admin import credentials, firestore  # noqa: E402

import db  # noqa: E402


def to_json(value):
    """Make a Firestore value JSON-safe (timestamps -> ISO strings, refs -> paths)."""
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if hasattr(value, "path") and hasattr(value, "id"):  # DocumentReference
        return value.path
    if isinstance(value, (bytes, bytearray)):
        import base64
        return base64.b64encode(value).decode()
    if hasattr(value, "latitude") and hasattr(value, "longitude"):  # GeoPoint
        return {"latitude": value.latitude, "longitude": value.longitude}
    return value


def digest(data) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


def walk(fs):
    """Yield (collection_path, doc_id, data) for every doc, including subcollections."""
    def recurse(coll):
        for snap in coll.stream():
            yield coll.id if coll.parent is None else "/".join(coll._path), snap.id, snap.to_dict() or {}
            for sub in snap.reference.collections():
                yield from recurse(sub)
    for coll in fs.collections():
        yield from recurse(coll)


def main():
    verify_only = "--verify" in sys.argv
    dry_run = "--dry-run" in sys.argv

    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-service-account.json")
    sa = sa if os.path.isabs(sa) else os.path.join(db.BACKEND_DIR, sa)
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(sa))
    fs = firestore.client()

    url = os.environ.get("DATABASE_URL", "").strip()
    if not url and not dry_run:
        sys.exit("Set DATABASE_URL to your Supabase connection string")
    pg = None if dry_run else db.PostgresStore(url)

    source = {}  # (collection, id) -> normalized data
    for coll, doc_id, data in walk(fs):
        source[(coll, doc_id)] = json.loads(json.dumps(to_json(data), default=str))

    per_coll = {}
    for (coll, _), _d in source.items():
        per_coll[coll] = per_coll.get(coll, 0) + 1
    print("Firestore:", ", ".join(f"{c}={n}" for c, n in sorted(per_coll.items())) or "(empty)")
    print(f"Total documents in Firestore: {len(source)}")
    if dry_run:
        return

    if not verify_only:
        # Full offline backup of Firestore BEFORE touching Supabase.
        backup_dir = os.path.join(db.BACKEND_DIR, "backups")
        os.makedirs(backup_dir, exist_ok=True)
        backup_path = os.path.join(backup_dir, f"firestore-{datetime.now():%Y%m%d-%H%M%S}.json")
        dump = {}
        for (coll, doc_id), data in source.items():
            dump.setdefault(coll, {})[doc_id] = data
        with open(backup_path, "w") as f:
            json.dump(dump, f, indent=1, default=str)
        print(f"Backup written: {backup_path} ({len(source)} documents) - keep this file safe.")

        for i, ((coll, doc_id), data) in enumerate(source.items(), 1):
            pg._write(db.LEGACY_ORG_ID, coll, doc_id, data)   # imported Firestore data belongs to the legacy organisation
            if i % 200 == 0:
                print(f"  copied {i}/{len(source)}")
        print(f"Copied {len(source)} documents.")

    # ── Verify ──
    missing, mismatched = [], []
    for (coll, doc_id), data in source.items():
        got = pg._read(coll, doc_id)
        if got is None:
            missing.append((coll, doc_id))
        elif digest(got) != digest(data):
            mismatched.append((coll, doc_id))

    extra = 0
    for coll in per_coll:
        ids = {i for i, _ in pg._scan(coll)}
        extra += len(ids - {d for c, d in source if c == coll})

    print(f"Verify: missing={len(missing)} mismatched={len(mismatched)} extra_in_supabase={extra}")
    for label, items in (("MISSING", missing), ("MISMATCH", mismatched)):
        for coll, doc_id in items[:20]:
            print(f"  {label}: {coll}/{doc_id}")
    if missing or mismatched:
        sys.exit("VERIFY FAILED - do not cut over")
    print("VERIFY OK - every Firestore document is present and identical in Supabase.")


if __name__ == "__main__":
    main()
