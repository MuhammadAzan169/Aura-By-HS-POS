-- =============================================================================
-- Aura by HS — Supabase schema
--
-- Run this ONCE in Supabase → SQL Editor → New query → paste → Run.
-- It is safe to run again (everything is "if not exists" / "or replace").
--
-- Shape: one table per entity. Every row is { id, data jsonb, updated_at },
-- where `data` is exactly the TypeScript record in src/types/. The columns the
-- security rules need (shop_id, email, role, active) are generated from `data`,
-- so they can never disagree with it.
--
-- Security: Row-Level Security on every table.
--   * admin  — everything, every branch
--   * shop   — only rows whose shop_id is their own branch; catalogue read-only
--   * anyone else (a Google account nobody invited) — nothing at all
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Profiles (app users). A profile row IS the invitation: the owner adds a
-- branch with its login email, and whoever signs in with that email (Google or
-- password) becomes that branch.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         text primary key,
  data       jsonb not null,
  email      text generated always as (lower(data->>'email')) stored,
  role       text generated always as (data->>'role') stored,
  shop_id    text generated always as (data->>'shopId') stored,
  active     boolean generated always as (coalesce((data->>'active')::boolean, false)) stored,
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (email);

-- Who is asking. SECURITY DEFINER so the policies on profiles do not recurse.
create or replace function public.auth_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt()->>'email', '')) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where email = public.auth_email() and role = 'admin' and active
  )
$$;

create or replace function public.my_shop_id() returns text
language sql stable security definer set search_path = public as $$
  select shop_id from public.profiles
  where email = public.auth_email() and role = 'shop' and active
  limit 1
$$;

create or replace function public.is_member() returns boolean
language sql stable as $$ select public.is_admin() or public.my_shop_id() is not null $$;

-- First-run setup: on a brand-new project with no owner yet, the first person
-- to sign in calls this and becomes the owner. Once an owner exists it does
-- nothing, so it cannot be used to take over a live system.
create or replace function public.claim_owner(owner_name text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  em text := public.auth_email();
  now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if em = '' then return false; end if;
  if exists (select 1 from public.profiles where role = 'admin') then return false; end if;
  insert into public.profiles (id, data) values (
    'usr_owner',
    jsonb_build_object(
      'id', 'usr_owner', 'email', em, 'name', coalesce(nullif(trim(owner_name), ''), 'Owner'),
      'role', 'admin', 'shopId', null, 'avatarUrl', null, 'phone', null,
      'active', true, 'lastLoginAt', null, 'createdAt', now_iso, 'updatedAt', now_iso
    )
  );
  return true;
end $$;

-- Whether this project still needs an owner (shown on the login screen).
create or replace function public.needs_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where role = 'admin')
$$;

grant execute on function public.claim_owner(text), public.needs_owner(),
  public.is_admin(), public.my_shop_id(), public.is_member(), public.auth_email()
  to anon, authenticated;

alter table public.profiles enable row level security;
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
  using (email = public.auth_email() or (shop_id is not null and shop_id = public.my_shop_id()));
-- A branch may update its own profile (name, phone, last login) but never its
-- role, branch or active flag — the check pins those to what they already are.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (email = public.auth_email() and role = 'shop')
  with check (email = public.auth_email() and role = 'shop' and active
              and shop_id = public.my_shop_id());

-- ---------------------------------------------------------------------------
-- Catalogue / organisation tables: every member reads, only the admin writes.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['service_categories','services','packages','memberships','app_settings','coupons']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );
      alter table public.%1$I enable row level security;
      drop policy if exists %1$s_read on public.%1$I;
      create policy %1$s_read on public.%1$I for select using (public.is_member());
      drop policy if exists %1$s_admin on public.%1$I;
      create policy %1$s_admin on public.%1$I for all
        using (public.is_admin()) with check (public.is_admin());
    $f$, t);
  end loop;
end $$;

