-- 086: Emergency alert record events (D-WT-53 depth, Emergency Alerts log)
--
-- Purely additive: one NEW append-only table. No existing table,
-- column, policy or data is changed. The WorkTeams app works exactly
-- as before this migration runs (the alert log reads the table
-- fail-soft and simply shows no assignment or resolution record), and
-- gains a named assignment and a resolution/closure record on the log
-- once it has run.
--
-- Rows are written by the log page for supervisors and up only — the
-- same roles that can acknowledge an alert today (029's update
-- policy). Recording an event never replaces or gates the existing
-- acknowledge write, which still happens exactly as before through
-- /api/emergency/acknowledge.
--
-- RLS: SELECT mirrors the emergency_alerts select policy (any member
-- of the company — alert visibility is all-company today). INSERT
-- mirrors 029's acknowledge predicate (company member whose role is
-- owner, admin or supervisor). There are deliberately NO update or
-- delete policies — the record is append-only from the app, so an
-- assignment or resolution cannot be quietly rewritten.

begin;

create table if not exists public.emergency_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.emergency_alerts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.company_members(id) on delete set null,
  event_type text not null check (event_type in ('assigned', 'resolved')),
  assignee_member_id uuid references public.company_members(id) on delete set null,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists emergency_alert_events_alert_idx
  on public.emergency_alert_events (alert_id, created_at);

grant select, insert, update, delete on public.emergency_alert_events to authenticated;
grant all on public.emergency_alert_events to service_role;

alter table public.emergency_alert_events enable row level security;

drop policy if exists "emergency_alert_events select if member" on public.emergency_alert_events;
create policy "emergency_alert_events select if member"
  on public.emergency_alert_events for select
  using (public.is_company_member(emergency_alert_events.company_id));

drop policy if exists "emergency_alert_events insert if supervisor+" on public.emergency_alert_events;
create policy "emergency_alert_events insert if supervisor+"
  on public.emergency_alert_events for insert
  with check (
    public.is_company_member(emergency_alert_events.company_id)
    and exists (
      select 1 from public.company_members m
      where m.company_id = emergency_alert_events.company_id
        and m.user_id = auth.uid()
        and m.role in ('owner', 'admin', 'supervisor')
    )
  );

commit;
