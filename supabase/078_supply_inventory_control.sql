-- WorkTeams supply inventory control (078).
--
-- Until now WorkTeams supplies (003) were a single editable list: a name,
-- a quantity, a reorder level, a cost. Quantity edits were silent — nobody
-- could say what went out, what came in, who has a tool, or whether
-- something broke. Workforce has the full system (stock movements, restock
-- requests, equipment custody); this migration builds the WorkTeams-scale
-- equivalent on the SAME supplies surface, in this app's own patterns:
--
--   * public.supply_movements — an append-only quantity log. Every
--     quantity change made through the app records one row: 'in', 'out'
--     or 'adjustment', the signed change, the quantity after, who did it,
--     when, an optional note and an optional job reference. The supplies
--     page reads an item's history back from this table. Append-only:
--     authenticated gets SELECT + INSERT only, no UPDATE, no DELETE —
--     a movement is a record, never an editable field.
--
--   * public.supply_assignments — who has what. A manager checks an item
--     out to a member (quantity, optional due-back date, note); the open
--     row says who currently holds it. Returning stamps returned_at and
--     the condition it came back in. Returned rows stay as the
--     assignment history; nothing is deleted. Checking out does NOT
--     change quantity_on_hand — custody is not consumption, and the
--     supplies page says so.
--
--   * supplies.condition + public.supply_condition_events — every item
--     carries a condition: 'good', 'needs_repair', 'broken' or
--     'replaced' (existing rows default to 'good'; nothing about an
--     existing row changes otherwise). A condition change is recorded as
--     an append-only event; marking an item replaced records WHAT
--     replaced it (replacement_supply_id + a name snapshot) and when, as
--     its own event — the history is never overwritten. Broken / repair
--     items surface as a flag for managers on the supplies page.
--
--   * public.supply_restock_requests — any member can ask for a restock
--     (item, quantity, needed-by date, note); managers see the queue and
--     mark a request handled or dismissed, with who/when stamped. The
--     requested item's name is snapshotted on the row, so a request
--     survives its item being deleted (supply_id goes null instead).
--
-- Security posture (mirrors the supplies table itself, migration 024):
--
--   * Every new table is company-scoped and carries the same 'pro' tier
--     gate as supplies (supplies is a Pro feature, lib/tiers.js).
--   * Reads: any member of the company — exactly who can already read
--     supplies. Costs are NOT in any new table: the movement / custody /
--     condition / request records carry no money, so the supplies page's
--     cost visibility (managers only, in the UI) is not widened by this
--     migration.
--   * Writes follow each record's actor: movements and condition events
--     pin member_id to the caller's OWN company_members row (the 073
--     own-row pattern — nobody can forge who acted), and condition
--     events additionally require owner/admin. Check-out / return and
--     handling a restock request are owner/admin writes, the same roles
--     that can write supplies itself. A restock request can be created
--     by any member, but only for themselves (requested_by is pinned).
--   * No DELETE grant or policy on any new table: logs, custody history
--     and requests are kept, never erased through the app.
--
-- Fail-soft: until this migration runs, none of the new tables or the
-- condition column exist; the supplies page probes them separately and
-- quietly, so the page (and every existing supply row) behaves exactly
-- as today. The new sections simply turn on when the update lands.
--
-- Run in the Supabase SQL editor (project: WorkTeams). Paste the WHOLE
-- file into ONE query and run it ONCE — it is a single BEGIN..COMMIT.
-- Safe to re-run (idempotent). Expansion only: no existing table,
-- policy, page wording or flow is changed by this migration — the only
-- change to an existing table is the additive condition column.

BEGIN;

-- ---------- Condition on the existing supplies table ----------

alter table public.supplies
  add column if not exists condition text not null default 'good'
    check (condition in ('good', 'needs_repair', 'broken', 'replaced'));

comment on column public.supplies.condition is
  'Inventory condition (migration 078): good / needs_repair / broken / replaced. Changes are recorded as events in public.supply_condition_events; existing rows start at good.';

-- ---------- 1. Movement history (append-only) ----------

