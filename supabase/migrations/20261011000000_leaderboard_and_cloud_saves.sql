-- TRIAD: ranked leaderboard and cloud saves for the website and the Windows app
-- (the claude.ai artifact keeps its own built-in board).
--
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste all of this -> Run.
-- It is safe to run again.
--
-- Accounts are Supabase Auth email accounts (a 6-digit code sent by email).
-- Every table has row level security: the publishable key built into the game can
-- only read the leaderboard and read/write the signed-in pilot's own rows.

-- ---------------------------------------------------------------- leaderboard
-- One row per account: the pilot's standing in the ranked week they last played.
create table if not exists public.ranked (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  week       text not null check (week ~ '^\d{4}-\d{2}-\d{2}$'),
  callsign   text not null default 'PILOT' check (char_length(callsign) between 1 and 16),
  rp         integer not null default 0 check (rp between 0 and 100000),
  max_rp     integer not null default 0 check (max_rp between 0 and 100000),
  wins       integer not null default 0 check (wins between 0 and 1000000),
  losses     integer not null default 0 check (losses between 0 and 1000000),
  kills      integer not null default 0 check (kills between 0 and 10000000),
  updated_at timestamptz not null default now()
);
create index if not exists ranked_week_rp_idx on public.ranked (week, rp desc);
alter table public.ranked enable row level security;

drop policy if exists "Anyone can read the leaderboard" on public.ranked;
create policy "Anyone can read the leaderboard" on public.ranked
  for select to anon, authenticated using (true);

drop policy if exists "Pilots add their own row" on public.ranked;
create policy "Pilots add their own row" on public.ranked
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Pilots update their own row" on public.ranked;
create policy "Pilots update their own row" on public.ranked
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- cloud saves
-- The game's browser save (its localStorage entries) for each account.
create table if not exists public.saves (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 4000000),
  hash       text not null,
  device     text,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;

drop policy if exists "Pilots read their own save" on public.saves;
create policy "Pilots read their own save" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Pilots create their own save" on public.saves;
create policy "Pilots create their own save" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Pilots update their own save" on public.saves;
create policy "Pilots update their own save" on public.saves
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------- backups
-- Copies of saves that were about to be replaced. Pilots can add and read their
-- own; nothing here is ever updated or deleted by the game.
create table if not exists public.save_backups (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data       jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 4000000),
  reason     text not null default 'manual' check (char_length(reason) <= 40),
  device     text,
  created_at timestamptz not null default now()
);
create index if not exists save_backups_user_idx on public.save_backups (user_id, created_at desc);
alter table public.save_backups enable row level security;

drop policy if exists "Pilots read their own backups" on public.save_backups;
create policy "Pilots read their own backups" on public.save_backups
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Pilots add their own backups" on public.save_backups;
create policy "Pilots add their own backups" on public.save_backups
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- A daily automatic backup: the first time a save changes each day, the
-- previous version is copied to save_backups.
create or replace function public.backup_save_daily()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.data is distinct from new.data and not exists (
    select 1 from public.save_backups b
    where b.user_id = old.user_id and b.reason = 'daily' and b.created_at > now() - interval '1 day'
  ) then
    insert into public.save_backups (user_id, data, reason, device)
    values (old.user_id, old.data, 'daily', old.device);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists saves_backup_daily on public.saves;
create trigger saves_backup_daily
  before update on public.saves
  for each row execute function public.backup_save_daily();
