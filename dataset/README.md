# Dataset

This folder contains sample ledger data for demos, testing, and future analytics work.

## File

- `sample_ledger_dataset.csv`: example transactions aligned with the current backend and admin reminder logic

## Included Fields

- Transaction identity
- Merchant and customer IDs
- Customer contact information
- Transaction type and amounts
- Outstanding balance
- Monthly interest rate for lending entries
- Due date and creation timestamp
- Notes
- Reminder cadence encoding

## Reminder Format

- `reminder_day_offsets` uses `|` as a separator
- Current schedule: `5|7|10|60`

## Intended Uses

- Dashboard demos
- Credit-risk experiments
- Forecasting experiments
- QA and API payload examples
