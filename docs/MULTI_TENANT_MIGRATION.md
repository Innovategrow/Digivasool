# DigiVasool multi-tenant: architecture, migration runbook, status

One app, one backend, one Postgres database, many independent finance organisations.
The existing business becomes **ORG_001**; every new organisation that registers gets its own `ORG_00N`.

## 1. Architecture

```
Phone ──OTP──► /api/auth/verify-otp ─┬─ 1 membership ─► session token (org_id inside) ─► app
                                     ├─ several      ─► choose organisation ─► POST /organizations/select ─► session token
                                     └─ none         ─► register organisation ─► POST /organizations/register ─► OWNER + session token

Request ─► TenantMiddleware ── org_id taken ONLY from the verified token (client org_id => 403)
        ─► BusinessMiddleware ── X-Business: finance | fund | custom book (secondary filter, inside the org)
        ─► endpoint ─► db.get_db_client() ── every query scoped to (org_id, book)
        ─► Postgres: SET LOCAL ROLE digivasool_app + app.org_id  ─► row-level security (second, independent layer)
```

Storage is a document store: one `documents(org_id, collection, id, data jsonb, seq)` table (+ `files`).
Finance/Fund are the existing `"" / "fund_"` collection prefixes, unchanged, **inside** each organisation.

| Layer | What it does |
|---|---|
| `auth.py` | HS256 JWT. Types: `session` (org-scoped), `select`, `register` (10-min, cannot be used as a session). Claims: `sub, org_id, membership_id, role, member_role, phone_number, name, iat, exp`. `alg=none`, expired, forged, org-less tokens rejected. |
| `identity.py` | organisations, users, memberships (OWNER / ADMIN / COLLECTOR) in a reserved platform scope a tenant token can never reach. One membership per phone per organisation (id = `org:phone`, created atomically). Borrowers are derived from the loans an organisation holds for that phone. |
| `db.py` | `org_id` in a `ContextVar` (safe across async requests and threads). Touching tenant data with no org **raises** (fail closed). `as_org()` is used only by trusted server code (background jobs, login discovery). |
| Postgres RLS | every statement runs in its own transaction as the non-bypass role `digivasool_app` with a transaction-local `app.org_id`; policy `org_id = current_setting('app.org_id')` for SELECT/INSERT/UPDATE/DELETE. Nothing leaks to the next user of a pooled connection. |
| Uploads | never public. Served only with a session token of the owning org, or a signed 1-hour link the API attaches to every `/uploads/..` URL. New files live under `/<org_id>/..`. |
| Sessions | role is read from the database on every request (removing a collector, demoting an admin or transferring ownership applies at once, cache 15 s). Logout revokes every session of that membership. `POST /api/auth/refresh` renews. Default expiry 7 days. |

### Roles
- **OWNER** (exactly one per org): everything, adds/removes admins, transfers ownership, deletes the organisation.
- **ADMIN**: everything operational (loans, borrowers, payments, expenses, reports, collectors). Cannot add/edit/remove other admins or the owner.
- **COLLECTOR**: only their assigned borrowers; can record payments; never manages staff.
- **BORROWER** (derived): own loan only.

## 2. Production migration runbook (do NOT skip steps)

> Nothing in this repo has been run against your Supabase database. All of the below was rehearsed on a local Postgres copy built by the **old** code (see section 4).

**Order matters: migrate the database first, then deploy the new code immediately.** Between the two, the old app can still read but its writes fail (the primary key now includes `org_id`). Pick a quiet minute; the migration itself takes seconds.

1. **Back up.** Supabase dashboard → Database → Backups, or `python scripts/migrate_multitenant.py backup --out backup.dump` (needs `pg_dump`).
2. **Look.** `python scripts/migrate_multitenant.py inspect` (read-only): row counts, Finance/Fund money totals, orphan check, content checksum.
3. **Make sure `ADMIN_USERS` / `COLLECTOR_USERS` (and optionally `LEGACY_OWNER_PHONE`) are set** in the environment you run the script from: they are read once to create the memberships of ORG_001. Without them nobody could log in afterwards.
4. **Apply.** `python scripts/migrate_multitenant.py apply --backup-file backup.dump --yes`
   - refuses without a real backup < 24 h old and without `--yes`;
   - one transaction (all or nothing); never deletes a row;
   - saves `migration_snapshot_<time>.json`, then proves **row counts, Finance and Fund totals and a SHA-256 content checksum of every existing record are identical**;
   - registers ORG_001, creates memberships for existing admins/collectors (no duplicates), checks RLS, the restricted role, and exactly one OWNER.
5. **Set on Render before deploying:** `FAST2SMS_API_KEY` (real SMS), `ENVIRONMENT=production`, `OTP_DEV_MODE=false`, `DATABASE_URL`. The server refuses to start in production with dev OTP.
6. **Deploy** the new backend + web. Then run `python scripts/migrate_multitenant.py verify --snapshot migration_snapshot_<time>.json`.
7. **Smoke test:** sign in as the existing owner → ORG_001 dashboard shows the old Finance and Fund numbers; a collector signs in; register a test organisation and confirm it is empty.

