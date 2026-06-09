# AGENTS.md

## Cursor Cloud specific instructions

### Monorepo layout

Three independent apps (no root `package.json`):

| App | Path | Dev command | Port |
|-----|------|-------------|------|
| Backend API | `backend/` | `source venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000` | 8000 |
| Web (VasoolPro / DigitKhata) | `web/` | `npm run dev -- --host 0.0.0.0` | 5173 |
| Mobile (Expo) | `mobile/` | `npx expo start` (optional) | 8081 |

See root `README.md` for full quick start.

### Backend

- Python 3.12 venv in `backend/venv`; copy `backend/.env.example` → `backend/.env` once if missing.
- **Persistence is in-memory** (`backend/db.py` mock Firestore). Firebase credentials in `.env` are optional and not required for local dev.
- OTP auth returns `dev_otp` in API responses when `dev_mode` is true — use for login tests without SMS.
- Test admins: `backend/config_admins.py` (`admin1@gmail.com` / Admin 1, etc.).

### Web E2E (recommended)

Run **backend + web** together. Web calls `http://localhost:8000` (`web/src/config.js`). Many admin screens use client seed data (`AppDataContext`), but **login and loan/payment APIs require the backend**.

### Lint / verify

```bash
cd backend && venv/bin/python -m compileall .
cd web && npm run lint          # may report pre-existing ESLint issues
cd mobile && npm run lint       # may report pre-existing issues
cd web && npm run build
```

### System dependency (one-time on fresh VMs)

If `python3 -m venv` fails with `ensurepip is not available`, install:

`sudo apt-get install -y python3.12-venv`

This is not in the VM update script (system package).

### Long-running dev servers

Use tmux (see environment docs). Example session names: `fastapi-backend`, `vite-web-dev`.

### Optional services

- **Mobile**: not required for web E2E; needs backend for API-backed tabs.
- **Docker / Postgres / Redis / real Firebase**: not used by current code paths.
