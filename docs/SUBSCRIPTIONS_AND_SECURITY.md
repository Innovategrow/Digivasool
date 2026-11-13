# Subscriptions, Razorpay payments and the Phase 2 security hardening

Nothing described here has been deployed or run against production. Everything was verified on SQLite and on a
local Postgres 16 (RLS enforced). Read section 7 before deploying.

## 1. Business rules (as implemented)

| Organisation | Access |
|---|---|
| Created by one of the **3 exempt numbers** (`SUBSCRIPTION_EXEMPT_PHONES`) | Lifetime free for the organisation and every staff member. No trial, no payment, never read-only. |
| Created by anyone else | **7-day trial** (full access) → paid **Monthly** or **Annual** plan → **read-only** when it ends. |
| Existed before this release | **Grandfathered**: full access, no expiry, nothing written. Owned by an exempt number → lifetime free. |

Read-only means the server answers every POST/PUT/PATCH/DELETE under `/api/` with **HTTP 402** (deny by default,
`SubscriptionMiddleware` in `main.py`). GETs (borrowers, loans, payment history, reports, Excel export, invoices),
login/OTP, the subscription endpoints, the payment webhook, leaving/deleting your account and removing staff stay open.

* The trial belongs to the **organisation** and is created once, in `identity.create_org`. Logging in, logging out,
  new devices and adding staff never touch it (`start_for_new_org` is create-if-absent).
* Exemption is decided **only on the server**, from the OTP-verified phone of the person creating the organisation.
  Being *staff* in someone else's organisation grants nothing. Request bodies/headers cannot set it (tested).
* **Ownership transfer policy.** Exemption belongs to the organisation as it was created.
  * To another exempt number: stays exempt.
  * To a non-exempt number: refused (HTTP 409) unless the owner confirms (`?confirm_exemption_loss=true`; the app
    asks); then the free access ends and a **fresh 7-day trial** starts (no lock-out, no free ride for the new owner).
  * A non-exempt organisation handed to an exempt number stays non-exempt.
* Only the **Owner** can see details, choose a plan, pay, renew, cancel or download invoices. Admins/collectors get only
  the access state (`GET /api/subscriptions/current` returns a minimal object for them).
* The exempt numbers are never returned by any API. More than 3 configured → only the first 3 are used (logged).
* A **platform admin** (`PLATFORM_ADMIN_PHONES`, deliberately separate from the exempt numbers) can open `/platform`:
  organisation/revenue overview, search, payment history, extend a trial, correct a status — every change goes to the
  `subscription_audit` collection. Exempt organisations cannot be changed there and exemption cannot be granted there.

## 1b. Joining an organisation needs an admin's approval

A new user can sign in with OTP and either create their own organisation or **ask to join** an existing one by its
organisation code (shown to the owner/admins on the Staff screen). They get **no access** until approved.

* `POST /api/organizations/join-request` (needs a fresh OTP-verified register/select token; 5 requests per phone per hour;
  one pending request per organisation+phone). After OTP, the app tells them which requests are still waiting.
* `GET /api/organizations/join-requests` (owner/admin) lists people waiting for *your* organisation, shown under Notifications.
* `POST /api/organizations/join-requests/{id}/approve` `{role: "collector"|"admin", name?}`: any admin can approve a collector;
  **only the owner** can approve an admin. This creates the normal membership (so the person can sign in) and the Staff entry.
  Blocked while the organisation is read-only (it adds a person). A duplicate collector name asks the admin to give another.
* `POST /api/organizations/join-requests/{id}/deny`. Denied people can ask again.
* Requests are scoped to their organisation: another organisation's admin gets 404. Collectors get 403. Locked organisations and
  existing members cannot be asked. Admins can still add staff directly (`POST /api/staff/`) as before.

## 2. Data model

No SQL tables are added (the app stores everything in `documents(org_id, collection, id, data)`). The subscription
data are collections in the **platform scope** (`org_id='__platform__'`), which a tenant token cannot reach, and RLS
still applies. The document id is the unique key.

