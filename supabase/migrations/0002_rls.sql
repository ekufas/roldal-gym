-- Røldal Gym — link to Supabase Auth + Row Level Security
--
-- Run this AFTER 0001_init.sql.
-- Idempotent: safe to re-run.

-- 1. Link our `users` table to Supabase Auth (auth.users)
alter table public.users
  add column if not exists auth_id uuid unique references auth.users(id) on delete cascade;

create index if not exists users_auth_id_idx on public.users(auth_id);

-- Helper: returns the public.users.id of the currently authenticated user.
create or replace function public.current_user_id() returns uuid
  language sql stable
  as $$
    select id from public.users where auth_id = auth.uid()
  $$;

-- Helper: is the current auth user an admin?
create or replace function public.current_is_admin() returns boolean
  language sql stable
  as $$
    select coalesce((select is_admin from public.users where auth_id = auth.uid()), false)
  $$;

-- Auto-create a public.users row when a new auth user signs up.
create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer
  as $$
  begin
    insert into public.users (auth_id, phone, locale)
    values (
      new.id,
      coalesce(new.phone, ''),
      coalesce(new.raw_user_meta_data->>'locale', 'no')
    )
    on conflict (phone) do update set auth_id = excluded.auth_id;
    return new;
  end;
  $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 2. Enable RLS on every public table
alter table public.plans          enable row level security;
alter table public.users          enable row level security;
alter table public.memberships    enable row level security;
alter table public.dropins        enable row level security;
alter table public.member_pins    enable row level security;
alter table public.entry_log      enable row level security;
alter table public.sharing_alerts enable row level security;

-- 3. Policies
-- plans: anyone (incl. anon) can read active plans; only admins can modify.
drop policy if exists "plans read all" on public.plans;
create policy "plans read all" on public.plans
  for select using (true);

drop policy if exists "plans admin write" on public.plans;
create policy "plans admin write" on public.plans
  for all using (public.current_is_admin()) with check (public.current_is_admin());

-- users: a member can read/update their own row; admins read all.
drop policy if exists "users self read" on public.users;
create policy "users self read" on public.users
  for select using (auth_id = auth.uid() or public.current_is_admin());

drop policy if exists "users self update" on public.users;
create policy "users self update" on public.users
  for update using (auth_id = auth.uid()) with check (auth_id = auth.uid());

-- memberships: own rows + admin all
drop policy if exists "memberships self" on public.memberships;
create policy "memberships self" on public.memberships
  for select using (user_id = public.current_user_id() or public.current_is_admin());

-- member_pins: own rows + admin all
drop policy if exists "member_pins self" on public.member_pins;
create policy "member_pins self" on public.member_pins
  for select using (user_id = public.current_user_id() or public.current_is_admin());

-- dropins: only admin via the UI; the buyer doesn't need to query their own row
-- (they receive the PIN via SMS). Service-role bypasses RLS for the webhook insert.
drop policy if exists "dropins admin read" on public.dropins;
create policy "dropins admin read" on public.dropins
  for select using (public.current_is_admin());

-- entry_log: own rows + admin all
drop policy if exists "entry_log self" on public.entry_log;
create policy "entry_log self" on public.entry_log
  for select using (user_id = public.current_user_id() or public.current_is_admin());

-- sharing_alerts: admin only
drop policy if exists "sharing_alerts admin" on public.sharing_alerts;
create policy "sharing_alerts admin" on public.sharing_alerts
  for select using (public.current_is_admin());

-- Note: writes to memberships, dropins, member_pins, entry_log, sharing_alerts
-- happen exclusively via server routes using the service-role key, which
-- bypasses RLS by design. No insert/update policies are needed for users.
