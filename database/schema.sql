-- Rahul App ledger schema
-- Interest rates are stored per lending transaction and exposed only through admin-side queries.

create extension if not exists "pgcrypto";

create table if not exists merchants (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  phone_number text not null unique,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now()
);

create table if not exists merchant_staff (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  full_name text not null,
  phone_number text,
  role text not null check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  full_name text not null,
  phone_number text,
  credit_risk_score numeric(5,2) default 50.00,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('GAVE', 'GOT')),
  amount numeric(12,2) not null check (amount > 0),
  outstanding_amount numeric(12,2) not null default 0,
  interest_rate_monthly numeric(5,2),
  due_date date,
  notes text,
  bill_image_url text,
  created_at timestamptz not null default now(),
  constraint interest_only_on_lending
    check (
      (transaction_type = 'GAVE' and (interest_rate_monthly is null or interest_rate_monthly >= 0))
      or (transaction_type = 'GOT' and interest_rate_monthly is null)
    )
);

create table if not exists reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'sms')),
  day_offset integer not null check (day_offset in (5, 7, 10, 60)),
  scheduled_for date not null,
  delivery_status text not null default 'scheduled' check (delivery_status in ('scheduled', 'queued', 'sent', 'failed')),
  payment_link text,
  created_at timestamptz not null default now()
);

alter table merchants enable row level security;
alter table merchant_staff enable row level security;
alter table customers enable row level security;
alter table transactions enable row level security;
alter table reminder_jobs enable row level security;

create policy merchant_isolation_on_customers
on customers
using (merchant_id = auth.uid());

create policy merchant_isolation_on_transactions
on transactions
using (merchant_id = auth.uid());

create policy merchant_isolation_on_reminders
on reminder_jobs
using (merchant_id = auth.uid());
