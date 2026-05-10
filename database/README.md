# Database

This folder contains the SQL schema for the ledger system.

## File

- `schema.sql`: PostgreSQL and Supabase-ready schema for merchants, staff, customers, transactions, and reminder jobs

## Schema Highlights

- Merchants and staff roles for admin/staff separation
- Customers with a placeholder credit risk score column
- Transactions table with admin-only lending interest support
- Reminder jobs table with day 5, 7, 10, and 60 scheduling constraints
- Row Level Security policies for merchant isolation

## Apply Schema

Run the SQL in Supabase SQL Editor or any PostgreSQL client connected to your project database.

## Important Constraint

- `interest_rate_monthly` is valid only for `GAVE` transactions