| Requested entity | Collection | Key / uniqueness |
|---|---|---|
| subscription_plans | `subscription_plans` | plan id (`trial`, `monthly`, `annual`); `price` in **integer paise**; synced from config at startup |
| organization_subscriptions | `organization_subscriptions` | `org_id` (one per organisation) |
| subscription_payments | `subscription_payments` | Razorpay **order id** (unique); `subscription_payment_ids/<payment id>` claims each payment id for exactly one order |
| payment_webhook_events | `payment_webhook_events` | Razorpay **event id** (unique → duplicate deliveries are ignored) |
| (audit) | `subscription_audit` | operator changes, with before/after |

Trade-off vs a relational schema: there are no database foreign keys (as for all existing data). Referential rules are
enforced in `subscriptions.py`. Subscription payments are stored apart from borrower payments (`loan_payments`).

## 3. Payment flow (Razorpay Orders; no recurring mandate is assumed)

1. Owner → `POST /api/subscriptions/create-order` `{plan_type}`. Server picks the price, creates the Razorpay order
   (secret key stays on the server), stores `created`, returns `order_id`, `amount`, public `key_id`.
2. Browser opens Checkout (UPI / card / netbanking).
3. Browser → `POST /api/subscriptions/verify-payment`. Server checks the checkout **signature**, then **fetches the
   payment from Razorpay** and requires `captured` with the same order id, amount and currency.
4. Razorpay → `POST /api/webhooks/razorpay`. Server verifies the signature over the **raw body**, ignores repeated event
   ids, re-checks with Razorpay and activates. Verify + webhook together activate **once**.
5. Activation extends from the paid-through date (or the end of a running trial); it never shortens anything.
   `failed` payments and `authorized`/pending payments never activate; a paid order is never downgraded.
6. Renewal (`POST /api/subscriptions/renew`) is a new order. `cancel` turns renewal off and keeps access to the end date.

Payment id reuse across orders → 409. Another organisation presenting your order → 404.

## 4. API summary

Added: `GET /api/subscriptions/current|plans|payment-history|invoices`, `POST /api/subscriptions/create-order|renew|verify-payment|cancel`,
`POST /api/webhooks/razorpay`, `GET /api/platform/subscriptions[ /analytics | /{org_id} ]`,
`POST /api/platform/subscriptions/{org_id}/extend-trial|set-status`.
Changed: `POST /api/staff/{id}/make-owner` (optional `confirm_exemption_loss`), `GET /api/dashboard/` (collectors get only their
own numbers), `POST /api/loans/upload-proof` (images/PDF only), `GET /api/health` (no backup details),
`POST /api/organizations/register` (token is single-use). Added: the four `/api/organizations/join-request(s)` endpoints (section 1b). `GET /uploads/*` adds `X-Content-Type-Options: nosniff`.

## 5. Phase 2 security changes

| Audit finding | Change |
|---|---|
| Front-end cache showed the previous organisation's data | `dk_app_data_<org>_<book>`; `clearSession()` wipes all `dk_app_data*` and the read marker on sign-in/out/switch |
| Registration token replayable | tokens carry `jti`; `register` consumes it (`used_tokens`); released if creation fails |
| Organisation creation not atomic | `create_org` rolls back org, subscription and membership if any step fails |
| Collectors saw organisation-wide totals | `get_dashboard_summary_db(collector_name)` |
| RLS not forced | **migration 002** `FORCE ROW LEVEL SECURITY` + revoke `anon`/`authenticated` (explicit, reversible, not applied automatically) |
| Full scans for phone → memberships | `membership_index` (lazy-built, maintained by `add_membership`) |
| Rate limits behind a proxy | `TRUSTED_PROXY_HOPS` (default 0 = unchanged) |
| Upload / health hardening | see section 4 |

## 6. Tests