-- Shops: everyone reads, admin writes, a branch may edit its own profile page.
create table if not exists public.shops (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.shops enable row level security;
drop policy if exists shops_read on public.shops;
create policy shops_read on public.shops for select using (public.is_member());
drop policy if exists shops_admin on public.shops;
create policy shops_admin on public.shops for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists shops_self_update on public.shops;
create policy shops_self_update on public.shops for update
  using (id = public.my_shop_id())
  with check (id = public.my_shop_id() and coalesce((data->>'active')::boolean, false));

-- ---------------------------------------------------------------------------
-- Branch-owned tables: admin everything, a branch only its own rows.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['staff','customers','customer_memberships','products',
                           'inventory_movements','appointments','sales','expenses','notifications',
                           'customer_credits','register_sessions','attendance','feedback',
                           'payroll_runs','activity_log']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id text primary key,
        data jsonb not null,
        shop_id text generated always as (data->>'shopId') stored,
        updated_at timestamptz not null default now()
      );
      create index if not exists %1$s_shop_idx on public.%1$I (shop_id);
      alter table public.%1$I enable row level security;
      drop policy if exists %1$s_admin on public.%1$I;
      create policy %1$s_admin on public.%1$I for all
        using (public.is_admin()) with check (public.is_admin());
      drop policy if exists %1$s_shop on public.%1$I;
      create policy %1$s_shop on public.%1$I for all
        using (shop_id = public.my_shop_id()) with check (shop_id = public.my_shop_id());
    $f$, t);
  end loop;
end $$;

-- Gift vouchers are sold at one branch and redeemed at any, so every branch may
-- read and update them; only the owner may delete one.
create table if not exists public.vouchers (
  id text primary key,
  data jsonb not null,
  shop_id text generated always as (data->>'shopId') stored,
  updated_at timestamptz not null default now()
);
create unique index if not exists vouchers_code_key on public.vouchers ((upper(data->>'code')));
alter table public.vouchers enable row level security;
drop policy if exists vouchers_admin on public.vouchers;
create policy vouchers_admin on public.vouchers for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists vouchers_read on public.vouchers;
create policy vouchers_read on public.vouchers for select using (public.is_member());
drop policy if exists vouchers_sell on public.vouchers;
create policy vouchers_sell on public.vouchers for insert with check (shop_id = public.my_shop_id());
drop policy if exists vouchers_redeem on public.vouchers;
create policy vouchers_redeem on public.vouchers for update
  using (public.is_member()) with check (public.is_member());

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','shops','service_categories','services','packages',
    'memberships','app_settings','staff','customers','customer_memberships','products',
    'inventory_movements','appointments','sales','expenses','notifications','coupons','vouchers',
    'customer_credits','register_sessions','attendance','feedback','payroll_runs','activity_log']
  loop
    execute format('drop trigger if exists touch on public.%I', t);
    execute format('create trigger touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- No double-booking, enforced by the database. Two front desks booking the
-- same stylist for the same minute at the same moment: one of them is refused.
-- ---------------------------------------------------------------------------
create or replace function public.prevent_double_booking() returns trigger
language plpgsql as $$
declare
  s timestamptz := (new.data->>'startAt')::timestamptz;
  e timestamptz := s + make_interval(mins => (new.data->>'durationMin')::int);
begin
  if new.data->>'status' in ('cancelled', 'no-show') then return new; end if;
  if exists (
    select 1 from public.appointments a
    where a.id <> new.id
      and a.data->>'staffId' = new.data->>'staffId'
      and a.data->>'status' not in ('cancelled', 'no-show')
      and tstzrange((a.data->>'startAt')::timestamptz,
                    (a.data->>'startAt')::timestamptz
                      + make_interval(mins => (a.data->>'durationMin')::int))
          && tstzrange(s, e)
  ) then
    raise exception 'That stylist was just booked for this time by someone else. Pick another slot.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists no_double_booking on public.appointments;
create trigger no_double_booking before insert or update on public.appointments
  for each row execute function public.prevent_double_booking();

-- ---------------------------------------------------------------------------
-- Live updates: every till sees every other till's changes within a second.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','shops','service_categories','services','packages',
    'memberships','app_settings','staff','customers','customer_memberships','products',
    'inventory_movements','appointments','sales','expenses','notifications','coupons','vouchers',
    'customer_credits','register_sessions','attendance','feedback','payroll_runs']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Two tills at one branch can never print the same receipt number: the second
