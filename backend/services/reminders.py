from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

WHATSAPP_REMINDER_DAY_OFFSETS = (5, 7, 10, 60)


def _coerce_anchor_date(due_date: Optional[str], created_at: Optional[datetime]) -> date:
    if due_date:
        return date.fromisoformat(due_date)
    if created_at:
        return created_at.date()
    return date.today()


def build_whatsapp_reminder_schedule(
    *,
    transaction_id: str,
    customer_id: str,
    due_date: Optional[str] = None,
    created_at: Optional[datetime] = None,
) -> list[dict]:
    anchor_date = _coerce_anchor_date(due_date, created_at)
    reminders: list[dict] = []

    for offset in WHATSAPP_REMINDER_DAY_OFFSETS:
        reminders.append(
            {
                "transaction_id": transaction_id,
                "customer_id": customer_id,
                "channel": "whatsapp",
                "day_offset": offset,
                "scheduled_for": (anchor_date + timedelta(days=offset)).isoformat(),
                "status": "scheduled",
            }
        )

    return reminders


def queue_whatsapp_reminders(reminders: list[dict]) -> None:
    """Placeholder for Twilio / WhatsApp delivery integration."""
    for reminder in reminders:
        print(
            "Queued WhatsApp reminder",
            reminder["transaction_id"],
            reminder["customer_id"],
            reminder["day_offset"],
            reminder["scheduled_for"],
        )