create table if not exists public.supply_movements (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  supply_id uuid not null references public.supplies(id) on delete cascade,
  movement_type text not null check (movement_type in ('in', 'out', 'adjustment')),
  quantity_change numeric not null,
  quantity_after numeric not null,
  member_id uuid references public.company_members(id) on delete set null,
  note text,
  job_reference text,
  created_at timestamptz not null default now()
);

comment on table public.supply_movements is
  'Append-only supply quantity log (migration 078): one row per quantity change made through the app — in / out / adjustment, the signed change, the quantity after, who did it, when, optional note and job reference.';
comment on column public.supply_movements.member_id is
  'The company_members row of whoever made the change. Pinned by RLS to the caller''s own row; set null if that member is later removed, so the record survives.';

create index if not exists supply_movements_company_idx
  on public.supply_movements(company_id);
create index if not exists supply_movements_supply_idx
  on public.supply_movements(supply_id, created_at);

alter table public.supply_movements enable row level security;

grant select, insert on public.supply_movements to authenticated;
grant all on public.supply_movements to service_role;
-- No update, no delete: a movement is a record, never an editable field.

drop policy if exists "supply movements select if member" on public.supply_movements;
create policy "supply movements select if member"
  on public.supply_movements for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = supply_movements.company_id
        and m.user_id = auth.uid()
    )
    and public.company_tier_meets(supply_movements.company_id, 'pro')
  );

drop policy if exists "supply movements insert own" on public.supply_movements;
create policy "supply movements insert own"
  on public.supply_movements for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = supply_movements.company_id
        and m.user_id = auth.uid()
        and m.id = supply_movements.member_id
    )
    and public.company_tier_meets(supply_movements.company_id, 'pro')
  );

-- ---------- 2. Assignments: who has what ----------

create table if not exists public.supply_assignments (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  supply_id uuid not null references public.supplies(id) on delete cascade,
  assigned_to_member_id uuid references public.company_members(id) on delete set null,
  assigned_to_name text,
  assigned_by_member_id uuid references public.company_members(id) on delete set null,
  quantity numeric not null default 1 check (quantity > 0),
  checked_out_at timestamptz not null default now(),
  due_back_at date,
  returned_at timestamptz,
  return_condition text check (return_condition in ('good', 'needs_repair', 'broken')),
  note text,
  created_at timestamptz not null default now()
);

comment on table public.supply_assignments is
  'Supply/tool check-outs (migration 078): who has what. An open row (returned_at null) is the current holder; returned rows are the assignment history. Check-out never changes supplies.quantity_on_hand — custody is not consumption.';
comment on column public.supply_assignments.assigned_to_name is
  'Snapshot of the holder''s display name at check-out, so the custody history still reads correctly if that member later leaves the company.';
comment on column public.supply_assignments.return_condition is
  'Condition the item came back in. needs_repair / broken on return also moves supplies.condition and records a supply_condition_events row.';

create index if not exists supply_assignments_company_idx
  on public.supply_assignments(company_id);
create index if not exists supply_assignments_supply_idx
  on public.supply_assignments(supply_id, checked_out_at);

alter table public.supply_assignments enable row level security;

grant select, insert, update on public.supply_assignments to authenticated;
grant all on public.supply_assignments to service_role;
-- No delete: returned assignments are the custody history.

drop policy if exists "supply assignments select if member" on public.supply_assignments;
create policy "supply assignments select if member"
  on public.supply_assignments for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = supply_assignments.company_id
        and m.user_id = auth.uid()
    )
    and public.company_tier_meets(supply_assignments.company_id, 'pro')
  );

drop policy if exists "supply assignments insert if owner/admin" on public.supply_assignments;
create policy "supply assignments insert if owner/admin"
  on public.supply_assignments for insert
  with check (
    public.is_company_owner_admin(supply_assignments.company_id)
    and public.company_tier_meets(supply_assignments.company_id, 'pro')
  );

drop policy if exists "supply assignments update if owner/admin" on public.supply_assignments;
create policy "supply assignments update if owner/admin"
  on public.supply_assignments for update
  using (
    public.is_company_owner_admin(supply_assignments.company_id)
    and public.company_tier_meets(supply_assignments.company_id, 'pro')
  )
  with check (
    public.is_company_owner_admin(supply_assignments.company_id)
    and public.company_tier_meets(supply_assignments.company_id, 'pro')
  );

