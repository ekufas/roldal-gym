-- Røldal Gym schema (initial)

create extension if not exists "pgcrypto";

-- Plans
create table plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price_nok     integer not null,         -- øre
  interval      text not null check (interval in ('month','year')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Users (members and drop-in customers)
create table users (
  id              uuid primary key default gen_random_uuid(),
  phone           text unique not null,    -- E.164
  name            text,
  email           text,
  locale          text not null default 'no',
  is_admin        boolean not null default false,
  salto_user_id   text,                    -- KS user id once provisioned
  created_at      timestamptz not null default now()
);

-- Memberships
create table memberships (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references users(id) on delete cascade,
  plan_id               uuid not null references plans(id),
  status                text not null check (status in ('pending','active','past_due','cancelled','expired')),
  provider              text not null check (provider in ('vipps','stripe')),
  provider_agreement_id text,              -- Vipps agreementId or Stripe subscription id
  current_period_end    timestamptz,
  cancelled_at          timestamptz,
  created_at            timestamptz not null default now()
);

create index on memberships (user_id);
create index on memberships (status);

-- Drop-ins (one-off purchases)
create table dropins (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references users(id) on delete set null,
  phone               text not null,
  provider            text not null check (provider in ('vipps','stripe')),
  provider_payment_id text,
  amount_nok          integer not null,
  status              text not null check (status in ('pending','paid','expired','refunded')),
  pin_code            text,                -- one-time PIN
  pin_valid_until     timestamptz,
  salto_user_id       text,                -- temp KS user id
  created_at          timestamptz not null default now()
);

create index on dropins (status);
create index on dropins (pin_valid_until);

-- Rotating PINs for active members
create table member_pins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  pin_code      text not null,
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz not null,
  revoked       boolean not null default false
);

create index on member_pins (user_id, valid_until desc);

-- Door entry log (mirrored from Salto KS events)
create table entry_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete set null,
  source       text not null check (source in ('remote_unlock','pin','rfid','dropin_pin')),
  occurred_at  timestamptz not null default now(),
  metadata     jsonb
);

create index on entry_log (occurred_at desc);

-- Sharing / tailgating alerts
create table sharing_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete cascade,
  reason       text not null,
  details      jsonb,
  resolved     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Seed plans
insert into plans (name, description, price_nok, interval) values
  ('Standard',  'Full tilgang, månedlig',                39900, 'month'),
  ('Student',   'Rabattert månedlig',                    24900, 'month'),
  ('Årskort',   'Full tilgang, betalt årlig',           399000, 'year');
