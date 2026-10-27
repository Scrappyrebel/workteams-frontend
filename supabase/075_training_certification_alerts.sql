-- WorkTeams training certification expiry alerts (075).
--
-- The training academy has tracked certifications with an expiry date
-- since migration 021 (training_certifications.expires_at), and the
-- training records page already badges them "expired, recertify" /
-- "expiring soon" — but nothing ever alerted anyone: no training rows
-- existed in any alert surface, so an expired certification was only
-- visible if somebody happened to open the records page and read it.
--
-- This migration adds the alert layer, the established refresh-on-open
-- pattern from Workforce (its migrations 263/265/267):
--
--   * public.training_certification_alerts holds one alert per
--     certification, keyed by (certification_id, expires_at, level).
--     The expiry date is part of the key: a UNIQUE index on that triple
--     makes duplicates impossible, so opening the page ten times can
--     never spam ten copies of the same alert.
--
--   * public.refresh_training_certification_alerts(company) is called
--     when the training records page opens. It inserts the alerts that
--     should exist (a certification expired, or expiring within 30
--     days — the same window and the same comparisons the records page
--     itself already uses to badge a certification), and resolves the
--     alerts that no longer describe reality:
--       - the certification's expiry moved (renewed in place or
--         corrected), or is no longer inside the window;
--       - an "expiring" alert whose certification has since expired
--         (superseded by the "expired" alert);
--       - the member has since recertified the same course — a newer,
--         still-current certification supersedes the old one's alert,
--         so a manager is never told to chase a renewal that is done.
--     Renewal follows automatically: a recertification is a new
--     certification row with its own expires_at, and it earns its own
--     alert when its own window arrives.
--
--   * Levels mirror the severity convention Workforce's Dept 6 uses:
--     expiring within 30 days, and expired as the stronger state. The
--     records page renders expired in red and expiring in amber — the
--     same colors it already uses for the certification badges.
--
-- The alerts are readable by exactly the people the records page
-- serves: the certification's own member, and the company's managers
-- (public.is_company_manager — owner / admin / manager). Rows are
-- written ONLY by the security-definer refresh function below:
-- authenticated gets SELECT and nothing more, so an alert cannot be
-- forged or erased from the client.
--
-- Client code calls the refresh function and reads the table
-- fail-soft: until this migration is run, both calls error quietly and
-- the records page renders exactly as it does today.
--
-- Protected areas are untouched: no time clock, shift video or
-- Communication Book table, function or file appears here.

BEGIN;

-- ---------- certification expiry alerts ----------

create table if not exists public.training_certification_alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  certification_id uuid not null references public.training_certifications(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  level text not null check (level in ('expiring', 'expired')),
  -- Snapshot of the certification expiry this alert is about; part of
  -- the dedupe key, so an alert always names the date it fired for.
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index if not exists training_certification_alerts_dedupe_idx
  on public.training_certification_alerts (certification_id, expires_at, level);
create index if not exists training_certification_alerts_company_idx
  on public.training_certification_alerts (company_id, resolved_at, expires_at);

comment on table public.training_certification_alerts is
  'Training certification expiry alerts (migration 075): one deduped alert per certification + expiry + level (expiring within 30 days / expired), maintained by refresh_training_certification_alerts on records-page open; resolved_at marks an alert that no longer describes reality.';

alter table public.training_certification_alerts enable row level security;
grant select on public.training_certification_alerts to authenticated;
grant all on public.training_certification_alerts to service_role;
-- No insert/update/delete grant for authenticated on purpose: rows are
-- written only by the security-definer refresh function below, so an
-- alert cannot be forged or erased from the client.

-- Readable by the certification's own member and the company's
-- managers — the same two audiences the training records page serves.
drop policy if exists "training certification alerts select own or manager" on public.training_certification_alerts;
create policy "training certification alerts select own or manager"
  on public.training_certification_alerts for select
  using (
    public.is_company_manager(training_certification_alerts.company_id)
    or exists (
      select 1 from public.company_members m
      where m.id = training_certification_alerts.member_id
        and m.company_id = training_certification_alerts.company_id
        and m.user_id = auth.uid()
    )
  );

-- ---------- refresh-on-open ----------

create or replace function public.refresh_training_certification_alerts(p_company_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
begin
  -- Any member of the company may refresh its alerts (the records page
  -- calls this on open, for managers and members alike). Anyone else
  -- gets a quiet no-op: no error to surface, no information leaked.
  if not public.is_company_member(p_company_id) then
    return 0;
  end if;

  -- Resolve alerts that no longer describe reality.
  update public.training_certification_alerts a
  set resolved_at = now()
  where a.company_id = p_company_id
    and a.resolved_at is null
    and (
      -- The certification's expiry moved (renewed in place / corrected).
      exists (
        select 1 from public.training_certifications c
        where c.id = a.certification_id
          and c.expires_at <> a.expires_at
      )
      -- The expiry is no longer inside the alert window at all.
      or exists (
        select 1 from public.training_certifications c
        where c.id = a.certification_id
          and c.expires_at > now() + interval '30 days'
      )
      -- An "expiring" alert whose certification has since expired is
      -- superseded by the "expired" alert inserted below.
      or (
        a.level = 'expiring'
        and exists (
          select 1 from public.training_certifications c
          where c.id = a.certification_id
            and c.expires_at <= now()
        )
      )
      -- The member has since recertified the same course: a newer,
      -- still-current certification supersedes this alert.
      or exists (
        select 1
        from public.training_certifications old_cert
        join public.training_certifications new_cert
          on new_cert.company_id = old_cert.company_id
         and new_cert.member_id = old_cert.member_id
         and new_cert.course_id = old_cert.course_id
         and new_cert.id <> old_cert.id
         and new_cert.issued_at > old_cert.issued_at
         and new_cert.expires_at > now()
        where old_cert.id = a.certification_id
      )
    );

  -- Certifications already expired earn an "expired" alert. The unique
  -- index is the dedupe: a repeat refresh lands on the same key and the
  -- do-update only un-resolves a row that qualifies again, never a copy.
  insert into public.training_certification_alerts
    (company_id, certification_id, member_id, level, expires_at)
  select c.company_id, c.id, c.member_id, 'expired', c.expires_at
  from public.training_certifications c
  where c.company_id = p_company_id
    and c.expires_at <= now()
  on conflict (certification_id, expires_at, level)
  do update set resolved_at = null
    where training_certification_alerts.resolved_at is not null;

  -- Certifications expiring within 30 days (and not yet expired) earn
  -- an "expiring" alert — the window the records page already badges.
  insert into public.training_certification_alerts
    (company_id, certification_id, member_id, level, expires_at)
  select c.company_id, c.id, c.member_id, 'expiring', c.expires_at
  from public.training_certifications c
  where c.company_id = p_company_id
    and c.expires_at > now()
    and c.expires_at <= now() + interval '30 days'
  on conflict (certification_id, expires_at, level)
  do update set resolved_at = null
    where training_certification_alerts.resolved_at is not null;

  select count(*) into v_active
  from public.training_certification_alerts
  where company_id = p_company_id
    and resolved_at is null;

  return v_active;
end;
$$;

revoke all on function public.refresh_training_certification_alerts(uuid) from public;
grant execute on function public.refresh_training_certification_alerts(uuid) to authenticated;

COMMIT;
