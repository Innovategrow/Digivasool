"""
Subscription rollout for EXISTING organisations. The schema needs no DDL (subscription data lives in the
platform scope of the document store), so this is purely a data step, and it is optional:

  * Without it, an organisation created before subscriptions existed is treated as `grandfathered` at request
    time (full access, no expiry; or lifetime-free if its owner is an authorised number). Nothing is written.
  * `apply` makes that explicit by saving a record per existing organisation, and can pin a deadline.

    python scripts/migrate_subscriptions.py inspect
    python scripts/migrate_subscriptions.py apply --yes [--grace-days 60]
    python scripts/migrate_subscriptions.py rollback --yes [--everything]

`inspect` is read-only. `apply` only ADDS records (never edits or deletes an organisation, loan, payment or
member); records it creates are tagged so `rollback` removes exactly those. Set SUBSCRIPTION_EXEMPT_PHONES in
the environment BEFORE `apply` so existing organisations owned by those numbers are saved as lifetime-free.
--grace-days N turns the "no expiry" into a trial that ends N days from now (an explicit, announced policy).
`rollback --everything` also removes trial/paid records of NEW organisations (their trial would restart) and
never touches payment records.
"""
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

import db  # noqa: E402
import identity  # noqa: E402
import subscriptions as S  # noqa: E402


def legacy_orgs():
    return [o for o in identity.list_orgs(active_only=False) if not o.get("subscription_managed")]


def cmd_inspect(_):
    print(f"Exempt numbers configured: {len(S.exempt_phones())} (values are never printed)")
    for o in identity.list_orgs(active_only=False):
        sub = S._get(S.SUBS_C, o["id"])
        eff = S.get_subscription(o["id"]) if (sub or not o.get("subscription_managed")) else None
        ev = S.evaluate(eff) if eff else None
        print(f"{o['id']:10} {o.get('organization_name','')[:32]:32} saved={'yes' if sub else 'no ':3} "
              f"state={(ev or {}).get('state', 'trial (will start)')}")
    print("\nNothing was changed.")


def cmd_apply(a):
    if not a.yes:
        sys.exit("Refusing: re-run with --yes after reading `inspect`")
    S.sync_plans()
    now = datetime.now(timezone.utc)
    created = 0
    for o in legacy_orgs():
        if S._get(S.SUBS_C, o["id"]):
            continue
        owner = S._owner_phone(o["id"])
        if S.is_exempt_phone(owner):
            sub = S._new_sub(o["id"], status=S.EXEMPT, is_exempt=True)
        elif a.grace_days:
            sub = S._new_sub(o["id"], status=S.TRIAL, plan_id="trial", trial_start=S._iso(now),
                             trial_end=S._iso(now + timedelta(days=a.grace_days)))
        else:
            sub = S._new_sub(o["id"], status=S.GRANDFATHERED)
        sub["migrated"] = True
        S._create(S.SUBS_C, o["id"], sub)
        created += 1
        print(f"{o['id']}: saved as {sub['status']}")
    print(f"Done: {created} record(s) added. No other data was touched.")


def cmd_rollback(a):
    if not a.yes:
        sys.exit("Refusing: re-run with --yes")
    removed = 0
    with db.platform_scope():
        coll = db.get_db_client("finance").collection(S.SUBS_C)
        for d in coll.get():
            if a.everything or d.to_dict().get("migrated"):
                d.reference.delete()
                removed += 1
    S.invalidate()
    print(f"Removed {removed} subscription record(s). Payments and organisation data were not touched.")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("inspect").set_defaults(fn=cmd_inspect)
    ap = sub.add_parser("apply"); ap.add_argument("--yes", action="store_true"); ap.add_argument("--grace-days", type=int, default=0)
    ap.set_defaults(fn=cmd_apply)
    r = sub.add_parser("rollback"); r.add_argument("--yes", action="store_true"); r.add_argument("--everything", action="store_true")
    r.set_defaults(fn=cmd_rollback)
    args = p.parse_args()
    db.init_db()
    args.fn(args)
