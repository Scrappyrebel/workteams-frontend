-- 085: Work order record events (D-WT-30 depth, Work Order detail)
--
-- Purely additive: one NEW append-only table. No existing table,
-- column, policy or data is changed. The WorkTeams app works exactly
-- as before this migration runs (the detail page reads the table
-- fail-soft and simply shows no history/completion record), and gains
-- a status-change history plus an optional text completion record
-- (customer sign-off name / completion note) and an optional
-- cancellation reason once it has run.
--
-- Rows are written by the app ALONGSIDE the existing work_orders
-- updates, after the update itself has succeeded; recording an event
-- never gates or changes a status transition.
--
-- RLS mirrors 037 (work_order_comments): owners/admins of the company
-- and the member the order is assigned to may read and insert. There
-- are deliberately NO update or delete policies — the record is
-- append-only from the app.

begin;

create table if not exists public.work_order_events (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.company_members(id) on delete set null,
  event_type text not null check (event_type in ('status', 'completion', 'cancellation')),
  from_status text,
  to_status text,
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists work_order_events_order_idx
  on public.work_order_events (work_order_id, created_at);

grant select, insert, update, delete on public.work_order_events to authenticated;
grant all on public.work_order_events to service_role;

alter table public.work_order_events enable row level security;

drop policy if exists "work_order_events select if member" on public.work_order_events;
create policy "work_order_events select if member"
  on public.work_order_events for select
  using (
    public.is_company_member(work_order_events.company_id)
    and (
      public.is_company_owner_admin(work_order_events.company_id)
      or exists (
        select 1 from public.work_orders wo
        where wo.id = work_order_events.work_order_id
          and wo.assigned_to in (
            select m.id from public.company_members m where m.user_id = auth.uid()
          )
      )
    )
  );

drop policy if exists "work_order_events insert if member" on public.work_order_events;
create policy "work_order_events insert if member"
  on public.work_order_events for insert
  with check (
    public.is_company_member(work_order_events.company_id)
    and (
      public.is_company_owner_admin(work_order_events.company_id)
      or exists (
        select 1 from public.work_orders wo
        where wo.id = work_order_events.work_order_id
          and wo.assigned_to in (
            select m.id from public.company_members m where m.user_id = auth.uid()
          )
      )
    )
  );

commit;
