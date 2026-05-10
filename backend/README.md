# Backend

This folder contains the FastAPI service for the digital ledger app.

## Main Files

- `main.py`: API routes and app bootstrap
- `schemas.py`: Pydantic request and response models
- `data_store.py`: in-memory fallback data for local development
- `services/reminders.py`: WhatsApp reminder schedule builder and queue placeholder
- `.env.example`: local environment template

## Available Routes

- `POST /api/transactions/`
- `GET /api/dashboard/`
- `GET /api/admin/lendings/`
- `GET /api/reminders/policy/`
- `POST /api/ai/voice-to-ledger/`
- `GET /api/ai/forecasting/`

## Interest and Reminder Rules

- `interest_rate_monthly` is only relevant for `GAVE` transactions.
- Admin users can access interest data through `/api/admin/lendings/`.
- Lending transactions generate reminder jobs on day 5, 7, 10, and 60.

## Run Locally

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Environment Variables

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `TWILIO_ACCOUNT_SID` optional
- `TWILIO_AUTH_TOKEN` optional
- `WHATSAPP_TEMPLATE_SID` optional
- `OPENAI_API_KEY` optional

## Validation

```bash
venv/bin/python -m compileall .
```
