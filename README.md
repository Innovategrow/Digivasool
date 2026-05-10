# Rahul App

Rahul App is a mobile-first digital ledger prototype inspired by Khatabook-style workflows for MSMEs. The project combines an Expo React Native frontend, a FastAPI backend, a PostgreSQL-ready schema, and a sample dataset for ledger analytics and demo flows.

## What Is Included

- `mobile/`: Expo Router frontend with a regular dashboard, add-entry flow, and admin lending screen.
- `web/`: Vite + React full-stack web dashboard accessible over the local network.
- `backend/`: FastAPI API with transaction creation, admin lending visibility, and WhatsApp reminder scheduling.
- `database/`: SQL schema for merchants, customers, transactions, and reminder jobs.
- `dataset/`: Seed CSV data aligned with the current ledger and reminder model.

## Current Product Features

- You Gave / You Got ledger flow
- Admin-only interest rate visibility for lending entries
- WhatsApp reminder cadence on day 5, 7, 10, and 60
- Mock voice-to-ledger and forecasting endpoints
- Supabase-ready backend with an in-memory fallback for local development
- LAN-friendly frontend and backend hosting

## Project Structure

```text
Rahul app/
├── backend/
│   ├── main.py
│   ├── schemas.py
│   ├── data_store.py
│   ├── services/
│   │   └── reminders.py
│   └── README.md
├── web/
│   ├── src/
│   ├── public/
│   └── README.md
├── mobile/
│   ├── app/
│   ├── components/
│   ├── data/
│   └── README.md
├── database/
│   ├── schema.sql
│   └── README.md
├── dataset/
│   ├── sample_ledger_dataset.csv
│   └── README.md
└── README.md
```

## Quick Start

### 1. Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000
```

Backend API:

- Local: `http://127.0.0.1:8000`
- LAN example: `http://<your-local-ip>:8000`

### 2. Mobile Frontend

```bash
cd mobile
npm install
npx expo start --web --host lan
```

Mobile React Native app:

- Local: `http://127.0.0.1:8081`
- LAN example: `http://<your-local-ip>:8081`

### 3. Web Dashboard

```bash
cd web
npm install
npm run dev
```

Web app:

- Local: `http://127.0.0.1:5173`
- LAN example: `http://<your-local-ip>:5173`

## Important API Endpoints

- `POST /api/transactions/`
- `GET /api/dashboard/`
- `GET /api/admin/lendings/`
- `GET /api/reminders/policy/`
- `POST /api/ai/voice-to-ledger/`
- `GET /api/ai/forecasting/`

## Admin-Only Interest Logic

- Interest rate is stored per lending transaction.
- Interest is intended for admin workflows only.
- The regular dashboard does not expose the interest field.
- The admin lending screen and admin API endpoint do expose it.

## Reminder Policy

- Channel: WhatsApp
- Schedule: day 5, 7, 10, and 60
- Anchor date: due date when present, otherwise transaction creation date

## Verification

These checks pass in the current workspace:

```bash
cd backend && venv/bin/python -m compileall .
cd mobile && npm run lint
```

## Notes

- Supabase credentials are optional for local work. Without them, the backend falls back to in-memory demo data.
- The root `package-lock.json` is not used by the app runtime. The mobile app uses `mobile/package-lock.json`.
- For production, tighten CORS, implement real auth, and wire the reminder queue to Twilio or the WhatsApp Business API.
