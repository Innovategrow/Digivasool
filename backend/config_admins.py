"""
Admin configuration — edit this file to add/change admin users.
Each admin needs a name and either an email OR a phone number.
"""

ADMIN_USERS = [
    {"name": "Admin 1", "email": "admin1@gmail.com", "phone": ""},
    {"name": "Admin 2", "email": "admin2@gmail.com", "phone": ""},
    {"name": "Admin 3", "email": "admin3@gmail.com", "phone": ""},
]

# Admin secret keyword (for extra identity gate before OTP)
ADMIN_SECRET_KEYWORD = "KHATA2026"

# ─── Dad's WhatsApp number (country code included) ────────────────────────────
# Change this to your dad's real WhatsApp number before going live.
ADMIN_WHATSAPP = "+919876543210"

# ─── Collector accounts ───────────────────────────────────────────────────────
# Add/edit collector names and phone numbers here.
# Collectors log in with their phone number + OTP.
COLLECTOR_USERS = [
    {"name": "Collector 1", "phone": "+919876543211"},
    {"name": "Collector 2", "phone": "+919876543212"},
    {"name": "Collector 3", "phone": "+919876543213"},
]
