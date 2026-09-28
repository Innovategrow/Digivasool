# DigiVasool

Loan collection and borrower management for small lenders. Admins, field
collectors and borrowers all use one mobile app interface that runs from a web URL.
On a desktop browser the same phone-sized app is shown, centered.

## Structure

```text
backend/   FastAPI API (OTP login, loans, payments, borrowers, expenses, staff)
web/       React + Vite mobile web app (the app you deploy)
mobile/    Earlier Expo prototype (not maintained; uses the old header auth)
```

Roles:

- **Admin**: dashboard, borrowers (add / view / edit / delete), loans, collections,
  ledger, expenses, reports, staff, recycle bin, and approval of access requests.
- **Collector**: customer list, record payments (including ₹0 / not paid), GPay
  proof, receipts, and history.
- **Borrower**: own loan, outstanding balance, and payment history.

## Run locally

```bash
# 1. Backend (Python 3.9+)
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # then fill in values (see below)
.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8001

# 2. Web app, production build (served by the backend at http://localhost:8001)
cd web && npm install && VITE_API_BASE_URL= npm run build

#    …or the dev server with hot reload at http://localhost:5173 (proxies /api to :8001)
cd web && npm run dev
```

For local testing without a real SMS gateway, set `OTP_DEV_MODE=true` in
`backend/.env` — the OTP is then also returned in the API response / shown on
screen. There is no browser-only demo mode: every login and every screen always
calls the real backend and reads/writes the real database.

## Data and security

- **Storage.** SQLite by default (`backend/data/digivasool.db`). Set
  `DB_BACKEND=firestore` and `FIREBASE_SERVICE_ACCOUNT_PATH` to use Firebase
  Firestore instead. Nothing is kept only in memory, so data survives restarts.
- **Sessions.** Login issues a signed session token (`AUTH_SECRET`). Every
  endpoint checks the role on the server.
- **Deleting a borrower.** This is a soft delete (`is_deleted`, `deleted_at`,
  `deleted_by`). Loans, payments, receipts and the audit log are kept. Records
  with payment history can never be permanently erased.
- **Duplicate protection.** Payments and new loans accept an `Idempotency-Key`
  header, so retries after a double tap or slow network are not recorded twice.
- **Audit fields.** Records carry `created_by`/`updated_by`, and every change is
  written to the audit log.

## Production checklist (`backend/.env`)

| Setting | Production value |
|---|---|
| `AUTH_SECRET` | long random string (see `.env.example`) |
| `OTP_DEV_MODE` | `false`, and connect an SMS gateway in `services/sms.py → send_otp_sms()` |
| `SEED_DEMO_DATA` | `false` |
| `ADMIN_USERS` / `COLLECTOR_USERS` | real names and numbers |
| `CORS_ORIGINS` | your domain |
| `DB_BACKEND` | `sqlite` on a persistent disk, or `firestore` |
| `UPLOAD_DIR` | a persistent folder (payment proofs) |

Serve over HTTPS. Back up `backend/data/` and `UPLOAD_DIR` regularly.

## Deploying (Netlify + Render)

The frontend (`web/`, Vite) is deployed to Netlify. Netlify only serves static
files, so the backend needs its own host — `render.yaml` at the repo root is a
[Render](https://render.com) Blueprint that deploys `backend/` as a web
service.

1. On Render: **New → Blueprint** → connect this GitHub repo → Render reads
   `render.yaml`. Fill in `ADMIN_USERS`, `COLLECTOR_USERS`,
   `ADMIN_SECRET_KEYWORD`, `ADMIN_WHATSAPP` with the same values you use in
   `backend/.env` (these are marked `sync: false` so they're never committed).
   Deploy — Render gives you a URL like `https://digivasool-api.onrender.com`.
2. On Netlify: the site's `web/netlify.toml` already sets
   `VITE_API_BASE_URL` to that Render URL. If Render assigns a different
   subdomain, update that value and push — Netlify rebuilds automatically.
3. `CORS_ORIGINS` in `render.yaml` must match the Netlify site's exact origin
   (`https://digivasool.netlify.app`) or the browser will reject every API
   call with "Failed to fetch".

**Known limits of the free tier**, so there are no surprises later:

- Render's free plan has **no persistent disk** — every redeploy or
  auto-sleep/wake cycle wipes the SQLite file, i.e. all loans/payments are
  lost. Fine for testing today; before trusting it with real money, either
  attach a paid Render disk (`DB_PATH` already points at a mountable folder)
  or set `DB_BACKEND=firestore` with a Firebase service account so data lives
  outside the container.
- `OTP_DEV_MODE=true` is required until a real SMS gateway is wired into
  `backend/services/sms.py → send_otp_sms()` — until then the OTP is
  returned directly in the API response instead of texted.
- Render's free instance sleeps after 15 minutes of inactivity; the first
  request after a sleep can take ~30–50s to wake it up.

## Tests

```bash
cd backend && .venv/bin/python tests/test_api.py
```
