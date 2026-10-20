-- 049: Data-retention purge — the mechanism behind Privacy Policy §5.
-- §5 promises: "After account cancellation or termination, we retain
-- Customer Data for 90 days to allow reactivation or export, consistent
-- with our Terms of Service, after which it may be permanently deleted."
-- Until now, nothing recorded WHEN a company cancelled and nothing ever
-- purged. This migration adds (1) the cancellation anchor timestamp and
-- (2) the purge audit log. IT DELETES NOTHING BY ITSELF.
-- The purge itself lives in app/api/cron/retention-purge and ships in
-- REPORT-ONLY mode: it cannot delete unless RETENTION_PURGE_ENABLED=true
-- is set in the environment. See docs/retention-purge-design.md.
-- Run once in the Supabase SQL Editor.

-- ---------- cancellation anchor on companies ----------
alter table public.companies
  add column if not exists subscription_ended_at timestamptz;

comment on column public.companies.subscription_ended_at is
  'When the company''s subscription entered the terminal ''canceled'' state (Privacy Policy §5 retention clock). Set/cleared by the companies_stamp_subscription_ended trigger. NULL = not cancelled.';

-- Stamp the moment a company ENTERS 'canceled'; clear the stamp if the
-- company comes back (active/trialing) so a reactivation inside the
-- 90-day window resets the retention clock, exactly as §5 intends.
create or replace function public.stamp_subscription_ended_at()
returns trigger
language plpgsql
as $$
begin
  if NEW.subscription_status = 'canceled'
     and OLD.subscription_status is distinct from 'canceled' then
    NEW.subscription_ended_at := coalesce(NEW.subscription_ended_at, now());
  elsif NEW.subscription_status in ('active', 'trialing') then
    NEW.subscription_ended_at := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists companies_stamp_subscription_ended on public.companies;
create trigger companies_stamp_subscription_ended
  before update of subscription_status on public.companies
  for each row execute function public.stamp_subscription_ended_at();

-- Companies ALREADY canceled when this runs get a FRESH 90-day clock from
-- the migration date: their true cancel date was never recorded, and the
-- promise must never be undercut by guessing an earlier date.
update public.companies
   set subscription_ended_at = now()
 where subscription_status = 'canceled'
   and subscription_ended_at is null;

-- Standing rule (migration 024 put column-level SELECT grants on
-- companies): a new column is invisible to the API until granted.
grant select (subscription_ended_at) on public.companies to authenticated;

-- ---------- purge audit log ----------
-- One row per company per run: what the report saw, or what was deleted.
-- This is the paper trail for every purge decision, kept AFTER the
-- company row itself is gone (company_name is snapshotted for that
-- reason). Ops-only: RLS is on with no authenticated policies, so the
-- grants below are inert for signed-in users; the service role (the
-- cron route) is the only reader/writer.
create table if not exists public.retention_purge_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  company_name text,
  mode text not null check (mode in ('dry_run', 'purge')),
  subscription_ended_at timestamptz,
  eligible_at timestamptz,
  table_counts jsonb not null default '{}',
  storage_counts jsonb not null default '{}',
  status text not null check (status in ('reported', 'deleted', 'failed', 'skipped')),
  detail text,
  created_at timestamptz not null default now()
);
alter table public.retention_purge_log enable row level security;
grant select, insert, update, delete on public.retention_purge_log to authenticated;
grant all on public.retention_purge_log to service_role;

create index if not exists retention_purge_log_company_idx
  on public.retention_purge_log (company_id, created_at desc);
