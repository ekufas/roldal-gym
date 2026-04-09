-- OTP send log for app-level rate limiting (keeps Sveve SMS cost in check).
create table if not exists otp_sends (
  id       uuid primary key default gen_random_uuid(),
  phone    text not null,
  sent_at  timestamptz not null default now()
);

create index if not exists otp_sends_phone_sent_at_idx
  on otp_sends (phone, sent_at desc);