-- save is refused, the till reloads, and the next attempt takes the next number.
create unique index if not exists sales_receipt_no_key on public.sales ((data->>'receiptNo'));

-- The audit trail is append-only from the app's side: no one can quietly edit
-- or delete what they did. Only an owner may correct it.
drop policy if exists activity_log_shop on public.activity_log;
drop policy if exists activity_log_shop_read on public.activity_log;
create policy activity_log_shop_read on public.activity_log for select using (shop_id = public.my_shop_id());
drop policy if exists activity_log_shop_write on public.activity_log;
create policy activity_log_shop_write on public.activity_log for insert with check (shop_id = public.my_shop_id());
create index if not exists activity_log_updated_idx on public.activity_log (updated_at);

-- One open till per branch at a time.
create unique index if not exists register_one_open on public.register_sessions (shop_id)
  where (data->>'closedAt') is null;
-- One attendance row per person per day.
create unique index if not exists attendance_day_key on public.attendance
  ((data->>'staffId'), (data->>'date'));
-- A month's salary is paid once.
create unique index if not exists payroll_month_key on public.payroll_runs
  ((data->>'staffId'), (data->>'month'));

-- ===========================================================================
-- Logins the owner controls.
--
-- Branch staff do not sign themselves up and cannot change their own
-- passwords: the owner creates each login with a username and password, and is
-- the only person who can reset it. These functions run with the database's
-- own rights so the owner can do this from the browser without any server or
-- secret key — and each one refuses to run for anyone but an active owner.
--
-- A username becomes <username>@staff.aurabyhs.pk behind the scenes; that
-- address receives no mail and the account is created already confirmed.
-- ===========================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_set_login(p_email text, p_password text) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  em  text := lower(trim(p_email));
  uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only the owner can create or change logins.' using errcode = 'P0001';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Use a password of at least 6 characters.' using errcode = 'P0001';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That username is not valid.' using errcode = 'P0001';
  end if;
  -- An owner may not reset another owner's password from here.
  if exists (select 1 from public.profiles where email = em and role = 'admin') and em <> public.auth_email() then
    raise exception 'Owner passwords are changed by the owner.' using errcode = 'P0001';
  end if;

  perform set_config('aura.pw_admin', 'on', true);

  select id into uid from auth.users where lower(email) = em limit 1;
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em,
      crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true),
            'email', now(), now(), now());
  else
    update auth.users
      set encrypted_password = crypt(p_password, gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          updated_at = now()
      where id = uid;
  end if;
  return uid;
end $$;

-- Removes a login entirely (the profile row is the owner's to delete separately).
create or replace function public.admin_delete_login(p_email text) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can remove logins.' using errcode = 'P0001';
  end if;
  if lower(trim(p_email)) = public.auth_email() then
    raise exception 'You cannot remove your own login.' using errcode = 'P0001';
  end if;
  delete from auth.users where lower(email) = lower(trim(p_email));
end $$;

revoke all on function public.admin_set_login(text, text) from public, anon;
revoke all on function public.admin_delete_login(text) from public, anon;
grant execute on function public.admin_set_login(text, text), public.admin_delete_login(text) to authenticated;

-- A branch login cannot change its own password — not from the app, and not by
-- calling the auth API directly. Only admin_set_login() above may.
create or replace function public.guard_branch_password() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password
     and coalesce(current_setting('aura.pw_admin', true), '') <> 'on'
     and exists (select 1 from public.profiles where email = lower(old.email) and role = 'shop') then
    raise exception 'Only the owner can change this password.' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists guard_branch_password on auth.users;
create trigger guard_branch_password before update on auth.users
  for each row execute function public.guard_branch_password();