-- ---------- 3. Condition events (append-only) ----------

create table if not exists public.supply_condition_events (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  supply_id uuid not null references public.supplies(id) on delete cascade,
  event_type text not null check (event_type in ('condition_change', 'replacement')),
  from_condition text,
  to_condition text,
  replacement_supply_id uuid references public.supplies(id) on delete set null,
  replacement_name text,
  member_id uuid references public.company_members(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

comment on table public.supply_condition_events is
  'Append-only condition history (migration 078): every condition change on a supply item, and every replacement — a replacement is its own event naming what replaced the item, never an overwrite of the item''s history.';
comment on column public.supply_condition_events.replacement_name is
  'Snapshot of the replacement item''s name at the time of the event, so the record still reads correctly if that item is later renamed or deleted.';

create index if not exists supply_condition_events_company_idx
  on public.supply_condition_events(company_id);
create index if not exists supply_condition_events_supply_idx
  on public.supply_condition_events(supply_id, created_at);

alter table public.supply_condition_events enable row level security;

grant select, insert on public.supply_condition_events to authenticated;
grant all on public.supply_condition_events to service_role;
-- No update, no delete: condition history is a record, never rewritten.

drop policy if exists "supply condition events select if member" on public.supply_condition_events;
create policy "supply condition events select if member"
  on public.supply_condition_events for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = supply_condition_events.company_id
        and m.user_id = auth.uid()
    )
    and public.company_tier_meets(supply_condition_events.company_id, 'pro')
  );

drop policy if exists "supply condition events insert own admin" on public.supply_condition_events;
create policy "supply condition events insert own admin"
  on public.supply_condition_events for insert
  with check (
    public.is_company_owner_admin(supply_condition_events.company_id)
    and exists (
      select 1 from public.company_members m
      where m.company_id = supply_condition_events.company_id
        and m.user_id = auth.uid()
        and m.id = supply_condition_events.member_id
    )
    and public.company_tier_meets(supply_condition_events.company_id, 'pro')
  );

-- ---------- 4. Restock requests ----------

create table if not exists public.supply_restock_requests (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  supply_id uuid references public.supplies(id) on delete set null,
  supply_name text not null,
  requested_by_member_id uuid references public.company_members(id) on delete set null,
  quantity numeric not null check (quantity > 0),
  needed_by date,
  note text,
  status text not null default 'open' check (status in ('open', 'handled', 'dismissed')),
  handled_by_member_id uuid references public.company_members(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.supply_restock_requests is
  'Restock requests (migration 078): any member can ask for a restock (item, quantity, needed-by); managers mark requests handled or dismissed with who/when stamped. supply_name is a snapshot so the request survives its item being deleted.';

create index if not exists supply_restock_requests_company_idx
  on public.supply_restock_requests(company_id, status, created_at);

alter table public.supply_restock_requests enable row level security;

grant select, insert, update on public.supply_restock_requests to authenticated;
grant all on public.supply_restock_requests to service_role;
-- No delete: requests are kept, open or closed.

drop policy if exists "supply restock requests select if member" on public.supply_restock_requests;
create policy "supply restock requests select if member"
  on public.supply_restock_requests for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = supply_restock_requests.company_id
        and m.user_id = auth.uid()
    )
    and public.company_tier_meets(supply_restock_requests.company_id, 'pro')
  );

drop policy if exists "supply restock requests insert own" on public.supply_restock_requests;
create policy "supply restock requests insert own"
  on public.supply_restock_requests for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = supply_restock_requests.company_id
        and m.user_id = auth.uid()
        and m.id = supply_restock_requests.requested_by_member_id
    )
    and public.company_tier_meets(supply_restock_requests.company_id, 'pro')
  );

drop policy if exists "supply restock requests update if owner/admin" on public.supply_restock_requests;
create policy "supply restock requests update if owner/admin"
  on public.supply_restock_requests for update
  using (
    public.is_company_owner_admin(supply_restock_requests.company_id)
    and public.company_tier_meets(supply_restock_requests.company_id, 'pro')
  )
  with check (
    public.is_company_owner_admin(supply_restock_requests.company_id)
    and public.company_tier_meets(supply_restock_requests.company_id, 'pro')
  );

COMMIT;