**Rollback:** `python scripts/migrate_multitenant.py rollback --backup-file backup.dump --yes` restores the old schema (verified byte-identical on the rehearsal). It **refuses** once any other organisation holds data (restore from the backup instead). Then redeploy the previous app version.

## 3. Behaviour changes you should know about

1. **Anyone could be an admin before.** Commit `763af6a` removed admin approval, so any phone number got an admin token. Now an unknown number can only create its **own empty** organisation.
2. **People are database rows, not env vars.** `ADMIN_USERS` / `COLLECTOR_USERS` only seed ORG_001 once. Removing someone from the env no longer removes them; use the Staff screen.
3. **Admins vs owner.** The first `ADMIN_USERS` entry (or `LEGACY_OWNER_PHONE`) becomes OWNER of ORG_001; the other existing admins become ADMIN and can no longer add/remove admins. Change the owner with **Staff → Make owner**.
4. **Staff are per organisation**, shared by its Finance and Fund books (before, "staff" rows were stored per book).
5. **Login screen:** phone → OTP only (no role cards, no collector dropdown). `/api/collectors/` now needs a login.
6. **Everyone is signed in again once** (new token format). Session default 7 days (was 30).
7. **Profile page:** removed the hard-coded fake "SBI ···· 4291" bank card and the KYC upload button that did nothing. Added organisation, switch organisation, legal links, delete account / organisation.
8. **Google Sheets backup** mirrors one organisation only (`SHEETS_BACKUP_ORG_ID`, default ORG_001).
9. OTPs are no longer printed to the server log outside dev mode; OTP requests are rate limited (5 per phone and 150 per IP per 10 min).

## 4. Status

**Implemented and tested (automated, SQLite + real Postgres 16)**
- Existing admin/collector/borrower login lands in ORG_001; loans, payments, Finance/Fund intact.
- Cross-organisation isolation: read, update, delete, close, pay, staff, reports/export, audit log, documents.
- Client-supplied org (header/query) rejected; bad/expired/forged/none-alg/typed tokens rejected; multi-membership selection and switching verified server-side; removed collector and logout lose access immediately; ownership transfer changes powers immediately.
- RLS probed **directly in Postgres** (select / insert / update / delete / moving a row between orgs / no context / pooled-connection leakage / role cannot bypass or alter RLS).
- Concurrent requests from two organisations never see each other's data; org context is per task/thread; background work runs inside its own org.
- Migration rehearsed end to end on a database built by the previous code (106 documents, Finance and Fund): apply → verified identical → running new app on it shows the same totals; rollback restores the exact original checksum; re-apply works; rollback refuses when other orgs have data.
- 41 backend tests + 7 RLS tests; frontend builds.

**Implemented, only checked by hand (screenshots, not automated)**: new login / organisation registration / organisation picker / account / staff UI (Chrome at 360 and 390 px).

**Requires manual configuration**
- `FAST2SMS_API_KEY` and `OTP_DEV_MODE=false` (**launch blocker**: with dev OTP anyone can sign in as anyone).
- Support email in `web/public/privacy.html`, `terms.html`, `delete-account.html` (highlighted placeholder) and a legal review of them.
- Play Store: PNG app icons (192/512 + maskable) in the manifest, the TWA/Capacitor wrapper, Data-safety form (declare phone, Aadhaar, photos, signatures), privacy-policy URL = `https://<your-site>/privacy.html`.

**Requires production approval**: running `apply` on the Supabase database; deploying (Render `autoDeploy` is on).

**Not implemented / known limits**
- Aadhaar numbers are **not encrypted at rest** and are not masked in the UI (needs a key, a data migration of existing loans and a decision on who may see the full number).
- Session token is kept in browser storage (a wrapper can move it to secure storage).
- Borrower login scans every active organisation's loans for the phone; fine for tens of organisations, add an index table beyond that.
- RLS protects against missing filters in application code; it cannot stop a SQL-injection that runs `set_config`/`RESET ROLE` (the code uses parameterised queries only).
- Deleting an organisation locks it; the actual erase after 30 days is a manual operator step (no scheduled job yet).
- Single backend process assumed for in-memory OTP/rate-limit state (as before); use Redis if you scale out.
- 8 pre-existing ESLint style errors remain (`react-refresh/only-export-components`, hooks style rules); the build is unaffected.

## 5. Running the checks
```bash
cd backend
.venv/bin/python -m pytest tests -q                                  # SQLite: regression + multi-tenant
createdb app_test && MT_TEST_DATABASE_URL=postgresql://localhost/app_test .venv/bin/python -m pytest tests/test_multitenant.py -q
createdb rls_test && RLS_TEST_DATABASE_URL=postgresql://localhost/rls_test .venv/bin/python -m pytest tests/test_rls_postgres.py -q
```
(the RLS test refuses to run on a database whose name does not contain "test".)
