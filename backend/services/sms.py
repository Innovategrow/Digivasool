from __future__ import annotations

"""
Disbursement SMS templates in multiple Indian languages.

No paid SMS gateway is configured for this project (see backend/.env.example —
only a commented-out Twilio placeholder exists), so messages are delivered via
an `sms:` deep link that opens the phone's own messaging app with the text
pre-filled, the same pattern already used for the WhatsApp confirmations in
main.py. Tapping "Send SMS" sends it for free over the collector/admin's own
number. To switch to silent, fully-automatic delivery later, plug a real
gateway (Twilio / MSG91 / Fast2SMS) into `queue_disbursement_sms` below and
call it from main.py instead of only returning the deep link.
"""

import json
import os
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from fastapi import HTTPException

SUPPORTED_LANGUAGES = {
    "en": "English",
    "hi": "Hindi",
    "ta": "Tamil",
    "te": "Telugu",
    "kn": "Kannada",
    "ml": "Malayalam",
}

DEFAULT_LANGUAGE = "en"

# {name}, {account_number}, {loan_amount}, {cash_disbursed}, {installment}, {due_date} placeholders
_TEMPLATES = {
    "en": (
        "Dear {name}, your loan of Rs.{loan_amount} has been disbursed. "
        "Cash handed over: Rs.{cash_disbursed}. Your Account No: {account_number}. "
        "Repayment due: Rs.{installment} by {due_date}. - DigiVasool"
    ),
    "hi": (
        "प्रिय {name}, आपका Rs.{loan_amount} का लोन जारी कर दिया गया है। "
        "नकद राशि: Rs.{cash_disbursed}. आपका खाता संख्या: {account_number}. "
        "चुकौती राशि: Rs.{installment}, तिथि: {due_date} तक। - DigiVasool"
    ),
    "ta": (
        "அன்புள்ள {name}, உங்கள் Rs.{loan_amount} கடன் வழங்கப்பட்டது. "
        "கையில் தரப்பட்ட தொகை: Rs.{cash_disbursed}. உங்கள் கணக்கு எண்: {account_number}. "
        "திருப்பிச் செலுத்த வேண்டிய தொகை: Rs.{installment}, தேதி: {due_date}. - DigiVasool"
    ),
    "te": (
        "ప్రియమైన {name}, మీ Rs.{loan_amount} రుణం మంజూరు చేయబడింది. "
        "చేతికి ఇచ్చిన నగదు: Rs.{cash_disbursed}. మీ ఖాతా సంఖ్య: {account_number}. "
        "చెల్లించవలసిన మొత్తం: Rs.{installment}, తేదీ: {due_date} లోపు. - DigiVasool"
    ),
    "kn": (
        "ಪ್ರಿಯ {name}, ನಿಮ್ಮ Rs.{loan_amount} ಸಾಲವನ್ನು ವಿತರಿಸಲಾಗಿದೆ. "
        "ಕೈಗೆ ನೀಡಿದ ನಗದು: Rs.{cash_disbursed}. ನಿಮ್ಮ ಖಾತೆ ಸಂಖ್ಯೆ: {account_number}. "
        "ಮರುಪಾವತಿಸಬೇಕಾದ ಮೊತ್ತ: Rs.{installment}, ದಿನಾಂಕ: {due_date}. - DigiVasool"
    ),
    "ml": (
        "പ്രിയ {name}, നിങ്ങളുടെ Rs.{loan_amount} വായ്പ വിതരണം ചെയ്തു. "
        "കൈയിൽ നൽകിയ തുക: Rs.{cash_disbursed}. നിങ്ങളുടെ അക്കൗണ്ട് നമ്പർ: {account_number}. "
        "തിരിച്ചടയ്‌ക്കേണ്ട തുക: Rs.{installment}, തീയതി: {due_date}. - DigiVasool"
    ),
}


def build_disbursement_sms(
    *,
    language: str,
    name: str,
    account_number: str,
    loan_amount: float,
    cash_disbursed: float,
    installment: float,
    due_date: str,
) -> str:
    """Render the post-disbursement SMS in the borrower's preferred Indian language."""
    template = _TEMPLATES.get(language, _TEMPLATES[DEFAULT_LANGUAGE])
    return template.format(
        name=name,
        account_number=account_number,
        loan_amount=f"{loan_amount:,.0f}",
        cash_disbursed=f"{cash_disbursed:,.0f}",
        installment=f"{installment:,.0f}",
        due_date=due_date or "-",
    )


def queue_disbursement_sms(phone: str, message: str) -> None:
    """Placeholder for a real SMS gateway (Twilio / MSG91 / Fast2SMS) integration."""
    print("Queued disbursement SMS ->", phone, ":", message)


def queue_disbursement_sms_batch(messages: list[tuple[str, str]]) -> None:
    """Send every (phone, message) pair concurrently so the admin copy never waits on the borrower's."""
    if not messages:
        return
    with ThreadPoolExecutor(max_workers=len(messages)) as pool:
        list(pool.map(lambda pm: queue_disbursement_sms(*pm), messages))


def send_otp_sms(phone: str, otp: str) -> None:
    """Deliver a login OTP through Fast2SMS (route "otp").

    Needs FAST2SMS_API_KEY in the environment. Without a key the OTP is only
    printed to the server log, which is fine for OTP_DEV_MODE testing; with
    OTP_DEV_MODE off a missing key or a gateway failure raises a 503 so the
    user is told instead of waiting for an SMS that never comes.
    """
    api_key = os.environ.get("FAST2SMS_API_KEY", "").strip()
    dev_mode = os.environ.get("OTP_DEV_MODE", "").strip().lower() in {"1", "true", "yes", "on"}
    if not api_key:
        print(f"Login OTP for {phone}: {otp}")
        if not dev_mode:
            raise HTTPException(status_code=503, detail="SMS service is not configured. Contact the admin.")
        return

    digits = "".join(ch for ch in phone if ch.isdigit())
    number = digits[-10:]  # Fast2SMS takes the 10-digit Indian number
    query = urllib.parse.urlencode({"route": "otp", "variables_values": otp, "numbers": number})
    request = urllib.request.Request(
        f"https://www.fast2sms.com/dev/bulkV2?{query}",
        headers={"authorization": api_key, "cache-control": "no-cache"},
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if not result.get("return"):
            raise RuntimeError(str(result.get("message")))
    except Exception as exc:  # network error, bad key, no wallet balance, ...
        print(f"Fast2SMS OTP to {phone} failed: {exc}")
        if not dev_mode:
            raise HTTPException(status_code=503, detail="Could not send the OTP SMS. Please try again.")
