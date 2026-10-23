-- 052: Shift proof required by default + employee override with reason
-- Wendy's rule (2026-10-23): the end-of-shift video and the Communication
-- Book photo are REQUIRED for every company by default, unless the owner or
-- a manager deliberately turns a requirement off in the company settings.
-- When an employee genuinely cannot upload (no signal, etc.), they save an
-- override with a REQUIRED free-text reason; the completion API accepts a
-- persisted override in place of that proof row (same pattern as the
-- no-communication-book report in migration 039 / lib/no-book-proof), and
-- the time entry is flagged so a manager can see exactly who used an
-- override, at which location, for which proof, and why.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Wendy's correction (2026-10-23 09:54): this migration turns the
-- requirements ON for EXISTING companies too (section 4 below) — there is
-- no optional step. The ONLY way a requirement turns off afterwards is an
-- owner/manager deliberately toggling that one switch (video or book) off
-- in the company settings, where both switches sit ON by default.

-- ============ 1. New companies are born with proof REQUIRED ============
alter table public.companies
  alter column require_walkthrough_video set default true,
  alter column require_book_photo set default true;

-- The requirement columns were added in 039, after migration 024 revoked
-- blanket access on public.companies and granted only a column list.
-- Re-grant select on exactly these columns so the settings panel and the
-- app layout can read them (no new companies columns are added here).
grant select (require_walkthrough_video, require_book_photo)
  on public.companies to authenticated;

-- ============ 2. Employee proof overrides ============
create table if not exists public.shift_proof_overrides (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete cascade,
  time_entry_id uuid not null references public.time_entries(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  proof_kind text not null check (proof_kind in ('walkthrough', 'book')),
  reason text not null check (char_length(btrim(reason)) > 0),
  created_at timestamptz not null default now()
);

-- One override per proof kind per shift; re-saving updates the reason.
create unique index if not exists shift_proof_overrides_entry_kind_uidx
  on public.shift_proof_overrides(time_entry_id, proof_kind);
create index if not exists shift_proof_overrides_company_idx
  on public.shift_proof_overrides(company_id, created_at desc);

alter table public.shift_proof_overrides enable row level security;

-- Company members can view overrides in their company (managers review them
-- on the Time, Shift Videos, Communication Book and Payroll screens).
drop policy if exists "shift_proof_overrides select if member" on public.shift_proof_overrides;
create policy "shift_proof_overrides select if member"
  on public.shift_proof_overrides for select
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_proof_overrides.company_id
      and m.user_id = auth.uid()
    )
  );

-- A member can only save an override as themselves.
drop policy if exists "shift_proof_overrides insert if own" on public.shift_proof_overrides;
create policy "shift_proof_overrides insert if own"
  on public.shift_proof_overrides for insert
  with check (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_proof_overrides.company_id
      and m.user_id = auth.uid()
      and m.id = shift_proof_overrides.member_id
    )
  );

-- A member can correct their own override reason; managers can update any
-- override in their company.
drop policy if exists "shift_proof_overrides update if manager or own" on public.shift_proof_overrides;
create policy "shift_proof_overrides update if manager or own"
  on public.shift_proof_overrides for update
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_proof_overrides.company_id
      and m.user_id = auth.uid()
      and (m.role in ('owner', 'admin') or m.id = shift_proof_overrides.member_id)
    )
  );

-- Managers can delete an override in their company.
drop policy if exists "shift_proof_overrides delete if manager" on public.shift_proof_overrides;
create policy "shift_proof_overrides delete if manager"
  on public.shift_proof_overrides for delete
  using (
    exists (
      select 1 from public.company_members m
      where m.company_id = shift_proof_overrides.company_id
      and m.user_id = auth.uid()
      and m.role in ('owner', 'admin')
    )
  );

grant select, insert, update, delete on public.shift_proof_overrides to authenticated;
grant all on public.shift_proof_overrides to service_role;

-- ============ 3. Visible flag on the time entry ============
-- Set by the override API when an override is saved, and re-affirmed by the
-- clock-out completion API. An override must never look like real proof:
-- every manager review surface keys off this flag + the override rows.
alter table public.time_entries
  add column if not exists proof_override_used boolean not null default false;

grant select, insert, update, delete on public.time_entries to authenticated;
grant all on public.time_entries to service_role;

-- ============ 4. Existing companies: requirements turn ON ============
-- Per Wendy's correction above, running this migration activates BOTH
-- proof requirements for every company that already exists. This is a
-- deliberate, labeled step of the migration — not a silent side effect.
-- Afterwards, the only off path is the owner/manager settings toggle.
update public.companies
  set require_walkthrough_video = true,
      require_book_photo = true;
-- ============================================================================
-- END OF MIGRATION 052
-- ============================================================================
