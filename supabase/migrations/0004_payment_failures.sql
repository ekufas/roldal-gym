-- Failed-payment retry log (dunning).
create table if not exists payment_failures (
  id              uuid primary key default gen_random_uuid(),
  membership_id   uuid not null references memberships(id) on delete cascade,
  failed_at       timestamptz not null default now(),
  attempt         int not null default 1,
  next_retry_at   timestamptz,
  last_error      text,
  notified_at     timestamptz,
  resolved        boolean not null default false,
  resolved_at     timestamptz
);

create index if not exists payment_failures_retry_idx
  on payment_failures (next_retry_at) where resolved = false;

create index if not exists payment_failures_membership_idx
  on payment_failures (membership_id, failed_at desc);
