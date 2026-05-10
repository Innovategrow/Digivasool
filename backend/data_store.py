from __future__ import annotations

from copy import deepcopy
from typing import Any

from services.reminders import WHATSAPP_REMINDER_DAY_OFFSETS, build_whatsapp_reminder_schedule

FALLBACK_TRANSACTIONS: list[dict[str, Any]] = [
    {
        "id": "tx-1001",
        "customer_id": "cust-001",
        "customer_name": "Ramesh Traders",
        "customer_phone": "+919999000111",
        "type": "GAVE",
        "amount": 8200.0,
        "outstanding_amount": 8200.0,
        "interest_rate_monthly": 2.5,
        "due_date": "2026-04-10",
        "notes": "Seed inventory on weekly credit",
        "created_at": "2026-03-01T10:00:00",
    },
    {
        "id": "tx-1002",
        "customer_id": "cust-002",
        "customer_name": "Priya Textiles",
        "customer_phone": "+919999000222",
        "type": "GAVE",
        "amount": 4600.0,
        "outstanding_amount": 3100.0,
        "interest_rate_monthly": 1.75,
        "due_date": "2026-04-05",
        "notes": "Festival stock top-up",
        "created_at": "2026-03-05T14:30:00",
    },
    {
        "id": "tx-1003",
        "customer_id": "cust-003",
        "customer_name": "Karan Electronics",
        "customer_phone": "+919999000333",
        "type": "GOT",
        "amount": 1500.0,
        "outstanding_amount": 0.0,
        "interest_rate_monthly": None,
        "due_date": None,
        "notes": "Partial repayment received",
        "created_at": "2026-03-08T16:45:00",
    },
]

FALLBACK_REMINDERS: list[dict[str, Any]] = []

for transaction in FALLBACK_TRANSACTIONS:
    if transaction["type"] == "GAVE":
        FALLBACK_REMINDERS.extend(
            build_whatsapp_reminder_schedule(
                transaction_id=transaction["id"],
                customer_id=transaction["customer_id"],
                due_date=transaction["due_date"],
            )
        )


def append_transaction(record: dict[str, Any]) -> None:
    FALLBACK_TRANSACTIONS.append(record)


def append_reminders(reminders: list[dict[str, Any]]) -> None:
    FALLBACK_REMINDERS.extend(reminders)


def get_dashboard_summary() -> dict[str, Any]:
    you_will_give = sum(item["outstanding_amount"] for item in FALLBACK_TRANSACTIONS if item["type"] == "GAVE")
    you_will_get = sum(item["amount"] for item in FALLBACK_TRANSACTIONS if item["type"] == "GOT")

    return {
        "you_will_give": round(you_will_give, 2),
        "you_will_get": round(you_will_get, 2),
        "active_lending_count": sum(1 for item in FALLBACK_TRANSACTIONS if item["type"] == "GAVE"),
        "reminder_day_offsets": list(WHATSAPP_REMINDER_DAY_OFFSETS),
    }


def get_admin_lendings() -> list[dict[str, Any]]:
    lendings: list[dict[str, Any]] = []

    for transaction in FALLBACK_TRANSACTIONS:
        if transaction["type"] != "GAVE":
            continue

        transaction_reminders = [
            reminder for reminder in FALLBACK_REMINDERS if reminder["transaction_id"] == transaction["id"]
        ]

        lendings.append(
            {
                "transaction_id": transaction["id"],
                "customer_id": transaction["customer_id"],
                "customer_name": transaction["customer_name"],
                "customer_phone": transaction["customer_phone"],
                "amount": transaction["amount"],
                "outstanding_amount": transaction["outstanding_amount"],
                "interest_rate_monthly": transaction["interest_rate_monthly"] or 0.0,
                "due_date": transaction["due_date"],
                "notes": transaction["notes"],
                "reminder_schedule": deepcopy(transaction_reminders),
            }
        )

    return lendings