`cd backend && .venv/bin/python -m pytest tests -q --ignore=tests/test_rls_postgres.py` → **122 passed**
(41 existing + 55 `test_subscription.py` + 16 `test_security_phase2.py` + 10 `test_join_requests.py`; the Postgres-only test is skipped without env).
On real Postgres (scratch databases): `MT_TEST_DATABASE_URL=… pytest tests/test_subscription.py tests/test_security_phase2.py`,
`MT_TEST_DATABASE_URL=… pytest tests/test_multitenant.py`, `RLS_TEST_DATABASE_URL=… pytest tests/test_rls_postgres.py tests/test_security_phase2.py`.
Frontend: `cd web && npm run build` (passes; ESLint shows only the 9 pre-existing findings). Razorpay is faked in tests; do a
test-mode payment yourself (section 7, step 9) before going live.

## 7. Deployment (do NOT skip steps; nothing here has been run for you)

1. **Back up** Supabase (Database → Backups) or `python scripts/migrate_multitenant.py backup --out backup.dump`.
2. **Render environment** (dashboard; never in git): `SUBSCRIPTION_EXEMPT_PHONES` (the three numbers, 10 digits, comma-separated),
   `PLATFORM_ADMIN_PHONES` (operators), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`; adjust
   `MONTHLY_PLAN_PRICE` / `ANNUAL_PLAN_PRICE` (rupees). Start with Razorpay **test** keys.
3. **(Optional) pin existing organisations.** `python scripts/migrate_subscriptions.py inspect`, then `apply --yes`
   (add `--grace-days N` only if you decide existing customers should get a deadline - announce it first). Without this step
   existing organisations are grandfathered anyway. Rollback: `rollback --yes` (only records it created).
4. **Deploy** backend + web. No schema change is needed; plans are written to the platform scope at startup.
5. **Razorpay Dashboard → Webhooks:** URL `https://<your-api>.onrender.com/api/webhooks/razorpay`, secret = `RAZORPAY_WEBHOOK_SECRET`,
   events `payment.captured`, `payment.failed`, `order.paid`.
6. **Netlify:** no change (Checkout loads from `checkout.razorpay.com`; the secret key is never in any `VITE_` variable).
7. **Rate limits:** look at one real request's `X-Forwarded-For` (e.g. temporarily log it), then set `TRUSTED_PROXY_HOPS` to the
   number of proxies in front of the app. Until then OTP limits are per proxy address, not per user.
8. **(Optional, recommended) FORCE RLS:** `python scripts/migrate_security.py status`, then
   `apply --backup-file backup.dump --yes`. Roll back with `rollback --yes`. Order: roll back 002 **before** 001. While 002 is
   applied, scripts that connect as the table owner see no rows unless the role has BYPASSRLS (Supabase `postgres` has it).
9. **Smoke test with test keys:** exempt number registers → shows Lifetime Free; another number registers → 7-day trial; expire
   it (platform dashboard "correct status" with a past date) → writes give 402, reads work; pay with Razorpay test UPI/card →
   active; check the webhook delivery log shows 200; switch to live keys.

**Rollback of the release:** redeploy the previous Render/Netlify version. Subscription collections are inert for the old code.
`migrate_security.py rollback` and `migrate_subscriptions.py rollback --yes` undo the optional steps. Payment records are never deleted.

## 8. Remaining risks (not fixed in this change)

* **Single backend process assumed.** `db_lock`, OTP state, rate limits and the 15 s membership cache are in memory; a second Render
  instance would break payment-total atomicity and OTP checks. Needs Redis / row-level locking before scaling out.
* Borrower login still scans every organisation's loans for the phone; collection reads are full scans filtered in Python.
* One trial per organisation: a person can register several organisations to get several trials (limit it per owner phone if needed).
* Subscription payment docs are listed by scanning the platform collection (fine for hundreds of organisations).
* Invoices are simple receipts (no GST breakdown). Refunds are not tracked. Auto-recurring Razorpay subscriptions are not used.
* Aadhaar numbers are still not encrypted at rest; session tokens live in browser storage; organisation erase is manual.
* Borrower sessions are not individually revocable (valid only while the phone has a live loan).
* Legacy `/api/admin/access-requests/*` endpoints remain (they no longer authorise anything).
* The platform dashboard is reachable only from an Admin-role shell (a platform admin who is only a collector cannot open it).
