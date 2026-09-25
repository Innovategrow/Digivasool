"""
Admin / collector configuration.

All values come from environment variables (see backend/.env.example) so that
phone numbers and secrets never live in source control.

  ADMIN_USERS       "Name:+91XXXXXXXXXX, Other Name:+91XXXXXXXXXX"
  COLLECTOR_USERS   "Collector 1:+91XXXXXXXXXX, Collector 2:+91XXXXXXXXXX"
  ADMIN_SECRET_KEYWORD, ADMIN_WHATSAPP

Collectors and admins added from the Staff screen are stored in the database
and are merged with these lists at runtime (see main.py).
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _parse_users(raw: str):
    users = []
    for chunk in (raw or "").split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        name, _, phone = chunk.rpartition(":")
        if not name:
            name, phone = phone, ""
        users.append({"name": name.strip(), "email": "", "phone": phone.strip()})
    return users


ADMIN_USERS = _parse_users(os.environ.get("ADMIN_USERS", ""))

# Admin secret keyword (for extra identity gate before OTP)
ADMIN_SECRET_KEYWORD = os.environ.get("ADMIN_SECRET_KEYWORD", "")

# Business owner's WhatsApp number (country code included)
ADMIN_WHATSAPP = os.environ.get("ADMIN_WHATSAPP", "")

# Collectors log in with their phone number + OTP.
COLLECTOR_USERS = _parse_users(os.environ.get("COLLECTOR_USERS", ""))
