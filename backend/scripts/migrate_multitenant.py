#!/usr/bin/env python3
"""
Multi-tenant migration runner for the DigiVasool Postgres database.

    python scripts/migrate_multitenant.py inspect                       # read-only report
    python scripts/migrate_multitenant.py backup  --out backup.dump     # pg_dump (needs the pg_dump tool)
    python scripts/migrate_multitenant.py apply   --backup-file backup.dump --yes
    python scripts/migrate_multitenant.py verify  --snapshot migration_snapshot_<ts>.json
    python scripts/migrate_multitenant.py rollback --backup-file backup.dump --yes

Uses DATABASE_URL (from backend/.env or the environment). NOTHING here runs by itself: `apply` and
`rollback` refuse without --yes and without a fresh backup file. `apply` is one transaction (all or
nothing), never deletes a row, and proves afterwards that every row, every Finance/Fund total and a
content checksum of all existing data are identical, with everything now under ORG_001.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv()
import psycopg  # noqa: E402

from migrations import runner  # noqa: E402

LEGACY = "ORG_001"
MONEY_FIELDS = {"loans": ("loan_amount", "collected_amount", "pending_amount", "due_amount"),
                "loan_payments": ("amount",), "expenses": ("amount",), "capital": ("amount",), "transactions": ("amount",)}


def url() -> str:
    u = os.environ.get("DATABASE_URL", "").strip()
    if not u:
        sys.exit("DATABASE_URL is not set.")
    return u


def connect():
    return psycopg.connect(url(), autocommit=True)


def describe_target() -> str:
    p = urlparse(url())
    return f"{p.hostname}:{p.port or 5432}{p.path}"


def has_org(c) -> bool:
    return bool(c.execute("SELECT 1 FROM information_schema.columns WHERE table_name='documents' AND column_name='org_id'").fetchone())


def snapshot(c) -> dict:
    """Row counts, Finance/Fund money totals, orphan counts and a content checksum - works before AND after."""
    org_col = has_org(c)
    where = f"WHERE org_id = '{LEGACY}'" if org_col else ""     # after migration, compare ORG_001 only
    rows = c.execute(f"SELECT collection, id, data FROM documents {where} ORDER BY collection, id").fetchall()
    counts, totals, loans, pay_loan_ids = defaultdict(int), defaultdict(lambda: defaultdict(Decimal)), defaultdict(set), defaultdict(list)
    digest = hashlib.sha256()
    for collection, doc_id, data in rows:
        counts[collection] += 1
        digest.update(f"{collection}\x00{doc_id}\x00{json.dumps(data, sort_keys=True)}\n".encode())
        base = collection[5:] if collection.startswith("fund_") else collection
        book = "fund" if collection.startswith("fund_") else "finance"
        if base in MONEY_FIELDS:
            totals[book][f"{base}.count"] += 1
            for f in MONEY_FIELDS[base]:
                totals[book][f"{base}.{f}"] += Decimal(str(data.get(f) or 0))
        if base == "loans":
            loans[book].add(doc_id)
        if base == "loan_payments":
            pay_loan_ids[book].append(data.get("loan_id"))
    orphans = {b: sum(1 for lid in ids if lid not in loans[b]) for b, ids in pay_loan_ids.items()}
    files = c.execute(f"SELECT count(*) FROM files {where}").fetchone()[0]
    return {"taken_at": datetime.now().isoformat(timespec="seconds"), "database": describe_target(),
            "multi_tenant_schema": org_col, "counts": dict(counts),
            "totals": {b: {k: str(v) for k, v in sorted(t.items())} for b, t in totals.items()},
            "orphan_payments": orphans, "files": files, "checksum": digest.hexdigest()}


def cmd_inspect(a):
    c = connect()
    print(f"Target: {describe_target()}   multi-tenant schema: {has_org(c)}")
    for t, n in c.execute("SELECT 'documents', count(*) FROM documents UNION ALL SELECT 'files', count(*) FROM files").fetchall():
        print(f"  table {t}: {n} rows")
    if has_org(c):
        for org, n in c.execute("SELECT org_id, count(*) FROM documents GROUP BY 1 ORDER BY 1").fetchall():
            print(f"  org {org}: {n} documents")
    snap = snapshot(c)
    print("\nRows per collection:")
    for k, v in sorted(snap["counts"].items()):
        print(f"  {k:28} {v}")
    print("\nTotals:")
    for book, t in snap["totals"].items():
        print(f"  [{book}]")
        for k, v in t.items():
            print(f"    {k:32} {v}")
    print(f"\nOrphan payments (loan missing): {snap['orphan_payments'] or 'none'}")
    print(f"Content checksum: {snap['checksum']}")
    print("Foreign keys: none - records are JSON documents; relationships are ids inside the data (checked above as 'orphans').")


def cmd_backup(a):
    if not shutil.which("pg_dump"):
        sys.exit("pg_dump not found. Install the PostgreSQL client tools, or take a backup from the Supabase dashboard "
                 "(Database > Backups) and pass that file to --backup-file.")
    subprocess.run(["pg_dump", "--format=custom", "--no-owner", "--file", a.out, url()], check=True)
    print(f"Backup written: {a.out} ({os.path.getsize(a.out):,} bytes)")


def check_backup(path):
    if not path or not os.path.isfile(path) or os.path.getsize(path) == 0:
        sys.exit("Refusing to continue: --backup-file must point to a real, non-empty backup you just took.")
    if time.time() - os.path.getmtime(path) > 24 * 3600:
        sys.exit("Refusing to continue: that backup is more than 24 hours old. Take a fresh one.")


def compare(before: dict, after: dict) -> list:
    problems = []
    if before["counts"] != after["counts"]:
        problems.append(f"row counts differ: {before['counts']} vs {after['counts']}")
    if before["totals"] != after["totals"]:
        problems.append("Finance/Fund totals differ")
    if before["checksum"] != after["checksum"]:
        problems.append("content checksum differs (a record changed)")
    if before["files"] != after["files"]:
        problems.append("file count differs")
    return problems


def cmd_apply(a):
    check_backup(a.backup_file)
    if not a.yes:
        sys.exit("Add --yes to run. This changes the database (one transaction; reversible with `rollback`).")
    c = connect()
    if has_org(c):
        sys.exit("The database already has org_id - nothing to do. Run `verify` instead.")
    before = snapshot(c)
    snap_file = f"migration_snapshot_{datetime.now():%Y%m%d_%H%M%S}.json"
    with open(snap_file, "w") as fh:
        json.dump(before, fh, indent=2)
    print(f"Target {describe_target()}\nBefore-migration snapshot saved: {snap_file}")
    print(f"  {sum(before['counts'].values())} documents, checksum {before['checksum'][:16]}...")
    try:
        with c.transaction():
            c.execute(runner.read_sql("001_multitenant_up.sql"))
            after_sql = snapshot(c)
            problems = compare(before, after_sql)
            if problems:
                raise RuntimeError("; ".join(problems))
    except Exception as e:
        sys.exit(f"MIGRATION FAILED and was rolled back automatically - nothing changed.\n  {e}")
    print("Schema migrated inside one transaction and verified (counts, totals, checksum identical).")
    # existing admins & collectors -> memberships of ORG_001 (idempotent, never duplicates)
    os.environ.setdefault("DB_BACKEND", "supabase")
    import identity
    from db import as_org  # noqa: F401
    counts = identity.seed_legacy_org()
    print(f"Existing people migrated into {LEGACY}: {counts}")
    sys.exit(0 if verify_all(before) else 1)


def verify_all(before: dict) -> bool:
    c = connect()
    after = snapshot(c)
    problems = compare(before, after)
    checks = {
        "RLS enabled on documents/files": all(r[0] for r in c.execute("SELECT relrowsecurity FROM pg_class WHERE relname IN ('documents','files')").fetchall()),
        "restricted role digivasool_app exists (no bypass)": c.execute("SELECT NOT rolbypassrls AND NOT rolsuper FROM pg_roles WHERE rolname='digivasool_app'").fetchone() == (True,),
        "no document without an org_id": c.execute("SELECT count(*) FROM documents WHERE org_id IS NULL OR org_id = ''").fetchone()[0] == 0,
        f"{LEGACY} organisation registered": c.execute("SELECT 1 FROM documents WHERE org_id='__platform__' AND collection='organizations' AND id=%s", (LEGACY,)).fetchone() is not None,
        "at least one admin membership in ORG_001": c.execute("SELECT count(*) FROM documents WHERE org_id='__platform__' AND collection='memberships' AND data->>'org_id'=%s AND data->>'role' IN ('OWNER','ADMIN')", (LEGACY,)).fetchone()[0] > 0,
        "exactly one OWNER in ORG_001": c.execute("SELECT count(*) FROM documents WHERE org_id='__platform__' AND collection='memberships' AND data->>'org_id'=%s AND data->>'role'='OWNER'", (LEGACY,)).fetchone()[0] == 1,
    }
    for k, ok in checks.items():
        print(f"  [{'OK' if ok else 'FAIL'}] {k}")
        if not ok:
            problems.append(k)
    print(f"  [{'OK' if not compare(before, after) else 'FAIL'}] rows / Finance+Fund totals / content checksum identical to before")
    print("\nVERIFIED" if not problems else "\nPROBLEMS: " + "; ".join(problems) + "\nRoll back with: python scripts/migrate_multitenant.py rollback --backup-file <file> --yes")
    return not problems


def cmd_verify(a):
    with open(a.snapshot) as fh:
        sys.exit(0 if verify_all(json.load(fh)) else 1)


def cmd_rollback(a):
    check_backup(a.backup_file)
    if not a.yes:
        sys.exit("Add --yes to roll back.")
    c = connect()
    if not has_org(c):
        sys.exit("Nothing to roll back: this database is not on the multi-tenant schema.")
    try:
        with c.transaction():
            c.execute(runner.read_sql("001_multitenant_down.sql"))
    except psycopg.errors.RaiseException as e:
        sys.exit(f"ROLLBACK REFUSED, nothing changed: {str(e).splitlines()[0]}")
    print("Rolled back to the pre-migration schema. Deploy the previous application version.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inspect").set_defaults(fn=cmd_inspect)
    b = sub.add_parser("backup"); b.add_argument("--out", required=True); b.set_defaults(fn=cmd_backup)
    ap = sub.add_parser("apply"); ap.add_argument("--backup-file"); ap.add_argument("--yes", action="store_true"); ap.set_defaults(fn=cmd_apply)
    v = sub.add_parser("verify"); v.add_argument("--snapshot", required=True); v.set_defaults(fn=cmd_verify)
    r = sub.add_parser("rollback"); r.add_argument("--backup-file"); r.add_argument("--yes", action="store_true"); r.set_defaults(fn=cmd_rollback)
    args = p.parse_args()
    args.fn(args)
